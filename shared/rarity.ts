import type { InventoryItem, ItemRarityProfile, Rarity } from './types.js'

export const rarityOrder: Rarity[] = ['common', 'uncommon', 'rare', 'exceptional', 'epic', 'legendary', 'mythic', 'transcendent']

export interface ItemClassAssessment {
  rarity: Rarity
  score: number
  potency: number
  versatility: number
  worldImpact: number
  provenance: number
  scarcity: number
  acquisitionRisk: number
  limitationPenalty: number
  inferred: boolean
}

export const upperRarityRequirements = {
  mythic: {
    potency: 88,
    worldImpact: 91,
    breadthOrProvenance: 75,
  },
  transcendent: {
    potency: 95,
    worldImpact: 98,
    breadthOrProvenance: 85,
    scarcityOrAcquisitionRisk: 80,
  },
} as const

const clamp = (value: number) => Math.min(100, Math.max(0, value))
const finite = (value: number | undefined) => Number.isFinite(value) ? clamp(value as number) : undefined

function scarcityScore(knownCopies?: number) {
  if (!Number.isFinite(knownCopies)) return 35
  const copies = Math.max(1, Math.floor(knownCopies as number))
  if (copies === 1) return 100
  if (copies <= 5) return 90
  if (copies <= 25) return 76
  if (copies <= 100) return 61
  if (copies <= 1_000) return 42
  if (copies <= 10_000) return 24
  if (copies <= 100_000) return 12
  return 4
}

export function rarityForScore(score: number): Rarity {
  if (score >= 92) return 'transcendent'
  if (score >= 82) return 'mythic'
  if (score >= 72) return 'legendary'
  if (score >= 60) return 'epic'
  if (score >= 48) return 'exceptional'
  if (score >= 34) return 'rare'
  if (score >= 20) return 'uncommon'
  return 'common'
}

/**
 * Scores describe practical value, while the upper classes also carry a semantic
 * promise. A reality-authority with near-absolute potency must not be demoted just
 * because it has several real requirements: those requirements make it usable and
 * interesting, but do not turn it into an ordinary mythic trinket.
 */
function rarityForAssessment(
  score: number,
  dimensions: Pick<ItemClassAssessment, 'potency' | 'versatility' | 'worldImpact' | 'provenance' | 'scarcity' | 'acquisitionRisk'>,
): Rarity {
  const { potency, versatility, worldImpact, provenance, scarcity, acquisitionRisk } = dimensions
  const transcendent = upperRarityRequirements.transcendent
  if (
    worldImpact >= transcendent.worldImpact
    && potency >= transcendent.potency
    && Math.max(versatility, provenance) >= transcendent.breadthOrProvenance
    && Math.max(scarcity, acquisitionRisk) >= transcendent.scarcityOrAcquisitionRisk
  ) return 'transcendent'
  const mythic = upperRarityRequirements.mythic
  if (
    worldImpact >= mythic.worldImpact
    && potency >= mythic.potency
    && Math.max(versatility, provenance) >= mythic.breadthOrProvenance
  ) return 'mythic'

  // Mythic and transcendent are semantic promises, not just high weighted totals.
  // A rare, dangerous and prestigious object may score extremely well while still
  // lacking epochal power. It remains legendary until its real mechanics satisfy
  // one of the upper-tier contracts above.
  const scored = rarityForScore(score)
  return rarityOrder.indexOf(scored) > rarityOrder.indexOf('legendary') ? 'legendary' : scored
}

export function rarityRequirementDeficits(assessment: ItemClassAssessment, target: Rarity): string[] {
  if (target === 'transcendent') {
    const requirement = upperRarityRequirements.transcendent
    return [
      assessment.potency < requirement.potency ? `potency ${assessment.potency}/${requirement.potency}` : '',
      assessment.worldImpact < requirement.worldImpact ? `worldImpact ${assessment.worldImpact}/${requirement.worldImpact}` : '',
      Math.max(assessment.versatility, assessment.provenance) < requirement.breadthOrProvenance
        ? `versatility или provenance ${Math.max(assessment.versatility, assessment.provenance)}/${requirement.breadthOrProvenance}`
        : '',
      Math.max(assessment.scarcity, assessment.acquisitionRisk) < requirement.scarcityOrAcquisitionRisk
        ? `scarcity или acquisitionRisk ${Math.max(assessment.scarcity, assessment.acquisitionRisk)}/${requirement.scarcityOrAcquisitionRisk}`
        : '',
    ].filter(Boolean)
  }
  if (target === 'mythic') {
    const requirement = upperRarityRequirements.mythic
    return [
      assessment.potency < requirement.potency ? `potency ${assessment.potency}/${requirement.potency}` : '',
      assessment.worldImpact < requirement.worldImpact ? `worldImpact ${assessment.worldImpact}/${requirement.worldImpact}` : '',
      Math.max(assessment.versatility, assessment.provenance) < requirement.breadthOrProvenance
        ? `versatility или provenance ${Math.max(assessment.versatility, assessment.provenance)}/${requirement.breadthOrProvenance}`
        : '',
    ].filter(Boolean)
  }
  const requiredScore = [0, 20, 34, 48, 60, 72][rarityOrder.indexOf(target)]
  return requiredScore !== undefined && assessment.score < requiredScore
    ? [`итоговая сила ${assessment.score}/${requiredScore}`]
    : []
}

function scaleImpact(scale: unknown) {
  const ranks: Record<string, number> = {
    personal: 18, local: 32, regional: 48, national: 62, continental: 72, global: 84, cosmic: 97,
    бытовой: 12, личный: 18, локальный: 32, региональный: 48, мировой: 84, космический: 97,
  }
  return typeof scale === 'string' ? ranks[scale.toLocaleLowerCase('ru-RU')] : undefined
}

function inferDimensions(item: Pick<InventoryItem, 'category' | 'effects' | 'artifact' | 'rarity'>) {
  const powers = item.artifact?.powers ?? []
  const techniqueCount = powers.reduce((sum, power) => sum + (power.techniques?.length ?? 0), 0)
  const capabilityCount = powers.reduce((sum, power) => sum + (power.capabilities?.length ?? 0), 0)
  const mechanicalBreadth = (item.effects?.length ?? 0)
    + powers.length * 2
    + (item.artifact?.passiveEffects?.length ?? 0)
    + (item.artifact?.combinedEffects?.length ?? 0)
  const potency = clamp(10 + (item.effects?.length ?? 0) * 6 + powers.length * 13 + techniqueCount * 3 + capabilityCount * 2)
  const versatility = clamp(8 + mechanicalBreadth * 6 + techniqueCount * 2)
  const worldImpact = scaleImpact(item.artifact?.scale) ?? clamp(12 + powers.length * 9 + (item.artifact?.combinedEffects?.length ?? 0) * 6)
  const provenance = clamp(18 + (item.artifact ? 16 : 0) + (item.artifact?.canonStatus === 'canonical' ? 12 : 0) + (item.artifact?.secrets?.length ?? 0) * 4)
  return { potency, versatility, worldImpact, provenance }
}

/**
 * Produces an integrated item class. A unique trinket can remain merely rare,
 * while a reproducible world-changing device can still be legendary.
 */
export function assessItemRarity(item: Pick<InventoryItem, 'category' | 'effects' | 'artifact' | 'rarity' | 'rarityProfile'>): ItemClassAssessment {
  const profile = item.rarityProfile
  const inferred = inferDimensions(item)
  const potency = finite(profile?.potency) ?? inferred.potency
  const versatility = finite(profile?.versatility) ?? inferred.versatility
  const worldImpact = finite(profile?.worldImpact) ?? inferred.worldImpact
  const provenance = finite(profile?.provenance) ?? inferred.provenance
  const scarcity = scarcityScore(profile?.knownCopies)
  const acquisitionRisk = finite(profile?.acquisitionRisk) ?? 0
  const limitationCount = (profile?.limitations?.length ?? 0) + (item.artifact?.drawbacks?.length ?? 0) + (item.artifact?.requirements?.length ?? 0)
  const limitationPenalty = Math.min(12, limitationCount * 1.5)
  const rawScore = clamp(
    potency * .38
    + worldImpact * .22
    + versatility * .12
    + provenance * .1
    + scarcity * .1
    + acquisitionRisk * .08
    - limitationPenalty,
  )
  // The user sees an integer score, so classifying a hidden 91.6 as mythic while
  // displaying 92/100 is contradictory. Round once and use that same value everywhere.
  const score = Math.round(rawScore)
  const dimensions = {
    potency: Math.round(potency),
    versatility: Math.round(versatility),
    worldImpact: Math.round(worldImpact),
    provenance: Math.round(provenance),
    scarcity: Math.round(scarcity),
    acquisitionRisk: Math.round(acquisitionRisk),
  }
  return {
    rarity: rarityForAssessment(score, dimensions), score, ...dimensions,
    limitationPenalty: Math.round(limitationPenalty),
    inferred: !profile || [profile.potency, profile.versatility, profile.worldImpact, profile.provenance].some((value) => !Number.isFinite(value)),
  }
}

/** Compatibility helper for old integrations. Copy count can move a class only modestly. */
export function rarityFromKnownCopies(fallback: Rarity, knownCopies?: number): Rarity {
  if (!Number.isFinite(knownCopies)) return fallback
  const fallbackScore = [12, 26, 40, 53, 65, 77, 87, 96][Math.max(0, rarityOrder.indexOf(fallback))] ?? 40
  return rarityForScore(fallbackScore * .85 + scarcityScore(knownCopies) * .15)
}

export function normalizeItemRarity<T extends Pick<InventoryItem, 'category' | 'effects' | 'artifact' | 'rarity' | 'rarityProfile'>>(item: T): T & { rarity: Rarity } {
  return { ...item, rarity: assessItemRarity(item).rarity }
}

export function normalizeRarityProfile(profile: ItemRarityProfile): ItemRarityProfile {
  return {
    ...profile,
    acquisitionRisk: clamp(profile.acquisitionRisk),
    potency: finite(profile.potency),
    versatility: finite(profile.versatility),
    worldImpact: finite(profile.worldImpact),
    provenance: finite(profile.provenance),
    limitations: (profile.limitations ?? []).map((value) => value.trim()).filter(Boolean).slice(0, 16),
  }
}
