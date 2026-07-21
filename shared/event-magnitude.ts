import type { NarrativeEventDomain, NarrativeEventMagnitude } from './types.js'

export interface NarrativeEventMagnitudeContract {
  rank: number
  label: string
  shortLabel: string
  promise: string
  minDomains: number
  minMandatoryEffects: number
  minPersistentEffects: number
  minObservableSigns: number
  minCounterplay: number
  minScopes: number
  minCauses: number
  surpriseThreshold: number
  chargeCost: number
  aftermathDelay: number
  categoryCooldown: number
  requiredDomainGroups: NarrativeEventDomain[][]
}

/**
 * This is the factual power scale of narrative events. The values are deliberately
 * shared by validation, prompts and UI so a tier can never be only a decorative label.
 */
export const narrativeEventMagnitudeContracts: Record<NarrativeEventMagnitude, NarrativeEventMagnitudeContract> = {
  subtle: {
    rank: 0,
    label: 'Тонкое событие',
    shortLabel: 'Тонкое',
    promise: 'Небольшой, но конкретный сдвиг в одной части текущей сцены.',
    minDomains: 1,
    minMandatoryEffects: 1,
    minPersistentEffects: 0,
    minObservableSigns: 1,
    minCounterplay: 0,
    minScopes: 0,
    minCauses: 0,
    surpriseThreshold: 45,
    chargeCost: 28,
    aftermathDelay: 3,
    categoryCooldown: 8,
    requiredDomainGroups: [],
  },
  notable: {
    rank: 1,
    label: 'Примечательное событие',
    shortLabel: 'Примечательное',
    promise: 'Заметно меняет сцену и оставляет хотя бы одно проверяемое последствие.',
    minDomains: 1,
    minMandatoryEffects: 1,
    minPersistentEffects: 0,
    minObservableSigns: 1,
    minCounterplay: 0,
    minScopes: 0,
    minCauses: 0,
    surpriseThreshold: 58,
    chargeCost: 40,
    aftermathDelay: 4,
    categoryCooldown: 10,
    requiredDomainGroups: [],
  },
  rare: {
    rank: 2,
    label: 'Редкое событие',
    shortLabel: 'Редкое',
    promise: 'Необычный поворот, связывающий несколько сущностей и сохраняющийся после сцены.',
    minDomains: 2,
    minMandatoryEffects: 2,
    minPersistentEffects: 1,
    minObservableSigns: 2,
    minCounterplay: 1,
    minScopes: 1,
    minCauses: 1,
    surpriseThreshold: 68,
    chargeCost: 55,
    aftermathDelay: 5,
    categoryCooldown: 12,
    requiredDomainGroups: [],
  },
  major: {
    rank: 3,
    label: 'Крупное событие',
    shortLabel: 'Крупное',
    promise: 'Меняет ход арки, несколько областей состояния и создаёт длительное давление.',
    minDomains: 3,
    minMandatoryEffects: 3,
    minPersistentEffects: 1,
    minObservableSigns: 2,
    minCounterplay: 1,
    minScopes: 1,
    minCauses: 1,
    surpriseThreshold: 75,
    chargeCost: 68,
    aftermathDelay: 7,
    categoryCooldown: 14,
    requiredDomainGroups: [],
  },
  epic: {
    rank: 4,
    label: 'Эпическое событие',
    shortLabel: 'Эпическое',
    promise: 'Перенаправляет большую арку и заставляет несколько сил мира независимо реагировать.',
    minDomains: 4,
    minMandatoryEffects: 4,
    minPersistentEffects: 2,
    minObservableSigns: 3,
    minCounterplay: 2,
    minScopes: 1,
    minCauses: 1,
    surpriseThreshold: 84,
    chargeCost: 80,
    aftermathDelay: 9,
    categoryCooldown: 18,
    requiredDomainGroups: [
      ['world-event', 'world-pressure', 'process', 'faction', 'place', 'legend', 'lore'],
    ],
  },
  legendary: {
    rank: 5,
    label: 'Легендарное событие',
    shortLabel: 'Легендарное',
    promise: 'Становится исторической вехой: меняет крупные силы мира и оставляет наследие.',
    minDomains: 5,
    minMandatoryEffects: 5,
    minPersistentEffects: 2,
    minObservableSigns: 3,
    minCounterplay: 2,
    minScopes: 2,
    minCauses: 1,
    surpriseThreshold: 90,
    chargeCost: 90,
    aftermathDelay: 12,
    categoryCooldown: 24,
    requiredDomainGroups: [
      ['world-event', 'world-pressure', 'process', 'faction', 'place', 'legend', 'lore'],
    ],
  },
  mythic: {
    rank: 6,
    label: 'Мифическое событие',
    shortLabel: 'Мифическое',
    promise: 'Необратимо меняет эпоху или устройство мира и порождает собственные легенды.',
    minDomains: 6,
    minMandatoryEffects: 7,
    minPersistentEffects: 3,
    minObservableSigns: 4,
    minCounterplay: 3,
    minScopes: 2,
    minCauses: 2,
    surpriseThreshold: 98,
    chargeCost: 100,
    aftermathDelay: 18,
    categoryCooldown: 40,
    requiredDomainGroups: [
      ['world-event', 'world-pressure'],
      ['process', 'faction', 'place', 'legend', 'lore', 'world-rule', 'law', 'mechanic'],
    ],
  },
  transcendent: {
    rank: 7,
    label: 'Трансцендентное событие',
    shortLabel: 'Трансцендентное',
    promise: 'Меняет фундаментальный закон реальности и навсегда делит историю мира на «до» и «после».',
    minDomains: 8,
    minMandatoryEffects: 10,
    minPersistentEffects: 5,
    minObservableSigns: 5,
    minCounterplay: 4,
    minScopes: 3,
    minCauses: 2,
    surpriseThreshold: 100,
    chargeCost: 100,
    aftermathDelay: 28,
    categoryCooldown: 64,
    requiredDomainGroups: [
      ['law', 'mechanic', 'world-rule'],
      ['world-event'],
      ['world-pressure', 'process', 'faction', 'place', 'legend', 'lore'],
    ],
  },
}

export const narrativeEventMagnitudeOrder = (Object.keys(narrativeEventMagnitudeContracts) as NarrativeEventMagnitude[])
  .sort((left, right) => narrativeEventMagnitudeContracts[left].rank - narrativeEventMagnitudeContracts[right].rank)

export function narrativeEventMagnitudeAtLeast(
  magnitude: NarrativeEventMagnitude,
  minimum: NarrativeEventMagnitude,
) {
  return narrativeEventMagnitudeContracts[magnitude].rank >= narrativeEventMagnitudeContracts[minimum].rank
}

export function narrativeEventMagnitudePromptContract() {
  return narrativeEventMagnitudeOrder.map((magnitude) => {
    const contract = narrativeEventMagnitudeContracts[magnitude]
    const domainGroups = contract.requiredDomainGroups.length
      ? `; обязательные группы областей: ${contract.requiredDomainGroups.map((group) => `[${group.join('|')}]`).join(' + ')}`
      : ''
    return `- ${magnitude} (${contract.shortLabel}): ${contract.promise} При manifest: affectedDomains>=${contract.minDomains}, обязательных последствий>=${contract.minMandatoryEffects}, постоянных обязательных>=${contract.minPersistentEffects}, observableSigns>=${contract.minObservableSigns}, counterplay>=${contract.minCounterplay}, scopeIds>=${contract.minScopes}, causeIds>=${contract.minCauses}${domainGroups}.`
  }).join('\n')
}
