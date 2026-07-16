import { describe, expect, it } from 'vitest'
import { backgroundSimulationSchema, campaignEditResponseSchema, consequenceAuditSchema, generatedWorldSchema, narrativeEventDecisionSchema, turnPatchSchema, turnPlanSchema, worldQualityReviewSchema } from './schemas'
import { demoWorld } from './demo'
import { normalizeWorld } from './world-normalizer'

const plan = (relationships: unknown) => ({
  outcome: 'NPC стал относиться к герою теплее.',
  beats: ['NPC оценил поступок героя.'],
  suggestions: ['Продолжить разговор', 'Сменить тему'],
  statePatch: { relationships },
})

describe('campaign editor contract', () => {
  it('accepts real world, presentation and settings corrections in one checked response', () => {
    const parsed = campaignEditResponseSchema.parse({
      summary: 'Мир и стиль обновлены.',
      campaignPatch: { title: 'Новая ветвь' },
      settingsPatch: { proseStyle: 'cinematic', npcAutonomy: 'independent', worldDynamics: 'volatile' },
      statePatch: { world: { name: 'Город Разлома', system: { progression: 'Опыт меняет доступные техники.' }, presentation: { accent: '#33ffaa', labels: { abilities: 'Техники' } } } },
    })
    expect(parsed.settingsPatch?.worldDynamics).toBe('volatile')
    expect(parsed.statePatch.world?.system?.progression).toContain('Опыт')
    expect(parsed.statePatch.world?.presentation?.labels?.abilities).toBe('Техники')
  })
})

describe('universal narrative event contract', () => {
  it('normalizes DeepSeek Russian enums, numeric strings and singleton objects without inventing content', () => {
    const parsed = narrativeEventDecisionSchema.parse({
      mode: 'проявить',
      lifecycleStage: 'произошло',
      concept: 'Старая реликвия впервые открывает проход к забытому архиву.',
      category: 'артефакт',
      magnitude: 'крупное',
      miracleKind: 'нет',
      originKind: 'артефакт',
      sourceIds: 'artifact-1',
      causeIds: 'thread-1',
      scopeIds: 'place-1',
      participantIds: 'player-1',
      affectedDomains: 'артефакт',
      knowledgeChannel: 'Реликвия меняет наблюдаемый рисунок на поверхности.',
      trigger: 'Герой совместил три ранее найденных фрагмента печати.',
      arrivalMethod: 'Проход открывается непосредственно из собранной реликвии.',
      observableSigns: 'По металлу проходят новые светящиеся линии.',
      immediateEffects: {
        domain: 'артефакт',
        operation: 'преобразовать',
        targetId: 'artifact-1',
        requirement: 'Обновить настоящий профиль реликвии и раскрыть новую функцию.',
        observable: true,
        mandatory: true,
      },
      persistentEffects: {
        domain: 'маршрут',
        operation: 'создать',
        targetId: 'route-archive',
        requirement: 'Создать постоянный маршрут к забытому архиву.',
        observable: true,
        mandatory: true,
      },
      counterplay: 'Закрыть проход повторным соединением фрагментов.',
      cancellationConditions: 'Один из фрагментов будет отделён до полного открытия.',
      canonReasoning: 'Реликвия и архив уже установлены в истории мира.',
      pacingReasoning: 'Открытие завершает продолжительную линию исследования.',
      noveltyReasoning: 'Это следствие собранной реликвии, а не случайное нападение.',
      minimumDelay: '3',
    })

    expect(parsed).toMatchObject({
      mode: 'manifest',
      lifecycleStage: 'manifested',
      category: 'artifact_shift',
      magnitude: 'major',
      miracleKind: 'none',
      originKind: 'artifact',
      sourceIds: ['artifact-1'],
      affectedDomains: ['artifact'],
      immediateEffects: [{ domain: 'artifact', operation: 'transform' }],
      persistentEffects: [{ domain: 'route', operation: 'create' }],
      minimumDelay: 3,
    })
  })

  it('accepts an honest no-event decision but rejects an incomplete proposal instead of filling placeholders', () => {
    expect(narrativeEventDecisionSchema.parse({ mode: 'нет', reason: 'Текущей сцене нужна передышка без нового поворота.' })).toEqual({
      mode: 'none',
      reason: 'Текущей сцене нужна передышка без нового поворота.',
    })
    expect(() => narrativeEventDecisionSchema.parse({
      mode: 'зерно',
      lifecycleStage: 'заложено',
      concept: 'Неполная идея.',
    })).toThrow()
  })

  it('allows the AI editor to change nested event settings without replacing all permissions', () => {
    const parsed = campaignEditResponseSchema.parse({
      summary: 'Неожиданные события сделаны реже, войны отключены.',
      campaignPatch: {},
      settingsPatch: {
        eventDirector: {
          frequency: 'rare',
          permissions: { wars: false },
        },
      },
      statePatch: {},
    })
    expect(parsed.settingsPatch?.eventDirector).toEqual({
      frequency: 'rare',
      permissions: { wars: false },
    })
  })
})

describe('legend ecosystem patch contract', () => {
  it('allows the player to become a living legendary figure and preserves the live character link', () => {
    const request = {
      inspiration: 'Город живых созвездий', genre: 'Фэнтези', tone: 'Таинственный', characterName: 'Эрен',
      characterConcept: 'Искатель имён', opening: 'Ночной вокзал', canonMode: 'original' as const, contentBoundaries: '',
      provider: { provider: 'demo' as const, model: 'demo', baseUrl: '', temperature: 0.8 },
    }
    const generated = demoWorld(request)
    generated.world.legends[0].characterName = generated.player.name
    generated.world.legends[0].lifeStatus = 'living'

    const campaign = normalizeWorld(generatedWorldSchema.parse(generated), request)
    expect(campaign.world.legends?.[0]?.characterId).toBe(campaign.player.id)
  })

  it('accepts a full real legend update without model-authored server timestamps', () => {
    const request = {
      inspiration: 'Город живых созвездий', genre: 'Фэнтези', tone: 'Таинственный', characterName: 'Эрен',
      characterConcept: 'Искатель имён', opening: 'Ночной вокзал', canonMode: 'original' as const, contentBoundaries: '',
      provider: { provider: 'demo' as const, model: 'demo', baseUrl: '', temperature: 0.8 },
    }
    const campaign = normalizeWorld(generatedWorldSchema.parse(demoWorld(request)), request)
    const legend: any = structuredClone(campaign.world.legends![0])
    delete legend.createdTurn
    delete legend.lastChangedTurn
    delete legend.currentState.lastUpdatedTurn
    delete legend.emergence.lastEvaluatedTurn
    delete legend.discovery.updatedTurn
    legend.discovery.evidence.forEach((entry: any) => delete entry.learnedTurn)

    const parsed = turnPatchSchema.parse({ world: { upsertLegends: [legend] } })
    const parsedLegend = parsed.world?.upsertLegends?.[0]
    expect(parsedLegend).toMatchObject({ id: legend.id, name: 'Аурел Семипечатный' })
    expect(parsedLegend?.currentState).not.toHaveProperty('lastUpdatedTurn')
    expect(parsedLegend?.emergence).not.toHaveProperty('lastEvaluatedTurn')
    expect(parsedLegend?.discovery).not.toHaveProperty('updatedTurn')
  })
})

describe('safe adaptive cockpit contract', () => {
  const validModule = {
    id: 'ui-alert', title: 'Контур тревоги', description: 'Показывает реакцию мира.', placement: 'dashboard', visual: 'cards', icon: 'pulse',
    accent: '#71d3b1', secondary: '#e7b96b', priority: 90, visibility: 'known', reason: 'Розыск важен в этом мире.',
    updatePolicy: 'Следовать показателю alert.', collapsible: true, collapsedByDefault: false, pinned: true, density: 'compact', emphasis: 'prominent',
    elements: [{ id: 'alert-meter', label: 'Розыск', kind: 'meter', state: 'normal', stateRules: { warningAbove: 50, dangerAbove: 80 }, binding: { domain: 'world.metric', key: 'alert' }, links: [] }],
  }

  it('accepts a blueprint, real metric and granular module changes in one patch', () => {
    const parsed = turnPatchSchema.parse({ world: {
      interfaceBlueprint: {
        title: 'Пульт беглеца', subtitle: 'Внимание города', defaultTab: 'dashboard', reason: 'Мир реагирует на героя.',
        tabs: [{ id: 'dashboard', label: 'Пульт', visible: true }, { id: 'world', label: 'Город', visible: true }],
        dashboardSections: ['scene', 'modules', 'worldPulse', 'interfaceHealth'],
      },
      upsertMetrics: [{ id: 'metric-alert', key: 'alert', label: 'Розыск', description: 'Насколько активно героя ищут.', value: 35, min: 0, max: 100, unit: '%', visibility: 'known', source: 'Городская стража', updatePolicy: 'Растёт от известных преступлений.' }],
      upsertInterfaceModules: [validModule],
      interfaceModuleChanges: [{ moduleId: 'ui-alert', module: { priority: 95 }, upsertElements: [{ id: 'escape-window', label: 'Окно побега', kind: 'value', value: 'Ночь', state: 'positive', binding: { domain: 'custom' }, links: [] }] }],
      metricDeltas: { alert: 12 },
    } })
    expect(parsed.world?.interfaceBlueprint).toMatchObject({ defaultTab: 'dashboard', dashboardSections: ['scene', 'modules', 'worldPulse', 'interfaceHealth'] })
    expect(parsed.world?.upsertMetrics?.[0]).toMatchObject({ id: 'metric-alert', value: 35, max: 100 })
    expect(parsed.world?.upsertInterfaceModules?.[0]).toMatchObject({ placement: 'dashboard', visual: 'cards', pinned: true, density: 'compact', emphasis: 'prominent' })
    expect(parsed.world?.interfaceModuleChanges?.[0]).toMatchObject({ moduleId: 'ui-alert', module: { priority: 95 } })
    expect(parsed.world?.metricDeltas).toEqual({ alert: 12 })
  })

  it('rejects ambiguous live bindings, duplicate ids, invalid links and inverted ranges', () => {
    const malformed = structuredClone(validModule)
    malformed.elements = [
      { id: 'same', label: 'A', kind: 'meter', state: 'normal', min: 10, max: 1, binding: { domain: 'player.resource' }, links: ['missing'] },
      { id: 'same', label: 'B', kind: 'value', state: 'normal', binding: { domain: 'custom' }, links: [] },
    ] as typeof validModule.elements
    expect(turnPatchSchema.safeParse({ world: { upsertInterfaceModules: [malformed] } }).success).toBe(false)
    expect(turnPatchSchema.safeParse({ world: { interfaceModuleChanges: [{ moduleId: 'ui-alert', upsertElements: [{ id: 'broken-resource', label: 'Ресурс', kind: 'meter', state: 'normal', binding: { domain: 'player.resource' } }] }] } }).success).toBe(false)
  })

  it('rejects metrics outside their declared range', () => {
    expect(turnPatchSchema.safeParse({ world: { upsertMetrics: [{ id: 'bad', key: 'bad', label: 'Ошибка', description: 'За пределом.', value: 120, min: 0, max: 100, visibility: 'known', source: 'Тест', updatePolicy: 'Никогда' }] } }).success).toBe(false)
  })
})

describe('persistent living-world patches', () => {
  it('accepts a granular Russian NPC dossier without exposing unrelated fields', () => {
    const parsed = turnPatchSchema.parse({ npcs: [{ operation: 'update', targetId: 'npc-elder', npc: { dossier: {
      familiarity: 'знаком',
      revealedSections: ['описание', 'отношение', 'способности'],
      revealedStatKeys: ['intellect'], revealedResourceKeys: [], revealedAbilityIds: ['ability-seal'],
      evidence: [{ id: 'evidence-1', section: 'способности', summary: 'Староста применил печать на глазах героя.', source: 'личное наблюдение', learnedTurn: '4' }],
      updatedTurn: '4',
    } } }] })

    expect(parsed.npcs?.[0]).toMatchObject({ npc: { dossier: {
      familiarity: 'acquainted', revealedSections: ['description', 'relationship', 'abilities'], revealedAbilityIds: ['ability-seal'],
      evidence: [{ section: 'abilities', learnedTurn: 4 }], updatedTurn: 4,
    } } })
  })

  it('accepts Russian DeepSeek aliases for pacing, exceptional threats and causal world pressure', () => {
    const parsed = turnPatchSchema.parse({
      pacing: { beat: 'передышка', intensity: '24%', challengeTier: 'лёгкий', reason: 'После погони наступила короткая безопасная пауза.' },
      npcs: [{ operation: 'update', targetId: 'npc-legend', npc: { threatProfile: {
        tier: 'легендарный', scope: 'Способен изменить исход войны в одном регионе.', reputation: 'Пережил падение крепости.',
        whyDangerous: ['Владеет пространством боя.'], knownFeats: ['Остановил армию у перевала.'], constraints: ['Не может покинуть границы клятвы.'],
        defeatRequirements: ['Разрушить якорь клятвы.'], escalationTriggers: ['Угроза охраняемому городу.'], visibility: 'слухи',
      } } }],
      upsertWorldPressures: [{
        id: 'pressure-corp', sourceKind: 'корпорация', sourceName: 'Орден Меди', targetIds: ['player-1'],
        cause: 'Свидетель передал запись нападения.', objective: 'Установить личность нападавшего.', tier: 'серьёзный', stage: 'расследует',
        reach: 'Городская сеть наблюдения.', knowledge: ['Есть неполная запись.'], signs: ['Следователи опрашивают свидетелей.'],
        measures: [{ id: 'measure-cameras', name: 'Сверка камер', trigger: 'Получены записи соседнего квартала.', method: 'Сопоставить время и маршрут.', effects: ['Сузить район поиска.'], counterplay: ['Создать ложный маршрут.'], tradeoffs: ['Нужен ордер и время.'], status: 'готовится' }],
        counterplay: ['Найти свидетеля раньше следователей.'], escalationTrigger: 'Личность подтверждена двумя источниками.', deescalationConditions: ['Виновник опровергнут.'],
        visibility: 'известно', createdTurn: '3', lastAdvancedTurn: '3',
      }],
    })

    expect(parsed.pacing).toMatchObject({ beat: 'respite', intensity: 24, challengeTier: 'light' })
    expect(parsed.npcs?.[0]).toMatchObject({ npc: { threatProfile: { tier: 'legendary', visibility: 'rumored' } } })
    expect(parsed.upsertWorldPressures?.[0]).toMatchObject({ sourceKind: 'corporation', tier: 'serious', stage: 'investigating', measures: [{ status: 'preparing' }] })
  })

  it('accepts causal laws, mechanics and enriched factions from DeepSeek without placeholder fields', () => {
    const parsed = turnPatchSchema.parse({
      world: {
        upsertLaws: [{
          id: 'law-open-sky', title: 'Право открытого неба', description: 'Небесные пути нельзя перекрывать без решения трёх портов.',
          scope: 'Воздушные гавани', authority: 'Совет трёх портов', status: 'оспаривается', visibility: 'известно', consequences: ['Портовое эмбарго'],
        }],
        upsertMechanics: [{
          id: 'mechanic-wind-debt', name: 'Долг ветра', description: 'Использование чужого воздушного коридора создаёт политическое обязательство.',
          category: 'политика', trigger: 'Корабль проходит через охраняемый коридор без оплаты.', effects: ['Владелец коридора получает рычаг влияния'],
          source: 'Договор воздушных гаваней', discovered: 'да', status: 'зарождается',
        }],
        upsertFactions: [{
          name: 'Северная эскадра', visibility: 'слухи', description: 'Союз капитанов северных маршрутов.', attitude: 'Оценивает выгоду сотрудничества', status: 'распалась', power: '37%',
          influence: 'Контролировала два воздушных коридора.', territory: ['Северный порт'], resources: ['Три корабля'], goals: ['Сохранить маршруты'],
          currentMove: 'Договаривается о слиянии.', publicFace: 'Торговая охрана.', origin: 'Создана после шторма.', secrets: [],
        }],
      },
    })

    expect(parsed.world?.upsertLaws?.[0]).toMatchObject({ status: 'contested', visibility: 'known' })
    expect(parsed.world?.upsertMechanics?.[0]).toMatchObject({ category: 'political', status: 'emerging', discovered: true })
    expect(parsed.world?.upsertFactions?.[0]).toMatchObject({ status: 'dissolved', visibility: 'rumored', power: 37, territory: ['Северный порт'] })
  })

  it('accepts a hierarchical atlas, autonomous processes and explicit active-state cleanup', () => {
    const parsed = turnPatchSchema.parse({
      world: {
        upsertPlaces: [{
          id: 'place-capital', name: 'Столица', kind: 'город', description: 'Политический и торговый центр страны.', scale: 'крупный город',
          population: 'два миллиона жителей', government: 'Выборный совет', economy: 'Порты и производство', culture: ['Квартальные союзы'],
          notableFacts: ['Здесь заседает совет'], currentSituation: 'Портовые рабочие готовят забастовку.', visibility: 'известно',
        }],
        upsertProcesses: [{
          id: 'process-strike', title: 'Портовая забастовка', description: 'Рабочие требуют нового договора.', scopeIds: ['place-capital'],
          involvedFactionNames: ['Гильдия доков'], drivers: ['Снижение оплаты'], obstacles: ['Запасы владельцев'], stage: 'Переговоры сорваны.',
          momentum: '64%', direction: 'усиливается', status: 'активно', visibility: 'слухи', nextMilestone: 'Остановка ночной смены', consequences: ['Дефицит товаров'],
          scale: 'национальный', causeIds: ['process-wage-cuts'],
        }],
      },
      worldEvents: [{ operation: 'add', event: {
        id: 'event-shortage', title: 'Дефицит продовольствия', description: 'Поставки в столицу сокращаются.', status: 'запланировано', visibility: 'слухи', involvedIds: [],
        scale: 'региональный', scopeIds: ['place-capital'], causeIds: ['process-strike'], consequences: ['Цены растут'],
      } }],
      cleanup: { quests: [{ targetId: 'quest-done', reason: 'Награда получена, новых обязательств нет.' }] },
    })

    expect(parsed.world?.upsertPlaces?.[0]).toMatchObject({ kind: 'city', visibility: 'known' })
    expect(parsed.world?.upsertProcesses?.[0]).toMatchObject({ momentum: 64, direction: 'rising', status: 'active', visibility: 'rumored', scale: 'national', causeIds: ['process-wage-cuts'] })
    expect(parsed.worldEvents?.[0]).toMatchObject({ event: { scale: 'regional', scopeIds: ['place-capital'], causeIds: ['process-strike'], consequences: ['Цены растут'] } })
    expect(parsed.cleanup?.quests?.[0].targetId).toBe('quest-done')
  })

  it('accepts adaptive response length without changing legacy modes', () => {
    expect(campaignEditResponseSchema.parse({ summary: 'Длина ответа следует сцене.', settingsPatch: { responseLength: 'adaptive' }, statePatch: {} }).settingsPatch?.responseLength).toBe('adaptive')
    expect(campaignEditResponseSchema.parse({ summary: 'Сохранён прежний режим.', settingsPatch: { responseLength: 'detailed' }, statePatch: {} }).settingsPatch?.responseLength).toBe('detailed')
  })

  it('accepts a persistent tactical conflict and personality-driven countermeasures', () => {
    const parsed = turnPatchSchema.parse({
      npcs: [{ operation: 'update', targetId: 'npc-warden', npc: {
        personality: 'Терпеливый командир, который бережёт подчинённых и не преследует отступающих.',
        strategy: {
          combatDoctrine: 'Удерживает узкий проход и вынуждает противника тратить силы.',
          preferredRange: 'Средняя дистанция.', teamworkStyle: 'Передаёт цели короткими сигналами.', moraleProfile: 'Отступает организованно.',
          retreatConditions: ['Потеря половины отряда'], ethicalLimits: ['Не атакует безоружных'], learnedAdaptations: ['Распознаёт прямой рывок героя'],
          countermeasures: [{ name: 'Ломаная линия', against: 'Прямой рывок', response: 'Смещается за щитоносца.', requirements: ['Щитоносец рядом'], tradeoffs: ['Открывает фланг'], status: 'подготовлена', visibility: 'скрыто' }],
        },
      } }],
      conflict: {
        operation: 'начать',
        state: {
          id: 'conflict-gate', kind: 'сражение', title: 'Бой у ворот', round: '1', phase: 'Стороны занимают позиции.', stakes: 'Проход в крепость.', terrain: ['Узкие ворота'], hazards: ['Горящее масло'], momentum: 'оспаривается',
          participants: [
            { entityId: 'player-1', side: 'герой', objective: 'Пройти ворота.', position: 'Перед баррикадой.', readiness: '70%', morale: '85%', intent: 'Найти проход.', lastAction: 'Подошёл к воротам.', advantages: ['Манёвренность'], vulnerabilities: [], visibility: 'известно' },
            { entityId: 'npc-warden', side: 'противник', objective: 'Удержать ворота.', position: 'За щитами.', readiness: '90%', morale: '75%', intent: 'Встретить рывок.', lastAction: 'Поднял щит.', advantages: ['Укрытие'], vulnerabilities: ['Открытый фланг'], visibility: 'слухи' },
          ],
          startedTurn: '4', lastUpdatedTurn: '4',
        },
      },
    })

    expect(parsed.npcs?.[0]).toMatchObject({ operation: 'update', npc: { personality: expect.stringContaining('командир'), strategy: { countermeasures: [expect.objectContaining({ status: 'prepared', visibility: 'hidden' })] } } })
    expect(parsed.conflict).toMatchObject({ operation: 'start', state: { kind: 'combat', round: 1, momentum: 'contested', participants: [expect.objectContaining({ side: 'player', readiness: 70 }), expect.objectContaining({ side: 'opposition', visibility: 'rumored' })] } })
  })
})

describe('DeepSeek-compatible relationship patches', () => {
  it('wraps one relationship object into an array without inventing values', () => {
    const parsed = turnPlanSchema.parse(plan({ npcId: 'npc-1', delta: 4, note: 'Герой помог NPC.' }))

    expect(parsed.statePatch.relationships).toEqual([
      { npcId: 'npc-1', delta: 4, note: 'Герой помог NPC.' },
    ])
  })

  it('converts an id-keyed object while preserving the model values', () => {
    const parsed = turnPlanSchema.parse(plan({ 'npc-2': { delta: -3, note: 'Герой нарушил обещание.' } }))

    expect(parsed.statePatch.relationships).toEqual([
      { npcId: 'npc-2', delta: -3, note: 'Герой нарушил обещание.' },
    ])
  })
})

describe('DeepSeek-compatible nested mutations', () => {
  it('converts a DeepSeek party array into membership and exact party roles', () => {
    const parsed = turnPatchSchema.parse({
      party: [
        { npcId: 'lis_001', role: 'проводник' },
        { npcId: 'ryzhaya_001', role: 'боец прикрытия' },
      ],
    })

    expect(parsed.party).toEqual({
      addNpcIds: ['lis_001', 'ryzhaya_001'],
      roles: { lis_001: 'проводник', ryzhaya_001: 'боец прикрытия' },
    })
  })

  it('nests flat NPC, thread and world-event fields without changing their values', () => {
    const parsed = backgroundSimulationSchema.parse({
      signals: ['Шторм усиливается.'],
      statePatch: {
        npcs: [{ operation: 'update', targetId: 'npc-orvin', notes: ['Решил предупредить Лиора.'], currentGoal: 'Остановить экспедицию.' }],
        threads: [{ id: 'thread-warning', type: 'rumor', title: 'Предупреждение Орвина', detail: 'В течениях есть аномалия.', participantIds: ['npc-orvin'], status: 'active', secret: true, createdTurn: 0 }],
        worldEvents: [{ operation: 'update', targetId: 'event-storm', description: 'Шторм подходит к маяку.' }],
      },
    })

    expect(parsed.statePatch.npcs?.[0]).toEqual({
      operation: 'update', targetId: 'npc-orvin', npc: { notes: ['Решил предупредить Лиора.'], currentGoal: 'Остановить экспедицию.' },
    })
    expect(parsed.statePatch.threads?.[0]).toEqual({
      operation: 'add', thread: { id: 'thread-warning', type: 'rumor', title: 'Предупреждение Орвина', detail: 'В течениях есть аномалия.', participantIds: ['npc-orvin'], status: 'active', secret: true, createdTurn: 0 },
    })
    expect(parsed.statePatch.worldEvents?.[0]).toEqual({
      operation: 'update', targetId: 'event-storm', event: { description: 'Шторм подходит к маяку.' },
    })
  })

  it('canonicalizes Russian and loose English story-thread enums without inventing defaults', () => {
    const parsed = turnPatchSchema.parse({
      threads: [
        { operation: 'add', thread: { id: 'thread-quest', type: 'quest', title: 'Вернуть печать', detail: 'Герой принял обязательство.', participantIds: ['player-1'], status: 'активно', secret: false, createdTurn: 1 } },
        { operation: 'update', targetId: 'thread-rumor', thread: { type: 'тайна', status: 'скрыто' } },
        { operation: 'update', targetId: 'thread-witness', thread: { type: 'witness', status: 'fulfilled' } },
      ],
    })

    expect(parsed.threads?.map((mutation) => mutation.thread && ({ type: mutation.thread.type, status: mutation.thread.status }))).toEqual([
      { type: 'promise', status: 'active' },
      { type: 'rumor', status: 'active' },
      { type: 'witness', status: 'fulfilled' },
    ])
    expect(turnPatchSchema.safeParse({ threads: [{ operation: 'add', thread: { type: 'что-то-неизвестное' } }] }).success).toBe(false)
  })

  it('normalizes detailed ability and long-running story systems without placeholders', () => {
    const parsed = turnPlanSchema.parse({
      outcome: 'The relic responds and the investigation advances.',
      beats: ['The ability leaves a measurable cost.'],
      suggestions: ['Inspect the relic', 'Follow the clue'],
      statePatch: {
        abilityChanges: [{ abilityId: 42, kind: 'активная', masteryDelta: '4%', costs: { focus: '2 points' }, requirements: 'Direct contact', progression: 'Practice under pressure', tags: 'memory' }],
        artifactChanges: [{ itemId: 77, bondDelta: '+6', awakened: 'да', addPowers: { echo: { description: 'Reads an emotional trace.', mastery: '12/100', costs: { focus: 1 }, limitations: 'Once per scene' } } }],
        upsertInfluenceAssets: { favor: { id: 'favor-1', kind: 'услуга', title: 'Archive access', description: 'One supervised visit.', holderId: 'player-1', targetId: 'npc-1', value: '40/100', status: 'активно', source: 'A kept promise', secret: 'нет', acquiredTurn: '3' } },
      },
    })

    expect(parsed.statePatch.abilityChanges?.[0]).toMatchObject({ abilityId: '42', kind: 'active', masteryDelta: 4, costs: [{ resource: 'focus', amount: 2 }], requirements: ['Direct contact'], tags: ['memory'] })
    expect(parsed.statePatch.artifactChanges?.[0]).toMatchObject({ itemId: '77', bondDelta: 6, awakened: true })
    expect(parsed.statePatch.artifactChanges?.[0].addPowers?.[0]).toMatchObject({ name: 'echo', mastery: 12, costs: [{ resource: 'focus', amount: 1 }], limitations: ['Once per scene'] })
    expect(parsed.statePatch.upsertInfluenceAssets?.[0]).toMatchObject({ kind: 'favor', value: 40, status: 'active', secret: false, acquiredTurn: 3 })
  })

  it('accepts a substantive Sandevistan upgrade for the technique, artifact power and component', () => {
    const parsed = turnPatchSchema.parse({
      abilityChanges: [{
        abilityId: 'ability-sandevistan', rank: 'Mk II', description: 'Два окна ускорения.',
        costs: [{ resource: 'energy', amount: 6 }], capabilities: ['Два последовательных рывка'],
        effects: ['Ускорение восприятия и моторики'], limitations: ['Полное охлаждение после второго окна'],
        addTechniques: [{ id: 'technique-double-burst', name: 'Двойной импульс', description: 'Два связанных окна ускорения.', kind: 'активная', category: 'mobility', mastery: '48%', activation: 'Двойная команда нейроинтерфейса', scale: 'Два коротких рывка', costs: [{ resource: 'energy', amount: 6 }], effects: ['Два последовательных ускорения'], requirements: ['Исправный теплоотвод'], limitations: ['Затем требуется полный цикл охлаждения'], unlocked: 'да' }],
      }],
      artifactChanges: [{
        itemId: 'item-sandevistan', itemDescription: 'Militech Falcon Mk II после аппаратной модернизации.',
        itemEffects: ['Два окна ускорения'], operatingPrinciple: 'Двухфазное ускорение нейросигналов',
        powerChanges: [{ powerId: 'power-time-dilation', masteryDelta: 4, description: 'Два последовательных окна.', costs: [{ resource: 'energy', amount: 6 }], capabilities: ['Двойной рывок'], limitations: ['Цикл охлаждения'], addTechniques: [{ name: 'Фазовый разрыв', description: 'Меняет направление между двумя окнами.', kind: 'reaction', category: 'mobility', mastery: 35, activation: 'Смена вектора между импульсами', scale: 'Личная скорость', costs: [{ resource: 'energy', amount: 2 }], effects: ['Резко меняет направление'], requirements: ['Активный первый импульс'], limitations: ['Только один раз за цикл'], unlocked: true }] }],
        componentChanges: [{ componentId: 'component-cooling', name: 'Двухступенчатое охлаждение', status: 'active', addCapabilities: ['Промежуточный сброс тепла'] }],
        history: { title: 'Модернизация Mk II', description: 'Обновлены контроллер и теплоотвод.' },
      }],
    })

    expect(parsed.abilityChanges?.[0]).toMatchObject({ abilityId: 'ability-sandevistan', rank: 'Mk II', capabilities: ['Два последовательных рывка'] })
    expect(parsed.abilityChanges?.[0].addTechniques?.[0]).toMatchObject({ id: 'technique-double-burst', kind: 'active', mastery: 48, unlocked: true })
    expect(parsed.artifactChanges?.[0]).toMatchObject({ itemId: 'item-sandevistan', itemEffects: ['Два окна ускорения'], operatingPrinciple: 'Двухфазное ускорение нейросигналов' })
    expect(parsed.artifactChanges?.[0].powerChanges?.[0]).toMatchObject({ powerId: 'power-time-dilation', masteryDelta: 4, costs: [{ resource: 'energy', amount: 6 }] })
    expect(parsed.artifactChanges?.[0].powerChanges?.[0].addTechniques?.[0]).toMatchObject({ name: 'Фазовый разрыв', kind: 'reaction', unlocked: true })
    expect(parsed.artifactChanges?.[0].componentChanges?.[0]).toMatchObject({ componentId: 'component-cooling', status: 'active' })
  })
})

describe('canon quality gate', () => {
  const review = {
    pass: true,
    coverage: 100,
    issues: [],
    missingCapabilities: [],
    coverageAudit: [{ capability: 'Управление временем', importance: 'core', status: 'covered', location: 'inventory[0].artifact.powers[0]', detail: 'Полностью описано.' }],
    constraintAudit: [{ constraint: '10 stoneEnergy', location: 'inventory[0].artifact.powers[0].costs', verdict: 'unsupported', basis: 'Такого ресурса нет в выбранном каноне.' }],
    rewriteInstructions: 'Исправления не требуются.',
  }

  it('does not allow a passing review with an unsupported invented cost', () => {
    expect(worldQualityReviewSchema.safeParse(review).success).toBe(false)
  })

  it('accepts a complete audit when every core capability is covered and constraints are grounded', () => {
    expect(worldQualityReviewSchema.safeParse({
      ...review,
      constraintAudit: [{ ...review.constraintAudit[0], verdict: 'canonical' }],
    }).success).toBe(true)
  })
})

describe('consequence completeness audit', () => {
  const allDomains = [
    'HP', 'ресурсы', 'attributes', 'эффекты', 'рюкзак', 'снаряжение', 'навыки', 'реликвии',
    'деньги', 'социальные связи', 'задания', 'NPC', 'противостояние', 'scene/time', 'состояние мира', 'давление мира', 'память и знания',
  ]

  it('normalizes every audit domain and its supplemental state patch without dropping values', () => {
    const parsed = consequenceAuditSchema.parse({
      pass: false,
      narrativePass: true,
      narrativeIssues: [],
      verifiedDomains: allDomains,
      omissions: [{
        domain: 'здоровье',
        evidence: 'Удар в тексте явно ранил героя.',
        requiredChange: 'Уменьшить здоровье и добавить рану.',
        resolutionPath: 'resourceDeltas.health и upsertStatusEffects.',
        severity: 'high',
      }],
      statePatch: {
        playerProfile: { lifeState: 'без сознания' },
        upsertResources: [{ key: 'health', label: 'Здоровье', value: '4', max: '10', kind: 'здоровье', aliases: 'хп' }],
        upsertStatusEffects: [{
          name: 'Глубокая рана', description: 'Кровоточащая рана на боку.', category: 'ранение', severity: '70',
          source: 'Удар клинком', effects: 'Постепенная потеря сил', stacks: '1',
          resourceDeltasPerTurn: { health: '-2' }, checkModifiers: { '*': '-1' },
          duration: { ходы: '3' }, appliedTurn: '14', hidden: false,
        }],
        inventory: [{ operation: 'update', targetId: 'relic-1', item: { state: 'повреждён', charges: '0', maxCharges: '3' } }],
      },
    })

    expect(parsed.verifiedDomains).toEqual([
      'health', 'resources', 'stats', 'conditions', 'inventory', 'equipment', 'abilities', 'artifacts',
      'currency', 'relationships', 'quests', 'characters', 'conflict', 'scene_time', 'world', 'world_pressure', 'knowledge',
    ])
    expect(parsed.omissions[0].domain).toBe('health')
    expect(parsed.statePatch.playerProfile?.lifeState).toBe('unconscious')
    expect(parsed.statePatch.upsertResources?.[0]).toMatchObject({ kind: 'health', aliases: ['хп'], value: 4, max: 10 })
    expect(parsed.statePatch.upsertStatusEffects?.[0]).toMatchObject({ category: 'injury', appliedTurn: 14, resourceDeltasPerTurn: { health: -2 }, checkModifiers: { '*': -1 }, duration: { unit: 'turns', remaining: 3 } })
    expect(parsed.statePatch.inventory?.[0].item).toMatchObject({ state: 'damaged', charges: 0, maxCharges: 3 })
  })

  it('rejects an audit that repeats a domain instead of checking all seventeen', () => {
    const duplicated = [...allDomains.slice(0, -1), 'мир']
    const result = consequenceAuditSchema.safeParse({ pass: true, narrativePass: true, narrativeIssues: [], verifiedDomains: duplicated, omissions: [], statePatch: {} })

    expect(result.success).toBe(false)
  })
})

describe('lossless DeepSeek turn-patch compatibility', () => {
  it('accepts and normalizes a fully AI-authored adaptive interface module', () => {
    const parsed = turnPatchSchema.parse({ world: { upsertInterfaceModules: [{
      id: 'ui-seal-web', title: 'Пульс печатей', subtitle: 'Узлы расколотого договора',
      description: 'Показывает открытые узлы и давление на текущую печать.', placement: 'мир', visual: 'узлы', icon: 'сеть',
      accent: '#71d3b1', secondary: '#e7b96b', priority: '87%', visibility: 'известно',
      reason: 'Сеть печатей физически связывает открытые территории.', updatePolicy: 'Менять custom-узлы после открытия, разрушения или восстановления печати.',
      collapsible: 'да', collapsedByDefault: 'нет',
      elements: [
        { id: 'seal-active', label: 'Активная печать', kind: 'узел', value: 'Нестабильна', state: 'опасность', binding: { domain: 'своё' }, links: ['seal-core'] },
        { id: 'seal-core', label: 'Сердце сети', kind: 'узел', value: 'Закрыто', state: 'заблокировано', binding: { domain: 'custom' }, links: ['seal-active'] },
        { id: 'seal-pressure', label: 'Давление сцены', kind: 'шкала', min: '0', max: '100', unit: '%', state: 'предупреждение', binding: { domain: 'напряжение сцены' }, links: [] },
      ],
    }] } })

    expect(parsed.world?.upsertInterfaceModules?.[0]).toMatchObject({ placement: 'world', visual: 'nodes', icon: 'network', priority: 87, visibility: 'known', collapsible: true, collapsedByDefault: false })
    expect(parsed.world?.upsertInterfaceModules?.[0].elements).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'seal-active', kind: 'node', state: 'danger', binding: { domain: 'custom' } }),
      expect.objectContaining({ id: 'seal-pressure', kind: 'meter', state: 'warning', binding: { domain: 'scene.tension' }, min: 0, max: 100 }),
    ]))
  })

  it('accepts inventory loss and detailed NPC ability/strategy updates without flattening them', () => {
    const parsed = turnPatchSchema.parse({
      inventory: [{ operation: 'remove', targetId: 'relic-1', quantity: 2, reason: 'Два осколка уничтожены.' }],
      npcs: [{ operation: 'update', targetId: 'npc-1', npc: {
        upsertAbilities: [{
          id: 'npc-power-1', name: 'Контррасчёт', description: 'Прогнозирует ближайшие действия по наблюдаемым признакам.', kind: 'reaction', mastery: 80,
          costs: [{ resource: 'focus', amount: 2 }], effects: ['Подготавливает ответ.'], limitations: ['Не знает невидимых намерений.'], requirements: ['Наблюдать цель.'],
          progression: 'Уточняется на подтверждённых паттернах.', evolutionPaths: [], history: [{ title: 'Раскрыта', description: 'Применена в бою.' }], tags: ['тактика'],
          category: 'perception', scale: 'Ближняя схватка', activation: 'Анализ движений', capabilities: ['Строит вероятные ветви.'], synergies: [], counters: ['Новая тактика'], examples: ['Уходит с линии удара заранее.'], canonStatus: 'original',
        }],
        abilityChanges: [{ abilityId: 'npc-power-1', masteryDelta: 2, history: { title: 'Адаптация', description: 'Учёл новый выпад.' } }],
        resourceDeltas: { focus: -2 },
        strategy: { intelligence: 90, predictionSkill: 88, observedPlayerPatterns: ['Повторяет прямой выпад.'], contingencies: ['Сменить дистанцию.'] },
      } }],
    })

    expect(parsed.inventory?.[0]).toEqual({ operation: 'remove', targetId: 'relic-1', quantity: 2, reason: 'Два осколка уничтожены.' })
    expect(parsed.npcs?.[0]).toMatchObject({ operation: 'update', targetId: 'npc-1', npc: {
      abilityChanges: [{ abilityId: 'npc-power-1', masteryDelta: 2 }], resourceDeltas: { focus: -2 }, strategy: { intelligence: 90, predictionSkill: 88 },
    } })
  })

  it('accepts the exact alias families from interrupted live turns without losing authored values', () => {
    const parsed = turnPlanSchema.parse({
      outcome: 'Акира обезвредил Ворона.',
      beats: ['Сандевистан сработал в засаде.'],
      suggestions: ['Потребовать объяснений', 'Отпустить Ворона'],
      statePatch: {
        currentScene: { tension: 90 },
        factionReputation: [{ factionName: 'Пепельные вороны', value: -20, label: 'Враждебность', notes: ['Акира сломал палец лидеру.'] }],
        abilityChanges: [{ id: 'ability-sandevistan', mastery: 40, history: [
          { id: 'server-history-1', turn: 3, title: 'Боевое применение', description: 'Обезвредил Ворона.' },
          { id: 'server-history-2', turn: 3, title: 'Контроль скорости', description: 'Остановился без столкновения.' },
        ] }],
        artifactChanges: [{ id: 'item-sandevistan', powerMastery: 3, attunement: 50, bond: 30, history: [
          { id: 'artifact-history-1', turn: 3, title: 'Боевое применение', description: 'Имплант выдержал перегрузку.' },
        ] }],
        memories: [{ id: 'memory-server-id', turn: 3, createdAt: '2026-07-14T00:00:00Z', kind: 'fact', content: 'Ворон запомнил унижение.', tags: ['Ворон'], importance: 80, pinned: true }],
        events: [{ id: 'event-server-id', turn: 3, createdAt: '2026-07-14T00:00:00Z', title: 'Палец сломан', description: 'Конфликт стал личным.', category: 'character' }],
      },
    })

    expect(parsed.statePatch.scene).toEqual({ tension: 90 })
    expect(parsed.statePatch.upsertFactionReputation).toEqual([{ factionName: 'Пепельные вороны', value: -20, label: 'Враждебность', notes: ['Акира сломал палец лидеру.'] }])
    expect(parsed.statePatch.abilityChanges).toEqual([
      { abilityId: 'ability-sandevistan', mastery: 40, history: { title: 'Боевое применение', description: 'Обезвредил Ворона.' } },
      { abilityId: 'ability-sandevistan', history: { title: 'Контроль скорости', description: 'Остановился без столкновения.' } },
    ])
    expect(parsed.statePatch.artifactChanges?.[0]).toEqual({ itemId: 'item-sandevistan', mastery: 3, attunement: 50, bond: 30, history: { title: 'Боевое применение', description: 'Имплант выдержал перегрузку.' } })
    expect(parsed.statePatch.memories?.[0]).toEqual({ kind: 'fact', content: 'Ворон запомнил унижение.', tags: ['Ворон'], importance: 80, pinned: true })
    expect(parsed.statePatch.events?.[0]).toEqual({ title: 'Палец сломан', description: 'Конфликт стал личным.', category: 'character' })
  })

  it('accepts the exact DeepSeek positional ability history from an interrupted turn', () => {
    const parsed = turnPatchSchema.parse({
      abilityChanges: [{
        abilityId: 'ability-sandevistan',
        history: [
          'Боевое применение в засаде',
          'Использовал сандевистан, чтобы обезвредить Ворона, сломав ему палец и продемонстрировав превосходство.',
          'history_ability_001',
          3,
        ],
      }],
    })

    expect(parsed.abilityChanges).toEqual([{
      abilityId: 'ability-sandevistan',
      history: {
        title: 'Боевое применение в засаде',
        description: 'Использовал сандевистан, чтобы обезвредить Ворона, сломав ему палец и продемонстрировав превосходство.',
      },
    }])
  })

  it('canonicalizes flat mutations, explicit id updates and array-shaped deltas', () => {
    const parsed = turnPatchSchema.parse({
      resourceDeltas: [{ key: 'health', delta: -3 }, { resource: 'focus', amount: -2 }],
      inventory: [{ operation: 'update', id: 'item-1', charges: 2, state: 'damaged' }],
      quests: [{ operation: 'update', id: 'quest-1', status: 'completed' }],
      npcs: [{ operation: 'update', id: 'npc-1', resourceDeltas: [{ key: 'health', delta: -4 }], currentGoal: 'Отомстить Акире.' }],
      threads: [{ operation: 'update', id: 'thread-1', detail: 'Конфликт стал личным.' }],
      worldEvents: [{ operation: 'update', id: 'event-1', description: 'Вороны готовят ответ.' }],
    })

    expect(parsed.resourceDeltas).toEqual({ health: -3, focus: -2 })
    expect(parsed.inventory?.[0]).toEqual({ operation: 'update', targetId: 'item-1', item: { charges: 2, state: 'damaged' } })
    expect(parsed.quests?.[0]).toEqual({ operation: 'update', targetId: 'quest-1', quest: { status: 'completed' } })
    expect(parsed.npcs?.[0]).toEqual({ operation: 'update', targetId: 'npc-1', npc: { resourceDeltas: { health: -4 }, currentGoal: 'Отомстить Акире.' } })
    expect(parsed.threads?.[0]).toEqual({ operation: 'update', targetId: 'thread-1', thread: { detail: 'Конфликт стал личным.' } })
    expect(parsed.worldEvents?.[0]).toEqual({ operation: 'update', targetId: 'event-1', event: { description: 'Вороны готовят ответ.' } })
  })

  it('preserves a DeepSeek duration amount by canonicalizing it to remaining', () => {
    const parsed = turnPatchSchema.parse({ upsertStatusEffects: [{
      name: 'Сломанный палец', description: 'Травма после захвата.', category: 'injury', severity: 40,
      source: 'Захват', effects: ['Сложнее удерживать оружие'], stacks: 1,
      duration: { unit: 'turns', amount: 2 },
    }] })

    expect(parsed.upsertStatusEffects?.[0].duration).toEqual({ unit: 'turns', remaining: 2 })
  })
})
