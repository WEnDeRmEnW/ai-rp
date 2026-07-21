import { describe, expect, it } from 'vitest'
import { createDemoCampaign } from './demo'
import { buildWorldNoveltyReferences } from './world-novelty'

describe('world novelty references', () => {
  it('sends only compact world fingerprints and keeps the newest unique worlds', () => {
    const older = createDemoCampaign()
    older.world.name = 'Эфириум'
    older.updatedAt = '2026-01-01T00:00:00.000Z'
    const newer = structuredClone(older)
    newer.id = 'new-world-id'
    newer.world.name = 'Город приливных архивов'
    newer.world.overview = 'Мир общественных архивов, приливной логистики и выборных смотрителей.'.repeat(30)
    newer.updatedAt = '2026-02-01T00:00:00.000Z'

    const references = buildWorldNoveltyReferences([older, newer])

    expect(references.map((entry) => entry.name)).toEqual(['Город приливных архивов', 'Эфириум'])
    expect(references[0].premise.length).toBeLessThanOrEqual(1200)
    expect(references[0].signatureTerms.length).toBeLessThanOrEqual(16)
    expect(JSON.stringify(references)).not.toContain('messages')
  })
})
