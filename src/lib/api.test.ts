// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProviderConfig } from '../../shared/types'
import { createDemoCampaign } from './demo'
import { askWorldQuestion } from './api'

afterEach(() => vi.unstubAllGlobals())

describe('question API errors', () => {
  it('explains a stale local server instead of showing a generic malformed response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<!doctype html><h1>Not Found</h1>', {
      status: 404,
      headers: { 'Content-Type': 'text/html' },
    })))
    const provider: ProviderConfig = {
      provider: 'ollama',
      model: 'deepseek-v4-flash',
      baseUrl: 'https://ollama.com/v1',
      temperature: 0.8,
    }

    await expect(askWorldQuestion({
      campaign: createDemoCampaign(),
      question: 'Что происходит?',
      scope: 'known',
      history: [],
      provider,
    })).rejects.toThrow('Локальный сервер приложения использует старую версию')
  })
})
