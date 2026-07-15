import type { NPC, NPCDossierSection } from '../../shared/types'

const familiarityLabels = {
  recognized: 'Знакомое лицо',
  acquainted: 'Поверхностное знакомство',
  familiar: 'Хорошо знаком',
  close: 'Близко знаком',
  expert: 'Подробно изучен',
} as const

export function getNpcDisclosure(npc: NPC) {
  const dossier = npc.dossier
  const sections = new Set<NPCDossierSection>(dossier?.revealedSections ?? [])
  const has = (section: NPCDossierSection) => sections.has(section)
  const statKeys = new Set(dossier?.revealedStatKeys ?? [])
  const resourceKeys = new Set(dossier?.revealedResourceKeys ?? [])
  const abilityIds = new Set(dossier?.revealedAbilityIds ?? [])

  return {
    dossier,
    has,
    familiarityLabel: dossier ? familiarityLabels[dossier.familiarity] : familiarityLabels.recognized,
    stats: has('stats') ? npc.stats ?? [] : (npc.stats ?? []).filter((stat) => statKeys.has(stat.key)),
    resources: has('resources') ? npc.resources ?? [] : (npc.resources ?? []).filter((resource) => resourceKeys.has(resource.key)),
    abilities: has('abilities') ? npc.abilities ?? [] : (npc.abilities ?? []).filter((ability) => abilityIds.has(ability.id)),
    conditions: has('conditions') ? (npc.statusEffects ?? []).filter((effect) => !effect.hidden) : [],
    evidence: (dossier?.evidence ?? []).slice().sort((a, b) => b.learnedTurn - a.learnedTurn),
  }
}

