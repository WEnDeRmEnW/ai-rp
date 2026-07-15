import { describe, expect, it } from 'vitest'
import { createDemoCampaign } from '../src/lib/demo'
import { backgroundSimulatorPrompt, campaignEditorPrompt, conceptAnalystPrompt, consequenceAuditorPrompt, directorPrompt, progressionAuditPrompt, worldArchitectPrompt, worldQualityCriticPrompt } from './prompts'
import { demoWorld } from './demo'

describe('world architect prompt', () => {
  it('requires complete, model-authored NPC records', () => {
    const [system] = worldArchitectPrompt({
      inspiration: 'Мир шиноби',
      genre: 'Приключение',
      tone: 'Серьёзный',
      characterName: 'Акира',
      characterConcept: 'Странник',
      opening: 'Экзамен',
      canonMode: 'flexible',
      contentBoundaries: '',
    })

    expect(system.content).toContain('npcs[{name,role,description,personality,disposition,relationship,currentGoal,lastSeen,notes[],stats[')
    expect(system.content).toContain('strategy{intelligence,tacticalSkill,strategicSkill,predictionSkill')
    expect(system.content).toContain('Для каждого NPC обязательно самостоятельно придумай все поля')
    expect(system.content).toContain('не используй заглушки')
    expect(system.content).toContain('system{name,summary,progression,conflictResolution,consequences')
    expect(system.content).toContain('presentation{accent,accentStrong,secondary,surface,motif')
    expect(system.content).toContain('socialLinks[{fromNpcName,toNpcName')
    expect(system.content).toContain('routes[{id,from,to')
    expect(system.content).toContain('abilities[{name,description,rank,source,cooldown?,kind,mastery,costs[')
    expect(system.content).toContain('characterArcs[{ownerName,title,theme')
    expect(system.content).toContain('mysteryCases[{title,premise,truth')
    expect(system.content).toContain('antagonistPlans[{ownerName,title,objective')
    expect(system.content).toContain('influenceAssets[{kind,title,description')
    expect(system.content).toContain('Квоты на разумные предметы нет')
    expect(system.content).toContain('При sentient=false полностью опусти personality')
    expect(system.content).toContain('Точное имя без полного набора отличительных свойств считается ошибкой')
    expect(system.content).toContain('components[{name,description,role,status,capabilities[],required}]')
    expect(system.content).toContain('capabilities[],synergies[],counters[],examples[],techniques[{name,description,kind,category,mastery,activation,scale,costs[{resource,amount}],effects[],requirements[],limitations[],unlocked}],canonStatus')
    expect(system.content).toContain('Для атомарной способности верни techniques=[]')
    expect(system.content).toContain('Его abilities описываются ровно с той же полнотой')
    expect(system.content).toContain('factions[{name,kind,description,attitude,status,power,influence,territory[],resources[],goals[],currentMove')
    expect(system.content).toContain('places[{name,kind,parentName?,description,scale')
    expect(system.content).toContain('processes[{title,description,scopeNames[],involvedFactionNames[]')
    expect(system.content).toContain('laws[{title,description,scope,authority,status,visibility,consequences[]}]')
    expect(system.content).toContain('mechanics[{name,description,category,trigger,effects[],source,discovered,status}]')
    expect(system.content).toContain('МИР ДОЛЖЕН УМЕТЬ РАЗВИВАТЬСЯ БЕЗ ГЕРОЯ')
    expect(system.content).toContain('АДАПТИВНЫЙ ИНТЕРФЕЙС, КОТОРЫЙ РОЖДАЕТСЯ ИЗ МИРА')
    expect(system.content).toContain('Это не жанровые пресеты')
    expect(system.content).toContain('interfaceBlueprint{title,subtitle,defaultTab,tabs[{id,label,visible}],dashboardSections[],reason}')
    expect(system.content).toContain('metrics[{id,key,label,description,value,min,max,unit?,visibility,source,updatePolicy}]')
    expect(system.content).toContain('interfaceModules[{id,title,subtitle?')
    expect(system.content).toContain('pinned?,density?,emphasis?')
    expect(system.content).toContain('stateRules?{dangerBelow?,warningBelow?,positiveBelow?,positiveAbove?,warningAbove?,dangerAbove?}')
    expect(system.content).toContain('Допустимые interfaceBlueprint tab.id/defaultTab: dashboard, scene, hero, inventory, changes, world')
    expect(system.content).toContain('Допустимые interfaceModules.placement: dashboard, scene, hero, inventory, world')
    expect(system.content).toContain('visual: meters, nodes, slots, track, ledger, signals, radar, cards')
    expect(system.content).toContain('binding.domain: custom, player.level, player.resource')
    expect(system.content).toContain('world.metric, world.location-danger, world.process-momentum')
    expect(system.content).toContain('Машинные enum не переводи на русский')
    expect(system.content).toContain('worldPressures[{sourceKind,sourceName,sourceNpcName?')
    expect(system.content).toContain('opening{scene{title,location,time,weather,tension,presentNpcNames[]},pacing{beat,intensity,challengeTier,reason}')
    expect(system.content).toContain('threatProfile?{tier,scope,reputation')
    expect(system.content).toContain('dossier{familiarity,revealedSections[]')
    expect(system.content).toContain('Не копируй туда весь внутренний профиль')
    expect(system.content).toContain('Не создавай легендарного врага или бога по квоте')
  })

  it('separates canon analysis from generation and requires checklist coverage', () => {
    const input = {
      inspiration: 'Вселенная Marvel', genre: 'Супергероика', tone: 'Эпический', characterName: 'Алекс',
      characterConcept: 'Человек с Перчаткой Бесконечности', opening: 'После щелчка', canonMode: 'faithful', contentBoundaries: '',
    }
    const analysis = conceptAnalystPrompt(input)[0].content
    expect(analysis).toContain('не допустить подмены')
    expect(analysis).toContain('capabilityChecklist')
    expect(analysis).toContain('sourceComponent')

    const concept = {
      recognizedCanon: true,
      startingAccess: 'complete' as const,
      entities: [{
        name: 'Перчатка Бесконечности', exactName: 'Infinity Gauntlet', type: 'artifact' as const, source: 'Marvel Comics', continuity: 'Earth-616',
        identity: 'Составной космический артефакт', confidence: 100, mustPreserve: ['камни'],
        capabilityChecklist: [{ name: 'Пространство', description: 'Управление пространством', importance: 'core' as const, category: 'space' as const, sourceComponent: 'Камень Пространства' }],
        canonicalConstraints: [], adaptationConflicts: [{ trait: 'Tesseract', belongsTo: 'MCU', reason: 'Иное воплощение' }], namingRules: [],
        forbiddenDistortions: ['случайная разумность'], uncertainties: [],
      }],
      powerFantasy: 'Космический масштаб', desiredScale: 'Вселенский', originalityRules: [],
    }
    const architect = worldArchitectPrompt(input, concept)[0].content
    expect(architect).toContain('ОБЯЗАТЕЛЬНЫЙ ПРЕДВАРИТЕЛЬНЫЙ РАЗБОР КОНЦЕПТА')
    expect(architect).toContain('Камень Пространства')

    const critic = worldQualityCriticPrompt(input, concept, demoWorld({ ...input, provider: { provider: 'demo' } }))[0].content
    expect(critic).toContain('Каждая core и major возможность')
    expect(critic).toContain('подменена одноимённым аналогом')
    expect(critic).toContain('Живой мир готов к самостоятельному развитию')
    expect(critic).toContain('interfaceBlueprint, metrics и interfaceModules спроектированы из фактической структуры именно этого мира')
    expect(critic).toContain('Каждое worldPressure причинно')
    expect(critic).toContain('Стартовое dossier каждого NPC')
    expect(critic).toContain('opening.pacing совпадает с реальной первой сценой')
  })
})

describe('runtime customization prompts', () => {
  it('turns campaign settings into explicit director rules and gives the editor full state vocabulary', () => {
    const campaign = createDemoCampaign()
    campaign.settings.playerAgency = 'cinematic'
    campaign.settings.proseStyle = 'direct'
    campaign.settings.dialogueDensity = 'high'
    campaign.settings.npcAutonomy = 'independent'
    campaign.settings.worldDynamics = 'volatile'
    campaign.settings.contentBoundaries = 'Без натуралистичных пыток.'
    const director = directorPrompt(campaign, 'Осматриваюсь.', 'do').messages[0].content
    expect(director).toContain('ДЕЙСТВУЮЩИЕ НАСТРОЙКИ КАМПАНИИ')
    expect(director).toContain('нейтральные переходные движения героя')
    expect(director).toContain('Мир высокодинамичен')
    expect(director).toContain('Без натуралистичных пыток')

    const editor = campaignEditorPrompt(campaign, 'Измени название системы.')[0].content
    expect(editor).toContain('campaignPatch')
    expect(editor).toContain('settingsPatch')
    expect(editor).toContain('world.name/tagline/inspiration/genre/tone/overview/era/system/presentation')
    expect(editor).toContain('точные существующие id')
    expect(editor).toContain('world.interfaceBlueprint, world.upsertInterfaceModules, world.interfaceModuleChanges')
    expect(editor).toContain('world.upsertMetrics, world.metricDeltas и world.removeMetricIds')
    expect(editor).toContain('granular interfaceModuleChanges')
    expect(editor).toContain('dashboard/cards, pinned/density/emphasis')
    expect(director).toContain('Элемент с binding обновляется приложением автоматически')
    expect(director).toContain('metricDeltas используй только после фактического причинного триггера')
    expect(director).toContain('interfaceBlueprint не перестраивай на каждом ходе')
    expect(director).toContain('Досье NPC — строгая граница знаний ГЕРОЯ')
  })

  it('gives the owner editor the complete structured canon without dumping story prose', () => {
    const campaign = createDemoCampaign()
    campaign.lore = [{
      id: 'lore-complete-catalog', title: 'Полный пласт лора', type: 'history', content: 'Структурированный канон редактора.',
      keys: ['полный-каталог'], enabled: true, alwaysOn: false, secret: true, discovered: false, priority: 1,
    }]
    campaign.memories = [{
      id: 'memory-complete-catalog', kind: 'fact', content: 'Полная память редактора.', tags: ['полный-каталог'],
      importance: 1, turn: 1, createdAt: '2026-07-15T00:00:00.000Z',
    }]
    campaign.archives = [{
      id: 'archive-complete-catalog', kind: 'chapter', title: 'Архив редактора', summary: 'Структурированный итог главы.',
      startTurn: 1, endTurn: 2, tags: ['полный-каталог'], entityIds: [], importance: 1, createdAt: '2026-07-15T00:00:00.000Z',
    }]
    campaign.threads = [{
      id: 'thread-complete-catalog', type: 'rumor', title: 'Нить редактора', detail: 'Полная сюжетная нить.',
      participantIds: [], status: 'active', secret: true, createdTurn: 1,
    }]
    campaign.worldEvents = [{
      id: 'event-complete-catalog', title: 'Событие редактора', description: 'Полное отложенное событие.', status: 'scheduled',
      visibility: 'hidden', involvedIds: [], createdTurn: 1,
    }]
    campaign.documents = [{
      id: 'document-complete-catalog', title: 'Документ редактора', createdAt: '2026-07-15T00:00:00.000Z',
      chunks: [{ id: 'document-chunk-catalog', keys: ['полный-каталог'], text: 'СЕКРЕТНЫЙ_ПОЛНЫЙ_ТЕКСТ_ДОКУМЕНТА' }],
    }]
    campaign.messages.push({
      id: 'message-catalog-entry', role: 'assistant', turn: campaign.turn, createdAt: '2026-07-15T00:00:00.000Z',
      content: 'ПОЛНЫЙ_ХУДОЖЕСТВЕННЫЙ_ТЕКСТ_НЕ_ДОЛЖЕН_ПОПАСТЬ_В_РЕДАКТОР',
    })

    const user = campaignEditorPrompt(campaign, 'Проверь весь канон.')[1].content
    expect(user).toContain('"lore-complete-catalog"')
    expect(user).toContain('"memory-complete-catalog"')
    expect(user).toContain('"archive-complete-catalog"')
    expect(user).toContain('"thread-complete-catalog"')
    expect(user).toContain('"event-complete-catalog"')
    expect(user).toContain('"documentCatalog"')
    expect(user).toContain('"document-chunk-catalog"')
    expect(user).toContain('"characterCount":32')
    expect(user).toContain('"recentMessageIndex"')
    expect(user).toContain('"message-catalog-entry"')
    expect(user).not.toContain('ПОЛНЫЙ_ХУДОЖЕСТВЕННЫЙ_ТЕКСТ_НЕ_ДОЛЖЕН_ПОПАСТЬ_В_РЕДАКТОР')
    expect(user).not.toContain('СЕКРЕТНЫЙ_ПОЛНЫЙ_ТЕКСТ_ДОКУМЕНТА')
    expect(user).not.toContain('"recentStory"')
  })
})

describe('progression audit prompt', () => {
  it('audits only an explicitly named special item and preserves the AI decision about sentience', () => {
    const campaign = createDemoCampaign()
    const item = campaign.inventory[0]
    item.artifact = {
      sentient: false, awakened: true, attunement: 20, bond: 5,
      requirements: [], passiveEffects: [], combinedEffects: [], failureModes: [], components: [],
      powers: [{ id: 'power-trace', name: 'Чтение следа', description: 'Читает остаточный след.', mastery: 10, costs: [], limitations: ['Только один раз'] }],
      drawbacks: [], evolutionPaths: [], secrets: [],
    }

    const messages = progressionAuditPrompt(campaign, `Применяю «${item.name}» для чтения следа.`, { statePatch: {} })
    expect(messages).toBeDefined()
    expect(messages?.[0].content).toContain('sentient=false запрещён mood')
    expect(messages?.[1].content).toContain(item.id)
    expect(progressionAuditPrompt(campaign, 'Осматриваюсь по сторонам.', { statePatch: {} })).toBeUndefined()
  })

  it('recovers a missed Sandevistan upgrade from the latest scene on the next continuation', () => {
    const campaign = createDemoCampaign()
    campaign.turn = 7
    const ability = campaign.player.abilities[0]
    ability.name = 'Сандевистан: ускорение'
    ability.source = 'Имплант Сандевистан Militech Falcon'
    ability.history = [{ id: 'shallow-technique-history', turn: 7, title: 'Модернизация', description: 'Запись есть, но фактические поля не обновлены.' }]
    const item = campaign.inventory[0]
    item.name = 'Сандевистан Militech Falcon'
    item.history = [{ id: 'shallow-item-history', turn: 7, title: 'Модернизация', description: 'Журнал обновлён без изменения настоящей карточки.' }]
    item.artifact = {
      sentient: false, awakened: true, attunement: 40, bond: 0,
      requirements: [], passiveEffects: [], combinedEffects: [], failureModes: [], components: [],
      powers: [{ id: 'power-speed', name: 'Ускорение Сандевистана', description: 'Ускоряет реакцию.', mastery: 35, costs: [], limitations: [] }],
      drawbacks: [], evolutionPaths: [], secrets: [],
    }
    campaign.messages.push({
      id: 'upgrade-scene', role: 'assistant', turn: 7, createdAt: '2026-07-14T00:00:00.000Z',
      content: 'Техник улучшил Сандвевистан: установил новый модуль охлаждения и разблокировал второй импульс.',
    })

    const messages = progressionAuditPrompt(campaign, 'Продолжаю.', { statePatch: {} })
    expect(messages).toBeDefined()
    expect(messages?.[1].content).toContain(ability.id)
    expect(messages?.[1].content).toContain(item.id)
    expect(messages?.[1].content).toContain('новый модуль охлаждения')
  })
})

describe('turn patch prompt contracts', () => {
  const oldAmbiguousArtifactWording = 'powerMastery/attunement/bond'
  const exactHistory = 'history в abilityChanges и artifactChanges — ровно один JSON-объект'

  function expectProgressionShapes(content: string) {
    expect(content).toContain('{"abilityChanges":[{"abilityId":"<точный abilityId>","masteryDelta":3')
    expect(content).toContain('"capabilities":["полный актуальный список"]')
    expect(content).toContain('mastery — абсолютный итог 0–100, masteryDelta — добавочное изменение')
    expect(content).toContain('{"artifactChanges":[{"itemId":"<точный itemId>"')
    expect(content).toContain('"powerChanges":[{"powerId":"<точный powerId>"')
    expect(content).toContain('powerMasteryDeltas допустим только для простой практики')
    expect(content).toContain(exactHistory)
    expect(content).not.toContain(oldAmbiguousArtifactWording)
  }

  function expectSnapshotAndReputationShapes(content: string) {
    expect(content).toContain('Поля "currentScene" и "factionReputation" во входном контексте — только снимки для чтения')
    expect(content).toContain('{"factionReputationDeltas":{"<точное имя фракции>":-5}}')
    expect(content).toContain('{"upsertFactionReputation":[{"factionName":"<точное имя фракции>","value":-20')
  }

  it('gives the director exact canonical scene, reputation, progression and memory shapes', () => {
    const campaign = createDemoCampaign()
    const system = directorPrompt(campaign, 'Осматриваюсь.', 'do').messages[0].content

    expectSnapshotAndReputationShapes(system)
    expect(system).toContain('{"scene":{"title":"...","location":"...","time":"...","weather":"...","tension":90,"presentNpcIds":["<точный npcId>"]}}')
    expectProgressionShapes(system)
    expect(system).toContain('{"memories":[{"kind":"fact","content":"...","tags":["..."],"importance":80}]}')
    expect(system).toContain('Не возвращай серверные поля id, turn и createdAt')
    expect(system).toContain('factionReputationDeltas, upsertFactionReputation')
    expect(system).toContain('Полная утрата использует inventory remove')
    expect(system).toContain('Стратегический интеллект NPC — механика')
    expect(system).toContain('npc.upsertAbilities')
    expect(system).toContain('{"party":{"addNpcIds":["<точный npcId>"],"removeNpcIds":[],"roles":{"<точный npcId>":"проводник"}}}')
    expect(system).toContain('world.upsertPlaces')
    expect(system).toContain('world.upsertProcesses')
    expect(system).toContain('{"cleanup":{"threads"')
    expect(system).toContain('pacing обязателен на каждом ходе')
    expect(system).toContain('upsertWorldPressures')
    expect(system).toContain('Лёгкая сцена не является филлером')
    expect(system).toContain('Реакция не возникает из телепатии')
  })

  it('keeps the progression auditor on canonical deltas, absolutes and singular history objects', () => {
    const campaign = createDemoCampaign()
    const item = campaign.inventory[0]
    item.artifact = {
      sentient: false, awakened: true, attunement: 20, bond: 5,
      requirements: [], passiveEffects: [], combinedEffects: [], failureModes: [], components: [],
      powers: [{ id: 'power-trace', name: 'Чтение следа', description: 'Читает след.', mastery: 10, costs: [], limitations: [] }],
      drawbacks: [], evolutionPaths: [], secrets: [],
    }

    const messages = progressionAuditPrompt(campaign, `Применяю «${item.name}».`, { statePatch: {} })
    expect(messages).toBeDefined()
    expectProgressionShapes(messages![0].content)
  })

  it('prevents the background simulator from copying snapshot keys into a patch', () => {
    const system = backgroundSimulatorPrompt(createDemoCampaign(), 'Жду.')[0].content

    expectSnapshotAndReputationShapes(system)
    expect(system).toContain('factionReputationDeltas, upsertFactionReputation')
    expect(system).toContain('МИР КАК СИСТЕМА, А НЕ ДЕКОРАЦИЯ')
    expect(system).toContain('world.upsertLaws=[')
    expect(system).toContain('world.upsertMechanics=[')
    expect(system).toContain('world.places — не список декораций')
    expect(system).toContain('world.processes — долгие войны')
    expect(system).toContain('Отдельно проверяй worldPressures')
    expect(system).toContain('Без канала знания реакции нет')
    expect(system).toContain('используй локальный interfaceModuleChanges')
    expect(system).toContain('metricDeltas разрешён только если именно сейчас реально выполнен названный триггер')
    expect(system).toContain('{"interfaceBlueprint":{"title":"название пульта этого мира"')
    expect(system).toContain('{"interfaceModuleChanges":[{"moduleId":"точный существующий module.id"')
    expect(system).toContain('{"metricDeltas":{"точный существующий metric.key":5}}')
    expect(system).toContain('artifact.power-mastery, quest.active-count, quest.objective-progress')
    expect(system).toContain('и cleanup')
    expect(system).toContain('Новая фракция возникает лишь когда')
    expect(system).not.toContain(oldAmbiguousArtifactWording)
  })

  it('gives the consequence auditor the same complete canonical patch vocabulary', () => {
    const campaign = createDemoCampaign()
    const system = consequenceAuditorPrompt(campaign, 'Жду.', 'continue', { statePatch: {} }, 'Время идёт.')[0].content

    expectSnapshotAndReputationShapes(system)
    expect(system).toContain('{"scene":{"title":"...","location":"...","time":"...","weather":"...","tension":90,"presentNpcIds":["<точный npcId>"]}}')
    expectProgressionShapes(system)
    expect(system).toContain('{"memories":[{"kind":"fact","content":"...","tags":["..."],"importance":80}]}')
    expect(system).toContain('Любое поле с суффиксом Delta')
    expect(system).toContain('иерархический атлас')
    expect(system).toContain('передать id в cleanup')
  })
})
