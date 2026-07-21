import type { StoryMessage } from './types.js'

export type NarrativeRepetitionKind = 'internal-paragraph' | 'recent-paragraph' | 'recurring-phrases'
export type NarrativeRepetitionSeverity = 'medium' | 'high'

export interface NarrativeRepetitionIssue {
  kind: NarrativeRepetitionKind
  severity: NarrativeRepetitionSeverity
  candidateParagraph: number
  candidateExcerpt: string
  priorTurn?: number
  priorExcerpt?: string
  similarity: number
  repeatedPhrases: string[]
  instruction: string
}

export interface RepeatedNarrativePhrase {
  phrase: string
  turns: number[]
  count: number
}

export interface RepeatedNarrativeParagraph {
  excerpt: string
  turns: number[]
  similarity: number
}

interface ParagraphRecord {
  index: number
  text: string
  excerpt: string
  words: string[]
  normalized: string
  dialogue: boolean
}

interface HistoricalParagraph extends ParagraphRecord {
  turn: number
}

const REPETITION_STOP_WORDS = new Set([
  'а', 'без', 'бы', 'был', 'была', 'были', 'было', 'быть', 'в', 'вам', 'вас', 'весь', 'во', 'вот', 'все', 'всё',
  'где', 'да', 'для', 'до', 'его', 'ее', 'её', 'ей', 'ему', 'если', 'есть', 'еще', 'ещё', 'же', 'за', 'здесь', 'и',
  'из', 'или', 'им', 'их', 'к', 'как', 'ко', 'когда', 'который', 'ли', 'лишь', 'между', 'мы', 'на', 'над', 'не',
  'него', 'нее', 'неё', 'нет', 'ни', 'но', 'о', 'об', 'он', 'она', 'они', 'оно', 'от', 'перед', 'по', 'под', 'при',
  'про', 'с', 'сам', 'со', 'так', 'такой', 'там', 'тебя', 'тем', 'то', 'только', 'тот', 'ты', 'у', 'уже', 'что',
  'чтобы', 'эта', 'эти', 'это', 'этот', 'я',
])

function cleanParagraph(text: string): string {
  return text
    .replace(/^\s*(?:#{1,6}\s+|>\s*|[-*+]\s+)/u, '')
    .replace(/[*_`]+/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
}

function paragraphWords(text: string): string[] {
  return cleanParagraph(text)
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/gu, 'е')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/u)
    .map((word) => word.replace(/^-+|-+$/gu, ''))
    .filter((word) => word.length > 1)
}

function paragraphExcerpt(text: string, limit = 260): string {
  const cleaned = cleanParagraph(text)
  return cleaned.length <= limit ? cleaned : `${cleaned.slice(0, limit - 1).trimEnd()}…`
}

function splitParagraphs(content: string): ParagraphRecord[] {
  const normalized = content.replace(/\r/gu, '').trim()
  if (!normalized) return []
  const blocks = normalized.split(/\n[\t ]*\n+/u)
  return blocks
    .map(cleanParagraph)
    .filter(Boolean)
    .map((text, index) => {
      const words = paragraphWords(text)
      return {
        index,
        text,
        excerpt: paragraphExcerpt(text),
        words,
        normalized: words.join(' '),
        dialogue: /^(?:[—–-]|[«“"])/u.test(text),
      }
    })
    .filter((paragraph) => paragraph.words.length >= 8 && paragraph.text.length >= 55)
}

function shingles(words: string[], size: number): Set<string> {
  const result = new Set<string>()
  for (let index = 0; index <= words.length - size; index += 1) result.add(words.slice(index, index + size).join(' '))
  return result
}

function intersectionSize(left: Set<string>, right: Set<string>): number {
  let hits = 0
  left.forEach((value) => { if (right.has(value)) hits += 1 })
  return hits
}

function paragraphSimilarity(left: ParagraphRecord, right: ParagraphRecord): number {
  if (left.normalized === right.normalized) return 1
  const leftShingles = shingles(left.words, 3)
  const rightShingles = shingles(right.words, 3)
  if (!leftShingles.size || !rightShingles.size) return 0
  const hits = intersectionSize(leftShingles, rightShingles)
  const containment = hits / Math.min(leftShingles.size, rightShingles.size)
  const union = leftShingles.size + rightShingles.size - hits
  const jaccard = union ? hits / union : 0
  return Math.max(jaccard, containment * 0.88)
}

function longestCommonWordRun(left: string[], right: string[]): number {
  const previous = new Uint16Array(right.length + 1)
  let longest = 0
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = 0
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const saved = previous[rightIndex]
      if (left[leftIndex - 1] === right[rightIndex - 1]) {
        previous[rightIndex] = diagonal + 1
        longest = Math.max(longest, previous[rightIndex])
      } else {
        previous[rightIndex] = 0
      }
      diagonal = saved
    }
  }
  return longest
}

function isDistinctivePhrase(words: string[]): boolean {
  const meaningful = words.filter((word) => word.length >= 4 && !REPETITION_STOP_WORDS.has(word))
  return meaningful.length >= 2 && new Set(meaningful).size >= 2
}

function assistantTail(messages: StoryMessage[], limit = 10): StoryMessage[] {
  return messages.filter((message) => message.role === 'assistant' && !message.failed).slice(-limit)
}

export function findRepeatedNarrativePhrases(messages: StoryMessage[], limit = 24): RepeatedNarrativePhrase[] {
  const occurrences = new Map<string, Set<number>>()
  const recent = assistantTail(messages, 10)
  for (const message of recent) {
    const seenInTurn = new Set<string>()
    for (const paragraph of splitParagraphs(message.content)) {
      for (let size = 6; size >= 4; size -= 1) {
        for (let index = 0; index <= paragraph.words.length - size; index += 1) {
          const words = paragraph.words.slice(index, index + size)
          if (!isDistinctivePhrase(words)) continue
          seenInTurn.add(words.join(' '))
        }
      }
    }
    seenInTurn.forEach((phrase) => {
      const turns = occurrences.get(phrase) ?? new Set<number>()
      turns.add(message.turn)
      occurrences.set(phrase, turns)
    })
  }

  const candidates = [...occurrences.entries()]
    .filter(([, turns]) => turns.size >= 3)
    .map(([phrase, turns]) => ({ phrase, turns: [...turns].sort((a, b) => a - b), count: turns.size }))
    .sort((left, right) => (
      right.phrase.split(' ').length - left.phrase.split(' ').length
      || right.count - left.count
      || left.phrase.localeCompare(right.phrase, 'ru')
    ))

  const selected: RepeatedNarrativePhrase[] = []
  for (const candidate of candidates) {
    if (selected.some((entry) => entry.phrase.includes(candidate.phrase) && entry.turns.every((turn) => candidate.turns.includes(turn)))) continue
    selected.push(candidate)
    if (selected.length >= limit) break
  }
  return selected
}

function historicalParagraphs(messages: StoryMessage[]): HistoricalParagraph[] {
  return assistantTail(messages, 12).flatMap((message) => splitParagraphs(message.content).map((paragraph) => ({ ...paragraph, turn: message.turn })))
}

function duplicateIssue(
  kind: Extract<NarrativeRepetitionKind, 'internal-paragraph' | 'recent-paragraph'>,
  candidate: ParagraphRecord,
  prior: HistoricalParagraph | ParagraphRecord,
  similarity: number,
  commonRun: number,
): NarrativeRepetitionIssue {
  const priorTurn = 'turn' in prior ? prior.turn : undefined
  const location = priorTurn === undefined ? 'в этом же ответе' : `в ходе ${priorTurn}`
  const severity: NarrativeRepetitionSeverity = similarity >= 0.72 || commonRun >= 16 || kind === 'internal-paragraph' ? 'high' : 'medium'
  return {
    kind,
    severity,
    candidateParagraph: candidate.index,
    candidateExcerpt: candidate.excerpt,
    priorTurn,
    priorExcerpt: prior.excerpt,
    similarity: Math.round(similarity * 100) / 100,
    repeatedPhrases: [],
    instruction: `Абзац ${candidate.index + 1} повторяет описание ${location}. Удали повтор и замени его только новой причинно значимой деталью, действием или последствием; если новой информации нет, убери абзац целиком.`,
  }
}

export function findNarrativeRepetitionIssues(candidateText: string, messages: StoryMessage[]): NarrativeRepetitionIssue[] {
  const candidateParagraphs = splitParagraphs(candidateText)
  const history = historicalParagraphs(messages)
  const issues: NarrativeRepetitionIssue[] = []

  for (const candidate of candidateParagraphs) {
    for (const prior of history) {
      const similarity = paragraphSimilarity(candidate, prior)
      const commonRun = longestCommonWordRun(candidate.words, prior.words)
      const dialogueThreshold = candidate.dialogue || prior.dialogue ? 14 : 11
      if (commonRun < dialogueThreshold && similarity < 0.52) continue
      issues.push(duplicateIssue('recent-paragraph', candidate, prior, similarity, commonRun))
    }
  }

  for (let leftIndex = 0; leftIndex < candidateParagraphs.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < candidateParagraphs.length; rightIndex += 1) {
      const left = candidateParagraphs[leftIndex]
      const right = candidateParagraphs[rightIndex]
      const similarity = paragraphSimilarity(right, left)
      const commonRun = longestCommonWordRun(right.words, left.words)
      const dialogueThreshold = left.dialogue || right.dialogue ? 16 : 10
      if (commonRun < dialogueThreshold && similarity < 0.56) continue
      issues.push(duplicateIssue('internal-paragraph', right, left, similarity, commonRun))
    }
  }

  const recurringPhrases = findRepeatedNarrativePhrases(messages)
  for (const candidate of candidateParagraphs) {
    const matched = recurringPhrases.filter((entry) => candidate.normalized.includes(entry.phrase))
    const distinctiveWords = new Set(matched.flatMap((entry) => entry.phrase.split(' ').filter((word) => !REPETITION_STOP_WORDS.has(word))))
    if (matched.length < 2 && distinctiveWords.size < 7) continue
    const phrases = matched.slice(0, 5).map((entry) => entry.phrase)
    issues.push({
      kind: 'recurring-phrases',
      severity: matched.some((entry) => entry.count >= 5) || distinctiveWords.size >= 10 ? 'high' : 'medium',
      candidateParagraph: candidate.index,
      candidateExcerpt: candidate.excerpt,
      similarity: Math.min(1, distinctiveWords.size / 12),
      repeatedPhrases: phrases,
      instruction: `Абзац ${candidate.index + 1} снова собирает привычное описание из фраз «${phrases.join('», «')}». Не переставляй слова: покажи другой наблюдаемый аспект сцены, новое действие или конкретное изменение; при отсутствии нового факта убери атмосферный повтор.`,
    })
  }

  const strongest = new Map<string, NarrativeRepetitionIssue>()
  for (const issue of issues) {
    const key = `${issue.candidateParagraph}:${issue.kind}`
    const previous = strongest.get(key)
    const issueWeight = (issue.severity === 'high' ? 2 : 1) + issue.similarity
    const previousWeight = previous ? (previous.severity === 'high' ? 2 : 1) + previous.similarity : -1
    if (!previous || issueWeight > previousWeight) strongest.set(key, issue)
  }
  return [...strongest.values()].sort((left, right) => (
    left.candidateParagraph - right.candidateParagraph
    || Number(right.severity === 'high') - Number(left.severity === 'high')
    || right.similarity - left.similarity
  )).slice(0, 12)
}

export function narrativeRepetitionScore(issues: NarrativeRepetitionIssue[]): number {
  return issues.reduce((score, issue) => score + (issue.severity === 'high' ? 5 : 2) + issue.similarity, 0)
}

/** Removes already identified repeated paragraphs without asking the model to rewrite the scene. */
export function removeNarrativeRepetitionParagraphs(candidateText: string, issues: NarrativeRepetitionIssue[]): string {
  if (!issues.length) return candidateText.trim()
  const rejected = new Set(issues.map((issue) => issue.candidateParagraph))
  return candidateText.replace(/\r/gu, '').trim().split(/\n[\t ]*\n+/u)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .filter((_, index) => !rejected.has(index))
    .join('\n\n')
}

export function summarizeRepeatedNarrativeParagraphs(messages: StoryMessage[], limit = 12): RepeatedNarrativeParagraph[] {
  const recent = assistantTail(messages, 8)
  const prior: HistoricalParagraph[] = []
  const summaries: RepeatedNarrativeParagraph[] = []
  for (const message of recent) {
    const current = splitParagraphs(message.content)
    for (const paragraph of current) {
      for (const historical of prior) {
        const similarity = paragraphSimilarity(paragraph, historical)
        const commonRun = longestCommonWordRun(paragraph.words, historical.words)
        const dialogueThreshold = paragraph.dialogue || historical.dialogue ? 14 : 11
        if (commonRun < dialogueThreshold && similarity < 0.52) continue
        summaries.push({
          excerpt: paragraph.excerpt,
          turns: [historical.turn, message.turn],
          similarity: Math.round(similarity * 100) / 100,
        })
      }
    }
    prior.push(...current.map((paragraph) => ({ ...paragraph, turn: message.turn })))
  }
  const unique = new Map<string, RepeatedNarrativeParagraph>()
  for (const summary of summaries) {
    const key = paragraphWords(summary.excerpt).slice(0, 12).join(' ')
    const existing = unique.get(key)
    if (!existing || summary.similarity > existing.similarity) unique.set(key, summary)
  }
  return [...unique.values()].sort((left, right) => right.similarity - left.similarity).slice(0, limit)
}
