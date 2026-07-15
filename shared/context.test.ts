import { describe, expect, it } from 'vitest'
import { buildContextSelection, selectRelevantArchives, selectRelevantLore, selectRelevantMemories, tokenize } from './context'
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

  it('recalls an old archive by meaning without injecting every archive', () => {
    const archives = [
      { id: 'observatory', kind: 'chapter' as const, title: 'Восьмое окно', summary: 'Мира и Эрен запечатали механизм Обсерватории.', startTurn: 20, endTurn: 31, tags: ['Мира', 'Обсерватория'], entityIds: ['mira'], importance: 90, createdAt: new Date().toISOString() },
      { id: 'market', kind: 'scene' as const, title: 'Покупка хлеба', summary: 'Герой купил хлеб на рынке.', startTurn: 40, endTurn: 42, tags: ['рынок'], entityIds: [], importance: 10, createdAt: new Date().toISOString() },
    ]
    expect(selectRelevantArchives(archives, 'Что Мира сделала в Обсерватории?', 1)[0].id).toBe('observatory')
  })

  it('uses the million profile while keeping recent verbatim history bounded', () => {
    const campaign = createDemoCampaign()
    campaign.settings.contextProfile = 'million'
    campaign.messages = Array.from({ length: 600 }, (_, index) => ({ id: String(index), role: index % 2 ? 'assistant' as const : 'user' as const, content: `Сообщение ${index}`, turn: index, createdAt: new Date().toISOString() }))
    const selection = buildContextSelection(campaign, 'Продолжить')
    expect(selection.recentMessages).toHaveLength(260)
    expect(selection.budgetChars).toBe(2_800_000)
  })
})
