// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { authApi } from './auth-api'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('account API request deadline', () => {
  it('turns a stalled request into a recoverable error instead of loading forever', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    })))

    const request = authApi.me()
    const rejection = expect(request).rejects.toThrow('Сервер не ответил вовремя')
    await vi.advanceTimersByTimeAsync(15_000)
    await rejection
  })
})
