import { z } from 'zod'
import { assessLegendEcology, assessStrongCharacterEcology } from '../shared/legend-ecology.js'
import { normalizeHexColor, normalizeModelOutput, normalizeTurnPatch, normalizeTurnPlan, parseBooleanLike, parseNumberLike } from './model-normalizer.js'

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
const arrayish = (value: unknown) => value === undefined ? value : Array.isArray(value) ? value : [value]
const colorSchema = z.preprocess(normalizeHexColor, z.string().regex(/^#[0-9a-f]{6}$/i, 'Expected a six-digit HEX color'))
const itemCategorySchema = z.preprocess(alias({ оружие: 'weapon', броня: 'armor', защита: 'armor', расходник: 'consumable', припас: 'consumable', артефакт: 'artifact', реликвия: 'artifact', квест: 'quest', сюжетный: 'quest', материал: 'material', другое: 'other', прочее: 'other' }), z.enum(['weapon', 'armor', 'consumable', 'artifact', 'quest', 'material', 'other']))
const raritySchema = z.preprocess(alias({
  обычный: 'common', обычное: 'common', необычный: 'uncommon', необычное: 'uncommon', редкий: 'rare', редкое: 'rare',
  исключительный: 'exceptional', исключительное: 'exceptional', эпический: 'epic', эпическое: 'epic',
  легендарный: 'legendary', легендарное: 'legendary', мифический: 'mythic', мифическое: 'mythic',
  трансцендентный: 'transcendent', трансцендентное: 'transcendent', божественный: 'transcendent', божественное: 'transcendent',
}), z.enum(['common', 'uncommon', 'rare', 'exceptional', 'epic', 'legendary', 'mythic', 'transcendent']))
const npcStatusSchema = z.preprocess(alias({ активен: 'active', активна: 'active', активно: 'active', отсутствует: 'absent', отсутствующий: 'absent', пропал: 'missing', пропала: 'missing', пропавший: 'missing', мертв: 'dead', мёртв: 'dead', мертва: 'dead', мертва́: 'dead', неизвестно: 'unknown', неизвестен: 'unknown' }), z.enum(['active', 'absent', 'missing', 'dead', 'unknown']))
const worldVisibilitySchema = z.preprocess(alias({ известно: 'known', известное: 'known', открыто: 'known', слух: 'rumored', слухи: 'rumored', слухами: 'rumored', предположение: 'rumored', скрыто: 'hidden', скрытое: 'hidden', тайно: 'hidden', секретно: 'hidden' }), z.enum(['known', 'rumored', 'hidden']))
const worldLawStatusSchema = z.preprocess(alias({ предложен: 'proposed', предложено: 'proposed', проект: 'proposed', активен: 'active', активно: 'active', действует: 'active', оспаривается: 'contested', оспорен: 'contested', спорный: 'contested', отменен: 'repealed', отменён: 'repealed', отменено: 'repealed' }), z.enum(['proposed', 'active', 'contested', 'repealed']))
const worldMechanicCategorySchema = z.preprocess(alias({ сила: 'power', способности: 'power', социальная: 'social', общество: 'social', экономика: 'economic', экономическая: 'economic', путешествие: 'travel', путешествия: 'travel', ремесло: 'crafting', создание: 'crafting', выживание: 'survival', политика: 'political', политическая: 'political', другое: 'other', прочее: 'other' }), z.enum(['power', 'social', 'economic', 'travel', 'crafting', 'survival', 'political', 'other']))
const worldMechanicStatusSchema = z.preprocess(alias({ зарождается: 'emerging', новая: 'emerging', активна: 'active', активно: 'active', действует: 'active', устарела: 'obsolete', утрачена: 'obsolete', неактуальна: 'obsolete' }), z.enum(['emerging', 'active', 'obsolete']))
const worldFactionStatusSchema = z.preprocess(alias({ активна: 'active', активен: 'active', действует: 'active', спящая: 'dormant', неактивна: 'dormant', скрыта: 'dormant', распущена: 'dissolved', распалась: 'dissolved', уничтожена: 'dissolved' }), z.enum(['active', 'dormant', 'dissolved']))
const worldFactionKindSchema = z.preprocess(alias({ государство: 'government', правительство: 'government', корпорация: 'corporation', гильдия: 'guild', армия: 'military', военные: 'military', религия: 'religion', церковь: 'religion', преступная: 'criminal', клан: 'clan', движение: 'movement', учреждение: 'institution', институт: 'institution', другое: 'other' }), z.enum(['government', 'corporation', 'guild', 'military', 'religion', 'criminal', 'clan', 'movement', 'institution', 'other']))
const worldPlaceKindSchema = z.preprocess(alias({ континент: 'continent', страна: 'country', регион: 'region', область: 'region', город: 'city', район: 'district', поселение: 'settlement', деревня: 'settlement', пустошь: 'wilderness', дикая_местность: 'wilderness', царство: 'realm', мир: 'realm', планета: 'planet', система: 'system', станция: 'station', измерение: 'dimension', другое: 'other' }), z.enum(['continent', 'country', 'region', 'city', 'district', 'settlement', 'wilderness', 'realm', 'planet', 'system', 'station', 'dimension', 'other']))
const worldProcessStatusSchema = z.preprocess(alias({ активно: 'active', развивается: 'active', застопорилось: 'stalled', остановлено: 'stalled', завершено: 'resolved', разрешено: 'resolved', провалено: 'failed' }), z.enum(['active', 'stalled', 'resolved', 'failed']))
const worldProcessDirectionSchema = z.preprocess(alias({ растет: 'rising', растёт: 'rising', усиливается: 'rising', стабильно: 'stable', без_изменений: 'stable', снижается: 'declining', ослабевает: 'declining' }), z.enum(['rising', 'stable', 'declining']))
const worldScaleSchema = z.preprocess(alias({ личный: 'personal', персональный: 'personal', местный: 'local', локальный: 'local', региональный: 'regional', регион: 'regional', национальный: 'national', страна: 'national', континентальный: 'continental', континент: 'continental', глобальный: 'global', мировой: 'global', космический: 'cosmic', вселенский: 'cosmic' }), z.enum(['personal', 'local', 'regional', 'national', 'continental', 'global', 'cosmic']))
const legendStageSchema = z.preprocess(alias({ заметный: 'notable', известный: 'renowned', прославленный: 'renowned', легендарный: 'legendary', мифический: 'mythic', божественный: 'mythic' }), z.enum(['notable', 'renowned', 'legendary', 'mythic']))
const legendPowerClassSchema = z.preprocess(alias({ небоевой: 'noncombatant', мирный: 'noncombatant', незначительный: 'minor', обычный: 'capable', способный: 'capable', опасный: 'dangerous', элитный: 'elite', легендарный: 'legendary', мифический: 'mythic', неизвестно: 'unknown' }), z.enum(['noncombatant', 'minor', 'capable', 'dangerous', 'elite', 'legendary', 'mythic', 'unknown']))
const legendLifeStatusSchema = z.preprocess(alias({ жив: 'living', жива: 'living', живой: 'living', мертв: 'dead', мёртв: 'dead', мертва: 'dead', пропал: 'missing', пропала: 'missing', исчез: 'missing', запечатан: 'sealed', запечатана: 'sealed', спит: 'dormant', дремлет: 'dormant', вернулся: 'returned', вернулась: 'returned', воскрешен: 'returned', воскрешён: 'returned', вознесен: 'ascended', вознесён: 'ascended', вознеслась: 'ascended', неизвестно: 'unknown' }), z.enum(['living', 'dead', 'missing', 'sealed', 'dormant', 'returned', 'ascended', 'unknown']))
const legendTruthStatusSchema = z.preprocess(alias({ подтверждено: 'confirmed', подтверждённо: 'confirmed', правда: 'confirmed', частично_правда: 'partly_true', частично: 'partly_true', искажено: 'distorted', искаженная: 'distorted', выдумано: 'fabricated', ложь: 'fabricated', неизвестно: 'unknown' }), z.enum(['confirmed', 'partly_true', 'distorted', 'fabricated', 'unknown']))
const legendLegacyKindSchema = z.preprocess(alias({ техника: 'technique', способность: 'technique', артефакт: 'artifact', реликвия: 'artifact', род: 'bloodline', кровь: 'bloodline', школа: 'school', учение: 'school', фракция: 'faction', организация: 'faction', культ: 'cult', закон: 'law', место: 'place', локация: 'place', пророчество: 'prophecy', титул: 'title', другое: 'other', прочее: 'other' }), z.enum(['technique', 'artifact', 'bloodline', 'school', 'faction', 'cult', 'law', 'place', 'prophecy', 'title', 'other']))
const legendDiscoverySectionSchema = z.preprocess(alias({ личность: 'identity', имя: 'identity', обзор: 'summary', описание: 'summary', сила: 'power', мощь: 'power', возможности: 'power', статус: 'status', судьба: 'status', происхождение: 'origin', подвиги: 'deeds', деяния: 'deeds', мифы: 'myths', легенды: 'myths', наследие: 'legacies', наследства: 'legacies', связи: 'affiliations', принадлежность: 'affiliations', местонахождение: 'whereabouts', следы: 'whereabouts', встреча: 'encounter', доступность: 'encounter', канон: 'canon', хронология: 'canon' }), z.enum(['identity', 'summary', 'power', 'status', 'origin', 'deeds', 'myths', 'legacies', 'affiliations', 'whereabouts', 'encounter', 'canon']))
const interfacePlacementSchema = z.preprocess(alias({ пульт: 'dashboard', сводка: 'dashboard', обзор: 'dashboard', сцена: 'scene', герой: 'hero', персонаж: 'hero', инвентарь: 'inventory', снаряжение: 'inventory', мир: 'world' }), z.enum(['dashboard', 'scene', 'hero', 'inventory', 'world']))
const interfaceVisualSchema = z.preprocess(alias({ шкалы: 'meters', индикаторы: 'meters', узлы: 'nodes', сеть: 'nodes', слоты: 'slots', ячейки: 'slots', путь: 'track', этапы: 'track', журнал: 'ledger', реестр: 'ledger', сигналы: 'signals', сообщения: 'signals', радар: 'radar', диаграмма: 'radar', карточки: 'cards', плитки: 'cards' }), z.enum(['meters', 'nodes', 'slots', 'track', 'ledger', 'signals', 'radar', 'cards']))
const interfaceIconSchema = z.preprocess(alias({ искра: 'spark', глаз: 'eye', взгляд: 'eye', щит: 'shield', сеть: 'network', узлы: 'network', пульс: 'pulse', сердце: 'pulse', компас: 'compass', корона: 'crown', руна: 'rune', механизм: 'gear', шестерня: 'gear', пламя: 'flame', огонь: 'flame', звезда: 'star', луна: 'moon' }), z.enum(['spark', 'eye', 'shield', 'network', 'pulse', 'compass', 'crown', 'rune', 'gear', 'flame', 'star', 'moon']))
const interfaceElementKindSchema = z.preprocess(alias({ шкала: 'meter', значение: 'value', метка: 'badge', узел: 'node', слот: 'slot', этап: 'step', текст: 'text' }), z.enum(['meter', 'value', 'badge', 'node', 'slot', 'step', 'text']))
const interfaceElementStateSchema = z.preprocess(alias({ обычно: 'normal', норма: 'normal', положительно: 'positive', хорошо: 'positive', предупреждение: 'warning', внимание: 'warning', опасность: 'danger', критично: 'danger', заблокировано: 'locked', закрыто: 'locked', неактивно: 'inactive' }), z.enum(['normal', 'positive', 'warning', 'danger', 'locked', 'inactive']))
const interfaceBindingDomainSchema = z.preprocess(alias({
  свое: 'custom', своё: 'custom', уникальное: 'custom',
  'уровень игрока': 'player.level', 'уровень героя': 'player.level',
  'ресурс игрока': 'player.resource', 'ресурс героя': 'player.resource',
  'характеристика игрока': 'player.stat', 'характеристика героя': 'player.stat',
  'валюта игрока': 'player.currency', 'валюта героя': 'player.currency',
  'состояния игрока': 'player.condition-count', 'состояния героя': 'player.condition-count',
  'освоение способности': 'player.ability-mastery', 'мастерство способности': 'player.ability-mastery',
  'напряжение сцены': 'scene.tension', напряжение: 'scene.tension',
  'раунд конфликта': 'conflict.round',
  'готовность участника': 'conflict.participant-readiness',
  'мораль участника': 'conflict.participant-morale',
  'день мира': 'world.day', день: 'world.day',
  'показатель мира': 'world.metric', 'метрика мира': 'world.metric',
  'опасность локации': 'world.location-danger',
  'импульс процесса': 'world.process-momentum',
  'давление мира': 'world.pressure',
  'репутация фракции': 'faction.reputation', репутация: 'faction.reputation',
  'сила фракции': 'faction.power',
  'категория инвентаря': 'inventory.category-count', 'число предметов': 'inventory.category-count',
  'заряды предмета': 'inventory.item-charges', заряды: 'inventory.item-charges',
  'количество предмета': 'inventory.item-quantity',
  'прочность предмета': 'inventory.item-durability',
  'освоение артефакта': 'artifact.mastery',
  'настройка артефакта': 'artifact.attunement',
  'связь с артефактом': 'artifact.bond',
  'освоение силы артефакта': 'artifact.power-mastery',
  'активные задания': 'quest.active-count', задания: 'quest.active-count',
  'прогресс задания': 'quest.objective-progress',
  'прогресс тайны': 'mystery.progress',
  'размер отряда': 'party.size',
  'характеристика нпс': 'npc.stat', 'характеристика npc': 'npc.stat',
  'ресурс нпс': 'npc.resource', 'ресурс npc': 'npc.resource',
  'срочность нпс': 'npc.initiative-urgency', 'срочность npc': 'npc.initiative-urgency',
  'грань отношения нпс': 'npc.relationship-dimension', 'грань отношения npc': 'npc.relationship-dimension',
  'отношение нпс': 'npc.relationship', 'отношение npc': 'npc.relationship',
}), z.enum([
  'custom', 'player.level', 'player.resource', 'player.stat', 'player.currency', 'player.condition-count', 'player.ability-mastery',
  'scene.tension', 'conflict.round', 'conflict.participant-readiness', 'conflict.participant-morale',
  'world.day', 'world.metric', 'world.location-danger', 'world.process-momentum', 'world.pressure',
  'faction.reputation', 'faction.power', 'inventory.category-count', 'inventory.item-charges', 'inventory.item-quantity', 'inventory.item-durability',
  'artifact.mastery', 'artifact.attunement', 'artifact.bond', 'artifact.power-mastery',
  'quest.active-count', 'quest.objective-progress', 'mystery.progress', 'party.size',
  'npc.stat', 'npc.resource', 'npc.initiative-urgency', 'npc.relationship-dimension', 'npc.relationship',
]))
const knowledgeStatusSchema = z.preprocess(alias({ известно: 'known', знает: 'known', убежден: 'believed', убеждён: 'believed', верит: 'believed', предполагает: 'suspected', подозревает: 'suspected', ложно: 'false', ложь: 'false', ошибочно: 'false' }), z.enum(['known', 'believed', 'suspected', 'false']))
const loreTypeSchema = z.preprocess(alias({ персонаж: 'character', герой: 'character', локация: 'location', место: 'location', фракция: 'faction', организация: 'faction', предмет: 'object', объект: 'object', правило: 'rule', закон: 'rule', история: 'history', тайна: 'secret', секрет: 'secret' }), z.enum(['character', 'location', 'faction', 'object', 'rule', 'history', 'secret']))
const memoryKindSchema = z.preprocess(alias({ сводка: 'summary', итог: 'summary', факт: 'fact', обещание: 'promise', отношение: 'relationship', отношения: 'relationship', тайна: 'mystery', загадка: 'mystery' }), z.enum(['summary', 'fact', 'promise', 'relationship', 'mystery']))
const worldEventStatusSchema = z.preprocess(alias({ запланировано: 'scheduled', ожидается: 'scheduled', назрело: 'due', наступило: 'due', выполнено: 'resolved', решено: 'resolved', завершено: 'resolved', отменено: 'cancelled' }), z.enum(['scheduled', 'due', 'resolved', 'cancelled']))
const storyThreadTypeSchema = z.preprocess(alias({
  обещание: 'promise', клятва: 'promise', обязательство: 'promise', задача: 'promise', задание: 'promise', квест: 'promise', quest: 'promise', mission: 'promise', personal: 'promise',
  долг: 'debt', задолженность: 'debt', обязанность: 'debt', obligation: 'debt',
  свидетельство: 'witness', свидетель: 'witness', улика: 'witness', факт: 'witness', evidence: 'witness', testimony: 'witness',
  слух: 'rumor', слухи: 'rumor', тайна: 'rumor', загадка: 'rumor', mystery: 'rumor', secret: 'rumor',
}), z.enum(['promise', 'debt', 'witness', 'rumor']))
const storyThreadStatusSchema = z.preprocess(alias({
  активно: 'active', активен: 'active', активна: 'active', открыто: 'active', открыт: 'active', открыта: 'active', известно: 'active', известен: 'active', известна: 'active', скрыто: 'active', скрыт: 'active', скрыта: 'active', open: 'active', known: 'active', hidden: 'active',
  исполнено: 'fulfilled', выполнено: 'fulfilled', fulfilled: 'fulfilled', completed: 'fulfilled',
  нарушено: 'broken', сорвано: 'broken', провалено: 'broken', failed: 'broken',
  разрешено: 'resolved', решено: 'resolved', завершено: 'resolved', закрыто: 'resolved', done: 'resolved',
}), z.enum(['active', 'fulfilled', 'broken', 'resolved']))
const threatTierSchema = z.preprocess(alias({ незначительный: 'minor', обычный: 'capable', подготовленный: 'capable', опасный: 'dangerous', элитный: 'elite', легендарный: 'legendary', мифический: 'mythic', божественный: 'mythic' }), z.enum(['minor', 'capable', 'dangerous', 'elite', 'legendary', 'mythic']))
const npcFamiliaritySchema = z.preprocess(alias({ узнан: 'recognized', знакомое_лицо: 'recognized', знаком: 'acquainted', знакомство: 'acquainted', хорошо_знаком: 'familiar', изучен: 'familiar', близок: 'close', близко_знаком: 'close', экспертно_изучен: 'expert', полностью_изучен: 'expert' }), z.enum(['recognized', 'acquainted', 'familiar', 'close', 'expert']))
const npcDossierSectionSchema = z.preprocess(alias({
  описание: 'description', характер: 'personality', личность: 'personality', расположение: 'disposition', отношение: 'relationship',
  грани_отношений: 'relationshipDimensions', цель: 'goal', состояния: 'conditions', намерение: 'initiative',
  обзор_стратегии: 'strategyOverview', оценка_мышления: 'strategyMetrics', план: 'strategyPlan', детали_стратегии: 'strategyDetails',
  контрмеры: 'countermeasures', угроза: 'threatProfile', вербовка: 'recruitment', голос: 'voice',
  параметры: 'stats', ресурсы: 'resources', способности: 'abilities',
}), z.enum(['description', 'personality', 'disposition', 'relationship', 'relationshipDimensions', 'goal', 'conditions', 'initiative', 'strategyOverview', 'strategyMetrics', 'strategyPlan', 'strategyDetails', 'countermeasures', 'threatProfile', 'recruitment', 'voice', 'stats', 'resources', 'abilities']))
const challengeTierSchema = z.preprocess(alias({ нет: 'none', отсутствует: 'none', лёгкий: 'light', легкий: 'light', обычный: 'standard', средний: 'standard', сложный: 'hard', тяжёлый: 'severe', тяжелый: 'severe', экстремальный: 'severe', легендарный: 'legendary', мифический: 'mythic', божественный: 'mythic' }), z.enum(['none', 'light', 'standard', 'hard', 'severe', 'legendary', 'mythic']))
const storyBeatSchema = z.preprocess(alias({ передышка: 'respite', подготовка: 'setup', завязка: 'setup', исследование: 'exploration', нарастание: 'rising', испытание: 'challenge', последствия: 'aftermath', развязка: 'aftermath', кульминация: 'climax' }), z.enum(['respite', 'setup', 'exploration', 'rising', 'challenge', 'aftermath', 'climax']))
const worldPressureSourceKindSchema = z.preprocess(alias({ персонаж: 'npc', нпс: 'npc', npc: 'npc', фракция: 'faction', власть: 'authority', корпорация: 'corporation', бог: 'deity', божество: 'deity', космос: 'cosmic', космическая: 'cosmic', среда: 'environment', окружение: 'environment', другое: 'other' }), z.enum(['npc', 'faction', 'authority', 'corporation', 'deity', 'cosmic', 'environment', 'other']))
const worldPressureTierSchema = z.preprocess(alias({ след: 'trace', слабый: 'trace', локальный: 'local', местный: 'local', серьёзный: 'serious', серьезный: 'serious', критический: 'critical', легендарный: 'legendary', мифический: 'mythic', божественный: 'mythic' }), z.enum(['trace', 'local', 'serious', 'critical', 'legendary', 'mythic']))
const worldPressureStageSchema = z.preprocess(alias({ наблюдает: 'watching', наблюдение: 'watching', расследует: 'investigating', расследование: 'investigating', готовится: 'preparing', подготовка: 'preparing', действует: 'acting', действие: 'acting', затихает: 'cooling', ослабевает: 'cooling', завершено: 'resolved', разрешено: 'resolved' }), z.enum(['watching', 'investigating', 'preparing', 'acting', 'cooling', 'resolved']))
const worldPressureMeasureStatusSchema = z.preprocess(alias({ рассматривается: 'considered', задумано: 'considered', готовится: 'preparing', подготовка: 'preparing', активно: 'active', действует: 'active', использовано: 'spent', израсходовано: 'spent', сорвано: 'foiled', провалено: 'foiled' }), z.enum(['considered', 'preparing', 'active', 'spent', 'foiled']))
const narrativeEventModeSchema = z.preprocess(alias({ нет: 'none', пропустить: 'none', зерно: 'seed', заложить: 'seed', предвестник: 'foreshadow', предзнаменование: 'foreshadow', продвинуть: 'advance', развитие: 'advance', проявить: 'manifest', событие: 'manifest' }), z.enum(['seed', 'foreshadow', 'advance', 'manifest']))
const narrativeEventStageSchema = z.preprocess(alias({ заложено: 'seeded', зерно: 'seeded', предвестники: 'foreshadowed', предзнаменовано: 'foreshadowed', формируется: 'forming', готовится: 'forming', неизбежно: 'imminent', назрело: 'imminent', проявилось: 'manifested', произошло: 'manifested', последствия: 'aftermath', завершено: 'resolved', разрешено: 'resolved', отменено: 'cancelled' }), z.enum(['seeded', 'foreshadowed', 'forming', 'imminent', 'manifested', 'aftermath', 'resolved', 'cancelled']))
const narrativeEventMagnitudeSchema = z.preprocess(alias({ едва_заметное: 'subtle', тонкое: 'subtle', малое: 'subtle', заметное: 'notable', значимое: 'notable', крупное: 'major', большое: 'major', легендарное: 'legendary', мифическое: 'mythic', космическое: 'mythic' }), z.enum(['subtle', 'notable', 'major', 'legendary', 'mythic']))
const narrativeEventMiracleKindSchema = z.preprocess(alias({
  нет: 'none', обычное: 'none', none: 'none',
  знак: 'sign', предзнаменование: 'sign', sign: 'sign',
  вмешательство: 'intervention', чудо: 'intervention', спасение: 'intervention', intervention: 'intervention',
}), z.enum(['none', 'sign', 'intervention']))
const narrativeEventCategorySchema = z.preprocess(alias({
  встреча: 'encounter', появление: 'encounter', последствие: 'consequence', последствия: 'consequence', возможность: 'opportunity',
  открытие: 'revelation', откровение: 'revelation', превращение: 'transformation', мутация: 'transformation',
  сила: 'power_shift', способность: 'power_shift', ability: 'power_shift', power: 'power_shift',
  артефакт: 'artifact_shift', предмет: 'artifact_shift', artifact: 'artifact_shift', item: 'artifact_shift',
  фракция: 'faction_move', политика: 'faction_move', отношения: 'social_reversal', социальное: 'social_reversal',
  среда: 'environmental', природа: 'environmental', аномалия: 'anomaly', катастрофа: 'disaster',
  легенда: 'legend', чудо: 'divine', божественное: 'divine', время: 'temporal', измерение: 'dimensional',
  закон: 'law_change', механика: 'law_change', другое: 'other', прочее: 'other',
}), z.enum(['encounter', 'consequence', 'opportunity', 'revelation', 'transformation', 'power_shift', 'artifact_shift', 'faction_move', 'social_reversal', 'environmental', 'anomaly', 'disaster', 'legend', 'divine', 'temporal', 'dimensional', 'law_change', 'other']))
const narrativeEventOriginSchema = z.preprocess(alias({
  герой: 'player', игрок: 'player', персонаж: 'npc', нпс: 'npc', новый_персонаж: 'new_npc', новый_npc: 'new_npc',
  отряд: 'party', антагонист: 'antagonist', легенда: 'legend', фракция: 'faction', государство: 'state',
  артефакт: 'artifact', способность: 'ability', технология: 'technology', среда: 'environment', природа: 'environment',
  бог: 'deity', божество: 'deity', космос: 'cosmic', измерение: 'dimension', неизвестно: 'unknown',
  несколько: 'multiple', множество: 'multiple',
}), z.enum(['player', 'npc', 'new_npc', 'party', 'antagonist', 'legend', 'faction', 'state', 'artifact', 'ability', 'technology', 'environment', 'deity', 'cosmic', 'dimension', 'unknown', 'multiple']))
const narrativeEventDomainSchema = z.preprocess(alias({
  герой: 'player', игрок: 'player', персонаж: 'npc', нпс: 'npc', способность: 'ability', сила: 'ability',
  параметр: 'stat', характеристика: 'stat', ресурс: 'resource', валюта: 'currency', состояние: 'condition',
  эффект: 'status-effect', статус_эффект: 'status-effect', статусный_эффект: 'status-effect',
  артефакт: 'artifact', инвентарь: 'inventory', предмет: 'inventory', отношения: 'relationship', отряд: 'party',
  социальная_связь: 'social-link', связь_нпс: 'social-link',
  задание: 'quest', квест: 'quest', конфликт: 'conflict', бой: 'conflict', сцена: 'scene', фракция: 'faction',
  нить: 'thread', сюжетная_нить: 'thread', арка: 'character-arc', арка_персонажа: 'character-arc',
  тайна: 'mystery', расследование: 'mystery', план_антагониста: 'antagonist-plan', план_врага: 'antagonist-plan',
  влияние: 'influence', ресурс_влияния: 'influence', память: 'memory', темп: 'pacing', ритм: 'pacing',
  репутация_фракции: 'faction-reputation', отношение_фракции: 'faction-reputation',
  место: 'place', локация: 'place', маршрут: 'route', процесс: 'process', закон: 'law', механика: 'mechanic',
  правило_мира: 'world-rule', истина_мира: 'world-rule', профиль_мира: 'world-profile', система_мира: 'world-profile',
  легенда: 'legend', лор: 'lore', мировое_событие: 'world-event', событие_мира: 'world-event',
  давление: 'world-pressure', давление_мира: 'world-pressure', время: 'time', метрика: 'metric', показатель: 'metric', интерфейс: 'interface',
}), z.enum([
  'player', 'npc', 'stat', 'resource', 'currency', 'condition', 'status-effect', 'ability', 'artifact', 'inventory',
  'relationship', 'social-link', 'party', 'quest', 'thread', 'character-arc', 'mystery', 'antagonist-plan',
  'influence', 'memory', 'conflict', 'scene', 'pacing', 'faction', 'faction-reputation', 'place', 'route',
  'process', 'world-rule', 'world-profile', 'law', 'mechanic', 'legend', 'lore', 'world-event', 'world-pressure',
  'time', 'metric', 'interface',
]))
const narrativeEventOperationSchema = z.preprocess(alias({
  создать: 'create', создание: 'create', добавить: 'create', add: 'create',
  обновить: 'update', изменить: 'update', set: 'update',
  удалить: 'remove', потерять: 'remove', delete: 'remove',
  превратить: 'transform', преобразовать: 'transform',
  раскрыть: 'reveal', открыть: 'reveal',
}), z.enum(['create', 'update', 'remove', 'transform', 'reveal']))
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
  kind: worldFactionKindSchema.optional(),
  visibility: worldVisibilitySchema.optional(),
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
  headquarters: shortText.optional(),
  reach: longText.optional(),
  secrets: z.array(longText).max(16).optional(),
  lastChangedTurn: optionalModelNumber(z.number().int().min(0).max(1_000_000)),
}).strict()

const generatedWorldFactionSchema = z.object({
  name: shortText,
  kind: worldFactionKindSchema,
  visibility: worldVisibilitySchema,
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
  headquarters: shortText,
  reach: longText,
  secrets: z.array(longText).max(16),
}).strict()

const worldPlaceSchema = z.object({
  id: idSchema,
  name: shortText,
  kind: worldPlaceKindSchema,
  parentId: idSchema.optional(),
  description: longText,
  scale: shortText,
  population: shortText.optional(),
  government: longText.optional(),
  economy: longText.optional(),
  culture: z.array(longText).max(12),
  notableFacts: z.array(longText).max(16),
  currentSituation: longText,
  visibility: worldVisibilitySchema,
  createdTurn: modelNumber(z.number().int().min(0).max(1_000_000)),
  lastChangedTurn: modelNumber(z.number().int().min(0).max(1_000_000)),
}).strict()

const worldPlacePatchSchema = worldPlaceSchema.extend({
  createdTurn: optionalModelNumber(z.number().int().min(0).max(1_000_000)),
  lastChangedTurn: optionalModelNumber(z.number().int().min(0).max(1_000_000)),
}).strict()

const generatedWorldPlaceSchema = worldPlaceSchema.omit({ id: true, parentId: true, createdTurn: true, lastChangedTurn: true }).extend({
  parentName: shortText.optional(),
}).strict()

const worldProcessSchema = z.object({
  id: idSchema,
  title: shortText,
  description: longText,
  scopeIds: z.array(idSchema).max(20),
  involvedFactionNames: z.array(shortText).max(20),
  drivers: z.array(longText).min(1).max(16),
  obstacles: z.array(longText).max(16),
  stage: longText,
  momentum: modelNumber(z.number().min(0).max(100)),
  direction: worldProcessDirectionSchema,
  status: worldProcessStatusSchema,
  visibility: worldVisibilitySchema,
  nextMilestone: longText,
  dueTurn: optionalModelNumber(z.number().int().min(0).max(1_000_000)),
  consequences: z.array(longText).max(16),
  createdTurn: modelNumber(z.number().int().min(0).max(1_000_000)),
  lastAdvancedTurn: modelNumber(z.number().int().min(0).max(1_000_000)),
  scale: worldScaleSchema.optional(),
  causeIds: z.array(idSchema).max(24).optional(),
}).strict()

const worldProcessPatchSchema = worldProcessSchema.extend({
  createdTurn: optionalModelNumber(z.number().int().min(0).max(1_000_000)),
  lastAdvancedTurn: optionalModelNumber(z.number().int().min(0).max(1_000_000)),
}).strict()

const generatedWorldProcessSchema = worldProcessSchema.omit({ id: true, scopeIds: true, causeIds: true, createdTurn: true, lastAdvancedTurn: true }).extend({
  scopeNames: z.array(shortText).max(20),
  causeTitles: z.array(shortText).max(24).optional(),
}).strict()

const legendThresholdSchema = z.object({
  stage: legendStageSchema,
  minRenown: modelNumber(z.number().min(0).max(100)),
  requirements: z.array(longText).min(1).max(12),
}).strict()

const legendariumBaseSchema = z.object({
  name: shortText,
  summary: longText,
  recognitionRules: z.array(longText).min(1).max(16),
  transmissionChannels: z.array(longText).min(1).max(16),
  distortionForces: z.array(longText).max(16),
  memoryKeepers: z.array(longText).max(16),
  erasureForces: z.array(longText).max(16),
  successionRules: z.array(longText).max(16),
  encounterRules: z.array(longText).min(1).max(16),
  thresholds: z.array(legendThresholdSchema).length(4),
  updatedTurn: modelNumber(z.number().int().min(0).max(1_000_000)),
}).strict()

const validateLegendarium = (legendarium: z.infer<typeof legendariumBaseSchema>, context: z.RefinementCtx) => {
  const stages = legendarium.thresholds.map((threshold) => threshold.stage)
  if (new Set(stages).size !== 4 || !['notable', 'renowned', 'legendary', 'mythic'].every((stage) => stages.includes(stage as typeof stages[number]))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['thresholds'], message: 'Legend thresholds must contain every stage exactly once' })
  }
  const ordered = ['notable', 'renowned', 'legendary', 'mythic'].map((stage) => legendarium.thresholds.find((threshold) => threshold.stage === stage)?.minRenown ?? -1)
  if (ordered.some((value, index) => index > 0 && value <= ordered[index - 1])) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['thresholds'], message: 'Legend thresholds must rise from notable to mythic' })
  }
}

const generatedLegendariumSchema = legendariumBaseSchema.omit({ updatedTurn: true }).strict().superRefine((legendarium, context) => validateLegendarium({ ...legendarium, updatedTurn: 0 }, context))

const legendariumPatchSchema = legendariumBaseSchema.extend({
  updatedTurn: optionalModelNumber(z.number().int().min(0).max(1_000_000)),
}).strict().superRefine((legendarium, context) => validateLegendarium({ ...legendarium, updatedTurn: legendarium.updatedTurn ?? 0 }, context))

const legendDeedSchema = z.object({
  id: idSchema,
  title: shortText,
  summary: longText,
  era: shortText,
  scale: worldScaleSchema,
  scopeIds: z.array(idSchema).max(24),
  factionNames: z.array(shortText).max(20),
  witnesses: z.array(longText).max(20),
  consequences: z.array(longText).min(1).max(20),
  truth: legendTruthStatusSchema,
  visibility: worldVisibilitySchema,
  renownImpact: modelNumber(z.number().min(-100).max(100)),
}).strict()

const legendMythSchema = z.object({
  id: idSchema,
  title: shortText,
  claim: longText,
  origin: longText,
  spread: longText,
  believers: z.array(longText).max(20),
  distortion: longText,
  truth: legendTruthStatusSchema,
  visibility: worldVisibilitySchema,
}).strict()

const legendLegacySchema = z.object({
  id: idSchema,
  name: shortText,
  kind: legendLegacyKindSchema,
  description: longText,
  status: shortText,
  holderNpcIds: z.array(idSchema).max(20),
  scopeIds: z.array(idSchema).max(24),
  factionNames: z.array(shortText).max(20),
  accessConditions: z.array(longText).max(16),
  consequences: z.array(longText).max(16),
  visibility: worldVisibilitySchema,
}).strict()

const legendDiscoveryEvidenceSchema = z.object({
  id: idSchema,
  section: legendDiscoverySectionSchema,
  summary: longText,
  source: shortText,
  learnedTurn: modelNumber(z.number().int().min(0).max(1_000_000)),
  reliability: modelNumber(z.number().min(0).max(100)),
}).strict()

const legendDiscoverySchema = z.object({
  visibility: worldVisibilitySchema,
  awareness: modelNumber(z.number().min(0).max(100)),
  revealedSections: z.array(legendDiscoverySectionSchema).max(16),
  evidence: z.array(legendDiscoveryEvidenceSchema).max(80),
  updatedTurn: modelNumber(z.number().int().min(0).max(1_000_000)),
}).strict()

const legendCurrentStateSchema = z.object({
  activity: longText,
  objective: longText,
  locationId: idSchema.optional(),
  mobility: longText,
  encounterReadiness: modelNumber(z.number().min(0).max(100)),
  encounterConditions: z.array(longText).max(16),
  blockers: z.array(longText).max(16),
  signs: z.array(longText).max(16),
  lastConfirmedAt: shortText,
  lastUpdatedTurn: modelNumber(z.number().int().min(0).max(1_000_000)),
}).strict()

const legendCanonProfileSchema = z.object({
  status: z.preprocess(alias({ канон: 'canonical', канонический: 'canonical', производное: 'derived', развитие: 'derived', оригинал: 'original', оригинальный: 'original' }), z.enum(['canonical', 'derived', 'original'])),
  source: longText,
  continuity: longText,
  anchorFacts: z.array(longText).max(24),
  forbiddenContradictions: z.array(longText).max(24),
  divergenceNotes: z.array(longText).max(24),
}).strict()

const legendPowerStandingSchema = z.object({
  classification: legendPowerClassSchema,
  basis: longText,
  domains: z.array(longText).min(1).max(12),
  evidence: z.array(longText).min(1).max(16),
  uncertainties: z.array(longText).max(12),
}).strict()

const legendEmergenceSchema = z.object({
  momentum: modelNumber(z.number().min(-100).max(100)),
  nextMilestone: longText,
  qualifyingSigns: z.array(longText).max(16),
  disqualifiers: z.array(longText).max(16),
  lastEvaluatedTurn: modelNumber(z.number().int().min(0).max(1_000_000)),
}).strict()

const legendaryFigureSchema = z.object({
  id: idSchema,
  characterId: idSchema.optional(),
  name: shortText,
  aliases: z.array(shortText).max(16),
  titles: z.array(shortText).max(16),
  epithet: shortText.optional(),
  role: shortText,
  summary: longText,
  origin: longText,
  era: shortText,
  stage: legendStageSchema,
  lifeStatus: legendLifeStatusSchema,
  scope: worldScaleSchema,
  truthStatus: legendTruthStatusSchema,
  renown: modelNumber(z.number().min(0).max(100)),
  influence: modelNumber(z.number().min(0).max(100)),
  reputation: longText,
  powerStanding: legendPowerStandingSchema.optional(),
  knownFeats: z.array(longText).max(20),
  disputedClaims: z.array(longText).max(20),
  associatedFactionNames: z.array(shortText).max(20),
  relatedNpcIds: z.array(idSchema).max(24),
  successorNpcIds: z.array(idSchema).max(24),
  deeds: z.array(legendDeedSchema).max(40),
  myths: z.array(legendMythSchema).max(40),
  legacies: z.array(legendLegacySchema).max(40),
  currentState: legendCurrentStateSchema,
  emergence: legendEmergenceSchema,
  canon: legendCanonProfileSchema,
  discovery: legendDiscoverySchema,
  createdTurn: modelNumber(z.number().int().min(0).max(1_000_000)),
  lastChangedTurn: modelNumber(z.number().int().min(0).max(1_000_000)),
}).strict()

const legendCurrentStatePatchSchema = legendCurrentStateSchema.omit({ lastUpdatedTurn: true }).extend({
  lastUpdatedTurn: optionalModelNumber(z.number().int().min(0).max(1_000_000)),
}).strict()
const legendEmergencePatchSchema = legendEmergenceSchema.omit({ lastEvaluatedTurn: true }).extend({
  lastEvaluatedTurn: optionalModelNumber(z.number().int().min(0).max(1_000_000)),
}).strict()
const legendDiscoveryPatchSchema = legendDiscoverySchema.omit({ updatedTurn: true, evidence: true }).extend({
  evidence: z.array(legendDiscoveryEvidenceSchema.extend({
    learnedTurn: optionalModelNumber(z.number().int().min(0).max(1_000_000)),
  }).strict()).max(80),
  updatedTurn: optionalModelNumber(z.number().int().min(0).max(1_000_000)),
}).strict()
const legendaryFigurePatchSchema = legendaryFigureSchema.extend({
  powerStanding: legendPowerStandingSchema,
  currentState: legendCurrentStatePatchSchema,
  emergence: legendEmergencePatchSchema,
  discovery: legendDiscoveryPatchSchema,
  createdTurn: optionalModelNumber(z.number().int().min(0).max(1_000_000)),
  lastChangedTurn: optionalModelNumber(z.number().int().min(0).max(1_000_000)),
}).strict()

const generatedLegendDeedSchema = legendDeedSchema.omit({ id: true, scopeIds: true }).extend({
  scopeNames: z.array(shortText).max(24),
}).strict()
const generatedLegendMythSchema = legendMythSchema.omit({ id: true }).strict()
const generatedLegendLegacySchema = legendLegacySchema.omit({ id: true, holderNpcIds: true, scopeIds: true }).extend({
  holderNpcNames: z.array(shortText).max(20),
  scopeNames: z.array(shortText).max(24),
}).strict()
const generatedLegendDiscoverySchema = legendDiscoverySchema.omit({ evidence: true, updatedTurn: true }).extend({
  evidence: z.array(legendDiscoveryEvidenceSchema.omit({ id: true, learnedTurn: true })).max(40),
}).strict()
const generatedLegendCurrentStateSchema = legendCurrentStateSchema.omit({ locationId: true, lastUpdatedTurn: true }).extend({
  locationName: shortText.optional(),
}).strict()
const generatedLegendEmergenceSchema = legendEmergenceSchema.omit({ lastEvaluatedTurn: true })
const generatedLegendaryFigureSchema = legendaryFigureSchema.omit({
  id: true, characterId: true, relatedNpcIds: true, successorNpcIds: true, deeds: true, myths: true, legacies: true,
  currentState: true, emergence: true, discovery: true, createdTurn: true, lastChangedTurn: true,
}).extend({
  powerStanding: legendPowerStandingSchema,
  characterName: shortText.optional(),
  relatedNpcNames: z.array(shortText).max(24),
  successorNpcNames: z.array(shortText).max(24),
  deeds: z.array(generatedLegendDeedSchema).max(40),
  myths: z.array(generatedLegendMythSchema).max(40),
  legacies: z.array(generatedLegendLegacySchema).max(40),
  currentState: generatedLegendCurrentStateSchema,
  emergence: generatedLegendEmergenceSchema,
  discovery: generatedLegendDiscoverySchema,
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
  stateRules: z.object({
    dangerBelow: optionalModelNumber(z.number().min(-1_000_000).max(1_000_000)),
    warningBelow: optionalModelNumber(z.number().min(-1_000_000).max(1_000_000)),
    positiveBelow: optionalModelNumber(z.number().min(-1_000_000).max(1_000_000)),
    positiveAbove: optionalModelNumber(z.number().min(-1_000_000).max(1_000_000)),
    warningAbove: optionalModelNumber(z.number().min(-1_000_000).max(1_000_000)),
    dangerAbove: optionalModelNumber(z.number().min(-1_000_000).max(1_000_000)),
  }).strict().optional(),
  binding: adaptiveInterfaceBindingSchema.optional(),
  links: z.array(idSchema).max(16).optional(),
}).strict()

const adaptiveInterfaceModuleDraftBaseSchema = z.object({
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
  pinned: modelBoolean.optional(),
  density: z.preprocess(alias({ компактно: 'compact', компактный: 'compact', удобно: 'comfortable', просторный: 'comfortable' }), z.enum(['compact', 'comfortable'])).optional(),
  emphasis: z.preprocess(alias({ тихий: 'quiet', спокойный: 'quiet', обычный: 'standard', стандартный: 'standard', важный: 'prominent', заметный: 'prominent' }), z.enum(['quiet', 'standard', 'prominent'])).optional(),
  elements: z.array(adaptiveInterfaceElementSchema).min(1).max(16),
  createdTurn: optionalModelNumber(z.number().int().min(0).max(1_000_000)),
  lastChangedTurn: optionalModelNumber(z.number().int().min(0).max(1_000_000)),
}).strict()

const adaptiveInterfaceModuleDraftSchema = adaptiveInterfaceModuleDraftBaseSchema.superRefine((module, context) => {
  const elementIds = new Set<string>()
  module.elements.forEach((element, index) => {
    if (elementIds.has(element.id)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['elements', index, 'id'], message: 'Идентификаторы элементов внутри модуля должны быть уникальны.' })
    elementIds.add(element.id)
  })
  module.elements.forEach((element, index) => {
    if (element.min !== undefined && element.max !== undefined && element.max <= element.min) context.addIssue({ code: z.ZodIssueCode.custom, path: ['elements', index, 'max'], message: 'Максимум элемента должен быть больше минимума.' })
  })
  module.elements.forEach((element, index) => {
    element.links?.forEach((link, linkIndex) => {
      if (link === element.id || !elementIds.has(link)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['elements', index, 'links', linkIndex], message: 'Связь должна вести к другому существующему элементу этого модуля.' })
    })
    const binding = element.binding
    if (!binding || binding.domain === 'custom') return
    const keyRequired = new Set([
      'player.resource', 'player.stat', 'player.currency', 'player.condition-count', 'inventory.category-count',
      'artifact.power-mastery', 'npc.stat', 'npc.resource', 'npc.relationship-dimension',
    ])
    const targetRequired = new Set([
      'conflict.participant-readiness', 'conflict.participant-morale', 'world.process-momentum', 'world.pressure',
      'inventory.item-charges', 'inventory.item-quantity', 'inventory.item-durability', 'artifact.mastery', 'artifact.attunement',
      'artifact.bond', 'artifact.power-mastery', 'quest.objective-progress', 'mystery.progress', 'npc.stat', 'npc.resource',
      'npc.initiative-urgency', 'npc.relationship-dimension', 'npc.relationship',
    ])
    const keyOrTargetRequired = new Set(['player.ability-mastery', 'world.metric', 'world.location-danger', 'faction.reputation', 'faction.power'])
    if (keyRequired.has(binding.domain) && !binding.key) context.addIssue({ code: z.ZodIssueCode.custom, path: ['elements', index, 'binding', 'key'], message: 'Для этой живой привязки обязателен точный key.' })
    if (targetRequired.has(binding.domain) && !binding.target) context.addIssue({ code: z.ZodIssueCode.custom, path: ['elements', index, 'binding', 'target'], message: 'Для этой живой привязки обязателен точный target.' })
    if (keyOrTargetRequired.has(binding.domain) && !binding.key && !binding.target) context.addIssue({ code: z.ZodIssueCode.custom, path: ['elements', index, 'binding'], message: 'Для этой живой привязки обязателен key или target.' })
  })
})

const adaptiveInterfaceModuleChangeSchema = z.object({
  moduleId: idSchema,
  module: adaptiveInterfaceModuleDraftBaseSchema.omit({ id: true, elements: true, createdTurn: true, lastChangedTurn: true }).partial().strict().optional(),
  upsertElements: z.array(adaptiveInterfaceElementSchema).max(16).optional(),
  removeElementIds: z.array(idSchema).max(16).optional(),
}).strict().superRefine((change, context) => {
  const ids = new Set<string>()
  change.upsertElements?.forEach((element, index) => {
    if (ids.has(element.id)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['upsertElements', index, 'id'], message: 'Один granular patch не может дважды обновлять один element.id.' })
    ids.add(element.id)
    if (element.min !== undefined && element.max !== undefined && element.max <= element.min) context.addIssue({ code: z.ZodIssueCode.custom, path: ['upsertElements', index, 'max'], message: 'Максимум элемента должен быть больше минимума.' })
    const binding = element.binding
    if (!binding || binding.domain === 'custom') return
    const keyRequired = ['player.resource', 'player.stat', 'player.currency', 'player.condition-count', 'inventory.category-count', 'artifact.power-mastery', 'npc.stat', 'npc.resource', 'npc.relationship-dimension']
    const targetRequired = ['conflict.participant-readiness', 'conflict.participant-morale', 'world.process-momentum', 'world.pressure', 'inventory.item-charges', 'inventory.item-quantity', 'inventory.item-durability', 'artifact.mastery', 'artifact.attunement', 'artifact.bond', 'artifact.power-mastery', 'quest.objective-progress', 'mystery.progress', 'npc.stat', 'npc.resource', 'npc.initiative-urgency', 'npc.relationship-dimension', 'npc.relationship']
    const keyOrTargetRequired = ['player.ability-mastery', 'world.metric', 'world.location-danger', 'faction.reputation', 'faction.power']
    if (keyRequired.includes(binding.domain) && !binding.key) context.addIssue({ code: z.ZodIssueCode.custom, path: ['upsertElements', index, 'binding', 'key'], message: 'Для этой живой привязки обязателен точный key.' })
    if (targetRequired.includes(binding.domain) && !binding.target) context.addIssue({ code: z.ZodIssueCode.custom, path: ['upsertElements', index, 'binding', 'target'], message: 'Для этой живой привязки обязателен точный target.' })
    if (keyOrTargetRequired.includes(binding.domain) && !binding.key && !binding.target) context.addIssue({ code: z.ZodIssueCode.custom, path: ['upsertElements', index, 'binding'], message: 'Для этой живой привязки обязателен key или target.' })
  })
})

const inspectorTabIdSchema = z.enum(['dashboard', 'scene', 'hero', 'inventory', 'changes', 'world'])
const dashboardSectionIdSchema = z.enum(['scene', 'stakes', 'modules', 'worldPulse', 'openLoops', 'mechanics', 'interfaceHealth'])
const worldInterfaceBlueprintDraftSchema = z.object({
  title: shortText,
  subtitle: shortText,
  defaultTab: inspectorTabIdSchema,
  tabs: z.array(z.object({ id: inspectorTabIdSchema, label: shortText, visible: modelBoolean }).strict()).length(6),
  dashboardSections: z.array(dashboardSectionIdSchema).min(1).max(7),
  reason: longText,
  updatedTurn: optionalModelNumber(z.number().int().min(0).max(1_000_000)),
}).strict().superRefine((blueprint, context) => {
  const tabIds = blueprint.tabs.map((tab) => tab.id)
  if (new Set(tabIds).size !== tabIds.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ['tabs'], message: 'Вкладки пульта должны иметь уникальные id.' })
  const requiredTabs = ['dashboard', 'scene', 'hero', 'inventory', 'changes', 'world'] as const
  requiredTabs.forEach((tabId) => {
    if (!tabIds.includes(tabId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['tabs'], message: `Обязательная вкладка ${tabId} отсутствует.` })
  })
  blueprint.tabs.forEach((tab, index) => {
    if (!tab.visible) context.addIssue({ code: z.ZodIssueCode.custom, path: ['tabs', index, 'visible'], message: 'Все шесть основных вкладок должны оставаться видимыми.' })
  })
  if (!blueprint.tabs.some((tab) => tab.id === blueprint.defaultTab && tab.visible)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['defaultTab'], message: 'Стартовая вкладка должна существовать и быть видимой.' })
  if (new Set(blueprint.dashboardSections).size !== blueprint.dashboardSections.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ['dashboardSections'], message: 'Разделы пульта не должны повторяться.' })
})

const worldMetricPatchSchema = z.object({
  id: idSchema,
  key: shortText,
  label: shortText,
  description: longText,
  value: modelNumber(z.number().min(-1_000_000).max(1_000_000)),
  min: modelNumber(z.number().min(-1_000_000).max(1_000_000)),
  max: modelNumber(z.number().min(-1_000_000).max(1_000_000)),
  unit: z.string().trim().max(80).optional(),
  visibility: worldVisibilitySchema,
  source: longText,
  updatePolicy: longText,
  lastChangedTurn: optionalModelNumber(z.number().int().min(0).max(1_000_000)),
}).strict().superRefine((metric, context) => {
  if (metric.max <= metric.min) context.addIssue({ code: z.ZodIssueCode.custom, path: ['max'], message: 'Максимум показателя должен быть больше минимума.' })
  if (metric.value < metric.min || metric.value > metric.max) context.addIssue({ code: z.ZodIssueCode.custom, path: ['value'], message: 'Значение показателя должно находиться внутри диапазона.' })
})

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
const powerTechniqueDraftSchema = z.object({
  id: idSchema.optional(),
  name: shortText,
  description: longText,
  kind: abilityKindSchema,
  category: powerCategorySchema,
  mastery: modelNumber(z.number().min(0).max(100)),
  activation: longText,
  scale: longText,
  costs: z.array(abilityCostSchema).max(8),
  effects: z.array(longText).min(1).max(12),
  requirements: z.array(longText).max(12),
  limitations: z.array(longText).max(12),
  unlocked: modelBoolean,
}).strict()
const powerTechniqueSchema = powerTechniqueDraftSchema.extend({ id: idSchema }).strict()
const powerTechniqueChangeSchema = z.object({
  techniqueId: idSchema,
  name: shortText.optional(),
  description: longText.optional(),
  kind: abilityKindSchema.optional(),
  category: powerCategorySchema.optional(),
  mastery: optionalModelNumber(z.number().min(0).max(100)),
  masteryDelta: optionalModelNumber(z.number().min(-100).max(100)),
  activation: longText.optional(),
  scale: longText.optional(),
  costs: z.array(abilityCostSchema).max(8).optional(),
  effects: z.array(longText).max(12).optional(),
  requirements: z.array(longText).max(12).optional(),
  limitations: z.array(longText).max(12).optional(),
  unlocked: modelBoolean.optional(),
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
const npcDossierEvidenceSchema = z.object({
  id: idSchema,
  section: npcDossierSectionSchema,
  summary: longText,
  source: shortText,
  learnedTurn: modelNumber(z.number().int().min(0)),
}).strict()
const npcDossierSchema = z.object({
  familiarity: npcFamiliaritySchema,
  revealedSections: z.array(npcDossierSectionSchema).max(24),
  revealedStatKeys: z.array(shortText).max(24),
  revealedResourceKeys: z.array(shortText).max(24),
  revealedAbilityIds: z.array(idSchema).max(40),
  evidence: z.array(npcDossierEvidenceSchema).max(60),
  updatedTurn: modelNumber(z.number().int().min(0)),
}).strict()
const generatedNpcDossierSchema = z.object({
  familiarity: npcFamiliaritySchema,
  revealedSections: z.array(npcDossierSectionSchema).max(24),
  revealedStatKeys: z.array(shortText).max(24),
  revealedResourceKeys: z.array(shortText).max(24),
  revealedAbilityNames: z.array(shortText).max(20),
  evidence: z.array(z.object({ section: npcDossierSectionSchema, summary: longText, source: shortText }).strict()).max(20),
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
const tacticalCountermeasureSchema = z.object({
  name: shortText,
  against: longText,
  response: longText,
  requirements: z.array(longText).max(12),
  tradeoffs: z.array(longText).max(12),
  status: z.enum(['available', 'prepared', 'spent', 'broken']),
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
  combatDoctrine: longText.optional(),
  preferredRange: longText.optional(),
  teamworkStyle: longText.optional(),
  moraleProfile: longText.optional(),
  retreatConditions: z.array(longText).max(12).optional(),
  ethicalLimits: z.array(longText).max(12).optional(),
  learnedAdaptations: z.array(longText).max(16).optional(),
  countermeasures: z.array(tacticalCountermeasureSchema).max(16).optional(),
  visibility: worldVisibilitySchema,
  lastUpdatedTurn: modelNumber(z.number().int().min(0)),
}).strict()
const threatEngagementPhaseSchema = z.object({
  name: shortText,
  trigger: longText,
  doctrine: longText,
  priorities: z.array(longText).min(1).max(8),
  signatureMoves: z.array(longText).min(1).max(8),
  openings: z.array(longText).min(1).max(8),
  exitConditions: z.array(longText).min(1).max(8),
}).strict()
const threatProfileSchema = z.object({
  tier: threatTierSchema,
  scope: longText,
  reputation: longText,
  powerBasis: longText.optional(),
  combatIdentity: longText.optional(),
  signatureAbilities: z.array(shortText).max(12).optional(),
  threatVectors: z.array(longText).max(12).optional(),
  defensiveLayers: z.array(longText).max(12).optional(),
  battlefieldControl: z.array(longText).max(12).optional(),
  informationAdvantages: z.array(longText).max(12).optional(),
  preparedAssets: z.array(longText).max(12).optional(),
  engagementPhases: z.array(threatEngagementPhaseSchema).max(6).optional(),
  collateralRisks: z.array(longText).max(12).optional(),
  whyDangerous: z.array(longText).min(1).max(12),
  knownFeats: z.array(longText).max(12),
  constraints: z.array(longText).max(12),
  defeatRequirements: z.array(longText).max(12),
  escalationTriggers: z.array(longText).max(12),
  visibility: worldVisibilitySchema,
}).strict().superRefine((profile, context) => {
  const rank = { minor: 0, capable: 1, dangerous: 2, elite: 3, legendary: 4, mythic: 5 }[profile.tier]
  const requireText = (value: string | undefined, field: string) => {
    if (!value?.trim()) context.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: `${profile.tier} threat requires a concrete ${field}` })
  }
  const requireCount = (values: unknown[] | undefined, minimum: number, field: string) => {
    if ((values?.length ?? 0) < minimum) context.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: `${profile.tier} threat requires at least ${minimum} ${field}` })
  }
  if (rank < 2) return
  requireText(profile.powerBasis, 'powerBasis')
  requireText(profile.combatIdentity, 'combatIdentity')
  requireCount(profile.signatureAbilities, 1, 'signatureAbilities')
  requireCount(profile.threatVectors, 2, 'threatVectors')
  requireCount(profile.defensiveLayers, 1, 'defensiveLayers')
  requireCount(profile.constraints, 1, 'constraints')
  requireCount(profile.defeatRequirements, 1, 'defeatRequirements')
  if (rank >= 3) {
    requireCount(profile.signatureAbilities, 2, 'signatureAbilities')
    requireCount(profile.battlefieldControl, 1, 'battlefieldControl')
    requireCount(profile.engagementPhases, 1, 'engagementPhases')
  }
  if (rank >= 4) {
    requireCount(profile.whyDangerous, 3, 'whyDangerous')
    requireCount(profile.knownFeats, 2, 'knownFeats')
    requireCount(profile.defensiveLayers, 2, 'defensiveLayers')
    requireCount(profile.informationAdvantages, 1, 'informationAdvantages')
    requireCount(profile.preparedAssets, 1, 'preparedAssets')
    requireCount(profile.engagementPhases, 2, 'engagementPhases')
    requireCount(profile.constraints, 2, 'constraints')
    requireCount(profile.defeatRequirements, 2, 'defeatRequirements')
    requireCount(profile.collateralRisks, 1, 'collateralRisks')
  }
  if (rank >= 5) {
    requireCount(profile.signatureAbilities, 3, 'signatureAbilities')
    requireCount(profile.threatVectors, 4, 'threatVectors')
    requireCount(profile.engagementPhases, 3, 'engagementPhases')
  }
})
const storyPacingUpdateSchema = z.object({
  beat: storyBeatSchema,
  intensity: modelNumber(z.number().min(0).max(100)),
  challengeTier: challengeTierSchema,
  reason: longText,
}).strict()
const conflictParticipantStateSchema = z.object({
  entityId: idSchema,
  side: z.enum(['player', 'ally', 'opposition', 'neutral']),
  objective: longText,
  position: longText,
  readiness: modelNumber(z.number().min(0).max(100)),
  morale: modelNumber(z.number().min(0).max(100)),
  intent: longText,
  lastAction: longText,
  advantages: z.array(longText).max(12),
  vulnerabilities: z.array(longText).max(12),
  visibility: worldVisibilitySchema,
}).strict()
const activeConflictSchema = z.object({
  id: idSchema,
  kind: z.enum(['combat', 'chase', 'social', 'stealth', 'other']),
  title: shortText,
  round: modelNumber(z.number().int().min(1).max(100_000)),
  phase: longText,
  stakes: longText,
  terrain: z.array(longText).max(16),
  hazards: z.array(longText).max(16),
  tier: challengeTierSchema.optional(),
  victoryConditions: z.array(longText).max(12).optional(),
  failureConsequences: z.array(longText).max(12).optional(),
  escapeRoutes: z.array(longText).max(12).optional(),
  telegraphs: z.array(longText).max(12).optional(),
  momentum: z.enum(['player', 'opposition', 'contested']),
  participants: z.array(conflictParticipantStateSchema).min(2).max(24),
  startedTurn: modelNumber(z.number().int().min(0)),
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
  techniques: z.array(powerTechniqueDraftSchema).max(48).optional(),
  canonStatus: canonStatusSchema.optional(),
  canonReference: longText.optional(),
}).strict()
const artifactPowerSchema = artifactPowerDraftSchema.extend({
  id: idSchema,
  techniques: z.array(powerTechniqueSchema).max(48).optional(),
}).strict()
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
  addTechniques: z.array(powerTechniqueDraftSchema).max(48).optional(),
  techniqueChanges: z.array(powerTechniqueChangeSchema).max(48).optional(),
  removeTechniqueIds: z.array(idSchema).max(48).optional(),
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
const artifactSectionSchema = z.enum(['identity', 'origin', 'principle', 'requirements', 'passives', 'components', 'powers', 'combined', 'drawbacks', 'failureModes', 'evolution', 'history'])
const artifactDiscoverySectionSchema = z.enum(['identity', 'origin', 'principle', 'requirements', 'passives', 'components', 'powers', 'combined', 'drawbacks', 'failureModes', 'evolution', 'history', 'sentience', 'secrets'])
const artifactKnowledgeLevelSchema = z.preprocess(alias({ скрыто: 'hidden', намек: 'hinted', намёк: 'hinted', известно: 'known', изучено: 'understood' }), z.enum(['hidden', 'hinted', 'known', 'understood']))
const artifactCreativeIdentitySchema = z.object({
  coreFantasy: longText,
  centralConcept: longText,
  physicalForm: longText,
  originPattern: longText,
  interactionModel: longText,
  signatureExperience: longText,
  conceptualDomains: z.array(shortText).min(1).max(12),
  mechanicVerbs: z.array(shortText).min(1).max(16),
  motifs: z.array(shortText).min(1).max(16),
  differentiation: z.array(longText).min(2).max(12),
  lineageId: idSchema.optional(),
  resemblanceKind: z.enum(['canon', 'set', 'culture', 'creator', 'evolution']).optional(),
  resemblanceReason: longText.optional(),
  relatedArtifactIds: z.array(idSchema).max(24).optional(),
}).strict().superRefine((identity, context) => {
  if (identity.resemblanceKind && !identity.resemblanceReason?.trim()) context.addIssue({
    code: z.ZodIssueCode.custom,
    path: ['resemblanceReason'],
    message: 'A reused motif requires a concrete causal resemblanceReason',
  })
})
const artifactPresentationSchema = z.object({
  layout: z.enum(['reliquary', 'schematic', 'grimoire', 'constellation', 'monolith', 'organic', 'arsenal', 'minimal']),
  motif: shortText,
  symbol: shortText,
  accent: colorSchema,
  secondary: colorSchema,
  surface: z.enum(['metal', 'stone', 'paper', 'glass', 'energy', 'organic', 'void', 'fabric', 'wood', 'composite']),
  glow: z.enum(['none', 'soft', 'pulse', 'halo', 'veins', 'embers', 'glitch']),
  headerStyle: z.enum(['inscribed', 'technical', 'ceremonial', 'minimal', 'living']),
  density: z.enum(['comfortable', 'cinematic']),
  sectionOrder: z.array(artifactSectionSchema).min(4).max(12),
  summary: longText,
}).strict().superRefine((presentation, context) => {
  if (new Set(presentation.sectionOrder).size !== presentation.sectionOrder.length) context.addIssue({
    code: z.ZodIssueCode.custom,
    path: ['sectionOrder'],
    message: 'Artifact presentation sections must be unique',
  })
})
const artifactDiscoverySchema = z.object({
  awareness: modelNumber(z.number().min(0).max(100)),
  revealedSections: z.array(artifactDiscoverySectionSchema).max(14),
  powerKnowledge: z.record(idSchema, artifactKnowledgeLevelSchema),
  componentKnowledge: z.record(idSchema, artifactKnowledgeLevelSchema),
  evidence: z.array(z.object({
    id: idSchema,
    section: artifactDiscoverySectionSchema,
    summary: longText,
    source: longText,
    reliability: modelNumber(z.number().min(0).max(100)),
    learnedTurn: modelNumber(z.number().int().min(0)),
  }).strict()).max(64),
  updatedTurn: modelNumber(z.number().int().min(0)),
}).strict()
const artifactDiscoveryPatchSchema = artifactDiscoverySchema.extend({
  updatedTurn: optionalModelNumber(z.number().int().min(0)),
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
  creativeIdentity: artifactCreativeIdentitySchema.optional(),
  presentation: artifactPresentationSchema.optional(),
  discovery: artifactDiscoverySchema.optional(),
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
  techniques: z.array(powerTechniqueDraftSchema).max(48).optional(),
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
  addTechniques: z.array(powerTechniqueDraftSchema).max(48).optional(),
  techniqueChanges: z.array(powerTechniqueChangeSchema).max(48).optional(),
  removeTechniqueIds: z.array(idSchema).max(48).optional(),
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
  creativeIdentity: artifactCreativeIdentitySchema.optional(),
  presentation: artifactPresentationSchema.optional(),
  discovery: artifactDiscoveryPatchSchema.optional(),
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
  techniques: z.array(powerTechniqueSchema).max(48).optional(),
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
const worldPressureMeasureSchema = z.object({
  id: idSchema,
  name: shortText,
  trigger: longText,
  method: longText,
  effects: z.array(longText).max(12),
  counterplay: z.array(longText).max(12),
  tradeoffs: z.array(longText).max(12),
  status: worldPressureMeasureStatusSchema,
}).strict()
const worldPressureSchema = z.object({
  id: idSchema,
  sourceKind: worldPressureSourceKindSchema,
  sourceName: shortText,
  sourceNpcId: idSchema.optional(),
  targetIds: z.array(idSchema).min(1).max(20),
  cause: longText,
  objective: longText,
  tier: worldPressureTierSchema,
  stage: worldPressureStageSchema,
  reach: longText,
  knowledge: z.array(longText).max(20),
  signs: z.array(longText).max(16),
  measures: z.array(worldPressureMeasureSchema).max(16),
  counterplay: z.array(longText).max(16),
  escalationTrigger: longText,
  deescalationConditions: z.array(longText).max(12),
  visibility: worldVisibilitySchema,
  createdTurn: modelNumber(z.number().int().min(0)),
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
  potency: optionalModelNumber(z.number().min(0).max(100)),
  versatility: optionalModelNumber(z.number().min(0).max(100)),
  worldImpact: optionalModelNumber(z.number().min(0).max(100)),
  provenance: optionalModelNumber(z.number().min(0).max(100)),
  limitations: z.array(longText).max(16).optional(),
  assessment: longText.optional(),
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

const artifactRewardRepairContract = z.object({
  item: inventoryItemAddSchema.extend({
    category: z.literal('artifact'),
    rarityProfile: rarityProfileSchema,
    artifact: artifactProfileSchema.and(z.object({
      creativeIdentity: artifactCreativeIdentitySchema,
      presentation: artifactPresentationSchema,
      discovery: artifactDiscoverySchema,
    })),
  }).strict(),
}).strict()

export const artifactRewardRepairSchema = z.preprocess((value) => normalizeModelOutput(value), artifactRewardRepairContract)

export const artifactQualityReviewSchema = z.preprocess((value) => normalizeModelOutput(value), z.object({
  scores: z.object({
    idea: modelNumber(z.number().min(0).max(100)),
    form: modelNumber(z.number().min(0).max(100)),
    mechanics: modelNumber(z.number().min(0).max(100)),
    origin: modelNumber(z.number().min(0).max(100)),
    interaction: modelNumber(z.number().min(0).max(100)),
    development: modelNumber(z.number().min(0).max(100)),
    presentation: modelNumber(z.number().min(0).max(100)),
    canonAccuracy: modelNumber(z.number().min(0).max(100)),
  }).strict(),
  strengths: z.array(longText).max(12),
  issues: z.array(longText).max(16),
  verdict: z.enum(['excellent', 'good', 'rebuild']),
}).strict())

export type ArtifactQualityReview = z.infer<typeof artifactQualityReviewSchema>

const questDraftSchema = z.object({
  id: idSchema.optional(),
  title: shortText.optional(),
  description: z.string().trim().max(2000).optional(),
  status: z.enum(['active', 'completed', 'failed', 'hidden']).optional(),
  objectives: z.array(z.object({ id: idSchema, text: shortText, completed: modelBoolean })).max(20).optional(),
  reward: z.string().trim().max(500).optional(),
  giver: z.string().trim().max(300).optional(),
  createdTurn: optionalModelNumber(z.number().int().min(0).max(1_000_000)),
  lastChangedTurn: optionalModelNumber(z.number().int().min(0).max(1_000_000)),
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
        id: idSchema, name: shortText, role: shortText, description: longText, personality: longText.optional(), disposition: shortText,
        relationship: modelNumber(z.number().min(-100).max(100)), status: npcStatusSchema, currentGoal: longText, lastSeen: shortText,
        notes: z.array(z.string().max(500)).max(8), knowledge: z.array(knowledgeFactSchema).max(30).optional(),
        stats: z.array(statStateSchema).max(24).optional(), resources: z.array(resourceStateSchema).max(24).optional(), statusEffects: z.array(statusEffectDraftSchema.extend({ id: idSchema, appliedTurn: modelNumber(z.number().int().min(0)) }).strict()).max(48).optional(),
        abilities: z.array(abilityStateSchema).max(40).optional(),
        relationshipDimensions: relationshipDimensionsSchema.optional(), initiative: npcInitiativeSchema.optional(), strategy: npcStrategySchema.optional(), threatProfile: threatProfileSchema.optional(), recruitment: npcRecruitmentSchema.optional(), dossier: npcDossierSchema.optional(), voice: npcVoiceSchema.optional(),
      }).strict(),
    }).strict(),
    z.object({
      operation: z.literal('update'),
      targetId: idSchema,
      npc: z.object({
        name: shortText.optional(), role: shortText.optional(), description: z.string().trim().max(2000).optional(), personality: z.string().trim().max(2000).optional(),
        disposition: shortText.optional(), relationship: optionalModelNumber(z.number().min(-100).max(100)), status: npcStatusSchema.optional(),
        currentGoal: z.string().trim().max(2000).optional(), lastSeen: shortText.optional(), notes: z.array(z.string().max(500)).max(8).optional(),
        stats: z.array(statStateSchema).max(24).optional(), resources: z.array(resourceStateSchema).max(24).optional(), statusEffects: z.array(statusEffectDraftSchema).max(48).optional(),
        abilities: z.array(abilityDraftSchema).max(40).optional(), upsertAbilities: z.array(abilityDraftSchema).max(40).optional(),
        removeAbilityIds: z.array(idSchema).max(40).optional(), abilityChanges: z.array(abilityChangeSchema).max(24).optional(),
        knowledge: z.array(knowledgeFactDraftSchema).max(30).optional(), relationshipDimensions: relationshipDimensionsSchema.partial().optional(),
        initiative: npcInitiativeSchema.partial().optional(), strategy: npcStrategySchema.partial().optional(), threatProfile: threatProfileSchema.optional(), recruitment: npcRecruitmentSchema.optional(), dossier: npcDossierSchema.partial().optional(), voice: npcVoiceSchema.partial().optional(),
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
  pacing: storyPacingUpdateSchema.optional(),
  conflict: z.discriminatedUnion('operation', [
    z.object({ operation: z.enum(['start', 'update']), state: activeConflictSchema }).strict(),
    z.object({ operation: z.literal('resolve'), outcome: longText }).strict(),
  ]).optional(),
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
      rarityLabels: z.object({ common: shortText.optional(), uncommon: shortText.optional(), rare: shortText.optional(), exceptional: shortText.optional(), epic: shortText.optional(), legendary: shortText.optional(), mythic: shortText.optional(), transcendent: shortText.optional() }).strict().optional(),
    }).strict().optional(),
    addRules: z.array(shortText).max(8).optional(), removeRules: z.array(shortText).max(8).optional(),
    upsertFactions: z.array(worldFactionPatchSchema).max(12).optional(),
    removeFactions: z.array(shortText).max(8).optional(),
    upsertLocations: z.array(z.object({ name: shortText, description: longText, danger: modelNumber(z.number().min(0).max(100)) }).strict()).max(12).optional(),
    removeLocations: z.array(shortText).max(12).optional(),
    addMysteries: z.array(shortText).max(8).optional(), resolveMysteries: z.array(shortText).max(8).optional(),
    calendarDayDelta: optionalModelNumber(z.number().int().min(-3650).max(3650)), calendarLabel: shortText.optional(),
    upsertRoutes: z.array(worldRouteSchema).max(40).optional(), removeRouteIds: z.array(idSchema).max(40).optional(),
    upsertPlaces: z.array(worldPlacePatchSchema).max(40).optional(), removePlaceIds: z.array(idSchema).max(40).optional(),
    upsertProcesses: z.array(worldProcessPatchSchema).max(24).optional(), retireProcessIds: z.array(idSchema).max(24).optional(),
    legendarium: legendariumPatchSchema.optional(),
    upsertLegends: z.array(legendaryFigurePatchSchema).max(24).optional(), removeLegendIds: z.array(idSchema).max(24).optional(),
    upsertLaws: z.array(worldLawPatchSchema).max(24).optional(), removeLawIds: z.array(idSchema).max(24).optional(),
    upsertMechanics: z.array(worldMechanicPatchSchema).max(24).optional(), removeMechanicIds: z.array(idSchema).max(24).optional(),
    upsertInterfaceModules: z.array(adaptiveInterfaceModuleDraftSchema).max(8).optional(),
    interfaceModuleChanges: z.array(adaptiveInterfaceModuleChangeSchema).max(16).optional(),
    removeInterfaceModuleIds: z.array(idSchema).max(8).optional(),
    interfaceBlueprint: worldInterfaceBlueprintDraftSchema.optional(),
    upsertMetrics: z.array(worldMetricPatchSchema).max(24).optional(),
    metricDeltas: z.record(shortText, modelNumber(z.number().min(-1_000_000).max(1_000_000))).optional(),
    removeMetricIds: z.array(idSchema).max(24).optional(),
  }).strict().optional(),
  socialLinks: z.array(socialLinkSchema).max(40).optional(),
  removeSocialLinkIds: z.array(idSchema).max(40).optional(),
  threads: z.preprocess((value) => normalizeNestedMutations(value, 'thread'), z.array(z.object({
    operation: z.enum(['add', 'update', 'resolve', 'break']), targetId: idSchema.optional(),
    thread: z.object({
      id: idSchema.optional(), type: storyThreadTypeSchema.optional(), title: shortText.optional(),
      detail: z.string().trim().max(2000).optional(), participantIds: z.array(idSchema).max(20).optional(),
      status: storyThreadStatusSchema.optional(), dueTurn: optionalModelNumber(z.number().int().min(0)),
      secret: modelBoolean.optional(), createdTurn: optionalModelNumber(z.number().int().min(0)),
      scale: worldScaleSchema.optional(), scopeIds: z.array(idSchema).max(24).optional(), causeIds: z.array(idSchema).max(24).optional(),
      lastChangedTurn: optionalModelNumber(z.number().int().min(0).max(1_000_000)),
    }).strict().optional(),
  }).strict()).max(20).optional()),
  worldEvents: z.preprocess((value) => normalizeNestedMutations(value, 'event'), z.array(z.object({
    operation: z.enum(['add', 'update', 'resolve', 'cancel']), targetId: idSchema.optional(),
    event: z.object({
      id: idSchema.optional(), title: shortText.optional(), description: z.string().trim().max(2500).optional(),
      dueTurn: optionalModelNumber(z.number().int().min(0)), dueDay: optionalModelNumber(z.number().int().min(1)),
      status: worldEventStatusSchema.optional(), visibility: worldVisibilitySchema.optional(),
      involvedIds: z.array(idSchema).max(20).optional(), createdTurn: optionalModelNumber(z.number().int().min(0)),
      scale: worldScaleSchema.optional(), scopeIds: z.array(idSchema).max(24).optional(), causeIds: z.array(idSchema).max(24).optional(),
      consequences: z.array(longText).max(16).optional(), lastChangedTurn: optionalModelNumber(z.number().int().min(0).max(1_000_000)),
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
  upsertWorldPressures: z.array(worldPressureSchema).max(16).optional(),
  upsertInfluenceAssets: z.array(influenceAssetSchema).max(30).optional(),
  removeInfluenceAssetIds: z.array(idSchema).max(30).optional(),
  cleanup: z.object({
    threads: z.array(z.object({ targetId: idSchema, reason: longText }).strict()).max(20).optional(),
    worldEvents: z.array(z.object({ targetId: idSchema, reason: longText }).strict()).max(20).optional(),
    quests: z.array(z.object({ targetId: idSchema, reason: longText }).strict()).max(20).optional(),
    antagonistPlans: z.array(z.object({ targetId: idSchema, reason: longText }).strict()).max(20).optional(),
    worldPressures: z.array(z.object({ targetId: idSchema, reason: longText }).strict()).max(20).optional(),
    memories: z.array(z.object({ targetId: idSchema, reason: longText }).strict()).max(40).optional(),
  }).strict().optional(),
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

export const turnPlanSchema = z.preprocess(normalizeTurnPlan, turnPlanContract)

const consequenceDomainSchema = z.enum([
  'health', 'resources', 'stats', 'conditions', 'inventory', 'equipment', 'abilities', 'artifacts',
  'currency', 'relationships', 'quests', 'characters', 'conflict', 'scene_time', 'world', 'world_pressure', 'knowledge',
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
  verifiedDomains: z.array(consequenceDomainSchema).min(17).max(17),
  omissions: z.array(z.object({
    domain: consequenceDomainSchema,
    evidence: longText,
    requiredChange: longText,
    resolutionPath: longText,
    severity: z.enum(['low', 'medium', 'high']),
  }).strict()).max(64),
  statePatch: turnPatchSchema,
}).strict().superRefine((audit, context) => {
  if (new Set(audit.verifiedDomains).size !== 17) context.addIssue({
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

const narrativeEventRequirementSchema = z.object({
  domain: narrativeEventDomainSchema,
  operation: narrativeEventOperationSchema,
  targetId: idSchema.optional(),
  requirement: longText,
  observable: modelBoolean,
  mandatory: modelBoolean,
}).strict()

const narrativeEventProposalContract = z.object({
  mode: narrativeEventModeSchema,
  existingEventId: idSchema.optional(),
  lifecycleStage: narrativeEventStageSchema,
  concept: longText,
  category: narrativeEventCategorySchema,
  magnitude: narrativeEventMagnitudeSchema,
  miracleKind: narrativeEventMiracleKindSchema,
  originKind: narrativeEventOriginSchema,
  sourceIds: z.preprocess(arrayish, z.array(idSchema).max(24)),
  causeIds: z.preprocess(arrayish, z.array(idSchema).max(24)),
  scopeIds: z.preprocess(arrayish, z.array(idSchema).max(24)),
  participantIds: z.preprocess(arrayish, z.array(idSchema).max(24)),
  affectedDomains: z.preprocess(arrayish, z.array(narrativeEventDomainSchema).min(1).max(40)),
  knowledgeChannel: longText,
  trigger: longText,
  arrivalMethod: longText,
  observableSigns: z.preprocess(arrayish, z.array(longText).max(16)),
  immediateEffects: z.preprocess(arrayish, z.array(narrativeEventRequirementSchema).max(24)),
  persistentEffects: z.preprocess(arrayish, z.array(narrativeEventRequirementSchema).max(24)),
  counterplay: z.preprocess(arrayish, z.array(longText).max(16)),
  cancellationConditions: z.preprocess(arrayish, z.array(longText).max(16)),
  canonReasoning: longText,
  pacingReasoning: longText,
  noveltyReasoning: longText,
  minimumDelay: modelNumber(z.number().int().min(0).max(80)),
}).strict()

const noNarrativeEventContract = z.object({
  mode: z.preprocess(alias({ нет: 'none', пропустить: 'none', ничего: 'none' }), z.literal('none')),
  reason: longText,
}).strict()

export const narrativeEventDecisionSchema = z.preprocess(
  (value) => normalizeModelOutput(value),
  z.union([noNarrativeEventContract, narrativeEventProposalContract]),
)

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

const agencyViolationKindSchema = z.preprocess(alias({
  речь: 'speech', реплика: 'speech', слова: 'speech',
  действие: 'action', поступок: 'action',
  мысль: 'thought', мысли: 'thought',
  эмоция: 'emotion', чувство: 'emotion',
  решение: 'decision', выбор: 'decision',
  мотив: 'motive', намерение: 'motive',
}), z.enum(['speech', 'action', 'thought', 'emotion', 'decision', 'motive']))
const agencyText = z.preprocess((value) => (
  Array.isArray(value) ? value.map((entry) => String(entry)).join('\n') : value
), longText)

const agencyAuditContract = z.object({
  pass: modelBoolean,
  violations: z.array(z.object({
    kind: agencyViolationKindSchema,
    evidence: agencyText,
    reason: agencyText,
    instruction: agencyText,
    severity: z.enum(['high']),
  }).strict()).max(24),
}).strict().superRefine((audit, context) => {
  if (audit.pass && audit.violations.length > 0) context.addIssue({
    code: z.ZodIssueCode.custom,
    path: ['pass'],
    message: 'A passing agency audit cannot contain violations',
  })
  if (!audit.pass && audit.violations.length === 0) context.addIssue({
    code: z.ZodIssueCode.custom,
    path: ['violations'],
    message: 'A failed agency audit must contain exact violations',
  })
})

export const agencyAuditSchema = z.preprocess((value) => normalizeModelOutput(value), agencyAuditContract)

const memoryCuratorContract = z.object({
  memories: z.array(z.object({
    kind: memoryKindSchema,
    content: z.string().trim().min(1).max(2000),
    tags: z.array(z.string().trim().max(100)).max(12),
    importance: modelNumber(z.number().min(0).max(100)),
  }).strict()).max(12),
  archives: z.array(archiveDraftSchema).max(4),
  cleanup: turnPatchContract.shape.cleanup,
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

export const worldQuestionRequestSchema = z.object({
  campaign: turnRequestSchema.shape.campaign,
  question: z.string().trim().min(1).max(20_000),
  scope: z.enum(['known', 'complete']),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().trim().min(1).max(20_000),
  }).strict()).max(20),
  provider: providerSchema,
}).strict()

export const campaignEditResponseSchema = z.object({
  summary: z.string().trim().min(1).max(2000),
  statePatch: turnPatchSchema,
  campaignPatch: z.object({ title: shortText.optional() }).strict().optional(),
  settingsPatch: z.object({
    responseLength: z.enum(['compact', 'balanced', 'detailed', 'adaptive']).optional(),
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
    eventDirector: z.object({
      enabled: modelBoolean.optional(),
      frequency: z.enum(['rare', 'balanced', 'frequent']).optional(),
      maxMagnitude: narrativeEventMagnitudeSchema.optional(),
      lethality: z.enum(['fair', 'ruthless', 'cinematic']).optional(),
      miraclePolicy: z.enum(['rare', 'signals-only', 'off']).optional(),
      canonPolicy: z.enum(['follow-campaign', 'established-only', 'free']).optional(),
      storyImpact: z.enum(['fate-changing', 'side-arcs', 'scene-only']).optional(),
      revealMode: z.enum(['world-only', 'indicator', 'transparent']).optional(),
      repetitionPolicy: z.enum(['evolving-only', 'rare-repeat', 'unrestricted']).optional(),
      permissions: z.object({
        newCharacters: modelBoolean.optional(),
        strongEnemies: modelBoolean.optional(),
        allies: modelBoolean.optional(),
        legends: modelBoolean.optional(),
        powerAwakenings: modelBoolean.optional(),
        powerLoss: modelBoolean.optional(),
        bodyChanges: modelBoolean.optional(),
        artifactCreation: modelBoolean.optional(),
        itemLoss: modelBoolean.optional(),
        politics: modelBoolean.optional(),
        wars: modelBoolean.optional(),
        disasters: modelBoolean.optional(),
        anomalies: modelBoolean.optional(),
        realityChanges: modelBoolean.optional(),
        dimensionalTravel: modelBoolean.optional(),
        temporalEvents: modelBoolean.optional(),
        socialEvents: modelBoolean.optional(),
        miracles: modelBoolean.optional(),
      }).strict().optional(),
    }).strict().optional(),
  }).strict().optional(),
}).strict()

const generatedEvolutionPathSchema = evolutionPathDraftSchema.omit({ id: true })
const generatedPowerTechniqueSchema = powerTechniqueDraftSchema.omit({ id: true })
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
  techniques: z.array(generatedPowerTechniqueSchema).max(48).default([]),
  canonStatus: canonStatusSchema,
  canonReference: longText.optional(),
}).strict()
const generatedArtifactPowerSchema = artifactPowerDraftSchema.extend({
  id: idSchema,
  category: powerCategorySchema,
  scale: longText,
  activation: longText,
  capabilities: z.array(longText).min(1).max(64),
  synergies: z.array(longText).max(32),
  counters: z.array(longText).max(32),
  examples: z.array(longText).min(1).max(24),
  techniques: z.array(generatedPowerTechniqueSchema).max(48).default([]),
  canonStatus: canonStatusSchema,
  canonReference: longText.optional(),
}).strict()
const generatedArtifactComponentSchema = artifactComponentSchema
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
  creativeIdentity: artifactCreativeIdentitySchema,
  presentation: artifactPresentationSchema,
  discovery: artifactDiscoverySchema,
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
const generatedWorldPressureMeasureSchema = worldPressureMeasureSchema.omit({ id: true })
const generatedWorldPressureSchema = worldPressureSchema.omit({
  id: true,
  sourceNpcId: true,
  targetIds: true,
  measures: true,
  createdTurn: true,
  lastAdvancedTurn: true,
}).extend({
  sourceNpcName: shortText.optional(),
  targetNames: z.array(shortText).min(1).max(20),
  measures: z.array(generatedWorldPressureMeasureSchema).max(16),
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

const generatedWorldStructuralContract = z.object({
  title: shortText,
  world: z.object({
    name: shortText,
    tagline: shortText,
    inspiration: longText,
    genre: shortText,
    tone: shortText,
    era: shortText,
    overview: longText,
    rules: z.array(shortText).max(10),
    factions: z.array(generatedWorldFactionSchema).max(14),
    locations: z.array(z.object({ name: shortText, description: longText, danger: modelNumber(z.number().min(0).max(100)) })).max(16),
    places: z.array(generatedWorldPlaceSchema).max(36),
    processes: z.array(generatedWorldProcessSchema).max(14),
    legendarium: generatedLegendariumSchema,
    // The focused integrity stage can add missing fully-authored figures. Keeping the minimum
    // out of the structural pass prevents an incomplete roster from forcing a whole-world rewrite.
    legends: z.array(generatedLegendaryFigureSchema).max(18),
    mysteries: z.array(shortText).max(8),
    routes: z.array(worldRouteSchema).max(30),
    laws: z.array(generatedWorldLawSchema).max(12),
    mechanics: z.array(generatedWorldMechanicSchema).max(12),
    interfaceModules: z.array(adaptiveInterfaceModuleDraftSchema).max(6),
    interfaceBlueprint: worldInterfaceBlueprintDraftSchema.optional(),
    metrics: z.array(worldMetricPatchSchema).max(12).optional(),
    system: z.object({
      name: shortText, summary: longText, progression: longText, conflictResolution: longText, consequences: longText,
      equipmentSlots: z.array(z.object({ key: shortText, label: shortText, accepts: z.array(itemCategorySchema).min(1).max(7) }).strict()).max(12),
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
      rarityLabels: z.object({ common: shortText, uncommon: shortText, rare: shortText, exceptional: shortText.optional(), epic: shortText, legendary: shortText, mythic: shortText.optional(), transcendent: shortText.optional() }).strict(),
    }).strict(),
  }),
  player: z.object({
    name: shortText,
    archetype: shortText,
    appearance: longText,
    personality: longText,
    backstory: longText,
    goal: longText,
    stats: z.array(statStateSchema).max(24),
    resources: z.array(resourceStateSchema.extend({ kind: resourceKindSchema, max: modelNumber(z.number().positive()) }).strict()).max(24),
    abilities: z.array(generatedAbilitySchema).max(40),
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
  })).max(20),
  npcs: z.array(z.object({
    name: shortText, role: shortText, description: longText, personality: longText, disposition: shortText,
    relationship: modelNumber(z.number().min(-100).max(100)), currentGoal: longText, lastSeen: shortText, notes: z.array(z.string().max(500)).max(8),
    stats: z.array(statStateSchema).max(24),
    resources: z.array(resourceStateSchema.extend({ kind: resourceKindSchema, max: modelNumber(z.number().positive()) }).strict()).max(24),
    abilities: z.array(generatedAbilitySchema).max(20),
    knowledge: z.array(knowledgeFactSchema.omit({ id: true })).max(20),
    relationshipDimensions: relationshipDimensionsSchema,
    initiative: npcInitiativeSchema.omit({ lastAdvancedTurn: true }),
    strategy: npcStrategySchema.omit({ lastUpdatedTurn: true }),
    threatProfile: threatProfileSchema.optional(),
    recruitment: npcRecruitmentSchema,
    dossier: generatedNpcDossierSchema.optional(),
    voice: npcVoiceSchema,
  })).max(12),
  socialLinks: z.array(z.object({
    fromNpcName: shortText, toNpcName: shortText,
    kind: shortText,
    label: shortText, score: modelNumber(z.number().min(-100).max(100)), secret: modelBoolean, notes: z.array(z.string().max(500)).max(8),
  }).strict()).max(30),
  worldEvents: z.array(z.object({
    title: shortText, description: longText, dueTurn: optionalModelNumber(z.number().int().min(1)), dueDay: optionalModelNumber(z.number().int().min(1)),
    visibility: worldVisibilitySchema, involvedNpcNames: z.array(shortText).max(12),
    scale: worldScaleSchema.optional(), scopeNames: z.array(shortText).max(24).optional(), causeTitles: z.array(shortText).max(24).optional(),
    consequences: z.array(longText).max(16).optional(),
  }).strict()).max(10),
  factionReputation: z.array(z.object({ factionName: shortText, value: modelNumber(z.number().min(-100).max(100)), label: shortText, notes: z.array(z.string().max(500)).max(8) }).strict()).max(8),
  threads: z.array(z.object({
    type: storyThreadTypeSchema, title: shortText, detail: longText,
    participantNames: z.array(shortText).max(12), status: storyThreadStatusSchema,
    dueTurn: optionalModelNumber(z.number().int().min(1)), secret: modelBoolean,
    scale: worldScaleSchema.optional(), scopeNames: z.array(shortText).max(24).optional(), causeTitles: z.array(shortText).max(24).optional(),
  }).strict()).max(10),
  characterArcs: z.array(generatedCharacterArcSchema).max(12),
  mysteryCases: z.array(generatedMysteryCaseSchema).max(6),
  antagonistPlans: z.array(generatedAntagonistPlanSchema).max(6),
  worldPressures: z.array(generatedWorldPressureSchema).max(6),
  influenceAssets: z.array(generatedInfluenceAssetSchema).max(16),
  quests: z.array(z.object({
    title: shortText, description: longText, objectives: z.array(shortText).min(1).max(8), reward: z.string().max(500).optional(), giver: z.string().max(300).optional(),
  })).max(8),
  lore: z.array(z.object({
    title: shortText, type: loreTypeSchema, content: longText,
    keys: z.array(z.string().max(100)).min(1).max(20), alwaysOn: modelBoolean, secret: modelBoolean, discovered: modelBoolean, priority: modelNumber(z.number().min(0).max(100)),
  })).max(30),
  opening: z.object({
    scene: z.object({ title: shortText, location: shortText, time: shortText, weather: shortText, tension: modelNumber(z.number().min(0).max(100)), presentNpcNames: z.array(shortText).max(8) }),
    pacing: storyPacingUpdateSchema,
    narrative: longText,
    suggestions: z.array(shortText).min(2).max(4),
  }),
}).strict()

// World creation is intentionally split into bounded contracts. Each contract is complete for
// its own domain, while generatedWorldContract below remains the single source of truth for the
// assembled world's cross-entity guarantees. This keeps provider requests short enough to avoid
// gateway timeouts without weakening any field or semantic validation.
const generatedWorldCoreContract = z.object({
  title: generatedWorldStructuralContract.shape.title,
  world: generatedWorldStructuralContract.shape.world.pick({
    name: true,
    tagline: true,
    inspiration: true,
    genre: true,
    tone: true,
    era: true,
    overview: true,
    rules: true,
    system: true,
    presentation: true,
  }).strict(),
  player: generatedWorldStructuralContract.shape.player,
  inventory: generatedWorldStructuralContract.shape.inventory,
}).strict()

const generatedWorldCivilizationContract = z.object({
  world: generatedWorldStructuralContract.shape.world.pick({
    factions: true,
    locations: true,
    places: true,
    routes: true,
    laws: true,
    mechanics: true,
  }).strict(),
}).strict()

const generatedWorldCharactersContract = generatedWorldStructuralContract.pick({
  npcs: true,
  socialLinks: true,
  characterArcs: true,
  antagonistPlans: true,
  worldPressures: true,
  influenceAssets: true,
}).strict()

const generatedWorldLegendsContract = z.object({
  world: generatedWorldStructuralContract.shape.world.pick({
    legendarium: true,
    legends: true,
  }).strict(),
  lore: generatedWorldStructuralContract.shape.lore,
}).strict()

const generatedWorldNarrativeContract = z.object({
  world: generatedWorldStructuralContract.shape.world.pick({
    processes: true,
    mysteries: true,
  }).strict(),
  worldEvents: generatedWorldStructuralContract.shape.worldEvents,
  factionReputation: generatedWorldStructuralContract.shape.factionReputation,
  threads: generatedWorldStructuralContract.shape.threads,
  mysteryCases: generatedWorldStructuralContract.shape.mysteryCases,
  quests: generatedWorldStructuralContract.shape.quests,
  opening: generatedWorldStructuralContract.shape.opening,
}).strict()

const generatedWorldInterfaceContract = z.object({
  world: generatedWorldStructuralContract.shape.world.pick({
    interfaceModules: true,
    interfaceBlueprint: true,
    metrics: true,
  }).strict(),
}).strict()

const generatedWorldContract = generatedWorldStructuralContract.superRefine((world, context) => {
  const normalizeBindingReference = (value?: string) => value?.trim().toLocaleLowerCase('ru-RU').replaceAll('ё', 'е') ?? ''
  const sameBindingReference = (left?: string, right?: string) => normalizeBindingReference(left) === normalizeBindingReference(right)
  const matchesGeneratedKey = (key: string | undefined, entity: { key: string; label: string; aliases?: string[] }) => (
    sameBindingReference(key, entity.key)
    || sameBindingReference(key, entity.label)
    || entity.aliases?.some((alias) => sameBindingReference(key, alias))
  )
  const npcNames = new Set(world.npcs.map((npc) => npc.name.toLocaleLowerCase('ru-RU')))
  const entityNames = new Set([...npcNames, world.player.name.toLocaleLowerCase('ru-RU')])
  const placeNames = new Set(world.world.places.map((place) => place.name.toLocaleLowerCase('ru-RU')))
  const factionNames = new Set(world.world.factions.map((faction) => faction.name.toLocaleLowerCase('ru-RU')))
  const legendThresholds = new Map(world.world.legendarium.thresholds.map((threshold) => [threshold.stage, threshold.minRenown]))
  const causalTitles = [
    ...world.world.processes.map((process) => process.title),
    ...world.worldEvents.map((event) => event.title),
    ...world.threads.map((thread) => thread.title),
  ].map((title) => title.toLocaleLowerCase('ru-RU'))
  const knownCausalTitles = new Set(causalTitles)
  const requireEntity = (name: string, path: Array<string | number>) => {
    if (!entityNames.has(name.toLocaleLowerCase('ru-RU'))) context.addIssue({
      code: z.ZodIssueCode.custom,
      path,
      message: `Unknown character reference: ${name}`,
    })
  }
  const interfaceBindingIssue = (moduleIndex: number, elementIndex: number, message: string) => context.addIssue({
    code: z.ZodIssueCode.custom,
    path: ['world', 'interfaceModules', moduleIndex, 'elements', elementIndex, 'binding'],
    message,
  })
  world.world.interfaceModules.forEach((module, moduleIndex) => {
    module.elements.forEach((element, elementIndex) => {
      const binding = element.binding
      if (!binding || binding.domain === 'custom') return
      const reference = binding.target ?? binding.key
      const visibleModule = module.visibility !== 'hidden'
      const playerResource = () => world.player.resources.find((entry) => matchesGeneratedKey(binding.key, entry))
      const playerStat = () => world.player.stats.find((entry) => matchesGeneratedKey(binding.key, entry))
      const item = () => world.inventory.find((entry) => sameBindingReference(entry.name, binding.target))
      const npc = () => world.npcs.find((entry) => sameBindingReference(entry.name, binding.target))
      const invalid = (message: string) => interfaceBindingIssue(moduleIndex, elementIndex, message)

      if (binding.domain === 'player.resource' && !playerResource()) invalid(`Unknown player resource binding: ${binding.key}`)
      else if (binding.domain === 'player.stat' && !playerStat()) invalid(`Unknown player stat binding: ${binding.key}`)
      else if (binding.domain === 'player.currency' && !Object.keys(world.player.currency).some((key) => sameBindingReference(key, binding.key))) invalid(`Unknown player currency binding: ${binding.key}`)
      else if (binding.domain === 'player.ability-mastery' && !world.player.abilities.some((ability) => sameBindingReference(ability.name, reference))) invalid(`Unknown player ability binding: ${reference}`)
      else if (binding.domain === 'conflict.round' || binding.domain === 'conflict.participant-readiness' || binding.domain === 'conflict.participant-morale') {
        invalid('A generated opening has no persisted active conflict; use scene.tension or a custom qualitative element until a conflict exists')
      } else if (binding.domain === 'world.metric') {
        const metric = (world.world.metrics ?? []).find((entry) => sameBindingReference(entry.id, reference) || sameBindingReference(entry.key, reference) || sameBindingReference(entry.label, reference))
        if (!metric) invalid(`Unknown world metric binding: ${reference}`)
        else if (visibleModule && metric.visibility === 'hidden') invalid(`A visible module cannot bind hidden world metric: ${reference}`)
      } else if (binding.domain === 'world.location-danger' && !world.world.locations.some((location) => sameBindingReference(location.name, reference))) invalid(`Unknown world location binding: ${reference}`)
      else if (binding.domain === 'world.process-momentum') {
        const process = world.world.processes.find((entry) => sameBindingReference(entry.title, binding.target))
        if (!process) invalid(`Unknown world process binding: ${binding.target}`)
        else if (visibleModule && process.visibility === 'hidden') invalid(`A visible module cannot bind hidden world process: ${binding.target}`)
      } else if (binding.domain === 'world.pressure') {
        const pressure = world.worldPressures.find((entry) => sameBindingReference(entry.sourceName, binding.target))
        if (!pressure) invalid(`Unknown world pressure binding: ${binding.target}`)
        else if (visibleModule && pressure.visibility === 'hidden') invalid(`A visible module cannot bind hidden world pressure: ${binding.target}`)
      } else if (binding.domain === 'faction.reputation') {
        const faction = world.world.factions.find((entry) => sameBindingReference(entry.name, reference))
        const reputation = world.factionReputation.find((entry) => sameBindingReference(entry.factionName, reference))
        if (!faction || !reputation) invalid(`Faction reputation binding must match both faction and reputation records: ${reference}`)
        else if (visibleModule && faction.visibility === 'hidden') invalid(`A visible module cannot reveal hidden faction reputation: ${reference}`)
      } else if (binding.domain === 'faction.power') {
        const faction = world.world.factions.find((entry) => sameBindingReference(entry.name, reference))
        if (!faction) invalid(`Unknown faction power binding: ${reference}`)
        else if (visibleModule && faction.visibility === 'hidden') invalid(`A visible module cannot reveal hidden faction power: ${reference}`)
      } else if (binding.domain === 'inventory.item-charges') {
        const target = item()
        if (!target || target.charges === undefined) invalid(`Item charges binding requires an existing item with charges: ${binding.target}`)
      } else if (binding.domain === 'inventory.item-quantity') {
        if (!item()) invalid(`Unknown inventory item binding: ${binding.target}`)
      } else if (binding.domain === 'inventory.item-durability') {
        const target = item()
        if (!target || target.durability === undefined) invalid(`Item durability binding requires an existing item with durability: ${binding.target}`)
      } else if (binding.domain === 'artifact.mastery' || binding.domain === 'artifact.attunement' || binding.domain === 'artifact.bond') {
        const target = item()
        if (!target?.artifact) invalid(`Artifact binding requires an existing artifact item: ${binding.target}`)
      } else if (binding.domain === 'artifact.power-mastery') {
        const target = item()
        if (!target?.artifact?.powers.some((power) => sameBindingReference(power.name, binding.key))) invalid(`Artifact power binding requires an existing exact power: ${binding.target} / ${binding.key}`)
      } else if (binding.domain === 'quest.objective-progress' && !world.quests.some((quest) => sameBindingReference(quest.title, binding.target))) invalid(`Unknown quest binding: ${binding.target}`)
      else if (binding.domain === 'mystery.progress' && !world.mysteryCases.some((mystery) => sameBindingReference(mystery.title, binding.target))) invalid(`Unknown mystery binding: ${binding.target}`)
      else if (binding.domain.startsWith('npc.')) {
        const target = npc()
        if (!target) {
          invalid(`Unknown NPC binding target: ${binding.target}`)
          return
        }
        const dossier = target.dossier
        if (binding.domain === 'npc.stat') {
          const stat = target.stats.find((entry) => matchesGeneratedKey(binding.key, entry))
          if (!stat) invalid(`Unknown NPC stat binding: ${binding.target} / ${binding.key}`)
          else if (visibleModule && !dossier?.revealedSections.includes('stats') && !dossier?.revealedStatKeys.some((key) => sameBindingReference(key, stat.key))) invalid(`A visible module cannot reveal an undisclosed NPC stat: ${binding.target} / ${binding.key}`)
        } else if (binding.domain === 'npc.resource') {
          const resource = target.resources.find((entry) => matchesGeneratedKey(binding.key, entry))
          if (!resource) invalid(`Unknown NPC resource binding: ${binding.target} / ${binding.key}`)
          else if (visibleModule && !dossier?.revealedSections.includes('resources') && !dossier?.revealedResourceKeys.some((key) => sameBindingReference(key, resource.key))) invalid(`A visible module cannot reveal an undisclosed NPC resource: ${binding.target} / ${binding.key}`)
        } else if (binding.domain === 'npc.initiative-urgency') {
          if (visibleModule && (!dossier?.revealedSections.includes('initiative') || target.initiative.visibility === 'hidden')) invalid(`A visible module cannot reveal hidden NPC initiative: ${binding.target}`)
        } else if (binding.domain === 'npc.relationship' && visibleModule && !dossier?.revealedSections.includes('relationship')) invalid(`A visible module cannot reveal an undisclosed NPC relationship: ${binding.target}`)
        else if (binding.domain === 'npc.relationship-dimension') {
          const dimension = normalizeBindingReference(binding.key)
          if (!['trust', 'respect', 'affection', 'fear', 'suspicion', 'dependence'].includes(dimension)) invalid(`Unknown NPC relationship dimension: ${binding.key}`)
          else if (visibleModule && !dossier?.revealedSections.includes('relationshipDimensions')) invalid(`A visible module cannot reveal undisclosed NPC relationship dimensions: ${binding.target}`)
        }
      }
    })
  })
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
  world.worldPressures.forEach((pressure, index) => {
    pressure.targetNames.forEach((name, targetIndex) => requireEntity(name, ['worldPressures', index, 'targetNames', targetIndex]))
    if (pressure.sourceNpcName && !npcNames.has(pressure.sourceNpcName.toLocaleLowerCase('ru-RU'))) context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['worldPressures', index, 'sourceNpcName'],
      message: `Pressure source must exactly match an NPC name: ${pressure.sourceNpcName}`,
    })
    if (['faction', 'corporation'].includes(pressure.sourceKind) && !factionNames.has(pressure.sourceName.toLocaleLowerCase('ru-RU'))) context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['worldPressures', index, 'sourceName'],
      message: `Pressure source must exactly match a faction name: ${pressure.sourceName}`,
    })
  })
  const legendNames = new Set<string>()
  const legendPowerBases = new Set<string>()
  world.world.legends.forEach((legend, index) => {
    const normalizedLegendName = legend.name.toLocaleLowerCase('ru-RU')
    if (legendNames.has(normalizedLegendName)) context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['world', 'legends', index, 'name'],
      message: `Duplicate legendary figure: ${legend.name}`,
    })
    legendNames.add(normalizedLegendName)
    const normalizedPowerBasis = legend.powerStanding.basis.trim().toLocaleLowerCase('ru-RU')
    if (legendPowerBases.has(normalizedPowerBasis)) context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['world', 'legends', index, 'powerStanding', 'basis'],
      message: 'Every known figure requires a distinct contextual power basis, not a copied template',
    })
    legendPowerBases.add(normalizedPowerBasis)
    if (legend.characterName && !entityNames.has(legend.characterName.toLocaleLowerCase('ru-RU'))) context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['world', 'legends', index, 'characterName'],
      message: `Legend character must exactly match the player or an NPC name: ${legend.characterName}`,
    })
    if (['living', 'returned'].includes(legend.lifeStatus) && !legend.characterName) context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['world', 'legends', index, 'characterName'],
      message: 'A living legendary figure must be backed by the simulated player or an NPC',
    })
    const powerRank = { noncombatant: -1, unknown: -1, minor: 0, capable: 1, dangerous: 2, elite: 3, legendary: 4, mythic: 5 }[legend.powerStanding.classification]
    const minimumPowerByStage = { notable: 1, renowned: 2, legendary: 3, mythic: 4 }[legend.stage]
    if (powerRank < minimumPowerByStage) context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['world', 'legends', index, 'powerStanding', 'classification'],
      message: `${legend.stage} figures must have contextual power rank ${minimumPowerByStage} or higher, backed by real evidence`,
    })
    if (['living', 'returned'].includes(legend.lifeStatus) && powerRank >= 2 && legend.characterName) {
      const normalizedCharacterName = legend.characterName.toLocaleLowerCase('ru-RU')
      if (normalizedCharacterName === world.player.name.toLocaleLowerCase('ru-RU')) {
        const demonstratedMastery = Math.max(...world.player.abilities.map((ability) => ability.mastery), 0)
        const minimumMastery = { 2: 45, 3: 65, 4: 80, 5: 90 }[powerRank as 2 | 3 | 4 | 5]
        if (demonstratedMastery < minimumMastery) context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['world', 'legends', index, 'powerStanding'],
          message: 'A living hero power standing must be supported by authored abilities',
        })
      } else {
        const linkedNpc = world.npcs.find((npc) => npc.name.toLocaleLowerCase('ru-RU') === normalizedCharacterName)
        const linkedRank = linkedNpc?.threatProfile ? { minor: 0, capable: 1, dangerous: 2, elite: 3, legendary: 4, mythic: 5 }[linkedNpc.threatProfile.tier] : -1
        if (linkedRank < powerRank) context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['world', 'legends', index, 'powerStanding'],
          message: 'A living exceptional figure must be backed by an NPC threat profile of equal factual strength',
        })
      }
    }
    if (['living', 'returned'].includes(legend.lifeStatus) && legend.characterName) {
      const normalizedCharacterName = legend.characterName.toLocaleLowerCase('ru-RU')
      const authoredAbilities = normalizedCharacterName === world.player.name.toLocaleLowerCase('ru-RU')
        ? world.player.abilities
        : world.npcs.find((npc) => npc.name.toLocaleLowerCase('ru-RU') === normalizedCharacterName)?.abilities ?? []
      if (authoredAbilities.length === 0) context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['world', 'legends', index, 'powerStanding'],
        message: 'A living known figure must have at least one fully authored, unique ability that realizes their contextual strength',
      })
    }
    const minimumRenown = legendThresholds.get(legend.stage)
    if (minimumRenown !== undefined && legend.renown < minimumRenown) context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['world', 'legends', index, 'renown'],
      message: `Renown ${legend.renown} is below the ${legend.stage} threshold ${minimumRenown}`,
    })
    if (['dead', 'sealed', 'dormant'].includes(legend.lifeStatus) && legend.currentState.encounterReadiness > 0 && legend.currentState.encounterConditions.length === 0) context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['world', 'legends', index, 'currentState', 'encounterConditions'],
      message: 'Unavailable figures require explicit encounter conditions before readiness can be above zero',
    })
    if (['legendary', 'mythic'].includes(legend.stage)) {
      if (legend.knownFeats.length < 2 || legend.deeds.length < 2 || legend.myths.length + legend.legacies.length < 2) context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['world', 'legends', index],
        message: 'Legendary and mythic figures require multiple established deeds plus transmitted myths or legacies',
      })
    }
    legend.relatedNpcNames.forEach((name, relatedIndex) => {
      if (!entityNames.has(name.toLocaleLowerCase('ru-RU'))) context.addIssue({ code: z.ZodIssueCode.custom, path: ['world', 'legends', index, 'relatedNpcNames', relatedIndex], message: `Unknown related character: ${name}` })
    })
    legend.successorNpcNames.forEach((name, successorIndex) => {
      if (!entityNames.has(name.toLocaleLowerCase('ru-RU'))) context.addIssue({ code: z.ZodIssueCode.custom, path: ['world', 'legends', index, 'successorNpcNames', successorIndex], message: `Unknown successor character: ${name}` })
    })
    legend.associatedFactionNames.forEach((name, factionIndex) => {
      if (!factionNames.has(name.toLocaleLowerCase('ru-RU'))) context.addIssue({ code: z.ZodIssueCode.custom, path: ['world', 'legends', index, 'associatedFactionNames', factionIndex], message: `Unknown legend faction: ${name}` })
    })
    if (legend.currentState.locationName && !placeNames.has(legend.currentState.locationName.toLocaleLowerCase('ru-RU'))) context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['world', 'legends', index, 'currentState', 'locationName'],
      message: `Unknown legend location: ${legend.currentState.locationName}`,
    })
    legend.deeds.forEach((deed, deedIndex) => {
      deed.scopeNames.forEach((name, scopeIndex) => {
        if (!placeNames.has(name.toLocaleLowerCase('ru-RU'))) context.addIssue({ code: z.ZodIssueCode.custom, path: ['world', 'legends', index, 'deeds', deedIndex, 'scopeNames', scopeIndex], message: `Unknown deed scope: ${name}` })
      })
      deed.factionNames.forEach((name, factionIndex) => {
        if (!factionNames.has(name.toLocaleLowerCase('ru-RU'))) context.addIssue({ code: z.ZodIssueCode.custom, path: ['world', 'legends', index, 'deeds', deedIndex, 'factionNames', factionIndex], message: `Unknown deed faction: ${name}` })
      })
    })
    legend.legacies.forEach((legacy, legacyIndex) => {
      legacy.holderNpcNames.forEach((name, holderIndex) => {
        if (!entityNames.has(name.toLocaleLowerCase('ru-RU'))) context.addIssue({ code: z.ZodIssueCode.custom, path: ['world', 'legends', index, 'legacies', legacyIndex, 'holderNpcNames', holderIndex], message: `Unknown legacy holder: ${name}` })
      })
      legacy.scopeNames.forEach((name, scopeIndex) => {
        if (!placeNames.has(name.toLocaleLowerCase('ru-RU'))) context.addIssue({ code: z.ZodIssueCode.custom, path: ['world', 'legends', index, 'legacies', legacyIndex, 'scopeNames', scopeIndex], message: `Unknown legacy scope: ${name}` })
      })
      legacy.factionNames.forEach((name, factionIndex) => {
        if (!factionNames.has(name.toLocaleLowerCase('ru-RU'))) context.addIssue({ code: z.ZodIssueCode.custom, path: ['world', 'legends', index, 'legacies', legacyIndex, 'factionNames', factionIndex], message: `Unknown legacy faction: ${name}` })
      })
    })
  })
  const legendEcology = assessLegendEcology(world.world.legends)
  legendEcology.deficits.forEach((deficit) => context.addIssue({
    code: z.ZodIssueCode.custom,
    path: ['world', 'legends'],
    message: `Legend ecology requires ${deficit.key} >= ${deficit.target}; received ${deficit.current}`,
  }))
  const combatIdentities = new Set<string>()
  world.npcs.forEach((npc, index) => {
    if (!npc.threatProfile) return
    const tierRank = { minor: 0, capable: 1, dangerous: 2, elite: 3, legendary: 4, mythic: 5 }[npc.threatProfile.tier]
    if (tierRank < 2) return
    const normalizedCombatIdentity = npc.threatProfile.combatIdentity?.trim().toLocaleLowerCase('ru-RU')
    if (normalizedCombatIdentity) {
      if (combatIdentities.has(normalizedCombatIdentity)) context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['npcs', index, 'threatProfile', 'combatIdentity'],
        message: 'Strong NPC combat identities must be distinct instead of reusing one template',
      })
      combatIdentities.add(normalizedCombatIdentity)
    }
    const minimumMastery = { dangerous: 45, elite: 65, legendary: 80, mythic: 90 }[npc.threatProfile.tier as 'dangerous' | 'elite' | 'legendary' | 'mythic']
    const demonstratedMastery = Math.max(...npc.abilities.map((ability) => ability.mastery), 0)
    if (demonstratedMastery < minimumMastery) context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['npcs', index, 'threatProfile', 'tier'],
      message: `${npc.threatProfile.tier} threat tier must be supported by actual ability mastery`,
    })
    const realPowerNames = new Set(npc.abilities.flatMap((ability) => [
      ability.name.toLocaleLowerCase('ru-RU'),
      ...ability.techniques.map((technique) => technique.name.toLocaleLowerCase('ru-RU')),
    ]))
    ;(npc.threatProfile.signatureAbilities ?? []).forEach((name, signatureIndex) => {
      if (!realPowerNames.has(name.toLocaleLowerCase('ru-RU'))) context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['npcs', index, 'threatProfile', 'signatureAbilities', signatureIndex],
        message: `Signature ability must exactly match an authored NPC ability or technique: ${name}`,
      })
    })
  })
  const strongCharacterEcology = assessStrongCharacterEcology(world.npcs)
  strongCharacterEcology.deficits.forEach((deficit) => context.addIssue({
    code: z.ZodIssueCode.custom,
    path: ['npcs'],
    message: `Strong character ecology requires ${deficit.key} >= ${deficit.target}; received ${deficit.current}`,
  }))
  world.influenceAssets.forEach((asset, index) => {
    requireEntity(asset.holderName, ['influenceAssets', index, 'holderName'])
    if (asset.targetName) requireEntity(asset.targetName, ['influenceAssets', index, 'targetName'])
  })
  world.world.places.forEach((place, index) => {
    if (place.parentName && !placeNames.has(place.parentName.toLocaleLowerCase('ru-RU'))) context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['world', 'places', index, 'parentName'],
      message: `Unknown parent place: ${place.parentName}`,
    })
  })
  world.world.processes.forEach((process, index) => {
    process.scopeNames.forEach((name, scopeIndex) => {
      if (!placeNames.has(name.toLocaleLowerCase('ru-RU'))) context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['world', 'processes', index, 'scopeNames', scopeIndex],
        message: `Unknown process scope: ${name}`,
      })
    })
    process.involvedFactionNames.forEach((name, factionIndex) => {
      if (!factionNames.has(name.toLocaleLowerCase('ru-RU'))) context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['world', 'processes', index, 'involvedFactionNames', factionIndex],
        message: `Unknown process faction: ${name}`,
      })
    })
    process.causeTitles?.forEach((title, causeIndex) => {
      const normalized = title.toLocaleLowerCase('ru-RU')
      if (!knownCausalTitles.has(normalized) || normalized === process.title.toLocaleLowerCase('ru-RU')) context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['world', 'processes', index, 'causeTitles', causeIndex],
        message: `Unknown or self-referencing causal title: ${title}`,
      })
    })
  })
  world.worldEvents.forEach((event, index) => {
    event.scopeNames?.forEach((name, scopeIndex) => {
      if (!placeNames.has(name.toLocaleLowerCase('ru-RU'))) context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['worldEvents', index, 'scopeNames', scopeIndex],
        message: `Unknown event scope: ${name}`,
      })
    })
    event.causeTitles?.forEach((title, causeIndex) => {
      const normalized = title.toLocaleLowerCase('ru-RU')
      if (!knownCausalTitles.has(normalized) || normalized === event.title.toLocaleLowerCase('ru-RU')) context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['worldEvents', index, 'causeTitles', causeIndex],
        message: `Unknown or self-referencing causal title: ${title}`,
      })
    })
  })
  world.threads.forEach((thread, index) => {
    thread.scopeNames?.forEach((name, scopeIndex) => {
      if (!placeNames.has(name.toLocaleLowerCase('ru-RU'))) context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['threads', index, 'scopeNames', scopeIndex],
        message: `Unknown thread scope: ${name}`,
      })
    })
    thread.causeTitles?.forEach((title, causeIndex) => {
      const normalized = title.toLocaleLowerCase('ru-RU')
      if (!knownCausalTitles.has(normalized) || normalized === thread.title.toLocaleLowerCase('ru-RU')) context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['threads', index, 'causeTitles', causeIndex],
        message: `Unknown or self-referencing causal title: ${title}`,
      })
    })
  })
  const usesCausalTitles = world.world.processes.some((process) => process.causeTitles?.length)
    || world.worldEvents.some((event) => event.causeTitles?.length)
    || world.threads.some((thread) => thread.causeTitles?.length)
  if (usesCausalTitles && new Set(causalTitles).size !== causalTitles.length) context.addIssue({
    code: z.ZodIssueCode.custom,
    path: ['world', 'processes'],
    message: 'Process, event and thread titles used for causal links must be unique',
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
  world.player.abilities.forEach((ability, abilityIndex) => ability.techniques.forEach((technique, techniqueIndex) => technique.costs.forEach((cost, costIndex) => {
    requireKnownCost(cost.resource, ['player', 'abilities', abilityIndex, 'techniques', techniqueIndex, 'costs', costIndex, 'resource'])
  })))
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
    npc.abilities.forEach((ability, abilityIndex) => ability.techniques.forEach((technique, techniqueIndex) => technique.costs.forEach((cost, costIndex) => {
      requireKnownCost(cost.resource, ['npcs', npcIndex, 'abilities', abilityIndex, 'techniques', techniqueIndex, 'costs', costIndex, 'resource'], npcResourceKeys)
    })))
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
    item.artifact?.powers.forEach((power, powerIndex) => power.techniques.forEach((technique, techniqueIndex) => technique.costs.forEach((cost, costIndex) => {
      requireKnownCost(cost.resource, ['inventory', itemIndex, 'artifact', 'powers', powerIndex, 'techniques', techniqueIndex, 'costs', costIndex, 'resource'])
    })))
  })
})

const generatedWorldEcologyRepairContract = z.object({
  npcs: generatedWorldStructuralContract.shape.npcs,
  legends: generatedWorldStructuralContract.shape.world.shape.legends,
}).strict()

/**
 * DeepSeek first has to finish the complete JSON shape. Cross-entity guarantees are checked
 * separately so a small ecology/reference problem can be repaired without regenerating every
 * unrelated law, item, place and UI module five times.
 */
export const generatedWorldDraftSchema = z.preprocess((value) => normalizeModelOutput(value), generatedWorldStructuralContract)
export const generatedWorldCoreSchema = z.preprocess((value) => normalizeModelOutput(value), generatedWorldCoreContract)
export const generatedWorldCivilizationSchema = z.preprocess((value) => normalizeModelOutput(value), generatedWorldCivilizationContract)
export const generatedWorldCharactersSchema = z.preprocess((value) => normalizeModelOutput(value), generatedWorldCharactersContract)
export const generatedWorldLegendsSchema = z.preprocess((value) => normalizeModelOutput(value), generatedWorldLegendsContract)
export const generatedWorldNarrativeSchema = z.preprocess((value) => normalizeModelOutput(value), generatedWorldNarrativeContract)
export const generatedWorldInterfaceSchema = z.preprocess((value) => normalizeModelOutput(value), generatedWorldInterfaceContract)
export const generatedWorldEcologyRepairSchema = z.preprocess((value) => normalizeModelOutput(value), generatedWorldEcologyRepairContract)
export const generatedWorldSchema = z.preprocess((value) => normalizeModelOutput(value), generatedWorldContract)

export type GeneratedWorld = z.infer<typeof generatedWorldSchema>
export type GeneratedWorldCore = z.infer<typeof generatedWorldCoreSchema>
export type GeneratedWorldCivilization = z.infer<typeof generatedWorldCivilizationSchema>
export type GeneratedWorldCharacters = z.infer<typeof generatedWorldCharactersSchema>
export type GeneratedWorldLegends = z.infer<typeof generatedWorldLegendsSchema>
export type GeneratedWorldNarrative = z.infer<typeof generatedWorldNarrativeSchema>
export type GeneratedWorldInterface = z.infer<typeof generatedWorldInterfaceSchema>
export type GeneratedWorldEcologyRepair = z.infer<typeof generatedWorldEcologyRepairSchema>
export type ConceptAnalysis = z.infer<typeof conceptAnalysisSchema>
export type WorldQualityReview = z.infer<typeof worldQualityReviewSchema>
export type ConsequenceAudit = z.infer<typeof consequenceAuditSchema>
export type AgencyAudit = z.infer<typeof agencyAuditSchema>
