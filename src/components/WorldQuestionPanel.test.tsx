// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProviderConfig } from '../../shared/types'
import { createDemoCampaign } from '../lib/demo'
import { WorldQuestionPanel } from './WorldQuestionPanel'

const askWorldQuestion = vi.hoisted(() => vi.fn())

vi.mock('../lib/api', () => ({ askWorldQuestion }))

const provider: ProviderConfig = {
  provider: 'ollama',
  model: 'deepseek-v4-flash',
  baseUrl: 'https://ollama.com/v1',
  temperature: 0.8,
}

beforeEach(() => {
  localStorage.clear()
  askWorldQuestion.mockReset()
})

afterEach(cleanup)

describe('world question panel', () => {
  it('asks without a character limit and keeps the request separate from campaign mutations', async () => {
    const campaign = createDemoCampaign()
    askWorldQuestion.mockResolvedValue({
      answer: '**Сейчас:** герой находится в текущей сцене.',
      scope: 'known',
      generatedAt: new Date().toISOString(),
    })

    render(<WorldQuestionPanel open campaign={campaign} provider={provider} onClose={vi.fn()} />)

    expect(screen.getByText('Спросить о мире')).toBeTruthy()
    expect(screen.getByText('Ответ не изменяет историю')).toBeTruthy()
    const input = screen.getByLabelText('Вопрос о кампании') as HTMLTextAreaElement
    expect(input.maxLength).toBe(-1)

    fireEvent.change(input, { target: { value: 'Что происходит сейчас?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Задать вопрос' }))

    await waitFor(() => expect(askWorldQuestion).toHaveBeenCalledOnce())
    expect(askWorldQuestion.mock.calls[0][0]).toMatchObject({
      campaign,
      question: 'Что происходит сейчас?',
      scope: 'known',
      history: [],
      provider,
    })
    expect(await screen.findByText('Сейчас:')).toBeTruthy()
    expect(screen.getByText('герой находится в текущей сцене.')).toBeTruthy()
  })

  it('requires an explicit switch before hidden campaign knowledge is requested', async () => {
    const campaign = createDemoCampaign()
    askWorldQuestion.mockResolvedValue({
      answer: 'Спойлеры включены. Тайный ответ.',
      scope: 'complete',
      generatedAt: new Date().toISOString(),
    })

    render(<WorldQuestionPanel open campaign={campaign} provider={provider} onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /Полная справка/ }))
    expect(screen.getByText(/Этот режим может раскрыть планы врагов/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Вопрос о кампании'), { target: { value: 'Каков настоящий план врага?' } })
    fireEvent.keyDown(screen.getByLabelText('Вопрос о кампании'), { key: 'Enter', shiftKey: false })

    await waitFor(() => expect(askWorldQuestion).toHaveBeenCalledOnce())
    expect(askWorldQuestion.mock.calls[0][0].scope).toBe('complete')
    expect(await screen.findByText('Спойлеры включены. Тайный ответ.')).toBeTruthy()
  })
})
