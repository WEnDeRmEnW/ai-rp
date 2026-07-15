import { describe, expect, it } from 'vitest'
import type { Campaign, StateChange } from '../../shared/types'
import { legacyChangeLabel, stateChangeLabel } from './state-change-labels'

const campaign = {
  player: {
    id: 'player',
    resources: [{ key: 'essence', label: 'Эссенция', value: 2, max: 10 }],
  },
  npcs: [],
} as unknown as Campaign

describe('state change labels', () => {
  it('localizes resource keys embedded in old change summaries', () => {
    expect(legacyChangeLabel('essence −3', campaign)).toBe('Эссенция −3')
  })

  it('uses the affected character resource label in structured receipts', () => {
    const change: StateChange = {
      kind: 'resource',
      label: 'essence',
      detail: 'Цена способности',
      tone: 'negative',
      entityId: 'player',
      delta: -3,
    }
    expect(stateChangeLabel(change, campaign)).toBe('Эссенция')
  })
})
