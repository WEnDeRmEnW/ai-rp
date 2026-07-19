import { describe, expect, it } from 'vitest'
import type { TurnPatch } from '../shared/types'
import { createDemoCampaign } from '../src/lib/demo'
import { mergeAuditPatch, mergePatches, sanitizePlan } from './orchestrator'
import { turnPlanSchema } from './schemas'

type InterfaceModuleDraft = NonNullable<NonNullable<TurnPatch['world']>['upsertInterfaceModules']>[number]
type WorldMetricDraft = NonNullable<NonNullable<TurnPatch['world']>['upsertMetrics']>[number]

function interfaceModule(id: string, title = 'Пульс мира', elementId = `${id}-value`): InterfaceModuleDraft {
  return {
    id, title, description: `Живой модуль «${title}».`, placement: 'dashboard', visual: 'cards', icon: 'pulse',
    accent: '#71d3b1', secondary: '#e7b96b', priority: 70, visibility: 'known', reason: 'Важен для этого мира.',
    updatePolicy: 'Обновлять при значимых событиях.', collapsible: true, collapsedByDefault: false,
    elements: [{ id: elementId, label: 'Значение', kind: 'value', value: 1, state: 'normal', links: [] }],
  }
}

function worldMetric(id: string, key: string, label: string): WorldMetricDraft {
  return {
    id, key, label, description: `Показатель «${label}».`, value: 10, min: 0, max: 100, visibility: 'known',
    source: 'Состояние мира', updatePolicy: 'Менять после значимых событий.',
  }
}

describe('turn patch merging', () => {
  it('keeps supplemental consequences without applying the same relationship, level or NPC field twice', () => {
    const merged = mergeAuditPatch({
      playerProfile: { levelDelta: 1, goal: 'Выжить' },
      relationships: [{ npcId: 'npc-raven', delta: -4, dimensions: { fear: 2 } }],
      npcs: [{ operation: 'update', targetId: 'npc-raven', npc: { currentGoal: 'Перехватить героя' } }],
      scene: { tension: 80 },
    }, {
      playerProfile: { levelDelta: 1, goal: 'Выжить', appearance: 'Порванный плащ' },
      relationships: [{ npcId: 'npc-raven', delta: -4, dimensions: { fear: 2, suspicion: 3 }, note: 'Запомнил угрозу' }],
      npcs: [{ operation: 'update', targetId: 'npc-raven', npc: { currentGoal: 'Перехватить героя', lastSeen: 'На крыше башни' } }],
      scene: { tension: 80, weather: 'Гроза' },
    })

    expect(merged.playerProfile).toEqual({ levelDelta: 1, goal: 'Выжить', appearance: 'Порванный плащ' })
    expect(merged.relationships).toEqual([
      { npcId: 'npc-raven', delta: -4, dimensions: { fear: 2 } },
      { npcId: 'npc-raven', delta: 0, dimensions: { suspicion: 3 }, note: 'Запомнил угрозу' },
    ])
    expect(merged.npcs).toEqual([
      { operation: 'update', targetId: 'npc-raven', npc: { currentGoal: 'Перехватить героя' } },
      { operation: 'update', targetId: 'npc-raven', npc: { lastSeen: 'На крыше башни' } },
    ])
    expect(merged.scene).toEqual({ tension: 80, weather: 'Гроза' })
  })

  it('keeps authored quest, event, lore and faction changes while accepting only omitted fields', () => {
    const merged = mergeAuditPatch({
      quests: [{ operation: 'update', targetId: 'quest-tower', quest: { description: 'Войти через верхний ярус.' } }],
      threads: [{ operation: 'update', targetId: 'thread-debt', thread: { detail: 'Долг должен быть возвращён до рассвета.' } }],
      worldEvents: [{ operation: 'update', targetId: 'event-storm', event: { description: 'Буря накрывает северный район.' } }],
      lore: [{ id: 'lore-signal', title: 'Сигнал башни', type: 'fact', content: 'Источник находится наверху.', keys: ['башня'], enabled: true, alwaysOn: false, secret: false, discovered: true, priority: 60 }],
      upsertFactionReputation: [{ factionName: 'Стража', value: -10, notes: ['Обнаружено проникновение'] }],
    }, {
      quests: [{ operation: 'update', targetId: 'quest-tower', quest: { description: 'Заменённый аудитором текст.', reward: 'Ключ от шлюза' } }],
      threads: [{ operation: 'update', targetId: 'thread-debt', thread: { detail: 'Заменённый аудитором текст.', dueTurn: 8 } }],
      worldEvents: [{ operation: 'update', targetId: 'event-storm', event: { description: 'Заменённый аудитором текст.', visibility: 'rumored' } }],
      lore: [{ id: 'other-id', title: 'Сигнал башни', type: 'fact', content: 'Противоречащая версия.', keys: ['башня'], enabled: true, alwaysOn: false, secret: false, discovered: true, priority: 90 }],
      upsertFactionReputation: [{ factionName: 'Стража', value: -25, notes: ['Повтор того же последствия'] }],
    })

    expect(merged.quests).toEqual([
      { operation: 'update', targetId: 'quest-tower', quest: { description: 'Войти через верхний ярус.' } },
      { operation: 'update', targetId: 'quest-tower', quest: { reward: 'Ключ от шлюза' } },
    ])
    expect(merged.threads?.[1]).toEqual({ operation: 'update', targetId: 'thread-debt', thread: { dueTurn: 8 } })
    expect(merged.worldEvents?.[1]).toEqual({ operation: 'update', targetId: 'event-storm', event: { visibility: 'rumored' } })
    expect(merged.lore).toHaveLength(1)
    expect(merged.upsertFactionReputation).toEqual([{ factionName: 'Стража', value: -10, notes: ['Обнаружено проникновение'] }])
  })

  it('preserves newly discovered clues and new steps in an evolving antagonist plan', () => {
    const campaign = createDemoCampaign()
    const ownerNpcId = campaign.npcs[0].id
    campaign.mysteryCases = [{
      id: 'mystery-signal', title: 'Источник сигнала', premise: 'Кто ведёт передачу?', truth: 'Передатчик спрятан в башне.',
      status: 'open', clues: [
        { id: 'clue-old', title: 'Частота', detail: 'Военная полоса.', location: 'Рынок', source: 'Сканер', discovered: true, essential: true },
        { id: 'clue-pattern', title: 'Ритм', detail: 'Импульсы повторяются по расписанию.', location: 'Рынок', source: 'Сканер', discovered: false, essential: false },
        { id: 'clue-power', title: 'Мощность', detail: 'Передатчик находится выше уровня улиц.', location: 'Рынок', source: 'Сканер', discovered: false, essential: true },
      ],
      redHerrings: [], revelationRules: ['Найти передатчик'], createdTurn: 0,
    }]
    campaign.antagonistPlans = [{
      id: 'plan-raven', ownerNpcId, title: 'Перехват', objective: 'Забрать ключ', method: 'Засада', currentStep: 0, pressure: 40,
      resources: ['Наблюдатель'], knowledge: ['Герой идёт к башне'],
      steps: [{ id: 'step-watch', title: 'Наблюдение', trigger: 'Герой выходит на площадь', consequence: 'Маршрут раскрыт', status: 'active' }],
      weaknesses: ['Один канал связи'], status: 'active', secret: true, lastAdvancedTurn: 0,
    }]
    const plan = turnPlanSchema.parse({
      outcome: 'Расследование и вражеский план развиваются.',
      beats: ['Герой находит след.', 'Противник готовит второй этап.'],
      suggestions: ['Проверить башню', 'Сменить маршрут'],
      statePatch: {
        upsertMysteryCases: [
          {
            ...campaign.mysteryCases[0],
            clues: [
              ...campaign.mysteryCases[0].clues,
              { id: 'clue-new', title: 'Эхо башни', detail: 'Сигнал отражается от верхнего яруса.', location: 'Башня', source: 'Личное наблюдение', discovered: true, essential: true },
            ],
          },
          {
            id: 'mystery-new', title: 'Пропавший курьер', premise: 'Куда исчез курьер?', truth: 'Его удерживают в доках.', status: 'open',
            clues: [
              { id: 'courier-route', title: 'Маршрут', detail: 'Последний маршрут вёл к докам.', location: 'Архив', source: 'Накладная', discovered: true, essential: true },
              { id: 'courier-mark', title: 'Знак', detail: 'На сумке был знак портовой артели.', location: 'Рынок', source: 'Свидетель', discovered: false, essential: false },
              { id: 'courier-clock', title: 'Время', detail: 'Курьер исчез во время пересменки.', location: 'Док', source: 'Журнал', discovered: false, essential: true },
            ],
            redHerrings: [], revelationRules: ['Опросить свидетелей'], createdTurn: 999,
          },
        ],
        upsertAntagonistPlans: [{
          ...campaign.antagonistPlans[0], currentStep: 1, pressure: 55, lastAdvancedTurn: 1,
          steps: [
            { ...campaign.antagonistPlans[0].steps[0], status: 'completed' },
            { id: 'step-ambush', title: 'Засада в башне', trigger: 'Герой входит внутрь', consequence: 'Выходы блокируются', status: 'pending' },
          ],
        }],
      },
    })

    const patch = sanitizePlan(campaign, plan).plan.statePatch
    expect(patch.upsertMysteryCases).toHaveLength(2)
    expect(patch.upsertMysteryCases?.find((entry) => entry.id === 'mystery-signal')?.clues.map((clue) => clue.id)).toEqual(['clue-old', 'clue-pattern', 'clue-power', 'clue-new'])
    expect(patch.upsertMysteryCases?.find((entry) => entry.id === 'mystery-new')?.createdTurn).toBe(1)
    expect(patch.upsertAntagonistPlans?.[0].steps.map((step) => step.id)).toEqual(['step-watch', 'step-ambush'])
  })

  it('surfaces invalid NPC, faction and social references instead of silently losing them', () => {
    const campaign = createDemoCampaign()
    const npc = campaign.npcs[0]
    npc.strategy = undefined
    npc.dossier = undefined
    const plan = turnPlanSchema.parse({
      outcome: 'Персонаж меняет цель, но модель путает несколько идентификаторов.',
      beats: ['Цель персонажа меняется.'],
      suggestions: ['Продолжить', 'Проверить сведения'],
      statePatch: {
        npcs: [{
          operation: 'update', targetId: npc.id, npc: {
            currentGoal: 'Добраться до башни',
            resourceDeltas: { ghost_resource: -3 },
            statDeltas: { ghost_stat: 2 },
            strategy: { currentPlan: 'Подготовить обход' },
            dossier: { revealedSections: ['strategyOverview'] },
          },
        }],
        factionReputationDeltas: { 'Несуществующая фракция': -5 },
        socialLinks: [{ id: 'bad-link', fromNpcId: npc.id, toNpcId: 'ghost-npc', kind: 'trust', label: 'Доверие', score: 10, secret: false, notes: [] }],
      },
    })

    const sanitized = sanitizePlan(campaign, plan)
    const npcPatch = sanitized.plan.statePatch.npcs?.[0]
    expect(npcPatch?.operation).toBe('update')
    if (npcPatch?.operation !== 'update') throw new Error('Expected NPC update')
    expect(npcPatch.npc).toEqual({ currentGoal: 'Добраться до башни', resourceDeltas: {}, statDeltas: {} })
    expect(sanitized.plan.statePatch.factionReputationDeltas).toEqual({})
    expect(sanitized.plan.statePatch.socialLinks).toEqual([])
    expect(sanitized.rejections.map((entry) => entry.message)).toEqual(expect.arrayContaining([
      expect.stringContaining('неизвестной характеристики'),
      expect.stringContaining('неизвестного ресурса'),
      expect.stringContaining('неполный новый раздел «strategy»'),
      expect.stringContaining('неполный новый раздел «dossier»'),
      expect.stringContaining('неизвестной фракции'),
      expect.stringContaining('социальная связь'),
    ]))
  })

  it('binds status-effect removals by a unique name and treats an already absent effect as a safe no-op', () => {
    const campaign = createDemoCampaign()
    campaign.player.statusEffects = [{
      id: 'effect-burn',
      name: 'Ожог ладони',
      description: 'Поверхностный ожог мешает точным движениям.',
      category: 'injury',
      severity: 20,
      source: 'Раскалённый металл',
      effects: ['Боль при движении кистью.'],
      stacks: 1,
      duration: { unit: 'turns', remaining: 1 },
      appliedTurn: 1,
    }]
    const plan = turnPlanSchema.parse({
      outcome: 'Ожог проходит после обработки.',
      beats: ['Ладонь обработана.'],
      suggestions: ['Продолжить', 'Проверить ладонь'],
      statePatch: { removeStatusEffectIds: ['Ожог ладони', 'effect-already-gone'] },
    })

    const sanitized = sanitizePlan(campaign, plan)

    expect(sanitized.plan.statePatch.removeStatusEffectIds).toEqual(['effect-burn'])
    expect(sanitized.rejections).toEqual(expect.arrayContaining([
      expect.objectContaining({ blocking: false, message: expect.stringContaining('уже отсутствующего статусного эффекта') }),
    ]))
  })

  it('rejects unknown world removals and removal of a character outside the party before applying a turn', () => {
    const campaign = createDemoCampaign()
    const npcId = campaign.npcs[0].id
    const plan = turnPlanSchema.parse({
      outcome: 'Модель попыталась удалить объекты, которых нет в текущем состоянии.',
      beats: ['Мир остаётся целостным.'],
      suggestions: ['Продолжить', 'Осмотреться'],
      statePatch: {
        party: { removeNpcIds: [npcId] },
        world: {
          removeRules: ['Несуществующее правило'],
          resolveMysteries: ['Несуществующая тайна'],
          removeFactions: ['Несуществующая фракция'],
          removeLocations: ['Несуществующая локация'],
          removeRouteIds: ['route-missing'],
          removePlaceIds: ['place-missing'],
          retireProcessIds: ['process-missing'],
          removeLawIds: ['law-missing'],
          removeMechanicIds: ['mechanic-missing'],
          removeInterfaceModuleIds: ['module-missing'],
          removeMetricIds: ['metric-missing'],
        },
      },
    })

    const sanitized = sanitizePlan(campaign, plan)
    expect(sanitized.plan.statePatch.party?.removeNpcIds).toEqual([])
    expect(sanitized.plan.statePatch.world).toMatchObject({
      removeRules: undefined,
      resolveMysteries: undefined,
      removeFactions: undefined,
      removeLocations: undefined,
      removeRouteIds: undefined,
      removePlaceIds: undefined,
      retireProcessIds: undefined,
      removeLawIds: undefined,
      removeMechanicIds: undefined,
      removeInterfaceModuleIds: undefined,
      removeMetricIds: undefined,
    })
    expect(sanitized.rejections.map((entry) => entry.message)).toEqual(expect.arrayContaining([
      expect.stringContaining('неизвестного правила'),
      expect.stringContaining('неизвестной тайны'),
      expect.stringContaining('неизвестной фракции'),
      expect.stringContaining('неизвестной локации'),
      expect.stringContaining('неизвестного маршрута'),
      expect.stringContaining('неизвестного места'),
      expect.stringContaining('неизвестного внешнего процесса'),
      expect.stringContaining('неизвестного закона'),
      expect.stringContaining('неизвестной механики'),
      expect.stringContaining('неизвестного модуля'),
      expect.stringContaining('неизвестного показателя мира'),
      expect.stringContaining('нет в отряде'),
    ]))
  })

  it('keeps only valid spatial and causal links for autonomous world changes', () => {
    const campaign = createDemoCampaign()
    campaign.world.places = [{
      id: 'place-existing', name: 'Северная страна', kind: 'country', description: 'Северная держава.', scale: 'страна',
      culture: [], notableFacts: [], currentSituation: 'Граница напряжена.', visibility: 'known', createdTurn: 0, lastChangedTurn: 0,
    }]
    campaign.world.processes = [{
      id: 'process-existing', title: 'Пограничный спор', description: 'Державы спорят о земле.', scopeIds: ['place-existing'], involvedFactionNames: [],
      drivers: ['Старая карта'], obstacles: ['Переговоры'], stage: 'Обмен нотами', momentum: 40, direction: 'rising', status: 'active',
      visibility: 'rumored', nextMilestone: 'Ответ посла', consequences: ['Закрытие границы'], createdTurn: 0, lastAdvancedTurn: 0,
    }]
    const parsed = turnPlanSchema.parse({
      outcome: 'Спор начинает влиять на торговлю.', beats: ['Совет готовит эмбарго.'], suggestions: ['Узнать новости', 'Продолжить путь'],
      statePatch: {
        world: { upsertProcesses: [{
          ...campaign.world.processes[0], scale: 'national', causeIds: ['process-missing'],
        }] },
        worldEvents: [{ operation: 'add', event: {
          id: 'event-embargo', title: 'Северное эмбарго', description: 'Совет перекрывает торговые пути.', status: 'scheduled', visibility: 'known', involvedIds: [],
          scale: 'national', scopeIds: ['place-existing', 'place-missing'], causeIds: ['process-existing', 'cause-missing'], consequences: ['Рост цен'],
        } }],
        threads: [{ operation: 'add', thread: {
          id: 'thread-smuggling', type: 'rumor', title: 'Контрабандный путь', detail: 'Купцы ищут обход.', participantIds: [campaign.player.id],
          status: 'active', secret: false, scale: 'regional', scopeIds: ['place-existing'], causeIds: ['event-embargo'],
        } }],
      },
    })

    const sanitized = sanitizePlan(campaign, parsed)
    expect(sanitized.plan.statePatch.world?.upsertProcesses?.[0].causeIds).toBeUndefined()
    expect(sanitized.plan.statePatch.worldEvents?.[0]).toMatchObject({ event: { scopeIds: ['place-existing'], causeIds: ['process-existing'] } })
    expect(sanitized.plan.statePatch.threads?.[0]).toMatchObject({ thread: { causeIds: ['event-embargo'] } })
    expect(sanitized.rejections.map((entry) => entry.message)).toEqual(expect.arrayContaining([
      expect.stringContaining('причинная ссылка'),
      expect.stringContaining('область причинного изменения'),
    ]))
  })

  it('sanitizes granular module and metric references in the same order in which the engine applies them', () => {
    const campaign = createDemoCampaign()
    campaign.world.interfaceModules = [{ ...interfaceModule('module-existing', 'След угрозы', 'element-existing'), createdTurn: 0, lastChangedTurn: 0 }]
    campaign.world.metrics = [{ ...worldMetric('metric-existing', 'threat_heat', 'Угроза'), lastChangedTurn: 0 }]
    const freshModule = interfaceModule('module-fresh', 'Контур ритуала', 'element-fresh')
    const plan = turnPlanSchema.parse({
      outcome: 'Интерфейс подстраивается под изменения мира.',
      beats: ['Угроза растёт.'],
      suggestions: ['Осмотреть пульт', 'Продолжить'],
      statePatch: { world: {
        upsertInterfaceModules: [freshModule],
        interfaceModuleChanges: [
          { moduleId: 'module-existing', module: { priority: 88 }, removeElementIds: ['element-existing', 'element-missing'] },
          { moduleId: 'module-fresh', removeElementIds: ['element-fresh'], upsertElements: [{ id: 'element-new', label: 'Стабильность', kind: 'meter', min: 0, max: 100, state: 'warning', links: [] }] },
          { moduleId: 'module-missing', module: { title: 'Ошибочная карточка' } },
        ],
        upsertMetrics: [worldMetric('metric-fresh', 'ritual_stability', 'Стабильность ритуала')],
        metricDeltas: { threat_heat: 2, 'metric-fresh': 3, metric_missing: 1 },
        removeMetricIds: ['metric-missing'],
      } },
    })

    const sanitized = sanitizePlan(campaign, plan)

    expect(sanitized.plan.statePatch.world?.interfaceModuleChanges).toHaveLength(2)
    expect(sanitized.plan.statePatch.world?.interfaceModuleChanges?.[0].removeElementIds).toEqual(['element-existing'])
    expect(sanitized.plan.statePatch.world?.interfaceModuleChanges?.[1]).toMatchObject({ moduleId: 'module-fresh', removeElementIds: ['element-fresh'] })
    expect(sanitized.plan.statePatch.world?.metricDeltas).toEqual({ threat_heat: 2, 'metric-fresh': 3 })
    expect(sanitized.plan.statePatch.world?.removeMetricIds).toBeUndefined()
    expect(sanitized.rejections.map((entry) => entry.message)).toEqual(expect.arrayContaining([
      expect.stringContaining('неизвестного модуля'),
      expect.stringContaining('неизвестного элемента'),
      expect.stringContaining('неизвестного или неоднозначного показателя'),
    ]))
  })

  it('preserves simultaneous world rules, mechanics, interface modules and nested presentation changes', () => {
    const background = {
      world: {
        system: { summary: 'Нейронная нагрузка меняет состояние имплантов.' },
        presentation: { labels: { scene: 'Сейчас' }, categoryLabels: { artifact: 'Киберимплант' } },
        upsertLaws: [{ id: 'law-neural', title: 'Нейронный предел' }],
        upsertMechanics: [{ id: 'mechanic-strain', name: 'Нейронная нагрузка' }],
        upsertInterfaceModules: [{ id: 'module-neural', title: 'Состояние кибернетики' }],
        interfaceModuleChanges: [{ moduleId: 'module-neural', module: { priority: 65 } }],
        removeInterfaceModuleIds: ['module-old'],
        interfaceBlueprint: { title: 'Нейропульт', subtitle: 'Фоновая компоновка' },
        upsertMetrics: [{ id: 'metric-strain', key: 'strain' }],
        metricDeltas: { strain: 2 },
        removeMetricIds: ['metric-old'],
      },
    } as TurnPatch
    const foreground = {
      world: {
        system: { progression: 'Импланты развиваются через настройку и безопасные испытания.' },
        presentation: { labels: { resources: 'Нагрузка' }, rarityLabels: { legendary: 'Единственный прототип' } },
        upsertLaws: [{ id: 'law-corp', title: 'Корпоративный контроль' }],
        upsertMechanics: [{ id: 'mechanic-scan', name: 'Удалённое сканирование' }],
        upsertInterfaceModules: [{ id: 'module-corp', title: 'Внимание корпорации' }],
        interfaceModuleChanges: [{ moduleId: 'module-corp', module: { pinned: true } }],
        interfaceBlueprint: { title: 'Корпоративный пульт', subtitle: 'Текущая компоновка' },
        upsertMetrics: [{ id: 'metric-alert', key: 'alert' }],
        metricDeltas: { strain: 3, alert: 1 },
        removeMetricIds: ['metric-obsolete'],
        removeLawIds: ['law-obsolete'],
      },
    } as TurnPatch

    const merged = mergePatches(background, foreground)

    expect(merged.world?.upsertLaws?.map((entry) => entry.id)).toEqual(['law-neural', 'law-corp'])
    expect(merged.world?.upsertMechanics?.map((entry) => entry.id)).toEqual(['mechanic-strain', 'mechanic-scan'])
    expect(merged.world?.upsertInterfaceModules?.map((entry) => entry.id)).toEqual(['module-neural', 'module-corp'])
    expect(merged.world?.interfaceModuleChanges?.map((entry) => entry.moduleId)).toEqual(['module-neural', 'module-corp'])
    expect(merged.world?.removeInterfaceModuleIds).toEqual(['module-old'])
    expect(merged.world?.interfaceBlueprint).toMatchObject({ title: 'Корпоративный пульт' })
    expect(merged.world?.upsertMetrics?.map((entry) => entry.id)).toEqual(['metric-strain', 'metric-alert'])
    expect(merged.world?.metricDeltas).toEqual({ strain: 5, alert: 1 })
    expect(merged.world?.removeMetricIds).toEqual(['metric-old', 'metric-obsolete'])
    expect(merged.world?.removeLawIds).toEqual(['law-obsolete'])
    expect(merged.world?.system).toMatchObject({
      summary: 'Нейронная нагрузка меняет состояние имплантов.',
      progression: 'Импланты развиваются через настройку и безопасные испытания.',
    })
    expect(merged.world?.presentation).toMatchObject({
      labels: { scene: 'Сейчас', resources: 'Нагрузка' },
      categoryLabels: { artifact: 'Киберимплант' },
      rarityLabels: { legendary: 'Единственный прототип' },
    })
  })

  it('keeps audit additions supplemental for adaptive modules, blueprints and world metrics', () => {
    const base = {
      world: {
        upsertInterfaceModules: [interfaceModule('module-base', 'Общее название')],
        interfaceModuleChanges: [{ moduleId: 'module-evolving', module: { priority: 70 }, upsertElements: [{ id: 'element-recorded' }] }],
        interfaceBlueprint: { title: 'Основной пульт' },
        upsertMetrics: [worldMetric('metric-heat', 'heat', 'Накал')],
        metricDeltas: { heat: 5 },
      },
    } as TurnPatch
    const audit = {
      world: {
        upsertInterfaceModules: [
          interfaceModule('module-base', 'Попытка замены'),
          interfaceModule('module-distinct', 'Общее название'),
          interfaceModule('module-evolving', 'Полная замена из аудита'),
        ],
        interfaceModuleChanges: [
          { moduleId: 'module-base', module: { subtitle: 'Не заменять полный апсерт' } },
          {
            moduleId: 'module-evolving', module: { priority: 99, subtitle: 'Новая деталь' },
            upsertElements: [{ id: 'element-recorded' }, { id: 'element-new' }], removeElementIds: ['element-recorded', 'element-old'],
          },
          { moduleId: 'module-distinct', module: { pinned: true } },
        ],
        interfaceBlueprint: { title: 'Аудитор не должен заменять пульт' },
        upsertMetrics: [worldMetric('metric-heat', 'heat', 'Накал'), worldMetric('metric-moon', 'moon', 'Луна')],
        metricDeltas: { 'metric-heat': 5, moon: 2 },
      },
    } as TurnPatch

    const merged = mergeAuditPatch(base, audit)

    expect(merged.world?.upsertInterfaceModules?.map((module) => module.id)).toEqual(['module-base', 'module-distinct'])
    expect(merged.world?.interfaceModuleChanges).toEqual([
      expect.objectContaining({ moduleId: 'module-evolving', module: { priority: 70 }, upsertElements: [{ id: 'element-recorded' }] }),
      expect.objectContaining({ moduleId: 'module-evolving', module: { subtitle: 'Новая деталь' }, upsertElements: [{ id: 'element-new' }], removeElementIds: ['element-old'] }),
      expect.objectContaining({ moduleId: 'module-distinct', module: { pinned: true } }),
    ])
    expect(merged.world?.interfaceBlueprint).toMatchObject({ title: 'Основной пульт' })
    expect(merged.world?.upsertMetrics?.map((metric) => metric.id)).toEqual(['metric-heat', 'metric-moon'])
    expect(merged.world?.metricDeltas).toEqual({ heat: 5, moon: 2 })
  })
})
