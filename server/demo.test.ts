import { describe, expect, it } from 'vitest'
import { createDemoCampaign } from '../src/lib/demo'
import { demoTurn, demoWorld } from './demo'
import { generatedWorldSchema } from './schemas'
import { normalizeWorld } from './world-normalizer'

describe('demo storyteller contract', () => {
  it('returns narrative, suggestions and structured state updates', () => {
    const campaign = createDemoCampaign()
    const response = demoTurn(campaign, 'Я осматриваю механизм часов под куполом')
    expect(response.narrative.length).toBeGreaterThan(200)
    expect(response.suggestions).toHaveLength(3)
    expect(response.statePatch.inventory?.[0].operation).toBe('add')
    expect(response.statePatch.inventory?.[0].item?.name).toMatch(/Зубец/)
  })

  it('generates a world-specific system and presentation contract', () => {
    const request = {
      inspiration: 'Город живых созвездий', genre: 'Фэнтези', tone: 'Таинственный', characterName: 'Эрен',
      characterConcept: 'Искатель имён', opening: 'Ночной вокзал', canonMode: 'original', contentBoundaries: '',
      provider: { provider: 'demo', model: 'demo', baseUrl: '', temperature: 0.8 },
    } as const
    const generated = demoWorld(request)

    const parsed = generatedWorldSchema.parse(generated)
    expect(parsed.world.system.equipmentSlots.length).toBeGreaterThan(0)
    expect(parsed.world.presentation.labels.inventory).toBeTruthy()
    expect(parsed.world.presentation.accent).toMatch(/^#[0-9a-f]{6}$/i)
    expect(parsed.world.places.length).toBeGreaterThanOrEqual(8)
    expect(parsed.world.processes.length).toBeGreaterThanOrEqual(3)
    expect(parsed.world.factions.every((faction) => Boolean(faction.kind && faction.headquarters && faction.reach))).toBe(true)
    const campaign = normalizeWorld(parsed, request)
    expect(campaign.player.abilities.flatMap((ability) => ability.techniques ?? [])).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Вопрос памяти', id: expect.any(String) })]))
    expect(campaign.npcs.flatMap((npc) => npc.abilities ?? []).flatMap((ability) => ability.techniques ?? [])).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Контрсценарий', id: expect.any(String) })]))
    const child = campaign.world.places?.find((place) => place.name === 'Пограничный квартал')
    expect(campaign.world.places?.find((place) => place.id === child?.parentId)?.name).toBe('Столица Семи')
    expect(campaign.world.processes?.every((process) => process.scopeIds.every((scopeId) => campaign.world.places?.some((place) => place.id === scopeId)))).toBe(true)
  })

  it('lets the AI create a world without sentient items and omits mental fields from inert relics', () => {
    const raw: any = demoWorld({
      inspiration: 'Археологическая научная фантастика', genre: 'Экспедиция', tone: 'Сдержанный', characterName: 'Ина',
      characterConcept: 'Ксенотехнолог', opening: 'Находка модуля', canonMode: 'original', contentBoundaries: '',
      provider: { provider: 'demo', model: 'demo', baseUrl: '', temperature: 0.8 },
    })
    raw.inventory.forEach((item: any) => {
      if (!item.artifact) return
      item.artifact.sentient = false
      delete item.artifact.personality
      delete item.artifact.desire
      delete item.artifact.taboo
      delete item.artifact.mood
      delete item.artifact.voice
    })

    const parsed = generatedWorldSchema.parse(raw)
    expect(parsed.inventory.some((item) => item.artifact?.sentient)).toBe(false)
  })

  it('rejects personality fields when the AI marks an item as non-sentient', () => {
    const raw: any = demoWorld({
      inspiration: 'Мир без живых вещей', genre: 'Фэнтези', tone: 'Сдержанный', characterName: 'Ина',
      characterConcept: 'Архивист', opening: 'Находка реликвии', canonMode: 'original', contentBoundaries: '',
      provider: { provider: 'demo', model: 'demo', baseUrl: '', temperature: 0.8 },
    })
    const artifact = raw.inventory.find((item: any) => item.artifact).artifact
    artifact.sentient = false
    artifact.personality = 'Это поле не должно существовать.'

    expect(() => generatedWorldSchema.parse(raw)).toThrow(/Non-sentient items must omit personality/)
  })

  it('accepts DeepSeek null optionals and numeric strings without inventing values', () => {
    const raw: any = demoWorld({
      inspiration: 'Мир шиноби', genre: 'Приключение', tone: 'Серьёзный', characterName: 'Акира',
      characterConcept: 'Странник', opening: 'Экзамен', canonMode: 'flexible', contentBoundaries: '',
      provider: { provider: 'demo', model: 'demo', baseUrl: '', temperature: 0.8 },
    })
    raw.threads.forEach((thread: any) => { thread.dueTurn = null })
    raw.lore = raw.lore.slice(0, 2)
    raw.opening.scene.tension = '42'
    raw.world.routes[0].danger = '61'

    const parsed = generatedWorldSchema.parse(raw)
    expect(parsed.threads.every((thread) => thread.dueTurn === undefined)).toBe(true)
    expect(parsed.lore).toHaveLength(2)
    expect(parsed.opening.scene.tension).toBe(42)
    expect(parsed.world.routes[0].danger).toBe(61)
  })

  it('preserves DeepSeek scalar currency and decorated numeric tension', () => {
    const raw: any = demoWorld({
      inspiration: 'Архипелаг разумных штормов', genre: 'Политическое фэнтези', tone: 'Напряжённый', characterName: 'Лиор',
      characterConcept: 'Картограф', opening: 'Переговоры в маяке', canonMode: 'original', contentBoundaries: '',
      provider: { provider: 'demo', model: 'demo', baseUrl: '', temperature: 0.8 },
    })
    raw.player.currency = 37
    raw.opening.scene.tension = 'Высокое: 68%'

    const parsed = generatedWorldSchema.parse(raw)
    expect(parsed.player.currency).toEqual({ currency: 37 })
    expect(parsed.opening.scene.tension).toBe(68)
  })

  it('preserves world-specific relationship and thread labels while translating visibility', () => {
    const raw: any = demoWorld({
      inspiration: 'Политический мир шиноби', genre: 'Драма', tone: 'Серьёзный', characterName: 'Акира',
      characterConcept: 'Дипломат', opening: 'Совет кланов', canonMode: 'flexible', contentBoundaries: '',
      provider: { provider: 'demo', model: 'demo', baseUrl: '', temperature: 0.8 },
    })
    raw.socialLinks = [
      { fromNpcName: 'Рин Астэр', toNpcName: 'Рин Астэр', kind: 'деловые', label: 'Вынужденное сотрудничество', score: '12', secret: false, notes: [] },
    ]
    raw.worldEvents[0].visibility = 'слухи'
    raw.threads[0].type = 'quest'
    raw.threads[0].status = 'активно'

    const parsed = generatedWorldSchema.parse(raw)
    expect(parsed.socialLinks[0].kind).toBe('деловые')
    expect(parsed.worldEvents[0].visibility).toBe('rumored')
    expect(parsed.threads[0]).toMatchObject({ type: 'quest', status: 'активно' })
  })

  it('rejects ability costs that cannot be paid by any generated resource', () => {
    const raw: any = demoWorld({
      inspiration: 'Мир строгой алхимии', genre: 'Фэнтези', tone: 'Серьёзный', characterName: 'Ина',
      characterConcept: 'Алхимик', opening: 'Лаборатория', canonMode: 'original', contentBoundaries: '',
      provider: { provider: 'demo', model: 'demo', baseUrl: '', temperature: 0.8 },
    })
    raw.player.abilities[0].costs = [{ resource: 'несуществующий-ресурс', amount: 3 }]

    expect(() => generatedWorldSchema.parse(raw)).toThrow(/unknown resource key/i)
  })
})
