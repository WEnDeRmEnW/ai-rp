import type { Campaign, CampaignSettings, CanonDocument, LoreEntry, MemoryEntry, StoryArchive, StoryMessage, WorldChronicleEntry } from './types.js'
import { assessLegendEcology, assessStrongCharacterEcology, type LegendEcologyAssessment, type StrongCharacterEcologyAssessment } from './legend-ecology.js'

export interface ContextProfile {
  budgetChars: number
  recentMessages: number
  lore: number
  memories: number
  documents: number
  archives: number
}

export interface NarrativeFingerprint {
  recentOpenings: string[]
  recentClosings: string[]
  repeatedMotifs: string[]
  recentWordCounts: number[]
}

export interface SimulationReview {
  currentTurn: number
  offscreenNpcIds: string[]
  initiativeNpcIds: string[]
  dueThreadIds: string[]
  dueWorldEventIds: string[]
  dueProcessIds: string[]
  longUnchangedProcessIds: string[]
  legendReviewIds: string[]
  legendEcology: LegendEcologyAssessment
  strongCharacterEcology: StrongCharacterEcologyAssessment
  terminalThreadIds: string[]
  terminalWorldEventIds: string[]
}

export const CONTEXT_PROFILES: Record<NonNullable<CampaignSettings['contextProfile']>, ContextProfile> = {
  standard: { budgetChars: 180_000, recentMessages: 32, lore: 10, memories: 16, documents: 8, archives: 18 },
  long: { budgetChars: 900_000, recentMessages: 120, lore: 24, memories: 40, documents: 24, archives: 60 },
  // Консервативный предел для окна 1M: русский JSON и системные инструкции токенизируются
  // заметно плотнее обычного английского текста. Остаток нужен для планирования, repair-циклов
  // и длинного ответа, поэтому retrieval не пытается занять окно целиком.
  million: { budgetChars: 1_600_000, recentMessages: 260, lore: 48, memories: 96, documents: 64, archives: 160 },
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
  const querySet = new Set(query)
  const haystack = new Set(tokenize(content))
  if (!haystack.size) return 0
  let hits = 0
  querySet.forEach((word) => {
    if ([...haystack].some((candidate) => softTokenEqual(word, candidate))) hits += 1
  })
  // The query intentionally includes recent history and grows broad over time. Dividing
  // only by its length made a precise old fact disappear in a long campaign.
  return hits / Math.min(querySet.size, haystack.size)
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
  const ranked = memories
    .map((memory) => ({
      memory,
      relevance: tokenOverlap(queryTokens, `${memory.content} ${memory.tags.join(' ')}`),
      score:
        tokenOverlap(queryTokens, `${memory.content} ${memory.tags.join(' ')}`) * 100 +
        memory.importance / 5 +
        (memory.pinned ? 250 : 0) +
        Math.max(0, 16 - latestTurn + memory.turn) * 0.5,
    }))
  const matched = ranked.filter(({ memory, relevance }) => memory.pinned || relevance >= 0.18)
  // A vague "continue" still receives a small continuity tail, without flooding the
  // prompt with dozens of unrelated high-importance memories.
  const continuityTailSize = Math.min(limit, Math.max(1, Math.ceil(limit * 0.12)))
  const continuityTail = ranked
    .filter(({ memory, relevance }) => !memory.pinned && relevance < 0.18)
    .sort((a, b) => b.memory.turn - a.memory.turn || b.memory.importance - a.memory.importance)
    .slice(0, continuityTailSize)
  const seen = new Set<string>()
  return [...matched, ...continuityTail]
    .filter(({ memory }) => {
      if (seen.has(memory.id)) return false
      seen.add(memory.id)
      return true
    })
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
      relevance: tokenOverlap(queryTokens, `${archive.title} ${archive.summary} ${archive.tags.join(' ')} ${archive.entityIds.join(' ')}`),
      score:
        tokenOverlap(queryTokens, `${archive.title} ${archive.summary} ${archive.tags.join(' ')} ${archive.entityIds.join(' ')}`) * 120 +
        archive.importance / 5 +
        Math.max(0, 24 - latestTurn + archive.endTurn) * 0.3,
    }))
    .filter(({ relevance, archive }) => relevance >= 0.12 || archive.endTurn >= latestTurn - 8)
    .sort((a, b) => b.score - a.score || b.archive.endTurn - a.archive.endTurn)
    .slice(0, limit)
    .map(({ archive }) => archive)
}

export function selectRelevantChronicle(entries: WorldChronicleEntry[], queryText: string, limit = 24): WorldChronicleEntry[] {
  const queryTokens = tokenize(queryText)
  const latestTurn = entries.reduce((latest, entry) => Math.max(latest, entry.endTurn), 0)
  return entries
    .map((entry) => ({
      entry,
      relevance: tokenOverlap(queryTokens, `${entry.title} ${entry.summary} ${entry.outcome} ${entry.entityIds.join(' ')} ${entry.scopeIds.join(' ')} ${entry.causeIds.join(' ')}`),
      score:
        tokenOverlap(queryTokens, `${entry.title} ${entry.summary} ${entry.outcome} ${entry.entityIds.join(' ')} ${entry.scopeIds.join(' ')} ${entry.causeIds.join(' ')}`) * 140 +
        entry.importance / 4 +
        Math.max(0, 32 - latestTurn + entry.endTurn) * 0.3,
    }))
    .filter(({ relevance, entry }) => relevance >= 0.12 || entry.endTurn >= latestTurn - 12)
    .sort((a, b) => b.score - a.score || b.entry.endTurn - a.entry.endTurn)
    .slice(0, limit)
    .map(({ entry }) => entry)
}

function paragraphExcerpt(content: string, edge: 'start' | 'end', limit = 180): string {
  const paragraphs = content.split(/\n\s*\n/u).map((value) => value.replace(/\s+/gu, ' ').trim()).filter(Boolean)
  const selected = edge === 'start' ? paragraphs[0] : paragraphs.at(-1)
  if (!selected) return ''
  return selected.length <= limit ? selected : `${selected.slice(0, limit - 1).trimEnd()}…`
}

function motifCount(messages: StoryMessage[], pattern: RegExp): number {
  return messages.reduce((count, message) => count + (pattern.test(message.content) ? 1 : 0), 0)
}

export function buildNarrativeFingerprint(messages: StoryMessage[]): NarrativeFingerprint {
  const recent = messages.filter((message) => message.role === 'assistant' && !message.failed).slice(-8)
  const motifs: Array<[string, RegExp]> = [
    ['«на мгновение» как универсальная пауза', /на (?:одно )?мгновение/iu],
    ['взгляд или глаза вместо действия', /(?:взгляд\p{L}*|глаз\p{L}*)/iu],
    ['дрогнувшая рука или сжатый кулак', /(?:дрогнул\p{L}*|кулак\p{L}*|сжал\p{L}* пальц\p{L}*)/iu],
    ['гром или мигание света как искусственная пунктуация', /(?:гром\p{L}*|молни\p{L}*|мигнул\p{L}*|мерцал\p{L}*|ламп\p{L}*)/iu],
    ['финал, где все смотрят или ждут героя', /(?:все|каждый|остальные)[^.!?\n]{0,80}(?:смотр\p{L}*|жд\p{L}*)/iu],
  ]
  return {
    recentOpenings: recent.map((message) => paragraphExcerpt(message.content, 'start')).filter(Boolean),
    recentClosings: recent.map((message) => paragraphExcerpt(message.content, 'end')).filter(Boolean),
    repeatedMotifs: motifs.filter(([, pattern]) => motifCount(recent, pattern) >= 2).map(([label]) => label),
    recentWordCounts: recent.map((message) => message.content.trim().split(/\s+/u).filter(Boolean).length),
  }
}

export function buildSimulationReview(campaign: Campaign): SimulationReview {
  const terminalThreadStatuses = new Set(['fulfilled', 'broken', 'resolved'])
  const presentNpcIds = new Set(campaign.scene.presentNpcIds)
  const processes = campaign.world.processes ?? []
  const legends = campaign.world.legends ?? []
  return {
    currentTurn: campaign.turn,
    offscreenNpcIds: campaign.npcs.filter((npc) => npc.status === 'active' && !presentNpcIds.has(npc.id)).map((npc) => npc.id),
    initiativeNpcIds: campaign.npcs.filter((npc) => npc.status === 'active' && !presentNpcIds.has(npc.id) && npc.initiative).map((npc) => npc.id),
    dueThreadIds: (campaign.threads ?? []).filter((thread) => !terminalThreadStatuses.has(thread.status.toLocaleLowerCase('ru-RU')) && thread.dueTurn !== undefined && thread.dueTurn <= campaign.turn).map((thread) => thread.id),
    dueWorldEventIds: (campaign.worldEvents ?? []).filter((event) => ['scheduled', 'due'].includes(event.status) && event.dueTurn !== undefined && event.dueTurn <= campaign.turn).map((event) => event.id),
    dueProcessIds: processes.filter((process) => ['active', 'stalled'].includes(process.status) && process.dueTurn !== undefined && process.dueTurn <= campaign.turn).map((process) => process.id),
    longUnchangedProcessIds: processes.filter((process) => ['active', 'stalled'].includes(process.status) && campaign.turn - process.lastAdvancedTurn >= 8).map((process) => process.id),
    legendReviewIds: legends.filter((legend) => (
      legend.stage === 'notable'
      || legend.stage === 'renowned'
      || ['living', 'returned', 'missing', 'sealed', 'dormant'].includes(legend.lifeStatus)
    ) && campaign.turn - Math.max(legend.lastChangedTurn, legend.emergence.lastEvaluatedTurn, legend.currentState.lastUpdatedTurn) >= 6).map((legend) => legend.id),
    legendEcology: assessLegendEcology(legends),
    strongCharacterEcology: assessStrongCharacterEcology(campaign.npcs),
    terminalThreadIds: (campaign.threads ?? []).filter((thread) => terminalThreadStatuses.has(thread.status.toLocaleLowerCase('ru-RU'))).map((thread) => thread.id),
    terminalWorldEventIds: (campaign.worldEvents ?? []).filter((event) => ['resolved', 'cancelled'].includes(event.status)).map((event) => event.id),
  }
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
  // Retrieval needs precise anchors, not the whole tail as one ever-growing bag of words.
  const recentText = recentMessages.slice(-10).map((message) => message.content.slice(0, 4_000)).join('\n')
  const sceneAnchors = campaign.scene.presentNpcIds
    .map((id) => campaign.npcs.find((npc) => npc.id === id)?.name)
    .filter(Boolean)
    .join(' ')
  const activeQuestAnchors = campaign.quests.filter((quest) => quest.status === 'active').map((quest) => quest.title).join(' ')
  const query = `${campaign.scene.location} ${sceneAnchors} ${activeQuestAnchors} ${input} ${recentText}`
  const lore = selectRelevantLore(campaign.lore, query, profile.lore, campaign)
  const memories = selectRelevantMemories(campaign.memories, query, profile.memories)
  const documents = selectRelevantDocumentChunks(campaign.documents ?? [], query, profile.documents)
  const archives = selectRelevantArchives(campaign.archives ?? [], query, profile.archives)
  const chronicle = selectRelevantChronicle(campaign.world.chronicle ?? [], query, profile.archives)
  const estimatedChars = recentMessages.reduce((sum, message) => sum + message.content.length, 0) +
    lore.reduce((sum, entry) => sum + entry.content.length, 0) +
    memories.reduce((sum, entry) => sum + entry.content.length, 0) +
    documents.reduce((sum, entry) => sum + entry.text.length, 0) +
    archives.reduce((sum, entry) => sum + entry.summary.length, 0)
    + chronicle.reduce((sum, entry) => sum + entry.summary.length + entry.outcome.length, 0)
  return {
    profileName,
    budgetChars: profile.budgetChars,
    estimatedChars,
    recentMessages,
    lore,
    memories,
    documents,
    archives,
    chronicle,
    narrativeFingerprint: buildNarrativeFingerprint(campaign.messages),
    simulationReview: buildSimulationReview(campaign),
  }
}
