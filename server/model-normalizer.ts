const ARRAY_KEYS = new Set([
  'rules', 'factions', 'locations', 'mysteries', 'routes', 'places', 'processes', 'legends', 'laws', 'mechanics', 'interfaceModules', 'metrics', 'elements', 'links', 'equipmentSlots', 'accepts',
  'stats', 'resources', 'abilities', 'inventory', 'npcs', 'knowledge', 'socialLinks',
  'worldEvents', 'factionReputation', 'threads', 'quests', 'lore', 'presentNpcNames',
  'presentNpcIds', 'suggestions', 'objectives', 'keys', 'notes', 'effects', 'participantNames',
  'participantIds', 'involvedNpcNames', 'involvedIds', 'signals', 'beats', 'memories',
  'archives', 'issues', 'tags', 'entityIds', 'relationships', 'upsertStats', 'removeStatKeys',
  'upsertResources', 'removeResourceKeys', 'addAbilities', 'removeAbilityIds', 'addConditions',
  'removeConditions', 'addRules', 'removeRules', 'upsertFactions', 'removeFactions',
  'upsertLocations', 'removeLocations', 'addMysteries', 'resolveMysteries', 'upsertRoutes',
  'removeRouteIds', 'upsertPlaces', 'removePlaceIds', 'upsertProcesses', 'retireProcessIds',
  'removeLawIds', 'removeMechanicIds', 'removeInterfaceModuleIds', 'upsertInterfaceModules', 'interfaceModuleChanges', 'upsertElements', 'removeElementIds',
  'upsertMetrics', 'removeMetricIds', 'tabs', 'dashboardSections', 'addNpcIds', 'removeNpcIds', 'events',
  'costs', 'requirements', 'limitations', 'evolutionPaths', 'history', 'powers', 'drawbacks', 'secrets',
  'patterns', 'avoids', 'blockedBy', 'stages', 'turningPoints', 'clues', 'redHerrings',
  'revelationRules', 'steps', 'weaknesses', 'abilityChanges', 'artifactChanges', 'upsertAbilities',
  'addEffects', 'addLimitations', 'addEvolutionPaths', 'unlockEvolutionPathIds',
  'addPowers', 'addDrawbacks', 'upsertCharacterArcs', 'upsertMysteryCases',
  'upsertAntagonistPlans', 'upsertInfluenceAssets', 'removeInfluenceAssetIds',
  'characterArcs', 'mysteryCases', 'antagonistPlans', 'influenceAssets',
  'capabilities', 'synergies', 'counters', 'examples', 'passiveEffects', 'combinedEffects',
  'failureModes', 'components', 'mustPreserve', 'capabilityChecklist', 'forbiddenDistortions',
  'canonicalConstraints', 'adaptationConflicts', 'namingRules', 'uncertainties',
  'originalityRules', 'missingCapabilities', 'coverageAudit', 'constraintAudit', 'entities',
  'addCapabilities', 'addSynergies', 'addCounters', 'addExamples',
  'itemEffects', 'powerChanges', 'componentChanges', 'addComponents',
  'addPassiveEffects', 'addCombinedEffects', 'addFailureModes',
  'aliases', 'statusEffects', 'upsertStatusEffects', 'removeStatusEffectIds', 'removeKnowledgeIds', 'verifiedDomains', 'omissions',
  'observedPlayerPatterns', 'strengths', 'blindSpots', 'contingencies', 'retreatConditions', 'ethicalLimits', 'learnedAdaptations', 'countermeasures', 'tradeoffs',
  'participants', 'terrain', 'hazards', 'advantages', 'vulnerabilities',
  'techniques', 'addTechniques', 'techniqueChanges', 'removeTechniqueIds',
  'worldPressures', 'upsertWorldPressures', 'measures', 'counterplay', 'deescalationConditions',
  'whyDangerous', 'knownFeats', 'constraints', 'defeatRequirements', 'escalationTriggers',
  'victoryConditions', 'failureConsequences', 'escapeRoutes', 'telegraphs', 'targetNames', 'targetIds',
  'upsertFactionReputation', 'upsertLaws', 'upsertMechanics', 'territory', 'goals',
  'revealedSections', 'revealedStatKeys', 'revealedResourceKeys', 'revealedAbilityIds', 'revealedAbilityNames',
  'culture', 'notableFacts', 'scopeIds', 'scopeNames', 'causeIds', 'causeTitles', 'involvedFactionNames',
  'drivers', 'obstacles', 'consequences', 'signs', 'evidence', 'npcIds', 'questIds',
  'npcAbilityChanges', 'narrativeIssues',
  'recognitionRules', 'transmissionChannels', 'distortionForces', 'memoryKeepers', 'erasureForces', 'successionRules', 'encounterRules', 'thresholds',
  'upsertLegends', 'removeLegendIds', 'deeds', 'myths', 'legacies', 'associatedFactionNames', 'relatedNpcIds', 'successorNpcIds',
  'relatedNpcNames', 'successorNpcNames', 'factionNames', 'witnesses', 'believers', 'holderNpcIds', 'holderNpcNames',
  'accessConditions', 'encounterConditions', 'qualifyingSigns', 'disqualifiers', 'anchorFacts', 'forbiddenContradictions', 'divergenceNotes',
  'conceptualDomains', 'mechanicVerbs', 'motifs', 'differentiation', 'relatedArtifactIds', 'sectionOrder',
  'groups', 'tiers', 'natureKinds', 'comparisonRules', 'evidenceRequirements', 'sensoryMotifs',
  'priorities', 'habits', 'signatures', 'facets', 'developmentSeeds', 'addDevelopmentSeeds',
  'developmentSeedChanges', 'removeDevelopmentSeedIds', 'abilityExecutions', 'requirementsUsed',
])

const ARRAY_LIMITS: Record<string, number> = {
  rules: 10, factions: 12, locations: 12, mysteries: 8, routes: 30, places: 36, processes: 14, legends: 18, laws: 24, mechanics: 24, interfaceModules: 8, metrics: 12, upsertInterfaceModules: 8, elements: 16, links: 16, upsertLaws: 24, upsertMechanics: 24, territory: 24, goals: 16, equipmentSlots: 12,
  accepts: 7, stats: 24, resources: 24, upsertStats: 24, upsertResources: 24, abilities: 40, inventory: 25, npcs: 20,
  knowledge: 30, socialLinks: 40, worldEvents: 20, factionReputation: 8, threads: 20,
  quests: 10, lore: 30, presentNpcNames: 8, presentNpcIds: 12, suggestions: 4,
  objectives: 20, keys: 20, notes: 8, effects: 48, participantNames: 12,
  participantIds: 20, involvedNpcNames: 12, involvedIds: 20, signals: 10, beats: 8,
  memories: 12, archives: 4, issues: 16, tags: 24, entityIds: 24, relationships: 15,
  events: 12, costs: 8, requirements: 48, limitations: 48, evolutionPaths: 24, history: 100, powers: 64,
  drawbacks: 48, secrets: 48, patterns: 8, avoids: 8, blockedBy: 8, stages: 12,
  turningPoints: 12, clues: 30, redHerrings: 12, revelationRules: 12, steps: 12,
  weaknesses: 12, abilityChanges: 24, artifactChanges: 24, upsertAbilities: 40, upsertCharacterArcs: 20,
  upsertMysteryCases: 12, upsertAntagonistPlans: 12, upsertInfluenceAssets: 30,
  characterArcs: 20, mysteryCases: 12, antagonistPlans: 12, influenceAssets: 30,
  capabilities: 64, synergies: 32, counters: 32, examples: 24, passiveEffects: 48,
  combinedEffects: 48, failureModes: 48, components: 32, mustPreserve: 64,
  capabilityChecklist: 64, forbiddenDistortions: 32, uncertainties: 24,
  canonicalConstraints: 64, adaptationConflicts: 64, namingRules: 32,
  originalityRules: 32, missingCapabilities: 64, coverageAudit: 128, constraintAudit: 128,
  entities: 20, addCapabilities: 64, addSynergies: 32, addCounters: 32, addExamples: 24,
  itemEffects: 12, powerChanges: 64, componentChanges: 32, addComponents: 32,
  addPassiveEffects: 48, addCombinedEffects: 48, addFailureModes: 48,
  aliases: 16, statusEffects: 48, upsertStatusEffects: 48, removeStatusEffectIds: 48, removeKnowledgeIds: 30,
  verifiedDomains: 17, omissions: 64, observedPlayerPatterns: 16, strengths: 12, blindSpots: 12, contingencies: 12,
  retreatConditions: 12, ethicalLimits: 12, learnedAdaptations: 16, countermeasures: 16, tradeoffs: 12,
  participants: 24, terrain: 16, hazards: 16, advantages: 12, vulnerabilities: 12,
  techniques: 48, addTechniques: 48, techniqueChanges: 48, removeTechniqueIds: 48,
  worldPressures: 16, upsertWorldPressures: 16, measures: 16, counterplay: 16, deescalationConditions: 12,
  whyDangerous: 12, knownFeats: 12, constraints: 12, defeatRequirements: 12, escalationTriggers: 12,
  victoryConditions: 12, failureConsequences: 12, escapeRoutes: 12, telegraphs: 12, targetNames: 20, targetIds: 20,
  revealedSections: 24, revealedStatKeys: 24, revealedResourceKeys: 24, revealedAbilityIds: 40, revealedAbilityNames: 20,
  upsertFactionReputation: 16, upsertPlaces: 40, removePlaceIds: 40, upsertProcesses: 24, retireProcessIds: 24,
  removeLawIds: 24, removeMechanicIds: 24, removeInterfaceModuleIds: 8, interfaceModuleChanges: 16, upsertElements: 16, removeElementIds: 16,
  upsertMetrics: 24, removeMetricIds: 24, tabs: 6, dashboardSections: 7,
  culture: 12, notableFacts: 16, scopeIds: 20, scopeNames: 20, causeIds: 24, causeTitles: 24,
  involvedFactionNames: 20, drivers: 16, obstacles: 16, consequences: 16, signs: 16, evidence: 20,
  npcIds: 20, questIds: 20, npcAbilityChanges: 12, narrativeIssues: 32,
  recognitionRules: 16, transmissionChannels: 16, distortionForces: 16, memoryKeepers: 16, erasureForces: 16, successionRules: 16, encounterRules: 16, thresholds: 4,
  upsertLegends: 24, removeLegendIds: 24, deeds: 40, myths: 40, legacies: 40, associatedFactionNames: 20, relatedNpcIds: 24, successorNpcIds: 24,
  relatedNpcNames: 24, successorNpcNames: 24, factionNames: 20, witnesses: 20, believers: 20, holderNpcIds: 20, holderNpcNames: 20,
  accessConditions: 16, encounterConditions: 16, qualifyingSigns: 16, disqualifiers: 16, anchorFacts: 24, forbiddenContradictions: 24, divergenceNotes: 24,
  conceptualDomains: 12, mechanicVerbs: 16, motifs: 16, differentiation: 12, relatedArtifactIds: 24, sectionOrder: 12,
  groups: 16, tiers: 12, natureKinds: 14, comparisonRules: 16, evidenceRequirements: 12, sensoryMotifs: 10,
  priorities: 10, habits: 10, signatures: 10, facets: 6, developmentSeeds: 12, addDevelopmentSeeds: 12,
  developmentSeedChanges: 12, removeDevelopmentSeedIds: 12, abilityExecutions: 24, requirementsUsed: 16,
}

const BOOLEAN_KEYS = new Set([
  'secret', 'enabled', 'alwaysOn', 'discovered', 'equipped', 'completed', 'pass',
  'awakened', 'sentient', 'essential', 'unlocked',
  'recognizedCanon', 'required',
  'hidden', 'collapsible', 'collapsedByDefault',
])

const NUMBER_KEYS = new Set([
  'value', 'max', 'relationship', 'score', 'confidence', 'distance', 'danger', 'quantity',
  'weight', 'durability', 'maxDurability', 'priority', 'importance', 'tension', 'delta',
  'levelDelta', 'calendarDayDelta', 'dueTurn', 'dueDay', 'createdTurn', 'startTurn',
  'endTurn', 'turn', 'day', 'mastery', 'amount', 'attunement', 'bond', 'urgency',
  'progress', 'currentStep', 'pressure', 'acquiredTurn', 'lastAdvancedTurn', 'solvedTurn',
  'discoveredTurn', 'trust', 'respect', 'affection', 'fear', 'suspicion', 'dependence',
  'coverage', 'round', 'readiness', 'morale', 'startedTurn', 'lastUpdatedTurn',
  'criticalBelow', 'charges', 'maxCharges', 'stacks', 'remaining', 'expiresTurn', 'appliedTurn',
  'masteryDelta', 'attunementDelta', 'bondDelta', 'powerMasteryDelta', 'power', 'lastChangedTurn', 'min', 'intensity',
  'minRenown', 'renown', 'influence', 'renownImpact', 'reliability', 'awareness', 'encounterReadiness', 'lastEvaluatedTurn',
  'order', 'requiredConfirmations', 'updatedTurn', 'lastUsedTurn',
])

const ID_KEYS = new Set([
  'id', 'targetId', 'npcId', 'characterId', 'fromNpcId', 'toNpcId', 'abilityId', 'itemId', 'powerId', 'componentId', 'ownerId',
  'culpritId', 'holderId', 'ownerNpcId', 'entityId', 'techniqueId', 'sourceNpcId', 'moduleId',
  'groupId', 'tierId', 'systemId', 'seedId', 'lineageId',
])
const ID_ARRAY_KEYS = new Set([
  'presentNpcIds', 'participantIds', 'involvedIds', 'entityIds', 'removeAbilityIds',
  'removeRouteIds', 'addNpcIds', 'removeNpcIds', 'unlockEvolutionPathIds',
  'removeInfluenceAssetIds', 'removeTechniqueIds',
  'removeStatusEffectIds', 'removeKnowledgeIds', 'removePlaceIds', 'retireProcessIds', 'removeLawIds', 'removeMechanicIds', 'removeInterfaceModuleIds',
  'removeElementIds', 'removeMetricIds', 'links', 'targetIds', 'scopeIds', 'causeIds', 'npcIds', 'questIds', 'revealedAbilityIds',
  'removeLegendIds', 'relatedNpcIds', 'successorNpcIds', 'holderNpcIds',
  'relatedArtifactIds',
  'relatedAbilityIds', 'removeDevelopmentSeedIds',
])

const DISCOVERY_KNOWLEDGE_RECORDS = new Set(['techniqueKnowledge', 'powerKnowledge', 'componentKnowledge'])

const ARRAY_IDENTITY: Record<string, string> = {
  factions: 'name', locations: 'name', places: 'name', processes: 'title', legends: 'name', upsertLegends: 'id', deeds: 'title', myths: 'title', legacies: 'name', thresholds: 'stage', laws: 'title', mechanics: 'name', interfaceModules: 'id', metrics: 'id', elements: 'id', tabs: 'id', upsertLaws: 'id', upsertMechanics: 'id', upsertInterfaceModules: 'id', interfaceModuleChanges: 'moduleId', upsertElements: 'id', upsertMetrics: 'id', upsertPlaces: 'id', upsertProcesses: 'id', npcs: 'name', quests: 'title', lore: 'title',
  worldEvents: 'title', knowledge: 'subject', stats: 'key', resources: 'key',
  characterArcs: 'title', upsertCharacterArcs: 'title', mysteryCases: 'title',
  upsertMysteryCases: 'title', antagonistPlans: 'title', upsertAntagonistPlans: 'title',
  influenceAssets: 'title', upsertInfluenceAssets: 'title', clues: 'title', powers: 'name', addPowers: 'name',
  evolutionPaths: 'name', steps: 'title', components: 'name', capabilityChecklist: 'name', entities: 'name',
  canonicalConstraints: 'name', adaptationConflicts: 'trait', coverageAudit: 'capability', constraintAudit: 'constraint',
  statusEffects: 'name', upsertStatusEffects: 'name', omissions: 'evidence',
  upsertStats: 'key', upsertResources: 'key', abilityChanges: 'abilityId', artifactChanges: 'itemId',
  powerChanges: 'powerId', componentChanges: 'componentId', addComponents: 'name',
  upsertFactions: 'name', upsertLocations: 'name', addEvolutionPaths: 'name',
  techniques: 'name', addTechniques: 'name', techniqueChanges: 'techniqueId',
  worldPressures: 'id', upsertWorldPressures: 'id', measures: 'id',
  npcAbilityChanges: 'npcId',
  groups: 'label', tiers: 'label', developmentSeeds: 'name', addDevelopmentSeeds: 'name', developmentSeedChanges: 'seedId',
  abilityExecutions: 'abilityId',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function parseNumberLike(value: unknown): unknown {
  if (typeof value !== 'string' || !value.trim()) return value
  const normalized = value.replace(',', '.')
  const direct = Number(normalized)
  if (Number.isFinite(direct)) return direct
  const numericPart = normalized.match(/-?\d+(?:\.\d+)?/u)?.[0]
  if (!numericPart) return value
  const parsed = Number(numericPart)
  return Number.isFinite(parsed) ? parsed : value
}

export function parseBooleanLike(value: unknown): unknown {
  if (typeof value === 'boolean') return value
  if (value === 1) return true
  if (value === 0) return false
  if (typeof value !== 'string') return value
  const normalized = value.trim().toLocaleLowerCase('ru-RU')
  if (['true', 'yes', 'да', 'истина', '1', 'включено', 'открыто'].includes(normalized)) return true
  if (['false', 'no', 'нет', 'ложь', '0', 'выключено', 'закрыто'].includes(normalized)) return false
  return value
}

function normalizeDiscoveryKnowledgeLevel(value: unknown): unknown {
  if (typeof value === 'boolean') return value ? 'known' : 'hidden'
  const numeric = typeof value === 'number' ? value : parseNumberLike(value)
  if (typeof numeric === 'number' && Number.isFinite(numeric)) {
    if (numeric <= 0) return 'hidden'
    if (numeric < 50) return 'hinted'
    if (numeric < 100) return 'known'
    return 'understood'
  }
  if (typeof value !== 'string') return value
  const token = enumToken(value)
  const aliases: Record<string, string> = {
    hidden: 'hidden', unknown: 'hidden', concealed: 'hidden', 'неизвестно': 'hidden', 'скрыто': 'hidden', 'скрыта': 'hidden',
    hinted: 'hinted', hint: 'hinted', suspected: 'hinted', 'намек': 'hinted', 'подозревается': 'hinted',
    known: 'known', revealed: 'known', confirmed: 'known', 'известно': 'known', 'открыто': 'known', 'подтверждено': 'known',
    understood: 'understood', mastered: 'understood', studied: 'understood', 'изучено': 'understood', 'освоено': 'understood', 'понятно': 'understood',
  }
  return aliases[token] ?? value
}

export function normalizeHexColor(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const clean = value.trim()
  if (/^#[0-9a-f]{3}$/iu.test(clean)) {
    const [r, g, b] = clean.slice(1).split('')
    return `#${r}${r}${g}${g}${b}${b}`
  }
  if (/^#[0-9a-f]{8}$/iu.test(clean)) return clean.slice(0, 7)
  if (/^[0-9a-f]{6}$/iu.test(clean)) return `#${clean}`
  const rgb = clean.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/iu)
  if (!rgb) return value
  const channels = rgb.slice(1, 4).map((channel) => Math.max(0, Math.min(255, Number(channel))))
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
}

function operationFor(value: unknown, parent: string | undefined): unknown {
  if (typeof value !== 'string') return value
  const normalized = value.trim().toLocaleLowerCase('ru-RU')
  const common: Record<string, string> = {
    add: 'add', create: 'add', new: 'add', добавить: 'add', создать: 'add', новый: 'add',
    update: 'update', change: 'update', изменить: 'update', обновить: 'update', обновление: 'update',
  }
  if (common[normalized]) return common[normalized]
  if (parent === 'inventory') {
    if (['remove', 'delete', 'удалить', 'потерять'].includes(normalized)) return 'remove'
  }
  if (parent === 'quests') {
    if (['complete', 'completed', 'завершить', 'выполнить'].includes(normalized)) return 'complete'
    if (['fail', 'failed', 'провалить', 'провалено'].includes(normalized)) return 'fail'
  }
  if (parent === 'threads') {
    if (['resolve', 'resolved', 'решить', 'разрешить', 'завершить'].includes(normalized)) return 'resolve'
    if (['break', 'broken', 'нарушить', 'разорвать'].includes(normalized)) return 'break'
  }
  if (parent === 'worldEvents') {
    if (['resolve', 'resolved', 'решить', 'завершить'].includes(normalized)) return 'resolve'
    if (['cancel', 'cancelled', 'отменить', 'отменено'].includes(normalized)) return 'cancel'
  }
  if (parent === 'conflict') {
    if (['start', 'начать', 'начало'].includes(normalized)) return 'start'
    if (['resolve', 'resolved', 'завершить', 'завершено', 'разрешить'].includes(normalized)) return 'resolve'
  }
  return value
}

function enumToken(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('ru-RU')
    .replaceAll('ё', 'е')
    .replace(/&/gu, ' and ')
    .replace(/[_/-]+/gu, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/gu, ' ')
}

const resourceKindAliases: Record<string, string> = {
  health: 'health', hp: 'health', 'hit points': 'health', vitality: 'health', life: 'health',
  здоровье: 'health', хп: 'health', 'очки здоровья': 'health', жизнь: 'health', живучесть: 'health',
  stamina: 'stamina', endurance: 'stamina', выносливость: 'stamina', 'запас сил': 'stamina',
  mana: 'mana', mp: 'mana', мана: 'mana', 'магическая энергия': 'mana',
  energy: 'energy', power: 'energy', энергия: 'energy', сила: 'energy',
  focus: 'focus', concentration: 'focus', фокус: 'focus', концентрация: 'focus',
  sanity: 'sanity', рассудок: 'sanity', здравомыслие: 'sanity',
  morale: 'morale', мораль: 'morale', 'боевой дух': 'morale',
  hunger: 'hunger', голод: 'hunger', сытость: 'hunger',
  ammo: 'ammo', ammunition: 'ammo', боеприпасы: 'ammo', патроны: 'ammo', стрелы: 'ammo',
  charges: 'charges', charge: 'charges', uses: 'charges', заряды: 'charges', заряд: 'charges', применения: 'charges',
  custom: 'custom', other: 'custom', другое: 'custom', прочее: 'custom', особое: 'custom',
}

const statusEffectCategoryAliases: Record<string, string> = {
  injury: 'injury', wound: 'injury', trauma: 'injury', травма: 'injury', ранение: 'injury', рана: 'injury',
  buff: 'buff', boon: 'buff', усиление: 'buff', бонус: 'buff',
  debuff: 'debuff', penalty: 'debuff', ослабление: 'debuff', штраф: 'debuff',
  disease: 'disease', illness: 'disease', болезнь: 'disease', заболевание: 'disease',
  poison: 'poison', toxin: 'poison', яд: 'poison', отравление: 'poison',
  curse: 'curse', проклятие: 'curse',
  blessing: 'blessing', благословение: 'blessing',
  environment: 'environment', environmental: 'environment', окружение: 'environment', среда: 'environment',
  mental: 'mental', psychological: 'mental', ментальное: 'mental', психика: 'mental', психическое: 'mental',
  other: 'other', custom: 'other', другое: 'other', прочее: 'other',
}

const lifeStateAliases: Record<string, string> = {
  active: 'active', alive: 'active', conscious: 'active', жив: 'active', жива: 'active', активен: 'active', активна: 'active', 'в сознании': 'active',
  unconscious: 'unconscious', knockedout: 'unconscious', 'knocked out': 'unconscious', 'без сознания': 'unconscious', нокаут: 'unconscious',
  incapacitated: 'incapacitated', disabled: 'incapacitated', недееспособен: 'incapacitated', недееспособна: 'incapacitated', обездвижен: 'incapacitated', обездвижена: 'incapacitated', 'выведен из строя': 'incapacitated', 'выведена из строя': 'incapacitated',
  dead: 'dead', deceased: 'dead', мертв: 'dead', мертва: 'dead', погиб: 'dead', погибла: 'dead',
  missing: 'missing', absent: 'missing', пропал: 'missing', пропала: 'missing', исчез: 'missing', исчезла: 'missing', отсутствует: 'missing',
}

const itemStateAliases: Record<string, string> = {
  intact: 'intact', functional: 'intact', цел: 'intact', цела: 'intact', целый: 'intact', целая: 'intact', исправен: 'intact', исправна: 'intact',
  damaged: 'damaged', поврежден: 'damaged', повреждена: 'damaged', поврежденный: 'damaged', поврежденная: 'damaged', надломлен: 'damaged',
  broken: 'broken', destroyed: 'broken', сломан: 'broken', сломана: 'broken', разрушен: 'broken', разрушена: 'broken',
  depleted: 'depleted', empty: 'depleted', drained: 'depleted', истощен: 'depleted', истощена: 'depleted', разряжен: 'depleted', разряжена: 'depleted', пуст: 'depleted', пуста: 'depleted',
  sealed: 'sealed', locked: 'sealed', запечатан: 'sealed', запечатана: 'sealed', заблокирован: 'sealed', заблокирована: 'sealed',
}

const durationUnitAliases: Record<string, string> = {
  turn: 'turns', turns: 'turns', ход: 'turns', ходы: 'turns', хода: 'turns', ходов: 'turns',
  scene: 'scenes', scenes: 'scenes', сцена: 'scenes', сцены: 'scenes', сцен: 'scenes',
  day: 'days', days: 'days', день: 'days', дни: 'days', дня: 'days', дней: 'days',
  until: 'until', condition: 'until', 'until condition': 'until', до: 'until', пока: 'until', условие: 'until', 'до условия': 'until',
  indefinite: 'indefinite', permanent: 'indefinite', forever: 'indefinite', бессрочно: 'indefinite', постоянно: 'indefinite', навсегда: 'indefinite',
}

function normalizeDuration(value: unknown): unknown {
  if (typeof value === 'number' && Number.isFinite(value)) return { unit: 'turns', remaining: value }
  if (typeof value === 'string') {
    const token = enumToken(value)
    const unit = Object.entries(durationUnitAliases).find(([alias]) => token.includes(enumToken(alias)))?.[1]
    if (unit === 'indefinite') return { unit }
    if (unit === 'until') {
      const condition = value.replace(/^(until|condition|до|пока|условие)\s*[:—-]?\s*/iu, '').trim()
      return { unit, ...(condition ? { condition } : {}) }
    }
    const remaining = parseNumberLike(value)
    if (unit && typeof remaining === 'number') return { unit, remaining }
    return value
  }
  if (!isRecord(value)) return value
  if (typeof value.unit === 'string') {
    const normalizedUnit = durationUnitAliases[value.unit.trim().toLocaleLowerCase('ru-RU')]
      ?? durationUnitAliases[enumToken(value.unit)]
      ?? value.unit
    const normalized: Record<string, unknown> = { unit: normalizedUnit }
    const remainingSource = value.remaining ?? value.amount ?? value.count ?? value.value ?? value.length
    const remaining = parseNumberLike(remainingSource)
    if (typeof remaining === 'number') normalized.remaining = remaining
    const expiresTurn = parseNumberLike(value.expiresTurn ?? value.expiresAtTurn ?? value.untilTurn)
    if (typeof expiresTurn === 'number') normalized.expiresTurn = expiresTurn
    const condition = value.condition ?? value.until ?? value.untilCondition
    if (typeof condition === 'string' && condition.trim()) normalized.condition = condition.trim()
    return normalized
  }
  for (const [rawUnit, rawAmount] of Object.entries(value)) {
    const unit = durationUnitAliases[rawUnit.trim().toLocaleLowerCase('ru-RU')] ?? durationUnitAliases[enumToken(rawUnit)]
    if (!unit) continue
    if (unit === 'indefinite') return { unit }
    if (unit === 'until') return { unit, condition: typeof rawAmount === 'string' ? rawAmount : String(rawAmount) }
    const remaining = parseNumberLike(rawAmount)
    if (typeof remaining === 'number') return { unit, remaining }
  }
  return value
}

const consequenceDomainAliases: Record<string, string> = {
  health: 'health', hp: 'health', vitality: 'health', здоровье: 'health', хп: 'health',
  resource: 'resources', resources: 'resources', ресурсы: 'resources', ресурс: 'resources',
  stat: 'stats', stats: 'stats', attribute: 'stats', attributes: 'stats', характеристики: 'stats', характеристика: 'stats', параметры: 'stats',
  condition: 'conditions', conditions: 'conditions', status: 'conditions', 'status effects': 'conditions', состояния: 'conditions', состояние: 'conditions', эффекты: 'conditions',
  inventory: 'inventory', items: 'inventory', инвентарь: 'inventory', рюкзак: 'inventory', предметы: 'inventory',
  equipment: 'equipment', gear: 'equipment', экипировка: 'equipment', снаряжение: 'equipment',
  ability: 'abilities', abilities: 'abilities', skills: 'abilities', powers: 'abilities', способности: 'abilities', способность: 'abilities', навыки: 'abilities',
  artifact: 'artifacts', artifacts: 'artifacts', relics: 'artifacts', артефакты: 'artifacts', артефакт: 'artifacts', реликвии: 'artifacts',
  currency: 'currency', money: 'currency', economy: 'currency', валюта: 'currency', деньги: 'currency', монеты: 'currency',
  relationship: 'relationships', relationships: 'relationships', social: 'relationships', 'social links': 'relationships', отношения: 'relationships', связи: 'relationships', 'социальные связи': 'relationships',
  quest: 'quests', quests: 'quests', tasks: 'quests', квесты: 'quests', задания: 'quests', задание: 'quests',
  character: 'characters', characters: 'characters', npc: 'characters', npcs: 'characters', персонажи: 'characters', персонаж: 'characters', герои: 'characters',
  conflict: 'conflict', confrontation: 'conflict', encounter: 'conflict', combat: 'conflict', конфликт: 'conflict', противостояние: 'conflict', бой: 'conflict',
  'scene time': 'scene_time', sceneandtime: 'scene_time', 'scene and time': 'scene_time', 'location time': 'scene_time', сцена: 'scene_time', время: 'scene_time', 'сцена и время': 'scene_time', 'место и время': 'scene_time',
  world: 'world', 'world state': 'world', мир: 'world', 'состояние мира': 'world',
  world_pressure: 'world_pressure', 'world pressure': 'world_pressure', pressure: 'world_pressure', 'давление мира': 'world_pressure', 'реакция мира': 'world_pressure',
  knowledge: 'knowledge', memory: 'knowledge', lore: 'knowledge', знания: 'knowledge', память: 'knowledge', 'память и знания': 'knowledge',
}

function safePresentationEnum(
  value: string,
  allowed: readonly string[],
  aliases: Record<string, string>,
  fallback: string,
): string {
  const normalized = value.trim().toLocaleLowerCase('ru-RU')
  const token = enumToken(value)
  if (allowed.includes(normalized)) return normalized
  const direct = aliases[normalized] ?? aliases[token]
  if (direct && allowed.includes(direct)) return direct
  const semantic = Object.entries(aliases).find(([alias]) => {
    const aliasToken = enumToken(alias)
    return aliasToken.length >= 3 && (token.includes(aliasToken) || aliasToken.includes(token))
  })?.[1]
  return semantic && allowed.includes(semantic) ? semantic : fallback
}

function enumFor(value: unknown, key: string | undefined, path: string[]): unknown {
  if (typeof value !== 'string' || !key) return value
  const normalized = value.trim().toLocaleLowerCase('ru-RU')
  const token = enumToken(value)
  const has = (segment: string) => path.includes(segment)
  const translate = (aliases: Record<string, string>) => aliases[normalized] ?? aliases[token] ?? value

  if ((key === '[]' && has('verifiedDomains')) || (key === 'domain' && has('omissions'))) {
    return translate(consequenceDomainAliases)
  }
  if (key === 'lifeState') return translate(lifeStateAliases)
  if (key === 'unit' && has('duration')) return translate(durationUnitAliases)
  if (key === 'state' && has('inventory')) return translate(itemStateAliases)
  if (key === 'category' && (has('statusEffects') || has('upsertStatusEffects'))) return translate(statusEffectCategoryAliases)
  if (key === 'kind' && (has('resources') || has('upsertResources'))) return translate(resourceKindAliases)
  if (key === 'kind' && has('nature')) return translate({
    'kekkei genkai': 'innate', kekkeigenkai: 'innate', bloodline: 'innate', hereditary: 'innate', inherited: 'innate',
    dojutsu: 'innate', 'додзюцу': 'innate', 'кеккей генкай': 'innate', 'наследственная': 'innate',
    ninjutsu: 'trained', taijutsu: 'trained', genjutsu: 'trained', senjutsu: 'trained', kenjutsu: 'trained', fuinjutsu: 'trained',
    'ниндзюцу': 'trained', 'тайдзюцу': 'trained', 'гендзюцу': 'trained', 'сендзюцу': 'trained', 'кендзюцу': 'trained', 'фуиндзюцу': 'trained',
  })
  if (key === 'state' && has('availability')) return translate({
    ready: 'ready', available: 'ready', usable: 'ready', prepared: 'ready', active: 'ready',
    'готова': 'ready', 'готов': 'ready', 'доступна': 'ready', 'доступен': 'ready',
    limited: 'limited', restricted: 'limited', partial: 'limited', 'partially available': 'limited',
    'ограничена': 'limited', 'ограничен': 'limited', 'частично': 'limited',
    cooldown: 'cooldown', cooling: 'cooldown', recharging: 'cooldown', recovering: 'cooldown',
    'откат': 'cooldown', 'восстанавливается': 'cooldown', 'перезаряжается': 'cooldown',
    blocked: 'blocked', locked: 'blocked', unavailable: 'blocked', inaccessible: 'blocked',
    'заблокирована': 'blocked', 'заблокирован': 'blocked', 'недоступна': 'blocked', 'недоступен': 'blocked',
    disabled: 'disabled', inactive: 'disabled', deactivated: 'disabled',
    'отключена': 'disabled', 'отключен': 'disabled', 'деактивирована': 'disabled', 'деактивирован': 'disabled',
  })

  if (key === 'kind' && (has('abilities') || has('addAbilities') || has('abilityChanges') || has('techniques') || has('addTechniques') || has('techniqueChanges'))) return translate({
    активная: 'active', активный: 'active', пассивная: 'passive', пассивный: 'passive',
    реакция: 'reaction', ритуал: 'ritual', трансформация: 'transformation', превращение: 'transformation',
    другое: 'other', прочее: 'other',
  })
  if (key === 'kind' && has('conflict')) return translate({
    бой: 'combat', сражение: 'combat', драка: 'combat', погоня: 'chase', преследование: 'chase',
    спор: 'social', социальное: 'social', переговоры: 'social', скрытность: 'stealth', проникновение: 'stealth',
    другое: 'other', прочее: 'other',
  })
  if (key === 'side' && has('conflict')) return translate({
    игрок: 'player', герой: 'player', союзник: 'ally', союзники: 'ally', противник: 'opposition', враг: 'opposition', оппозиция: 'opposition', нейтральный: 'neutral', нейтральная: 'neutral',
  })
  if (key === 'momentum' && has('conflict')) return translate({
    игрок: 'player', герой: 'player', противник: 'opposition', враг: 'opposition', спорный: 'contested', оспаривается: 'contested', равный: 'contested',
  })
  if (key === 'kind' && (has('influenceAssets') || has('upsertInfluenceAssets'))) return translate({
    information: 'leverage', info: 'leverage', intel: 'leverage', intelligence: 'leverage',
    информация: 'leverage', сведения: 'leverage', разведданные: 'leverage',
    услуга: 'favor', одолжение: 'favor', долг: 'debt', компромат: 'leverage', рычаг: 'leverage',
    контакт: 'contact', доступ: 'access', репутация: 'reputation', клятва: 'oath', обещание: 'oath',
    другое: 'other', прочее: 'other',
  })
  if (key === 'status' && (has('mysteryCases') || has('upsertMysteryCases'))) return translate({
    открыто: 'open', открыта: 'open', активно: 'open', раскрыто: 'solved', раскрыта: 'solved',
    решено: 'solved', провалено: 'failed', закрыто: 'failed',
  })
  if (key === 'status' && (has('characterArcs') || has('upsertCharacterArcs'))) return translate({
    активно: 'active', активна: 'active', завершено: 'completed', завершена: 'completed',
    сломано: 'broken', прервано: 'broken',
  })
  if (key === 'status' && has('steps')) return translate({
    ожидает: 'pending', запланировано: 'pending', активно: 'active', выполняется: 'active',
    завершено: 'completed', выполнено: 'completed', провалено: 'failed', сорвано: 'failed',
    брошено: 'abandoned', отменено: 'abandoned',
  })
  if (key === 'status' && (has('antagonistPlans') || has('upsertAntagonistPlans'))) return translate({
    активно: 'active', завершено: 'completed', выполнено: 'completed', провалено: 'failed',
    сорвано: 'failed', брошено: 'abandoned', отменено: 'abandoned',
  })
  if (key === 'status' && (has('influenceAssets') || has('upsertInfluenceAssets'))) return translate({
    активно: 'active', доступно: 'active', потрачено: 'spent', использовано: 'spent',
    возвращено: 'repaid', погашено: 'repaid', потеряно: 'lost', утрачено: 'lost',
  })
  if (key === 'beat') return translate({
    передышка: 'respite', отдых: 'respite', подготовка: 'setup', завязка: 'setup', исследование: 'exploration',
    нарастание: 'rising', напряжение: 'rising', испытание: 'challenge', последствия: 'aftermath', развязка: 'aftermath', кульминация: 'climax',
  })
  if (key === 'stage' && (has('legends') || has('upsertLegends') || has('thresholds'))) return translate({
    заметный: 'notable', известный: 'renowned', прославленный: 'renowned', легендарный: 'legendary', мифический: 'mythic', божественный: 'mythic',
  })
  if (key === 'lifeStatus') return translate({
    жив: 'living', жива: 'living', живой: 'living', мёртв: 'dead', мертв: 'dead', мертва: 'dead', пропал: 'missing', пропала: 'missing',
    исчез: 'missing', запечатан: 'sealed', запечатана: 'sealed', спит: 'dormant', дремлет: 'dormant', вернулся: 'returned',
    вернулась: 'returned', воскрешён: 'returned', воскрешен: 'returned', вознесён: 'ascended', вознесен: 'ascended', вознеслась: 'ascended', неизвестно: 'unknown',
  })
  if (key === 'truth' || key === 'truthStatus') return translate({
    подтверждено: 'confirmed', правда: 'confirmed', частично: 'partly_true', частично_правда: 'partly_true', искажено: 'distorted',
    выдумано: 'fabricated', ложь: 'fabricated', неизвестно: 'unknown',
  })
  if (key === 'kind' && has('legacies')) return translate({
    техника: 'technique', способность: 'technique', артефакт: 'artifact', реликвия: 'artifact', род: 'bloodline', кровь: 'bloodline',
    школа: 'school', учение: 'school', фракция: 'faction', организация: 'faction', культ: 'cult', закон: 'law', место: 'place',
    локация: 'place', пророчество: 'prophecy', титул: 'title', другое: 'other', прочее: 'other',
  })
  if (key === 'challengeTier' || (key === 'tier' && has('conflict'))) return translate({
    нет: 'none', отсутствует: 'none', лёгкий: 'light', легкий: 'light', простой: 'light', обычный: 'standard', средний: 'standard',
    сложный: 'hard', тяжёлый: 'severe', тяжелый: 'severe', экстремальный: 'severe', легендарный: 'legendary', мифический: 'mythic', божественный: 'mythic',
  })
  if (key === 'tier' && has('threatProfile')) return translate({
    незначительный: 'minor', обычный: 'capable', подготовленный: 'capable', опасный: 'dangerous', элитный: 'elite',
    легендарный: 'legendary', мифический: 'mythic', божественный: 'mythic',
  })
  if (key === 'tier' && (has('worldPressures') || has('upsertWorldPressures'))) return translate({
    след: 'trace', слабый: 'trace', локальный: 'local', местный: 'local', серьёзный: 'serious', серьезный: 'serious',
    критический: 'critical', легендарный: 'legendary', мифический: 'mythic', божественный: 'mythic',
  })
  if (key === 'sourceKind' && (has('worldPressures') || has('upsertWorldPressures'))) return translate({
    персонаж: 'npc', нпс: 'npc', фракция: 'faction', власть: 'authority', корпорация: 'corporation', бог: 'deity', божество: 'deity',
    космос: 'cosmic', космическая: 'cosmic', среда: 'environment', окружение: 'environment', другое: 'other',
  })
  if (key === 'stage' && (has('worldPressures') || has('upsertWorldPressures'))) return translate({
    наблюдает: 'watching', наблюдение: 'watching', расследует: 'investigating', расследование: 'investigating',
    готовится: 'preparing', подготовка: 'preparing', действует: 'acting', действие: 'acting', затихает: 'cooling', ослабевает: 'cooling',
    завершено: 'resolved', разрешено: 'resolved',
  })
  if (key === 'status' && has('measures') && (has('worldPressures') || has('upsertWorldPressures'))) return translate({
    рассматривается: 'considered', задумано: 'considered', готовится: 'preparing', подготовка: 'preparing', активно: 'active', действует: 'active',
    использовано: 'spent', израсходовано: 'spent', сорвано: 'foiled', провалено: 'foiled',
  })

  if (key === 'chosen') return translate({ а: 'a', '1': 'a', первый: 'a', б: 'b', '2': 'b', второй: 'b' })
  if (key === 'severity') return translate({ низкая: 'low', низкий: 'low', средняя: 'medium', средний: 'medium', высокая: 'high', высокий: 'high' })
  if (key === 'layout' && has('artifact')) return safePresentationEnum(value,
    ['reliquary', 'schematic', 'grimoire', 'constellation', 'monolith', 'organic', 'arsenal', 'minimal'],
    { реликварий: 'reliquary', shrine: 'reliquary', схема: 'schematic', чертеж: 'schematic', чертёж: 'schematic', blueprint: 'schematic', гримуар: 'grimoire', book: 'grimoire', созвездие: 'constellation', stars: 'constellation', монолит: 'monolith', monument: 'monolith', органика: 'organic', living: 'organic', арсенал: 'arsenal', collection: 'arsenal', минимализм: 'minimal', cards: 'minimal', card: 'minimal' },
    'minimal')
  if (key === 'surface' && has('artifact')) return safePresentationEnum(value,
    ['metal', 'stone', 'paper', 'glass', 'energy', 'organic', 'void', 'fabric', 'wood', 'composite'],
    { металл: 'metal', steel: 'metal', камень: 'stone', rock: 'stone', бумага: 'paper', parchment: 'paper', стекло: 'glass', crystal: 'glass', энергия: 'energy', plasma: 'energy', органика: 'organic', living: 'organic', пустота: 'void', cosmic: 'void', ткань: 'fabric', textile: 'fabric', дерево: 'wood', timber: 'wood', композит: 'composite', составной: 'composite', mixed: 'composite' },
    'composite')
  if (key === 'glow' && has('artifact')) return safePresentationEnum(value,
    ['none', 'soft', 'pulse', 'halo', 'veins', 'embers', 'glitch'],
    { нет: 'none', отсутствует: 'none', off: 'none', мягкое: 'soft', subtle: 'soft', пульсация: 'pulse', пульс: 'pulse', rhythmic: 'pulse', ореол: 'halo', aura: 'halo', жилы: 'veins', veins: 'veins', угли: 'embers', искры: 'embers', sparks: 'embers', глитч: 'glitch', помехи: 'glitch', digital: 'glitch' },
    'none')
  if (key === 'headerStyle' && has('artifact')) return safePresentationEnum(value,
    ['inscribed', 'technical', 'ceremonial', 'minimal', 'living'],
    { гравировка: 'inscribed', надпись: 'inscribed', engraved: 'inscribed', технический: 'technical', schematic: 'technical', церемониальный: 'ceremonial', ritual: 'ceremonial', минимальный: 'minimal', clean: 'minimal', живой: 'living', organic: 'living' },
    'minimal')
  if (key === 'density' && has('artifact')) return safePresentationEnum(value,
    ['comfortable', 'cinematic'],
    { удобная: 'comfortable', комфортная: 'comfortable', compact: 'comfortable', spacious: 'comfortable', кинематографичная: 'cinematic', выразительная: 'cinematic', dramatic: 'cinematic' },
    'comfortable')
  if (key === 'resemblanceKind') return translate({ канон: 'canon', серия: 'set', набор: 'set', культура: 'culture', создатель: 'creator', эволюция: 'evolution', развитие: 'evolution' })
  if (((key === '[]' && (has('sectionOrder') || has('revealedSections'))) || (key === 'section' && has('discovery') && has('evidence'))) && has('profile') && has('abilities')) return translate({
    nature: 'source', creativeidentity: 'principle', 'creative identity': 'principle', ownerexpression: 'identity', 'owner expression': 'identity',
    'природа': 'source', 'творческая идентичность': 'principle', 'стиль владельца': 'identity',
  })
  if (key === '[]' && (has('sectionOrder') || has('revealedSections'))) return translate({
    идентичность: 'identity', образ: 'identity', происхождение: 'origin', принцип: 'principle', требования: 'requirements', пассивы: 'passives', компоненты: 'components', силы: 'powers', сочетания: 'combined', недостатки: 'drawbacks', отказы: 'failureModes', уязвимости: 'failureModes', развитие: 'evolution', история: 'history', разумность: 'sentience', тайны: 'secrets',
  })
  if (key === 'layout' && has('presentation') && (has('abilities') || has('addAbilities') || has('upsertAbilities') || has('abilityChanges') || has('profileChanges'))) return safePresentationEnum(value,
    ['discipline', 'protocol', 'network', 'mandate', 'mutation', 'constellation', 'arsenal', 'minimal'],
    { дисциплина: 'discipline', school: 'discipline', протокол: 'protocol', procedure: 'protocol', сеть: 'network', web: 'network', мандат: 'mandate', authority: 'mandate', мутация: 'mutation', evolution: 'mutation', созвездие: 'constellation', stars: 'constellation', арсенал: 'arsenal', collection: 'arsenal', минимализм: 'minimal', cards: 'minimal', card: 'minimal' },
    'minimal')
  if (key === 'density' && has('presentation') && (has('abilities') || has('addAbilities') || has('upsertAbilities') || has('abilityChanges') || has('profileChanges'))) return safePresentationEnum(value,
    ['comfortable', 'cinematic'],
    { удобная: 'comfortable', комфортная: 'comfortable', compact: 'comfortable', spacious: 'comfortable', кинематографичная: 'cinematic', выразительная: 'cinematic', dramatic: 'cinematic' },
    'comfortable')
  if (key === 'icon' && (has('presentation') || has('interfaceModules') || has('upsertInterfaceModules'))) return safePresentationEnum(value,
    ['spark', 'eye', 'shield', 'network', 'pulse', 'compass', 'crown', 'rune', 'gear', 'flame', 'star', 'moon'],
    { искра: 'spark', magic: 'spark', глаз: 'eye', взгляд: 'eye', vision: 'eye', щит: 'shield', defense: 'shield', сеть: 'network', узлы: 'network', web: 'network', пульс: 'pulse', сердце: 'pulse', heart: 'pulse', компас: 'compass', direction: 'compass', корона: 'crown', власть: 'crown', руна: 'rune', glyph: 'rune', механизм: 'gear', шестерня: 'gear', machine: 'gear', пламя: 'flame', огонь: 'flame', fire: 'flame', звезда: 'star', cosmic: 'star', луна: 'moon', night: 'moon' },
    'spark')
  if (key === 'surface' && has('presentation')) return safePresentationEnum(value,
    ['paper', 'arcane', 'tech', 'organic', 'noir', 'minimal'],
    {
      бумага: 'paper', бумажный: 'paper', parchment: 'paper', book: 'paper', canvas: 'paper', fabric: 'paper', wood: 'paper', stone: 'paper',
      магия: 'arcane', магический: 'arcane', mystical: 'arcane', mystic: 'arcane', rune: 'arcane', ritual: 'arcane', celestial: 'arcane',
      технология: 'tech', технологичный: 'tech', technical: 'tech', digital: 'tech', cyber: 'tech', holographic: 'tech', neon: 'tech', glass: 'tech', crystal: 'tech', transparent: 'tech', metal: 'tech', steel: 'tech', energy: 'tech',
      органика: 'organic', органический: 'organic', living: 'organic', biological: 'organic', bio: 'organic', floral: 'organic',
      нуар: 'noir', dark: 'noir', shadow: 'noir', void: 'noir', gothic: 'noir', ink: 'noir',
      минимализм: 'minimal', minimalistic: 'minimal', clean: 'minimal', simple: 'minimal', neutral: 'minimal', classic: 'minimal',
    },
    'minimal')
  if (key === 'visibility') return translate({ известно: 'known', открыто: 'known', слух: 'rumored', слухи: 'rumored', предположение: 'rumored', скрыто: 'hidden', тайно: 'hidden', секретно: 'hidden' })
  if (key === 'rarity') return translate({ обычный: 'common', обычное: 'common', необычный: 'uncommon', необычное: 'uncommon', редкий: 'rare', редкое: 'rare', исключительный: 'exceptional', исключительное: 'exceptional', эпический: 'epic', эпическое: 'epic', легендарный: 'legendary', легендарное: 'legendary', мифический: 'mythic', мифическое: 'mythic', трансцендентный: 'transcendent', трансцендентное: 'transcendent' })
  if (key === 'category' && (has('abilities') || has('addAbilities') || has('abilityChanges') || has('powers') || has('addPowers') || has('techniques') || has('addTechniques') || has('techniqueChanges') || has('capabilityChecklist'))) return translate({
    атака: 'offense', нападение: 'offense', защита: 'defense', контроль: 'control', мобильность: 'mobility', перемещение: 'mobility',
    утилита: 'utility', применение: 'utility', восприятие: 'perception', создание: 'creation', призыв: 'summoning',
    трансформация: 'transformation', реальность: 'reality', время: 'time', пространство: 'space', разум: 'mind', душа: 'soul',
    энергия: 'energy', материя: 'matter', другое: 'other', прочее: 'other',
  })
  if (key === 'canonStatus') return translate({ канон: 'canonical', каноническое: 'canonical', канонический: 'canonical', производное: 'derived', производный: 'derived', оригинальное: 'original', оригинальный: 'original' })
  if (key === 'category' && has('events')) return translate({ сюжет: 'story', история: 'story', инвентарь: 'inventory', предмет: 'inventory', персонаж: 'character', герой: 'character', отношения: 'relationship', отношение: 'relationship', задание: 'quest', квест: 'quest', мир: 'world', способность: 'ability', талант: 'ability', артефакт: 'artifact', реликвия: 'artifact', влияние: 'influence', услуга: 'influence', расследование: 'mystery', тайна: 'mystery' })
  if (key === 'category') return translate({ оружие: 'weapon', броня: 'armor', защита: 'armor', одежда: 'armor', расходник: 'consumable', припас: 'consumable', зелье: 'consumable', артефакт: 'artifact', реликвия: 'artifact', квест: 'quest', сюжетный: 'quest', материал: 'material', инструмент: 'other', другое: 'other', прочее: 'other' })
  if (key === 'kind' && has('archives')) return translate({ сцена: 'scene', глава: 'chapter', эра: 'era', эпоха: 'era' })
  if (key === 'kind' && has('memories')) return translate({ сводка: 'summary', итог: 'summary', факт: 'fact', обещание: 'promise', отношение: 'relationship', отношения: 'relationship', тайна: 'mystery', загадка: 'mystery' })
  if (key === 'type' && (has('threads') || has('thread'))) return translate({
    promise: 'promise', обещание: 'promise', клятва: 'promise', обязательство: 'promise', задача: 'promise', задание: 'promise', квест: 'promise', quest: 'promise', mission: 'promise', personal: 'promise',
    debt: 'debt', долг: 'debt', задолженность: 'debt', обязанность: 'debt', obligation: 'debt',
    witness: 'witness', свидетельство: 'witness', свидетель: 'witness', улика: 'witness', факт: 'witness', evidence: 'witness', testimony: 'witness',
    rumor: 'rumor', слух: 'rumor', слухи: 'rumor', тайна: 'rumor', загадка: 'rumor', mystery: 'rumor', secret: 'rumor',
  })
  if (key === 'type' && has('issues')) return translate({ канон: 'canon', непрерывность: 'continuity', последовательность: 'continuity', знания: 'knowledge', осведомлённость: 'knowledge', свобода: 'agency', агентность: 'agency', состояние: 'state', стиль: 'style' })
  if (key === 'type' && has('lore')) return translate({ персонаж: 'character', герой: 'character', локация: 'location', место: 'location', фракция: 'faction', организация: 'faction', предмет: 'object', объект: 'object', правило: 'rule', закон: 'rule', история: 'history', тайна: 'secret', секрет: 'secret' })
  if (key === 'status' && has('knowledge')) return translate({ известно: 'known', знает: 'known', убеждён: 'believed', убежден: 'believed', верит: 'believed', предполагает: 'suspected', подозревает: 'suspected', ложно: 'false', ложь: 'false' })
  if (key === 'status' && (has('threads') || has('thread'))) return translate({
    active: 'active', активно: 'active', активен: 'active', активна: 'active', открыто: 'active', открыт: 'active', открыта: 'active', известно: 'active', известен: 'active', известна: 'active', скрыто: 'active', скрыт: 'active', скрыта: 'active', open: 'active', known: 'active', hidden: 'active',
    fulfilled: 'fulfilled', исполнено: 'fulfilled', выполнено: 'fulfilled', completed: 'fulfilled',
    broken: 'broken', нарушено: 'broken', сорвано: 'broken', провалено: 'broken', failed: 'broken',
    resolved: 'resolved', разрешено: 'resolved', решено: 'resolved', завершено: 'resolved', закрыто: 'resolved', done: 'resolved',
  })
  if (key === 'status' && (has('worldEvents') || has('event'))) return translate({ запланировано: 'scheduled', ожидается: 'scheduled', назрело: 'due', наступило: 'due', выполнено: 'resolved', решено: 'resolved', завершено: 'resolved', отменено: 'cancelled' })
  if (key === 'status' && has('countermeasures')) return translate({
    доступна: 'available', доступно: 'available', готова: 'available', подготовлена: 'prepared', подготовлено: 'prepared',
    использована: 'spent', израсходована: 'spent', потрачена: 'spent', сорвана: 'broken', сломана: 'broken', разрушена: 'broken',
  })
  if (key === 'status' && (has('npcs') || has('npc'))) return translate({ активен: 'active', активна: 'active', активно: 'active', отсутствует: 'absent', пропал: 'missing', пропала: 'missing', мёртв: 'dead', мертв: 'dead', мертва: 'dead', неизвестно: 'unknown' })
  if (key === 'status' && (has('quests') || has('quest'))) return translate({ активно: 'active', активен: 'active', выполнено: 'completed', завершено: 'completed', провалено: 'failed', скрыто: 'hidden' })
  return value
}

function normalizeRelationships(value: Record<string, unknown>) {
  return Object.entries(value).map(([npcId, change]) => {
    if (typeof change === 'number' || typeof change === 'string') return { npcId, delta: parseNumberLike(change) }
    return isRecord(change) ? { ...change, npcId: change.npcId ?? npcId } : change
  })
}

type GroupedMutationCollection = {
  nestedKey: 'item' | 'npc' | 'quest' | 'thread' | 'event'
  operations: ReadonlySet<string>
}

const GROUPED_MUTATION_COLLECTIONS: Partial<Record<string, GroupedMutationCollection>> = {
  inventory: { nestedKey: 'item', operations: new Set(['add', 'update', 'remove']) },
  npcs: { nestedKey: 'npc', operations: new Set(['add', 'update']) },
  quests: { nestedKey: 'quest', operations: new Set(['add', 'update', 'complete', 'fail']) },
  threads: { nestedKey: 'thread', operations: new Set(['add', 'update', 'resolve', 'break']) },
  worldEvents: { nestedKey: 'event', operations: new Set(['add', 'update', 'resolve', 'cancel']) },
}

const MUTATION_PAYLOAD_KEYS = new Set([
  'id', 'targetId', 'operation', 'item', 'npc', 'quest', 'thread', 'event',
  'name', 'title', 'role', 'description', 'status', 'state', 'quantity', 'reason',
  'currentGoal', 'lastSeen', 'notes', 'objectives', 'detail', 'dueTurn', 'dueDay',
  'resourceDeltas', 'statDeltas', 'relationship', 'disposition', 'abilities',
])

function groupedMutationEntry(entry: unknown, operation: string, sourceId?: string): unknown[] {
  if (Array.isArray(entry)) return entry.flatMap((item) => groupedMutationEntry(item, operation))
  if (isRecord(entry)) {
    const hasOwnIdentity = typeof entry.targetId === 'string' || typeof entry.id === 'string' || typeof entry.id === 'number'
    return [{
      ...entry,
      operation,
      ...(!hasOwnIdentity && sourceId
        ? operation === 'add' ? { id: sourceId } : { targetId: sourceId }
        : {}),
    }]
  }
  if (operation !== 'add' && sourceId) return [{ operation, targetId: sourceId }]
  if (operation !== 'add' && (typeof entry === 'string' || typeof entry === 'number')) {
    return [{ operation, targetId: String(entry) }]
  }
  return []
}

/**
 * DeepSeek sometimes emits `npcs: { update: {...} }`. Generic object-to-array
 * conversion used to treat `update` as the NPC name. Flatten the operation
 * groups first, while preserving both single payloads and ID-keyed payload maps.
 */
function normalizeGroupedMutationCollection(key: string, value: Record<string, unknown>): unknown[] | undefined {
  const config = GROUPED_MUTATION_COLLECTIONS[key]
  if (!config) return undefined
  const groups = Object.entries(value).map(([sourceOperation, entries]) => ({
    operation: operationFor(sourceOperation, key),
    entries,
  }))
  if (!groups.length || groups.some(({ operation }) => typeof operation !== 'string' || !config.operations.has(operation))) return undefined

  return groups.flatMap(({ operation, entries }) => {
    const canonicalOperation = operation as string
    if (!isRecord(entries) || Object.keys(entries).some((field) => MUTATION_PAYLOAD_KEYS.has(field))) {
      return groupedMutationEntry(entries, canonicalOperation)
    }
    return Object.entries(entries).flatMap(([sourceId, entry]) => groupedMutationEntry(entry, canonicalOperation, sourceId))
  })
}

function normalizeRecordAsArray(key: string, value: Record<string, unknown>): unknown[] {
  if (key === 'relationships') {
    if (typeof value.npcId === 'string' || Object.hasOwn(value, 'delta')) return [value]
    return normalizeRelationships(value)
  }
  if (key === 'costs') {
    if (Object.hasOwn(value, 'resource') && Object.hasOwn(value, 'amount')) return [canonicalizeAbilityCost(value)]
    return Object.entries(value).map(([resource, amount]) => ({ resource, amount }))
  }
  if (key === 'facets') {
    return Object.entries(value).map(([sourceLabel, entry]) => {
      const details = isRecord(entry) ? entry : undefined
      const label = typeof details?.label === 'string' && details.label.trim() ? details.label : sourceLabel
      const facetValue = details?.value ?? details?.score ?? details?.rating ?? entry
      const description = String(details?.description ?? details?.summary ?? `${label}: ${String(facetValue)}/100`)
      return {
        key: typeof details?.key === 'string' && details.key.trim() ? details.key : enumToken(sourceLabel).replaceAll(' ', '-'),
        label,
        value: facetValue,
        description,
      }
    })
  }
  if (key === 'memories' && ['kind', 'content', 'tags', 'importance'].some((field) => Object.hasOwn(value, field))) {
    return [value]
  }
  if (key === 'history' && ['title', 'name', 'label', 'description', 'detail', 'content', 'summary'].some((field) => Object.hasOwn(value, field))) {
    return [value]
  }
  const identity = ARRAY_IDENTITY[key]
  return Object.entries(value).map(([sourceKey, entry]) => {
    if (!identity) return entry
    if (isRecord(entry)) {
      if (entry[identity] !== undefined) return entry
      if ((key === 'stats' || key === 'resources') && identity === 'key') {
        return { ...entry, key: sourceKey, label: entry.label ?? sourceKey }
      }
      return { ...entry, [identity]: sourceKey }
    }
    if (key === 'stats' || key === 'resources') return { key: sourceKey, label: sourceKey, value: entry }
    if (key === 'knowledge') return { subject: sourceKey, statement: String(entry) }
    return entry
  })
}

function normalizeCurrency(value: unknown): unknown {
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, amount]) => [key, parseNumberLike(amount)]))
  }
  if (Array.isArray(value)) {
    const entries = value.flatMap((entry) => {
      if (!isRecord(entry)) return []
      const name = entry.name ?? entry.label ?? entry.key ?? entry.currency
      const amount = entry.amount ?? entry.value ?? entry.balance
      return typeof name === 'string' && amount !== undefined ? [[name, parseNumberLike(amount)] as const] : []
    })
    return entries.length ? Object.fromEntries(entries) : value
  }
  if (typeof value === 'string') {
    const amount = parseNumberLike(value)
    if (typeof amount !== 'number') return value
    const unit = value.replace(/-?\d+(?:[.,]\d+)?/u, '').trim().replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '')
    return { [unit || 'currency']: amount }
  }
  return typeof value === 'number' && Number.isFinite(value) ? { currency: value } : value
}

function normalizeParty(value: unknown): unknown {
  const source = isRecord(value)
    ? [
        ...(Array.isArray(value.members) ? value.members : []),
        ...(Array.isArray(value.participants) ? value.participants : []),
        ...(Object.hasOwn(value, 'npcId') || Object.hasOwn(value, 'id') ? [value] : []),
      ]
    : Array.isArray(value)
      ? value
      : []
  if (!source.length && !isRecord(value)) return value

  const addNpcIds = new Set<string>()
  const removeNpcIds = new Set<string>()
  const roles: Record<string, string> = {}
  if (isRecord(value)) {
    const addValues = Array.isArray(value.addNpcIds) ? value.addNpcIds : Array.isArray(value.add) ? value.add : []
    const removeValues = Array.isArray(value.removeNpcIds) ? value.removeNpcIds : Array.isArray(value.remove) ? value.remove : []
    addValues.forEach((entry) => { if (typeof entry === 'string' || typeof entry === 'number') addNpcIds.add(String(entry)) })
    removeValues.forEach((entry) => { if (typeof entry === 'string' || typeof entry === 'number') removeNpcIds.add(String(entry)) })
    if (isRecord(value.roles)) Object.entries(value.roles).forEach(([npcId, role]) => {
      if (typeof role === 'string' && role.trim()) roles[npcId] = role.trim()
    })
  }
  source.forEach((entry) => {
    if (typeof entry === 'string' || typeof entry === 'number') {
      addNpcIds.add(String(entry))
      return
    }
    if (!isRecord(entry)) return
    const rawId = entry.npcId ?? entry.id ?? entry.targetId
    if (typeof rawId !== 'string' && typeof rawId !== 'number') return
    const npcId = String(rawId)
    const operation = String(entry.operation ?? entry.action ?? entry.status ?? '').toLocaleLowerCase('ru-RU')
    const removes = entry.joined === false || /remove|leave|left|dismiss|kick|покин|уш[её]л|убр|исключ/u.test(operation)
    if (removes) removeNpcIds.add(npcId)
    else addNpcIds.add(npcId)
    const role = entry.role ?? entry.partyRole ?? entry.party_role ?? entry.position
    if (!removes && typeof role === 'string' && role.trim()) roles[npcId] = role.trim()
  })
  removeNpcIds.forEach((npcId) => {
    addNpcIds.delete(npcId)
    delete roles[npcId]
  })
  const normalized: Record<string, unknown> = {}
  if (addNpcIds.size) normalized.addNpcIds = [...addNpcIds]
  if (removeNpcIds.size) normalized.removeNpcIds = [...removeNpcIds]
  if (Object.keys(roles).length) normalized.roles = roles
  return normalized
}

const SERVER_OWNED_ENTRY_KEYS = new Set(['id', 'turn', 'createdAt'])
const ABILITY_COST_KEYS = new Set(['resource', 'amount'])

function withoutServerOwnedEntryKeys(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !SERVER_OWNED_ENTRY_KEYS.has(key)))
}

function isArrayEntryOf(path: string[], key: string): boolean {
  return path.at(-1) === '[]' && path.at(-2) === key
}

function isProgressHistoryTuple(value: unknown): value is unknown[] {
  if (!Array.isArray(value) || value.length < 2 || value.length > 4) return false
  if (value.some((entry) => Array.isArray(entry) || isRecord(entry))) return false
  const [title, description] = value
  return title !== undefined && title !== null && description !== undefined && description !== null
}

function normalizeProgressHistoryEntry(value: unknown): unknown {
  // DeepSeek sometimes serializes the authored history object positionally as
  // [title, description, id, turn]. The last two values are server metadata;
  // only the authored text belongs in a TurnPatch.
  if (isProgressHistoryTuple(value)) {
    return { title: value[0], description: value[1] }
  }
  if (!isRecord(value)) return value
  const normalized = withoutServerOwnedEntryKeys(value)
  const title = normalized.title ?? normalized.name ?? normalized.label
  const description = normalized.description ?? normalized.detail ?? normalized.content ?? normalized.summary
  delete normalized.name
  delete normalized.label
  delete normalized.detail
  delete normalized.content
  delete normalized.summary
  return {
    ...normalized,
    ...(title !== undefined ? { title } : {}),
    ...(description !== undefined ? { description } : {}),
  }
}

function progressionHistoryValues(value: unknown): unknown[] | undefined {
  if (isProgressHistoryTuple(value)) return [normalizeProgressHistoryEntry(value)]
  if (Array.isArray(value)) return value.map(normalizeProgressHistoryEntry)
  if (isRecord(value)) {
    const looksLikeEntry = ['title', 'name', 'label', 'description', 'detail', 'content', 'summary']
      .some((key) => Object.hasOwn(value, key))
    if (looksLikeEntry) return [normalizeProgressHistoryEntry(value)]
    return Object.values(value).map(normalizeProgressHistoryEntry)
  }
  if (value === undefined || value === null) return undefined
  return [value]
}

function firstDefined(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined) return record[key]
  }
  return undefined
}

function removeKeys(record: Record<string, unknown>, keys: string[]) {
  keys.forEach((key) => delete record[key])
}

function normalizePowerMasteryDeltas(value: unknown, powerId: unknown): Record<string, unknown> | undefined {
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([id, delta]) => [id, parseNumberLike(delta)]))
  }
  if (Array.isArray(value)) {
    const entries = value.flatMap((entry) => {
      if (!isRecord(entry)) return []
      const id = firstDefined(entry, ['powerId', 'id', 'power'])
      const delta = firstDefined(entry, ['delta', 'masteryDelta', 'powerMasteryDelta', 'powerMastery', 'mastery', 'value'])
      return (typeof id === 'string' || typeof id === 'number') && delta !== undefined
        ? [[String(id), parseNumberLike(delta)] as const]
        : []
    })
    return entries.length ? Object.fromEntries(entries) : undefined
  }
  if ((typeof powerId === 'string' || typeof powerId === 'number') && value !== undefined) {
    return { [String(powerId)]: parseNumberLike(value) }
  }
  return undefined
}

function canonicalizeProgressionChange(value: Record<string, unknown>, kind: 'ability' | 'artifact'): Record<string, unknown> {
  const result = { ...value }
  const history = firstDefined(result, ['history', 'historyEntries', 'historyEntry', 'progressHistory'])
  if (history !== undefined) result.history = history
  removeKeys(result, ['historyEntries', 'historyEntry', 'progressHistory'])

  if (kind === 'ability') {
    const abilityId = firstDefined(result, ['abilityId', 'abilityID', 'targetId', 'ability', 'id'])
    if (result.abilityId === undefined && abilityId !== undefined) result.abilityId = abilityId
    removeKeys(result, ['abilityID', 'targetId', 'ability', 'id'])
    const masteryDelta = firstDefined(result, ['masteryDelta', 'masteryChange', 'mastery_delta'])
    if (result.masteryDelta === undefined && masteryDelta !== undefined) result.masteryDelta = masteryDelta
    removeKeys(result, ['masteryChange', 'mastery_delta'])
    return result
  }

  const itemId = firstDefined(result, ['itemId', 'artifactId', 'artifactID', 'targetId', 'artifact', 'id'])
  if (result.itemId === undefined && itemId !== undefined) result.itemId = itemId
  removeKeys(result, ['artifactId', 'artifactID', 'targetId', 'artifact', 'id'])

  const attunementDelta = firstDefined(result, ['attunementDelta', 'attunementChange', 'attunement_delta'])
  if (result.attunementDelta === undefined && attunementDelta !== undefined) result.attunementDelta = attunementDelta
  removeKeys(result, ['attunementChange', 'attunement_delta'])

  const bondDelta = firstDefined(result, ['bondDelta', 'bondChange', 'bond_delta'])
  if (result.bondDelta === undefined && bondDelta !== undefined) result.bondDelta = bondDelta
  removeKeys(result, ['bondChange', 'bond_delta'])

  const overallMasteryDelta = firstDefined(result, ['masteryDelta', 'powerMasteryDelta'])
  if (result.masteryDelta === undefined && overallMasteryDelta !== undefined) result.masteryDelta = overallMasteryDelta
  removeKeys(result, ['powerMasteryDelta'])

  const powerMastery = firstDefined(result, [
    'powerMasteryDeltas', 'powerMasteryChanges', 'powerMasteries', 'masteryByPower',
    'powerMastery',
  ])
  const powerId = firstDefined(result, ['powerId', 'artifactPowerId'])
  const powerMasteryDeltas = normalizePowerMasteryDeltas(powerMastery, powerId)
  if (result.powerMasteryDeltas === undefined && powerMasteryDeltas) result.powerMasteryDeltas = powerMasteryDeltas
  // A scalar without a model-supplied power id describes the artifact-level absolute
  // mastery. It must not be attached to an invented power id.
  if (result.powerMasteryDeltas === undefined && powerMastery !== undefined && !isRecord(powerMastery) && !Array.isArray(powerMastery)) {
    if (result.mastery === undefined) result.mastery = powerMastery
  }
  removeKeys(result, [
    'powerMasteryChanges', 'powerMasteries', 'masteryByPower', 'powerMastery',
    'powerId', 'artifactPowerId',
  ])
  return result
}

function normalizeProgressionChanges(value: unknown, kind: 'ability' | 'artifact'): unknown {
  const idKey = kind === 'ability' ? 'abilityId' : 'itemId'
  const idAliases = kind === 'ability'
    ? ['abilityId', 'abilityID', 'targetId', 'ability', 'id']
    : ['itemId', 'artifactId', 'artifactID', 'targetId', 'artifact', 'id']
  const source = Array.isArray(value)
    ? value
    : isRecord(value)
      ? idAliases.some((key) => Object.hasOwn(value, key)) || Object.hasOwn(value, 'history')
        ? [value]
        : Object.entries(value).map(([id, entry]) => isRecord(entry) && firstDefined(entry, idAliases) === undefined
          ? { ...entry, [idKey]: id }
          : entry)
      : [value]
  return source.flatMap((entry) => {
    if (entry === undefined || entry === null) return []
    if (typeof entry === 'string' && !entry.trim()) return []
    if (!isRecord(entry)) return [entry]
    if (Object.keys(entry).length === 0) return []
    const normalized = canonicalizeProgressionChange(entry, kind)
    if (Object.keys(normalized).length === 0) return []
    const histories = progressionHistoryValues(normalized.history)
    if (!histories || histories.length <= 1) {
      return [{ ...normalized, ...(histories?.length === 1 ? { history: histories[0] } : {}) }]
    }
    const change = { ...normalized }
    delete change.history
    return [
      { ...change, history: histories[0] },
      ...histories.slice(1).map((history) => ({ [idKey]: change[idKey], history })),
    ]
  })
}

type ReputationNormalization = {
  upserts: Array<Record<string, unknown>>
  deltas: Record<string, unknown>
}

function normalizeFactionReputation(value: unknown, mode: 'absolute' | 'delta'): ReputationNormalization {
  const result: ReputationNormalization = { upserts: [], deltas: {} }
  const accept = (entry: unknown, sourceName?: string) => {
    if (!isRecord(entry)) {
      if (sourceName) {
        if (mode === 'delta') result.deltas[sourceName] = parseNumberLike(entry)
        else result.upserts.push({ factionName: sourceName, value: parseNumberLike(entry) })
      }
      return
    }
    const factionName = firstDefined(entry, ['factionName', 'faction', 'name', 'key']) ?? sourceName
    if (typeof factionName !== 'string' && typeof factionName !== 'number') return
    const name = String(factionName)
    const delta = firstDefined(entry, ['delta', 'change', 'reputationDelta', 'valueDelta'])
    if (delta !== undefined || mode === 'delta') {
      const amount = delta ?? firstDefined(entry, ['value', 'score', 'reputation', 'amount'])
      if (amount !== undefined) result.deltas[name] = parseNumberLike(amount)
      return
    }
    const value = firstDefined(entry, ['value', 'score', 'reputation', 'amount'])
    if (value === undefined) return
    const label = firstDefined(entry, ['label', 'status', 'attitude'])
    const notes = firstDefined(entry, ['notes', 'note', 'reasons'])
    result.upserts.push({
      factionName: name,
      value: parseNumberLike(value),
      ...(label !== undefined ? { label } : {}),
      ...(notes !== undefined ? { notes } : {}),
    })
  }

  if (Array.isArray(value)) value.forEach((entry) => accept(entry))
  else if (isRecord(value)) {
    const looksLikeEntry = ['factionName', 'faction', 'name', 'key', 'value', 'delta', 'change', 'reputationDelta']
      .some((key) => Object.hasOwn(value, key))
    if (looksLikeEntry) accept(value)
    else Object.entries(value).forEach(([name, entry]) => accept(entry, name))
  } else accept(value)
  return result
}

function mergeReputationUpserts(aliasEntries: Array<Record<string, unknown>>, canonical: unknown): unknown {
  const canonicalEntries = Array.isArray(canonical) ? canonical.filter(isRecord) : []
  const byName = new Map<string, Record<string, unknown>>()
  aliasEntries.forEach((entry) => {
    if (typeof entry.factionName === 'string') byName.set(entry.factionName, entry)
  })
  canonicalEntries.forEach((entry) => {
    if (typeof entry.factionName === 'string') byName.set(entry.factionName, entry)
  })
  return [...byName.values()]
}

function canonicalizePatchContainer(value: Record<string, unknown>): Record<string, unknown> {
  const result = { ...value }
  const playerAliases = ['player', 'hero', 'protagonist', 'герой', 'персонажИгрока']
  const nestedPlayers = playerAliases.map((key) => result[key]).filter(isRecord)
  if (nestedPlayers.length) {
    const player = Object.assign({}, ...nestedPlayers)
    const nestedProfile = isRecord(player.profile) ? player.profile : {}
    const profileKeys = ['name', 'archetype', 'appearance', 'personality', 'backstory', 'goal', 'levelDelta', 'lifeState']
    const profile = {
      ...nestedProfile,
      ...Object.fromEntries(profileKeys.flatMap((key) => player[key] !== undefined ? [[key, player[key]]] : [])),
      ...(isRecord(result.playerProfile) ? result.playerProfile : {}),
    }
    if (Object.keys(profile).length) result.playerProfile = profile

    const arrayAliases: Array<[string, string]> = [
      ['stats', 'upsertStats'], ['resources', 'upsertResources'], ['abilities', 'addAbilities'],
      ['statusEffects', 'upsertStatusEffects'], ['conditions', 'addConditions'], ['inventory', 'inventory'],
    ]
    for (const [source, target] of arrayAliases) {
      if (result[target] === undefined && player[source] !== undefined) result[target] = player[source]
    }
    const directPatchKeys = [
      'removeStatKeys', 'removeResourceKeys', 'statDeltas', 'resourceDeltas', 'currencyDeltas',
      'removeAbilityIds', 'abilityChanges', 'artifactChanges', 'removeConditions',
      'removeStatusEffectIds', 'relationships',
    ]
    for (const patchKey of directPatchKeys) {
      if (result[patchKey] === undefined && player[patchKey] !== undefined) result[patchKey] = player[patchKey]
    }
    if (result.upsertCurrency === undefined && player.currency !== undefined) result.upsertCurrency = normalizeCurrency(player.currency)
    removeKeys(result, playerAliases)
  }

  const sceneAliases = ['currentScene', 'current_scene', 'sceneUpdate', 'scenePatch']
  const aliasScene = firstDefined(result, sceneAliases)
  if (aliasScene !== undefined) {
    result.scene = isRecord(aliasScene) && isRecord(result.scene)
      ? { ...aliasScene, ...result.scene }
      : result.scene ?? aliasScene
    removeKeys(result, sceneAliases)
  }

  const absoluteAliases = ['factionReputation', 'factionReputations', 'faction_reputation', 'reputationByFaction']
  const deltaAliases = ['factionReputationChanges', 'faction_reputation_changes', 'reputationChanges']
  const absolute = absoluteAliases.flatMap((key) => result[key] === undefined
    ? []
    : [normalizeFactionReputation(result[key], 'absolute')])
  const deltas = deltaAliases.flatMap((key) => result[key] === undefined
    ? []
    : [normalizeFactionReputation(result[key], 'delta')])
  const canonicalUpserts = result.upsertFactionReputation === undefined
    ? { upserts: [], deltas: {} }
    : normalizeFactionReputation(result.upsertFactionReputation, 'absolute')
  const canonicalDeltas = result.factionReputationDeltas === undefined
    ? { upserts: [], deltas: {} }
    : normalizeFactionReputation(result.factionReputationDeltas, 'delta')
  const upserts = [...absolute, ...deltas].flatMap((entry) => entry.upserts)
  const aliasDeltas = Object.assign({}, ...absolute.map((entry) => entry.deltas), ...deltas.map((entry) => entry.deltas))
  if (upserts.length > 0 || canonicalUpserts.upserts.length > 0) {
    result.upsertFactionReputation = mergeReputationUpserts(upserts, canonicalUpserts.upserts)
  }
  if (Object.keys(aliasDeltas).length > 0 || Object.keys(canonicalDeltas.deltas).length > 0) {
    result.factionReputationDeltas = {
      ...aliasDeltas,
      ...canonicalDeltas.deltas,
    }
  }
  removeKeys(result, [...absoluteAliases, ...deltaAliases])
  return result
}

function canonicalizeAbilityCost(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([key]) => ABILITY_COST_KEYS.has(key)))
}

const ABILITY_RECORD_COLLECTIONS = new Set(['abilities', 'addAbilities', 'upsertAbilities', 'abilityChanges'])
const ABILITY_AVAILABILITY_KEYS = new Set(['state', 'reasons', 'nextReady', 'charges', 'lastUsedTurn'])
const ABSENT_ABILITY_MECHANIC = new Set([
  '', '-', '—', 'none', 'no', 'n/a', 'not applicable', 'absent', 'unlimited',
  'нет', 'нет требований', 'без требований', 'нет ограничений', 'без ограничений',
  'нет отката', 'без отката', 'отсутствует', 'не требуется', 'неограниченно',
])

function isAbsentAbilityMechanic(value: unknown): boolean {
  return typeof value === 'string' && ABSENT_ABILITY_MECHANIC.has(enumToken(value))
}

function canonicalizeAbilityAvailability(value: Record<string, unknown>): Record<string, unknown> {
  const result = { ...value }
  if (isRecord(result.nextReady)) {
    const nextReady = canonicalizeNextReady(result.nextReady)
    const value = parseNumberLike(nextReady.value)
    const readyNow = typeof result.state === 'string'
      && ['ready', 'available', 'usable', 'prepared', 'active'].includes(enumToken(result.state))
      && typeof value === 'number' && value <= 0
    if (readyNow || Object.keys(nextReady).length === 0) delete result.nextReady
    else result.nextReady = nextReady
  }
  const charges = result.charges
  if (charges === undefined || charges === null) {
    delete result.charges
    return result
  }

  const scalarCharges = parseNumberLike(charges)
  if (typeof scalarCharges === 'number' && Number.isFinite(scalarCharges) && scalarCharges <= 0) {
    delete result.charges
    return result
  }

  // A scalar or partial charge count has no stable maximum, label or consumption rule.
  // Dropping that ambiguous optional mechanic is safer than inventing the missing rules.
  if (!isRecord(charges)) {
    delete result.charges
    return result
  }
  const maximum = parseNumberLike(charges.max)
  const current = parseNumberLike(charges.current)
  const label = typeof charges.label === 'string' ? charges.label.trim() : ''
  const onlyChargeShape = Object.keys(charges).every((key) => ['current', 'max', 'label'].includes(key))
  const explicitlyHasNoCapacity = typeof maximum === 'number' && Number.isFinite(maximum) && maximum <= 0
  const emptyNoChargeSentinel = maximum === undefined
    && label.length === 0
    && onlyChargeShape
    && (current === undefined || (typeof current === 'number' && Number.isFinite(current) && current <= 0))

  const completeChargeMechanic = typeof maximum === 'number' && Number.isFinite(maximum) && maximum > 0
    && typeof current === 'number' && Number.isFinite(current) && current >= 0 && current <= maximum
    && label.length > 0

  // DeepSeek sometimes emits { current: 0, max: 0 } to mean that an ability
  // does not use discrete charges. The whole optional mechanic must be absent;
  // inventing a positive capacity or a label would change the authored ability.
  if (explicitlyHasNoCapacity || emptyNoChargeSentinel || !completeChargeMechanic) delete result.charges
  return result
}

function canonicalizeNextReady(value: Record<string, unknown>): Record<string, unknown> {
  const unitAliases = [
    ['turn', 'turn'], ['turns', 'turn'], ['scene', 'scene'], ['scenes', 'scene'],
    ['day', 'day'], ['days', 'day'],
  ] as const
  const explicitUnit = typeof value.unit === 'string' ? enumToken(value.unit) : undefined
  const aliasedUnit = unitAliases.find(([key]) => value[key] !== undefined)
  const unit = explicitUnit || aliasedUnit?.[1] || (value.condition !== undefined ? 'condition' : undefined)
  const amount = value.value ?? (aliasedUnit ? value[aliasedUnit[0]] : undefined)
  const result: Record<string, unknown> = {}
  if (unit !== undefined) result.unit = unit
  if (amount !== undefined) result.value = amount
  if (value.condition !== undefined) result.condition = value.condition
  return result
}

function rawValues(value: unknown): unknown[] {
  if (value === undefined || value === null) return []
  return Array.isArray(value) ? value : [value]
}

function mergeRawValues(...sources: unknown[]): unknown[] {
  const result: unknown[] = []
  const seen = new Set<string>()
  sources.flatMap(rawValues).forEach((entry) => {
    const identity = typeof entry === 'object' ? JSON.stringify(entry) : `${typeof entry}:${String(entry)}`
    if (seen.has(identity)) return
    seen.add(identity)
    result.push(entry)
  })
  return result
}

function rawCosts(value: unknown): unknown[] {
  if (!isRecord(value)) return rawValues(value)
  if (Object.hasOwn(value, 'resource') || Object.hasOwn(value, 'amount')) return [value]
  return Object.entries(value).map(([resource, amount]) => ({ resource, amount }))
}

function availabilityCooldownText(value: unknown): string | undefined {
  const parts = rawValues(value).flatMap((entry) => {
    if (typeof entry === 'string' || typeof entry === 'number') return String(entry).trim() ? [String(entry).trim()] : []
    if (!isRecord(entry)) return []
    return Object.entries(entry).map(([label, detail]) => `${label}: ${String(detail)}`)
  })
  return parts.length ? [...new Set(parts)].join(' · ') : undefined
}

function currentAvailabilityReasons(availability: Record<string, unknown>): unknown[] {
  if (availability.reasons !== undefined) return rawValues(availability.reasons)
  const state = typeof availability.state === 'string' ? enumToken(availability.state) : ''
  if (['ready', 'available', 'usable', 'prepared', 'active', 'готова', 'готов', 'доступна', 'доступен'].includes(state)) return []
  return mergeRawValues(availability.cooldown, availability.limitations, availability.requirements, availability.drawbacks)
}

function canonicalizeAbilityRecord(value: Record<string, unknown>, path: string[]): Record<string, unknown> {
  if (path.at(-1) !== '[]' || !ABILITY_RECORD_COLLECTIONS.has(path.at(-2) ?? '')) return value
  let result = { ...value }

  if (isAbsentAbilityMechanic(result.cooldown)) delete result.cooldown

  for (const profileKey of ['profile', 'profileChanges'] as const) {
    const profile = result[profileKey]
    if (!isRecord(profile) || !isRecord(profile.availability)) continue
    const availability = profile.availability
    const misplacedLimitations = mergeRawValues(availability.limitations, availability.drawbacks)
    const misplacedCooldown = availabilityCooldownText(availability.cooldown)

    if (availability.costs !== undefined) result.costs = mergeRawValues(rawCosts(result.costs), rawCosts(availability.costs))
    if (availability.requirements !== undefined) result.requirements = mergeRawValues(result.requirements, availability.requirements)
    if (misplacedLimitations.length) result.limitations = mergeRawValues(result.limitations, misplacedLimitations)
    if (misplacedCooldown) {
      const existing = availabilityCooldownText(result.cooldown)
      result.cooldown = existing && existing !== misplacedCooldown ? `${existing} · ${misplacedCooldown}` : misplacedCooldown
    }

    const cleanAvailability = Object.fromEntries(
      Object.entries(availability).filter(([key]) => ABILITY_AVAILABILITY_KEYS.has(key)),
    )
    cleanAvailability.reasons = currentAvailabilityReasons(availability)
    result = { ...result, [profileKey]: { ...profile, availability: cleanAvailability } }
  }

  return result
}

function looksLikePatchContainer(value: Record<string, unknown>, path: string[]): boolean {
  if (path.at(-1) === 'statePatch') return true
  return ['currentScene', 'current_scene', 'sceneUpdate', 'scenePatch', 'factionReputationChanges', 'faction_reputation_changes', 'reputationChanges']
    .some((key) => Object.hasOwn(value, key))
}

function canonicalizeAntagonistPlanRecord(value: Record<string, unknown>, path: string[]): Record<string, unknown> {
  const collection = path.at(-2)
  if (path.at(-1) !== '[]' || (collection !== 'antagonistPlans' && collection !== 'upsertAntagonistPlans')) return value

  const result = { ...value }
  const pressureAliases: Record<string, number> = {
    low: 25, minor: 25, weak: 25, низкое: 25, низкий: 25, слабое: 25,
    medium: 50, moderate: 50, normal: 50, среднее: 50, средний: 50, умеренное: 50,
    high: 75, strong: 75, высокое: 75, высокий: 75, сильное: 75,
    critical: 95, extreme: 95, критическое: 95, критический: 95, экстремальное: 95,
  }
  if (typeof result.pressure === 'string') {
    const numeric = parseNumberLike(result.pressure)
    result.pressure = typeof numeric === 'number' ? numeric : (pressureAliases[enumToken(result.pressure)] ?? result.pressure)
  }

  if (typeof result.currentStep === 'string') {
    const numeric = parseNumberLike(result.currentStep)
    if (typeof numeric === 'number') {
      result.currentStep = numeric
    } else if (Array.isArray(result.steps) && result.steps.length > 0) {
      const words = (text: unknown) => new Set(enumToken(String(text ?? '')).split(/[^\p{L}\p{N}]+/u).filter((word) => word.length >= 4))
      const requested = words(result.currentStep)
      let bestIndex = -1
      let bestScore = 0
      result.steps.forEach((step, index) => {
        if (!isRecord(step)) return
        const candidate = words([step.title, step.trigger, step.consequence].filter(Boolean).join(' '))
        const score = [...requested].filter((word) => candidate.has(word)).length
        if (score > bestScore) { bestScore = score; bestIndex = index }
      })
      if (bestIndex < 0) {
        bestIndex = result.steps.findIndex((step) => isRecord(step) && step.status === 'active')
        if (bestIndex < 0) bestIndex = result.steps.findIndex((step) => isRecord(step) && step.status === 'pending')
        if (bestIndex < 0) bestIndex = 0
      }
      result.currentStep = bestIndex
    }
  }

  if (typeof result.currentStep === 'number' && Array.isArray(result.steps) && result.steps.length > 0) {
    result.currentStep = Math.max(0, Math.min(Math.trunc(result.currentStep), result.steps.length - 1))
  }
  return result
}

export function normalizeModelOutput(value: unknown, path: string[] = []): unknown {
  const key = path.at(-1)
  const parent = path.at(-2) === '[]' ? path.at(-3) : path.at(-2)

  if (isRecord(value)) {
    let record = canonicalizeAbilityRecord(value, path)
    if (key === 'availability') record = canonicalizeAbilityAvailability(record)
    if (key === 'nextReady' && path.includes('availability')) record = canonicalizeNextReady(record)
    if (key === 'nature' && path.includes('profile') && path.includes('abilities') && !record.groupId && typeof record.kind === 'string') {
      const misplacedGroup = enumToken(record.kind).replaceAll(' ', '-')
      const technicalKinds = new Set(['innate', 'trained', 'technological', 'social', 'authority', 'access', 'economic', 'organizational', 'contractual', 'divine', 'psionic', 'magical', 'biological', 'other'])
      if (misplacedGroup && !technicalKinds.has(misplacedGroup)) record = { ...record, groupId: misplacedGroup }
    }
    if (key === 'standing' && (path.includes('profile') || path.includes('profileChanges')) && !record.tierId && typeof record.tierLabel === 'string' && record.tierLabel.trim()) {
      record = { ...record, tierId: record.tierLabel }
    }
    if (isArrayEntryOf(path, 'memories') || (isArrayEntryOf(path, 'events') && path.includes('statePatch'))) record = withoutServerOwnedEntryKeys(record)
    if (isArrayEntryOf(path, 'costs')) record = canonicalizeAbilityCost(record)
    if (looksLikePatchContainer(record, path)) record = canonicalizePatchContainer(record)
    value = record
  }

  if (key === 'currency') return normalizeCurrency(value)
  if (key === 'duration') value = normalizeDuration(value)
  if (key === 'party') value = normalizeParty(value)
  if (key === 'evidence' && path.includes('abilityExecutions') && Array.isArray(value)) {
    value = value
      .filter((entry) => entry !== undefined && entry !== null && String(entry).trim())
      .map((entry) => String(entry).trim())
      .join('; ')
  }

  if (key === 'abilityChanges') value = normalizeProgressionChanges(value, 'ability')
  if (key === 'artifactChanges') value = normalizeProgressionChanges(value, 'artifact')

  if (parent && DISCOVERY_KNOWLEDGE_RECORDS.has(parent)) return normalizeDiscoveryKnowledgeLevel(value)

  const isPresentationLabel = path.includes('presentation') && path.some((segment) => ['labels', 'categoryLabels', 'rarityLabels'].includes(segment))
  const isSingularProgressionHistory = key === 'history' && (path.includes('abilityChanges') || path.includes('artifactChanges'))
  const isSingularSystemConsequences = key === 'consequences' && path.includes('system')
  const isSingularAuditEvidence = key === 'evidence' && (path.includes('omissions') || path.includes('narrativeIssues'))
  const isSingularAbilityExecutionEvidence = key === 'evidence' && path.includes('abilityExecutions')
  if (key && ARRAY_KEYS.has(key) && !isPresentationLabel && !isSingularProgressionHistory && !isSingularSystemConsequences && !isSingularAuditEvidence && !isSingularAbilityExecutionEvidence && !Array.isArray(value)) {
    if (isRecord(value)) {
      const groupedMutations = path.includes('statePatch') ? normalizeGroupedMutationCollection(key, value) : undefined
      value = groupedMutations ?? normalizeRecordAsArray(key, value)
    }
    else if (value !== null && value !== undefined) value = [value]
  }

  if (Array.isArray(value)) {
    const normalized = value.map((entry) => normalizeModelOutput(entry, [...path, '[]']))
    let withStringIds = key && ID_ARRAY_KEYS.has(key)
      ? normalized.map((entry) => typeof entry === 'number' ? String(entry) : entry)
      : normalized
    if (key === 'costs') {
      // Empty/zero entries are a common DeepSeek representation of "free". They are
      // not persisted as fake mana/energy mechanics and therefore cannot create a resource.
      withStringIds = withStringIds.filter((entry) => isRecord(entry)
        && typeof entry.resource === 'string' && Boolean(entry.resource.trim())
        && typeof entry.amount === 'number' && Number.isFinite(entry.amount) && entry.amount > 0)
    }
    if ((key === 'requirements' || key === 'limitations') && path.some((segment) => (
      ['abilities', 'addAbilities', 'upsertAbilities', 'abilityChanges', 'techniques', 'addTechniques', 'techniqueChanges', 'powers', 'addPowers', 'powerChanges'].includes(segment)
    ))) {
      withStringIds = withStringIds.filter((entry) => !isAbsentAbilityMechanic(entry))
    }
    const limit = key ? ARRAY_LIMITS[key] : undefined
    const mustPreserveEveryEntry = key === 'abilityChanges' || key === 'artifactChanges'
    return limit && !mustPreserveEveryEntry ? withStringIds.slice(0, limit) : withStringIds
  }

  if (isRecord(value)) {
    const normalizedRecord = Object.fromEntries(Object.entries(value).map(([childKey, entry]) => [childKey, normalizeModelOutput(entry, [...path, childKey])]))
    return canonicalizeAntagonistPlanRecord(normalizedRecord, path)
  }

  if (key && BOOLEAN_KEYS.has(key)) return parseBooleanLike(value)
  if (key && NUMBER_KEYS.has(key)) return parseNumberLike(value)
  if (key && ID_KEYS.has(key) && typeof value === 'number') return String(value)
  if (key === 'operation') return operationFor(value, parent)
  if (['accent', 'accentStrong', 'secondary', 'color'].includes(key ?? '')) return normalizeHexColor(value)
  return enumFor(value, key, path)
}

const GENERATED_INTERFACE_KEY_BINDINGS = new Set([
  'player.resource', 'player.stat', 'player.currency', 'player.condition-count', 'inventory.category-count',
])
const GENERATED_INTERFACE_TARGET_BINDINGS = new Set([
  'conflict.participant-readiness', 'conflict.participant-morale', 'world.process-momentum', 'world.pressure',
  'inventory.item-charges', 'inventory.item-quantity', 'inventory.item-durability', 'artifact.mastery',
  'artifact.attunement', 'artifact.bond', 'quest.objective-progress', 'mystery.progress',
  'npc.initiative-urgency', 'npc.relationship',
])
const GENERATED_INTERFACE_KEY_AND_TARGET_BINDINGS = new Set([
  'artifact.power-mastery', 'npc.stat', 'npc.resource', 'npc.relationship-dimension',
])
const GENERATED_INTERFACE_KEY_OR_TARGET_BINDINGS = new Set([
  'player.ability-mastery', 'world.metric', 'world.location-danger', 'faction.reputation', 'faction.power',
])

const authoredBindingReference = (value: unknown): value is string => typeof value === 'string' && Boolean(value.trim())

const generatedManifestReferenceToken = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const normalized = value.normalize('NFKC').trim().toLocaleLowerCase('ru-RU').replaceAll('ё', 'е').replace(/\s+/gu, ' ')
  return normalized || undefined
}

const generatedManifestNameIndex = (entries: unknown[], key = 'name') => new Map(entries.flatMap((entry) => {
  if (!isRecord(entry)) return []
  const value = entry[key]
  const token = generatedManifestReferenceToken(value)
  return token && typeof value === 'string' ? [[token, value.trim()] as const] : []
}))

/**
 * The manifest is a routing passport, not the final authored world. Optional links must never
 * invalidate otherwise usable entities. DeepSeek often names a correct canonical country only in
 * parentName, or attaches a historical legend to a character that was intentionally not selected
 * for the active NPC roster. Keep the place/legend and remove only the unverifiable link; never
 * invent a parent place or NPC. Existing links are canonicalized to the exact manifest spelling.
 */
function normalizeGeneratedWorldManifestReferences(root: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(root.places) || !Array.isArray(root.npcs) || !Array.isArray(root.legends) || !isRecord(root.player)) return root

  const player = root.player
  const placeNames = generatedManifestNameIndex(root.places)
  const factionNames = Array.isArray(root.factions) ? generatedManifestNameIndex(root.factions) : new Map<string, string>()
  const characterNames = generatedManifestNameIndex([player, ...root.npcs])

  const places = root.places.map((source) => {
    if (!isRecord(source)) return source
    const place = { ...source }
    const ownName = generatedManifestReferenceToken(place.name)
    const parentToken = generatedManifestReferenceToken(place.parentName)
    const canonicalParent = parentToken ? placeNames.get(parentToken) : undefined
    if (canonicalParent && parentToken !== ownName) place.parentName = canonicalParent
    else delete place.parentName

    const factionToken = generatedManifestReferenceToken(place.controllingFactionName)
    const canonicalFaction = factionToken ? factionNames.get(factionToken) : undefined
    if (canonicalFaction) place.controllingFactionName = canonicalFaction
    else delete place.controllingFactionName
    return place
  })

  const npcs = root.npcs.map((source) => {
    if (!isRecord(source)) return source
    const npc = { ...source }
    const locationToken = generatedManifestReferenceToken(npc.locationName)
    const canonicalLocation = locationToken ? placeNames.get(locationToken) : undefined
    if (canonicalLocation) npc.locationName = canonicalLocation
    else delete npc.locationName

    if (Array.isArray(npc.factionNames)) {
      npc.factionNames = [...new Set(npc.factionNames.flatMap((value) => {
        const factionToken = generatedManifestReferenceToken(value)
        const canonicalFaction = factionToken ? factionNames.get(factionToken) : undefined
        return canonicalFaction ? [canonicalFaction] : []
      }))]
    }
    return npc
  })

  const legends = root.legends.map((source) => {
    if (!isRecord(source)) return source
    const legend = { ...source }
    const characterToken = generatedManifestReferenceToken(legend.characterName)
    const canonicalCharacter = characterToken ? characterNames.get(characterToken) : undefined
    if (canonicalCharacter) {
      legend.characterName = canonicalCharacter
      // A linked legend is the character. Epithets belong to the later full profile.
      legend.name = canonicalCharacter
    } else {
      delete legend.characterName
    }
    return legend
  })

  let narrative = root.narrative
  if (isRecord(narrative) && Array.isArray(narrative.openingNpcNames)) {
    narrative = {
      ...narrative,
      openingNpcNames: [...new Set(narrative.openingNpcNames.flatMap((value) => {
        const characterToken = generatedManifestReferenceToken(value)
        const canonicalCharacter = characterToken ? characterNames.get(characterToken) : undefined
        const playerToken = generatedManifestReferenceToken(player.name)
        return canonicalCharacter && characterToken !== playerToken ? [canonicalCharacter] : []
      }))],
    }
  }

  return { ...root, places, npcs, legends, narrative }
}

/**
 * Generated interface modules are optional presentation. A missing live-binding reference must
 * not force DeepSeek to regenerate an otherwise complete world, and the server must never guess
 * a resource, item or NPC from a label. Preserve an already-authored reference when it was merely
 * placed in the sibling field; otherwise retain only an explicitly authored static value or drop
 * the unusable element. Runtime patches intentionally do not pass through this sanitizer.
 */
const GENERATED_RARITY_PROFILE_ALIASES = {
  basis: ['rarityBasis', 'reason', 'significance', 'justification', 'assessment'],
  recognition: ['recognizability', 'identification', 'knownBy', 'whoRecognizes', 'recognitionMethod'],
  marketImpact: ['market', 'marketEffect', 'marketAndDemand', 'demand', 'price', 'value'],
} as const

function firstAuthoredText(record: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const candidate = record[key]
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
  }
  return undefined
}

/**
 * Rarity prose explains authored mechanics; it does not decide them. DeepSeek occasionally
 * preserves all numeric rarity dimensions but omits one of the three explanatory strings.
 * Recover those strings from the same item's authored origin, description, scarcity and
 * effects so a complete core is not discarded for missing presentation metadata. No score,
 * class, power or limitation is invented here.
 */
function normalizeGeneratedInventoryRarityProfiles(root: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(root.inventory)) return root

  const inventory = root.inventory.map((source) => {
    if (!isRecord(source) || !isRecord(source.rarityProfile)) return source
    const item = { ...source }
    const profile = { ...source.rarityProfile }
    const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim() : 'предмет'
    const description = typeof item.description === 'string' && item.description.trim() ? item.description.trim() : undefined
    const origin = typeof item.origin === 'string' && item.origin.trim() ? item.origin.trim() : undefined
    const effects = Array.isArray(item.effects)
      ? item.effects.filter((effect): effect is string => typeof effect === 'string' && Boolean(effect.trim())).map((effect) => effect.trim())
      : []
    const scarcity = typeof profile.scarcity === 'string' && profile.scarcity.trim() ? profile.scarcity.trim() : undefined

    const basis = firstAuthoredText(profile, ['basis', ...GENERATED_RARITY_PROFILE_ALIASES.basis])
      ?? origin
      ?? description
    const recognition = firstAuthoredText(profile, ['recognition', ...GENERATED_RARITY_PROFILE_ALIASES.recognition])
      ?? (description ? `«${name}» распознаётся по установленным признакам: ${description}` : undefined)
    const marketImpact = firstAuthoredText(profile, ['marketImpact', ...GENERATED_RARITY_PROFILE_ALIASES.marketImpact])
      ?? (scarcity && effects[0]
        ? `Рыночная значимость определяется дефицитом (${scarcity}) и подтверждённым свойством: ${effects[0]}`
        : scarcity ?? effects[0] ?? description)

    for (const aliases of Object.values(GENERATED_RARITY_PROFILE_ALIASES)) {
      aliases.forEach((alias) => delete profile[alias])
    }
    if (basis) profile.basis = basis
    if (recognition) profile.recognition = recognition
    if (marketImpact) profile.marketImpact = marketImpact
    item.rarityProfile = profile
    return item
  })

  return { ...root, inventory }
}

export function normalizeGeneratedWorldCoreOutput(value: unknown): unknown {
  const normalized = normalizeModelOutput(value)
  return isRecord(normalized) ? normalizeGeneratedInventoryRarityProfiles(normalized) : normalized
}

export function normalizeGeneratedWorldOutput(value: unknown): unknown {
  const normalized = normalizeGeneratedWorldCoreOutput(value)
  if (!isRecord(normalized)) return normalized
  let generatedRoot = Array.isArray(normalized.npcs) && normalized.npcs.length > 12
    ? { ...normalized, npcs: normalized.npcs.slice(0, 12) }
    : normalized
  if (isRecord(generatedRoot.interface) && Array.isArray(generatedRoot.interface.moduleIds) && generatedRoot.interface.moduleIds.length > 6) {
    generatedRoot = { ...generatedRoot, interface: { ...generatedRoot.interface, moduleIds: generatedRoot.interface.moduleIds.slice(0, 6) } }
  }
  generatedRoot = normalizeGeneratedWorldManifestReferences(generatedRoot)
  if (!isRecord(generatedRoot.world) || !Array.isArray(generatedRoot.world.interfaceModules)) return generatedRoot

  const interfaceModules = generatedRoot.world.interfaceModules.slice(0, 6).flatMap((module) => {
    if (!isRecord(module) || !Array.isArray(module.elements)) return [module]

    const elements = module.elements.flatMap((sourceElement) => {
      if (!isRecord(sourceElement) || !isRecord(sourceElement.binding)) return [sourceElement]
      const element = { ...sourceElement }
      const binding = { ...sourceElement.binding }
      const domain = binding.domain
      if (typeof domain !== 'string' || domain === 'custom') return [{ ...element, binding }]

      const needsOnlyKey = GENERATED_INTERFACE_KEY_BINDINGS.has(domain)
      const needsOnlyTarget = GENERATED_INTERFACE_TARGET_BINDINGS.has(domain)
      if (needsOnlyKey && !authoredBindingReference(binding.key) && authoredBindingReference(binding.target)) binding.key = binding.target
      if (needsOnlyTarget && !authoredBindingReference(binding.target) && authoredBindingReference(binding.key)) binding.target = binding.key

      const hasKey = authoredBindingReference(binding.key)
      const hasTarget = authoredBindingReference(binding.target)
      const incomplete = (needsOnlyKey && !hasKey)
        || (needsOnlyTarget && !hasTarget)
        || (GENERATED_INTERFACE_KEY_AND_TARGET_BINDINGS.has(domain) && (!hasKey || !hasTarget))
        || (GENERATED_INTERFACE_KEY_OR_TARGET_BINDINGS.has(domain) && !hasKey && !hasTarget)
      if (!incomplete) return [{ ...element, binding }]

      if (Object.hasOwn(element, 'value') && element.value !== undefined) {
        delete element.binding
        return [element]
      }
      return []
    })

    if (!elements.length) return []
    const survivingIds = new Set(elements.flatMap((element) => isRecord(element) && typeof element.id === 'string' ? [element.id] : []))
    const linkedElements = elements.map((sourceElement) => {
      if (!isRecord(sourceElement) || !Array.isArray(sourceElement.links)) return sourceElement
      const links = sourceElement.links.filter((link) => typeof link === 'string' && link !== sourceElement.id && survivingIds.has(link))
      return { ...sourceElement, links }
    })
    return [{ ...module, elements: linkedElements }]
  })

  return { ...generatedRoot, world: { ...generatedRoot.world, interfaceModules } }
}

const TURN_PLAN_WRAPPER_KEYS = [
  'plan', 'turnPlan', 'turn_plan', 'directorPlan', 'director_plan', 'response', 'data',
  'payload', 'output', 'final', 'answer', 'json', 'план', 'ответ', 'результат',
] as const

const TURN_PLAN_FIELD_ALIASES = {
  outcome: ['result', 'summary', 'resolution', 'outcomeText', 'outcome_text', 'итог', 'исход', 'результат'],
  beats: ['keyBeats', 'key_beats', 'sceneBeats', 'scene_beats', 'keyEvents', 'key_events', 'events', 'события', 'ключевыеСобытия', 'ходСобытий'],
  suggestions: ['options', 'choices', 'nextActions', 'next_actions', 'actions', 'варианты', 'предложения', 'следующиеДействия', 'вариантыДействий'],
  statePatch: ['patch', 'state_patch', 'stateChanges', 'state_changes', 'changes', 'updates', 'изменения', 'измененияСостояния', 'обновлениеСостояния'],
} as const

function parseEmbeddedJsonObject(value: unknown): Record<string, unknown> | undefined {
  if (isRecord(value)) return value
  if (typeof value !== 'string') return undefined
  const text = value.trim().replace(/^```(?:json)?\s*/iu, '').replace(/\s*```$/u, '')
  if (!text.startsWith('{') || !text.endsWith('}')) return undefined
  try {
    const parsed = JSON.parse(text)
    return isRecord(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

function turnPlanFieldScore(value: Record<string, unknown>): number {
  const values = (canonical: keyof typeof TURN_PLAN_FIELD_ALIASES) => [value[canonical], ...TURN_PLAN_FIELD_ALIASES[canonical].map((key) => value[key])]
  const hasOutcome = values('outcome').some((entry) => typeof entry === 'string' && Boolean(entry.trim()))
  const hasBeats = values('beats').some((entry) => Array.isArray(entry) || typeof entry === 'string')
  const hasSuggestions = values('suggestions').some((entry) => Array.isArray(entry) || typeof entry === 'string')
  const hasPatch = values('statePatch').some((entry) => isRecord(entry))
  return [hasOutcome, hasBeats, hasSuggestions, hasPatch].filter(Boolean).length
}

/**
 * DeepSeek occasionally returns a correct director plan under a harmless transport wrapper
 * (`plan`, `result`, `response`, or an embedded JSON string). Unwrap only model-authored
 * content and rename known fields; never synthesize a missing outcome, beat, suggestion or
 * state change. This keeps the strict turn contract while avoiding five futile repair calls.
 */
export function normalizeTurnPlan(value: unknown): unknown {
  const normalized = normalizeModelOutput(value)
  if (!isRecord(normalized)) return normalized

  let payload = normalized
  for (let depth = 0; depth < 4 && turnPlanFieldScore(payload) < 2; depth += 1) {
    let unwrapped: Record<string, unknown> | undefined
    for (const wrapperKey of TURN_PLAN_WRAPPER_KEYS) {
      const wrapped = parseEmbeddedJsonObject(payload[wrapperKey])
      if (!wrapped) continue
      unwrapped = wrapped
      break
    }

    if (!unwrapped) {
      const nested = Object.values(payload)
        .map(parseEmbeddedJsonObject)
        .filter((entry): entry is Record<string, unknown> => entry !== undefined && turnPlanFieldScore(entry) >= 2)
      if (nested.length === 1) unwrapped = nested[0]
    }
    if (!unwrapped || unwrapped === payload) break
    payload = unwrapped
  }

  const result = { ...payload }
  for (const [canonical, aliases] of Object.entries(TURN_PLAN_FIELD_ALIASES)) {
    if (result[canonical] === undefined) {
      const alias = aliases.find((key) => result[key] !== undefined)
      if (alias) result[canonical] = result[alias]
    }
    aliases.forEach((alias) => delete result[alias])
  }
  return normalizeModelOutput(result)
}

/**
 * Normalizes a standalone TurnPatch without confusing its absolute faction
 * reputation field with the same-named generated-world collection.
 */
export function normalizeTurnPatch(value: unknown): unknown {
  return normalizeModelOutput(value, ['statePatch'])
}
