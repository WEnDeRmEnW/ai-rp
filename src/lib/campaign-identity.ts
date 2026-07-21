import type { Campaign } from '../../shared/types'

function usableId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/**
 * IndexedDB stores campaigns by their inline `id` key. Keep that identity stable
 * for existing campaigns and create an app-owned id only when recovering a
 * genuinely keyless record (for example, one left by an older client build).
 */
export function ensureCampaignIdentity(value: unknown, requiredId?: string): Campaign {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Кампанию нельзя сохранить: получен некорректный объект.')
  }

  const campaign = value as Campaign
  const id = usableId(requiredId)
    ? requiredId
    : usableId(campaign.id)
      ? campaign.id
      : crypto.randomUUID()

  return campaign.id === id ? campaign : { ...campaign, id }
}

/**
 * Cloud conflict resolution compares campaign timestamps. Several settings can
 * be changed inside the same millisecond, so Date.now() alone can make a newer
 * local edit indistinguishable from the previous one. Keep every mutation
 * strictly newer than the campaign it was based on.
 */
export function nextCampaignUpdatedAt(previous?: string, now = Date.now()): string {
  const previousTime = previous ? Date.parse(previous) : Number.NaN
  return new Date(Math.max(now, Number.isFinite(previousTime) ? previousTime + 1 : now)).toISOString()
}
