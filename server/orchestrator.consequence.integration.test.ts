import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDemoCampaign } from '../src/lib/demo'
import { applyPatch } from '../src/lib/engine'
import { findNarrativeRepetitionIssues } from '../shared/narrative-repetition'
import { runTurn } from './orchestrator'

const consequenceDomains = [
  'health', 'resources', 'stats', 'conditions', 'inventory', 'equipment', 'abilities', 'artifacts',
  'currency', 'relationships', 'quests', 'characters', 'conflict', 'scene_time', 'world', 'world_pressure', 'knowledge',
] as const

const provider = {
  provider: 'ollama' as const,
  model: 'deepseek-v4-flash:cloud',
  baseUrl: 'https://ollama.com/v1',
  apiKey: 'test-key',
  temperature: 0.75,
}

type CompletionBody = {
  messages: Array<{ role: string; content: string }>
  response_format?: unknown
}

function providerResponse(content: string) {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function systemPrompt(body: CompletionBody) {
  return body.messages.find((message) => message.role === 'system')?.content ?? ''
}

afterEach(() => vi.unstubAllGlobals())

describe('runTurn consequence reconciliation', () => {
  it('adds damage and a persistent injury omitted by the director after auditing the final narrative', async () => {
    const finalNarrative = 'Клинок стража глубоко рассекает плечо Эрена. Кровь быстро пропитывает рукав, а раненая рука заметно слабеет.'
    const requestBodies: CompletionBody[] = []
    const auditBodies: CompletionBody[] = []

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as CompletionBody
      requestBodies.push(body)
      const system = systemPrompt(body)

      if (system.includes('скрытый симулятор живого мира')) {
        return providerResponse(JSON.stringify({ signals: [], statePatch: {} }))
      }
      if (system.includes('режиссёр и строгий распорядитель состояния')) {
        return providerResponse(JSON.stringify({
          outcome: 'Страж успевает нанести герою глубокую рану в плечо.',
          beats: ['Удар достигает цели.', 'Рана мешает свободно двигать рукой.'],
          suggestions: ['Отступить за колонну', 'Попытаться обезоружить стража'],
          statePatch: {},
        }))
      }
      if (system.includes('выдающийся ведущий живой текстовой ролевой игры')) {
        return providerResponse(finalNarrative)
      }
      if (system.includes('строгий редактор непротиворечивости')) {
        return providerResponse(JSON.stringify({ chosen: 'a', pass: true, issues: [], rewriteInstructions: '' }))
      }
      if (system.includes('последний обязательный аудитор причин и последствий')) {
        auditBodies.push(body)
        return providerResponse(JSON.stringify({
          pass: false,
          narrativePass: true,
          narrativeIssues: [],
          verifiedDomains: consequenceDomains,
          omissions: [
            {
              domain: 'health',
              evidence: 'Клинок глубоко рассекает плечо, и герой теряет кровь.',
              requiredChange: 'Снизить здоровье героя на четыре единицы.',
              resolutionPath: 'resourceDeltas.health',
              severity: 'high',
            },
            {
              domain: 'conditions',
              evidence: 'Раненая рука заметно слабеет.',
              requiredChange: 'Добавить устойчивую глубокую рану плеча.',
              resolutionPath: 'upsertStatusEffects',
              severity: 'medium',
            },
          ],
          statePatch: {
            resourceDeltas: { health: -4 },
            upsertStatusEffects: [{
              id: 'effect-shoulder-wound',
              name: 'Глубокая рана плеча',
              description: 'Кровоточащий порез ограничивает движения раненой руки.',
              category: 'injury',
              severity: 55,
              source: 'Удар клинком стража',
              effects: ['Затрудняет силовые действия раненой рукой', 'Продолжает кровоточить без перевязки'],
              stacks: 1,
              duration: { unit: 'until', condition: 'До перевязки и полноценного лечения' },
              appliedTurn: 1,
              hidden: false,
            }],
          },
        }))
      }
      if (system.includes('архивариус очень долгой ролевой кампании')) {
        return providerResponse(JSON.stringify({ memories: [], archives: [] }))
      }

      return new Response(`Unexpected completion stage: ${system.slice(0, 120)}`, { status: 418 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await runTurn({
      campaign: createDemoCampaign(),
      input: 'Я не успеваю уклониться от удара стража.',
      actionType: 'do',
      provider,
    })

    expect(result.narrative).toBe(finalNarrative)
    expect(result.statePatch.resourceDeltas).toMatchObject({ health: -4 })
    expect(result.statePatch.upsertStatusEffects).toEqual([
      expect.objectContaining({
        id: 'effect-shoulder-wound',
        category: 'injury',
        severity: 55,
        appliedTurn: 1,
        duration: { unit: 'until', condition: 'До перевязки и полноценного лечения' },
      }),
    ])

    expect(auditBodies).toHaveLength(1)
    const auditSystem = systemPrompt(auditBodies[0])
    const auditUser = auditBodies[0].messages.find((message) => message.role === 'user')?.content ?? ''
    expect(auditSystem).toContain('Проверь РОВНО один раз каждую область')
    consequenceDomains.forEach((domain) => expect(auditSystem).toContain(domain))
    expect(auditSystem).toContain(consequenceDomains.join(', '))
    expect(auditUser).toContain('ФИНАЛЬНАЯ СЦЕНА:')
    expect(auditUser).toContain(finalNarrative)

    expect(requestBodies.filter((body) => systemPrompt(body).includes('выдающийся ведущий'))).toHaveLength(2)
    expect(requestBodies.some((body) => systemPrompt(body).includes('аудитор свободы игрока'))).toBe(false)
    expect(requestBodies.some((body) => systemPrompt(body).includes('архивариус'))).toBe(true)
  })

  it('returns the turn while deterministically removing decisions invented for the player', async () => {
    const campaign = createDemoCampaign()
    campaign.settings.qualityMode = 'balanced'
    const playerName = campaign.player.name
    const requestedNarrative = `Мира кладёт на стол ключ от северных ворот и ждёт ответа.\n\n${playerName} решает принять её предложение, благодарит Миру и сразу выходит из комнаты.\n\nЗа дверью слышны быстрые шаги дозорного.`
    const requestBodies: CompletionBody[] = []

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as CompletionBody
      requestBodies.push(body)
      const system = systemPrompt(body)
      if (system.includes('скрытый симулятор живого мира')) return providerResponse(JSON.stringify({ signals: [], statePatch: {} }))
      if (system.includes('режиссёр и строгий распорядитель состояния')) return providerResponse(JSON.stringify({
        outcome: 'Мира предлагает герою ключ от северных ворот.',
        beats: ['Мира оставляет ключ на столе.', 'За дверью приближается дозорный.'],
        suggestions: ['Изучить ключ', 'Спросить Миру о дозорном'],
        statePatch: {},
      }))
      if (system.includes('выдающийся ведущий живой текстовой ролевой игры')) return providerResponse(requestedNarrative)
      if (system.includes('последний обязательный аудитор причин и последствий')) return providerResponse(JSON.stringify({
        pass: true,
        narrativePass: true,
        narrativeIssues: [],
        verifiedDomains: consequenceDomains,
        omissions: [],
        statePatch: {},
      }))
      if (system.includes('архивариус очень долгой ролевой кампании')) return providerResponse(JSON.stringify({ memories: [], archives: [] }))
      return new Response(`Unexpected completion stage: ${system.slice(0, 120)}`, { status: 418 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await runTurn({ campaign, input: 'Я молча смотрю на ключ.', actionType: 'do', provider })

    expect(result.narrative).toContain('Мира кладёт на стол ключ')
    expect(result.narrative).toContain('слышны быстрые шаги дозорного')
    expect(result.narrative).not.toContain('решает принять')
    expect(result.narrative).not.toContain('благодарит Миру')
    expect(requestBodies.some((body) => systemPrompt(body).includes('аудитор свободы игрока'))).toBe(false)
  })

  it('rewrites a scene that replaced a binding story direction, then audits the corrected prose again', async () => {
    const campaign = createDemoCampaign()
    campaign.settings.qualityMode = 'balanced'
    const wrongNarrative = 'Часы на вокзале внезапно переводят стрелки назад, и по куполу проходит синяя волна.'
    const correctedNarrative = 'Дротик тренировочной ловушки впивается Эрену в плечо. Удар отнимает три единицы здоровья, а из раны начинается кровотечение.'
    let auditCalls = 0
    let revisionCalls = 0

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as CompletionBody
      const system = systemPrompt(body)
      if (system.includes('скрытый симулятор живого мира')) return providerResponse(JSON.stringify({ signals: [], statePatch: {} }))
      if (system.includes('режиссёр и строгий распорядитель состояния')) return providerResponse(JSON.stringify({
        outcome: 'На вокзале происходит временное искажение.', beats: ['Стрелки часов идут назад.'], suggestions: ['Осмотреть часы', 'Позвать Миру'], statePatch: {},
      }))
      if (system.includes('выдающийся ведущий живой текстовой ролевой игры')) return providerResponse(wrongNarrative)
      if (system.includes('строгий редактор непротиворечивости')) return providerResponse(JSON.stringify({ chosen: 'a', pass: true, issues: [], rewriteInstructions: '' }))
      if (system.includes('финальный редактор текстовой RPG')) {
        revisionCalls += 1
        return providerResponse(correctedNarrative)
      }
      if (system.includes('последний обязательный аудитор причин и последствий')) {
        auditCalls += 1
        if (auditCalls === 1) return providerResponse(JSON.stringify({
          pass: false,
          narrativePass: false,
          narrativeIssues: [{ evidence: wrongNarrative, requirement: 'Показать заданные дротик, урон 3 и кровотечение.', instruction: 'Замени временное искажение попаданием дротика; явно покажи урон 3 и кровотечение на 2 хода.', severity: 'high' }],
          verifiedDomains: consequenceDomains,
          omissions: [
            { domain: 'health', evidence: 'Во вводе задан урон 3.', requiredChange: 'Снизить здоровье на 3.', resolutionPath: 'resourceDeltas.health', severity: 'high' },
            { domain: 'conditions', evidence: 'Во вводе задано кровотечение.', requiredChange: 'Добавить кровотечение на 2 хода.', resolutionPath: 'upsertStatusEffects', severity: 'high' },
          ],
          statePatch: {
            resourceDeltas: { health: -3 },
            upsertStatusEffects: [{ id: 'bleeding', name: 'Кровотечение', description: 'Рана от тренировочного дротика.', category: 'injury', severity: 35, source: 'Тренировочная ловушка', effects: ['Кровоточащая рана плеча'], stacks: 1, duration: { unit: 'turns', remaining: 2 }, appliedTurn: 1, hidden: false }],
          },
        }))
        return providerResponse(JSON.stringify({ pass: true, narrativePass: true, narrativeIssues: [], verifiedDomains: consequenceDomains, omissions: [], statePatch: {} }))
      }
      if (system.includes('архивариус очень долгой ролевой кампании')) return providerResponse(JSON.stringify({ memories: [], archives: [] }))
      return new Response(`Unexpected completion stage: ${system.slice(0, 120)}`, { status: 418 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await runTurn({
      campaign,
      input: 'Режиссёрское условие: дротик попадает в плечо, наносит ровно 3 урона здоровью и вызывает кровотечение на 2 хода.',
      actionType: 'story',
      provider,
    })

    expect(result.narrative).toBe(correctedNarrative)
    expect(result.statePatch.resourceDeltas).toEqual({ health: -3 })
    expect(result.statePatch.upsertStatusEffects?.[0]).toMatchObject({ id: 'bleeding', duration: { unit: 'turns', remaining: 2 } })
    expect(auditCalls).toBe(2)
    expect(revisionCalls).toBe(1)
  })

  it('canonicalizes live DeepSeek aliases before repair and preserves them through patch merging', async () => {
    const campaign = createDemoCampaign()
    const ability = campaign.player.abilities[0]
    let directorCalls = 0

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as CompletionBody
      const system = systemPrompt(body)
      if (system.includes('скрытый симулятор живого мира')) return providerResponse(JSON.stringify({ signals: [], statePatch: {} }))
      if (system.includes('режиссёр и строгий распорядитель состояния')) {
        directorCalls += 1
        return providerResponse(JSON.stringify({
          outcome: 'Противостояние стало личным.',
          beats: ['Лидер фракции унижен при подчинённых.'],
          suggestions: ['Отпустить лидера', 'Потребовать клятву'],
          statePatch: {
            currentScene: { tension: 90 },
            factionReputation: [{ factionName: 'Латунный хор', value: -20, label: 'Враждебность', notes: ['Лидер унижен при подчинённых.'] }],
            abilityChanges: [{ id: ability.id, mastery: 40, history: [
              { id: 'history-from-model', turn: 3, title: 'Боевое применение', description: 'Способность дала решающее преимущество.' },
              { id: 'history-from-model-2', turn: 3, title: 'Контроль', description: 'Герой точно остановил ускорение.' },
            ] }],
            memories: [{ id: 'model-memory-id', turn: 3, createdAt: '2026-07-14T00:00:00Z', kind: 'fact', content: 'Конфликт стал личным.', tags: ['конфликт'], importance: 80 }],
          },
        }))
      }
      if (system.includes('выдающийся ведущий живой текстовой ролевой игры')) return providerResponse('Лидер отступает, скрывая ярость от своих людей.')
      if (system.includes('строгий редактор непротиворечивости')) return providerResponse(JSON.stringify({ chosen: 'a', pass: true, issues: [], rewriteInstructions: '' }))
      if (system.includes('последний обязательный аудитор причин и последствий')) return providerResponse(JSON.stringify({ pass: true, narrativePass: true, narrativeIssues: [], verifiedDomains: consequenceDomains, omissions: [], statePatch: {} }))
      if (system.includes('архивариус очень долгой ролевой кампании')) return providerResponse(JSON.stringify({ memories: [], archives: [] }))
      return new Response(`Unexpected completion stage: ${system.slice(0, 120)}`, { status: 418 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await runTurn({ campaign, input: 'Я отпускаю лидера после публичного унижения.', actionType: 'do', provider })

    expect(directorCalls).toBe(1)
    expect(result.statePatch.scene).toEqual({ tension: 90 })
    expect(result.statePatch.upsertFactionReputation).toEqual([{ factionName: 'Латунный хор', value: -20, label: 'Враждебность', notes: ['Лидер унижен при подчинённых.'] }])
    expect(result.statePatch.abilityChanges).toEqual([
      { abilityId: ability.id, mastery: 40, history: { title: 'Боевое применение', description: 'Способность дала решающее преимущество.' } },
      { abilityId: ability.id, history: { title: 'Контроль', description: 'Герой точно остановил ускорение.' } },
    ])
    expect(result.statePatch.memories?.[0]).toEqual({ kind: 'fact', content: 'Конфликт стал личным.', tags: ['конфликт'], importance: 80 })
  })

  it('keeps substantive Sandevistan fields from the progression auditor when the director already changed the same records', async () => {
    const campaign = createDemoCampaign()
    campaign.settings.qualityMode = 'balanced'
    const ability = campaign.player.abilities[0]
    Object.assign(ability, { name: 'Сандевистан: ускорение', source: 'Сандевистан Militech Falcon', description: 'Один короткий импульс.', capabilities: ['Один рывок'], effects: ['Ускорение реакции'], limitations: ['Перегрев'] })
    const item = campaign.inventory[0]
    Object.assign(item, {
      name: 'Сандевистан Militech Falcon', description: 'Серийный нейроускоритель.', effects: ['Один импульс'], history: [],
      artifact: {
        sentient: false, awakened: true, mastery: 35, attunement: 40, bond: 0, requirements: [], passiveEffects: [], combinedEffects: [], failureModes: ['Перегрев'],
        components: [{ id: 'cooling-v1', name: 'Контур охлаждения', description: 'Штатный теплоотвод.', role: 'Охлаждение', status: 'active', capabilities: ['Один импульс'], required: true }],
        powers: [{ id: 'time-dilation', name: 'Замедление времени', description: 'Одно окно ускорения.', mastery: 35, costs: [{ resource: 'energy', amount: 8 }], limitations: ['Один импульс'], capabilities: ['Один рывок'] }],
        drawbacks: ['Перегрев'], evolutionPaths: [], secrets: [],
      },
    })
    campaign.messages.push({ id: 'missed-upgrade', role: 'assistant', turn: 4, createdAt: '2026-07-14T00:00:00.000Z', content: 'Техник улучшил Сандевистан: поставил двухступенчатое охлаждение, снизил расход энергии до 6 и разблокировал второй импульс.' })

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as CompletionBody
      const system = systemPrompt(body)
      if (system.includes('скрытый симулятор живого мира')) return providerResponse(JSON.stringify({ signals: [], statePatch: {} }))
      if (system.includes('режиссёр и строгий распорядитель состояния')) return providerResponse(JSON.stringify({
        outcome: 'Герой проверяет обновлённый имплант.', beats: ['Система проходит самодиагностику.'], suggestions: ['Испытать рывок', 'Проверить охлаждение'],
        statePatch: {
          abilityChanges: [{ abilityId: ability.id, masteryDelta: 2, history: { title: 'Калибровка', description: 'Контроллер принял новую прошивку.' } }],
          artifactChanges: [{ itemId: item.id, attunementDelta: 3, history: { title: 'Калибровка', description: 'Аппаратная часть распознана системой.' } }],
        },
      }))
      if (system.includes('аудитор развития способностей и особых предметов')) return providerResponse(JSON.stringify({
        abilityChanges: [{
          abilityId: ability.id, masteryDelta: 2, rank: 'Mk II', description: 'Два последовательных окна ускорения с промежуточным охлаждением.',
          costs: [{ resource: 'energy', amount: 6 }], capabilities: ['Два последовательных рывка'], effects: ['Ускорение реакции и моторики'], limitations: ['Полное охлаждение после второго импульса'],
        }],
        artifactChanges: [{
          itemId: item.id, attunementDelta: 3, itemDescription: 'Militech Falcon Mk II с двухступенчатым охлаждением.', itemEffects: ['Два последовательных импульса'], operatingPrinciple: 'Двухфазное ускорение нейросигналов',
          powerChanges: [{ powerId: 'time-dilation', description: 'Создаёт два последовательных окна ускорения.', costs: [{ resource: 'energy', amount: 6 }], capabilities: ['Два последовательных рывка'], limitations: ['Охлаждение после второго окна'] }],
          componentChanges: [{ componentId: 'cooling-v1', name: 'Двухступенчатый контур охлаждения', description: 'Сбрасывает тепло между двумя импульсами.', addCapabilities: ['Промежуточный сброс тепла'] }],
        }],
        npcAbilityChanges: [],
      }))
      if (system.includes('выдающийся ведущий живой текстовой ролевой игры')) return providerResponse('Диагностика подтверждает: второй импульс доступен, а теплоотвод работает штатно.')
      if (system.includes('строгий редактор непротиворечивости')) return providerResponse(JSON.stringify({ chosen: 'a', pass: true, issues: [], rewriteInstructions: '' }))
      if (system.includes('последний обязательный аудитор причин и последствий')) return providerResponse(JSON.stringify({ pass: true, narrativePass: true, narrativeIssues: [], verifiedDomains: consequenceDomains, omissions: [], statePatch: {} }))
      if (system.includes('архивариус очень долгой ролевой кампании')) return providerResponse(JSON.stringify({ memories: [], archives: [] }))
      return new Response(`Unexpected completion stage: ${system.slice(0, 120)}`, { status: 418 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await runTurn({ campaign, input: 'Продолжаю.', actionType: 'continue', provider })
    const updated = applyPatch(campaign, result.statePatch, 5)
    const changedAbility = updated.player.abilities.find((entry) => entry.id === ability.id)!
    const changedItem = updated.inventory.find((entry) => entry.id === item.id)!

    expect(changedAbility).toMatchObject({ rank: 'Mk II', mastery: (ability.mastery ?? 0) + 2, costs: [{ resource: 'energy', amount: 6 }], capabilities: ['Два последовательных рывка'] })
    expect(changedItem.artifact?.attunement).toBe(43)
    expect(changedItem.description).toContain('Militech Falcon Mk II')
    expect(changedItem.artifact?.powers[0]).toMatchObject({ costs: [{ resource: 'energy', amount: 6 }], capabilities: ['Два последовательных рывка'] })
    expect(changedItem.artifact?.components[0]).toMatchObject({ name: 'Двухступенчатый контур охлаждения', capabilities: ['Один импульс', 'Промежуточный сброс тепла'] })
    expect(result.statePatch.abilityChanges).toHaveLength(2)
    expect(result.statePatch.artifactChanges).toHaveLength(2)
  })

  it('does not double-apply a numeric cost or inventory loss repeated by the consequence auditor', async () => {
    const campaign = createDemoCampaign()
    campaign.settings.qualityMode = 'balanced'
    const npc = campaign.npcs[0]
    npc.resources = [{ key: 'focus', label: 'Фокус', value: 8, max: 10, kind: 'focus' }]
    const item = campaign.inventory[0]

    const duplicatePatch = {
      inventory: [{ operation: 'remove', targetId: item.id, reason: 'Украден.' }],
      npcs: [{ operation: 'update', targetId: npc.id, npc: { resourceDeltas: { focus: -2 } } }],
    }
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as CompletionBody
      const system = systemPrompt(body)
      if (system.includes('скрытый симулятор живого мира')) return providerResponse(JSON.stringify({ signals: [], statePatch: duplicatePatch }))
      if (system.includes('режиссёр и строгий распорядитель состояния')) return providerResponse(JSON.stringify({
        outcome: 'Мира тратит фокус и забирает предмет.', beats: ['Цена способности уплачена.', 'Предмет потерян.'], suggestions: ['Преследовать', 'Перегруппироваться'], statePatch: duplicatePatch,
      }))
      if (system.includes('выдающийся ведущий живой текстовой ролевой игры')) return providerResponse('Мира тратит силы на манёвр и скрывается с предметом.')
      if (system.includes('строгий редактор непротиворечивости')) return providerResponse(JSON.stringify({ chosen: 'a', pass: true, issues: [], rewriteInstructions: '' }))
      if (system.includes('последний обязательный аудитор причин и последствий')) return providerResponse(JSON.stringify({
        pass: false, narrativePass: true, narrativeIssues: [], verifiedDomains: consequenceDomains,
        omissions: [{ domain: 'resources', evidence: 'Мира использовала силу.', requiredChange: 'Списать 2 focus.', resolutionPath: 'npcs.resourceDeltas.focus', severity: 'medium' }],
        statePatch: duplicatePatch,
      }))
      if (system.includes('архивариус очень долгой ролевой кампании')) return providerResponse(JSON.stringify({ memories: [
        { kind: 'fact', content: 'Мира использовала манёвр и украла предмет у героя.', tags: ['Мира', 'кража'], importance: 85 },
        { kind: 'fact', content: 'Восьмое окно когда-нибудь откроется над Обсерваторией.', tags: ['окно'], importance: 90 },
        { kind: 'fact', content: 'Мира использовала манёвр и украла предмет у героя, после чего скрылась.', tags: ['Мира', 'кража'], importance: 80 },
      ], archives: [] }))
      return new Response(`Unexpected completion stage: ${system.slice(0, 120)}`, { status: 418 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await runTurn({ campaign, input: 'Мира использует манёвр и крадёт предмет.', actionType: 'story', provider })
    const npcDeltas = result.statePatch.npcs?.filter((mutation) => mutation.operation === 'update' && mutation.targetId === npc.id).map((mutation) => mutation.operation === 'update' ? mutation.npc.resourceDeltas?.focus : undefined).filter((value) => value !== undefined)
    expect(npcDeltas).toEqual([-2])
    expect(result.statePatch.inventory?.filter((mutation) => mutation.operation === 'remove' && mutation.targetId === item.id)).toHaveLength(1)
    expect(result.statePatch.memories?.map((memory) => memory.content)).toEqual(['Мира использовала манёвр и украла предмет у героя.'])
  })

  it('rejects an invalid director statePatch after repair attempts instead of salvaging it as empty', async () => {
    let directorCalls = 0
    let auditCalls = 0

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as CompletionBody
      const system = systemPrompt(body)

      if (system.includes('скрытый симулятор живого мира')) {
        return providerResponse(JSON.stringify({ signals: [], statePatch: {} }))
      }
      if (system.includes('режиссёр и строгий распорядитель состояния')) {
        directorCalls += 1
        return providerResponse(JSON.stringify({
          outcome: 'Удар достигает цели.',
          beats: ['Герой получает рану.'],
          suggestions: ['Отступить', 'Закрыться'],
          statePatch: { notARealPatchField: true },
        }))
      }
      if (system.includes('последний обязательный аудитор причин и последствий')) auditCalls += 1

      return new Response(`Unexpected completion stage: ${system.slice(0, 120)}`, { status: 418 })
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(runTurn({
      campaign: createDemoCampaign(),
      input: 'Я принимаю удар на себя.',
      actionType: 'do',
      provider,
    })).rejects.toThrow(/statePatch|обязательную структуру|структур/i)

    expect(directorCalls).toBe(5)
    expect(auditCalls).toBe(0)
  })

  it('binds a quest mutation by an exact unique title instead of rejecting a model-authored target id', async () => {
    const campaign = createDemoCampaign()
    campaign.settings.qualityMode = 'balanced'
    const quest = campaign.quests[0]
    const narrative = `Герой приносит последнее доказательство, и задание «${quest.title}» считается выполненным.`

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as CompletionBody
      const system = systemPrompt(body)
      if (system.includes('скрытый симулятор живого мира')) return providerResponse(JSON.stringify({ signals: [], statePatch: {} }))
      if (system.includes('режиссёр и строгий распорядитель состояния')) return providerResponse(JSON.stringify({
        outcome: 'Доказательство принято.', beats: ['Задание завершается.'], suggestions: ['Спросить о награде', 'Уйти'], statePatch: {},
      }))
      if (system.includes('выдающийся ведущий живой текстовой ролевой игры')) return providerResponse(narrative)
      if (system.includes('строгий редактор непротиворечивости')) return providerResponse(JSON.stringify({ chosen: 'a', pass: true, issues: [], rewriteInstructions: '' }))
      if (system.includes('последний обязательный аудитор причин и последствий')) return providerResponse(JSON.stringify({
        pass: false,
        narrativePass: true,
        narrativeIssues: [],
        verifiedDomains: consequenceDomains,
        omissions: [{ domain: 'quests', evidence: narrative, requiredChange: 'Завершить существующее задание.', resolutionPath: 'quests.complete', severity: 'medium' }],
        statePatch: { quests: [{ operation: 'complete', targetId: quest.title }] },
      }))
      if (system.includes('архивариус очень долгой ролевой кампании')) return providerResponse(JSON.stringify({ memories: [], archives: [] }))
      return new Response(`Unexpected completion stage: ${system.slice(0, 120)}`, { status: 418 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await runTurn({ campaign, input: 'Передаю последнее доказательство заказчику.', actionType: 'do', provider })

    expect(result.statePatch.quests).toEqual([{ operation: 'complete', targetId: quest.id }])
  })

  it('treats completion of an already absent quest as an idempotent no-op', async () => {
    const campaign = createDemoCampaign()
    campaign.settings.qualityMode = 'balanced'
    let auditCalls = 0

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as CompletionBody
      const system = systemPrompt(body)
      if (system.includes('скрытый симулятор живого мира')) return providerResponse(JSON.stringify({ signals: [], statePatch: {} }))
      if (system.includes('режиссёр и строгий распорядитель состояния')) return providerResponse(JSON.stringify({
        outcome: 'Герой спокойно осматривает зал.', beats: ['Новых обязательств не возникает.'], suggestions: ['Осмотреть двери', 'Вернуться к спутнику'], statePatch: {},
      }))
      if (system.includes('выдающийся ведущий живой текстовой ролевой игры')) return providerResponse('Герой осматривает пустой зал и не находит ничего, что меняло бы его текущие задания.')
      if (system.includes('строгий редактор непротиворечивости')) return providerResponse(JSON.stringify({ chosen: 'a', pass: true, issues: [], rewriteInstructions: '' }))
      if (system.includes('последний обязательный аудитор причин и последствий')) {
        auditCalls += 1
        if (auditCalls === 1) return providerResponse(JSON.stringify({
          pass: false,
          narrativePass: true,
          narrativeIssues: [],
          verifiedDomains: consequenceDomains,
          omissions: [{ domain: 'quests', evidence: 'Ошибочная первичная гипотеза аудитора.', requiredChange: 'Завершить вымышленное задание.', resolutionPath: 'quests.complete', severity: 'low' }],
          statePatch: { quests: [{ operation: 'complete', targetId: 'quest-that-does-not-exist' }] },
        }))
        return providerResponse(JSON.stringify({
          pass: true,
          narrativePass: true,
          narrativeIssues: [],
          verifiedDomains: consequenceDomains,
          omissions: [],
          statePatch: {},
        }))
      }
      if (system.includes('архивариус очень долгой ролевой кампании')) return providerResponse(JSON.stringify({ memories: [], archives: [] }))
      return new Response(`Unexpected completion stage: ${system.slice(0, 120)}`, { status: 418 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await runTurn({ campaign, input: 'Осматриваю зал, не принимая новых обязательств.', actionType: 'do', provider })

    expect(auditCalls).toBe(1)
    expect(result.statePatch.quests ?? []).toEqual([])
  })

  it('rewrites a repeated real campaign paragraph even when the model critic accepts it', async () => {
    const campaign = createDemoCampaign()
    campaign.settings.qualityMode = 'balanced'
    campaign.turn = 58
    const repeatedNarrative = 'В пентхаусе тихо. Только гул систем жизнеобеспечения — вентиляция, фильтры, терморегуляция — и ровный свет голографических панелей на стенах. За панорамным окном — тёмные провалы Машинного Пояса, редкие огни аварийных генераторов, силуэты заброшенных кранов на фоне тусклого зарева Центрального Купола.'
    const repairedNarrative = 'Эллира снимает со стены аварийный терминал и выводит на стол схему девятого дока. Красная метка на ней показывает новый факт: грузовой шлюз откроется через шесть минут, а одноразовый код уже передан на её ключ-карту.'
    campaign.messages = [{
      id: 'assistant-57',
      role: 'assistant',
      content: repeatedNarrative,
      createdAt: new Date().toISOString(),
      turn: 57,
    }]
    let repetitionRevisionCalls = 0
    let criticBody: CompletionBody | undefined

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as CompletionBody
      const system = systemPrompt(body)
      if (system.includes('скрытый симулятор живого мира')) return providerResponse(JSON.stringify({ signals: [], statePatch: {} }))
      if (system.includes('режиссёр и строгий распорядитель состояния')) return providerResponse(JSON.stringify({
        outcome: 'Эллира передаёт герою сведения о доступе в девятый док.',
        beats: ['Появляется точный срок открытия шлюза.', 'Ключ-карта получает одноразовый код.'],
        suggestions: ['Проверить маршрут к доку', 'Спросить об охране шлюза'],
        statePatch: {},
      }))
      if (system.includes('выдающийся ведущий живой текстовой ролевой игры')) return providerResponse(repeatedNarrative)
      if (system.includes('строгий редактор непротиворечивости')) {
        criticBody = body
        return providerResponse(JSON.stringify({ chosen: 'a', pass: true, issues: [], rewriteInstructions: '' }))
      }
      if (system.includes('точный редактор против самоповторов')) {
        repetitionRevisionCalls += 1
        return providerResponse(repairedNarrative)
      }
      if (system.includes('последний обязательный аудитор причин и последствий')) return providerResponse(JSON.stringify({
        pass: true,
        narrativePass: true,
        narrativeIssues: [],
        verifiedDomains: consequenceDomains,
        omissions: [],
        statePatch: {},
      }))
      if (system.includes('архивариус очень долгой ролевой кампании')) return providerResponse(JSON.stringify({ memories: [], archives: [] }))
      return new Response(`Unexpected completion stage: ${system.slice(0, 120)}`, { status: 418 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await runTurn({ campaign, input: 'Продолжить сцену.', actionType: 'continue', provider })

    expect(repetitionRevisionCalls).toBe(1)
    expect(result.narrative).toBe(repairedNarrative)
    expect(findNarrativeRepetitionIssues(result.narrative, campaign.messages)).toEqual([])
    expect(criticBody).toBeUndefined()
  })

  it('runs only necessary final audits concurrently and skips redundant balanced-mode critics', async () => {
    const campaign = createDemoCampaign()
    campaign.settings.qualityMode = 'balanced'
    let activeAuditors = 0
    let maximumActiveAuditors = 0
    let activeLatencyStages = 0
    let maximumActiveLatencyStages = 0
    let activeEarlyStages = 0
    let maximumActiveEarlyStages = 0
    let activePlanAndProseStages = 0
    let maximumActivePlanAndProseStages = 0

    const delayedStage = async () => {
      activeLatencyStages += 1
      maximumActiveLatencyStages = Math.max(maximumActiveLatencyStages, activeLatencyStages)
      await new Promise((resolve) => setTimeout(resolve, 30))
      activeLatencyStages -= 1
    }

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as CompletionBody
      const system = systemPrompt(body)
      if (system.includes('скрытый симулятор живого мира') || system.includes('режиссёр и строгий распорядитель состояния')) {
        activeEarlyStages += 1
        maximumActiveEarlyStages = Math.max(maximumActiveEarlyStages, activeEarlyStages)
        await new Promise((resolve) => setTimeout(resolve, 30))
        activeEarlyStages -= 1
        if (system.includes('скрытый симулятор живого мира')) return providerResponse(JSON.stringify({ signals: [], statePatch: {} }))
        return providerResponse(JSON.stringify({
          outcome: 'Мира открывает карту безопасного пути.', beats: ['На карте появляется новый маршрут.'], suggestions: ['Изучить путь', 'Спросить Миру об опасностях'], statePatch: {},
        }))
      }
      if (system.includes('выдающийся ведущий живой текстовой ролевой игры') || system.includes('аудитор развития способностей')) {
        activePlanAndProseStages += 1
        maximumActivePlanAndProseStages = Math.max(maximumActivePlanAndProseStages, activePlanAndProseStages)
        await new Promise((resolve) => setTimeout(resolve, 30))
        activePlanAndProseStages -= 1
        if (system.includes('аудитор развития способностей')) return providerResponse(JSON.stringify({ abilityChanges: [], artifactChanges: [], npcAbilityChanges: [] }))
        return providerResponse('Мира кладёт карту на стол и ждёт ответа героя.')
      }
      if (system.includes('строгий редактор непротиворечивости')) {
        await delayedStage()
        return providerResponse(JSON.stringify({ chosen: 'a', pass: true, issues: [], rewriteInstructions: '' }))
      }
      if (system.includes('аудитор свободы игрока') || system.includes('последний обязательный аудитор причин и последствий')) {
        activeAuditors += 1
        maximumActiveAuditors = Math.max(maximumActiveAuditors, activeAuditors)
        await delayedStage()
        activeAuditors -= 1
        if (system.includes('аудитор свободы игрока')) return providerResponse(JSON.stringify({ pass: true, violations: [] }))
        return providerResponse(JSON.stringify({ pass: true, narrativePass: true, narrativeIssues: [], verifiedDomains: consequenceDomains, omissions: [], statePatch: {} }))
      }
      if (system.includes('архивариус очень долгой ролевой кампании')) {
        await delayedStage()
        return providerResponse(JSON.stringify({ memories: [], archives: [] }))
      }
      return new Response(`Unexpected completion stage: ${system.slice(0, 120)}`, { status: 418 })
    })
    vi.stubGlobal('fetch', fetchMock)

    await runTurn({ campaign, input: `Осматриваю карту с помощью ${campaign.player.abilities[0].name}, пока ничего больше не решая.`, actionType: 'do', provider })

    expect(maximumActiveAuditors).toBe(1)
    expect(maximumActiveLatencyStages).toBe(2)
    expect(maximumActiveEarlyStages).toBe(2)
    expect(maximumActivePlanAndProseStages).toBe(2)
  })
})
