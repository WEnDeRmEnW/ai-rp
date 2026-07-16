import type { WorldIdea } from './types.js'

const GENERIC_WORDS = new Set([
  'мир', 'мира', 'мире', 'миры', 'герой', 'героя', 'история', 'истории', 'кампания', 'кампании',
  'механика', 'механики', 'система', 'системы', 'общество', 'общества', 'новый', 'новая', 'новое',
  'где', 'который', 'которая', 'которые', 'через', 'между', 'после', 'перед', 'среди', 'этого',
  'this', 'that', 'world', 'story', 'hero', 'system', 'where', 'with', 'from', 'into',
])

const RUSSIAN_ENDINGS = [
  'иями', 'ями', 'ами', 'ениях', 'ениях', 'ение', 'ения', 'остью', 'ости', 'ого', 'его', 'ому', 'ему',
  'ыми', 'ими', 'ий', 'ый', 'ая', 'яя', 'ое', 'ее', 'ые', 'ие', 'ую', 'юю', 'ой', 'ей', 'ам', 'ям',
  'ах', 'ях', 'ов', 'ев', 'ом', 'ем', 'а', 'я', 'ы', 'и', 'у', 'ю', 'е', 'о',
]

function normalize(value: string) {
  return value
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/gu, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

function stem(value: string) {
  if (!/^[а-я]+$/u.test(value) || value.length < 7) return value
  const ending = RUSSIAN_ENDINGS.find((candidate) => value.endsWith(candidate) && value.length - candidate.length >= 4)
  return ending ? value.slice(0, -ending.length) : value
}

function meaningfulTokens(value: string) {
  return [...new Set(normalize(value)
    .split(' ')
    .filter((token) => token.length >= 3 && !GENERIC_WORDS.has(token))
    .map(stem))]
}

function tokenContainment(left: string, right: string) {
  const a = meaningfulTokens(left)
  const b = meaningfulTokens(right)
  if (!a.length || !b.length) return 0
  const bSet = new Set(b)
  const intersection = a.filter((token) => bSet.has(token)).length
  return intersection / Math.min(a.length, b.length)
}

function ngrams(value: string, size = 4) {
  const compact = normalize(value).replace(/\s+/gu, ' ')
  if (compact.length <= size) return compact ? [compact] : []
  const result: string[] = []
  for (let index = 0; index <= compact.length - size; index += 1) result.push(compact.slice(index, index + size))
  return result
}

function characterDice(left: string, right: string) {
  const a = ngrams(left)
  const b = ngrams(right)
  if (!a.length || !b.length) return 0
  const counts = new Map<string, number>()
  b.forEach((gram) => counts.set(gram, (counts.get(gram) ?? 0) + 1))
  let intersection = 0
  a.forEach((gram) => {
    const remaining = counts.get(gram) ?? 0
    if (remaining <= 0) return
    intersection += 1
    counts.set(gram, remaining - 1)
  })
  return (2 * intersection) / (a.length + b.length)
}

function previousTitle(value: string) {
  const firstLine = value.split(/\r?\n/u, 1)[0] ?? value
  const separator = firstLine.indexOf(':')
  return normalize(separator >= 0 ? firstLine.slice(0, separator) : firstLine)
}

function coreSummary(idea: WorldIdea) {
  return `${idea.title}: ${idea.corePremise}`
}

export function worldIdeaSummary(idea: WorldIdea) {
  return `${coreSummary(idea)}\nМеханика: ${idea.signatureMechanic.name}. ${idea.signatureMechanic.principle}`.slice(0, 3000)
}

export interface WorldIdeaNovelty {
  novel: boolean
  similarity: number
  closest?: string
  reason?: string
}

export function assessWorldIdeaNovelty(idea: WorldIdea, previousIdeas: string[]): WorldIdeaNovelty {
  if (!previousIdeas.length) return { novel: true, similarity: 0 }

  const candidateTitle = normalize(idea.title)
  const candidateVariants = [coreSummary(idea), worldIdeaSummary(idea)]
  let closest: string | undefined
  let highest = 0
  let reason: string | undefined

  for (const previous of previousIdeas) {
    const priorTitle = previousTitle(previous)
    const exactTitle = Boolean(candidateTitle && candidateTitle === priorTitle)
    let bestContainment = 0
    let bestDice = 0
    let bestCombined = 0

    for (const candidate of candidateVariants) {
      const containment = tokenContainment(candidate, previous)
      const dice = characterDice(candidate, previous)
      const combined = containment * 0.65 + dice * 0.35
      bestContainment = Math.max(bestContainment, containment)
      bestDice = Math.max(bestDice, dice)
      bestCombined = Math.max(bestCombined, combined)
    }

    const exactText = candidateVariants.some((candidate) => normalize(candidate) === normalize(previous))
    const titleContainment = tokenContainment(candidateTitle, priorTitle)
    const repeatedMechanic = normalize(idea.signatureMechanic.name).length >= 5
      && normalize(previous).includes(normalize(idea.signatureMechanic.name))
      && bestContainment >= 0.35
    const renamedVariant = titleContainment >= 0.8 && bestCombined >= 0.3
    const duplicate = exactTitle || exactText || repeatedMechanic || renamedVariant || bestContainment >= 0.74 || bestDice >= 0.86 || bestCombined >= 0.7
    const similarity = exactTitle || exactText
      ? 1
      : Math.max(bestCombined, bestContainment * 0.92, bestDice * 0.9, repeatedMechanic ? 0.82 : 0, renamedVariant ? 0.78 : 0)

    if (similarity > highest) {
      highest = similarity
      closest = previous
      reason = exactTitle
        ? 'повторилось название мира'
        : exactText
          ? 'повторилась центральная концепция'
          : repeatedMechanic
            ? 'повторились характерная механика и причинный фундамент'
            : renamedVariant
              ? 'прежний мир был только слегка переименован'
          : bestContainment >= 0.74
            ? 'повторились ключевые сущности и причинный фундамент'
            : bestDice >= 0.86
              ? 'новый текст оказался почти дословным пересказом'
              : 'концепция слишком близка к прошлому варианту'
    }

    if (duplicate) return { novel: false, similarity, closest: previous, reason }
  }

  return { novel: true, similarity: highest, closest }
}
