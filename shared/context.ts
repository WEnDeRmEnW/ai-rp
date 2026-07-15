import type { Campaign, CampaignSettings, CanonDocument, LoreEntry, MemoryEntry, StoryArchive, StoryMessage } from './types.js'

export interface ContextProfile {
  budgetChars: number
  recentMessages: number
  lore: number
  memories: number
  documents: number
  archives: number
}

export const CONTEXT_PROFILES: Record<NonNullable<CampaignSettings['contextProfile']>, ContextProfile> = {
  standard: { budgetChars: 180_000, recentMessages: 32, lore: 10, memories: 16, documents: 8, archives: 18 },
  long: { budgetChars: 900_000, recentMessages: 120, lore: 24, memories: 40, documents: 24, archives: 60 },
  // Около 700k токенов при обычном русском тексте: остаётся запас под инструкции,
  // рассуждение модели и длинный ответ в окне на 1M токенов.
  million: { budgetChars: 2_800_000, recentMessages: 260, lore: 48, memories: 96, documents: 64, archives: 160 },
}

const STOP_WORDS = new Set([
  'и', 'в', 'во', 'на', 'с', 'со', 'а', 'но', 'что', 'это', 'я', 'ты', 'он', 'она', 'мы', 'вы',
  'к', 'у', 'по', 'из', 'за', 'от', 'до', 'для', 'как', 'же', 'бы', 'the', 'a', 'an', 'and', 'or',
  'to', 'of', 'in', 'on', 'is', 'it', 'i', 'you', 'we', 'they',
])

export function tokenize(text: string): string[] {
  return text
    .toLocaleLowerCase('ru-RU')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 1 && !STOP_WORDS.has(word))
}

function tokenOverlap(query: string[], content: string): number {
  if (!query.length) return 0
  const haystack = new Set(tokenize(content))
  return query.reduce((score, word) => score + (haystack.has(word) ? 1 : 0), 0) / query.length
}

function softTokenEqual(left: string, right: string): boolean {
  if (left === right) return true
  const stemLength = Math.min(5, left.length, right.length)
  return stemLength >= 3 && left.slice(0, stemLength) === right.slice(0, stemLength)
}

function keyMatches(queryText: string, queryTokens: string[], key: string): boolean {
  if (queryText.includes(key.toLocaleLowerCase('ru-RU'))) return true
  const keyTokens = tokenize(key)
  return keyTokens.length > 0 && keyTokens.every((keyToken) => queryTokens.some((queryToken) => softTokenEqual(keyToken, queryToken)))
}

export function selectRelevantLore(
  lore: LoreEntry[],
  queryText: string,
  limit = 8,
  campaign?: Campaign,
): LoreEntry[] {
  const normalizedQuery = queryText.toLocaleLowerCase('ru-RU')
  const queryTokens = tokenize(queryText)

  return lore
    .filter((entry) => entry.enabled && (!campaign || loreConditionsMatch(entry, campaign)))
    .map((entry) => {
      const keyHits = entry.keys.filter((key) => keyMatches(normalizedQuery, queryTokens, key)).length
      const lexical = tokenOverlap(queryTokens, `${entry.title} ${entry.content} ${entry.keys.join(' ')}`)
      const score = (entry.alwaysOn ? 100 : 0) + keyHits * 20 + lexical * 10 + entry.priority / 10
      const matched = entry.alwaysOn || keyHits > 0 || lexical >= 0.25
      return { entry, score, matched }
    })
    .filter(({ matched }) => matched)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ entry }) => entry)
}

function loreConditionsMatch(entry: LoreEntry, campaign: Campaign): boolean {
  const conditions = entry.conditions
  if (!conditions) return true
  const normalizedLocation = campaign.scene.location.toLocaleLowerCase('ru-RU')
  if (conditions.locations?.length && !conditions.locations.some((location) => location.toLocaleLowerCase('ru-RU') === normalizedLocation)) return false
  if (conditions.npcIds?.length && !conditions.npcIds.some((id) => campaign.scene.presentNpcIds.includes(id))) return false
  if (conditions.questIds?.length && !conditions.questIds.every((id) => campaign.quests.some((quest) => quest.id === id && quest.status !== 'hidden'))) return false
  if (conditions.minTurn !== undefined && campaign.turn < conditions.minTurn) return false
  if (conditions.maxTurn !== undefined && campaign.turn > conditions.maxTurn) return false
  if (conditions.minRelationship !== undefined) {
    const candidates = conditions.npcIds?.length ? campaign.npcs.filter((npc) => conditions.npcIds?.includes(npc.id)) : campaign.npcs
    if (!candidates.some((npc) => npc.relationship >= conditions.minRelationship!)) return false
  }
  return true
}

export function selectRelevantMemories(
  memories: MemoryEntry[],
  queryText: string,
  limit = 6,
): MemoryEntry[] {
  const queryTokens = tokenize(queryText)
  const latestTurn = memories.reduce((latest, entry) => Math.max(latest, entry.turn), 0)
  return memories
    .map((memory) => ({
      memory,
      score:
        tokenOverlap(queryTokens, `${memory.content} ${memory.tags.join(' ')}`) * 10 +
        memory.importance / 10 +
        (memory.pinned ? 20 : 0) +
        Math.max(0, 12 - latestTurn + memory.turn) * 0.25,
    }))
    .sort((a, b) => b.score - a.score || b.memory.turn - a.memory.turn)
    .slice(0, limit)
    .map(({ memory }) => memory)
}

export function selectRelevantArchives(archives: StoryArchive[], queryText: string, limit = 24): StoryArchive[] {
  const queryTokens = tokenize(queryText)
  const latestTurn = archives.reduce((latest, entry) => Math.max(latest, entry.endTurn), 0)
  return archives
    .map((archive) => ({
      archive,
      score:
        tokenOverlap(queryTokens, `${archive.title} ${archive.summary} ${archive.tags.join(' ')} ${archive.entityIds.join(' ')}`) * 24 +
        archive.importance / 10 +
        Math.max(0, 20 - latestTurn + archive.endTurn) * 0.15,
    }))
    .sort((a, b) => b.score - a.score || b.archive.endTurn - a.archive.endTurn)
    .slice(0, limit)
    .map(({ archive }) => archive)
}

export function selectRelevantDocumentChunks(documents: CanonDocument[], queryText: string, limit = 4) {
  const queryTokens = tokenize(queryText)
  return documents
    .flatMap((document) => document.chunks.map((chunk) => ({ documentId: document.id, documentTitle: document.title, ...chunk })))
    .map((chunk) => ({
      chunk,
      score: tokenOverlap(queryTokens, `${chunk.keys.join(' ')} ${chunk.text}`) * 20 + chunk.keys.filter((key) => keyMatches(queryText.toLocaleLowerCase('ru-RU'), queryTokens, key)).length * 8,
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ chunk }) => chunk)
}

export function compactMemoryBank(memories: MemoryEntry[], limit = 5_000): MemoryEntry[] {
  const seen = new Set<string>()
  const unique = [...memories].reverse().filter((memory) => {
    const signature = tokenize(memory.content).slice(0, 18).join(' ')
    if (!signature || seen.has(signature)) return Boolean(memory.pinned)
    seen.add(signature)
    return true
  })
  return unique
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.importance - a.importance || b.turn - a.turn)
    .slice(0, limit)
    .sort((a, b) => a.turn - b.turn)
}

function fitRecentMessages(messages: StoryMessage[], count: number, budgetChars: number): StoryMessage[] {
  const selected: StoryMessage[] = []
  let used = 0
  for (let index = messages.length - 1; index >= 0 && selected.length < count; index -= 1) {
    const message = messages[index]
    if (selected.length && used + message.content.length > budgetChars) break
    selected.push(message)
    used += message.content.length
  }
  return selected.reverse()
}

export function buildContextSelection(campaign: Campaign, input: string) {
  const profileName = campaign.settings.contextProfile ?? 'million'
  const profile = CONTEXT_PROFILES[profileName]
  const recentMessages = fitRecentMessages(campaign.messages, profile.recentMessages, Math.floor(profile.budgetChars * 0.58))
  const recentText = recentMessages.slice(-24).map((message) => message.content).join('\n')
  const query = `${campaign.scene.location} ${recentText} ${input}`
  const lore = selectRelevantLore(campaign.lore, query, profile.lore, campaign)
  const memories = selectRelevantMemories(campaign.memories, query, profile.memories)
  const documents = selectRelevantDocumentChunks(campaign.documents ?? [], query, profile.documents)
  const archives = selectRelevantArchives(campaign.archives ?? [], query, profile.archives)
  const estimatedChars = recentMessages.reduce((sum, message) => sum + message.content.length, 0) +
    lore.reduce((sum, entry) => sum + entry.content.length, 0) +
    memories.reduce((sum, entry) => sum + entry.content.length, 0) +
    documents.reduce((sum, entry) => sum + entry.text.length, 0) +
    archives.reduce((sum, entry) => sum + entry.summary.length, 0)
  return {
    profileName,
    budgetChars: profile.budgetChars,
    estimatedChars,
    recentMessages,
    lore,
    memories,
    documents,
    archives,
  }
}
