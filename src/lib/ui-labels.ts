const labels: Record<string, string> = {
  active: 'Активно', inactive: 'Неактивно', open: 'Открыто', solved: 'Раскрыто', failed: 'Провалено', completed: 'Завершено', broken: 'Нарушено',
  fulfilled: 'Исполнено', resolved: 'Завершено', hidden: 'Скрыто', known: 'Известно', rumored: 'Известно по слухам', scheduled: 'Ожидается', due: 'Назрело',
  cancelled: 'Отменено', pending: 'Ожидает', abandoned: 'Оставлено', dormant: 'Неактивно', destroyed: 'Уничтожено', damaged: 'Повреждено', missing: 'Отсутствует',
  proposed: 'Предложено', contested: 'Оспаривается', repealed: 'Отменено', emerging: 'Формируется', obsolete: 'Утратило силу',
  spent: 'Использовано', repaid: 'Погашено', lost: 'Утрачено', possible: 'Возможно', invited: 'Приглашён', member: 'В отряде', left: 'Ушёл', unavailable: 'Недоступно',
  respite: 'Передышка', setup: 'Завязка', exploration: 'Исследование', rising: 'Нарастание', challenge: 'Испытание', aftermath: 'Последствия', climax: 'Кульминация',
  none: 'Нет', light: 'Лёгкое', hard: 'Сложное', severe: 'Крайне опасное', legendary: 'Легендарное', mythic: 'Мифическое',
  minor: 'Незначительное', capable: 'Опытное', dangerous: 'Опасное', elite: 'Элитное', trace: 'Слабый след', local: 'Местное', serious: 'Серьёзное', critical: 'Критическое',
  npc: 'Персонаж', authority: 'Власть', corporation: 'Корпорация', deity: 'Божество', cosmic: 'Космическая сила', watching: 'Наблюдает', investigating: 'Расследует', preparing: 'Готовится', acting: 'Действует', cooling: 'Ослабевает', considered: 'Рассматривается', foiled: 'Сорвано',

  mystery: 'Тайна', rumor: 'Слух', promise: 'Обещание', debt: 'Долг', witness: 'Свидетельство', quest: 'Задание', personal: 'Личная линия',
  summary: 'Сводка', fact: 'Факт', relationship: 'Отношения', scene: 'Сцена', chapter: 'Глава', era: 'Эпоха',
  character: 'Персонаж', location: 'Место', faction: 'Фракция', object: 'Предмет', rule: 'Правило', history: 'История', secret: 'Тайна',

  active_ability: 'Активная', passive: 'Пассивная', reaction: 'Реакция', ritual: 'Ритуал', transformation: 'Превращение', other: 'Другое',
  offense: 'Атака', defense: 'Защита', control: 'Контроль', mobility: 'Перемещение', utility: 'Применение', perception: 'Восприятие', creation: 'Созидание',
  summoning: 'Призыв', reality: 'Реальность', time: 'Время', space: 'Пространство', mind: 'Разум', soul: 'Душа', energy: 'Энергия', matter: 'Материя', power: 'Сила',
  social: 'Общество', economic: 'Экономика', travel: 'Путешествия', crafting: 'Ремесло', survival: 'Выживание', political: 'Политика',

  favor: 'Услуга', leverage: 'Рычаг влияния', contact: 'Контакт', access: 'Доступ', reputation: 'Репутация', oath: 'Клятва',
  injury: 'Травма', buff: 'Усиление', debuff: 'Ослабление', disease: 'Болезнь', poison: 'Яд', curse: 'Проклятие', blessing: 'Благословение', environment: 'Среда', mental: 'Разум',
  health: 'Здоровье', stamina: 'Выносливость', mana: 'Мана', chakra: 'Чакра', focus: 'Фокус', sanity: 'Рассудок', morale: 'Боевой дух', hunger: 'Голод', ammo: 'Боезапас', charges: 'Заряды', custom: 'Особый ресурс',
  knowledge: 'знания',
  intact: 'Исправно', depleted: 'Истощено', sealed: 'Запечатано', canonical: 'Канон', derived: 'Развитие канона', original: 'Оригинальное',
  standard: 'Стандартный', long: 'Долгий', million: 'DeepSeek 1M',
  adventure: 'Приключение', drama: 'Драма', fantasy: 'Фэнтези', horror: 'Ужасы', thriller: 'Триллер', romance: 'Романтика',
  science_fiction: 'Научная фантастика', sci_fi: 'Научная фантастика', cyberpunk: 'Киберпанк', action: 'Боевик', mystery_genre: 'Мистика',
}

const technicalWords = Object.keys(labels).sort((left, right) => right.length - left.length)
const technicalPattern = new RegExp(`\\b(${technicalWords.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'gi')
const hasCyrillic = /[а-яё]/iu
const uuidPattern = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/giu
const internalPathPattern = /\b(?:statePatch|[a-z][A-Za-z0-9_$]*)(?:(?:\.[A-Za-z_$][\w$]*)|(?:\[\d+\]))+/gu
const internalPathDetectionPattern = /\b(?:statePatch|[a-z][A-Za-z0-9_$]*)(?:(?:\.[A-Za-z_$][\w$]*)|(?:\[\d+\]))+/u
const internalIdentifierPattern = /\b(?:[a-z][a-z0-9]*_[a-z0-9_]{2,}|[a-f0-9]{12,})\b/giu
const internalCamelCasePattern = /\b[a-z]+(?:[A-Z][A-Za-z0-9]*)+\b/g

export function uiLabel(value: string | undefined, fallback = 'Другое') {
  if (!value?.trim()) return fallback
  const normalized = value.trim().toLocaleLowerCase('ru-RU').replace(/[\s.-]+/g, '_')
  if (normalized === 'active' && fallback === 'Особенность') return 'Активная'
  if (labels[normalized]) return labels[normalized]
  if (hasCyrillic.test(value)) return value.trim()
  const translated = value.trim().replace(technicalPattern, (match) => labels[match.toLocaleLowerCase('ru-RU')] ?? match).replace(/[_-]+/g, ' ')
  return hasCyrillic.test(translated) ? translated : fallback
}

/** Localizes previously stored technical receipts without mutating campaign data. */
export function localizeTechnicalText(value: string) {
  return value.replace(/\bNPC\b/g, 'персонаж').replace(technicalPattern, (match) => labels[match.toLocaleLowerCase('ru-RU')] ?? match)
}

/** Removes implementation details from persistent player-facing change receipts. */
export function sanitizeReceiptText(value: string, fallback = 'Состояние мира обновлено') {
  const localized = localizeTechnicalText(value)
  const sanitized = localized
    .replace(uuidPattern, 'служебная запись')
    .replace(internalPathPattern, 'служебное поле')
    .replace(internalIdentifierPattern, 'служебная запись')
    .replace(internalCamelCasePattern, 'служебное поле')
    .replace(/(?:служебное (?:поле|значение|запись))(?:[\s:·,;—-]+служебное (?:поле|значение|запись))+/giu, 'служебные данные')
    .replace(/\s+([,.;:])/gu, '$1')
    .replace(/\s{2,}/gu, ' ')
    .trim()
  return sanitized || fallback
}

export function isTechnicalReceiptText(value: string) {
  return /(?:^|\s)(?:изменение не применено|служебная (?:ошибка|сверка)|техническая (?:ошибка|сверка))/iu.test(value)
    || /\bstatePatch\b/iu.test(value)
    || internalPathDetectionPattern.test(value)
}

export function resourceUiLabel(key: string, available?: Array<{ key: string; label: string; aliases?: string[] }>) {
  const normalized = key.trim().toLocaleLowerCase('ru-RU')
  const resource = available?.find((entry) => [entry.key, entry.label, ...(entry.aliases ?? [])].some((candidate) => candidate.toLocaleLowerCase('ru-RU') === normalized))
  return resource?.label ?? uiLabel(key, key)
}
