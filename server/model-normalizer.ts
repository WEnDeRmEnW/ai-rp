const ARRAY_KEYS = new Set([
  'rules', 'factions', 'locations', 'mysteries', 'routes', 'laws', 'mechanics', 'interfaceModules', 'elements', 'links', 'equipmentSlots', 'accepts',
  'stats', 'resources', 'abilities', 'inventory', 'npcs', 'knowledge', 'socialLinks',
  'worldEvents', 'factionReputation', 'threads', 'quests', 'lore', 'presentNpcNames',
  'presentNpcIds', 'suggestions', 'objectives', 'keys', 'notes', 'effects', 'participantNames',
  'participantIds', 'involvedNpcNames', 'involvedIds', 'signals', 'beats', 'memories',
  'archives', 'issues', 'tags', 'entityIds', 'relationships', 'upsertStats', 'removeStatKeys',
  'upsertResources', 'removeResourceKeys', 'addAbilities', 'removeAbilityIds', 'addConditions',
  'removeConditions', 'addRules', 'removeRules', 'upsertFactions', 'removeFactions',
  'upsertLocations', 'removeLocations', 'addMysteries', 'resolveMysteries', 'upsertRoutes',
  'removeRouteIds', 'removeLawIds', 'removeMechanicIds', 'removeInterfaceModuleIds', 'upsertInterfaceModules', 'addNpcIds', 'removeNpcIds', 'events',
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
])

const ARRAY_LIMITS: Record<string, number> = {
  rules: 10, factions: 12, locations: 12, mysteries: 8, routes: 30, laws: 24, mechanics: 24, interfaceModules: 8, upsertInterfaceModules: 8, elements: 16, links: 16, upsertLaws: 24, upsertMechanics: 24, territory: 24, goals: 16, equipmentSlots: 12,
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
  upsertFactionReputation: 16, removeLawIds: 24, removeMechanicIds: 24, removeInterfaceModuleIds: 8,
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
])

const ID_KEYS = new Set([
  'id', 'targetId', 'npcId', 'fromNpcId', 'toNpcId', 'abilityId', 'itemId', 'powerId', 'componentId', 'ownerId',
  'culpritId', 'holderId', 'ownerNpcId', 'entityId', 'techniqueId', 'sourceNpcId',
])
const ID_ARRAY_KEYS = new Set([
  'presentNpcIds', 'participantIds', 'involvedIds', 'entityIds', 'removeAbilityIds',
  'removeRouteIds', 'addNpcIds', 'removeNpcIds', 'unlockEvolutionPathIds',
  'removeInfluenceAssetIds', 'removeTechniqueIds',
  'removeStatusEffectIds', 'removeKnowledgeIds', 'removeLawIds', 'removeMechanicIds', 'removeInterfaceModuleIds', 'links', 'targetIds',
])

const ARRAY_IDENTITY: Record<string, string> = {
  factions: 'name', locations: 'name', laws: 'title', mechanics: 'name', interfaceModules: 'id', elements: 'id', upsertLaws: 'id', upsertMechanics: 'id', upsertInterfaceModules: 'id', npcs: 'name', quests: 'title', lore: 'title',
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
  if (key === 'surface') return translate({ бумага: 'paper', бумажный: 'paper', магия: 'arcane', магический: 'arcane', технология: 'tech', технологичный: 'tech', органика: 'organic', органический: 'organic', нуар: 'noir', минимализм: 'minimal' })
  if (key === 'visibility') return translate({ известно: 'known', открыто: 'known', слух: 'rumored', слухи: 'rumored', предположение: 'rumored', скрыто: 'hidden', тайно: 'hidden', секретно: 'hidden' })
  if (key === 'rarity') return translate({ обычный: 'common', обычное: 'common', необычный: 'uncommon', необычное: 'uncommon', редкий: 'rare', редкое: 'rare', эпический: 'epic', эпическое: 'epic', легендарный: 'legendary', легендарное: 'legendary' })
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
  if (key === 'type' && has('issues')) return translate({ канон: 'canon', непрерывность: 'continuity', последовательность: 'continuity', знания: 'knowledge', осведомлённость: 'knowledge', свобода: 'agency', агентность: 'agency', состояние: 'state', стиль: 'style' })
  if (key === 'type' && has('lore')) return translate({ персонаж: 'character', герой: 'character', локация: 'location', место: 'location', фракция: 'faction', организация: 'faction', предмет: 'object', объект: 'object', правило: 'rule', закон: 'rule', история: 'history', тайна: 'secret', секрет: 'secret' })
  if (key === 'status' && has('knowledge')) return translate({ известно: 'known', знает: 'known', убеждён: 'believed', убежден: 'believed', верит: 'believed', предполагает: 'suspected', подозревает: 'suspected', ложно: 'false', ложь: 'false' })
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

function normalizeRecordAsArray(key: string, value: Record<string, unknown>): unknown[] {
  if (key === 'relationships') {
    if (typeof value.npcId === 'string' || Object.hasOwn(value, 'delta')) return [value]
    return normalizeRelationships(value)
  }
  if (key === 'costs') {
    return Object.entries(value).map(([resource, amount]) => ({ resource, amount }))
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
    if (!isRecord(entry)) return [entry]
    const normalized = canonicalizeProgressionChange(entry, kind)
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

function looksLikePatchContainer(value: Record<string, unknown>, path: string[]): boolean {
  if (path.at(-1) === 'statePatch') return true
  return ['currentScene', 'current_scene', 'sceneUpdate', 'scenePatch', 'factionReputationChanges', 'faction_reputation_changes', 'reputationChanges']
    .some((key) => Object.hasOwn(value, key))
}

export function normalizeModelOutput(value: unknown, path: string[] = []): unknown {
  const key = path.at(-1)
  const parent = path.at(-2) === '[]' ? path.at(-3) : path.at(-2)

  if (isRecord(value)) {
    let record = value
    if (isArrayEntryOf(path, 'memories') || (isArrayEntryOf(path, 'events') && path.includes('statePatch'))) record = withoutServerOwnedEntryKeys(record)
    if (looksLikePatchContainer(record, path)) record = canonicalizePatchContainer(record)
    value = record
  }

  if (key === 'currency') return normalizeCurrency(value)
  if (key === 'duration') value = normalizeDuration(value)
  if (key === 'party') value = normalizeParty(value)

  if (key === 'abilityChanges') value = normalizeProgressionChanges(value, 'ability')
  if (key === 'artifactChanges') value = normalizeProgressionChanges(value, 'artifact')

  const isPresentationLabel = path.includes('presentation') && path.some((segment) => ['labels', 'categoryLabels', 'rarityLabels'].includes(segment))
  const isSingularProgressionHistory = key === 'history' && (path.includes('abilityChanges') || path.includes('artifactChanges'))
  if (key && ARRAY_KEYS.has(key) && !isPresentationLabel && !isSingularProgressionHistory && !Array.isArray(value)) {
    if (isRecord(value)) value = normalizeRecordAsArray(key, value)
    else if (value !== null && value !== undefined) value = [value]
  }

  if (Array.isArray(value)) {
    const normalized = value.map((entry) => normalizeModelOutput(entry, [...path, '[]']))
    const withStringIds = key && ID_ARRAY_KEYS.has(key)
      ? normalized.map((entry) => typeof entry === 'number' ? String(entry) : entry)
      : normalized
    const limit = key ? ARRAY_LIMITS[key] : undefined
    const mustPreserveEveryEntry = key === 'abilityChanges' || key === 'artifactChanges'
    return limit && !mustPreserveEveryEntry ? withStringIds.slice(0, limit) : withStringIds
  }

  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([childKey, entry]) => [childKey, normalizeModelOutput(entry, [...path, childKey])]))
  }

  if (key && BOOLEAN_KEYS.has(key)) return parseBooleanLike(value)
  if (key && NUMBER_KEYS.has(key)) return parseNumberLike(value)
  if (key && ID_KEYS.has(key) && typeof value === 'number') return String(value)
  if (key === 'operation') return operationFor(value, parent)
  if (['accent', 'accentStrong', 'secondary', 'color'].includes(key ?? '')) return normalizeHexColor(value)
  return enumFor(value, key, path)
}

/**
 * Normalizes a standalone TurnPatch without confusing its absolute faction
 * reputation field with the same-named generated-world collection.
 */
export function normalizeTurnPatch(value: unknown): unknown {
  return normalizeModelOutput(value, ['statePatch'])
}
