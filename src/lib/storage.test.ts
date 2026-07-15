import 'fake-indexeddb/auto'
import { deleteDB, openDB } from 'idb'
import { describe, expect, it } from 'vitest'
import type { Campaign } from '../../shared/types'
import { createDemoCampaign } from './demo'

describe('campaign IndexedDB storage', () => {
  it('migrates a legacy keyPath and saves a campaign whose inline id was missing', async () => {
    await deleteDB('letopis-rp')
    const legacyDb = await openDB('letopis-rp', 1, {
      upgrade(db) {
        const store = db.createObjectStore('campaigns', { keyPath: 'legacyKey' })
        store.createIndex('by-updated', 'updatedAt')
      },
    })
    const legacyRecord = { ...createDemoCampaign(), id: undefined, legacyKey: 'legacy-campaign' }
    await legacyDb.put('campaigns', legacyRecord)
    legacyDb.close()

    const storage = await import('./storage')
    const campaigns = await storage.getCampaigns()
    expect(campaigns).toHaveLength(1)
    expect(campaigns[0].id).toBe('legacy-campaign')

    const keyless = { ...campaigns[0], id: undefined } as unknown as Campaign
    const saved = await storage.saveCampaign(keyless)
    expect(saved.id).toEqual(expect.any(String))
    expect(saved.id.length).toBeGreaterThan(0)

    const upgradedDb = await openDB('letopis-rp', 2)
    const migratedRecords = await upgradedDb.getAll('campaigns-v2')
    expect(migratedRecords.some((record) => record.id === 'legacy-campaign')).toBe(true)
    expect(migratedRecords.some((record) => record.id === saved.id)).toBe(true)
    expect(await upgradedDb.count('campaigns')).toBe(0)
    upgradedDb.close()
  })
})
