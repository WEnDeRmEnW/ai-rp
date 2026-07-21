const apiKey = process.env.OLLAMA_API_KEY
if (!apiKey) throw new Error('OLLAMA_API_KEY is required')

const endpoint = 'https://ollama.com/v1/chat/completions'
const timeoutMs = Number(process.env.OLLAMA_BENCH_TIMEOUT_MS || 45_000)
const repeatTop = Number(process.env.OLLAMA_BENCH_REPEAT_TOP || 5)
const repeatCount = Number(process.env.OLLAMA_BENCH_REPEAT_COUNT || 2)
const maxTokens = Number(process.env.OLLAMA_BENCH_MAX_TOKENS || 320)
const issueCount = Number(process.env.OLLAMA_BENCH_ISSUE_COUNT || 3)

const catalogResponse = await fetch('https://ollama.com/api/tags', { signal: AbortSignal.timeout(15_000) })
if (!catalogResponse.ok) throw new Error(`Catalog HTTP ${catalogResponse.status}`)
const catalog = await catalogResponse.json()
const requestedModels = (process.env.OLLAMA_BENCH_MODELS || '').split(',').map((value) => value.trim()).filter(Boolean)
const availableModels = (catalog.models || []).map((entry) => entry.name).filter(Boolean)
const models = requestedModels.length
  ? requestedModels.filter((model) => availableModels.includes(model))
  : availableModels

const messages = [
  {
    role: 'system',
    content: 'Ты быстрый технический критик русскоязычной RPG. Верни только один корректный JSON-объект без Markdown.',
  },
  {
    role: 'user',
    content: `Проверь непротиворечивость записи: герой имеет 12/20 энергии, техника требует 5 энергии, артефакт даёт +3 защиты и не меняет здоровье. Способность требует концентрации, не имеет отката, принадлежит герою, открыта полностью и не меняет инвентарь. NPC знает только наблюдаемый эффект, а скрытая техника ему неизвестна. Верни объект строго вида {"verdict":"ok|repair","score":0-100,"issues":["..."],"summary":"..."}. Назови ровно ${issueCount} коротких проверенных фактов в issues и дай содержательную русскую summary длиной ${issueCount > 5 ? 4 : 2} предложения.`,
  },
]

function percentile(values, ratio) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * ratio)))]
}

async function runOnce(model, phase, run) {
  const startedAt = performance.now()
  let headersAt
  let firstEventAt
  let firstContentAt
  let finishedAt
  let content = ''
  let reasoning = ''
  let completionTokens
  let promptTokens

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
        stream: true,
        stream_options: { include_usage: true },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    })
    headersAt = performance.now()
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300).replaceAll(apiKey, '[redacted]')
      throw new Error(`HTTP ${response.status}: ${detail}`)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!firstEventAt) firstEventAt = performance.now()
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() || ''
      for (const line of lines) {
        if (!line.startsWith('data:')) continue
        const payload = line.slice(5).trim()
        if (!payload || payload === '[DONE]') continue
        let event
        try { event = JSON.parse(payload) } catch { continue }
        const delta = event?.choices?.[0]?.delta || {}
        const chunk = typeof delta.content === 'string' ? delta.content : ''
        const thought = typeof delta.reasoning_content === 'string'
          ? delta.reasoning_content
          : typeof delta.reasoning === 'string' ? delta.reasoning : ''
        if (chunk && !firstContentAt) firstContentAt = performance.now()
        content += chunk
        reasoning += thought
        if (event.usage) {
          completionTokens = event.usage.completion_tokens
          promptTokens = event.usage.prompt_tokens
        }
      }
    }
    finishedAt = performance.now()

    let parsed
    let validJson = false
    let contractOk = false
    try {
      parsed = JSON.parse(content.trim())
      validJson = Boolean(parsed && typeof parsed === 'object' && !Array.isArray(parsed))
      contractOk = validJson
        && ['ok', 'repair'].includes(parsed.verdict)
        && Number.isFinite(parsed.score)
        && Array.isArray(parsed.issues)
        && parsed.issues.length === issueCount
        && typeof parsed.summary === 'string'
        && /[А-Яа-яЁё]/u.test(parsed.summary)
    } catch {}

    const generationMs = firstContentAt && finishedAt ? Math.max(1, finishedAt - firstContentAt) : undefined
    const visibleCharsPerSecond = generationMs ? Math.round((content.length / generationMs) * 1000) : 0
    const tokensPerSecond = generationMs && completionTokens ? Math.round((completionTokens / generationMs) * 1000 * 10) / 10 : undefined
    const result = {
      model,
      phase,
      run,
      ok: validJson && contractOk,
      validJson,
      contractOk,
      httpMs: Math.round((headersAt || finishedAt) - startedAt),
      firstEventMs: firstEventAt ? Math.round(firstEventAt - startedAt) : null,
      firstContentMs: firstContentAt ? Math.round(firstContentAt - startedAt) : null,
      totalMs: Math.round(finishedAt - startedAt),
      visibleChars: content.length,
      visibleCharsPerSecond,
      completionTokens: completionTokens ?? null,
      promptTokens: promptTokens ?? null,
      tokensPerSecond: tokensPerSecond ?? null,
      reasoningChars: reasoning.length,
    }
    console.log(JSON.stringify(result))
    return result
  } catch (error) {
    finishedAt = performance.now()
    const result = {
      model,
      phase,
      run,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      totalMs: Math.round(finishedAt - startedAt),
    }
    console.log(JSON.stringify(result))
    return result
  }
}

console.log(JSON.stringify({ phase: 'catalog', modelCount: models.length, models }))
const cold = []
for (const model of models) cold.push(await runOnce(model, 'cold', 1))

const eligible = cold
  .filter((result) => result.ok && Number.isFinite(result.firstContentMs))
  .sort((a, b) => (a.firstContentMs - b.firstContentMs) || (a.totalMs - b.totalMs))
  .slice(0, repeatTop)

const repeated = []
for (let run = 1; run <= repeatCount; run += 1) {
  for (const candidate of eligible) repeated.push(await runOnce(candidate.model, 'repeat', run))
}

const summary = eligible.map((candidate) => {
  const samples = [candidate, ...repeated.filter((result) => result.model === candidate.model && result.ok)]
  return {
    model: candidate.model,
    samples: samples.length,
    medianFirstContentMs: percentile(samples.map((sample) => sample.firstContentMs), 0.5),
    p90FirstContentMs: percentile(samples.map((sample) => sample.firstContentMs), 0.9),
    medianTotalMs: percentile(samples.map((sample) => sample.totalMs), 0.5),
    medianVisibleCharsPerSecond: percentile(samples.map((sample) => sample.visibleCharsPerSecond), 0.5),
    medianTokensPerSecond: samples.every((sample) => Number.isFinite(sample.tokensPerSecond))
      ? percentile(samples.map((sample) => sample.tokensPerSecond), 0.5)
      : null,
    contractPassRate: samples.filter((sample) => sample.contractOk).length / samples.length,
  }
}).sort((a, b) => (a.medianFirstContentMs - b.medianFirstContentMs) || (a.medianTotalMs - b.medianTotalMs))

console.log(JSON.stringify({ phase: 'summary', summary }))
