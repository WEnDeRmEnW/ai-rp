import { describe, expect, it } from 'vitest'
import type { NPC } from '../../shared/types'
import { getNpcDisclosure } from './npc-disclosure'

const npc: NPC = {
  id: 'npc-1', name: 'Староста', role: 'Староста деревни', description: 'Седой мужчина', disposition: 'Осторожен',
  relationship: 35, status: 'active', currentGoal: 'Скрыть договор', lastSeen: 'Площадь', notes: ['Боится разоблачения'],
  stats: [{ key: 'intellect', label: 'Интеллект', value: 80 }],
  resources: [{ key: 'health', label: 'Здоровье', value: 50, max: 50 }],
  abilities: [{ id: 'ability-1', name: 'Печать', description: 'Тайная техника', kind: 'active', mastery: 70, costs: [], effects: [], limitations: [], requirements: [], progression: '', evolutionPaths: [], history: [], tags: [] }],
}

describe('NPC disclosure', () => {
  it('keeps old saves secure when no dossier exists', () => {
    const disclosure = getNpcDisclosure(npc)
    expect(disclosure.has('relationship')).toBe(false)
    expect(disclosure.stats).toEqual([])
    expect(disclosure.resources).toEqual([])
    expect(disclosure.abilities).toEqual([])
  })

  it('reveals only explicitly learned granular facts', () => {
    const disclosure = getNpcDisclosure({ ...npc, dossier: {
      familiarity: 'acquainted', revealedSections: ['relationship'], revealedStatKeys: ['intellect'],
      revealedResourceKeys: [], revealedAbilityIds: ['ability-1'], evidence: [], updatedTurn: 2,
    } })
    expect(disclosure.has('relationship')).toBe(true)
    expect(disclosure.stats.map((entry) => entry.key)).toEqual(['intellect'])
    expect(disclosure.resources).toEqual([])
    expect(disclosure.abilities.map((entry) => entry.id)).toEqual(['ability-1'])
  })
})
