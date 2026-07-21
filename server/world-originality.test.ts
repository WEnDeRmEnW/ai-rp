import { describe, expect, it } from 'vitest'
import { demoWorld } from './demo'
import { conceptAnalystPrompt } from './prompts'
import { generatedWorldOriginalityIssues, worldManifestOriginalityIssues } from './world-originality'
import { worldGenerationManifestSchema } from './schemas'

const request = {
  inspiration: 'Политическая космоопера о торговых городах на движущихся орбитах', genre: 'Научная фантастика', tone: 'Серьёзный',
  characterName: 'Акира', characterConcept: 'Молодой пилот с редким способом навигации', opening: 'Портовый спор', canonMode: 'original' as const,
  contentBoundaries: '', provider: { provider: 'demo' as const, model: 'demo', baseUrl: '', temperature: 0.8 },
  noveltyReferences: [{ name: 'Эфириум', tagline: 'Мир звенящих разломов', premise: 'Эфирный резонанс питает кристаллы и способности.', signatureTerms: ['Резонанс Эфира', 'Осколки Разлома'] }],
}

const manifest = worldGenerationManifestSchema.parse({
  world: { name: 'Эфириум', tagline: 'Эхо Великого Разлома', era: 'После Раскола', overview: 'Акира живёт там, где эфирный резонанс пробуждает кристаллы.', capabilitySystemId: 'ether', capabilityGroups: [{ id: 'pilot', label: 'Навигация пилота' }, { id: 'rare-pilot', label: 'Редкая навигация' }], capabilityTiers: [{ id: 'known', label: 'Известный' }] },
  player: { name: 'Акира', statKeys: [], resourceKeys: [], abilityNames: ['Редкая навигация', 'Пилотирование'], inventory: [] },
  factions: [{ name: 'Орден Эфира', role: 'Хранит кристаллы резонанса' }],
  places: [{ name: 'Эфирная гавань', kind: 'city' }],
  npcs: Array.from({ length: 4 }, (_, index) => ({ name: `NPC ${index}`, role: 'Свидетель', locationName: 'Эфирная гавань', factionNames: [], threatTier: 'dangerous', hidden: index < 2 })),
  legends: Array.from({ length: 10 }, (_, index) => ({ name: `Легенда ${index}`, stage: index < 4 ? 'legendary' : 'notable', lifeStatus: index < 3 ? 'dead' : 'missing', era: `Эра ${index % 3}` })),
  narrative: { processTitles: ['Путь Акиры'], eventTitles: ['Эхо разлома'], threadTitles: ['Кристаллы эфира'], openingLocationName: 'Эфирная гавань', openingNpcNames: ['NPC 0'] },
  interface: { metricIds: [], moduleIds: [] },
})

describe('world originality guard', () => {
  it('selects bounded creative lenses for every generation seed and carries prior-world fingerprints', () => {
    for (let index = 0; index < 64; index += 1) {
      const [system] = conceptAnalystPrompt({ ...request, creativeSeed: `seed-${index}` })
      expect(system.content).toContain('тест замены героя')
      expect(system.content).toContain('Эфириум')
      expect(system.content.match(/Творческие вопросы именно этой генерации/g)).toHaveLength(1)
    }
  })

  it('rejects recycled names, cliché clusters, hero-centric foundations and mirrored systems', () => {
    const issues = worldManifestOriginalityIssues(manifest, request).join(' ')
    expect(issues).toContain('Эфириум')
    expect(issues).toContain('клише')
    expect(issues).toContain('overview')
    expect(issues).toContain('зеркалит')
  })

  it('keeps user-requested motifs legal but catches worlds made only from hero powers', () => {
    const world = demoWorld({ ...request, inspiration: 'Мир эфирных кристаллов и резонанса', noveltyReferences: [] })
    world.world.overview = `Вся история существует ради ${world.player.name}.`
    world.world.mechanics = Array.from({ length: 4 }, (_, index) => ({ name: `Сила ${index}`, description: 'Приём', category: 'power' as const, trigger: 'Активация', effects: ['Эффект'], source: 'Герой', discovered: true, status: 'active' as const }))
    const issues = generatedWorldOriginalityIssues(world, { ...request, inspiration: 'Мир эфирных кристаллов и резонанса', noveltyReferences: [] })
    expect(issues.some((entry) => entry.message.includes('Фундамент мира'))).toBe(true)
    expect(issues.some((entry) => entry.message.includes('только силы'))).toBe(true)
    expect(issues.some((entry) => entry.message.includes('эфир как'))).toBe(false)
  })
})
