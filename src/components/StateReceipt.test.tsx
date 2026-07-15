import { describe, expect, it } from 'vitest'
import type { StateChange } from '../../shared/types'
import { formatStateChangeTransition } from '../lib/state-change-transition'

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

  it('does not duplicate long world descriptions in the compact value column', () => {
    expect(formatStateChangeTransition(change({
      before: 'Башня оставалась запечатанной и не отвечала на внешние сигналы.',
      after: 'Внутри башни пробудился механизм, изменивший состояние всего района.',
    }))).toBeUndefined()
  })
})
