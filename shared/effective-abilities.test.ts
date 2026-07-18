import { describe, expect, it } from 'vitest'
import type { Campaign, InventoryItem } from './types'
import { activeItemAbilities, grantedItemAbilities } from './effective-abilities'

function artifactItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: 'artifact-1', name: 'Корона разрыва', description: 'Управляет границами пространства.', category: 'artifact', quantity: 1,
    rarity: 'transcendent', equipped: false, effects: [], discoveredTurn: 3, ...overrides,
    artifact: overrides.artifact ?? {
      sentient: false, awakened: true, mastery: 70, attunement: 70, bond: 0, requirements: ['Настройка 50%'],
      passiveEffects: ['Видит пространственные швы'], combinedEffects: ['Сочетает разрыв и запечатывание'], failureModes: [], components: [],
      powers: [{ id: 'power-1', name: 'Разрыв границы', description: 'Разделяет соприкасающиеся области пространства.', mastery: 75, costs: [], limitations: [], category: 'space', capabilities: ['Открывает устойчивый разлом'], techniques: [] }],
      drawbacks: [], evolutionPaths: [], secrets: [],
    },
  }
}

const campaign = (item: InventoryItem) => ({ inventory: [item] }) as Pick<Campaign, 'inventory'>

describe('item-granted abilities', () => {
  it('shows owned powers in the hero profile even before the item is equipped', () => {
    const granted = grantedItemAbilities(campaign(artifactItem()))
    expect(granted.map((entry) => entry.ability.name)).toContain('Разрыв границы')
    expect(granted.some((entry) => entry.synthetic && entry.ability.kind === 'passive')).toBe(true)
    expect(granted[0].available).toBe(false)
    expect(granted[0].blockers).toContain('Предмет не экипирован')
  })

  it('makes equipped awakened powers mechanically active', () => {
    const abilities = activeItemAbilities(campaign(artifactItem({ equipped: true })))
    expect(abilities.map((ability) => ability.id)).toContain('item-power:artifact-1:power-1')
    expect(abilities.some((ability) => ability.kind === 'passive')).toBe(true)
  })

  it('blocks powers when their canonical inventory item is broken', () => {
    const granted = grantedItemAbilities(campaign(artifactItem({ equipped: true, state: 'broken' })))
    expect(granted[0].available).toBe(false)
    expect(granted[0].blockers).toContain('Предмет сломан')
    expect(activeItemAbilities(campaign(artifactItem({ equipped: true, state: 'broken' })))).toHaveLength(0)
  })

  it('does not expose or activate artifact powers before they are discovered', () => {
    const item = artifactItem({ equipped: true })
    item.artifact!.discovery = {
      awareness: 10,
      revealedSections: ['identity'],
      powerKnowledge: { 'power-1': 'hidden' },
      componentKnowledge: {},
      evidence: [],
      updatedTurn: 3,
    }
    expect(grantedItemAbilities(campaign(item))).toEqual([])
    expect(activeItemAbilities(campaign(item))).toEqual([])

    item.artifact!.discovery.powerKnowledge['power-1'] = 'known'
    item.artifact!.discovery.revealedSections.push('powers')
    expect(grantedItemAbilities(campaign(item)).map((entry) => entry.ability.name)).toEqual(['Разрыв границы'])
  })
})
