import { afterEach, describe, expect, it, vi } from 'vitest'
import { auxiliaryProviderConfig, completeAuxiliaryJson, completeJson, completeText, completionScopeStats, withCompletionScope } from './provider'

afterEach(() => vi.unstubAllGlobals())

describe('structured provider recovery', () => {
  it('routes only explicit optional reviews to the smallest configured Ollama Cloud model', async () => {
    const bodies: any[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)))
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"verdict":"ok"}' }, finish_reason: 'stop' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }))
    const provider = {
      provider: 'ollama' as const,
      model: 'deepseek-v4-flash:cloud',
      baseUrl: 'https://ollama.com/v1',
      apiKey: 'aux-route-test',
      temperature: 0.8,
      useAuxiliaryModel: true,
      auxiliaryModel: 'gpt-oss:20b',
    }

    await expect(completeAuxiliaryJson(provider, [{ role: 'user', content: 'Проверь кратко.' }], undefined, (value) => Boolean((value as any)?.verdict))).resolves.toEqual({ verdict: 'ok' })
    await expect(completeJson(provider, [{ role: 'user', content: 'Создай основное состояние.' }])).resolves.toEqual({ verdict: 'ok' })

    expect(bodies.map((body) => body.model)).toEqual(['gpt-oss:20b', 'deepseek-v4-flash:cloud'])
    expect(bodies[0].max_tokens).toBe(4_096)
  })

  it('propagates an auxiliary contract failure and keeps the open circuit off the primary model', async () => {
    const bodies: any[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      bodies.push(body)
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"unexpected":true}' }, finish_reason: 'stop' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }))
    const provider = {
      provider: 'ollama' as const,
      model: 'deepseek-v4-flash:cloud',
      baseUrl: 'https://ollama.com/v1',
      apiKey: 'aux-fallback-test',
      temperature: 0.8,
      useAuxiliaryModel: true,
    }

    const review = () => completeAuxiliaryJson(provider, [{ role: 'user', content: 'Проверь кратко.' }], undefined, (value) => typeof (value as any)?.verdict === 'string')
    await expect(review()).rejects.toThrow(/не прошла контракт/i)
    await expect(review()).rejects.toThrow(/временно недоступна/i)
    expect(bodies.map((body) => body.model)).toEqual(['gpt-oss:20b'])
  })

  it('uses the primary model normally when no auxiliary model is configured', async () => {
    const bodies: any[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)))
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"verdict":"ok"}' }, finish_reason: 'stop' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }))
    const provider = {
      provider: 'ollama' as const,
      model: 'local-review-model',
      baseUrl: 'http://127.0.0.1:11434/v1',
      temperature: 0.8,
    }

    await expect(completeAuxiliaryJson(provider, [{ role: 'user', content: 'Проверь кратко.' }])).resolves.toEqual({ verdict: 'ok' })
    expect(bodies.map((body) => body.model)).toEqual(['local-review-model'])
  })

  it('never redirects local Ollama or a disabled configuration to Ollama Cloud', () => {
    expect(auxiliaryProviderConfig({ provider: 'ollama', model: 'local-model', baseUrl: 'http://127.0.0.1:11434/v1', temperature: 0.8 })).toBeUndefined()
    expect(auxiliaryProviderConfig({ provider: 'ollama', model: 'deepseek-v4-flash:cloud', baseUrl: 'https://ollama.com/v1', temperature: 0.8, useAuxiliaryModel: false })).toBeUndefined()
  })

  it('shares identical in-flight completions only inside one user operation', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: '{"ok":true}' }, finish_reason: 'stop' }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    const provider = { provider: 'ollama' as const, model: 'deepseek-v4-flash:cloud', baseUrl: 'https://ollama.com/v1', apiKey: 'test', temperature: 0.8 }
    const messages = [{ role: 'user' as const, content: 'Верни тот же JSON.' }]

    const firstScope = await withCompletionScope(async () => {
      const results = await Promise.all([
        completeJson(provider, messages),
        completeJson(provider, messages),
      ])
      return { results, stats: completionScopeStats() }
    })

    expect(firstScope.results).toEqual([{ ok: true }, { ok: true }])
    expect(firstScope.stats).toMatchObject({ cacheHits: 1, providerCalls: 1 })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await withCompletionScope(() => completeJson(provider, messages))
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('measures genuinely parallel provider work separately from summed model time', async () => {
    let started = 0
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const fetchMock = vi.fn(async () => {
      started += 1
      if (started === 2) release()
      await gate
      return new Response(JSON.stringify({ choices: [{ message: { content: 'Готово.' } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)
    const provider = { provider: 'ollama' as const, model: 'deepseek-v4-flash:cloud', baseUrl: 'https://ollama.com/v1', apiKey: 'test', temperature: 0.8 }

    const stats = await withCompletionScope(async () => {
      await Promise.all([
        completeText(provider, [{ role: 'user', content: 'Первая независимая стадия.' }]),
        completeText(provider, [{ role: 'user', content: 'Вторая независимая стадия.' }]),
      ])
      return completionScopeStats()
    })

    expect(stats).toMatchObject({ providerCalls: 2, cacheHits: 0, peakProviderConcurrency: 2 })
    expect(stats?.providerWallMs).toBeGreaterThanOrEqual(0)
    expect(stats?.providerTimeMs).toBeGreaterThanOrEqual(stats?.providerWallMs ?? 0)
  })

  it('uses deterministic temperature and repairs invalid JSON syntax automatically', async () => {
    const bodies: any[] = []
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)))
      const content = bodies.length === 1 ? '{"world":' : '{"world":{"name":"Вайс"}}'
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await completeJson(
      { provider: 'ollama', model: 'deepseek-v4-flash:cloud', baseUrl: 'https://ollama.com/v1', apiKey: 'test', temperature: 0.95 },
      [{ role: 'user', content: 'Верни мир.' }],
    )

    expect(result).toEqual({ world: { name: 'Вайс' } })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(bodies.every((body) => body.temperature === 0)).toBe(true)
    expect(bodies.every((body) => body.max_tokens === 12_288)).toBe(true)
    expect(bodies[1].messages.at(-1).content).toContain('корректным JSON')
  })

  it('diagnoses finish_reason=length as truncation, expands the limit and regenerates the complete JSON', async () => {
    const bodies: any[] = []
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)))
      const first = bodies.length === 1
      return new Response(JSON.stringify({
        choices: [{
          message: { content: first ? '{"world":{"name":"Обр' : '{"world":{"name":"Полный мир"}}' },
          finish_reason: first ? 'length' : 'stop',
        }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await completeJson(
      { provider: 'ollama', model: 'deepseek-v4-flash:cloud', baseUrl: 'https://ollama.com/v1', apiKey: 'test', temperature: 0.8 },
      [{ role: 'system', content: 'Ты — архитектор цельных миров.' }, { role: 'user', content: 'Создай мир.' }],
    )

    expect(result).toEqual({ world: { name: 'Полный мир' } })
    expect(bodies[0].max_tokens).toBe(65_536)
    expect(bodies[1].max_tokens).toBeGreaterThan(bodies[0].max_tokens)
    expect(bodies[1].messages.at(-1).content).toContain('ОБРЕЗАН')
  })

  it('safely lowers an explicitly rejected max_tokens limit for an OpenAI-compatible gateway', async () => {
    const bodies: any[] = []
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)))
      if (bodies.length === 1) {
        return new Response(JSON.stringify({ error: { message: 'max_tokens must be less than or equal to 32768' } }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' }, finish_reason: 'stop' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await completeJson(
      { provider: 'ollama', model: 'deepseek-v4-flash:cloud', baseUrl: 'https://ollama.com/v1', apiKey: 'test', temperature: 0.8 },
      [{ role: 'system', content: 'Ты — архитектор цельных миров.' }, { role: 'user', content: 'Создай мир.' }],
    )

    expect(result).toEqual({ ok: true })
    expect(bodies.map((body) => body.max_tokens)).toEqual([65_536, 32_768])
  })

  it('omits max_tokens only when the gateway explicitly rejects that parameter', async () => {
    const bodies: any[] = []
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)))
      if (bodies.length === 1) return new Response('Unknown parameter: max_tokens is not supported', { status: 400 })
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' }, finish_reason: 'stop' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(completeJson(
      { provider: 'custom', model: 'compatible-model', baseUrl: 'https://example.test/v1', apiKey: 'test', temperature: 0.8 },
      [{ role: 'user', content: 'Верни JSON.' }],
    )).resolves.toEqual({ ok: true })
    expect(bodies[0]).toHaveProperty('max_tokens')
    expect(bodies[1]).not.toHaveProperty('max_tokens')
  })

  it('never reports a repeatedly truncated structured response as a generic JSON syntax error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: '{"world":' }, finish_reason: 'length' }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })))

    await expect(completeJson(
      { provider: 'ollama', model: 'deepseek-v4-flash:cloud', baseUrl: 'https://ollama.com/v1', apiKey: 'test', temperature: 0.8 },
      [{ role: 'user', content: 'Верни структуру.' }],
    )).rejects.toThrow(/обрезал обязательный JSON.*finish_reason=length/i)
  })

  it('regenerates a truncated narrative instead of returning a broken final sentence', async () => {
    const bodies: any[] = []
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)))
      const first = bodies.length === 1
      return new Response(JSON.stringify({
        choices: [{ message: { content: first ? 'Дверь открывается, и герой видит' : 'Дверь открывается. За ней пустой зал; герой останавливается у порога.' }, finish_reason: first ? 'max_tokens' : 'stop' }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await completeText(
      { provider: 'ollama', model: 'deepseek-v4-flash:cloud', baseUrl: 'https://ollama.com/v1', apiKey: 'test', temperature: 0.85 },
      [{ role: 'user', content: 'Продолжи сцену.' }],
    )

    expect(result).toContain('останавливается у порога')
    expect(bodies[1].messages.at(-1).content).toContain('ОБРЕЗАН')
    expect(bodies[1].max_tokens).toBeGreaterThan(bodies[0].max_tokens)
  })

  it('retries a transient network disconnect without losing the completion', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: 'Связь восстановлена.' } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await completeText(
      { provider: 'ollama', model: 'deepseek-v4-flash:cloud', baseUrl: 'https://ollama.com/v1', apiKey: 'test', temperature: 0.85 },
      [{ role: 'user', content: 'Продолжи сцену.' }],
    )

    expect(result).toBe('Связь восстановлена.')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('retries Cloudflare 524 for the same bounded generation stage', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('<html>524: A timeout occurred</html>', { status: 524 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: '{"stage":"ready"}' } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(completeJson(
      { provider: 'ollama', model: 'deepseek-v4-flash:cloud', baseUrl: 'https://ollama.com/v1', apiKey: 'test', temperature: 0.8 },
      [{ role: 'system', content: 'Многоэтапная генерация мира.' }, { role: 'user', content: 'Создай только один раздел.' }],
      { stage: 'world' },
    )).resolves.toEqual({ stage: 'ready' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
