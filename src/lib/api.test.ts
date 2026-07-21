// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProviderConfig } from '../../shared/types'
import { createDemoCampaign } from './demo'
import { askWorldQuestion, generateCampaign } from './api'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

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

describe('long world job connection recovery', () => {
  it('keeps polling the same server job after a temporary network outage', async () => {
    vi.useFakeTimers()
    const campaign = createDemoCampaign()
    let pollFailures = 0
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (init?.method === 'POST') {
        return new Response(JSON.stringify({
          id: 'world-job-1', status: 'pending', progress: { percent: 30, stage: 'parallel-world', detail: 'Создаём разделы' },
        }), { status: 202, headers: { 'Content-Type': 'application/json' } })
      }
      if (url === '/api/jobs/world/world-job-1' && pollFailures < 4) {
        pollFailures += 1
        throw new TypeError('temporary network loss')
      }
      return new Response(JSON.stringify({
        id: 'world-job-1', status: 'complete', result: campaign,
        progress: { percent: 100, stage: 'complete', detail: 'Готово' },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    })
    vi.stubGlobal('fetch', fetchMock)
    const progress: string[] = []

    const resultPromise = generateCampaign({
      inspiration: 'Мир после бури', genre: 'Фэнтези', tone: 'Живой', characterName: 'Лиор',
      characterConcept: 'Картограф', opening: 'На маяке', canonMode: 'original', contentBoundaries: '',
      provider: { provider: 'ollama', model: 'deepseek-v4-flash', baseUrl: 'https://ollama.com/v1', temperature: 0.8 },
    }, undefined, (value) => progress.push(value.stage))
    await vi.runAllTimersAsync()

    await expect(resultPromise).resolves.toEqual(campaign)
    expect(progress).toContain('reconnecting')
    expect(fetchMock.mock.calls.filter(([url]) => String(url) === '/api/jobs/world/world-job-1')).toHaveLength(5)
  })
})
