import { z } from 'zod'
import { normalizeHexColor, normalizeModelOutput, normalizeTurnPatch, parseBooleanLike, parseNumberLike } from './model-normalizer.js'

const stringifyScalar = (value: unknown) => typeof value === 'number' || typeof value === 'boolean' ? String(value) : value
const idSchema = z.preprocess(stringifyScalar, z.string().min(1).max(120))
const shortText = z.preprocess(stringifyScalar, z.string().trim().min(1).max(1000))
const longText = z.preprocess(stringifyScalar, z.string().trim().min(1).max(50_000))
const modelNumber = (schema: z.ZodNumber) => z.preprocess(parseNumberLike, schema)
const optionalModelNumber = (schema: z.ZodNumber) => z.preprocess((value) => {
  if (value === null || value === '') return undefined
  return parseNumberLike(value)
}, schema.optional())
const modelBoolean = z.preprocess(parseBooleanLike, z.boolean())
const normalizeNumberRecord = (value: unknown) => {
  if (Array.isArray(value)) {
    const entries = value.flatMap((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return []
      const record = entry as Record<string, unknown>
      const key = record.key ?? record.name ?? record.resource ?? record.stat ?? record.factionName ?? record.id
      const amount = record.delta ?? record.change ?? record.amount ?? record.value
      return (typeof key === 'string' || typeof key === 'number') && amount !== undefined
        ? [[String(key), parseNumberLike(amount)] as const]
        : []
    })
    return entries.length ? Object.fromEntries(entries) : value
  }
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, parseNumberLike(entry)]))
}
const normalizeCurrencyRecord = (value: unknown) => {
  return normalizeModelOutput(value, ['currency'])
}
const alias = (values: Record<string, string>) => (value: unknown) => {
  if (typeof value !== 'string') return value
  const normalized = value.trim().toLocaleLowerCase('ru-RU')
  return values[normalized] ?? value
}
const colorSchema = z.preprocess(normalizeHexColor, z.string().regex(/^#[0-9a-f]{6}$/i, 'Expected a six-digit HEX color'))
const itemCategorySchema = z.preprocess(alias({ оружие: 'weapon', броня: 'armor', защита: 'armor', расходник: 'consumable', припас: 'consumable', артефакт: 'artifact', реликвия: 'artifact', квест: 'quest', сюжетный: 'quest', материал: 'material', другое: 'other', прочее: 'other' }), z.enum(['weapon', 'armor', 'consumable', 'artifact', 'quest', 'material', 'other']))
const raritySchema = z.preprocess(alias({ обычный: 'common', обычное: 'common', необычный: 'uncommon', необычное: 'uncommon', редкий: 'rare', редкое: 'rare', эпический: 'epic', эпическое: 'epic', легендарный: 'legendary', легендарное: 'legendary' }), z.enum(['common', 'uncommon', 'rare', 'epic', 'legendary']))
const npcStatusSchema = z.preprocess(alias({ активен: 'active', активна: 'active', активно: 'active', отсутствует: 'absent', отсутствующий: 'absent', пропал: 'missing', пропала: 'missing', пропавший: 'missing', мертв: 'dead', мёртв: 'dead', мертва: 'dead', мертва́: 'dead', неизвестно: 'unknown', неизвестен: 'unknown' }), z.enum(['active', 'absent', 'missing', 'dead', 'unknown']))
const worldVisibilitySchema = z.preprocess(alias({ известно: 'known', известное: 'known', открыто: 'known', слух: 'rumored', слухи: 'rumored', слухами: 'rumored', предположение: 'rumored', скрыто: 'hidden', скрытое: 'hidden', тайно: 'hidden', секретно: 'hidden' }), z.enum(['known', 'rumored', 'hidden']))
const worldLawStatusSchema = z.preprocess(alias({ предложен: 'proposed', предложено: 'proposed', проект: 'proposed', активен: 'active', активно: 'active', действует: 'active', оспаривается: 'contested', оспорен: 'contested', спорный: 'contested', отменен: 'repealed', отменён: 'repealed', отменено: 'repealed' }), z.enum(['proposed', 'active', 'contested', 'repealed']))
const worldMechanicCategorySchema = z.preprocess(alias({ сила: 'power', способности: 'power', социальная: 'social', общество: 'social', экономика: 'economic', экономическая: 'economic', путешествие: 'travel', путешествия: 'travel', ремесло: 'crafting', создание: 'crafting', выживание: 'survival', политика: 'political', политическая: 'political', другое: 'other', прочее: 'other' }), z.enum(['power', 'social', 'economic', 'travel', 'crafting', 'survival', 'political', 'other']))
const worldMechanicStatusSchema = z.preprocess(alias({ зарождается: 'emerging', новая: 'emerging', активна: 'active', активно: 'active', действует: 'active', устарела: 'obsolete', утрачена: 'obsolete', неактуальна: 'obsolete' }), z.enum(['emerging', 'active', 'obsolete']))
const worldFactionStatusSchema = z.preprocess(alias({ активна: 'active', активен: 'active', действует: 'active', спящая: 'dormant', неактивна: 'dormant', скрыта: 'dormant', распущена: 'dissolved', распалась: 'dissolved', уничтожена: 'dissolved' }), z.enum(['active', 'dormant', 'dissolved']))
const interfacePlacementSchema = z.preprocess(alias({ сцена: 'scene', герой: 'hero', персонаж: 'hero', инвентарь: 'inventory', снаряжение: 'inventory', мир: 'world' }), z.enum(['scene', 'hero', 'inventory', 'world']))
const interfaceVisualSchema = z.preprocess(alias({ шкалы: 'meters', индикаторы: 'meters', узлы: 'nodes', сеть: 'nodes', слоты: 'slots', ячейки: 'slots', путь: 'track', этапы: 'track', журнал: 'ledger', реестр: 'ledger', сигналы: 'signals', сообщения: 'signals', радар: 'radar', диаграмма: 'radar' }), z.enum(['meters', 'nodes', 'slots', 'track', 'ledger', 'signals', 'radar']))
const interfaceIconSchema = z.preprocess(alias({ искра: 'spark', глаз: 'eye', взгляд: 'eye', щит: 'shield', сеть: 'network', узлы: 'network', пульс: 'pulse', сердце: 'pulse', компас: 'compass', корона: 'crown', руна: 'rune', механизм: 'gear', шестерня: 'gear', пламя: 'flame', огонь: 'flame', звезда: 'star', луна: 'moon' }), z.enum(['spark', 'eye', 'shield', 'network', 'pulse', 'compass', 'crown', 'rune', 'gear', 'flame', 'star', 'moon']))
const interfaceElementKindSchema = z.preprocess(alias({ шкала: 'meter', значение: 'value', метка: 'badge', узел: 'node', слот: 'slot', этап: 'step', текст: 'text' }), z.enum(['meter', 'value', 'badge', 'node', 'slot', 'step', 'text']))
const interfaceElementStateSchema = z.preprocess(alias({ обычно: 'normal', норма: 'normal', положительно: 'positive', хорошо: 'positive', предупреждение: 'warning', внимание: 'warning', опасность: 'danger', критично: 'danger', заблокировано: 'locked', закрыто: 'locked', неактивно: 'inactive' }), z.enum(['normal', 'positive', 'warning', 'danger', 'locked', 'inactive']))
const interfaceBindingDomainSchema = z.preprocess(alias({
  свое: 'custom', своё: 'custom', уникальное: 'custom',
  'ресурс игрока': 'player.resource', 'ресурс героя': 'player.resource',
  'характеристика игрока': 'player.stat', 'характеристика героя': 'player.stat',
  'валюта игрока': 'player.currency', 'валюта героя': 'player.currency',
  'состояния игрока': 'player.condition-count', 'состояния героя': 'player.condition-count',
  'напряжение сцены': 'scene.tension', напряжение: 'scene.tension',
  'день мира': 'world.day', день: 'world.day',
  'репутация фракции': 'faction.reputation', репутация: 'faction.reputation',
  'категория инвентаря': 'inventory.category-count', 'число предметов': 'inventory.category-count',
  'заряды предмета': 'inventory.item-charges', заряды: 'inventory.item-charges',
  'активные задания': 'quest.active-count', задания: 'quest.active-count',
  'ресурс нпс': 'npc.resource', 'ресурс npc': 'npc.resource',
  'отношение нпс': 'npc.relationship', 'отношение npc': 'npc.relationship',
}), z.enum(['custom', 'player.resource', 'player.stat', 'player.currency', 'player.condition-count', 'scene.tension', 'world.day', 'faction.reputation', 'inventory.category-count', 'inventory.item-charges', 'quest.active-count', 'npc.resource', 'npc.relationship']))
const knowledgeStatusSchema = z.preprocess(alias({ известно: 'known', знает: 'known', убежден: 'believed', убеждён: 'believed', верит: 'believed', предполагает: 'suspected', подозревает: 'suspected', ложно: 'false', ложь: 'false', ошибочно: 'false' }), z.enum(['known', 'believed', 'suspected', 'false']))
const loreTypeSchema = z.preprocess(alias({ персонаж: 'character', герой: 'character', локация: 'location', место: 'location', фракция: 'faction', организация: 'faction', предмет: 'object', объект: 'object', правило: 'rule', закон: 'rule', история: 'history', тайна: 'secret', секрет: 'secret' }), z.enum(['character', 'location', 'faction', 'object', 'rule', 'history', 'secret']))
const memoryKindSchema = z.preprocess(alias({ сводка: 'summary', итог: 'summary', факт: 'fact', обещание: 'promise', отношение: 'relationship', отношения: 'relationship', тайна: 'mystery', загадка: 'mystery' }), z.enum(['summary', 'fact', 'promise', 'relationship', 'mystery']))
const worldEventStatusSchema = z.preprocess(alias({ запланировано: 'scheduled', ожидается: 'scheduled', назрело: 'due', наступило: 'due', выполнено: 'resolved', решено: 'resolved', завершено: 'resolved', отменено: 'cancelled' }), z.enum(['scheduled', 'due', 'resolved', 'cancelled']))
const surfaceSchema = z.preprocess(alias({ бумага: 'paper', бумажный: 'paper', магический: 'arcane', мистический: 'arcane', технологичный: 'tech', технический: 'tech', органический: 'organic', живой: 'organic', нуар: 'noir', минимализм: 'minimal', минималистичный: 'minimal' }), z.enum(['paper', 'arcane', 'tech', 'organic', 'noir', 'minimal']))
const knowledgeFactSchema = z.object({
  id: idSchema,
  subject: shortText,
  statement: z.string().trim().min(1).max(2000),
  status: knowledgeStatusSchema,
  confidence: modelNumber(z.number().min(0).max(100)),
  source: shortText,
  secret: modelBoolean,
}).strict()
const knowledgeFactDraftSchema = knowledgeFactSchema.extend({ id: idSchema.optional() }).strict()

const socialLinkSchema = z.object({
  id: idSchema,
  fromNpcId: idSchema,
  toNpcId: idSchema,
  kind: shortText,
  label: shortText,
  score: modelNumber(z.number().min(-100).max(100)),
  secret: modelBoolean,
  notes: z.array(z.string().trim().max(500)).max(8),
}).strict()

const worldRouteSchema = z.object({
  id: idSchema,
  from: shortText,
  to: shortText,
  label: shortText,
  travelTime: shortText,
  distance: modelNumber(z.number().min(0).max(1_000_000)),
  danger: modelNumber(z.number().min(0).max(100)),
  discovered: modelBoolean,
}).strict()

const worldLawSchema = z.object({
  id: idSchema,
  title: shortText,
  description: longText,
  scope: shortText,
  authority: shortText,
  status: worldLawStatusSchema,
  visibility: worldVisibilitySchema,
  consequences: z.array(longText).max(16),
  createdTurn: modelNumber(z.number().int().min(0).max(1_000_000)),
  lastChangedTurn: modelNumber(z.number().int().min(0).max(1_000_000)),
}).strict()

const worldMechanicSchema = z.object({
  id: idSchema,
  name: shortText,
  description: longText,
  category: worldMechanicCategorySchema,
  trigger: longText,
  effects: z.array(longText).max(24),
  source: longText,
  discovered: modelBoolean,
  status: worldMechanicStatusSchema,
  createdTurn: modelNumber(z.number().int().min(0).max(1_000_000)),
  lastChangedTurn: modelNumber(z.number().int().min(0).max(1_000_000)),
}).strict()

const worldFactionPatchSchema = z.object({
  id: idSchema.optional(),
  name: shortText,
  description: longText,
  attitude: shortText,
  status: worldFactionStatusSchema.optional(),
  power: optionalModelNumber(z.number().min(0).max(100)),
  influence: longText.optional(),
  territory: z.array(shortText).max(24).optional(),
  resources: z.array(longText).max(24).optional(),
  goals: z.array(longText).max(16).optional(),
  currentMove: longText.optional(),
  publicFace: longText.optional(),
  origin: longText.optional(),
  secrets: z.array(longText).max(16).optional(),
  lastChangedTurn: optionalModelNumber(z.number().int().min(0).max(1_000_000)),
}).strict()

const generatedWorldFactionSchema = z.object({
  name: shortText,
  description: longText,
  attitude: shortText,
  status: worldFactionStatusSchema,
  power: modelNumber(z.number().min(0).max(100)),
  influence: longText,
  territory: z.array(shortText).max(24),
  resources: z.array(longText).max(24),
  goals: z.array(longText).min(1).max(16),
  currentMove: longText,
  publicFace: longText,
  origin: longText,
  secrets: z.array(longText).max(16),
}).strict()

const generatedWorldLawSchema = worldLawSchema.omit({ id: true, createdTurn: true, lastChangedTurn: true })
const generatedWorldMechanicSchema = worldMechanicSchema.omit({ id: true, createdTurn: true, lastChangedTurn: true })
const worldLawPatchSchema = worldLawSchema.extend({
  createdTurn: optionalModelNumber(z.number().int().min(0).max(1_000_000)),
  lastChangedTurn: optionalModelNumber(z.number().int().min(0).max(1_000_000)),
}).strict()
const worldMechanicPatchSchema = worldMechanicSchema.extend({
  createdTurn: optionalModelNumber(z.number().int().min(0).max(1_000_000)),
  lastChangedTurn: optionalModelNumber(z.number().int().min(0).max(1_000_000)),
}).strict()

const adaptiveInterfaceBindingSchema = z.object({
  domain: interfaceBindingDomainSchema,
  key: shortText.optional(),
  target: shortText.optional(),
}).strict()

const adaptiveInterfaceElementSchema = z.object({
  id: idSchema,
  label: shortText,
  description: longText.optional(),
  kind: interfaceElementKindSchema,
  value: z.union([z.string().max(4000), z.number(), z.boolean()]).optional(),
  min: optionalModelNumber(z.number().min(-1_000_000).max(1_000_000)),
  max: optionalModelNumber(z.number().min(-1_000_000).max(1_000_000)),
  unit: z.string().trim().max(80).optional(),
  state: interfaceElementStateSchema,
  binding: adaptiveInterfaceBindingSchema.optional(),
  links: z.array(idSchema).max(16).optional(),
}).strict()

const adaptiveInterfaceModuleDraftSchema = z.object({
  id: idSchema,
  title: shortText,
  subtitle: shortText.optional(),
  description: longText,
  placement: interfacePlacementSchema,
  visual: interfaceVisualSchema,
  icon: interfaceIconSchema,
  accent: colorSchema,
  secondary: colorSchema,
  priority: modelNumber(z.number().min(0).max(100)),
  visibility: worldVisibilitySchema,
  reason: longText,
  updatePolicy: longText,
  collapsible: modelBoolean,
  collapsedByDefault: modelBoolean,
  elements: z.array(adaptiveInterfaceElementSchema).min(1).max(16),
  createdTurn: optionalModelNumber(z.number().int().min(0).max(1_000_000)),
  lastChangedTurn: optionalModelNumber(z.number().int().min(0).max(1_000_000)),
}).strict()

const abilityKindSchema = z.enum(['active', 'passive', 'reaction', 'ritual', 'transformation', 'other'])
const powerCategorySchema = z.enum(['offense', 'defense', 'control', 'mobility', 'utility', 'perception', 'creation', 'summoning', 'transformation', 'reality', 'time', 'space', 'mind', 'soul', 'energy', 'matter', 'other'])
const canonStatusSchema = z.enum(['canonical', 'derived', 'original'])
const resourceKindSchema = z.enum(['health', 'stamina', 'mana', 'energy', 'focus', 'sanity', 'morale', 'hunger', 'ammo', 'charges', 'custom'])
const lifeStateSchema = z.enum(['active', 'unconscious', 'incapacitated', 'dead', 'missing'])
const statusEffectCategorySchema = z.enum(['injury', 'buff', 'debuff', 'disease', 'poison', 'curse', 'blessing', 'environment', 'mental', 'other'])
const influenceKindSchema = z.enum(['favor', 'debt', 'leverage', 'contact', 'access', 'reputation', 'oath', 'other'])
const statStateSchema = z.object({
  key: shortText,
  label: shortText,
  value: modelNumber(z.number()),
  max: optionalModelNumber(z.number()),
  description: z.string().max(500).optional(),
  aliases: z.array(shortText).max(16).optional(),
}).strict()
const resourceStateSchema = statStateSchema.extend({
  max: optionalModelNumber(z.number().positive()),
  color: colorSchema.optional(),
  kind: resourceKindSchema.optional(),
  criticalBelow: optionalModelNumber(z.number().min(0)),
}).strict()
const statusEffectDraftSchema = z.object({
  id: idSchema.optional(),
  name: shortText,
  description: longText,
  category: statusEffectCategorySchema,
  severity: modelNumber(z.number().min(0).max(100)),
  source: longText,
  effects: z.array(longText).max(24),
  resourceDeltasPerTurn: z.preprocess(normalizeNumberRecord, z.record(shortText, z.number().min(-1_000_000).max(1_000_000))).optional(),
  checkModifiers: z.preprocess(normalizeNumberRecord, z.record(shortText, z.number().min(-100).max(100))).optional(),
  stacks: modelNumber(z.number().int().min(1).max(999)),
  duration: z.object({
    unit: z.enum(['turns', 'scenes', 'days', 'until', 'indefinite']),
    remaining: optionalModelNumber(z.number().int().min(0).max(100_000)),
    expiresTurn: optionalModelNumber(z.number().int().min(0).max(1_000_000)),
    condition: longText.optional(),
  }).strict(),
  appliedTurn: optionalModelNumber(z.number().int().min(0).max(1_000_000)),
  hidden: modelBoolean.optional(),
}).strict()
const abilityCostSchema = z.object({
  resource: shortText,
  amount: modelNumber(z.number().min(0).max(100_000)),
}).strict()
const evolutionPathDraftSchema = z.object({
  id: idSchema.optional(),
  name: shortText,
  description: longText,
  requirement: longText,
  unlocked: modelBoolean,
}).strict()
const evolutionPathSchema = evolutionPathDraftSchema.extend({ id: idSchema }).strict()
const progressHistoryDraftSchema = z.object({
  id: idSchema.optional(),
  turn: optionalModelNumber(z.number().int().min(0)),
  title: shortText,
  description: longText,
}).strict()
const relationshipDimensionsSchema = z.object({
  trust: modelNumber(z.number().min(-100).max(100)),
  respect: modelNumber(z.number().min(-100).max(100)),
  affection: modelNumber(z.number().min(-100).max(100)),
  fear: modelNumber(z.number().min(-100).max(100)),
  suspicion: modelNumber(z.number().min(-100).max(100)),
  dependence: modelNumber(z.number().min(-100).max(100)),
}).strict()
const npcInitiativeSchema = z.object({
  intent: longText,
  nextMove: longText,
  trigger: longText,
  urgency: modelNumber(z.number().min(0).max(100)),
  blockedBy: z.array(shortText).max(8),
  lastAdvancedTurn: modelNumber(z.number().int().min(0)),
  visibility: worldVisibilitySchema,
}).strict()
const npcStrategySchema = z.object({
  intelligence: modelNumber(z.number().min(0).max(100)),
  tacticalSkill: modelNumber(z.number().min(0).max(100)),
  strategicSkill: modelNumber(z.number().min(0).max(100)),
  predictionSkill: modelNumber(z.number().min(0).max(100)),
  adaptability: modelNumber(z.number().min(0).max(100)),
  deceptionSkill: modelNumber(z.number().min(0).max(100)),
  riskTolerance: modelNumber(z.number().min(0).max(100)),
  planningHorizon: longText,
  decisionStyle: longText,
  observedPlayerPatterns: z.array(longText).max(16),
  strengths: z.array(longText).max(12),
  blindSpots: z.array(longText).max(12),
  currentPlan: longText,
  contingencies: z.array(longText).max(12),
  visibility: worldVisibilitySchema,
  lastUpdatedTurn: modelNumber(z.number().int().min(0)),
}).strict()
const npcVoiceSchema = z.object({
  style: longText,
  patterns: z.array(shortText).max(8),
  avoids: z.array(shortText).max(8),
}).strict()
const artifactPowerDraftSchema = z.object({
  id: idSchema.optional(),
  name: shortText,
  description: longText,
  mastery: modelNumber(z.number().min(0).max(100)),
  costs: z.array(abilityCostSchema).max(8),
  trigger: longText.optional(),
  limitations: z.array(longText).max(48),
  category: powerCategorySchema.optional(),
  scale: longText.optional(),
  activation: longText.optional(),
  capabilities: z.array(longText).max(64).optional(),
  synergies: z.array(longText).max(32).optional(),
  counters: z.array(longText).max(32).optional(),
  examples: z.array(longText).max(24).optional(),
  canonStatus: canonStatusSchema.optional(),
  canonReference: longText.optional(),
}).strict()
const artifactPowerSchema = artifactPowerDraftSchema.extend({ id: idSchema }).strict()
const artifactPowerChangeSchema = z.object({
  powerId: idSchema,
  name: shortText.optional(),
  description: longText.optional(),
  mastery: optionalModelNumber(z.number().min(0).max(100)),
  masteryDelta: optionalModelNumber(z.number().min(-100).max(100)),
  costs: z.array(abilityCostSchema).max(8).optional(),
  trigger: longText.optional(),
  category: powerCategorySchema.optional(),
  scale: longText.optional(),
  activation: longText.optional(),
  canonStatus: canonStatusSchema.optional(),
  canonReference: longText.optional(),
  capabilities: z.array(longText).max(64).optional(),
  synergies: z.array(longText).max(32).optional(),
  counters: z.array(longText).max(32).optional(),
  examples: z.array(longText).max(24).optional(),
  limitations: z.array(longText).max(48).optional(),
  addCapabilities: z.array(longText).max(64).optional(),
  addSynergies: z.array(longText).max(32).optional(),
  addCounters: z.array(longText).max(32).optional(),
  addExamples: z.array(longText).max(24).optional(),
  addLimitations: z.array(longText).max(48).optional(),
}).strict()
const artifactComponentSchema = z.object({
  id: idSchema,
  name: shortText,
  description: longText,
  role: longText,
  status: z.enum(['active', 'dormant', 'missing', 'damaged', 'destroyed']),
  capabilities: z.array(longText).max(64),
  required: modelBoolean,
}).strict()
const artifactComponentDraftSchema = artifactComponentSchema.omit({ id: true }).extend({ id: idSchema.optional() }).strict()
const artifactComponentChangeSchema = z.object({
  componentId: idSchema,
  name: shortText.optional(),
  description: longText.optional(),
  role: longText.optional(),
  status: z.enum(['active', 'dormant', 'missing', 'damaged', 'destroyed']).optional(),
  required: modelBoolean.optional(),
  capabilities: z.array(longText).max(64).optional(),
  addCapabilities: z.array(longText).max(64).optional(),
}).strict()
const artifactProfileSchema = z.object({
  sentient: modelBoolean,
  awakened: modelBoolean,
  mastery: optionalModelNumber(z.number().min(0).max(100)),
  attunement: modelNumber(z.number().min(0).max(100)),
  bond: modelNumber(z.number().min(-100).max(100)),
  personality: longText.optional(),
  desire: longText.optional(),
  taboo: longText.optional(),
  mood: shortText.optional(),
  voice: longText.optional(),
  classification: longText.optional(),
  powerSource: longText.optional(),
  operatingPrinciple: longText.optional(),
  scale: longText.optional(),
  canonStatus: canonStatusSchema.optional(),
  canonReference: longText.optional(),
  requirements: z.array(longText).max(48),
  passiveEffects: z.array(longText).max(48),
  combinedEffects: z.array(longText).max(48),
  failureModes: z.array(longText).max(48),
  components: z.array(artifactComponentSchema).max(32),
  powers: z.array(artifactPowerSchema).max(64),
  drawbacks: z.array(longText).max(48),
  evolutionPaths: z.array(evolutionPathSchema).max(24),
  secrets: z.array(longText).max(48),
}).strict().superRefine((artifact, context) => {
  if (artifact.sentient) return
  ;(['personality', 'desire', 'taboo', 'mood', 'voice'] as const).forEach((field) => {
    if (artifact[field] !== undefined) context.addIssue({
      code: z.ZodIssueCode.custom,
      path: [field],
      message: `Non-sentient items must omit ${field}`,
    })
  })
})
const abilityDraftSchema = z.object({
  id: idSchema.optional(),
  name: shortText,
  description: longText,
  rank: shortText.optional(),
  source: longText.optional(),
  cooldown: shortText.optional(),
  kind: abilityKindSchema.optional(),
  mastery: optionalModelNumber(z.number().min(0).max(100)),
  costs: z.array(abilityCostSchema).max(8).optional(),
  effects: z.array(longText).max(48).optional(),
  limitations: z.array(longText).max(48).optional(),
  requirements: z.array(longText).max(48).optional(),
  progression: longText.optional(),
  evolutionPaths: z.array(evolutionPathDraftSchema).max(24).optional(),
  history: z.array(progressHistoryDraftSchema).max(100).optional(),
  tags: z.array(shortText).max(32).optional(),
  category: powerCategorySchema.optional(),
  scale: longText.optional(),
  activation: longText.optional(),
  capabilities: z.array(longText).max(64).optional(),
  synergies: z.array(longText).max(32).optional(),
  counters: z.array(longText).max(32).optional(),
  examples: z.array(longText).max(24).optional(),
  canonStatus: canonStatusSchema.optional(),
  canonReference: longText.optional(),
}).strict()
const abilityChangeSchema = z.object({
  abilityId: idSchema,
  mastery: optionalModelNumber(z.number().min(0).max(100)),
  masteryDelta: optionalModelNumber(z.number().min(-100).max(100)),
  kind: abilityKindSchema.optional(),
  rank: shortText.optional(),
  description: longText.optional(),
  cooldown: shortText.optional(),
  costs: z.array(abilityCostSchema).max(8).optional(),
  requirements: z.array(longText).max(48).optional(),
  progression: longText.optional(),
  tags: z.array(shortText).max(32).optional(),
  category: powerCategorySchema.optional(),
  scale: longText.optional(),
  activation: longText.optional(),
  canonStatus: canonStatusSchema.optional(),
  canonReference: longText.optional(),
  capabilities: z.array(longText).max(64).optional(),
  synergies: z.array(longText).max(32).optional(),
  counters: z.array(longText).max(32).optional(),
  examples: z.array(longText).max(24).optional(),
  effects: z.array(longText).max(48).optional(),
  limitations: z.array(longText).max(48).optional(),
  addCapabilities: z.array(longText).max(64).optional(),
  addSynergies: z.array(longText).max(32).optional(),
  addCounters: z.array(longText).max(32).optional(),
  addExamples: z.array(longText).max(24).optional(),
  addEffects: z.array(longText).max(48).optional(),
  addLimitations: z.array(longText).max(48).optional(),
  addEvolutionPaths: z.array(evolutionPathDraftSchema).max(24).optional(),
  unlockEvolutionPathIds: z.array(idSchema).max(24).optional(),
  history: z.object({ title: shortText, description: longText }).strict().optional(),
}).strict()
const artifactChangeSchema = z.object({
  itemId: idSchema,
  itemDescription: longText.optional(),
  itemEffects: z.array(longText).max(12).optional(),
  mastery: optionalModelNumber(z.number().min(0).max(100)),
  attunement: optionalModelNumber(z.number().min(0).max(100)),
  bond: optionalModelNumber(z.number().min(-100).max(100)),
  masteryDelta: optionalModelNumber(z.number().min(-100).max(100)),
  bondDelta: optionalModelNumber(z.number().min(-100).max(100)),
  attunementDelta: optionalModelNumber(z.number().min(-100).max(100)),
  awakened: modelBoolean.optional(),
  mood: shortText.optional(),
  classification: longText.optional(),
  powerSource: longText.optional(),
  operatingPrinciple: longText.optional(),
  scale: longText.optional(),
  canonStatus: canonStatusSchema.optional(),
  canonReference: longText.optional(),
  requirements: z.array(longText).max(48).optional(),
  passiveEffects: z.array(longText).max(48).optional(),
  combinedEffects: z.array(longText).max(48).optional(),
  failureModes: z.array(longText).max(48).optional(),
  drawbacks: z.array(longText).max(48).optional(),
  addPassiveEffects: z.array(longText).max(48).optional(),
  addCombinedEffects: z.array(longText).max(48).optional(),
  addFailureModes: z.array(longText).max(48).optional(),
  addPowers: z.array(artifactPowerDraftSchema).max(32).optional(),
  powerChanges: z.array(artifactPowerChangeSchema).max(64).optional(),
  powerMasteryDeltas: z.preprocess(normalizeNumberRecord, z.record(idSchema, z.number().min(-100).max(100))).optional(),
  addComponents: z.array(artifactComponentDraftSchema).max(32).optional(),
  componentChanges: z.array(artifactComponentChangeSchema).max(32).optional(),
  addDrawbacks: z.array(longText).max(48).optional(),
  addEvolutionPaths: z.array(evolutionPathDraftSchema).max(24).optional(),
  unlockEvolutionPathIds: z.array(idSchema).max(24).optional(),
  history: z.object({ title: shortText, description: longText }).strict().optional(),
}).strict()
const abilityStateSchema = abilityDraftSchema.extend({
  id: idSchema,
  evolutionPaths: z.array(evolutionPathSchema).max(24).optional(),
  history: z.array(progressHistoryDraftSchema.extend({ id: idSchema, turn: modelNumber(z.number().int().min(0)) }).strict()).max(100).optional(),
}).strict()
const characterArcSchema = z.object({
  id: idSchema,
  ownerId: idSchema,
  title: shortText,
  theme: longText,
  currentStage: longText,
  progress: modelNumber(z.number().min(0).max(100)),
  stages: z.array(longText).min(2).max(12),
  turningPoints: z.array(longText).max(12),
  status: z.enum(['active', 'completed', 'broken']),
  secret: modelBoolean,
  lastAdvancedTurn: modelNumber(z.number().int().min(0)),
}).strict()
const mysteryClueSchema = z.object({
  id: idSchema,
  title: shortText,
  detail: longText,
  location: shortText,
  source: longText,
  discovered: modelBoolean,
  essential: modelBoolean,
}).strict()
const mysteryCaseSchema = z.object({
  id: idSchema,
  title: shortText,
  premise: longText,
  truth: longText,
  culpritId: idSchema.optional(),
  status: z.enum(['open', 'solved', 'failed']),
  clues: z.array(mysteryClueSchema).min(3).max(30),
  redHerrings: z.array(longText).max(12),
  revelationRules: z.array(longText).min(1).max(12),
  conclusion: longText.optional(),
  createdTurn: modelNumber(z.number().int().min(0)),
  solvedTurn: optionalModelNumber(z.number().int().min(0)),
}).strict()
const antagonistPlanStepSchema = z.object({
  id: idSchema,
  title: shortText,
  trigger: longText,
  consequence: longText,
  status: z.enum(['pending', 'active', 'completed', 'failed', 'abandoned']),
}).strict()
const antagonistPlanSchema = z.object({
  id: idSchema,
  ownerNpcId: idSchema,
  title: shortText,
  objective: longText,
  method: longText,
  currentStep: modelNumber(z.number().int().min(0).max(20)),
  pressure: modelNumber(z.number().min(0).max(100)),
  resources: z.array(longText).max(16),
  knowledge: z.array(longText).max(20),
  steps: z.array(antagonistPlanStepSchema).min(2).max(12),
  weaknesses: z.array(longText).max(12),
  status: z.enum(['active', 'completed', 'failed', 'abandoned']),
  secret: modelBoolean,
  lastAdvancedTurn: modelNumber(z.number().int().min(0)),
}).strict()
const influenceAssetSchema = z.object({
  id: idSchema,
  kind: influenceKindSchema,
  title: shortText,
  description: longText,
  holderId: idSchema,
  targetId: idSchema.optional(),
  value: modelNumber(z.number().min(-100).max(100)),
  status: z.enum(['active', 'spent', 'repaid', 'lost']),
  source: longText,
  secret: modelBoolean,
  acquiredTurn: modelNumber(z.number().int().min(0)),
}).strict()

const rarityProfileSchema = z.object({
  basis: longText,
  scarcity: longText,
  knownCopies: optionalModelNumber(z.number().int().min(1).max(1_000_000_000)),
  recognition: longText,
  marketImpact: longText,
  acquisitionRisk: modelNumber(z.number().min(0).max(100)),
}).strict()

const npcRecruitmentSchema = z.object({
  status: z.enum(['unavailable', 'possible', 'invited', 'member', 'left']),
  willingness: modelNumber(z.number().min(0).max(100)),
  reason: longText,
  requirements: z.array(longText).max(12),
}).strict()

export const providerSchema = z.object({
  provider: z.enum(['demo', 'openai', 'openrouter', 'ollama', 'custom']),
  model: z.string().trim().min(1).max(200),
  baseUrl: z.string().trim().max(500),
  apiKey: z.string().max(1000).optional(),
  temperature: z.number().min(0).max(2),
})

const inventoryItemPatchSchema = z.object({
  id: idSchema.optional(),
  name: shortText.optional(),
  description: z.string().trim().max(2000).optional(),
  category: itemCategorySchema.optional(),
  quantity: optionalModelNumber(z.number().int().min(1).max(999)),
  rarity: raritySchema.optional(),
  rarityProfile: rarityProfileSchema.optional(),
  equipped: modelBoolean.optional(),
  equippedSlot: z.string().trim().max(120).optional(),
  weight: optionalModelNumber(z.number().min(0).max(100_000)),
  durability: optionalModelNumber(z.number().min(0).max(100_000)),
  maxDurability: optionalModelNumber(z.number().min(0).max(100_000)),
  charges: optionalModelNumber(z.number().int().min(0).max(1_000_000)),
  maxCharges: optionalModelNumber(z.number().int().min(0).max(1_000_000)),
  state: z.enum(['intact', 'damaged', 'broken', 'depleted', 'sealed']).optional(),
  effects: z.array(z.string().trim().max(300)).max(12).optional(),
  origin: z.string().trim().max(500).optional(),
  discoveredTurn: optionalModelNumber(z.number().int().min(0)),
  history: z.array(progressHistoryDraftSchema).max(80).optional(),
  artifact: artifactProfileSchema.optional(),
}).strict()
const inventoryItemAddSchema = inventoryItemPatchSchema.extend({
  name: shortText,
  description: z.string().trim().min(1).max(2000),
  category: itemCategorySchema,
  quantity: modelNumber(z.number().int().min(1).max(999)),
  rarity: raritySchema,
  equipped: modelBoolean,
  effects: z.array(z.string().trim().max(300)).max(12),
}).strict()

const questDraftSchema = z.object({
  id: idSchema.optional(),
  title: shortText.optional(),
  description: z.string().trim().max(2000).optional(),
  status: z.enum(['active', 'completed', 'failed', 'hidden']).optional(),
  objectives: z.array(z.object({ id: idSchema, text: shortText, completed: modelBoolean })).max(20).optional(),
  reward: z.string().trim().max(500).optional(),
  giver: z.string().trim().max(300).optional(),
}).strict()
const questAddSchema = questDraftSchema.extend({
  title: shortText,
  description: z.string().trim().min(1).max(2000),
  status: z.enum(['active', 'completed', 'failed', 'hidden']),
  objectives: z.array(z.object({ id: idSchema, text: shortText, completed: modelBoolean })).max(20),
}).strict()

const relationshipChangeSchema = z.object({
  npcId: idSchema,
  delta: modelNumber(z.number().min(-25).max(25)),
  dimensions: relationshipDimensionsSchema.partial().optional(),
  note: z.string().trim().max(500).optional(),
}).strict()

function normalizeRelationshipChanges(value: unknown): unknown {
  if (value === undefined || Array.isArray(value)) return value
  if (!value || typeof value !== 'object') return value

  const record = value as Record<string, unknown>
  if (typeof record.npcId === 'string' || Object.hasOwn(record, 'delta')) return [record]

  return Object.entries(record).map(([npcId, change]) => {
    if (typeof change === 'number') return { npcId, delta: change }
    if (change && typeof change === 'object' && !Array.isArray(change)) {
      return { ...(change as Record<string, unknown>), npcId }
    }
    return change
  })
}

function normalizeNestedMutations(value: unknown, nestedKey: 'item' | 'quest' | 'npc' | 'thread' | 'event'): unknown {
  if (!Array.isArray(value)) return value
  return value.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry
    const record = entry as Record<string, unknown>
    const nested = record[nestedKey]
    const nestedRecord = nested && typeof nested === 'object' && !Array.isArray(nested)
      ? { ...(nested as Record<string, unknown>) }
      : {}
    const explicitOperation = typeof record.operation === 'string' ? record.operation : undefined
    if (nestedKey === 'item' && explicitOperation === 'remove') return record
    const targetId = typeof record.targetId === 'string'
      ? record.targetId
      : explicitOperation && explicitOperation !== 'add'
        ? typeof record.id === 'string' || typeof record.id === 'number'
          ? String(record.id)
          : typeof nestedRecord.id === 'string' || typeof nestedRecord.id === 'number'
            ? String(nestedRecord.id)
            : undefined
        : undefined
    if (targetId !== undefined) delete nestedRecord.id
    const payload = Object.fromEntries(Object.entries(record).filter(([key]) => !['operation', 'targetId', nestedKey].includes(key) && !(targetId !== undefined && key === 'id')))
    if (Object.keys(payload).length === 0 && Object.keys(nestedRecord).length > 0) return entry

    const operation = explicitOperation ?? (typeof record.targetId === 'string' ? 'update' : 'add')
    return {
      operation,
      ...(operation !== 'add' && targetId !== undefined ? { targetId } : {}),
      ...(Object.keys(payload).length > 0 || Object.keys(nestedRecord).length > 0
        ? { [nestedKey]: { ...nestedRecord, ...payload } }
        : {}),
    }
  })
}

const turnPatchContract = z.object({
  inventory: z.preprocess((value) => normalizeNestedMutations(value, 'item'), z.array(z.discriminatedUnion('operation', [
    z.object({ operation: z.literal('add'), item: inventoryItemAddSchema }).strict(),
    z.object({ operation: z.literal('update'), targetId: idSchema, item: inventoryItemPatchSchema }).strict(),
    z.object({
      operation: z.literal('remove'),
      targetId: idSchema,
      quantity: optionalModelNumber(z.number().int().positive().max(999)),
      reason: longText.optional(),
    }).strict(),
  ])).max(25).optional()),
  playerProfile: z.object({
    name: shortText.optional(),
    archetype: shortText.optional(),
    appearance: z.string().trim().max(2000).optional(),
    personality: z.string().trim().max(2000).optional(),
    backstory: z.string().trim().max(4000).optional(),
    goal: z.string().trim().max(2000).optional(),
    levelDelta: optionalModelNumber(z.number().int().min(-10).max(10)),
    lifeState: lifeStateSchema.optional(),
  }).strict().optional(),
  upsertStats: z.array(statStateSchema).max(24).optional(),
  removeStatKeys: z.array(shortText).max(24).optional(),
  upsertResources: z.array(resourceStateSchema).max(24).optional(),
  removeResourceKeys: z.array(shortText).max(24).optional(),
  statDeltas: z.preprocess(normalizeNumberRecord, z.record(z.string().max(100), z.number().min(-1_000_000).max(1_000_000))).optional(),
  resourceDeltas: z.preprocess(normalizeNumberRecord, z.record(z.string().max(100), z.number().min(-1_000_000).max(1_000_000))).optional(),
  currencyDeltas: z.preprocess(normalizeNumberRecord, z.record(z.string().max(100), z.number().min(-100_000).max(100_000))).optional(),
  addAbilities: z.array(abilityDraftSchema).max(40).optional(),
  removeAbilityIds: z.array(idSchema).max(40).optional(),
  abilityChanges: z.array(abilityChangeSchema).max(24).optional(),
  artifactChanges: z.array(artifactChangeSchema).max(24).optional(),
  addConditions: z.array(shortText).max(10).optional(),
  removeConditions: z.array(shortText).max(10).optional(),
  upsertStatusEffects: z.array(statusEffectDraftSchema).max(48).optional(),
  removeStatusEffectIds: z.array(idSchema).max(48).optional(),
  relationships: z.preprocess(normalizeRelationshipChanges, z.array(relationshipChangeSchema).max(15).optional()),
  npcs: z.preprocess((value) => normalizeNestedMutations(value, 'npc'), z.array(z.discriminatedUnion('operation', [
    z.object({
      operation: z.literal('add'),
      npc: z.object({
        id: idSchema, name: shortText, role: shortText, description: longText, disposition: shortText,
        relationship: modelNumber(z.number().min(-100).max(100)), status: npcStatusSchema, currentGoal: longText, lastSeen: shortText,
        notes: z.array(z.string().max(500)).max(8), knowledge: z.array(knowledgeFactSchema).max(30).optional(),
        stats: z.array(statStateSchema).max(24).optional(), resources: z.array(resourceStateSchema).max(24).optional(), statusEffects: z.array(statusEffectDraftSchema.extend({ id: idSchema, appliedTurn: modelNumber(z.number().int().min(0)) }).strict()).max(48).optional(),
        abilities: z.array(abilityStateSchema).max(40).optional(),
        relationshipDimensions: relationshipDimensionsSchema.optional(), initiative: npcInitiativeSchema.optional(), strategy: npcStrategySchema.optional(), recruitment: npcRecruitmentSchema.optional(), voice: npcVoiceSchema.optional(),
      }).strict(),
    }).strict(),
    z.object({
      operation: z.literal('update'),
      targetId: idSchema,
      npc: z.object({
        name: shortText.optional(), role: shortText.optional(), description: z.string().trim().max(2000).optional(),
        disposition: shortText.optional(), relationship: optionalModelNumber(z.number().min(-100).max(100)), status: npcStatusSchema.optional(),
        currentGoal: z.string().trim().max(2000).optional(), lastSeen: shortText.optional(), notes: z.array(z.string().max(500)).max(8).optional(),
        stats: z.array(statStateSchema).max(24).optional(), resources: z.array(resourceStateSchema).max(24).optional(), statusEffects: z.array(statusEffectDraftSchema).max(48).optional(),
        abilities: z.array(abilityDraftSchema).max(40).optional(), upsertAbilities: z.array(abilityDraftSchema).max(40).optional(),
        removeAbilityIds: z.array(idSchema).max(40).optional(), abilityChanges: z.array(abilityChangeSchema).max(24).optional(),
        knowledge: z.array(knowledgeFactDraftSchema).max(30).optional(), relationshipDimensions: relationshipDimensionsSchema.partial().optional(),
        initiative: npcInitiativeSchema.partial().optional(), strategy: npcStrategySchema.partial().optional(), recruitment: npcRecruitmentSchema.optional(), voice: npcVoiceSchema.partial().optional(),
        upsertStats: z.array(statStateSchema).max(24).optional(), removeStatKeys: z.array(shortText).max(24).optional(),
        upsertResources: z.array(resourceStateSchema).max(24).optional(), removeResourceKeys: z.array(shortText).max(24).optional(),
        statDeltas: z.preprocess(normalizeNumberRecord, z.record(z.string().max(100), z.number().min(-1_000_000).max(1_000_000))).optional(),
        resourceDeltas: z.preprocess(normalizeNumberRecord, z.record(z.string().max(100), z.number().min(-1_000_000).max(1_000_000))).optional(),
        upsertStatusEffects: z.array(statusEffectDraftSchema).max(48).optional(), removeStatusEffectIds: z.array(idSchema).max(48).optional(),
        removeKnowledgeIds: z.array(idSchema).max(30).optional(),
      }).strict(),
    }).strict(),
  ])).max(20).optional()),
  quests: z.preprocess((value) => normalizeNestedMutations(value, 'quest'), z.array(z.discriminatedUnion('operation', [
    z.object({ operation: z.literal('add'), quest: questAddSchema }).strict(),
    z.object({ operation: z.literal('update'), targetId: idSchema, quest: questDraftSchema }).strict(),
    z.object({ operation: z.literal('complete'), targetId: idSchema }).strict(),
    z.object({ operation: z.literal('fail'), targetId: idSchema }).strict(),
  ])).max(10).optional()),
  lore: z.array(z.object({
    id: idSchema.optional(),
    title: shortText,
    type: loreTypeSchema,
    content: z.string().trim().max(4000),
    keys: z.array(z.string().trim().max(100)).max(20),
    enabled: modelBoolean,
    alwaysOn: modelBoolean,
    secret: modelBoolean,
    discovered: modelBoolean,
    priority: modelNumber(z.number().min(0).max(100)),
    conditions: z.object({
      locations: z.array(shortText).max(12).optional(), npcIds: z.array(idSchema).max(20).optional(), questIds: z.array(idSchema).max(20).optional(),
      minTurn: optionalModelNumber(z.number().int().min(0)), maxTurn: optionalModelNumber(z.number().int().min(0)), minRelationship: optionalModelNumber(z.number().min(-100).max(100)),
    }).strict().optional(),
  }).strict()).max(12).optional(),
  scene: z.object({
    title: z.string().trim().max(300).optional(),
    location: z.string().trim().max(300).optional(),
    time: z.string().trim().max(150).optional(),
    weather: z.string().trim().max(300).optional(),
    tension: optionalModelNumber(z.number().min(0).max(100)),
    presentNpcIds: z.array(idSchema).max(12).optional(),
  }).strict().optional(),
  world: z.object({
    name: shortText.optional(), tagline: shortText.optional(), inspiration: z.string().trim().max(12_000).optional(), genre: shortText.optional(), tone: shortText.optional(), overview: z.string().trim().max(12_000).optional(), era: shortText.optional(),
    system: z.object({
      name: shortText.optional(), summary: longText.optional(), progression: longText.optional(), conflictResolution: longText.optional(), consequences: longText.optional(),
      equipmentSlots: z.array(z.object({ key: shortText, label: shortText, accepts: z.array(itemCategorySchema).min(1).max(7) }).strict()).max(12).optional(),
    }).strict().optional(),
    presentation: z.object({
      accent: colorSchema.optional(), accentStrong: colorSchema.optional(), secondary: colorSchema.optional(), surface: surfaceSchema.optional(), motif: shortText.optional(),
      labels: z.object({
        scene: shortText.optional(), character: shortText.optional(), inventory: shortText.optional(), world: shortText.optional(), quests: shortText.optional(), abilities: shortText.optional(),
        lore: shortText.optional(), memories: shortText.optional(), stats: shortText.optional(), resources: shortText.optional(), conditions: shortText.optional(), level: shortText.optional(),
        chapter: shortText.optional(), turn: shortText.optional(), action: shortText.optional(), speech: shortText.optional(), direction: shortText.optional(), continue: shortText.optional(),
      }).strict().optional(),
      categoryLabels: z.object({ weapon: shortText.optional(), armor: shortText.optional(), consumable: shortText.optional(), artifact: shortText.optional(), quest: shortText.optional(), material: shortText.optional(), other: shortText.optional() }).strict().optional(),
      rarityLabels: z.object({ common: shortText.optional(), uncommon: shortText.optional(), rare: shortText.optional(), epic: shortText.optional(), legendary: shortText.optional() }).strict().optional(),
    }).strict().optional(),
    addRules: z.array(shortText).max(8).optional(), removeRules: z.array(shortText).max(8).optional(),
    upsertFactions: z.array(worldFactionPatchSchema).max(12).optional(),
    removeFactions: z.array(shortText).max(8).optional(),
    upsertLocations: z.array(z.object({ name: shortText, description: longText, danger: modelNumber(z.number().min(0).max(100)) }).strict()).max(12).optional(),
    removeLocations: z.array(shortText).max(12).optional(),
    addMysteries: z.array(shortText).max(8).optional(), resolveMysteries: z.array(shortText).max(8).optional(),
    calendarDayDelta: optionalModelNumber(z.number().int().min(-3650).max(3650)), calendarLabel: shortText.optional(),
    upsertRoutes: z.array(worldRouteSchema).max(40).optional(), removeRouteIds: z.array(idSchema).max(40).optional(),
    upsertLaws: z.array(worldLawPatchSchema).max(24).optional(), removeLawIds: z.array(idSchema).max(24).optional(),
    upsertMechanics: z.array(worldMechanicPatchSchema).max(24).optional(), removeMechanicIds: z.array(idSchema).max(24).optional(),
    upsertInterfaceModules: z.array(adaptiveInterfaceModuleDraftSchema).max(8).optional(), removeInterfaceModuleIds: z.array(idSchema).max(8).optional(),
  }).strict().optional(),
  socialLinks: z.array(socialLinkSchema).max(40).optional(),
  threads: z.preprocess((value) => normalizeNestedMutations(value, 'thread'), z.array(z.object({
    operation: z.enum(['add', 'update', 'resolve', 'break']), targetId: idSchema.optional(),
    thread: z.object({
      id: idSchema.optional(), type: shortText.optional(), title: shortText.optional(),
      detail: z.string().trim().max(2000).optional(), participantIds: z.array(idSchema).max(20).optional(),
      status: shortText.optional(), dueTurn: optionalModelNumber(z.number().int().min(0)),
      secret: modelBoolean.optional(), createdTurn: optionalModelNumber(z.number().int().min(0)),
    }).strict().optional(),
  }).strict()).max(20).optional()),
  worldEvents: z.preprocess((value) => normalizeNestedMutations(value, 'event'), z.array(z.object({
    operation: z.enum(['add', 'update', 'resolve', 'cancel']), targetId: idSchema.optional(),
    event: z.object({
      id: idSchema.optional(), title: shortText.optional(), description: z.string().trim().max(2500).optional(),
      dueTurn: optionalModelNumber(z.number().int().min(0)), dueDay: optionalModelNumber(z.number().int().min(1)),
      status: worldEventStatusSchema.optional(), visibility: worldVisibilitySchema.optional(),
      involvedIds: z.array(idSchema).max(20).optional(), createdTurn: optionalModelNumber(z.number().int().min(0)),
    }).strict().optional(),
  }).strict()).max(20).optional()),
  factionReputationDeltas: z.preprocess(normalizeNumberRecord, z.record(z.string().max(300), z.number().min(-50).max(50))).optional(),
  upsertFactionReputation: z.array(z.object({
    factionName: shortText,
    value: modelNumber(z.number().min(-100).max(100)),
    label: shortText.optional(),
    notes: z.array(z.string().trim().max(500)).max(16).optional(),
  }).strict()).max(16).optional(),
  party: z.object({
    addNpcIds: z.array(idSchema).max(8).optional(),
    removeNpcIds: z.array(idSchema).max(8).optional(),
    roles: z.record(idSchema, shortText).optional(),
  }).strict().optional(),
  upsertCharacterArcs: z.array(characterArcSchema).max(20).optional(),
  upsertMysteryCases: z.array(mysteryCaseSchema).max(12).optional(),
  upsertAntagonistPlans: z.array(antagonistPlanSchema).max(12).optional(),
  upsertInfluenceAssets: z.array(influenceAssetSchema).max(30).optional(),
  removeInfluenceAssetIds: z.array(idSchema).max(30).optional(),
  memories: z.array(z.object({
    kind: memoryKindSchema,
    content: z.string().trim().max(1500),
    tags: z.array(z.string().trim().max(100)).max(12),
    importance: modelNumber(z.number().min(0).max(100)),
    pinned: modelBoolean.optional(),
  }).strict()).max(8).optional(),
  events: z.array(z.object({
    title: shortText,
    description: z.string().trim().max(1500),
    category: z.enum(['story', 'inventory', 'character', 'relationship', 'quest', 'world', 'ability', 'artifact', 'influence', 'mystery']),
  }).strict()).max(12).optional(),
}).strict()

export const turnPatchSchema = z.preprocess(normalizeTurnPatch, turnPatchContract)

const progressionAuditContract = z.object({
  abilityChanges: turnPatchContract.shape.abilityChanges,
  artifactChanges: turnPatchContract.shape.artifactChanges,
  npcAbilityChanges: z.array(z.object({
    npcId: idSchema,
    abilityChanges: z.array(abilityChangeSchema).min(1).max(12),
  }).strict()).max(12).optional(),
}).strict()
export const progressionAuditSchema = z.preprocess((value) => normalizeModelOutput(value), progressionAuditContract)

const turnPlanContract = z.object({
  outcome: z.string().trim().min(1).max(2000),
  beats: z.array(z.string().trim().min(1).max(800)).min(1).max(8),
  suggestions: z.array(z.string().trim().min(1).max(300)).min(2).max(4),
  statePatch: turnPatchSchema,
}).strict()

export const turnPlanSchema = z.preprocess((value) => normalizeModelOutput(value), turnPlanContract)

const consequenceDomainSchema = z.enum([
  'health', 'resources', 'stats', 'conditions', 'inventory', 'equipment', 'abilities', 'artifacts',
  'currency', 'relationships', 'quests', 'characters', 'scene_time', 'world', 'knowledge',
])

const consequenceAuditContract = z.object({
  pass: modelBoolean,
  narrativePass: modelBoolean,
  narrativeIssues: z.array(z.object({
    evidence: longText,
    requirement: longText,
    instruction: longText,
    severity: z.enum(['low', 'medium', 'high']),
  }).strict()).max(32),
  verifiedDomains: z.array(consequenceDomainSchema).min(15).max(15),
  omissions: z.array(z.object({
    domain: consequenceDomainSchema,
    evidence: longText,
    requiredChange: longText,
    resolutionPath: longText,
    severity: z.enum(['low', 'medium', 'high']),
  }).strict()).max(64),
  statePatch: turnPatchSchema,
}).strict().superRefine((audit, context) => {
  if (new Set(audit.verifiedDomains).size !== 15) context.addIssue({
    code: z.ZodIssueCode.custom,
    path: ['verifiedDomains'],
    message: 'Every consequence domain must be verified exactly once',
  })
  if (audit.pass && audit.omissions.length > 0) context.addIssue({
    code: z.ZodIssueCode.custom,
    path: ['pass'],
    message: 'A passing consequence audit cannot contain omissions',
  })
  if (!audit.pass && audit.omissions.length === 0) context.addIssue({
    code: z.ZodIssueCode.custom,
    path: ['omissions'],
    message: 'A failed consequence audit must explain at least one omission',
  })
  if (audit.narrativePass && audit.narrativeIssues.length > 0) context.addIssue({
    code: z.ZodIssueCode.custom,
    path: ['narrativePass'],
    message: 'A narrative that passes cannot contain narrative issues',
  })
  if (!audit.narrativePass && audit.narrativeIssues.length === 0) context.addIssue({
    code: z.ZodIssueCode.custom,
    path: ['narrativeIssues'],
    message: 'A failed narrative audit must provide concrete rewrite instructions',
  })
  const hasSupplementalChange = Object.values(audit.statePatch).some((value) => (
    Array.isArray(value) ? value.length > 0 : value !== undefined && (
      typeof value !== 'object' || value === null || Object.keys(value).length > 0
    )
  ))
  if (audit.omissions.length > 0 && !hasSupplementalChange) context.addIssue({
    code: z.ZodIssueCode.custom,
    path: ['statePatch'],
    message: 'Every reported omission must be resolved by a supplemental state change',
  })
})

export const consequenceAuditSchema = z.preprocess((value) => normalizeModelOutput(value), consequenceAuditContract)

const archiveDraftSchema = z.object({
  kind: z.enum(['scene', 'chapter', 'era']),
  title: shortText,
  summary: z.string().trim().min(1).max(8000),
  startTurn: modelNumber(z.number().int().min(0)),
  endTurn: modelNumber(z.number().int().min(0)),
  tags: z.array(z.string().trim().max(100)).max(24),
  entityIds: z.array(idSchema).max(24),
  importance: modelNumber(z.number().min(0).max(100)),
}).strict()

const backgroundSimulationContract = z.object({
  signals: z.array(z.string().trim().min(1).max(600)).max(10),
  statePatch: turnPatchSchema,
}).strict()

export const backgroundSimulationSchema = z.preprocess((value) => normalizeModelOutput(value), backgroundSimulationContract)

const continuityReviewContract = z.object({
  chosen: z.enum(['a', 'b']),
  pass: modelBoolean,
  issues: z.array(z.object({
    type: z.enum(['canon', 'continuity', 'knowledge', 'agency', 'state', 'style']),
    detail: z.string().trim().min(1).max(1000),
    severity: z.enum(['low', 'medium', 'high']),
  }).strict()).max(16),
  rewriteInstructions: z.string().trim().max(3000),
}).strict()

export const continuityReviewSchema = z.preprocess((value) => normalizeModelOutput(value), continuityReviewContract)

const memoryCuratorContract = z.object({
  memories: z.array(z.object({
    kind: memoryKindSchema,
    content: z.string().trim().min(1).max(2000),
    tags: z.array(z.string().trim().max(100)).max(12),
    importance: modelNumber(z.number().min(0).max(100)),
  }).strict()).max(12),
  archives: z.array(archiveDraftSchema).max(4),
}).strict()

export const memoryCuratorSchema = z.preprocess((value) => normalizeModelOutput(value), memoryCuratorContract)

export const turnRequestSchema = z.object({
  campaign: z.object({
    id: idSchema,
    title: shortText,
    turn: z.number().int().min(0),
    world: z.record(z.string(), z.unknown()),
    player: z.record(z.string(), z.unknown()),
    inventory: z.array(z.record(z.string(), z.unknown())).max(1000),
    npcs: z.array(z.record(z.string(), z.unknown())).max(500),
    quests: z.array(z.record(z.string(), z.unknown())).max(500),
    lore: z.array(z.record(z.string(), z.unknown())).max(2000),
    memories: z.array(z.record(z.string(), z.unknown())).max(20_000),
    timeline: z.array(z.record(z.string(), z.unknown())).max(100_000),
    messages: z.array(z.record(z.string(), z.unknown())).max(200_000),
    scene: z.record(z.string(), z.unknown()),
    settings: z.record(z.string(), z.unknown()),
    createdAt: z.string(),
    updatedAt: z.string(),
    snapshots: z.array(z.record(z.string(), z.unknown())).max(50),
  }).passthrough(),
  input: z.string().trim().min(1).max(200_000),
  actionType: z.enum(['do', 'say', 'story', 'continue']),
  provider: providerSchema,
})

export const worldRequestSchema = z.object({
  inspiration: longText,
  genre: shortText,
  tone: shortText,
  characterName: shortText,
  characterConcept: longText,
  opening: z.string().trim().max(4000),
  canonMode: z.enum(['faithful', 'flexible', 'original']),
  contentBoundaries: z.string().trim().max(2000),
  provider: providerSchema,
})

export const campaignEditRequestSchema = z.object({
  campaign: turnRequestSchema.shape.campaign,
  instruction: z.string().trim().min(3).max(20_000),
  provider: providerSchema,
})

export const campaignEditResponseSchema = z.object({
  summary: z.string().trim().min(1).max(2000),
  statePatch: turnPatchSchema,
  campaignPatch: z.object({ title: shortText.optional() }).strict().optional(),
  settingsPatch: z.object({
    responseLength: z.enum(['compact', 'balanced', 'detailed']).optional(),
    playerAgency: z.enum(['strict', 'cinematic']).optional(),
    difficulty: z.enum(['story', 'balanced', 'harsh']).optional(),
    canonMode: z.enum(['faithful', 'flexible', 'original']).optional(),
    contentBoundaries: z.string().trim().max(2000).optional(),
    authorsNote: z.string().trim().max(4000).optional(),
    resolutionMode: z.enum(['off', 'hidden', 'visible']).optional(),
    contextProfile: z.enum(['standard', 'long', 'million']).optional(),
    qualityMode: z.enum(['balanced', 'deep']).optional(),
    scenePace: z.enum(['slow', 'balanced', 'fast', 'montage']).optional(),
    proseStyle: z.enum(['literary', 'cinematic', 'direct']).optional(),
    dialogueDensity: z.enum(['low', 'balanced', 'high']).optional(),
    npcAutonomy: z.enum(['reactive', 'balanced', 'independent']).optional(),
    worldDynamics: z.enum(['quiet', 'living', 'volatile']).optional(),
  }).strict().optional(),
}).strict()

const generatedEvolutionPathSchema = evolutionPathDraftSchema.omit({ id: true })
const generatedAbilitySchema = z.object({
  name: shortText,
  description: longText,
  rank: shortText,
  source: longText,
  cooldown: shortText.optional(),
  kind: abilityKindSchema,
  mastery: modelNumber(z.number().min(0).max(100)),
  costs: z.array(abilityCostSchema).max(8),
  effects: z.array(longText).min(1).max(48),
  limitations: z.array(longText).max(48),
  requirements: z.array(longText).max(48),
  progression: longText,
  evolutionPaths: z.array(generatedEvolutionPathSchema).max(24),
  history: z.array(z.object({ title: shortText, description: longText }).strict()).min(1).max(24),
  tags: z.array(shortText).min(1).max(32),
  category: powerCategorySchema,
  scale: longText,
  activation: longText,
  capabilities: z.array(longText).min(1).max(64),
  synergies: z.array(longText).max(32),
  counters: z.array(longText).max(32),
  examples: z.array(longText).min(1).max(24),
  canonStatus: canonStatusSchema,
  canonReference: longText.optional(),
}).strict()
const generatedArtifactPowerSchema = artifactPowerDraftSchema.omit({ id: true }).extend({
  category: powerCategorySchema,
  scale: longText,
  activation: longText,
  capabilities: z.array(longText).min(1).max(64),
  synergies: z.array(longText).max(32),
  counters: z.array(longText).max(32),
  examples: z.array(longText).min(1).max(24),
  canonStatus: canonStatusSchema,
  canonReference: longText.optional(),
}).strict()
const generatedArtifactComponentSchema = artifactComponentSchema.omit({ id: true })
const generatedArtifactProfileSchema = z.object({
  sentient: modelBoolean,
  awakened: modelBoolean,
  mastery: optionalModelNumber(z.number().min(0).max(100)),
  attunement: modelNumber(z.number().min(0).max(100)),
  bond: modelNumber(z.number().min(-100).max(100)),
  personality: longText.optional(),
  desire: longText.optional(),
  taboo: longText.optional(),
  mood: shortText.optional(),
  voice: longText.optional(),
  classification: longText,
  powerSource: longText,
  operatingPrinciple: longText,
  scale: longText,
  canonStatus: canonStatusSchema,
  canonReference: longText.optional(),
  requirements: z.array(longText).max(48),
  passiveEffects: z.array(longText).max(48),
  combinedEffects: z.array(longText).max(48),
  failureModes: z.array(longText).max(48),
  components: z.array(generatedArtifactComponentSchema).max(32),
  powers: z.array(generatedArtifactPowerSchema).min(1).max(64),
  drawbacks: z.array(longText).max(48),
  evolutionPaths: z.array(generatedEvolutionPathSchema).max(24),
  secrets: z.array(longText).max(48),
}).strict().superRefine((artifact, context) => {
  if (artifact.sentient) return
  ;(['personality', 'desire', 'taboo', 'mood', 'voice'] as const).forEach((field) => {
    if (artifact[field] !== undefined) context.addIssue({
      code: z.ZodIssueCode.custom,
      path: [field],
      message: `Non-sentient items must omit ${field}`,
    })
  })
})
const generatedCharacterArcSchema = z.object({
  ownerName: shortText,
  title: shortText,
  theme: longText,
  currentStage: longText,
  progress: modelNumber(z.number().min(0).max(100)),
  stages: z.array(longText).min(3).max(10),
  turningPoints: z.array(longText).min(1).max(8),
  status: z.enum(['active', 'completed', 'broken']),
  secret: modelBoolean,
}).strict()

const canonCapabilitySchema = z.object({
  name: shortText,
  description: longText,
  importance: z.enum(['core', 'major', 'minor']),
  category: powerCategorySchema,
  sourceComponent: shortText.optional(),
}).strict()

const canonicalConstraintSchema = z.object({
  name: shortText,
  description: longText,
  appliesTo: shortText,
}).strict()

const adaptationConflictSchema = z.object({
  trait: longText,
  belongsTo: shortText,
  reason: longText,
}).strict()

export const conceptAnalysisSchema = z.preprocess((value) => normalizeModelOutput(value), z.object({
  recognizedCanon: modelBoolean,
  startingAccess: z.enum(['latent', 'limited', 'developing', 'mastered', 'complete']),
  entities: z.array(z.object({
    name: shortText,
    exactName: shortText,
    type: z.enum(['character', 'artifact', 'ability', 'world', 'organization', 'species', 'technology', 'other']),
    source: shortText,
    continuity: shortText,
    identity: longText,
    confidence: modelNumber(z.number().min(0).max(100)),
    mustPreserve: z.array(longText).max(64),
    capabilityChecklist: z.array(canonCapabilitySchema).max(64),
    canonicalConstraints: z.array(canonicalConstraintSchema).max(64),
    adaptationConflicts: z.array(adaptationConflictSchema).max(64),
    namingRules: z.array(longText).max(32),
    forbiddenDistortions: z.array(longText).max(32),
    uncertainties: z.array(longText).max(24),
  }).strict()).max(20),
  powerFantasy: longText,
  desiredScale: longText,
  originalityRules: z.array(longText).max(32),
}).strict())

export const worldQualityReviewSchema = z.preprocess((value) => normalizeModelOutput(value), z.object({
  pass: modelBoolean,
  coverage: modelNumber(z.number().min(0).max(100)),
  issues: z.array(z.object({
    type: z.enum(['canon', 'completeness', 'specificity', 'originality', 'mechanics', 'consistency']),
    entity: shortText,
    detail: longText,
    severity: z.enum(['low', 'medium', 'high']),
  }).strict()).max(64),
  missingCapabilities: z.array(longText).max(64),
  coverageAudit: z.array(z.object({
    capability: shortText,
    importance: z.enum(['core', 'major', 'minor']),
    status: z.enum(['covered', 'partial', 'missing']),
    location: longText,
    detail: longText,
  }).strict()).max(128),
  constraintAudit: z.array(z.object({
    constraint: longText,
    location: longText,
    verdict: z.enum(['canonical', 'consistent', 'unsupported', 'wrong-continuity']),
    basis: longText,
  }).strict()).max(128),
  rewriteInstructions: longText,
}).strict().superRefine((review, context) => {
  if (!review.pass) return
  review.coverageAudit.forEach((entry, index) => {
    if (entry.importance !== 'minor' && entry.status !== 'covered') context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['coverageAudit', index, 'status'],
      message: 'A passing review must cover every core and major capability',
    })
  })
  review.constraintAudit.forEach((entry, index) => {
    if (entry.verdict === 'unsupported' || entry.verdict === 'wrong-continuity') context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['constraintAudit', index, 'verdict'],
      message: 'A passing review cannot contain unsupported or wrong-continuity constraints',
    })
  })
}))
const generatedMysteryCaseSchema = z.object({
  title: shortText,
  premise: longText,
  truth: longText,
  culpritName: shortText.optional(),
  clues: z.array(z.object({
    title: shortText,
    detail: longText,
    location: shortText,
    source: longText,
    discovered: modelBoolean,
    essential: modelBoolean,
  }).strict()).min(4).max(16),
  redHerrings: z.array(longText).min(1).max(8),
  revelationRules: z.array(longText).min(2).max(8),
}).strict()
const generatedAntagonistPlanSchema = z.object({
  ownerName: shortText,
  title: shortText,
  objective: longText,
  method: longText,
  currentStep: modelNumber(z.number().int().min(0).max(10)),
  pressure: modelNumber(z.number().min(0).max(100)),
  resources: z.array(longText).min(1).max(10),
  knowledge: z.array(longText).min(1).max(12),
  steps: z.array(z.object({
    title: shortText,
    trigger: longText,
    consequence: longText,
    status: z.enum(['pending', 'active', 'completed', 'failed', 'abandoned']),
  }).strict()).min(3).max(10),
  weaknesses: z.array(longText).min(1).max(8),
  status: z.enum(['active', 'completed', 'failed', 'abandoned']),
  secret: modelBoolean,
}).strict()
const generatedInfluenceAssetSchema = z.object({
  kind: influenceKindSchema,
  title: shortText,
  description: longText,
  holderName: shortText,
  targetName: shortText.optional(),
  value: modelNumber(z.number().min(-100).max(100)),
  status: z.enum(['active', 'spent', 'repaid', 'lost']),
  source: longText,
  secret: modelBoolean,
}).strict()

const generatedWorldContract = z.object({
  title: shortText,
  world: z.object({
    name: shortText,
    tagline: shortText,
    inspiration: longText,
    genre: shortText,
    tone: shortText,
    era: shortText,
    overview: longText,
    rules: z.array(shortText).min(3).max(10),
    factions: z.array(generatedWorldFactionSchema).min(2).max(8),
    locations: z.array(z.object({ name: shortText, description: longText, danger: modelNumber(z.number().min(0).max(100)) })).min(3).max(12),
    mysteries: z.array(shortText).min(2).max(8),
    routes: z.array(worldRouteSchema).min(2).max(30),
    laws: z.array(generatedWorldLawSchema).min(2).max(12),
    mechanics: z.array(generatedWorldMechanicSchema).min(2).max(12),
    interfaceModules: z.array(adaptiveInterfaceModuleDraftSchema).min(2).max(6),
    system: z.object({
      name: shortText, summary: longText, progression: longText, conflictResolution: longText, consequences: longText,
      equipmentSlots: z.array(z.object({ key: shortText, label: shortText, accepts: z.array(itemCategorySchema).min(1).max(7) }).strict()).min(1).max(12),
    }).strict(),
    presentation: z.object({
      accent: colorSchema, accentStrong: colorSchema, secondary: colorSchema,
      surface: surfaceSchema, motif: shortText,
      labels: z.object({
        scene: shortText, character: shortText, inventory: shortText, world: shortText, quests: shortText, abilities: shortText,
        lore: shortText, memories: shortText, stats: shortText, resources: shortText, conditions: shortText, level: shortText,
        chapter: shortText, turn: shortText, action: shortText, speech: shortText, direction: shortText, continue: shortText,
      }).strict(),
      categoryLabels: z.object({
        weapon: shortText, armor: shortText, consumable: shortText, artifact: shortText, quest: shortText, material: shortText, other: shortText,
      }).strict(),
      rarityLabels: z.object({ common: shortText, uncommon: shortText, rare: shortText, epic: shortText, legendary: shortText }).strict(),
    }).strict(),
  }),
  player: z.object({
    name: shortText,
    archetype: shortText,
    appearance: longText,
    personality: longText,
    backstory: longText,
    goal: longText,
    stats: z.array(statStateSchema).min(3).max(24),
    resources: z.array(resourceStateSchema.extend({ kind: resourceKindSchema, max: modelNumber(z.number().positive()) }).strict()).min(1).max(24),
    abilities: z.array(generatedAbilitySchema).min(1).max(40),
    currency: z.preprocess(normalizeCurrencyRecord, z.record(z.string().max(100), z.number().min(0))),
  }),
  inventory: z.array(z.object({
    name: shortText, description: longText,
    category: itemCategorySchema,
    quantity: modelNumber(z.number().int().min(1).max(999)), rarity: raritySchema,
    rarityProfile: rarityProfileSchema,
    equipped: modelBoolean, equippedSlot: z.string().max(120).optional(), effects: z.array(z.string().max(300)).max(12), origin: z.string().max(500).optional(), weight: optionalModelNumber(z.number().min(0)),
    durability: optionalModelNumber(z.number().min(0).max(100_000)),
    maxDurability: optionalModelNumber(z.number().positive().max(100_000)),
    charges: optionalModelNumber(z.number().int().min(0).max(1_000_000)),
    maxCharges: optionalModelNumber(z.number().int().positive().max(1_000_000)),
    state: z.enum(['intact', 'damaged', 'broken', 'depleted', 'sealed']).optional(),
    history: z.array(z.object({ title: shortText, description: longText }).strict()).min(1).max(8),
    artifact: generatedArtifactProfileSchema.optional(),
  })).min(1).max(20),
  npcs: z.array(z.object({
    name: shortText, role: shortText, description: longText, disposition: shortText,
    relationship: modelNumber(z.number().min(-100).max(100)), currentGoal: longText, lastSeen: shortText, notes: z.array(z.string().max(500)).max(8),
    stats: z.array(statStateSchema).min(3).max(24),
    resources: z.array(resourceStateSchema.extend({ kind: resourceKindSchema, max: modelNumber(z.number().positive()) }).strict()).min(1).max(24),
    abilities: z.array(generatedAbilitySchema).min(1).max(20),
    knowledge: z.array(knowledgeFactSchema.omit({ id: true })).max(20),
    relationshipDimensions: relationshipDimensionsSchema,
    initiative: npcInitiativeSchema.omit({ lastAdvancedTurn: true }),
    strategy: npcStrategySchema.omit({ lastUpdatedTurn: true }),
    recruitment: npcRecruitmentSchema,
    voice: npcVoiceSchema,
  })).min(1).max(12),
  socialLinks: z.array(z.object({
    fromNpcName: shortText, toNpcName: shortText,
    kind: shortText,
    label: shortText, score: modelNumber(z.number().min(-100).max(100)), secret: modelBoolean, notes: z.array(z.string().max(500)).max(8),
  }).strict()).max(30),
  worldEvents: z.array(z.object({
    title: shortText, description: longText, dueTurn: optionalModelNumber(z.number().int().min(1)), dueDay: optionalModelNumber(z.number().int().min(1)),
    visibility: worldVisibilitySchema, involvedNpcNames: z.array(shortText).max(12),
  }).strict()).min(1).max(10),
  factionReputation: z.array(z.object({ factionName: shortText, value: modelNumber(z.number().min(-100).max(100)), label: shortText, notes: z.array(z.string().max(500)).max(8) }).strict()).max(8),
  threads: z.array(z.object({
    type: shortText, title: shortText, detail: longText,
    participantNames: z.array(shortText).max(12), status: shortText,
    dueTurn: optionalModelNumber(z.number().int().min(1)), secret: modelBoolean,
  }).strict()).max(10),
  characterArcs: z.array(generatedCharacterArcSchema).min(2).max(12),
  mysteryCases: z.array(generatedMysteryCaseSchema).min(1).max(6),
  antagonistPlans: z.array(generatedAntagonistPlanSchema).min(1).max(6),
  influenceAssets: z.array(generatedInfluenceAssetSchema).min(2).max(16),
  quests: z.array(z.object({
    title: shortText, description: longText, objectives: z.array(shortText).min(1).max(8), reward: z.string().max(500).optional(), giver: z.string().max(300).optional(),
  })).min(1).max(8),
  lore: z.array(z.object({
    title: shortText, type: loreTypeSchema, content: longText,
    keys: z.array(z.string().max(100)).min(1).max(20), alwaysOn: modelBoolean, secret: modelBoolean, discovered: modelBoolean, priority: modelNumber(z.number().min(0).max(100)),
  })).min(1).max(30),
  opening: z.object({
    scene: z.object({ title: shortText, location: shortText, time: shortText, weather: shortText, tension: modelNumber(z.number().min(0).max(100)), presentNpcNames: z.array(shortText).max(8) }),
    narrative: longText,
    suggestions: z.array(shortText).min(2).max(4),
  }),
}).strict().superRefine((world, context) => {
  const npcNames = new Set(world.npcs.map((npc) => npc.name.toLocaleLowerCase('ru-RU')))
  const entityNames = new Set([...npcNames, world.player.name.toLocaleLowerCase('ru-RU')])
  const requireEntity = (name: string, path: Array<string | number>) => {
    if (!entityNames.has(name.toLocaleLowerCase('ru-RU'))) context.addIssue({
      code: z.ZodIssueCode.custom,
      path,
      message: `Unknown character reference: ${name}`,
    })
  }
  world.characterArcs.forEach((arc, index) => requireEntity(arc.ownerName, ['characterArcs', index, 'ownerName']))
  world.mysteryCases.forEach((mystery, index) => {
    if (mystery.culpritName) requireEntity(mystery.culpritName, ['mysteryCases', index, 'culpritName'])
  })
  world.antagonistPlans.forEach((plan, index) => {
    if (!npcNames.has(plan.ownerName.toLocaleLowerCase('ru-RU'))) context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['antagonistPlans', index, 'ownerName'],
      message: `Antagonist owner must exactly match an NPC name: ${plan.ownerName}`,
    })
  })
  world.influenceAssets.forEach((asset, index) => {
    requireEntity(asset.holderName, ['influenceAssets', index, 'holderName'])
    if (asset.targetName) requireEntity(asset.targetName, ['influenceAssets', index, 'targetName'])
  })
  if (!world.mysteryCases.every((mystery) => mystery.clues.some((clue) => clue.essential && !clue.discovered))) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['mysteryCases'],
      message: 'Every mystery must preserve at least one undiscovered essential clue at campaign start',
    })
  }
  const resourceKeys = new Set(world.player.resources.map((resource) => resource.key.toLocaleLowerCase('ru-RU')))
  world.player.resources.forEach((resource, index) => {
    if (resource.criticalBelow !== undefined && resource.criticalBelow > resource.max) context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['player', 'resources', index, 'criticalBelow'],
      message: 'criticalBelow cannot exceed the resource maximum',
    })
  })
  const requireKnownCost = (resource: string, path: Array<string | number>, knownKeys = resourceKeys) => {
    if (!knownKeys.has(resource.toLocaleLowerCase('ru-RU'))) context.addIssue({
      code: z.ZodIssueCode.custom,
      path,
      message: `Ability or artifact cost references an unknown resource key: ${resource}`,
    })
  }
  world.player.abilities.forEach((ability, abilityIndex) => ability.costs.forEach((cost, costIndex) => {
    requireKnownCost(cost.resource, ['player', 'abilities', abilityIndex, 'costs', costIndex, 'resource'])
  }))
  world.npcs.forEach((npc, npcIndex) => {
    const npcResourceKeys = new Set(npc.resources.map((resource) => resource.key.toLocaleLowerCase('ru-RU')))
    npc.resources.forEach((resource, resourceIndex) => {
      if (resource.criticalBelow !== undefined && resource.criticalBelow > resource.max) context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['npcs', npcIndex, 'resources', resourceIndex, 'criticalBelow'],
        message: 'criticalBelow cannot exceed the NPC resource maximum',
      })
    })
    npc.abilities.forEach((ability, abilityIndex) => ability.costs.forEach((cost, costIndex) => {
      requireKnownCost(cost.resource, ['npcs', npcIndex, 'abilities', abilityIndex, 'costs', costIndex, 'resource'], npcResourceKeys)
    }))
  })
  world.inventory.forEach((item, itemIndex) => {
    if (item.maxDurability !== undefined && item.durability !== undefined && item.durability > item.maxDurability) context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['inventory', itemIndex, 'durability'],
      message: 'durability cannot exceed maxDurability',
    })
    if (item.maxCharges !== undefined && item.charges !== undefined && item.charges > item.maxCharges) context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['inventory', itemIndex, 'charges'],
      message: 'charges cannot exceed maxCharges',
    })
    item.artifact?.powers.forEach((power, powerIndex) => power.costs.forEach((cost, costIndex) => {
      requireKnownCost(cost.resource, ['inventory', itemIndex, 'artifact', 'powers', powerIndex, 'costs', costIndex, 'resource'])
    }))
  })
})

export const generatedWorldSchema = z.preprocess((value) => normalizeModelOutput(value), generatedWorldContract)

export type GeneratedWorld = z.infer<typeof generatedWorldSchema>
export type ConceptAnalysis = z.infer<typeof conceptAnalysisSchema>
export type WorldQualityReview = z.infer<typeof worldQualityReviewSchema>
export type ConsequenceAudit = z.infer<typeof consequenceAuditSchema>
