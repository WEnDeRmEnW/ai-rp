import { describe, expect, it } from 'vitest'
import { demoWorld } from './demo'
import { assembleGeneratedWorldCharacters, assembleGeneratedWorldSections, normalizeGeneratedWorldReferences, sanitizeGeneratedWorldInterfaceBindings, splitGeneratedWorldSections } from './orchestrator'
import { generatedWorldCharactersSchema, generatedWorldCharacterTopologySchema, generatedWorldCivilizationSchema, generatedWorldCoreSchema, generatedWorldDraftSchema, generatedWorldEcologyRepairSchema, generatedWorldInterfaceSchema, generatedWorldLegendsSchema, generatedWorldNarrativeSchema, generatedWorldNpcBatchSchema, generatedWorldSchema } from './schemas'

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
  it('splits a full-depth world into bounded contracts and reassembles it losslessly', () => {
    const world = validWorld()
    const sections = splitGeneratedWorldSections(world)

    expect(generatedWorldCoreSchema.safeParse(sections.core).success).toBe(true)
    expect(generatedWorldCivilizationSchema.safeParse(sections.civilization).success).toBe(true)
    expect(generatedWorldCharactersSchema.safeParse(sections.characters).success).toBe(true)
    expect(generatedWorldLegendsSchema.safeParse(sections.legends).success).toBe(true)
    expect(generatedWorldNarrativeSchema.safeParse(sections.narrative).success).toBe(true)
    expect(generatedWorldInterfaceSchema.safeParse(sections.interface).success).toBe(true)
    expect(assembleGeneratedWorldSections(sections)).toEqual(world)
    expect(generatedWorldSchema.safeParse(assembleGeneratedWorldSections(sections)).success).toBe(true)
  })

  it('validates full NPC batches independently and limits each provider response to four dossiers', () => {
    const characters = splitGeneratedWorldSections(validWorld()).characters
    const fiveNpcs = [0, 1, 2, 0, 1].map((index, copy) => ({
      ...structuredClone(characters.npcs[index % characters.npcs.length]),
      name: `${characters.npcs[index % characters.npcs.length].name}-${copy}`,
    }))

    expect(generatedWorldNpcBatchSchema.safeParse({ npcs: fiveNpcs.slice(0, 4) }).success).toBe(true)
    expect(generatedWorldNpcBatchSchema.safeParse({ npcs: fiveNpcs }).success).toBe(false)
    expect(generatedWorldNpcBatchSchema.safeParse({ npcs: [{ name: 'Неполное досье' }] }).success).toBe(false)
    expect(generatedWorldCharacterTopologySchema.safeParse({
      socialLinks: characters.socialLinks,
      characterArcs: characters.characterArcs,
      antagonistPlans: characters.antagonistPlans,
      worldPressures: characters.worldPressures,
      influenceAssets: characters.influenceAssets,
      npcs: characters.npcs,
    }).success).toBe(false)
  })

  it('assembles parallel NPC batches in manifest order without losing topology fields', () => {
    const characters = splitGeneratedWorldSections(validWorld()).characters
    const topology = {
      socialLinks: characters.socialLinks,
      characterArcs: characters.characterArcs,
      antagonistPlans: characters.antagonistPlans,
      worldPressures: characters.worldPressures,
      influenceAssets: characters.influenceAssets,
    }
    const reversed = [...characters.npcs].reverse()
    const batches = Array.from({ length: Math.ceil(reversed.length / 4) }, (_, index) => ({ npcs: reversed.slice(index * 4, index * 4 + 4) }))
    const assembled = assembleGeneratedWorldCharacters(batches, topology, characters.npcs.map((npc) => npc.name))

    expect(assembled.npcs.map((npc) => npc.name)).toEqual(characters.npcs.map((npc) => npc.name))
    expect(assembled.socialLinks).toEqual(characters.socialLinks)
    expect(assembled.worldPressures).toEqual(characters.worldPressures)
    expect(() => assembleGeneratedWorldCharacters(batches, topology, [...characters.npcs.map((npc) => npc.name), 'Пропущенный NPC'])).toThrow(/Пропущенный NPC/u)
  })

  it('keeps valid world sections when an authored ability profile is absent or malformed', () => {
    const world = validWorld()
    const sections = splitGeneratedWorldSections(world)
    const playerAbility = sections.core.player.abilities[0]
    const npcAbility = sections.characters.npcs.flatMap((npc) => npc.abilities)[0]
    expect(playerAbility).toBeDefined()
    expect(npcAbility).toBeDefined()
    if (!playerAbility || !npcAbility) return

    delete playerAbility.profile
    ;(npcAbility as unknown as Record<string, unknown>).profile = {
      availability: { state: 'available' },
      facets: { control: 100 },
    }

    const parsedCore = generatedWorldCoreSchema.safeParse(sections.core)
    const parsedCharacters = generatedWorldCharactersSchema.safeParse(sections.characters)
    expect(parsedCore.success).toBe(true)
    expect(parsedCharacters.success).toBe(true)
    if (!parsedCore.success || !parsedCharacters.success) return
    expect(parsedCore.data.player.abilities[0].profile).toBeUndefined()
    expect(parsedCharacters.data.npcs.flatMap((npc) => npc.abilities)[0].profile).toBeUndefined()
  })

  it('recovers omitted rarity explanations from the authored item instead of discarding core', () => {
    const sections = splitGeneratedWorldSections(validWorld())
    sections.core.inventory.forEach((item) => {
      const profile = item.rarityProfile as unknown as Record<string, unknown>
      delete profile.basis
      delete profile.recognition
      delete profile.marketImpact
    })

    const parsed = generatedWorldCoreSchema.safeParse(sections.core)

    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    parsed.data.inventory.forEach((item) => {
      expect(item.rarityProfile.basis.length).toBeGreaterThan(0)
      expect(item.rarityProfile.recognition).toContain(item.name)
      expect(item.rarityProfile.marketImpact.length).toBeGreaterThan(0)
    })
  })

  it('accepts a compact cast without forcing filler NPCs or legends', () => {
    const world = validWorld()
    world.npcs = world.npcs.slice(0, 1)
    world.world.legends = world.world.legends.slice(0, 2)

    expect(generatedWorldDraftSchema.safeParse(world).success).toBe(true)
    const strict = generatedWorldSchema.safeParse(world)
    expect(strict.success).toBe(true)
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

  it('rejects visible interface bindings to hidden or nonexistent generated data', () => {
    const world = validWorld()
    const module = world.world.interfaceModules[0]
    const metric = {
      id: 'secret-metric', key: 'secret_metric', label: 'Скрытый показатель', description: 'Пока не известен герою',
      value: 50, min: 0, max: 100, unit: '%', visibility: 'hidden' as const,
      source: 'Скрытый процесс', updatePolicy: 'Меняется по установленным причинам',
    }
    world.world.metrics = [metric]
    expect(module).toBeDefined()
    if (!module) return

    module.visibility = 'known'
    metric.visibility = 'hidden'
    module.elements[0].binding = { domain: 'world.metric', key: metric.key }
    expect(generatedWorldDraftSchema.safeParse(world).success).toBe(true)

    const hidden = generatedWorldSchema.safeParse(world)
    expect(hidden.success).toBe(false)
    if (!hidden.success) expect(hidden.error.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: ['world', 'interfaceModules', 0, 'elements', 0, 'binding'],
        message: expect.stringContaining('cannot bind hidden world metric'),
      }),
    ]))

    metric.visibility = 'known'
    module.elements[0].binding = { domain: 'world.metric', key: 'missing-metric' }
    const missing = generatedWorldSchema.safeParse(world)
    expect(missing.success).toBe(false)
    if (!missing.success) expect(missing.error.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: ['world', 'interfaceModules', 0, 'elements', 0, 'binding'],
        message: expect.stringContaining('Unknown world metric binding'),
      }),
    ]))
  })

  it('drops only cross-world interface elements with invalid or hidden live bindings', () => {
    const world = validWorld()
    const module = world.world.interfaceModules[0]
    expect(module).toBeDefined()
    if (!module) return

    const validElement = structuredClone(module.elements[0])
    validElement.id = 'valid-static-element'
    delete validElement.binding
    validElement.value = 'Стабильное наблюдение'
    module.elements = [
      validElement,
      {
        id: 'unknown-live-element',
        label: 'Несуществующая метрика',
        kind: 'value',
        value: 77,
        state: 'warning',
        binding: { domain: 'world.metric', key: 'missing-metric' },
        links: ['valid-static-element'],
      },
    ]
    validElement.links = ['unknown-live-element']

    const sanitized = sanitizeGeneratedWorldInterfaceBindings(world)
    expect(sanitized.world.interfaceModules[0]?.elements.map((element) => element.id)).toEqual(['valid-static-element'])
    expect(sanitized.world.interfaceModules[0]?.elements[0]?.links).toEqual([])
    expect(generatedWorldSchema.safeParse(sanitized).success).toBe(true)
  })
})
