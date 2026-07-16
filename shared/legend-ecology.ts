import type { LegendLifeStatus, LegendStage, ThreatTier, WorldVisibility } from './types.js'

export const LEGEND_ECOLOGY_TARGETS = {
  total: 10,
  highStage: 4,
  concealed: 3,
  historical: 3,
  emerging: 2,
  unresolved: 4,
  encounterable: 3,
  distinctEras: 3,
  distinctPowerDomains: 8,
} as const

type EcologyLegend = {
  stage: LegendStage
  lifeStatus: LegendLifeStatus
  era: string
  discovery: { visibility: WorldVisibility }
  powerStanding?: { domains: string[] }
  currentState: { encounterReadiness: number; encounterConditions: string[] }
}

export type LegendEcologyKey = keyof typeof LEGEND_ECOLOGY_TARGETS

export interface LegendEcologyAssessment {
  healthy: boolean
  counts: Record<LegendEcologyKey, number>
  targets: typeof LEGEND_ECOLOGY_TARGETS
  deficits: Array<{ key: LegendEcologyKey; current: number; target: number }>
}

export const STRONG_CHARACTER_TARGETS = {
  total: 4,
  concealed: 2,
  eliteOrHigher: 2,
} as const

type StrongCharacter = {
  threatProfile?: { tier: ThreatTier; visibility: WorldVisibility }
}

export type StrongCharacterEcologyKey = keyof typeof STRONG_CHARACTER_TARGETS

export interface StrongCharacterEcologyAssessment {
  healthy: boolean
  counts: Record<StrongCharacterEcologyKey, number>
  targets: typeof STRONG_CHARACTER_TARGETS
  deficits: Array<{ key: StrongCharacterEcologyKey; current: number; target: number }>
}

const historicalStatuses = new Set<LegendLifeStatus>(['dead', 'ascended'])
const unresolvedStatuses = new Set<LegendLifeStatus>(['living', 'returned', 'missing', 'sealed', 'dormant', 'unknown'])
const highStages = new Set<LegendStage>(['legendary', 'mythic'])
const emergingStages = new Set<LegendStage>(['notable', 'renowned'])

function normalizedDistinct(values: string[]) {
  return new Set(values.map((value) => value.trim().toLocaleLowerCase('ru-RU')).filter(Boolean)).size
}

/**
 * Measures whether a campaign contains a real ecology of exceptional figures instead of
 * one isolated celebrity. Hidden figures are counted internally but never exposed by this helper.
 */
export function assessLegendEcology(legends: EcologyLegend[]): LegendEcologyAssessment {
  const counts: Record<LegendEcologyKey, number> = {
    total: legends.length,
    highStage: legends.filter((legend) => highStages.has(legend.stage)).length,
    concealed: legends.filter((legend) => legend.discovery.visibility === 'hidden').length,
    historical: legends.filter((legend) => historicalStatuses.has(legend.lifeStatus)).length,
    emerging: legends.filter((legend) => emergingStages.has(legend.stage)).length,
    unresolved: legends.filter((legend) => unresolvedStatuses.has(legend.lifeStatus)).length,
    encounterable: legends.filter((legend) => legend.currentState.encounterReadiness > 0 && legend.currentState.encounterConditions.length > 0).length,
    distinctEras: normalizedDistinct(legends.map((legend) => legend.era)),
    distinctPowerDomains: normalizedDistinct(legends.flatMap((legend) => legend.powerStanding?.domains ?? [])),
  }
  const deficits = (Object.keys(LEGEND_ECOLOGY_TARGETS) as LegendEcologyKey[])
    .filter((key) => counts[key] < LEGEND_ECOLOGY_TARGETS[key])
    .map((key) => ({ key, current: counts[key], target: LEGEND_ECOLOGY_TARGETS[key] }))
  return { healthy: deficits.length === 0, counts, targets: LEGEND_ECOLOGY_TARGETS, deficits }
}

/** Counts fully simulated dangerous NPCs separately from culturally legendary figures. */
export function assessStrongCharacterEcology(characters: StrongCharacter[]): StrongCharacterEcologyAssessment {
  const tierRank: Record<ThreatTier, number> = { minor: 0, capable: 1, dangerous: 2, elite: 3, legendary: 4, mythic: 5 }
  const strong = characters.filter((character) => character.threatProfile && tierRank[character.threatProfile.tier] >= 2)
  const counts: Record<StrongCharacterEcologyKey, number> = {
    total: strong.length,
    concealed: strong.filter((character) => character.threatProfile?.visibility === 'hidden').length,
    eliteOrHigher: strong.filter((character) => character.threatProfile && tierRank[character.threatProfile.tier] >= 3).length,
  }
  const deficits = (Object.keys(STRONG_CHARACTER_TARGETS) as StrongCharacterEcologyKey[])
    .filter((key) => counts[key] < STRONG_CHARACTER_TARGETS[key])
    .map((key) => ({ key, current: counts[key], target: STRONG_CHARACTER_TARGETS[key] }))
  return { healthy: deficits.length === 0, counts, targets: STRONG_CHARACTER_TARGETS, deficits }
}
