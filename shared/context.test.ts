import { describe, expect, it } from 'vitest'
import { buildContextSelection, buildNarrativeFingerprint, buildSimulationReview, selectRelevantArchives, selectRelevantChronicle, selectRelevantLore, selectRelevantMemories, tokenize } from './context'
import type { LoreEntry, MemoryEntry } from './types'
import { createDemoCampaign } from '../src/lib/demo'

const lore = (overrides: Partial<LoreEntry>): LoreEntry => ({
  id: crypto.randomUUID(), title: 'Запись', type: 'history', content: 'Нейтральный факт', keys: [],
  enabled: true, alwaysOn: false, secret: false, discovered: true, priority: 50, ...overrides,
})

describe('context retrieval', () => {
  it('normalizes russian text and removes common stop words', () => {
    expect(tokenize('Я иду в старую Обсерваторию!')).toEqual(['иду', 'старую', 'обсерваторию'])
  })

  it('always includes pinned lore and activates exact keys', () => {
    const pinned = lore({ id: 'pinned', title: 'Закон', alwaysOn: true })
    const clock = lore({ id: 'clock', title: 'Часы', content: 'Часы идут назад', keys: ['нулевой час'] })
    const irrelevant = lore({ id: 'other', title: 'Рыбацкий порт', content: 'Море и лодки', keys: ['порт'] })
    const result = selectRelevantLore([irrelevant, clock, pinned], 'Я осматриваю механизм нулевого часа')
    expect(result.map((entry) => entry.id)).toEqual(['pinned', 'clock'])
  })

  it('does not leak disabled lore into context', () => {
    const disabled = lore({ id: 'secret', keys: ['тайна'], alwaysOn: true, enabled: false })
    expect(selectRelevantLore([disabled], 'Раскрой тайну')).toHaveLength(0)
  })

  it('ranks relevant and important memories', () => {
    const memories: MemoryEntry[] = [
      { id: 'a', kind: 'fact', content: 'Мира дала обещание Эрену', tags: ['Мира'], importance: 80, turn: 2, createdAt: new Date().toISOString() },
      { id: 'b', kind: 'fact', content: 'На рынке продают яблоки', tags: ['рынок'], importance: 10, turn: 4, createdAt: new Date().toISOString() },
    ]
    expect(selectRelevantMemories(memories, 'Спрашиваю Миру об обещании', 1)[0].id).toBe('a')
  })

  it('keeps a precise old memory retrievable inside a broad long-story query', () => {
    const filler = Array.from({ length: 140 }, (_, index) => `случайная-тема-${index}`).join(' ')
    const memories: MemoryEntry[] = [
      { id: 'old-relevant', kind: 'promise', content: 'Мира обещала вернуть латунный компас после оттепели.', tags: ['Мира', 'компас'], importance: 45, turn: 4, createdAt: new Date().toISOString() },
      { id: 'new-unrelated', kind: 'fact', content: 'Коронация в Южном царстве завершилась.', tags: ['коронация'], importance: 100, turn: 90, createdAt: new Date().toISOString() },
    ]
    expect(selectRelevantMemories(memories, `${filler} Где латунный компас Миры?`, 1)[0].id).toBe('old-relevant')
  })

  it('recalls an old archive by meaning without injecting every archive', () => {
    const archives = [
      { id: 'observatory', kind: 'chapter' as const, title: 'Восьмое окно', summary: 'Мира и Эрен запечатали механизм Обсерватории.', startTurn: 20, endTurn: 31, tags: ['Мира', 'Обсерватория'], entityIds: ['mira'], importance: 90, createdAt: new Date().toISOString() },
      { id: 'market', kind: 'scene' as const, title: 'Покупка хлеба', summary: 'Герой купил хлеб на рынке.', startTurn: 40, endTurn: 42, tags: ['рынок'], entityIds: [], importance: 10, createdAt: new Date().toISOString() },
    ]
    expect(selectRelevantArchives(archives, 'Что Мира сделала в Обсерватории?', 1)[0].id).toBe('observatory')
  })

  it('keeps the causal chronicle relevant and bounded in very long campaigns', () => {
    const chronicle = Array.from({ length: 240 }, (_, index) => ({
      id: `chronicle-${index}`, sourceId: `source-${index}`, kind: 'event' as const,
      title: `Караван ${index}`, summary: `Караван ${index} изменил снабжение северного порта.`, outcome: `Поставки ${index} завершены.`,
      scale: 'regional' as const, scopeIds: ['north-port'], causeIds: [], entityIds: [], visibility: 'known' as const,
      startTurn: index, endTurn: index, importance: 50, createdAt: new Date().toISOString(),
    }))
    const selected = selectRelevantChronicle(chronicle, 'Что изменило снабжение северного порта?', 24)
    expect(selected).toHaveLength(24)
    expect(selected.every((entry) => entry.summary.includes('снабжение'))).toBe(true)
  })

  it('uses the million profile while keeping recent verbatim history bounded', () => {
    const campaign = createDemoCampaign()
    campaign.settings.contextProfile = 'million'
    campaign.messages = Array.from({ length: 600 }, (_, index) => ({ id: String(index), role: index % 2 ? 'assistant' as const : 'user' as const, content: `Сообщение ${index}`, turn: index, createdAt: new Date().toISOString() }))
    const selection = buildContextSelection(campaign, 'Продолжить')
    expect(selection.recentMessages).toHaveLength(260)
    expect(selection.budgetChars).toBe(1_600_000)
  })

  it('exposes repeated prose habits as negative-reference context', () => {
    const messages = Array.from({ length: 3 }, (_, index) => ({
      id: `assistant-${index}`, role: 'assistant' as const, turn: index, createdAt: new Date().toISOString(),
      content: `На мгновение лампа мигает. Его взгляд становится тяжелее.\n\nВсе смотрят на тебя и ждут.`,
    }))
    const fingerprint = buildNarrativeFingerprint(messages)
    expect(fingerprint.recentOpenings).toHaveLength(3)
    expect(fingerprint.recentClosings[0]).toContain('Все смотрят')
    expect(fingerprint.repeatedMotifs).toEqual(expect.arrayContaining([
      '«на мгновение» как универсальная пауза',
      'взгляд или глаза вместо действия',
      'гром или мигание света как искусственная пунктуация',
      'финал, где все смотрят или ждут героя',
    ]))
  })

  it('builds an explicit review queue without claiming that overdue state auto-resolves', () => {
    const campaign = createDemoCampaign()
    campaign.turn = 12
    campaign.threads = [{ id: 'due-thread', type: 'promise', title: 'Обещание', detail: 'Срок настал.', participantIds: [], status: 'active', dueTurn: 10, secret: false, createdTurn: 1 }]
    campaign.worldEvents = [{ id: 'due-event', title: 'Караван', description: 'Караван должен прибыть.', dueTurn: 11, status: 'scheduled', visibility: 'known', involvedIds: [], createdTurn: 2 }]
    campaign.world.legends = [{
      id: 'legend-review', name: 'Живой свидетель', aliases: [], titles: [], role: 'Проводник', summary: 'Сохраняет старый путь.',
      origin: 'Север', era: 'Нынешняя эпоха', stage: 'renowned', lifeStatus: 'living', scope: 'regional', truthStatus: 'confirmed',
      renown: 45, influence: 30, reputation: 'Известен проводникам.', knownFeats: [], disputedClaims: [], associatedFactionNames: [],
      relatedNpcIds: [], successorNpcIds: [], deeds: [], myths: [], legacies: [],
      currentState: { activity: 'Идёт по пути.', objective: 'Сохранить дорогу.', mobility: 'Пешком.', encounterReadiness: 0, encounterConditions: [], blockers: [], signs: [], lastConfirmedAt: 'Недавно', lastUpdatedTurn: 2 },
      emergence: { momentum: 20, nextMilestone: 'Новый путь', qualifyingSigns: [], disqualifiers: [], lastEvaluatedTurn: 2 },
      canon: { status: 'original', source: 'Кампания', continuity: 'Основная', anchorFacts: [], forbiddenContradictions: [], divergenceNotes: [] },
      discovery: { visibility: 'known', awareness: 20, revealedSections: ['identity'], evidence: [], updatedTurn: 2 },
      createdTurn: 1, lastChangedTurn: 2,
    }]
    const review = buildSimulationReview(campaign)
    expect(review.dueThreadIds).toEqual(['due-thread'])
    expect(review.dueWorldEventIds).toEqual(['due-event'])
    expect(review.legendReviewIds).toEqual(['legend-review'])
    expect(review.legendEcology.healthy).toBe(false)
    expect(review.legendEcology.deficits).toEqual(expect.arrayContaining([expect.objectContaining({ key: 'total', current: 1, target: 10 })]))
    expect(review.strongCharacterEcology.healthy).toBe(false)
    expect(review.strongCharacterEcology.counts.total).toBe(0)
    expect(review.currentTurn).toBe(12)
  })
})
