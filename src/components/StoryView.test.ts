// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { StoryMessage } from '../../shared/types'
import { createDemoCampaign } from '../lib/demo'
import { selectStoryWindow } from '../lib/story-window'
import { StoryView } from './StoryView'

const scrollIntoView = vi.fn()
const originalScrollIntoView = HTMLElement.prototype.scrollIntoView

beforeAll(() => Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView }))
afterEach(() => {
  cleanup()
  scrollIntoView.mockClear()
})
afterAll(() => {
  if (originalScrollIntoView) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: originalScrollIntoView })
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
})

function message(turn: number, role: StoryMessage['role']): StoryMessage {
  return { id: `${turn}-${role}`, role, content: `${role} ${turn}`, createdAt: '2026-07-15T00:00:00.000Z', turn }
}

describe('long story window', () => {
  const messages = Array.from({ length: 60 }, (_, index) => index + 1)
    .flatMap((turn) => [message(turn, 'user'), message(turn, 'assistant')])

  it('keeps only recent complete turns in the initial DOM window', () => {
    const result = selectStoryWindow(messages)
    expect(result.totalTurnCount).toBe(60)
    expect(result.visibleTurnCount).toBe(24)
    expect(result.hiddenTurnCount).toBe(36)
    expect(result.messages).toHaveLength(48)
    expect(result.messages[0].turn).toBe(37)
    expect(result.messages.at(-1)?.turn).toBe(60)
  })

  it('can reveal earlier chunks and eventually the entire unchanged history', () => {
    const expanded = selectStoryWindow(messages, 44)
    const complete = selectStoryWindow(messages, Number.MAX_SAFE_INTEGER)
    expect(expanded.hiddenTurnCount).toBe(16)
    expect(expanded.messages[0].turn).toBe(17)
    expect(complete.hiddenTurnCount).toBe(0)
    expect(complete.messages).toEqual(messages)
  })

  it('reveals earlier history through accessible controls without deleting any turn', () => {
    const campaign = createDemoCampaign()
    campaign.messages = messages
    campaign.turn = 60
    const { container } = render(createElement(StoryView, {
      campaign, generating: false, onSuggestion: vi.fn(), onPin: vi.fn(), onUndo: vi.fn(), onRetry: vi.fn(), onBranch: vi.fn(),
    }))

    expect(container.querySelectorAll('.story-turn')).toHaveLength(48)
    fireEvent.click(screen.getByRole('button', { name: 'Показать ещё 20 ходов из предыдущей части истории' }))
    expect(container.querySelectorAll('.story-turn')).toHaveLength(88)
    fireEvent.click(screen.getByRole('button', { name: 'Показать всё' }))
    expect(container.querySelectorAll('.story-turn')).toHaveLength(120)
  })

  it('jumps to the latest turn when campaign id changes even with the same message count', () => {
    const campaign = createDemoCampaign()
    campaign.id = 'campaign-a'
    const callbacks = { onSuggestion: vi.fn(), onPin: vi.fn(), onUndo: vi.fn(), onRetry: vi.fn(), onBranch: vi.fn() }
    const { rerender } = render(createElement(StoryView, { campaign, generating: false, ...callbacks }))
    expect(scrollIntoView.mock.calls.filter(([options]) => options?.behavior === 'auto')).toHaveLength(1)

    const nextCampaign = { ...createDemoCampaign(), id: 'campaign-b', messages: campaign.messages }
    rerender(createElement(StoryView, { campaign: nextCampaign, generating: false, ...callbacks }))
    expect(scrollIntoView.mock.calls.filter(([options]) => options?.behavior === 'auto')).toHaveLength(2)
  })
})
