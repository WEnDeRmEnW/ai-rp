import type { ProviderConfig } from '../shared/types.js'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

function resolveConfig(input: ProviderConfig): ProviderConfig {
  if (input.provider === 'openai') {
    return {
      ...input,
      apiKey: input.apiKey || process.env.OPENAI_API_KEY,
      model: input.model || process.env.OPENAI_MODEL || 'gpt-4.1-mini',
      baseUrl: input.baseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    }
  }
  return input
}

function endpointFor(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/+$/, '')
  return normalized.endsWith('/chat/completions') ? normalized : `${normalized}/chat/completions`
}

function assertSafeEndpoint(rawUrl: string) {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error('Некорректный адрес API.')
  }
  const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocal)) {
    throw new Error('Удалённый API должен использовать HTTPS. HTTP разрешён только для локальной модели.')
  }
}

const transientStatuses = new Set([408, 425, 429, 500, 502, 503, 504])
const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds))

async function fetchProvider(endpoint: string, init: Omit<RequestInit, 'signal'>): Promise<Response> {
  let lastNetworkError: unknown
  const attempts = 3

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(endpoint, { ...init, signal: AbortSignal.timeout(300_000) })
      const shouldRetry = transientStatuses.has(response.status) && attempt < attempts - 1
      if (!shouldRetry) return response

      const retryAfter = Number(response.headers.get('retry-after'))
      await response.body?.cancel().catch(() => undefined)
      const delay = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(10_000, retryAfter * 1000)
        : 750 * (attempt + 1)
      await wait(delay)
    } catch (error) {
      lastNetworkError = error
      if (attempt < attempts - 1) {
        await wait(750 * (attempt + 1))
        continue
      }
    }
  }

  const detail = lastNetworkError instanceof Error && lastNetworkError.name === 'TimeoutError'
    ? 'Провайдер не ответил за пять минут.'
    : 'Соединение с провайдером оборвалось.'
  throw new Error(`${detail} Выполнены три автоматические попытки; повторите ход, когда связь стабилизируется.`)
}

async function requestCompletion(configInput: ProviderConfig, messages: ChatMessage[], jsonMode: boolean, retryWithoutJson = true) {
  const config = resolveConfig(configInput)
  const endpoint = endpointFor(config.baseUrl)
  assertSafeEndpoint(endpoint)
  if (config.provider !== 'ollama' && !config.apiKey) {
    throw new Error('Для выбранного провайдера нужен API-ключ. Добавьте его в настройках или .env.')
  }

  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    temperature: jsonMode ? 0 : config.temperature,
  }
  if (jsonMode) body.response_format = { type: 'json_object' }

  const response = await fetchProvider(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      ...(config.provider === 'openrouter' ? { 'HTTP-Referer': 'http://localhost:5173', 'X-Title': 'Letopis AI RP' } : {}),
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 800)
    if (jsonMode && retryWithoutJson && response.status === 400 && /response_format|json/i.test(detail)) {
      return requestCompletion({ ...config, temperature: 0 }, messages, false, false)
    }
    if (response.status === 401 || response.status === 403) throw new Error('API отклонил ключ. Проверьте ключ и выбранного провайдера.')
    if (response.status === 429) throw new Error('Провайдер временно ограничил частоту запросов. Попробуйте чуть позже.')
    throw new Error(`Ошибка провайдера ${response.status}: ${detail || response.statusText}`)
  }

  const data = await response.json() as any
  const content = data?.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content.trim()) throw new Error('Провайдер вернул пустой ответ.')
  return content.trim()
}

function extractJson(text: string): unknown {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1))
    throw new Error('Модель не вернула корректный JSON. Попробуйте повторить ход или выбрать другую модель.')
  }
}

export async function completeJson(config: ProviderConfig, messages: ChatMessage[]): Promise<unknown> {
  let repairMessages = messages
  let lastError: unknown

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const raw = await requestCompletion(config, repairMessages, true)
    try {
      return extractJson(raw)
    } catch (error) {
      lastError = error
      repairMessages = [
        ...messages,
        { role: 'assistant', content: raw },
        {
          role: 'user',
          content: 'Предыдущий ответ синтаксически не является корректным JSON. Верни тот же полный объект заново: без Markdown, комментариев и текста до или после JSON. Проверь кавычки, запятые и закрывающие скобки.',
        },
      ]
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Модель не вернула корректный JSON после автоматического восстановления.')
}

export async function completeText(config: ProviderConfig, messages: ChatMessage[]): Promise<string> {
  return requestCompletion(config, messages, false)
}
