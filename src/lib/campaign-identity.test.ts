import { describe, expect, it } from 'vitest'
import type { Campaign } from '../../shared/types'
import { ensureCampaignIdentity, nextCampaignUpdatedAt } from './campaign-identity'
import { createDemoCampaign } from './demo'

describe('campaign identity', () => {
  it('restores a missing IndexedDB key without changing campaign data', () => {
    const campaign = createDemoCampaign()
    const keyless: Partial<Campaign> = structuredClone(campaign)
    delete keyless.id
    const repaired = ensureCampaignIdentity(keyless)

    expect(repaired.id).toEqual(expect.any(String))
    expect(repaired.id.length).toBeGreaterThan(0)
    expect(repaired.title).toBe(campaign.title)
    expect(repaired.messages).toEqual(campaign.messages)
  })

  it('preserves the identity of an existing campaign during updates', () => {
    const campaign = createDemoCampaign()
    const accidentallyReplaced = { ...campaign, id: '' }
    const repaired = ensureCampaignIdentity(accidentallyReplaced, campaign.id)

    expect(repaired.id).toBe(campaign.id)
  })

  it('rejects values that are not campaign objects before IndexedDB sees them', () => {
    expect(() => ensureCampaignIdentity(undefined)).toThrow('некорректный объект')
    expect(() => ensureCampaignIdentity([])).toThrow('некорректный объект')
  })

  it('gives rapid consecutive edits strictly increasing cloud timestamps', () => {
    const previous = '2026-07-21T12:00:00.123Z'
    expect(nextCampaignUpdatedAt(previous, Date.parse(previous))).toBe('2026-07-21T12:00:00.124Z')
    expect(nextCampaignUpdatedAt(previous, Date.parse(previous) + 10)).toBe('2026-07-21T12:00:00.133Z')
  })
})
