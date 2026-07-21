import type { Campaign, WorldNoveltyReference } from '../../shared/types'

const compact = (value: string | undefined, max: number) => (value ?? '').replace(/\s+/gu, ' ').trim().slice(0, max)

export function buildWorldNoveltyReferences(campaigns: Campaign[]): WorldNoveltyReference[] {
  const seen = new Set<string>()
  return [...campaigns]
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
    .flatMap((campaign) => {
      const name = compact(campaign.world.name || campaign.title, 160)
      const key = name.toLocaleLowerCase('ru-RU')
      if (!name || seen.has(key)) return []
      seen.add(key)
      const signatureTerms = [
        campaign.world.system?.name,
        campaign.world.capabilitySystem?.title,
        ...(campaign.world.capabilitySystem?.groups ?? []).map((group) => group.label),
        ...campaign.world.rules.slice(0, 4),
      ].map((value) => compact(value, 240)).filter(Boolean).slice(0, 16)
      return [{
        name,
        tagline: compact(campaign.world.tagline, 240) || 'Без отдельного слогана',
        premise: compact(campaign.world.overview || campaign.world.inspiration, 1200),
        signatureTerms,
      }]
    })
    .slice(0, 12)
}
