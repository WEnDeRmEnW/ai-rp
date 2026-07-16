// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { StateChange, StoryMessage } from '../../shared/types'
import { formatStateChangeTransition } from '../lib/state-change-transition'
import { StateReceipt } from './StateReceipt'

afterEach(cleanup)

const change = (values: Partial<StateChange>): StateChange => ({
  kind: 'world',
  label: 'Изменение',
  detail: 'Состояние обновлено',
  tone: 'neutral',
  ...values,
})

describe('state receipt transitions', () => {
  it('keeps compact numeric transitions visible', () => {
    expect(formatStateChangeTransition(change({ before: 40, after: 80 }))).toBe('40 → 80')
    expect(formatStateChangeTransition(change({ delta: 3 }))).toBe('+3')
  })

  it('does not show a fake transition when the value did not change', () => {
    expect(formatStateChangeTransition(change({ before: 85, after: 85 }))).toBeUndefined()
    expect(formatStateChangeTransition(change({ before: 'active', after: 'active' }))).toBeUndefined()
    expect(formatStateChangeTransition(change({ delta: 0 }))).toBeUndefined()
  })

  it('does not duplicate long world descriptions in the compact value column', () => {
    expect(formatStateChangeTransition(change({
      before: 'Башня оставалась запечатанной и не отвечала на внешние сигналы.',
      after: 'Внутри башни пробудился механизм, изменивший состояние всего района.',
    }))).toBeUndefined()
  })

  it('does not duplicate a transition that is already explained in the detail', () => {
    expect(formatStateChangeTransition(change({ before: 40, after: 80, detail: 'Освоение: 40 → 80 (+40)' }))).toBeUndefined()
    expect(formatStateChangeTransition(change({ delta: 3, detail: 'Доверие изменилось (+3)' }))).toBeUndefined()
  })

  it('aggregates internal diagnostics without exposing paths, UUIDs or duplicate transitions', () => {
    const message: StoryMessage = {
      id: 'message-1', role: 'assistant', content: 'Сцена продолжается.', createdAt: '2026-07-15T00:00:00.000Z', turn: 3,
      stateChanges: [
        change({ kind: 'health', label: 'Здоровье', detail: '10 → 5 (−5)', before: 10, after: 5, delta: -5, tone: 'negative' }),
        change({ kind: 'system', label: 'Изменение не применено', detail: 'statePatch.abilityChanges[0].history: ссылка не найдена «3253e2ff-5f57-4b60-9c3b-4605a20018d0»', tone: 'warning' }),
        change({ kind: 'system', label: 'Изменение не применено', detail: 'cleanup.quests[1].targetId: неизвестная запись quest_that_does_not_exist', tone: 'warning' }),
      ],
    }

    const { container } = render(<StateReceipt message={message} />)
    expect(screen.getByText('Служебная сверка завершена')).toBeTruthy()
    expect(screen.getByText(/2 внутренних изменения безопасно пропущены/)).toBeTruthy()
    expect(container.textContent).not.toContain('statePatch')
    expect(container.textContent).not.toContain('cleanup.quests')
    expect(container.textContent).not.toContain('3253e2ff')
    expect(container.textContent).not.toContain('quest_that_does_not_exist')
    expect(container.textContent?.match(/10 → 5/g)).toHaveLength(1)
  })
})
