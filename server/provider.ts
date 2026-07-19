import type { ProviderConfig } from '../shared/types.js'
import { AsyncLocalStorage } from 'node:async_hooks'
import { createHash } from 'node:crypto'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type CompletionStage = 'service' | 'turn' | 'world' | 'narrative'

export interface CompletionOptions {
  stage?: CompletionStage
  maxOutputTokens?: number
}

interface CompletionResult {
  content: string
  finishReason?: string
  truncated: boolean
}

interface CompletionScope {
  cache: Map<string, Promise<CompletionResult>>
  cacheHits: number
  providerCalls: number
  providerTimeMs: number
}

const completionScopes = new AsyncLocalStorage<CompletionScope>()

export interface CompletionScopeStats {
  cacheHits: number
  providerCalls: number
  providerTimeMs: number
}

/**
 * Gives one user operation an isolated content-addressed completion cache. Identical
 * requests inside the same turn/world build share the in-flight promise, while a new
 * user operation always gets a fresh scope and can intentionally regenerate prose.
 */
export async function withCompletionScope<T>(work: () => Promise<T>): Promise<T> {
  if (completionScopes.getStore()) return work()
  return completionScopes.run({ cache: new Map(), cacheHits: 0, providerCalls: 0, providerTimeMs: 0 }, work)
}

export function completionScopeStats(): CompletionScopeStats | undefined {
  const scope = completionScopes.getStore()
  return scope ? { cacheHits: scope.cacheHits, providerCalls: scope.providerCalls, providerTimeMs: scope.providerTimeMs } : undefined
}

const outputTokensByStage: Record<CompletionStage, number> = {
  service: 12_288,
  turn: 32_768,
  world: 65_536,
  narrative: 16_384,
}

const truncationReasons = new Set(['length', 'max_tokens', 'max_output_tokens', 'token_limit'])
type TokenLimitFallback = 'reduce' | 'omit' | 'none'

function inferStage(messages: ChatMessage[], jsonMode: boolean): CompletionStage {
  if (!jsonMode) return 'narrative'
  const instructions = messages.filter((message) => message.role === 'system').map((message) => message.content).join('\n').toLocaleLowerCase('ru-RU')
  if (/архитектор[^.\n]{0,48}мир/u.test(instructions) || instructions.includes('перепиши весь мир') || instructions.includes('пересобери весь мир')) return 'world'
  if (instructions.includes('режиссёр') || instructions.includes('аудитор причин и последствий') || instructions.includes('редактор постоянного состояния')) return 'turn'
  return 'service'
}

function outputLimit(messages: ChatMessage[], jsonMode: boolean, options?: CompletionOptions): number {
  const requested = options?.maxOutputTokens ?? outputTokensByStage[options?.stage ?? inferStage(messages, jsonMode)]
  return Math.max(1_024, Math.min(131_072, Math.round(requested)))
}

function expandedOutputLimit(current: number): number {
  return Math.min(131_072, Math.max(current + 4_096, Math.ceil(current * 1.5)))
}

function reducedProviderLimit(detail: string, current: number): number {
  const normalized = detail.replace(/[,_]/g, '')
  const explicitCeiling = [
    /max[_ -]?tokens.{0,100}?(?:<=|at most|maximum(?: of)?|less than(?: or equal to)?)\D*(\d{4,6})/i,
    /(?:maximum|max)(?: output)? tokens?\D*(\d{4,6})/i,
  ].map((pattern) => Number(normalized.match(pattern)?.[1])).find((value) => Number.isFinite(value) && value >= 1_024 && value < current)
  return explicitCeiling ?? Math.max(1_024, Math.floor(current / 2))
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

// 520–526 are Cloudflare origin/gateway failures. In particular, tokengo may return 524 while a
// previous generation is still being processed; retrying the same bounded stage is safe because
// no campaign state is persisted until the complete world passes validation.
const transientStatuses = new Set([408, 425, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524, 525, 526])
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

async function requestCompletion(
  configInput: ProviderConfig,
  messages: ChatMessage[],
  jsonMode: boolean,
  maxOutputTokens: number | undefined,
  retryWithoutJson = true,
  tokenLimitFallback: TokenLimitFallback = 'reduce',
): Promise<CompletionResult> {
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
    // DeepSeek Flash through Ollama Cloud exposes an OpenAI-compatible endpoint and accepts
    // max_tokens. Explicit stage limits avoid the provider's much smaller default output cap.
  }
  if (maxOutputTokens !== undefined) body.max_tokens = maxOutputTokens
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
    const explicitlyTokenRelated = /max[_ -]?(?:completion[_ -]?)?tokens?|context[_ -]?(?:window|length)|token limit|too many tokens/i.test(detail)
    if (response.status === 400 && explicitlyTokenRelated && tokenLimitFallback !== 'none') {
      const unsupportedParameter = /not supported|unsupported|unknown (?:field|parameter)|unrecognized|not permitted|extra inputs?/i.test(detail)
      if (unsupportedParameter || maxOutputTokens === undefined || tokenLimitFallback === 'omit') {
        return requestCompletion(config, messages, jsonMode, undefined, retryWithoutJson, 'none')
      }
      const reduced = reducedProviderLimit(detail, maxOutputTokens)
      return requestCompletion(config, messages, jsonMode, reduced, retryWithoutJson, 'omit')
    }
    if (jsonMode && retryWithoutJson && response.status === 400 && /response_format|json/i.test(detail)) {
      return requestCompletion({ ...config, temperature: 0 }, messages, false, maxOutputTokens, false, tokenLimitFallback)
    }
    if (response.status === 401 || response.status === 403) throw new Error('API отклонил ключ. Проверьте ключ и выбранного провайдера.')
    if (response.status === 429) throw new Error('Провайдер временно ограничил частоту запросов. Попробуйте чуть позже.')
    throw new Error(`Ошибка провайдера ${response.status}: ${detail || response.statusText}`)
  }

  const data = await response.json() as any
  const choice = data?.choices?.[0]
  const content = choice?.message?.content ?? data?.message?.content
  const rawFinishReason = choice?.finish_reason ?? choice?.finishReason ?? data?.done_reason ?? data?.finish_reason
  const finishReason = typeof rawFinishReason === 'string' ? rawFinishReason.trim().toLocaleLowerCase('en-US') : undefined
  if (typeof content !== 'string' || !content.trim()) throw new Error('Провайдер вернул пустой ответ.')
  return {
    content: content.trim(),
    finishReason,
    truncated: Boolean(finishReason && truncationReasons.has(finishReason)),
  }
}

function completionCacheKey(
  configInput: ProviderConfig,
  messages: ChatMessage[],
  jsonMode: boolean,
  maxOutputTokens: number | undefined,
  retryWithoutJson: boolean,
  tokenLimitFallback: TokenLimitFallback,
) {
  const config = resolveConfig(configInput)
  return createHash('sha256').update(JSON.stringify({
    provider: config.provider,
    baseUrl: config.baseUrl,
    model: config.model,
    temperature: jsonMode ? 0 : config.temperature,
    messages,
    jsonMode,
    maxOutputTokens,
    retryWithoutJson,
    tokenLimitFallback,
  })).digest('hex')
}

async function scopedRequestCompletion(
  config: ProviderConfig,
  messages: ChatMessage[],
  jsonMode: boolean,
  maxOutputTokens: number | undefined,
  retryWithoutJson = true,
  tokenLimitFallback: TokenLimitFallback = 'reduce',
): Promise<CompletionResult> {
  const scope = completionScopes.getStore()
  if (!scope) return requestCompletion(config, messages, jsonMode, maxOutputTokens, retryWithoutJson, tokenLimitFallback)
  const key = completionCacheKey(config, messages, jsonMode, maxOutputTokens, retryWithoutJson, tokenLimitFallback)
  const cached = scope.cache.get(key)
  if (cached) {
    scope.cacheHits += 1
    return cached
  }
  const startedAt = performance.now()
  scope.providerCalls += 1
  const pending = requestCompletion(config, messages, jsonMode, maxOutputTokens, retryWithoutJson, tokenLimitFallback)
    .finally(() => { scope.providerTimeMs += Math.round(performance.now() - startedAt) })
    .catch((error) => {
      scope.cache.delete(key)
      throw error
    })
  scope.cache.set(key, pending)
  return pending
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

export async function completeJson(config: ProviderConfig, messages: ChatMessage[], options?: CompletionOptions): Promise<unknown> {
  let repairMessages = messages
  let lastError: unknown
  let maxOutputTokens = outputLimit(messages, true, options)

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const completion = await scopedRequestCompletion(config, repairMessages, true, maxOutputTokens)
    const raw = completion.content
    if (completion.truncated) {
      lastError = new Error(`Провайдер обрезал обязательный JSON по лимиту вывода (finish_reason=${completion.finishReason ?? 'length'}, max_tokens=${maxOutputTokens}).`)
      maxOutputTokens = expandedOutputLimit(maxOutputTokens)
      repairMessages = [
        ...messages,
        { role: 'assistant', content: raw },
        {
          role: 'user',
          content: `Предыдущий JSON был ОБРЕЗАН провайдером по лимиту вывода (finish_reason=${completion.finishReason ?? 'length'}). Верни заново весь объект целиком, от первой до последней закрывающей скобки. Не продолжай с места обрыва, не сокращай массивы и вложенные объекты, не добавляй Markdown или пояснения.`,
        },
      ]
      continue
    }
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

export async function completeText(config: ProviderConfig, messages: ChatMessage[], options?: CompletionOptions): Promise<string> {
  let retryMessages = messages
  let maxOutputTokens = outputLimit(messages, false, options)
  let finishReason = 'length'

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const completion = await scopedRequestCompletion(config, retryMessages, false, maxOutputTokens)
    if (!completion.truncated) return completion.content
    finishReason = completion.finishReason ?? finishReason
    maxOutputTokens = expandedOutputLimit(maxOutputTokens)
    retryMessages = [
      ...messages,
      { role: 'assistant', content: completion.content },
      {
        role: 'user',
        content: `Предыдущий текст был ОБРЕЗАН провайдером (finish_reason=${finishReason}). Перепиши весь ответ целиком, сохрани все важные факты, закончи сцену естественно и не обрывай последнюю фразу.`,
      },
    ]
  }

  throw new Error(`Провайдер трижды обрезал ответ по лимиту вывода (finish_reason=${finishReason}). История не применена, чтобы не сохранить незавершённую сцену.`)
}
