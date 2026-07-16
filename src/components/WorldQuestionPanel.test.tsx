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
  if (!window.PointerEvent) Object.defineProperty(window, 'PointerEvent', { configurable: true, value: MouseEvent })
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
    expect(screen.getByText('история не изменится')).toBeTruthy()
    expect(screen.getByText('можно переносить')).toBeTruthy()
    expect(document.querySelector('.world-question-backdrop')).toBeNull()
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

  it('removes a failed pending question instead of duplicating it on retry', async () => {
    const campaign = createDemoCampaign()
    askWorldQuestion.mockRejectedValueOnce(new Error('Локальный сервер приложения использует старую версию.'))

    render(<WorldQuestionPanel open campaign={campaign} provider={provider} onClose={vi.fn()} />)

    const input = screen.getByLabelText('Вопрос о кампании') as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: 'Как работает моя способность?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Задать вопрос' }))

    expect((await screen.findByRole('alert')).textContent).toContain('старую версию')
    expect(input.value).toBe('Как работает моя способность?')
    expect(screen.queryByText('Вы')).toBeNull()
    expect(document.querySelector('.world-question-message.is-user')).toBeNull()
  })

  it('cleans consecutive duplicate questions left by an interrupted older version', () => {
    const campaign = createDemoCampaign()
    localStorage.setItem(`letopis-world-questions-${campaign.id}`, JSON.stringify([
      { id: 'one', role: 'user', content: 'Один вопрос', createdAt: new Date().toISOString() },
      { id: 'two', role: 'user', content: 'Один вопрос', createdAt: new Date().toISOString() },
    ]))

    render(<WorldQuestionPanel open campaign={campaign} provider={provider} onClose={vi.fn()} />)

    expect(screen.getAllByText('Один вопрос')).toHaveLength(1)
  })

  it('moves as an independent desktop window and remembers the new position', () => {
    const campaign = createDemoCampaign()
    render(<WorldQuestionPanel open campaign={campaign} provider={provider} onClose={vi.fn()} />)

    const dialog = screen.getByRole('dialog')
    const header = screen.getByTitle(/Перетащите окно за заголовок/)
    const initialLeft = Number.parseFloat(dialog.style.left)
    const initialTop = Number.parseFloat(dialog.style.top)
    fireEvent.pointerDown(header, { pointerId: 7, button: 0, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(header, { pointerId: 7, clientX: 145, clientY: 125 })
    fireEvent.pointerUp(header, { pointerId: 7, clientX: 145, clientY: 125 })

    expect(Number.parseFloat(dialog.style.left)).toBe(initialLeft + 45)
    expect(Number.parseFloat(dialog.style.top)).toBe(initialTop + 25)
    expect(JSON.parse(localStorage.getItem('letopis-world-question-position-v2') ?? '{}')).toMatchObject({
      x: initialLeft + 45,
      y: initialTop + 25,
    })
  })
})
