import { describe, expect, it } from 'vitest'
import { demoWorld } from '../server/demo'
import { assessLegendEcology, assessStrongCharacterEcology, LEGEND_ECOLOGY_TARGETS, STRONG_CHARACTER_TARGETS } from './legend-ecology'

describe('legend ecology', () => {
  it('accepts a diverse roster with hidden, historical, emerging and unresolved figures', () => {
    const world = demoWorld({
      inspiration: 'Эйдол', genre: 'Фэнтези', tone: 'Серьёзный', characterName: 'Эрен',
      characterConcept: 'Искатель', opening: 'Пограничный квартал', canonMode: 'original', contentBoundaries: '',
      provider: { provider: 'demo', model: 'demo', baseUrl: '', temperature: 0.8 },
    })
    const assessment = assessLegendEcology(world.world.legends)
    expect(assessment.healthy).toBe(true)
    expect(assessment.counts.total).toBeGreaterThanOrEqual(LEGEND_ECOLOGY_TARGETS.total)
    expect(assessment.counts.concealed).toBeGreaterThanOrEqual(LEGEND_ECOLOGY_TARGETS.concealed)
    expect(assessment.counts.distinctPowerDomains).toBeGreaterThanOrEqual(LEGEND_ECOLOGY_TARGETS.distinctPowerDomains)
    const strongCharacters = assessStrongCharacterEcology(world.npcs)
    expect(strongCharacters.healthy).toBe(true)
    expect(strongCharacters.counts.total).toBeGreaterThanOrEqual(STRONG_CHARACTER_TARGETS.total)
    expect(strongCharacters.counts.concealed).toBeGreaterThanOrEqual(STRONG_CHARACTER_TARGETS.concealed)
  })

  it('reports exact deficits instead of inventing missing figures', () => {
    const source = demoWorld({
      inspiration: 'Эйдол', genre: 'Фэнтези', tone: 'Серьёзный', characterName: 'Эрен',
      characterConcept: 'Искатель', opening: 'Пограничный квартал', canonMode: 'original', contentBoundaries: '',
      provider: { provider: 'demo', model: 'demo', baseUrl: '', temperature: 0.8 },
    }).world.legends[0]
    const assessment = assessLegendEcology([source])
    expect(assessment.healthy).toBe(false)
    expect(assessment.deficits).toEqual(expect.arrayContaining([
      { key: 'total', current: 1, target: 10 },
      expect.objectContaining({ key: 'concealed' }),
      expect.objectContaining({ key: 'emerging' }),
    ]))
  })
})
