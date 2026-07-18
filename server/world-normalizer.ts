import type {
  Ability, AbilityDraft, AbilityProfile, PowerTechnique, PowerTechniqueDraft,
  WorldCapabilitySystem, WorldCapabilitySystemDraft, Campaign, WorldGenerationRequest,
} from '../shared/types.js'
import { updateAbilityRegistry } from '../shared/abilities.js'
import { defaultEventDirectorState, normalizeEventDirectorSettings } from '../shared/event-director.js'
import { normalizeItemRarity, normalizeRarityProfile } from '../shared/rarity.js'
import type { GeneratedWorld } from './schemas.js'

const id = () => crypto.randomUUID()

function materializeCapabilitySystem(draft: WorldCapabilitySystemDraft | undefined, turn: number) {
  if (!draft) return { system: undefined, groupIds: new Map<string, string>(), tierIds: new Map<string, string>() }
  const systemId = draft.id ?? id()
  const groupIds = new Map<string, string>()
  const groups = draft.groups.map((group) => {
    const groupId = group.id ?? id()
    groupIds.set(groupId, groupId)
    groupIds.set(group.label.toLocaleLowerCase('ru-RU'), groupId)
    return { ...group, id: groupId }
  })
  const tierIds = new Map<string, string>()
  const tiers = draft.tiers.map((tier) => {
    const tierId = tier.id ?? id()
    tierIds.set(tierId, tierId)
    tierIds.set(tier.label.toLocaleLowerCase('ru-RU'), tierId)
    return { ...tier, id: tierId }
  })
  return {
    system: { ...draft, id: systemId, groups, tiers, createdTurn: turn, lastChangedTurn: turn } satisfies WorldCapabilitySystem,
    groupIds,
    tierIds,
  }
}

function materializeTechniques(drafts: PowerTechniqueDraft[], turn: number): PowerTechnique[] {
  return drafts.map((technique) => ({
    ...technique,
    id: technique.id ?? id(),
    history: technique.history?.map((entry) => ({ ...entry, id: entry.id ?? id(), turn: entry.turn ?? turn })),
  }))
}

function materializeGeneratedAbility(
  draft: AbilityDraft,
  turn: number,
  system: WorldCapabilitySystem | undefined,
  groupIds: Map<string, string>,
  tierIds: Map<string, string>,
): Ability {
  const abilityId = draft.id ?? id()
  const techniques = materializeTechniques(draft.techniques ?? [], turn)
  const techniqueIds = new Map<string, string>()
  techniques.forEach((technique) => {
    techniqueIds.set(technique.id, technique.id)
    techniqueIds.set(technique.name.toLocaleLowerCase('ru-RU'), technique.id)
  })
  const profile: AbilityProfile | undefined = draft.profile ? {
    ...draft.profile,
    nature: {
      ...draft.profile.nature,
      groupId: groupIds.get(draft.profile.nature.groupId)
        ?? groupIds.get(draft.profile.nature.groupId.toLocaleLowerCase('ru-RU'))
        ?? draft.profile.nature.groupId,
    },
    standing: {
      ...draft.profile.standing,
      systemId: system?.id ?? draft.profile.standing.systemId,
      tierId: tierIds.get(draft.profile.standing.tierId)
        ?? tierIds.get(draft.profile.standing.tierId.toLocaleLowerCase('ru-RU'))
        ?? draft.profile.standing.tierId,
    },
    discovery: {
      ...draft.profile.discovery,
      techniqueKnowledge: Object.fromEntries(Object.entries(draft.profile.discovery.techniqueKnowledge).map(([key, value]) => [
        techniqueIds.get(key) ?? techniqueIds.get(key.toLocaleLowerCase('ru-RU')) ?? key,
        value,
      ])),
      evidence: draft.profile.discovery.evidence.map((entry) => ({ ...entry, id: entry.id ?? id(), learnedTurn: entry.learnedTurn ?? turn })),
      updatedTurn: draft.profile.discovery.updatedTurn ?? turn,
    },
    developmentSeeds: draft.profile.developmentSeeds.map((seed) => ({
      ...seed,
      id: seed.id ?? id(),
      evidence: seed.evidence.map((entry) => ({ ...entry, id: entry.id ?? id(), turn: entry.turn ?? turn })),
    })),
  } : undefined
  return {
    ...draft,
    id: abilityId,
    techniques,
    evolutionPaths: (draft.evolutionPaths ?? []).map((path) => ({ ...path, id: path.id ?? id() })),
    history: (draft.history ?? []).map((entry) => ({ ...entry, id: entry.id ?? id(), turn: entry.turn ?? turn })),
    profile,
  }
}

export function normalizeWorld(generated: GeneratedWorld, request: WorldGenerationRequest): Campaign {
  const timestamp = new Date().toISOString()
  const playerId = id()
  const npcIds = new Map<string, string>(generated.npcs.map((npc) => [npc.name.toLocaleLowerCase('ru-RU'), id()]))
  const placeIds = new Map<string, string>(generated.world.places.map((place) => [place.name.toLocaleLowerCase('ru-RU'), id()]))
  const processIds = new Map<string, string>(generated.world.processes.map((process) => [process.title.toLocaleLowerCase('ru-RU'), id()]))
  const legendIds = new Map<string, string>(generated.world.legends.map((legend) => [legend.name.toLocaleLowerCase('ru-RU'), id()]))
  const eventIds = new Map<string, string>(generated.worldEvents.map((event) => [event.title.toLocaleLowerCase('ru-RU'), id()]))
  const threadIds = new Map<string, string>(generated.threads.map((thread) => [thread.title.toLocaleLowerCase('ru-RU'), id()]))
  const causalIds = new Map([...processIds, ...eventIds, ...threadIds])
  const capability = materializeCapabilitySystem(generated.world.capabilitySystem, 0)
  const npcs = generated.npcs.map((npc) => {
    const abilities = npc.abilities.map((ability) => materializeGeneratedAbility(ability, 0, capability.system, capability.groupIds, capability.tierIds))
    const { dossier, ...profile } = npc
    const knownAbilityNames = new Set(dossier?.revealedAbilityNames.map((name) => name.toLocaleLowerCase('ru-RU')) ?? [])
    return {
      ...profile,
      id: npcIds.get(npc.name.toLocaleLowerCase('ru-RU'))!,
      status: 'active' as const,
      abilities,
      knowledge: npc.knowledge.map((fact) => ({ ...fact, id: id() })),
      initiative: { ...npc.initiative, lastAdvancedTurn: 0 },
      strategy: { ...npc.strategy, lastUpdatedTurn: 0 },
      dossier: dossier ? {
        familiarity: dossier.familiarity,
        revealedSections: [...new Set(dossier.revealedSections)],
        revealedStatKeys: [...new Set(dossier.revealedStatKeys)],
        revealedResourceKeys: [...new Set(dossier.revealedResourceKeys)],
        revealedAbilityIds: abilities.filter((ability) => knownAbilityNames.has(ability.name.toLocaleLowerCase('ru-RU'))).map((ability) => ability.id),
        evidence: dossier.evidence.map((entry) => ({ ...entry, id: id(), learnedTurn: 0 })),
        updatedTurn: 0,
      } : undefined,
      statusEffects: [],
    }
  })
  const entityId = (name: string) => name.toLocaleLowerCase('ru-RU') === generated.player.name.toLocaleLowerCase('ru-RU')
    ? playerId
    : npcIds.get(name.toLocaleLowerCase('ru-RU'))
  const presentNpcIds = generated.opening.scene.presentNpcNames
    .map((name) => npcIds.get(name.toLocaleLowerCase('ru-RU')))
    .filter((candidate): candidate is string => Boolean(candidate))
  const legends = generated.world.legends.map((legend) => {
    const {
      characterName, relatedNpcNames, successorNpcNames, deeds, myths, legacies,
      currentState, emergence, discovery, ...profile
    } = legend
    const { locationName, ...legendCurrentState } = currentState
    return {
      ...profile,
      id: legendIds.get(legend.name.toLocaleLowerCase('ru-RU'))!,
      characterId: characterName ? entityId(characterName) : undefined,
      relatedNpcIds: relatedNpcNames.map(entityId).filter((candidate): candidate is string => Boolean(candidate)),
      successorNpcIds: successorNpcNames.map(entityId).filter((candidate): candidate is string => Boolean(candidate)),
      deeds: deeds.map(({ scopeNames, ...deed }) => ({
        ...deed,
        id: id(),
        scopeIds: scopeNames.map((name) => placeIds.get(name.toLocaleLowerCase('ru-RU'))).filter((candidate): candidate is string => Boolean(candidate)),
      })),
      myths: myths.map((myth) => ({ ...myth, id: id() })),
      legacies: legacies.map(({ holderNpcNames, scopeNames, ...legacy }) => ({
        ...legacy,
        id: id(),
        holderNpcIds: holderNpcNames.map(entityId).filter((candidate): candidate is string => Boolean(candidate)),
        scopeIds: scopeNames.map((name) => placeIds.get(name.toLocaleLowerCase('ru-RU'))).filter((candidate): candidate is string => Boolean(candidate)),
      })),
      currentState: {
        ...legendCurrentState,
        locationId: locationName ? placeIds.get(locationName.toLocaleLowerCase('ru-RU')) : undefined,
        lastUpdatedTurn: 0,
      },
      emergence: { ...emergence, lastEvaluatedTurn: 0 },
      discovery: {
        ...discovery,
        evidence: discovery.evidence.map((entry) => ({ ...entry, id: id(), learnedTurn: 0 })),
        updatedTurn: 0,
      },
      createdTurn: 0,
      lastChangedTurn: 0,
    }
  })
  const playerAbilities = generated.player.abilities.map((ability) => materializeGeneratedAbility(ability, 0, capability.system, capability.groupIds, capability.tierIds))
  let abilityRegistry = playerAbilities.reduce(
    (registry, ability) => updateAbilityRegistry(registry, ability, playerId, 'player', 'active', 0),
    [] as Campaign['abilityRegistry'],
  )
  npcs.forEach((npc) => {
    npc.abilities.forEach((ability) => {
      abilityRegistry = updateAbilityRegistry(abilityRegistry, ability, npc.id, 'npc', 'active', 0)
    })
  })

  return {
    id: id(),
    title: generated.title,
    createdAt: timestamp,
    updatedAt: timestamp,
    turn: 0,
    world: {
      ...generated.world,
      capabilitySystem: capability.system,
      presentation: {
        ...generated.world.presentation,
        rarityLabels: {
          ...generated.world.presentation.rarityLabels,
          exceptional: generated.world.presentation.rarityLabels.exceptional ?? 'Исключительный',
          mythic: generated.world.presentation.rarityLabels.mythic ?? 'Мифический',
          transcendent: generated.world.presentation.rarityLabels.transcendent ?? 'Трансцендентный',
        },
      },
      factions: generated.world.factions.map((faction) => ({ ...faction, id: id(), lastChangedTurn: 0 })),
      places: generated.world.places.map(({ parentName, ...place }) => ({
        ...place,
        id: placeIds.get(place.name.toLocaleLowerCase('ru-RU'))!,
        parentId: parentName ? placeIds.get(parentName.toLocaleLowerCase('ru-RU')) : undefined,
        createdTurn: 0,
        lastChangedTurn: 0,
      })),
      processes: generated.world.processes.map(({ scopeNames, causeTitles, ...process }) => ({
        ...process,
        id: processIds.get(process.title.toLocaleLowerCase('ru-RU'))!,
        scopeIds: scopeNames.map((name) => placeIds.get(name.toLocaleLowerCase('ru-RU'))).filter((candidate): candidate is string => Boolean(candidate)),
        causeIds: causeTitles?.map((title) => causalIds.get(title.toLocaleLowerCase('ru-RU'))).filter((candidate): candidate is string => Boolean(candidate)),
        createdTurn: 0,
        lastAdvancedTurn: 0,
      })),
      legendarium: { ...generated.world.legendarium, updatedTurn: 0 },
      legends,
      chronicle: [],
      routes: generated.world.routes.map((route) => ({ ...route, id: id() })),
      laws: generated.world.laws.map((law) => ({ ...law, id: id(), createdTurn: 0, lastChangedTurn: 0 })),
      mechanics: generated.world.mechanics.map((mechanic) => ({ ...mechanic, id: id(), createdTurn: 0, lastChangedTurn: 0 })),
      interfaceModules: generated.world.interfaceModules.map((module) => ({ ...module, createdTurn: 0, lastChangedTurn: 0 })),
      interfaceBlueprint: generated.world.interfaceBlueprint ? { ...generated.world.interfaceBlueprint, updatedTurn: 0 } : undefined,
      metrics: generated.world.metrics?.map((metric) => ({ ...metric, lastChangedTurn: 0 })),
      calendar: { day: 1, label: generated.opening.scene.time },
    },
    player: {
      ...generated.player,
      id: playerId,
      level: 1,
      abilities: playerAbilities,
      conditions: [],
      statusEffects: [],
      lifeState: 'active',
    },
    inventory: generated.inventory.map((item) => {
      const maxDurability = item.maxDurability
      const durability = item.durability === undefined ? undefined : Math.max(0, Math.min(item.durability, maxDurability ?? 100_000))
      const maxCharges = item.maxCharges
      const charges = item.charges === undefined ? undefined : Math.max(0, Math.min(item.charges, maxCharges ?? 1_000_000))
      const state = item.state === 'sealed' ? item.state
        : durability !== undefined && durability <= 0 ? 'broken' as const
          : charges !== undefined && maxCharges !== undefined && charges <= 0 ? 'depleted' as const
            : item.state ?? (durability !== undefined && maxDurability !== undefined && durability < maxDurability ? 'damaged' as const : durability !== undefined || charges !== undefined ? 'intact' as const : undefined)
      const normalizedItem = normalizeItemRarity({
        ...item,
        rarityProfile: normalizeRarityProfile(item.rarityProfile),
        durability,
        maxDurability,
        charges,
        maxCharges,
        state,
        id: id(),
        discoveredTurn: 0,
        history: item.history.map((entry) => ({ ...entry, id: id(), turn: 0 })),
        artifact: item.artifact ? {
          ...item.artifact,
          powers: item.artifact.powers.map((power) => ({
            ...power,
            id: id(),
            techniques: materializeTechniques(power.techniques, 0),
          })),
          components: item.artifact.components.map((component) => ({ ...component, id: id() })),
          evolutionPaths: item.artifact.evolutionPaths.map((path) => ({ ...path, id: id() })),
        } : undefined,
      })
      return normalizedItem
    }),
    npcs,
    socialLinks: generated.socialLinks.flatMap((link) => {
      const fromNpcId = npcIds.get(link.fromNpcName.toLocaleLowerCase('ru-RU'))
      const toNpcId = npcIds.get(link.toNpcName.toLocaleLowerCase('ru-RU'))
      return fromNpcId && toNpcId ? [{ id: id(), fromNpcId, toNpcId, kind: link.kind, label: link.label, score: link.score, secret: link.secret, notes: link.notes }] : []
    }),
    threads: generated.threads.map(({ participantNames, scopeNames, causeTitles, ...thread }) => ({
      id: threadIds.get(thread.title.toLocaleLowerCase('ru-RU'))!,
      type: thread.type,
      title: thread.title,
      detail: thread.detail,
      participantIds: participantNames.map(entityId).filter((candidate): candidate is string => Boolean(candidate)),
      status: thread.status,
      dueTurn: thread.dueTurn,
      secret: thread.secret,
      scale: thread.scale,
      scopeIds: scopeNames?.map((name) => placeIds.get(name.toLocaleLowerCase('ru-RU'))).filter((candidate): candidate is string => Boolean(candidate)),
      causeIds: causeTitles?.map((title) => causalIds.get(title.toLocaleLowerCase('ru-RU'))).filter((candidate): candidate is string => Boolean(candidate)),
      createdTurn: 0,
      lastChangedTurn: 0,
    })),
    worldEvents: generated.worldEvents.map(({ involvedNpcNames, scopeNames, causeTitles, ...event }) => ({
      id: eventIds.get(event.title.toLocaleLowerCase('ru-RU'))!,
      title: event.title,
      description: event.description,
      dueTurn: event.dueTurn,
      dueDay: event.dueDay,
      status: 'scheduled' as const,
      visibility: event.visibility,
      scale: event.scale,
      consequences: event.consequences,
      involvedIds: involvedNpcNames.map(entityId).filter((candidate): candidate is string => Boolean(candidate)),
      scopeIds: scopeNames?.map((name) => placeIds.get(name.toLocaleLowerCase('ru-RU'))).filter((candidate): candidate is string => Boolean(candidate)),
      causeIds: causeTitles?.map((title) => causalIds.get(title.toLocaleLowerCase('ru-RU'))).filter((candidate): candidate is string => Boolean(candidate)),
      createdTurn: 0,
      lastChangedTurn: 0,
    })),
    factionReputation: generated.factionReputation,
    documents: [],
    archives: [],
    partyMemberIds: [],
    partyRoles: {},
    characterArcs: generated.characterArcs.map((arc) => {
      const { ownerName, ...rest } = arc
      return { ...rest, id: id(), ownerId: entityId(ownerName)!, lastAdvancedTurn: 0 }
    }),
    mysteryCases: generated.mysteryCases.map((mystery) => {
      const { culpritName, ...rest } = mystery
      return {
        ...rest, id: id(), culpritId: culpritName ? entityId(culpritName) : undefined, status: 'open' as const,
        clues: mystery.clues.map((clue) => ({ ...clue, id: id() })), createdTurn: 0,
      }
    }),
    antagonistPlans: generated.antagonistPlans.map((plan) => {
      const { ownerName, ...rest } = plan
      return {
        ...rest, id: id(), ownerNpcId: npcIds.get(ownerName.toLocaleLowerCase('ru-RU'))!,
        steps: plan.steps.map((step) => ({ ...step, id: id() })), lastAdvancedTurn: 0,
      }
    }),
    worldPressures: generated.worldPressures.map((pressure) => {
      const { sourceNpcName, targetNames, ...rest } = pressure
      return {
        ...rest,
        id: id(),
        sourceNpcId: sourceNpcName ? npcIds.get(sourceNpcName.toLocaleLowerCase('ru-RU')) : undefined,
        targetIds: targetNames.map(entityId).filter((candidate): candidate is string => Boolean(candidate)),
        measures: pressure.measures.map((measure) => ({ ...measure, id: id() })),
        createdTurn: 0,
        lastAdvancedTurn: 0,
      }
    }),
    influenceAssets: generated.influenceAssets.map((asset) => {
      const { holderName, targetName, ...rest } = asset
      return {
        ...rest, id: id(), holderId: entityId(holderName)!, targetId: targetName ? entityId(targetName) : undefined, acquiredTurn: 0,
      }
    }),
    quests: generated.quests.map((quest) => ({
      ...quest,
      id: id(),
      status: 'active' as const,
      objectives: quest.objectives.map((text) => ({ id: id(), text, completed: false })),
      createdTurn: 0,
      lastChangedTurn: 0,
    })),
    lore: generated.lore.map((entry) => ({ ...entry, id: id(), enabled: true })),
    memories: [
      {
        id: id(), kind: 'fact', content: `Цель героя: ${generated.player.goal}`, tags: [generated.player.name, 'цель'],
        importance: 95, turn: 0, createdAt: timestamp,
      },
      {
        id: id(), kind: 'summary', content: generated.world.overview, tags: [generated.world.name, generated.world.genre],
        importance: 90, turn: 0, createdAt: timestamp,
      },
    ],
    timeline: [{ id: id(), turn: 0, title: generated.opening.scene.title, description: 'Кампания началась.', category: 'story', createdAt: timestamp }],
    messages: [{
      id: id(), role: 'assistant', content: generated.opening.narrative, suggestions: generated.opening.suggestions,
      activeLoreIds: [], recalledMemoryIds: [], changeSummary: [], turn: 0, createdAt: timestamp,
    }],
    scene: {
      title: generated.opening.scene.title,
      location: generated.opening.scene.location,
      time: generated.opening.scene.time,
      weather: generated.opening.scene.weather,
      tension: generated.opening.scene.tension,
      presentNpcIds,
    },
    pacing: {
      ...generated.opening.pacing,
      consecutivePressureTurns: ['rising', 'challenge', 'climax'].includes(generated.opening.pacing.beat) ? 1 : 0,
      lastRespiteTurn: generated.opening.pacing.beat === 'respite' ? 0 : undefined,
      lastPeakTurn: ['severe', 'legendary', 'mythic'].includes(generated.opening.pacing.challengeTier) ? 0 : undefined,
      updatedTurn: 0,
    },
    settings: {
      responseLength: 'adaptive',
      playerAgency: 'strict',
      difficulty: 'balanced',
      canonMode: request.canonMode,
      autoApplyChanges: true,
      contentBoundaries: request.contentBoundaries,
      authorsNote: 'Живые NPC, ясная причинность, конкретные детали и полная свобода решений игрока.',
      resolutionMode: 'hidden',
      contextProfile: 'million',
      qualityMode: 'deep',
      scenePace: 'balanced',
      proseStyle: 'literary',
      dialogueDensity: 'balanced',
      npcAutonomy: 'independent',
      worldDynamics: 'living',
      eventDirector: normalizeEventDirectorSettings(),
    },
    eventDirectorState: defaultEventDirectorState(0),
    abilityRegistry,
    snapshots: [],
  }
}
