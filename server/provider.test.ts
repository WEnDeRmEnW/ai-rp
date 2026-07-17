import { afterEach, describe, expect, it, vi } from 'vitest'
import { completeJson, completeText } from './provider'

afterEach(() => vi.unstubAllGlobals())

describe('structured provider recovery', () => {
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
