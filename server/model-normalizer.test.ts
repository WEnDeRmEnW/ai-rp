import { describe, expect, it } from 'vitest'
import { demoWorld } from './demo'
import { normalizeModelOutput, normalizeTurnPatch } from './model-normalizer'
import { continuityReviewSchema, generatedWorldSchema, memoryCuratorSchema, turnPatchSchema, turnPlanSchema } from './schemas'

const worldRequest = {
  inspiration: 'Архипелаг разумных штормов', genre: 'Политическое фэнтези', tone: 'Напряжённый', characterName: 'Лиор',
  characterConcept: 'Независимый картограф', opening: 'Переговоры в маяке', canonMode: 'original' as const, contentBoundaries: '',
  provider: { provider: 'demo' as const, model: 'demo', baseUrl: '', temperature: 0.8 },
}

describe('global DeepSeek output normalization', () => {
  it('flattens DeepSeek grouped mutations without turning update into an NPC name', () => {
    const parsed = turnPatchSchema.parse({
      npcs: {
        update: {
          id: 'npc-cybernetic',
          currentGoal: 'Проверить нейронный резонанс героя',
          disposition: 'Сосредоточен',
          resourceDeltas: { health: '-3' },
        },
      },
      inventory: {
        update: {
          implant: { state: 'damaged', quantity: '1' },
        },
      },
      quests: { complete: { 'quest-resonance': true } },
      threads: {
        update: {
          'thread-neural': { detail: 'Кибернетик заметил новую нестабильность.' },
          'thread-corp': { detail: 'Корпорация начала готовить ответ.' },
        },
      },
      worldEvents: {
        update: [{ id: 'event-scan', description: 'Сканирование перешло в активную фазу.' }],
      },
    })

    expect(parsed.npcs).toEqual([{
      operation: 'update',
      targetId: 'npc-cybernetic',
      npc: {
        currentGoal: 'Проверить нейронный резонанс героя',
        disposition: 'Сосредоточен',
        resourceDeltas: { health: -3 },
      },
    }])
    expect(parsed.npcs?.[0]?.npc).not.toHaveProperty('name')
    expect(parsed.inventory).toEqual([{ operation: 'update', targetId: 'implant', item: { state: 'damaged', quantity: 1 } }])
    expect(parsed.quests).toEqual([{ operation: 'complete', targetId: 'quest-resonance' }])
    expect(parsed.threads).toHaveLength(2)
    expect(parsed.threads?.map((entry) => entry.targetId)).toEqual(['thread-neural', 'thread-corp'])
    expect(parsed.worldEvents).toEqual([{
      operation: 'update', targetId: 'event-scan', event: { description: 'Сканирование перешло в активную фазу.' },
    }])
  })

  it('canonicalizes patch scene and preserves absolute faction reputation entries', () => {
    const normalized = normalizeModelOutput({
      statePatch: {
        currentScene: { tension: '90%', weather: 'Ash' },
        factionReputation: [{
          factionName: 'Ash Crows',
          value: '-20 points',
          label: 'Hostile',
          notes: ['The leader was humiliated'],
        }],
      },
    }) as any

    expect(normalized.statePatch).not.toHaveProperty('currentScene')
    expect(normalized.statePatch).not.toHaveProperty('factionReputation')
    expect(normalized.statePatch.scene).toEqual({ tension: 90, weather: 'Ash' })
    expect(normalized.statePatch.upsertFactionReputation).toEqual([{
      factionName: 'Ash Crows', value: -20, label: 'Hostile', notes: ['The leader was humiliated'],
    }])
    expect(normalized.statePatch).not.toHaveProperty('factionReputationDeltas')

    expect(normalizeTurnPatch({ factionReputation: { 'Ash Crows': -20 } })).toEqual({
      upsertFactionReputation: [{ factionName: 'Ash Crows', value: -20 }],
    })
  })

  it('keeps explicit faction changes as deltas and canonical values authoritative', () => {
    const normalized = normalizeModelOutput({
      statePatch: {
        factionReputationChanges: [
          { faction: 'Ash Crows', delta: '-5' },
          { factionName: 'Wardens', change: '+3' },
        ],
        factionReputationDeltas: { Wardens: 4 },
      },
    }) as any

    expect(normalized.statePatch.factionReputationDeltas).toEqual({ 'Ash Crows': -5, Wardens: 4 })
  })

  it('splits ability history arrays without duplicating the actual mutation', () => {
    const raw = {
      abilityChanges: [{
        targetId: 'ability-1',
        masteryChange: '3%',
        history: [
          { id: 'server-id-1', turn: 3, createdAt: 'now', title: 'First use', description: 'Moved faster.' },
          { id: 'server-id-2', turn: 3, title: 'Second use', description: 'Disarmed the enemy.' },
        ],
      }],
    }
    const once = normalizeModelOutput(raw) as any
    const twice = normalizeModelOutput(once) as any

    expect(once).toEqual(twice)
    expect(once.abilityChanges).toEqual([
      { abilityId: 'ability-1', masteryDelta: 3, history: { title: 'First use', description: 'Moved faster.' } },
      { abilityId: 'ability-1', history: { title: 'Second use', description: 'Disarmed the enemy.' } },
    ])
  })

  it('does not confuse absolute ability mastery with a delta', () => {
    const normalized = normalizeModelOutput({
      abilityChanges: [{ id: 'ability-1', mastery: '40%' }],
    }) as any

    expect(normalized.abilityChanges).toEqual([{ abilityId: 'ability-1', mastery: 40 }])
  })

  it('preserves artifact absolutes, maps targeted power mastery and keeps every history entry', () => {
    const normalized = normalizeModelOutput({
      artifactChanges: [{
        artifactId: 'artifact-1',
        powerMastery: '3%',
        attunement: '50%',
        bond: '30%',
        history: [
          { title: 'Combat use', description: 'Activated in an ambush.', id: 'history-1', turn: 3 },
          { label: 'Aftershock', detail: 'The implant cooled down.', createdAt: 'now' },
        ],
      }, {
        itemId: 'artifact-2',
        powerMasteries: [
          { powerId: 'power-a', masteryDelta: '2%' },
          { id: 'power-b', value: '-1' },
        ],
      }],
    }) as any

    expect(normalized.artifactChanges).toEqual([
      {
        itemId: 'artifact-1', mastery: 3, attunement: 50, bond: 30,
        history: { title: 'Combat use', description: 'Activated in an ambush.' },
      },
      { itemId: 'artifact-1', history: { title: 'Aftershock', description: 'The implant cooled down.' } },
      { itemId: 'artifact-2', powerMasteryDeltas: { 'power-a': 2, 'power-b': -1 } },
    ])
  })

  it('removes only server-owned metadata from authored patch memories', () => {
    const normalized = normalizeModelOutput({
      statePatch: {
        memories: [{
          id: 'server-memory', turn: 3, createdAt: 'now',
          kind: 'fact', content: 'The ambush happened.', tags: ['ambush'], importance: 80,
          pinned: true, source: 'authored detail',
        }],
      },
    }) as any

    expect(normalized.statePatch.memories[0]).toEqual({
      kind: 'fact', content: 'The ambush happened.', tags: ['ambush'], importance: 80,
      pinned: true, source: 'authored detail',
    })

    const singular = normalizeModelOutput({
      memories: { kind: 'fact', content: 'One memory.', tags: ['one'], importance: 50 },
    }) as any
    expect(singular.memories).toEqual([{ kind: 'fact', content: 'One memory.', tags: ['one'], importance: 50 }])
  })

  it('keeps a valid singular progression history object singular', () => {
    const normalized = normalizeModelOutput({
      abilityChanges: [{ abilityId: 'ability-1', history: { title: 'Use', description: 'It worked.' } }],
      artifactChanges: [{ itemId: 'artifact-1', history: { title: 'Pulse', description: 'It answered.' } }],
    }) as any

    expect(normalized.abilityChanges[0].history).toEqual({ title: 'Use', description: 'It worked.' })
    expect(normalized.artifactChanges[0].history).toEqual({ title: 'Pulse', description: 'It answered.' })
  })

  it('normalizes DeepSeek positional progression history tuples without retaining server metadata', () => {
    const normalized = normalizeTurnPatch({
      abilityChanges: [{
        abilityId: 'ability-sandevistan',
        history: [
          'Боевое применение в засаде',
          'Использовал сандевистан, чтобы обезвредить Ворона, сломав ему палец и продемонстрировав превосходство.',
          'history_ability_001',
          3,
        ],
      }],
      artifactChanges: [{
        itemId: 'item-sandevistan',
        history: [
          ['Первая перегрузка', 'Имплант выдержал предельное ускорение.', 'history_artifact_001', 3],
          ['Остывание', 'Система безопасно сбросила накопленное тепло.'],
        ],
      }],
    }) as any

    expect(normalized.abilityChanges).toEqual([{
      abilityId: 'ability-sandevistan',
      history: {
        title: 'Боевое применение в засаде',
        description: 'Использовал сандевистан, чтобы обезвредить Ворона, сломав ему палец и продемонстрировав превосходство.',
      },
    }])
    expect(normalized.artifactChanges).toEqual([
      { itemId: 'item-sandevistan', history: { title: 'Первая перегрузка', description: 'Имплант выдержал предельное ускорение.' } },
      { itemId: 'item-sandevistan', history: { title: 'Остывание', description: 'Система безопасно сбросила накопленное тепло.' } },
    ])
  })

  it('normalizes decorated numbers, booleans, colors, records and Russian enums in a generated world', () => {
    const raw: any = demoWorld(worldRequest)
    raw.player.currency = '37 штормовых марок'
    raw.opening.scene.tension = 'опасность: 81%'
    raw.world.presentation.accent = '#abc'
    raw.world.presentation.accentStrong = '11aa77'
    raw.world.presentation.secondary = 'rgb(12, 34, 56)'
    raw.world.presentation.surface = 'магический'
    raw.world.routes[0].danger = '61 из 100'
    raw.world.routes[0].discovered = 'нет'
    raw.inventory[0].quantity = '2 шт.'
    raw.inventory[0].equipped = 'да'
    raw.inventory[0].category = 'оружие'
    raw.inventory[0].rarity = 'редкий'
    raw.lore[0].alwaysOn = 'да'
    raw.lore[0].secret = 'нет'
    raw.lore[0].discovered = 1
    raw.lore[0].priority = '90/100'
    raw.player.stats = Object.fromEntries(raw.player.stats.map(({ key, ...stat }: any) => [key, stat]))
    raw.npcs = Object.fromEntries(raw.npcs.map(({ name, ...npc }: any) => [name, npc]))
    raw.worldEvents = Object.fromEntries(raw.worldEvents.map(({ title, ...event }: any) => [title, { ...event, visibility: 'слухи' }]))

    const parsed = generatedWorldSchema.parse(raw)
    expect(parsed.player.currency).toEqual({ 'штормовых марок': 37 })
    expect(parsed.opening.scene.tension).toBe(81)
    expect(parsed.world.presentation).toMatchObject({ accent: '#aabbcc', accentStrong: '#11aa77', secondary: '#0c2238', surface: 'arcane' })
    expect(parsed.world.routes[0]).toMatchObject({ danger: 61, discovered: false })
    expect(parsed.inventory[0]).toMatchObject({ quantity: 2, equipped: true, category: 'weapon', rarity: 'rare' })
    expect(parsed.player.stats[0].key).toBeTruthy()
    expect(parsed.npcs[0].name).toBeTruthy()
    expect(parsed.worldEvents[0]).toMatchObject({ visibility: 'rumored' })
    expect(parsed.lore[0]).toMatchObject({ alwaysOn: true, secret: false, discovered: true, priority: 90 })
  })

  it('normalizes Russian critic fields and boolean strings', () => {
    const parsed = continuityReviewSchema.parse({
      chosen: 'б',
      pass: 'да',
      issues: [{ type: 'знания', detail: 'NPC знает лишнее.', severity: 'высокая' }],
      rewriteInstructions: '',
    })

    expect(parsed).toMatchObject({ chosen: 'b', pass: true })
    expect(parsed.issues[0]).toMatchObject({ type: 'knowledge', severity: 'high' })
  })

  it('normalizes object-shaped memory arrays, Russian kinds and numeric IDs', () => {
    const parsed = memoryCuratorSchema.parse({
      memories: {
        first: { kind: 'тайна', content: 'Шторм отвечает на обещания.', tags: 'шторм', importance: '80%' },
      },
      archives: {
        first: { kind: 'глава', title: 'Договор', summary: 'Герой потребовал условия.', startTurn: '0', endTurn: '4', tags: 'договор', entityIds: [123], importance: '90/100' },
      },
    })

    expect(parsed.memories[0]).toMatchObject({ kind: 'mystery', tags: ['шторм'], importance: 80 })
    expect(parsed.archives[0]).toMatchObject({ kind: 'chapter', startTurn: 0, endTurn: 4, entityIds: ['123'], importance: 90 })
  })

  it('normalizes Russian mutation operations and nested item values', () => {
    const parsed = turnPlanSchema.parse({
      outcome: 'Герой получает документ.',
      beats: 'NPC передаёт договор.',
      suggestions: ['Прочитать договор', 'Спросить о печати'],
      statePatch: {
        inventory: [{ operation: 'добавить', item: { name: 'Договор', description: 'Подписанный документ с условиями сделки.', category: 'квест', quantity: '1 шт.', rarity: 'обычный', equipped: 'нет', effects: 'Подтверждает условия' } }],
      },
    })

    expect(parsed.beats).toEqual(['NPC передаёт договор.'])
    expect(parsed.statePatch.inventory?.[0]).toMatchObject({
      operation: 'add', item: { category: 'quest', quantity: 1, rarity: 'common', equipped: false, effects: ['Подтверждает условия'] },
    })
  })
})
