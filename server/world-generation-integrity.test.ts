import { describe, expect, it } from 'vitest'
import { demoWorld } from './demo'
import { normalizeGeneratedWorldReferences } from './orchestrator'
import { generatedWorldDraftSchema, generatedWorldEcologyRepairSchema, generatedWorldSchema } from './schemas'

const request = {
  inspiration: 'Эйдол',
  genre: 'Фэнтези',
  tone: 'Серьёзный',
  characterName: 'Акира',
  characterConcept: 'Искатель',
  opening: 'Пограничный квартал',
  canonMode: 'original' as const,
  contentBoundaries: '',
  provider: { provider: 'demo' as const, model: 'demo', baseUrl: '', temperature: 0.8 },
}

const validWorld = () => demoWorld(request)

describe('generated world integrity pipeline', () => {
  it('separates a complete JSON shape from cross-entity ecology validation', () => {
    const world = validWorld()
    world.npcs = world.npcs.slice(0, 1)
    world.world.legends = world.world.legends.slice(0, 2)

    expect(generatedWorldDraftSchema.safeParse(world).success).toBe(true)
    const strict = generatedWorldSchema.safeParse(world)
    expect(strict.success).toBe(false)
    if (!strict.success) {
      expect(strict.error.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: ['npcs'] }),
        expect.objectContaining({ path: ['world', 'legends'] }),
      ]))
    }
  })

  it('restores the requested hero identity and canonical atlas names without inventing data', () => {
    const world = validWorld()
    world.player.name = 'Акира Куросаки'
    world.characterArcs[0].ownerName = 'Акира'
    world.worldPressures[0].targetNames = ['Акира']
    world.threads[0].participantNames = ['Акира Куросаки']
    world.world.legends[2].currentState.locationName = 'Северная обсерватория (предположительно)'
    world.world.legends[3].currentState.locationName = 'Неизвестно'

    const normalized = normalizeGeneratedWorldReferences(world, 'Акира')

    expect(normalized.player.name).toBe('Акира')
    expect(normalized.characterArcs[0].ownerName).toBe('Акира')
    expect(normalized.worldPressures[0].targetNames).toEqual(['Акира'])
    expect(normalized.threads[0].participantNames).toEqual(['Акира'])
    expect(normalized.world.legends[2].currentState.locationName).toBe('Северная обсерватория')
    expect(normalized.world.legends[3].currentState).not.toHaveProperty('locationName')
    expect(generatedWorldSchema.safeParse(normalized).success).toBe(true)
  })

  it('reports inflated legend rank, missing history and descriptive unknown location together', () => {
    const world = validWorld()
    const legendIndex = world.world.legends.findIndex((legend) => legend.stage === 'mythic')
    expect(legendIndex).toBeGreaterThanOrEqual(0)
    const legend = world.world.legends[legendIndex]
    legend.renown = 1
    legend.knownFeats = []
    legend.deeds = []
    legend.myths = []
    legend.legacies = []
    legend.currentState.locationName = 'Неизвестно, предположительно за границей мира'

    expect(generatedWorldDraftSchema.safeParse(world).success).toBe(true)
    const strict = generatedWorldSchema.safeParse(world)
    expect(strict.success).toBe(false)
    if (!strict.success) {
      const paths = strict.error.issues.map((issue) => issue.path.join('.'))
      expect(paths).toContain(`world.legends.${legendIndex}.renown`)
      expect(paths).toContain(`world.legends.${legendIndex}`)
      expect(paths).toContain(`world.legends.${legendIndex}.currentState.locationName`)
    }
  })

  it('accepts only fully authored NPC and legend arrays in the focused repair contract', () => {
    const world = validWorld()
    expect(generatedWorldEcologyRepairSchema.safeParse({
      npcs: world.npcs,
      legends: world.world.legends,
    }).success).toBe(true)
    expect(generatedWorldEcologyRepairSchema.safeParse({
      npcs: [{ name: 'Заглушка' }],
      legends: world.world.legends,
    }).success).toBe(false)
  })
})
