import type { Rarity } from '../shared/types.js'

const normalize = (value: string) => value
  .normalize('NFKC')
  .toLocaleLowerCase('ru-RU')
  .replace(/ё/gu, 'е')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim()

const artifactPattern = /артефакт|реликв|особ\p{L}*\s+предмет|оружи|artifact|relic/iu
const grantPattern = /(?:дай|дать|выдай|выдать|добавь|создай|создать|получи(?:ть|л|ла|ли|т|м)|передай|передать|вруч|наград|полож|сделай\s+(?:мне|герою|персонажу))/iu

const maximumRarityPatterns = [
  /макс\p{L}{0,18}\s+(?:редк\p{L}*|ранг\p{L}*|класс\p{L}*|уров\p{L}*)/iu,
  /наивысш\p{L}*(?:\s+доступн\p{L}*)?\s+(?:редк\p{L}*|ранг\p{L}*|класс\p{L}*|уров\p{L}*)/iu,
  /(?:высш|предельн)\p{L}*\s+(?:редк\p{L}*|ранг\p{L}*|класс\p{L}*|уров\p{L}*)/iu,
  /сам\p{L}*\s+(?:высок\p{L}*|редк\p{L}*|сильн\p{L}*)\s*(?:редк\p{L}*|ранг\p{L}*|класс\p{L}*|уров\p{L}*)?/iu,
  /абсолютн\p{L}*\s+максимум/iu,
]

const rarityPatterns: Array<{ rarity: Rarity; pattern: RegExp }> = [
  { rarity: 'transcendent', pattern: /трансцендент|transcendent|божественн|сильнейш/iu },
  { rarity: 'mythic', pattern: /мифическ|mythic/iu },
  { rarity: 'legendary', pattern: /легендарн|legendary/iu },
  { rarity: 'epic', pattern: /эпическ|epic/iu },
  { rarity: 'exceptional', pattern: /исключительн|exceptional/iu },
  { rarity: 'rare', pattern: /\bредк(?:ий|ого|ую|ое|ие)\b|\brare\b/iu },
  { rarity: 'uncommon', pattern: /необычн|uncommon/iu },
  { rarity: 'common', pattern: /\bобычн|\bcommon\b/iu },
]

export function requestedArtifactRarity(input: string): Rarity | undefined {
  const text = normalize(input)
  if (!artifactPattern.test(text)) return undefined
  if (maximumRarityPatterns.some((pattern) => pattern.test(text))) return 'transcendent'
  return rarityPatterns.find((entry) => entry.pattern.test(text))?.rarity
}

export function requestsNewArtifact(input: string): boolean {
  const text = normalize(input)
  return artifactPattern.test(text) && grantPattern.test(text)
}
