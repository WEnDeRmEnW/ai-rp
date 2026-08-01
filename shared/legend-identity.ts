import type { LegendaryFigure } from './types.js'

type LegendIdentityLike = Pick<LegendaryFigure, 'characterId' | 'name' | 'aliases' | 'titles' | 'epithet' | 'role' | 'summary'>

type NamedEntity = { id: string; name: string }

const nonCharacterRolePattern = /(?:событи|катастроф|катаклизм|войн|конфликт|битв|пророчеств|предсказан|место|город|храм|сооружен|крепост|территор|локаци|организац|орден|культ|сект|фракци|государств|импери|явлени|бур[яи]|шторм|прокляти|тайна|загадк|эпох|эра|артефакт|предмет|оружи|реликви|закон|механик)/iu
const characterRolePattern = /(?:человек|личност|персонаж|геро|правител|корол|королев|владык|лидер|основател|создател|творец|кузнец|маг|мастер|воин|страж|хранител|учител|ученик|провидец|пророк|исследовател|развед|посредни|капитан|странник|путешествен|наёмник|убийц|полководец|командир|антагонист|союзник|жертв|представител|член)/iu
const eventTitlePattern = /^(?:падение|восхождение|рождение|создание|скитания|странствие|путь|пророчество|предсказание|легенда\s+о|тайна|война|битва|восстание|исчезновение|возвращение|пробуждение|смерть|гибель|становление|правление|эпоха|катастрофа|катаклизм|разлом|раскол|проклятие|освобождение|разрушение|основание)(?![\p{L}\p{N}])/iu
const collectiveOrObjectPattern = /(?<![\p{L}\p{N}])(?:культ|орден|стражи|хранители|армия|народ|город|храм|крепость|башня|корпорация|гильдия|клан|династия|война|буря|шторм|разлом|пророчество|катана|меч|артефакт)(?![\p{L}\p{N}])/iu

const normalize = (value: string | undefined) => (value ?? '').normalize('NFKC').trim().toLocaleLowerCase('ru-RU')

/** True when a legend heading is phrased as an occurrence or historical chapter, not a person. */
export function legendNameLooksLikeEvent(value: string): boolean {
  return eventTitlePattern.test(value.trim())
}

/**
 * Keeps the legendarium roster about individual characters. Events, places, factions, prophecies
 * and artifacts have their own world-state collections and must not masquerade as people here.
 */
export function legendRepresentsCharacter(legend: LegendIdentityLike): boolean {
  if (legend.characterId) return true
  // A role such as "воин" or "провидец" must not turn "Война…" or "Пророчество…"
  // into a person. A legacy biographical heading is retained only when it also contains a clean
  // human alias/title that the UI can display instead of the event heading.
  if (legendNameLooksLikeEvent(legend.name)) return Boolean(humanFallbackName(legend) && characterRolePattern.test(legend.role))
  if (collectiveOrObjectPattern.test(`${legend.name} ${legend.epithet ?? ''}`)) return false
  if (characterRolePattern.test(legend.role)) return true
  if (nonCharacterRolePattern.test(legend.role)) return false
  return true
}

function humanFallbackName(legend: LegendIdentityLike): string | undefined {
  return [...legend.titles, ...legend.aliases]
    .map((candidate) => candidate.trim())
    .find((candidate) => candidate.length > 1 && !legendNameLooksLikeEvent(candidate) && !collectiveOrObjectPattern.test(candidate))
}

/** Resolves the actual person first, then a conservative legacy fallback for old malformed saves. */
export function legendCharacterDisplayName(
  legend: LegendIdentityLike,
  player: NamedEntity,
  npcs: NamedEntity[],
): string {
  if (legend.characterId === player.id) return player.name
  const linkedNpc = legend.characterId ? npcs.find((npc) => npc.id === legend.characterId) : undefined
  if (linkedNpc) return linkedNpc.name
  if (legendNameLooksLikeEvent(legend.name)) return humanFallbackName(legend) ?? legend.name
  return legend.name
}

/** Generated linked figures use the real character name; aliases and titles hold legendary names. */
export function linkedLegendNameMatchesCharacter(legendName: string, characterName: string | undefined): boolean {
  return !characterName || normalize(legendName) === normalize(characterName)
}
