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
    expect(bodies[1].messages.at(-1).content).toContain('корректным JSON')
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
})
