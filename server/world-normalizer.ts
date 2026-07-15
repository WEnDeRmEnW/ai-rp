import type { Campaign, WorldGenerationRequest } from '../shared/types.js'
import { rarityFromKnownCopies } from '../shared/rarity.js'
import type { GeneratedWorld } from './schemas.js'

const id = () => crypto.randomUUID()

export function normalizeWorld(generated: GeneratedWorld, request: WorldGenerationRequest): Campaign {
  const timestamp = new Date().toISOString()
  const playerId = id()
  const npcIds = new Map<string, string>(generated.npcs.map((npc) => [npc.name.toLocaleLowerCase('ru-RU'), id()]))
  const placeIds = new Map<string, string>(generated.world.places.map((place) => [place.name.toLocaleLowerCase('ru-RU'), id()]))
  const npcs = generated.npcs.map((npc) => ({
    ...npc,
    id: npcIds.get(npc.name.toLocaleLowerCase('ru-RU'))!,
    status: 'active' as const,
    abilities: npc.abilities.map((ability) => ({
      ...ability,
      id: id(),
      techniques: ability.techniques.map((technique) => ({ ...technique, id: id() })),
      evolutionPaths: ability.evolutionPaths.map((path) => ({ ...path, id: id() })),
      history: ability.history.map((entry) => ({ ...entry, id: id(), turn: 0 })),
    })),
    knowledge: npc.knowledge.map((fact) => ({ ...fact, id: id() })),
    initiative: { ...npc.initiative, lastAdvancedTurn: 0 },
    strategy: { ...npc.strategy, lastUpdatedTurn: 0 },
    statusEffects: [],
  }))
  const entityId = (name: string) => name.toLocaleLowerCase('ru-RU') === generated.player.name.toLocaleLowerCase('ru-RU')
    ? playerId
    : npcIds.get(name.toLocaleLowerCase('ru-RU'))
  const presentNpcIds = generated.opening.scene.presentNpcNames
    .map((name) => npcIds.get(name.toLocaleLowerCase('ru-RU')))
    .filter((candidate): candidate is string => Boolean(candidate))

  return {
    id: id(),
    title: generated.title,
    createdAt: timestamp,
    updatedAt: timestamp,
    turn: 0,
    world: {
      ...generated.world,
      factions: generated.world.factions.map((faction) => ({ ...faction, id: id(), lastChangedTurn: 0 })),
      places: generated.world.places.map(({ parentName, ...place }) => ({
        ...place,
        id: placeIds.get(place.name.toLocaleLowerCase('ru-RU'))!,
        parentId: parentName ? placeIds.get(parentName.toLocaleLowerCase('ru-RU')) : undefined,
        createdTurn: 0,
        lastChangedTurn: 0,
      })),
      processes: generated.world.processes.map(({ scopeNames, ...process }) => ({
        ...process,
        id: id(),
        scopeIds: scopeNames.map((name) => placeIds.get(name.toLocaleLowerCase('ru-RU'))).filter((candidate): candidate is string => Boolean(candidate)),
        createdTurn: 0,
        lastAdvancedTurn: 0,
      })),
      routes: generated.world.routes.map((route) => ({ ...route, id: id() })),
      laws: generated.world.laws.map((law) => ({ ...law, id: id(), createdTurn: 0, lastChangedTurn: 0 })),
      mechanics: generated.world.mechanics.map((mechanic) => ({ ...mechanic, id: id(), createdTurn: 0, lastChangedTurn: 0 })),
      interfaceModules: generated.world.interfaceModules.map((module) => ({ ...module, createdTurn: 0, lastChangedTurn: 0 })),
      calendar: { day: 1, label: generated.opening.scene.time },
    },
    player: {
      ...generated.player,
      id: playerId,
      level: 1,
      abilities: generated.player.abilities.map((ability) => ({
        ...ability,
        id: id(),
        techniques: ability.techniques.map((technique) => ({ ...technique, id: id() })),
        evolutionPaths: ability.evolutionPaths.map((path) => ({ ...path, id: id() })),
        history: ability.history.map((entry) => ({ ...entry, id: id(), turn: 0 })),
      })),
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
      return {
        ...item,
        rarity: rarityFromKnownCopies(item.rarity, item.rarityProfile.knownCopies),
        rarityProfile: { ...item.rarityProfile, acquisitionRisk: Math.max(0, Math.min(100, item.rarityProfile.acquisitionRisk)) },
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
            techniques: power.techniques.map((technique) => ({ ...technique, id: id() })),
          })),
          components: item.artifact.components.map((component) => ({ ...component, id: id() })),
          evolutionPaths: item.artifact.evolutionPaths.map((path) => ({ ...path, id: id() })),
        } : undefined,
      }
    }),
    npcs,
    socialLinks: generated.socialLinks.flatMap((link) => {
      const fromNpcId = npcIds.get(link.fromNpcName.toLocaleLowerCase('ru-RU'))
      const toNpcId = npcIds.get(link.toNpcName.toLocaleLowerCase('ru-RU'))
      return fromNpcId && toNpcId ? [{ id: id(), fromNpcId, toNpcId, kind: link.kind, label: link.label, score: link.score, secret: link.secret, notes: link.notes }] : []
    }),
    threads: generated.threads.map((thread) => ({
      id: id(),
      type: thread.type,
      title: thread.title,
      detail: thread.detail,
      participantIds: thread.participantNames.map(entityId).filter((candidate): candidate is string => Boolean(candidate)),
      status: thread.status,
      dueTurn: thread.dueTurn,
      secret: thread.secret,
      createdTurn: 0,
    })),
    worldEvents: generated.worldEvents.map((event) => ({
      id: id(),
      title: event.title,
      description: event.description,
      dueTurn: event.dueTurn,
      dueDay: event.dueDay,
      status: 'scheduled' as const,
      visibility: event.visibility,
      involvedIds: event.involvedNpcNames.map(entityId).filter((candidate): candidate is string => Boolean(candidate)),
      createdTurn: 0,
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
    settings: {
      responseLength: 'balanced',
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
    },
    snapshots: [],
  }
}
