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

    expect(system.content).toContain('npcs[{name,role,description,disposition,relationship,currentGoal,lastSeen,notes[],stats[')
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
    expect(system.content).toContain('capabilities[],synergies[],counters[],examples[],canonStatus')
    expect(system.content).toContain('Его abilities описываются ровно с той же полнотой')
    expect(system.content).toContain('factions[{name,description,attitude,status,power,influence,territory[],resources[],goals[],currentMove')
    expect(system.content).toContain('laws[{title,description,scope,authority,status,visibility,consequences[]}]')
    expect(system.content).toContain('mechanics[{name,description,category,trigger,effects[],source,discovered,status}]')
    expect(system.content).toContain('МИР ДОЛЖЕН УМЕТЬ РАЗВИВАТЬСЯ БЕЗ ГЕРОЯ')
    expect(system.content).toContain('АДАПТИВНЫЙ ИНТЕРФЕЙС, КОТОРЫЙ РОЖДАЕТСЯ ИЗ МИРА')
    expect(system.content).toContain('Это не жанровые пресеты')
    expect(system.content).toContain('interfaceModules[{id,title,subtitle?')
    expect(system.content).toContain('binding.domain: custom, player.resource')
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
    expect(critic).toContain('interfaceModules спроектированы из фактической структуры именно этого мира')
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
    expect(editor).toContain('world.upsertInterfaceModules/removeInterfaceModuleIds')
    expect(director).toContain('Элемент с binding обновляется приложением автоматически')
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
  })
})
