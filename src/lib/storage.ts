import { openDB, type DBSchema } from 'idb'
import type { Campaign, InventoryItem, PowerTechnique, Resource, ResourceKind, StatusEffect } from '../../shared/types'
import { normalizeEventDirectorSettings, normalizeEventDirectorState } from '../../shared/event-director'
import { normalizeItemRarity, normalizeRarityProfile } from '../../shared/rarity'
import { normalizeArtifactDiscovery, updateArtifactRegistry } from '../../shared/artifacts'
import { updateAbilityRegistry } from '../../shared/abilities'
import { separatePersonalAbilities } from '../../shared/ability-ownership'
import { isMutationOperationName } from '../../shared/mutation-operations'
import { ensureCampaignIdentity } from './campaign-identity'

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

function recoverNpcName(campaign: Campaign, npcId: string, currentName: string): string {
  if (!isMutationOperationName(currentName)) return currentName
  for (let index = (campaign.snapshots ?? []).length - 1; index >= 0; index -= 1) {
    const previous = campaign.snapshots[index]?.npcs?.find((npc) => npc.id === npcId)
    if (previous?.name?.trim() && !isMutationOperationName(previous.name)) return previous.name.trim()
  }
  return currentName
}

function inferResourceKind(resource: Pick<Resource, 'key' | 'label' | 'aliases'>): ResourceKind {
  const value = [resource.key, resource.label, ...(resource.aliases ?? [])].join(' ').toLocaleLowerCase('ru-RU')
  if (/(^|\W)(health|hp|hit points?)(\W|$)|здоров|жизн(?:ь|и|ей)/u.test(value)) return 'health'
  if (/stamina|endurance|вынослив|усталост/u.test(value)) return 'stamina'
  if (/mana|мана/u.test(value)) return 'mana'
  if (/focus|фокус|концентрац/u.test(value)) return 'focus'
  if (/sanity|рассуд|безуми|стабильност.*ума/u.test(value)) return 'sanity'
  if (/morale|морал|боевой дух/u.test(value)) return 'morale'
  if (/hunger|голод|сытост/u.test(value)) return 'hunger'
  if (/ammo|ammunition|боеприпас|патрон|стрел/u.test(value)) return 'ammo'
  if (/charges?|заряд(?:ы|ов|а)?/u.test(value)) return 'charges'
  if (/energy|энерги|эфир|чакр|\bки\b|\bци\b/u.test(value)) return 'energy'
  return 'custom'
}

function migrateStatusEffects(effects: StatusEffect[] | undefined): StatusEffect[] {
  const finiteRecord = (record: Record<string, number> | undefined) => record
    ? Object.fromEntries(Object.entries(record).filter(([key, value]) => key.trim() && Number.isFinite(value)).slice(0, 24))
    : undefined
  return (effects ?? []).map((effect) => {
    const duration = effect.duration ?? { unit: 'indefinite' as const }
    return {
      ...effect,
      severity: clamp(Number.isFinite(effect.severity) ? effect.severity : 0, 0, 100),
      stacks: clamp(Math.round(Number.isFinite(effect.stacks) ? effect.stacks : 1), 1, 999),
      effects: effect.effects ?? [],
      resourceDeltasPerTurn: finiteRecord(effect.resourceDeltasPerTurn),
      checkModifiers: finiteRecord(effect.checkModifiers),
      duration: {
        ...duration,
        remaining: Number.isFinite(duration.remaining) ? Math.max(0, Math.round(duration.remaining ?? 0)) : undefined,
        expiresTurn: Number.isFinite(duration.expiresTurn) ? Math.max(0, Math.round(duration.expiresTurn ?? 0)) : undefined,
      },
      appliedTurn: Math.max(0, Math.round(Number.isFinite(effect.appliedTurn) ? effect.appliedTurn : 0)),
    }
  })
}

function migratePowerTechniques(techniques: PowerTechnique[] | undefined): PowerTechnique[] {
  return (techniques ?? []).slice(-48).map((technique) => ({
    ...technique,
    id: technique.id || crypto.randomUUID(),
    mastery: clamp(Number.isFinite(technique.mastery) ? technique.mastery : 0, 0, 100),
    costs: technique.costs ?? [],
    effects: technique.effects ?? [],
    requirements: technique.requirements ?? [],
    limitations: technique.limitations ?? [],
  }))
}

function migrateItem(item: InventoryItem, turn: number): InventoryItem {
  const maxDurability = Number.isFinite(item.maxDurability) ? Math.max(0, item.maxDurability ?? 0) : undefined
  const durability = Number.isFinite(item.durability) ? clamp(item.durability ?? 0, 0, maxDurability ?? 1_000_000) : undefined
  const maxCharges = Number.isFinite(item.maxCharges) ? Math.max(0, item.maxCharges ?? 0) : undefined
  const charges = Number.isFinite(item.charges) ? clamp(item.charges ?? 0, 0, maxCharges ?? 1_000_000) : undefined
  const state = item.state === 'sealed'
    ? item.state
    : durability !== undefined && durability <= 0
      ? 'broken'
      : charges !== undefined && maxCharges !== undefined && charges <= 0
        ? 'depleted'
        : item.state ?? (durability !== undefined && maxDurability !== undefined && durability < maxDurability ? 'damaged' : durability !== undefined || charges !== undefined ? 'intact' : undefined)
  const normalized = normalizeItemRarity({
    ...item,
    rarityProfile: item.rarityProfile ? normalizeRarityProfile(item.rarityProfile) : undefined,
    maxDurability, durability, maxCharges, charges, state,
  })
  if (!normalized.artifact) return normalized
  const artifact = normalized.artifact
  const migrated: InventoryItem = {
    ...normalized,
    history: normalized.history ?? [],
    artifact: {
      ...artifact,
      creativeIdentity: artifact.creativeIdentity ? {
        ...artifact.creativeIdentity,
        conceptualDomains: artifact.creativeIdentity.conceptualDomains ?? [],
        mechanicVerbs: artifact.creativeIdentity.mechanicVerbs ?? [],
        motifs: artifact.creativeIdentity.motifs ?? [],
        differentiation: artifact.creativeIdentity.differentiation ?? [],
        relatedArtifactIds: artifact.creativeIdentity.relatedArtifactIds ?? [],
      } : undefined,
      presentation: artifact.presentation ? {
        ...artifact.presentation,
        sectionOrder: artifact.presentation.sectionOrder ?? [],
      } : undefined,
      requirements: artifact.requirements ?? [],
      passiveEffects: artifact.passiveEffects ?? [],
      combinedEffects: artifact.combinedEffects ?? [],
      failureModes: artifact.failureModes ?? [],
      components: artifact.components ?? [],
      powers: (artifact.powers ?? []).map((power) => ({
        ...power,
        costs: power.costs ?? [],
        limitations: power.limitations ?? [],
        capabilities: power.capabilities ?? [],
        synergies: power.synergies ?? [],
        counters: power.counters ?? [],
        examples: power.examples ?? [],
        techniques: migratePowerTechniques(power.techniques),
      })),
      drawbacks: artifact.drawbacks ?? [],
      evolutionPaths: artifact.evolutionPaths ?? [],
      secrets: artifact.secrets ?? [],
    },
  }
  if (migrated.artifact) {
    migrated.artifact.discovery = normalizeArtifactDiscovery(migrated.artifact.discovery, migrated, turn)
  }
  return migrated
}

interface LetopisDB extends DBSchema {
  campaigns: {
    key: string
    value: Campaign
    indexes: { 'by-updated': string }
  }
  'campaigns-v2': {
    key: string
    value: Campaign
    indexes: { 'by-updated': string }
  }
  'campaign-owners': {
    key: string
    value: { campaignId: string; ownerId: string; updatedAt: string }
    indexes: { 'by-owner': string }
  }
}

const dbPromise = openDB<LetopisDB>('letopis-rp', 3, {
  upgrade(db) {
    if (!db.objectStoreNames.contains('campaigns-v2')) {
      const store = db.createObjectStore('campaigns-v2', { keyPath: 'id' })
      store.createIndex('by-updated', 'updatedAt')
    }
    if (!db.objectStoreNames.contains('campaign-owners')) {
      const owners = db.createObjectStore('campaign-owners', { keyPath: 'campaignId' })
      owners.createIndex('by-owner', 'ownerId')
    }
  },
})

export async function getCampaigns(): Promise<Campaign[]> {
  const db = await dbPromise
  const current = (await db.getAll('campaigns-v2')).map((campaign) => ensureCampaignIdentity(campaign))

  // Version 1 used `campaigns`. Copy its records once, using their primary
  // keys to repair records whose inline id was lost or whose old keyPath was
  // different. Clear the legacy store only after every copy has succeeded.
  if (db.objectStoreNames.contains('campaigns')) {
    const [legacyRecords, legacyKeys] = await Promise.all([
      db.getAll('campaigns'),
      db.getAllKeys('campaigns'),
    ])
    const legacy = legacyRecords.map((campaign, index) => ensureCampaignIdentity(
      campaign,
      typeof legacyKeys[index] === 'string' ? legacyKeys[index] : undefined,
    ))
    await Promise.all(legacy.map((campaign) => db.put('campaigns-v2', campaign)))
    if (legacy.length) await db.clear('campaigns')
    current.push(...legacy)
  }

  const unique = new Map<string, Campaign>()
  current.forEach((campaign) => {
    const previous = unique.get(campaign.id)
    if (!previous || campaign.updatedAt.localeCompare(previous.updatedAt) >= 0) unique.set(campaign.id, campaign)
  })
  return [...unique.values()].map(migrateCampaign).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function migrateCampaign(campaign: Campaign): Campaign {
  const inventory = campaign.inventory.map((rawItem) => migrateItem(rawItem, campaign.turn))
  const normalizedPlayerAbilities = campaign.player.abilities.map((ability) => ({
    ...ability,
    costs: ability.costs ?? [],
    effects: ability.effects ?? [],
    limitations: ability.limitations ?? [],
    requirements: ability.requirements ?? [],
    evolutionPaths: ability.evolutionPaths ?? [],
    history: ability.history ?? [],
    tags: ability.tags ?? [],
    capabilities: ability.capabilities ?? [],
    synergies: ability.synergies ?? [],
    counters: ability.counters ?? [],
    examples: ability.examples ?? [],
    techniques: migratePowerTechniques(ability.techniques),
  }))
  const separatedPlayerAbilities = separatePersonalAbilities(normalizedPlayerAbilities, inventory)
  let artifactRegistry = structuredClone(campaign.artifactRegistry ?? [])
  for (const item of inventory) {
    if (!item.artifact) continue
    artifactRegistry = updateArtifactRegistry(artifactRegistry, item, 'active', campaign.turn)
  }
  let abilityRegistry = structuredClone(campaign.abilityRegistry ?? [])
  for (const { ability } of separatedPlayerAbilities.itemOwned) {
    abilityRegistry = updateAbilityRegistry(abilityRegistry, ability, campaign.player.id, 'player', 'removed', campaign.turn)
  }
  for (const ability of separatedPlayerAbilities.personal) {
    abilityRegistry = updateAbilityRegistry(abilityRegistry, ability, campaign.player.id, 'player', 'active', campaign.turn)
  }
  for (const npc of campaign.npcs) {
    for (const ability of npc.abilities ?? []) {
      abilityRegistry = updateAbilityRegistry(abilityRegistry, ability, npc.id, 'npc', 'active', campaign.turn)
    }
  }
  return {
    ...campaign,
    world: {
      ...campaign.world,
      routes: campaign.world.routes ?? [],
      laws: (campaign.world.laws ?? []).map((law) => ({
        ...law,
        consequences: law.consequences ?? [],
        createdTurn: Math.max(0, Math.round(Number.isFinite(law.createdTurn) ? law.createdTurn : 0)),
        lastChangedTurn: Math.max(0, Math.round(Number.isFinite(law.lastChangedTurn) ? law.lastChangedTurn : 0)),
      })),
      mechanics: (campaign.world.mechanics ?? []).map((mechanic) => ({
        ...mechanic,
        effects: mechanic.effects ?? [],
        createdTurn: Math.max(0, Math.round(Number.isFinite(mechanic.createdTurn) ? mechanic.createdTurn : 0)),
        lastChangedTurn: Math.max(0, Math.round(Number.isFinite(mechanic.lastChangedTurn) ? mechanic.lastChangedTurn : 0)),
      })),
      interfaceModules: (campaign.world.interfaceModules ?? []).map((module) => ({
        ...module,
        priority: clamp(Number.isFinite(module.priority) ? module.priority : 50, 0, 100),
        elements: (module.elements ?? []).map((element) => ({ ...element, links: element.links ?? [] })),
        createdTurn: Math.max(0, Math.round(Number.isFinite(module.createdTurn) ? module.createdTurn : 0)),
        lastChangedTurn: Math.max(0, Math.round(Number.isFinite(module.lastChangedTurn) ? module.lastChangedTurn : 0)),
      })),
      factions: (campaign.world.factions ?? []).map((faction) => ({
        ...faction,
        power: Number.isFinite(faction.power) ? clamp(faction.power ?? 0, 0, 100) : undefined,
        territory: faction.territory ?? [],
        resources: faction.resources ?? [],
        goals: faction.goals ?? [],
        secrets: faction.secrets ?? [],
      })),
    },
    player: {
      ...campaign.player,
      stats: (campaign.player.stats ?? []).map((stat) => ({ ...stat, aliases: stat.aliases ?? [] })),
      resources: (campaign.player.resources ?? []).map((resource) => ({
        ...resource,
        aliases: resource.aliases ?? [],
        kind: resource.kind ?? inferResourceKind(resource),
      })),
      conditions: campaign.player.conditions ?? [],
      statusEffects: migrateStatusEffects(campaign.player.statusEffects),
      lifeState: campaign.player.lifeState ?? 'active',
      currency: campaign.player.currency ?? {},
      abilities: separatedPlayerAbilities.personal,
    },
    inventory,
    artifactRegistry,
    abilityRegistry,
    npcs: campaign.npcs.map((npc) => ({
      ...npc,
      name: recoverNpcName(campaign, npc.id, npc.name),
      stats: (npc.stats ?? []).map((stat) => ({ ...stat, aliases: stat.aliases ?? [] })),
      resources: (npc.resources ?? []).map((resource) => ({ ...resource, aliases: resource.aliases ?? [], kind: resource.kind ?? inferResourceKind(resource) })),
      statusEffects: migrateStatusEffects(npc.statusEffects),
      knowledge: npc.knowledge ?? [],
      abilities: (npc.abilities ?? []).map((ability) => ({
        ...ability,
        costs: ability.costs ?? [],
        effects: ability.effects ?? [],
        limitations: ability.limitations ?? [],
        requirements: ability.requirements ?? [],
        evolutionPaths: ability.evolutionPaths ?? [],
        history: ability.history ?? [],
        tags: ability.tags ?? [],
        capabilities: ability.capabilities ?? [],
        synergies: ability.synergies ?? [],
        counters: ability.counters ?? [],
        examples: ability.examples ?? [],
        techniques: migratePowerTechniques(ability.techniques),
      })),
      strategy: npc.strategy ? {
        ...npc.strategy,
        observedPlayerPatterns: npc.strategy.observedPlayerPatterns ?? [],
        strengths: npc.strategy.strengths ?? [],
        blindSpots: npc.strategy.blindSpots ?? [],
        contingencies: npc.strategy.contingencies ?? [],
        retreatConditions: npc.strategy.retreatConditions?.slice(-12),
        ethicalLimits: npc.strategy.ethicalLimits?.slice(-12),
        learnedAdaptations: npc.strategy.learnedAdaptations?.slice(-16),
        countermeasures: npc.strategy.countermeasures?.slice(-16).map((countermeasure) => ({
          ...countermeasure,
          requirements: countermeasure.requirements ?? [],
          tradeoffs: countermeasure.tradeoffs ?? [],
        })),
      } : undefined,
      recruitment: npc.recruitment ? {
        ...npc.recruitment,
        willingness: clamp(npc.recruitment.willingness, 0, 100),
        requirements: (npc.recruitment.requirements ?? []).map((entry) => entry.trim()).filter(Boolean).slice(0, 12),
      } : undefined,
      threatProfile: npc.threatProfile ? {
        ...npc.threatProfile,
        whyDangerous: npc.threatProfile.whyDangerous ?? [],
        knownFeats: npc.threatProfile.knownFeats ?? [],
        constraints: npc.threatProfile.constraints ?? [],
        defeatRequirements: npc.threatProfile.defeatRequirements ?? [],
        escalationTriggers: npc.threatProfile.escalationTriggers ?? [],
      } : undefined,
      dossier: npc.dossier ? {
        ...npc.dossier,
        revealedSections: [...new Set(npc.dossier.revealedSections ?? [])],
        revealedStatKeys: [...new Set(npc.dossier.revealedStatKeys ?? [])],
        revealedResourceKeys: [...new Set(npc.dossier.revealedResourceKeys ?? [])],
        revealedAbilityIds: [...new Set(npc.dossier.revealedAbilityIds ?? [])],
        evidence: (npc.dossier.evidence ?? []).slice(-60),
      } : undefined,
    })),
    socialLinks: campaign.socialLinks ?? [],
    threads: campaign.threads ?? [],
    worldEvents: campaign.worldEvents ?? [],
    factionReputation: campaign.factionReputation ?? [],
    documents: campaign.documents ?? [],
    archives: campaign.archives ?? [],
    partyMemberIds: campaign.partyMemberIds ?? [],
    partyRoles: campaign.partyRoles ?? {},
    characterArcs: campaign.characterArcs ?? [],
    mysteryCases: campaign.mysteryCases ?? [],
    antagonistPlans: campaign.antagonistPlans ?? [],
    worldPressures: (campaign.worldPressures ?? []).map((pressure) => ({
      ...pressure,
      targetIds: pressure.targetIds ?? [],
      knowledge: pressure.knowledge ?? [],
      signs: pressure.signs ?? [],
      measures: (pressure.measures ?? []).map((measure) => ({
        ...measure,
        effects: measure.effects ?? [],
        counterplay: measure.counterplay ?? [],
        tradeoffs: measure.tradeoffs ?? [],
      })),
      counterplay: pressure.counterplay ?? [],
      deescalationConditions: pressure.deescalationConditions ?? [],
    })),
    influenceAssets: campaign.influenceAssets ?? [],
    eventDirectorState: normalizeEventDirectorState(campaign.eventDirectorState, campaign.turn),
    pacing: campaign.pacing ? {
      ...campaign.pacing,
      intensity: clamp(campaign.pacing.intensity, 0, 100),
      consecutivePressureTurns: Math.max(0, Math.round(campaign.pacing.consecutivePressureTurns ?? 0)),
      updatedTurn: Math.max(0, Math.round(campaign.pacing.updatedTurn ?? campaign.turn)),
    } : undefined,
    activeConflict: campaign.activeConflict ? {
      ...campaign.activeConflict,
      round: Math.max(1, Math.round(campaign.activeConflict.round)),
      terrain: campaign.activeConflict.terrain ?? [],
      hazards: campaign.activeConflict.hazards ?? [],
      victoryConditions: campaign.activeConflict.victoryConditions ?? [],
      failureConsequences: campaign.activeConflict.failureConsequences ?? [],
      escapeRoutes: campaign.activeConflict.escapeRoutes ?? [],
      telegraphs: campaign.activeConflict.telegraphs ?? [],
      participants: (campaign.activeConflict.participants ?? []).map((participant) => ({
        ...participant,
        readiness: clamp(participant.readiness, 0, 100),
        morale: clamp(participant.morale, 0, 100),
        advantages: participant.advantages ?? [],
        vulnerabilities: participant.vulnerabilities ?? [],
      })),
    } : undefined,
    settings: {
      ...campaign.settings,
      responseLength: campaign.settings.responseLength ?? 'adaptive',
      resolutionMode: campaign.settings.resolutionMode ?? 'hidden',
      contextProfile: campaign.settings.contextProfile ?? 'million',
      qualityMode: campaign.settings.qualityMode ?? 'balanced',
      scenePace: campaign.settings.scenePace ?? 'balanced',
      proseStyle: campaign.settings.proseStyle ?? 'literary',
      dialogueDensity: campaign.settings.dialogueDensity ?? 'balanced',
      npcAutonomy: campaign.settings.npcAutonomy ?? 'independent',
      worldDynamics: campaign.settings.worldDynamics ?? 'living',
      eventDirector: normalizeEventDirectorSettings(campaign.settings.eventDirector),
    },
    snapshots: (campaign.snapshots ?? []).map((snapshot) => {
      let snapshotRegistry = structuredClone(snapshot.abilityRegistry ?? [])
      for (const ability of snapshot.player.abilities) {
        snapshotRegistry = updateAbilityRegistry(snapshotRegistry, ability, snapshot.player.id, 'player', 'active', snapshot.turn)
      }
      for (const npc of snapshot.npcs) {
        for (const ability of npc.abilities ?? []) {
          snapshotRegistry = updateAbilityRegistry(snapshotRegistry, ability, npc.id, 'npc', 'active', snapshot.turn)
        }
      }
      return { ...snapshot, abilityRegistry: snapshotRegistry }
    }),
  }
}

export async function getCampaignsForOwner(ownerId: string): Promise<Campaign[]> {
  const [campaigns, db] = await Promise.all([getCampaigns(), dbPromise])
  const owners = new Map((await db.getAll('campaign-owners')).map((entry) => [entry.campaignId, entry.ownerId]))
  return campaigns.filter((campaign) => (owners.get(campaign.id) || 'guest') === ownerId)
}

export async function claimGuestCampaigns(ownerId: string): Promise<void> {
  const [campaigns, db] = await Promise.all([getCampaigns(), dbPromise])
  const owners = new Map((await db.getAll('campaign-owners')).map((entry) => [entry.campaignId, entry.ownerId]))
  const now = new Date().toISOString()
  await Promise.all(campaigns
    .filter((campaign) => !owners.has(campaign.id) || owners.get(campaign.id) === 'guest')
    .map((campaign) => db.put('campaign-owners', { campaignId: campaign.id, ownerId, updatedAt: now })))
}

export async function setCampaignOwner(campaignId: string, ownerId: string): Promise<void> {
  await (await dbPromise).put('campaign-owners', { campaignId, ownerId, updatedAt: new Date().toISOString() })
}

export async function saveCampaign(campaign: Campaign, ownerId?: string): Promise<Campaign> {
  // Normalise on every write, not only after a reload. This makes model-authored
  // item changes (including an inflated rarity) immediately consistent in UI,
  // IndexedDB and cloud sync.
  const safeCampaign = migrateCampaign(ensureCampaignIdentity(campaign))
  const db = await dbPromise
  await db.put('campaigns-v2', safeCampaign)
  if (ownerId) await db.put('campaign-owners', { campaignId: safeCampaign.id, ownerId, updatedAt: new Date().toISOString() })
  return safeCampaign
}

export async function deleteCampaign(id: string): Promise<void> {
  const db = await dbPromise
  await db.delete('campaigns-v2', id)
  await db.delete('campaign-owners', id)
  if (db.objectStoreNames.contains('campaigns')) await db.delete('campaigns', id)
}

export async function clearCampaigns(): Promise<void> {
  const db = await dbPromise
  await db.clear('campaigns-v2')
  await db.clear('campaign-owners')
  if (db.objectStoreNames.contains('campaigns')) await db.clear('campaigns')
}

export function downloadCampaign(campaign: Campaign) {
  const blob = new Blob([JSON.stringify({ format: 'letopis-campaign', version: 1, campaign }, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${campaign.title.replace(/[^\p{L}\p{N}_-]+/gu, '_') || 'campaign'}.letopis.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

export function downloadCampaignBook(campaign: Campaign) {
  const lines = [
    `# ${campaign.title}`,
    '',
    `> ${campaign.world.tagline}`,
    '',
    `Мир: ${campaign.world.name} · Герой: ${campaign.player.name} · Ходов: ${campaign.turn}`,
    '',
    ...campaign.messages.flatMap((message) => message.role === 'assistant'
      ? [`## Ход ${message.turn}`, '', message.content, '']
      : [`**${campaign.player.name}:** ${message.content}`, '']),
    '---',
    '',
    '## Архив глав',
    '',
    ...(campaign.archives ?? []).flatMap((archive) => [`### ${archive.title} (${archive.startTurn}–${archive.endTurn})`, '', archive.summary, '']),
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${campaign.title.replace(/[^\p{L}\p{N}_-]+/gu, '_') || 'campaign'}_книга.md`
  anchor.click()
  URL.revokeObjectURL(url)
}

export async function readCampaignFile(file: File): Promise<Campaign> {
  if (file.size > 250 * 1024 * 1024) throw new Error('Файл слишком большой. Максимум — 250 МБ.')
  const data = JSON.parse(await file.text())
  const campaign = data?.format === 'letopis-campaign' ? data.campaign : data
  if (!campaign || typeof campaign !== 'object' || typeof campaign.id !== 'string' || !Array.isArray(campaign.messages) || !campaign.world || !campaign.player) {
    throw new Error('Это не файл кампании «Летописи».')
  }
  return migrateCampaign(campaign as Campaign)
}
