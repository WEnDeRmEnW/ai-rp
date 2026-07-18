import type { Campaign, TurnResponse, WorldGenerationRequest } from '../shared/types.js'
import type { GeneratedWorld } from './schemas.js'
import { buildContextSelection } from '../shared/context.js'

export function demoTurn(campaign: Campaign, input: string): TurnResponse {
  const lower = input.toLocaleLowerCase('ru-RU')
  const selection = buildContextSelection(campaign, input)
  const mira = campaign.npcs.find((npc) => /мира/i.test(npc.name)) ?? campaign.npcs[0]
  const patch: TurnResponse['statePatch'] = {
    scene: { tension: Math.min(100, campaign.scene.tension + 4) },
    memories: [{ kind: 'summary', content: `В сцене «${campaign.scene.title}» герой предпринял: ${input.slice(0, 240)}`, tags: [campaign.scene.location, campaign.player.name], importance: 45 }],
    events: [{ title: 'Новый выбор', description: input.slice(0, 500), category: 'story' }],
  }
  let narrative: string
  let suggestions: string[]

  if (/эхо|коснут|записк/.test(lower)) {
    patch.resourceDeltas = { focus: -1 }
    patch.lore = [{
      title: 'Отголосок восьмого окна', type: 'secret',
      content: 'В отражении памяти Эрен увидел восьмое окно Обсерватории и собственную руку на латунном механизме.',
      keys: ['восьмое окно', 'Обсерватория', 'отголосок'], enabled: true, alwaysOn: false, secret: false, discovered: true, priority: 88,
    }]
    narrative = `Бумага под пальцами сперва кажется обычной — сухой, чуть шершавой. Затем тепло чернил проходит сквозь кожу.\n\nВокзал исчезает без перехода. Перед тобой на миг возникает круглый зал Обсерватории: семь тёмных окон и восьмое, заложенное чёрным стеклом. На латунном ободе лежит рука. Твоя рука. Серебряная нить на запястье натянута и уходит внутрь механизма, словно ты не открываешь окно, а удерживаешь его закрытым.\n\nЧужой голос произносит совсем рядом: «Когда забудешь меня — механизм решит, что ты согласен».\n\nВидение обрывается. Ты снова на перроне, но записка теперь пуста. Мира успевает подхватить тебя за локоть и сразу отпускает, заметив твой взгляд.\n\n— Значит, Эхо осталось, — тихо говорит она. В её облегчении слишком много личного. — Тогда мы ещё можем исправить ту ночь. Но если Архивариусы увидят пустую бумагу, они поймут, что ты вернулся.`
    suggestions = ['Потребовать от Миры правду о той ночи', 'Спрятать пустую записку и проверить серебряную нить', 'Спросить, кого я должен был забыть']
  } else if (/час|купол|осмотр|механизм/.test(lower)) {
    patch.inventory = [{ operation: 'add', item: { name: 'Зубец нулевой минуты', description: 'Тонкая латунная деталь, выпавшая из механизма часов. На ней выгравировано имя Эрена.', category: 'quest', quantity: 1, rarity: 'rare', equipped: false, effects: ['Подходит к звёздному часовому механизму'], origin: 'Часы Вокзала Нулевого часа' } }]
    patch.scene = { ...patch.scene, tension: Math.min(100, campaign.scene.tension + 8) }
    narrative = `Ты подходишь к центральной колонне часов. С близкого расстояния видно: двигаются не стрелки, а весь циферблат, медленно проворачиваясь против времени. Каждую минуту один из зубцов механизма проходит мимо узкой щели — и на мгновение в металле проступают выгравированные имена.\n\nОдно имя выскальзывает из темноты как раз напротив тебя: ЭРЕН.\n\nМеханизм щёлкает. Маленький латунный зубец падает на камень у твоих ног, хотя часы продолжают идти без него. Когда ты поднимаешь деталь, все пассажиры на дальнем конце перрона одновременно поворачивают головы. Их лица различны, но выражение одно и то же — узнавание.\n\n— В карман, быстро, — бросает Мира. Она становится между тобой и смотрительской будкой. За мутным стеклом уже зажигается зелёная лампа. — Это не часы показывают время. Они проверяют, чьи имена город ещё имеет право помнить.`
    suggestions = ['Спрятать зубец и уйти вместе с Мирой', 'Показать зубец смотрителю', 'Спросить, почему город проверяет моё имя']
  } else if (/мира|имя|знаешь|правд/.test(lower) && mira) {
    patch.relationships = [{ npcId: mira.id, delta: 2, note: 'Герой прямо потребовал ответа о прошлом.' }]
    patch.memories?.push({ kind: 'relationship', content: 'Мира признала, что знала Эрена до утраты его памяти.', tags: ['Мира', 'Эрен', 'прошлое'], importance: 78 })
    narrative = `Мира не отвечает сразу. Вокруг вас вокзал продолжает жить своей осторожной ночной жизнью: проводник гасит лампы у пустого состава, где-то за стеной звенит жетон, часы отступают ещё на одну минуту.\n\n— Потому что ты попросил меня запомнить, — наконец говорит она. — Не твоё лицо. Не то, кем ты был. Только имя. Ты сказал: если весь Эйдол забудет Эрена, я должна произнести его на этом перроне в ночь, когда погаснет Паломник.\n\nОна открывает латунный футляр всего на ширину пальца. Внутри виден край карты из чёрной бумаги и одна тонкая линия серебра, пульсирующая в том же ритме, что нить на твоём запястье.\n\n— Я выполнила обещание. Теперь твоя очередь решить, хочешь ли ты узнать, почему сам устроил собственное забвение.\n\nИз смотрительской будки выходит высокий человек в серой форме Архивариуса. Его взгляд сразу останавливается на приоткрытом футляре.`
    suggestions = ['Попросить Миру показать карту полностью', 'Заговорить с Архивариусом первым', 'Сделать вид, что мы незнакомы']
  } else {
    narrative = `Твой выбор меняет едва заметную геометрию сцены. Мира следит не столько за тобой, сколько за отражениями в вокзальном стекле. Там людей на перроне на одного больше, чем в действительности.\n\nКогда ты ${input.trim().replace(/[.!?]+$/, '').toLocaleLowerCase('ru-RU')}, лишняя фигура в отражении тоже приходит в движение — но на полшага раньше. Она поднимает руку и указывает не на выход, а на закрытый служебный тоннель под часами.\n\n— Не смотри прямо, — шепчет Мира, не разжимая губ. — Безымянные замечают тех, кто их узнаёт.\n\nИз тоннеля тянет дождём и горячим металлом. На двери проступает свежий знак: восемь коротких лучей вокруг пустого центра. С другой стороны кто-то трижды стучит, выдерживая между ударами ровно одну исчезнувшую секунду.`
    suggestions = ['Ответить тем же ритмом', 'Отойти от отражения и расспросить Миру', 'Открыть служебный тоннель']
  }

  return {
    narrative,
    suggestions,
    statePatch: patch,
    activeLoreIds: selection.lore.map((entry) => entry.id),
    recalledMemoryIds: selection.memories.map((memory) => memory.id),
    activeDocumentChunkIds: selection.documents.map((chunk) => chunk.id),
  }
}

type DemoLegend = GeneratedWorld['world']['legends'][number]
type DemoLegendSeed = {
  name: string
  title: string
  epithet: string
  role: string
  summary: string
  origin: string
  era: string
  stage: DemoLegend['stage']
  lifeStatus: DemoLegend['lifeStatus']
  scope: DemoLegend['scope']
  renown: number
  influence: number
  reputation: string
  classification: DemoLegend['powerStanding']['classification']
  basis: string
  domains: string[]
  evidence: string[]
  feats: string[]
  faction: string
  place: string
  visibility: DemoLegend['discovery']['visibility']
  encounterReadiness: number
  encounterCondition: string
  deedA: string
  deedB: string
  myth: string
  legacy: string
  legacyKind: DemoLegend['legacies'][number]['kind']
}

function demoLegend(seed: DemoLegendSeed): DemoLegend {
  const unavailable = ['dead', 'ascended'].includes(seed.lifeStatus)
  const rumored = seed.visibility === 'rumored'
  const hidden = seed.visibility === 'hidden'
  return {
    name: seed.name,
    aliases: [],
    titles: [seed.title],
    epithet: seed.epithet,
    role: seed.role,
    summary: seed.summary,
    origin: seed.origin,
    era: seed.era,
    stage: seed.stage,
    lifeStatus: seed.lifeStatus,
    scope: seed.scope,
    truthStatus: hidden ? 'unknown' : 'partly_true',
    renown: seed.renown,
    influence: seed.influence,
    reputation: seed.reputation,
    powerStanding: {
      classification: seed.classification,
      basis: seed.basis,
      domains: seed.domains,
      evidence: seed.evidence,
      uncertainties: [`Полный предел возможностей фигуры «${seed.name}» не подтверждён независимыми источниками.`],
    },
    knownFeats: seed.feats,
    disputedClaims: [seed.myth],
    associatedFactionNames: [seed.faction],
    relatedNpcNames: [],
    successorNpcNames: [],
    deeds: [
      {
        title: seed.deedA,
        summary: `${seed.name} изменил ход событий, применив свой уникальный принцип: ${seed.domains[0]}.`,
        era: seed.era,
        scale: seed.scope,
        scopeNames: [seed.place],
        factionNames: [seed.faction],
        witnesses: ['Независимые записи хранителей пути', 'Сохранившийся материальный след'],
        consequences: [`Последствия события до сих пор влияют на ${seed.place}.`],
        truth: 'confirmed',
        visibility: hidden ? 'hidden' : seed.visibility,
        renownImpact: 24,
      },
      {
        title: seed.deedB,
        summary: `${seed.name} повторно доказал силу в условиях, где обычные методы мира перестали работать.`,
        era: seed.era,
        scale: seed.scope,
        scopeNames: [seed.place],
        factionNames: [seed.faction],
        witnesses: ['Разрозненные архивные копии', 'След в устройстве местной власти или пути'],
        consequences: [`Возникло устойчивое наследие «${seed.legacy}».`],
        truth: hidden ? 'unknown' : 'partly_true',
        visibility: hidden ? 'hidden' : seed.visibility,
        renownImpact: 19,
      },
    ],
    myths: [{
      title: `Предание: ${seed.epithet}`,
      claim: seed.myth,
      origin: `Устные рассказы и спорные записи эпохи «${seed.era}».`,
      spread: `Историю передают в пределах влияния фракции «${seed.faction}», меняя детали под собственные интересы.`,
      believers: [`Часть последователей фракции «${seed.faction}»`],
      distortion: 'Рассказ объединяет подтверждённый результат и неподтверждённое объяснение способа, которым он был достигнут.',
      truth: hidden ? 'unknown' : 'distorted',
      visibility: hidden ? 'hidden' : seed.visibility,
    }],
    legacies: [{
      name: seed.legacy,
      kind: seed.legacyKind,
      description: `Действующее последствие пути ${seed.name}, сохраняющее принцип «${seed.domains[0]}» без полного повторения силы создателя.`,
      status: unavailable ? 'Сохранилось после смерти создателя' : 'Существует, но доступ и нынешний носитель не установлены окончательно',
      holderNpcNames: [],
      scopeNames: [seed.place],
      factionNames: [seed.faction],
      accessConditions: [seed.encounterCondition],
      consequences: [`Даёт миру новый способ влиять на область «${seed.domains[0]}».`],
      visibility: hidden ? 'hidden' : seed.visibility,
    }],
    currentState: {
      activity: unavailable ? 'Лично не действует; влияние продолжается через последствия и наследие.' : 'Точные действия не подтверждены; в мире сохраняются новые следы связанного принципа.',
      objective: unavailable ? 'Личная цель завершена вместе с жизнью; за трактовку наследия спорят живые.' : 'Предполагаемая цель выводится из последних следов, но не считается знанием героя.',
      locationName: seed.place,
      mobility: unavailable ? 'Историческая фигура; перемещаются только её идеи, последствия и наследие.' : 'Маршрут неизвестен и ограничен установленными путями мира.',
      encounterReadiness: unavailable ? 0 : seed.encounterReadiness,
      encounterConditions: unavailable ? [] : [seed.encounterCondition],
      blockers: unavailable ? ['Фигура исторически мертва'] : ['Нет достоверного текущего маршрута', 'Не выполнено условие пересечения'],
      signs: [`В ${seed.place} сохраняется проверяемый след, связанный с именем ${seed.name}.`],
      lastConfirmedAt: unavailable ? `Последняя подтверждённая запись относится к эпохе «${seed.era}».` : 'Современное местонахождение не подтверждено.',
    },
    emergence: {
      momentum: unavailable ? 18 : 43,
      nextMilestone: `Независимая проверка происхождения наследия «${seed.legacy}».`,
      qualifyingSigns: [seed.feats[0]],
      disqualifiers: ['Доказательство поздней подделки ключевых свидетельств'],
    },
    canon: {
      status: 'original',
      source: 'Оригинальная история Эйдола',
      continuity: 'Основная непрерывность демо-мира после Первого Разрыва',
      anchorFacts: [seed.summary, seed.feats[0]],
      forbiddenContradictions: [`Нельзя давать ${seed.name} способности вне установленного принципа «${seed.basis}».`, 'Нельзя превращать спорный рассказ в подтверждённый факт без нового свидетельства.'],
      divergenceNotes: [],
    },
    discovery: {
      visibility: seed.visibility,
      awareness: hidden ? 0 : rumored ? 24 : 62,
      revealedSections: hidden ? [] : rumored ? ['identity', 'myths'] : ['identity', 'summary', 'power', 'status', 'origin', 'deeds', 'myths', 'legacies', 'affiliations', 'canon'],
      evidence: hidden ? [] : rumored
        ? [{ section: 'myths', summary: seed.myth, source: 'Непроверенный рассказ', reliability: 31 }]
        : [
            { section: 'power', summary: seed.evidence[0], source: 'Сверенный архив', reliability: 86 },
            { section: 'deeds', summary: seed.feats[0], source: 'Материальный след', reliability: 91 },
          ],
    },
  }
}

function demoAdditionalLegends(): DemoLegend[] {
  return [
    demoLegend({
      name: 'Нарья Ломаная Карта', title: 'Картограф дорог без печатей', epithet: 'Та, что находила путь после исчезновения пути',
      role: 'Разведчица погасших маршрутов', summary: 'Нарья научилась читать остаточную геометрию уничтоженных дорог и выводила людей через пространства, которые официальные карты считали разорванными.',
      origin: 'Полевой картограф северных экспедиций.', era: 'Эпоха первых северных экспедиций', stage: 'renowned', lifeStatus: 'missing', scope: 'continental', renown: 58, influence: 63,
      reputation: 'Путевые мастера считают её спасительницей, а государственные картографы — источником опасных нелегальных маршрутов.', classification: 'dangerous',
      basis: 'Читает деформации пространства как многослойную карту и на короткое время совмещает разорванные участки пути.', domains: ['Навигация по разрушенному пространству', 'Создание кратких обходных маршрутов'],
      evidence: ['Три каравана прошли через официально уничтоженный северный узел', 'Её карты совпадают с позднейшими замерами Конклава'], feats: ['Вывела три каравана из складки пространства', 'Нашла обход погасшего Северного узла'],
      faction: 'Конклав пустого знака', place: 'Северное плато', visibility: 'hidden', encounterReadiness: 18, encounterCondition: 'Восстановить последнюю карту Нарьи и пройти по отмеченному ею несуществующему маршруту.',
      deedA: 'Исход из белой складки', deedB: 'Карта дороги после её уничтожения', myth: 'Нарья способна провести человека в любое место, если однажды видела его название.', legacy: 'Карты остаточной геометрии', legacyKind: 'technique',
    }),
    demoLegend({
      name: 'Орен Без Весов', title: 'Судья открытого следа', epithet: 'Человек, запретивший тайное доказательство',
      role: 'Создатель системы публичной проверки свидетельств', summary: 'Орен лишил закрытые архивы права выносить приговор без воспроизводимого следа и изменил устройство суда в центральных областях.',
      origin: 'Провинциальный писец, ставший главным судьёй после архивного мятежа.', era: 'Эпоха открытых судов', stage: 'renowned', lifeStatus: 'dead', scope: 'national', renown: 61, influence: 76,
      reputation: 'Для граждан он защитник от тайной власти, для старых архивариусов — виновник утраты управляемости суда.', classification: 'dangerous',
      basis: 'Соединял юридическую власть, безошибочную память формальных процедур и сеть независимых свидетелей, способную парализовать незаконное решение.', domains: ['Институциональная власть', 'Проверка и разрушение ложных свидетельств'],
      evidence: ['Его процедура отменила семь политических приговоров', 'Созданные им палаты до сих пор блокируют закрытое решение'], feats: ['Остановил Семь тайных процессов', 'Учредил право повторного свидетельства'],
      faction: 'Хранители порядка', place: 'Столица Семи', visibility: 'known', encounterReadiness: 0, encounterCondition: 'Получить доступ к запечатанному протоколу первого открытого суда.',
      deedA: 'Семь отменённых приговоров', deedB: 'Основание палаты повторного следа', myth: 'Орен видел ложь как трещину на лице говорящего.', legacy: 'Право повторного следа', legacyKind: 'law',
    }),
    demoLegend({
      name: 'Тарра Плавильщица Имён', title: 'Основательница кузниц личности', epithet: 'Та, что вернула имена целому городу',
      role: 'Мастер переплавки повреждённых личных печатей', summary: 'Тарра восстановила личности жителей города после архивной катастрофы, создав способ собирать имя из поступков, памяти близких и материальных следов.',
      origin: 'Ремесленница нижних кузниц, не принадлежавшая ни одному архивному дому.', era: 'Эпоха Пепельного реестра', stage: 'mythic', lifeStatus: 'dead', scope: 'global', renown: 94, influence: 91,
      reputation: 'Её считают доказательством, что личность не принадлежит государственному реестру.', classification: 'legendary',
      basis: 'Перестраивала сам принцип закрепления личности, соединяя независимые следы жизни в устойчивую печать без центрального архива.', domains: ['Восстановление разрушенной личности', 'Создание самоподтверждающихся печатей'],
      evidence: ['Город Пепельного реестра сохранил непрерывность граждан после уничтожения архива', 'Её печати выдержали три попытки государственного стирания'], feats: ['Вернула имена сорока тысячам жителей', 'Создала печать, не зависящую от единственного архива'],
      faction: 'Союз новой зари', place: 'Пограничный квартал', visibility: 'known', encounterReadiness: 0, encounterCondition: 'Собрать три независимых свидетельства личности владельца.',
      deedA: 'Возвращение города без реестра', deedB: 'Первая самосвидетельствующая печать', myth: 'Тарра могла вернуть человеку даже имя, которого у него никогда не было.', legacy: 'Кузницы непрерывного имени', legacyKind: 'school',
    }),
    demoLegend({
      name: 'Ора Нулевая Переправа', title: 'Неучтённая проводница', epithet: 'Пассажир, которого нет в расписании',
      role: 'Скрытая посредница между враждующими маршрутами', summary: 'Ора появляется в записях нескольких несовместимых дорог и проводит единичных людей через блокаду, не оставляя единого доказуемого маршрута.',
      origin: 'Не установлено; имя встречается только в несогласованных журналах перевозчиков.', era: 'Современная эпоха транспортного эмбарго', stage: 'notable', lifeStatus: 'unknown', scope: 'regional', renown: 27, influence: 39,
      reputation: 'Большинство считает Ору коллективным псевдонимом контрабандистов.', classification: 'capable',
      basis: 'Использует несовпадения расписаний, прав доступа и памяти наблюдателей, чтобы создавать один краткий законный проход там, где общего маршрута нет.', domains: ['Эксплуатация противоречий доступа', 'Скрытая перевозка через блокаду'],
      evidence: ['Один и тот же груз отмечен на двух закрытых берегах в течение часа', 'Три свидетеля описывают одинаковую проводницу, но разные суда'], feats: ['Провела лекарство через полную блокаду', 'Вывела свидетеля из закрытого порта'],
      faction: 'Дом Латунного пути', place: 'Тихая переправа', visibility: 'hidden', encounterReadiness: 36, encounterCondition: 'Создать невозможное по официальным правилам, но жизненно необходимое поручение на переправе.',
      deedA: 'Груз по несуществующему рейсу', deedB: 'Исчезновение свидетеля из закрытого порта', myth: 'Ора всегда приходит, если написать пункт назначения на обратной стороне запрещённого билета.', legacy: 'Нулевой билет', legacyKind: 'artifact',
    }),
    demoLegend({
      name: 'Мар Сорванный Шов', title: 'Воитель Первого Разрыва', epithet: 'Тот, кто удержал два несовместимых мира',
      role: 'Запечатанный носитель разлома пространства', summary: 'Мар принял в собственное тело расходящиеся края Первого Разрыва и не дал им разделить материк, после чего был запечатан вместе с незажившим швом.',
      origin: 'Командир безымянной стражи центрального узла.', era: 'Эпоха Первого Разрыва', stage: 'mythic', lifeStatus: 'sealed', scope: 'global', renown: 97, influence: 88,
      reputation: 'Официальные архивы называют его жертвой, тайные протоколы — продолжающимся элементом системы сдерживания.', classification: 'mythic',
      basis: 'Удерживает одновременно две несовместимые конфигурации пространства и принуждает окружающую реальность сохранять общий шов.', domains: ['Стабилизация континентального разлома', 'Одновременное существование в несовместимых пространствах'],
      evidence: ['Центральный разлом остаётся закрытым ровно в ритме печати Мара', 'Ослабление одного контура вызывает одинаковые раны на двух удалённых сторонах'], feats: ['Остановил разделение материка', 'Удержал две стороны разлома до создания семи печатей'],
      faction: 'Хранители порядка', place: 'Столица Семи', visibility: 'hidden', encounterReadiness: 7, encounterCondition: 'Семь печатей должны потерять синхронность, а центральный шов — открыть безопасный канал контакта.',
      deedA: 'Удержание Первого Разрыва', deedB: 'Семь дней в двух мирах', myth: 'Если Мар проснётся, он сам выберет, какая половина мира была настоящей.', legacy: 'Центральный живой шов', legacyKind: 'place',
    }),
    demoLegend({
      name: 'Ильва Шесть Дорог', title: 'Стратег независимых караванов', epithet: 'Победительница без единой битвы',
      role: 'Создательница распределённой обороны путей', summary: 'Ильва останавливала армии, меняя снабжение, право прохода и доверие перевозчиков так, что противник терял возможность вести войну до первого сражения.',
      origin: 'Дочь речного счетовода и полевого мастера дорог.', era: 'Эпоха Войны шести дорог', stage: 'renowned', lifeStatus: 'missing', scope: 'continental', renown: 67, influence: 79,
      reputation: 'Военные ненавидят её методы, а малые общины считают их единственной защитой от больших армий.', classification: 'elite',
      basis: 'Превращала логистику, нейтралитет, сведения о маршрутах и взаимные обязательства общин в единую стратегическую систему с множеством ложных центров.', domains: ['Континентальная стратегия снабжения', 'Распределённая оборона без центра'],
      evidence: ['Три армии распались без генерального сражения', 'Сохранившиеся приказы показывают шесть независимых планов, сходившихся к одному исходу'], feats: ['Остановила вторжение без открытой битвы', 'Создала сеть взаимного снабжения шести дорог'],
      faction: 'Дом Латунного пути', place: 'Долина Переправ', visibility: 'rumored', encounterReadiness: 22, encounterCondition: 'Восстановить цепочку из шести долгов перевозчиков, не нарушив нейтралитет ни одной общины.',
      deedA: 'Война, не дошедшая до поля', deedB: 'Шесть независимых приказов', myth: 'Ильва могла выиграть любую войну, просто назвав место, куда армия не должна прийти.', legacy: 'Доктрина шести дорог', legacyKind: 'school',
    }),
    demoLegend({
      name: 'Карст Последний Свидетель', title: 'Хранитель несократимой записи', epithet: 'Человек, которого нельзя вычеркнуть последним',
      role: 'Спящий гарант против полного переписывания истории', summary: 'Карст создал цепь свидетельств, в которой уничтожение любой версии события автоматически пробуждает другую, пока остаётся хотя бы один независимый носитель.',
      origin: 'Последний участник Совета разорванной летописи.', era: 'Эпоха Великого вымарывания', stage: 'legendary', lifeStatus: 'dormant', scope: 'continental', renown: 82, influence: 84,
      reputation: 'Для запрещённых историков он страховка правды, для властей — потенциальная машина нескончаемого мятежа.', classification: 'elite',
      basis: 'Связывает свидетельства условиями взаимного пробуждения, превращая попытку уничтожения истории в механизм её распространения.', domains: ['Самовосстанавливающаяся историческая запись', 'Защита свидетельств от централизованного стирания'],
      evidence: ['После трёх архивных чисток появлялись новые независимые копии одного протокола', 'Печать Карста реагирует только на подтверждённое уничтожение носителя'], feats: ['Сохранил протокол Великого вымарывания', 'Пережил уничтожение четырёх архивных цепей через независимых носителей'],
      faction: 'Конклав пустого знака', place: 'Северная обсерватория', visibility: 'rumored', encounterReadiness: 14, encounterCondition: 'Подтвердить уничтожение последней публичной копии протокола и найти сохранившегося независимого носителя.',
      deedA: 'Протокол, переживший четыре чистки', deedB: 'Последнее свидетельство Совета', myth: 'Карст просыпается внутри того, кто последним прочёл уничтоженную запись.', legacy: 'Цепь несократимого свидетельства', legacyKind: 'school',
    }),
  ]
}

type DemoNpc = GeneratedWorld['npcs'][number]
type DemoAbilityProfile = NonNullable<GeneratedWorld['player']['abilities'][number]['profile']>

function demoAbilityProfile(input: {
  name: string
  owner: string
  coreFantasy: string
  principle: string
  origin: string
  interaction: string
  experience: string
  groupId: 'group-omens' | 'group-relics' | 'group-strategy'
  groupLabel: string
  tierId: 'tier-personal' | 'tier-expert' | 'tier-master'
  tierLabel: string
  ceiling: string
  scope: string
  hidden?: boolean
}): DemoAbilityProfile {
  const revealed = input.hidden ? ['identity', 'standing'] as const : ['identity', 'principle', 'source', 'standing', 'facets', 'availability', 'techniques', 'counterplay', 'progression', 'history'] as const
  return {
    nature: { kind: input.groupId === 'group-relics' ? 'trained' : input.groupId === 'group-strategy' ? 'trained' : 'innate', groupId: input.groupId, label: input.groupLabel, explanation: `В Эйдоле «${input.name}» относится к группе «${input.groupLabel}» по фактическому способу действия.` },
    creativeIdentity: {
      coreFantasy: input.coreFantasy,
      centralPrinciple: input.principle,
      originPattern: input.origin,
      interactionModel: input.interaction,
      signatureExperience: input.experience,
      mechanicVerbs: input.groupId === 'group-strategy' ? ['наблюдать', 'проверять', 'перестраивать'] : input.groupId === 'group-relics' ? ['настраивать', 'спрашивать', 'сопоставлять'] : ['замечать', 'различать', 'предупреждать'],
      sensoryMotifs: input.groupId === 'group-strategy' ? ['смена ритма', 'развилки маршрута'] : input.groupId === 'group-relics' ? ['тёплая латунь', 'сенсорный отзвук'] : ['натяжение мгновения', 'тихий разлад окружения'],
      differentiation: input.groupId === 'group-strategy'
        ? ['Не читает мысли и работает только с доступными наблюдениями.', `Манера применения принадлежит именно владельцу: ${input.owner}.`]
        : ['Не сообщает готовое правильное решение.', `Проявление связано с личным опытом владельца: ${input.owner}.`],
    },
    ownerExpression: {
      summary: `${input.owner} применяет «${input.name}» через собственные привычки и приоритеты, не копируя чужую манеру.`,
      priorities: input.groupId === 'group-strategy' ? ['Сначала проверить дешёвую гипотезу', 'Сохранить путь отступления'] : ['Сначала отделить наблюдаемый признак от догадки'],
      habits: input.groupId === 'group-strategy' ? ['Сравнивает минимум две развилки'] : ['Останавливается на одном ясном сигнале'],
      signatures: [input.experience],
      avoids: ['Не объявляет неизвестное установленным фактом'],
    },
    standing: {
      systemId: 'eidol-capability-system', tierId: input.tierId, tierLabel: input.tierLabel,
      basis: `Класс подтверждён наблюдаемым пределом и установленной историей применения «${input.name}».`, ceiling: input.ceiling, scope: input.scope,
      evidence: [`Известно хотя бы одно подтверждённое применение владельцем ${input.owner}.`], uncertainties: input.hidden ? ['Полный предел герою пока неизвестен.'] : [],
    },
    facets: [
      { key: 'precision', label: 'Точность', value: input.tierId === 'tier-master' ? 86 : input.tierId === 'tier-expert' ? 72 : 44, description: 'Насколько надёжно владелец выделяет нужное условие.' },
      { key: 'reach', label: 'Охват', value: input.tierId === 'tier-master' ? 76 : input.tierId === 'tier-expert' ? 58 : 25, description: 'Реальный масштаб воздействия, не зависящий напрямую от mastery.' },
      { key: 'adaptation', label: 'Адаптация', value: input.groupId === 'group-strategy' ? 75 : 46, description: 'Способность менять применение после новой информации.' },
    ],
    presentation: {
      layout: input.groupId === 'group-strategy' ? 'network' : input.groupId === 'group-relics' ? 'constellation' : 'discipline',
      icon: input.groupId === 'group-strategy' ? 'network' : input.groupId === 'group-relics' ? 'rune' : 'eye', symbol: input.groupId === 'group-strategy' ? '⌘' : input.groupId === 'group-relics' ? '◐' : '⌁',
      motif: input.groupId === 'group-strategy' ? 'развилки контрплана' : input.groupId === 'group-relics' ? 'сенсорные следы памяти' : 'граница необратимого решения',
      accent: input.groupId === 'group-strategy' ? '#e7b96b' : '#71d3b1', secondary: input.groupId === 'group-relics' ? '#d1a45f' : '#b99af7', density: 'comfortable',
      sectionOrder: ['identity', 'principle', 'standing', 'facets', 'availability', 'techniques', 'counterplay', 'progression', 'history'], summary: input.coreFantasy,
    },
    discovery: {
      awareness: input.hidden ? 15 : 100, revealedSections: [...revealed], techniqueKnowledge: {},
      evidence: input.hidden ? [] : [{ section: 'identity', summary: `Герой наблюдал проявление «${input.name}».`, source: 'Установленный факт мира', reliability: 100 }],
    },
    availability: { state: 'ready', reasons: [] },
    developmentSeeds: [],
  }
}

type DemoStrongNpcSeed = {
  name: string
  role: string
  description: string
  personality: string
  goal: string
  lastSeen: string
  abilityName: string
  techniqueName: string
  abilityDescription: string
  source: string
  doctrine: string
  tier: NonNullable<DemoNpc['threatProfile']>['tier']
  mastery: number
  visibility: NonNullable<DemoNpc['threatProfile']>['visibility']
  intelligence: number
}

function demoStrongNpc(seed: DemoStrongNpcSeed): DemoNpc {
  return {
    name: seed.name,
    role: seed.role,
    description: seed.description,
    personality: seed.personality,
    disposition: 'Не связан с героем и действует по собственной цели',
    relationship: 0,
    currentGoal: seed.goal,
    lastSeen: seed.lastSeen,
    notes: ['Не является частью стартовой сцены.', 'Полный масштаб способностей герою неизвестен.'],
    stats: [
      { key: 'control', label: 'Контроль', value: seed.mastery, max: 100, description: 'Практический контроль собственной специализации.' },
      { key: 'judgement', label: 'Расчёт', value: seed.intelligence, max: 100, description: 'Качество анализа и выбора решения.' },
    ],
    resources: [
      { key: 'health', label: 'Здоровье', value: 100, max: 100, kind: 'health', criticalBelow: 20 },
      { key: 'focus', label: 'Оперативный резерв', value: 8, max: 8, kind: 'focus', criticalBelow: 2 },
    ],
    abilities: [{
      name: seed.abilityName,
      description: seed.abilityDescription,
      rank: seed.tier,
      source: seed.source,
      kind: 'active',
      mastery: seed.mastery,
      costs: [{ resource: 'focus', amount: 1 }],
      effects: [`Навязывает противнику условия доктрины: ${seed.doctrine}`],
      limitations: ['Работает только при доступе к установленному источнику и не даёт знаний, которых персонаж не получил.'],
      requirements: ['Сохранить концентрацию и иметь возможность применить собственный метод.'],
      progression: 'Развивается через реальные столкновения, разбор ошибок и расширение подготовленной инфраструктуры.',
      evolutionPaths: [{ name: 'Вторая доктрина', description: 'Создать иной способ применения того же принципа.', requirement: 'Пережить поражение первой схемы и понять его причину.', unlocked: false }],
      history: [{ title: 'Подтверждённое применение', description: `${seed.name} уже использовал эту силу в событии, установившем его нынешнюю репутацию.` }],
      tags: ['сильный NPC', seed.tier],
      category: 'control',
      scale: seed.tier === 'dangerous' ? 'Одна сложная сцена' : 'Поле боя или крупная операция',
      activation: 'Осознанное решение персонажа после оценки доступных сведений и позиции.',
      capabilities: [seed.abilityDescription, `Применять метод через приём «${seed.techniqueName}».`],
      synergies: ['Подготовленная позиция и достоверная разведка расширяют варианты применения.'],
      counters: ['Лишить доступа к источнику', 'Сломать подготовленную позицию', 'Предложить новый шаблон, которого персонаж не наблюдал'],
      examples: [`Вместо прямой атаки ${seed.name} использует «${seed.techniqueName}», чтобы изменить условия столкновения в пользу своей цели.`],
      techniques: [{
        name: seed.techniqueName,
        description: `Сигнатурный способ применить принцип «${seed.abilityName}» в конкретном столкновении.`,
        kind: 'reaction',
        category: 'control',
        mastery: Math.max(0, seed.mastery - 4),
        activation: 'После наблюдаемого действия цели и при сохранённой готовности.',
        scale: 'Один обмен действий',
        costs: [{ resource: 'focus', amount: 1 }],
        effects: ['Меняет позицию, темп или доступный выбор, не отменяя действие задним числом.'],
        requirements: ['Увидеть действие или заранее получить достоверное предупреждение.'],
        limitations: ['Не срабатывает против неизвестного действия вне восприятия.'],
        unlocked: true,
      }],
      canonStatus: 'original',
      profile: demoAbilityProfile({
        name: seed.abilityName, owner: seed.name, coreFantasy: seed.abilityDescription,
        principle: seed.doctrine, origin: seed.source,
        interaction: 'Собрать доступные сведения, выбрать подготовленную позицию и применить сигнатурный метод только после наблюдаемого действия цели.',
        experience: `Поле будто распадается на несколько маршрутов, после чего ${seed.name} закрывает наиболее выгодный противнику вариант.`,
        groupId: 'group-strategy', groupLabel: 'Доктрины и влияние',
        tierId: seed.tier === 'elite' || seed.tier === 'legendary' || seed.tier === 'mythic' ? 'tier-master' : 'tier-expert',
        tierLabel: seed.tier === 'elite' || seed.tier === 'legendary' || seed.tier === 'mythic' ? 'Мастер контура' : 'Проверенный специалист',
        ceiling: seed.tier === 'elite' || seed.tier === 'legendary' || seed.tier === 'mythic' ? 'Способен перестраивать крупную операцию в пределах подготовленной инфраструктуры.' : 'Способен изменить ход одной сложной сцены.',
        scope: seed.tier === 'dangerous' ? 'Одна сложная сцена' : 'Поле боя или крупная операция', hidden: true,
      }),
    }],
    knowledge: [{ subject: seed.lastSeen, statement: 'Персонаж знает собственный район деятельности, ресурсы и ближайшие риски.', status: 'known', confidence: 90, source: 'Личный опыт', secret: true }],
    relationshipDimensions: { trust: 0, respect: 0, affection: 0, fear: 0, suspicion: 0, dependence: 0 },
    initiative: {
      intent: seed.goal,
      nextMove: 'Продолжить собственную операцию без вмешательства в стартовую сцену героя.',
      trigger: 'Наступление следующего этапа независимого плана.',
      urgency: 48,
      blockedBy: ['Недостаток подтверждённых сведений о текущем препятствии'],
      visibility: 'hidden',
    },
    strategy: {
      intelligence: seed.intelligence,
      tacticalSkill: Math.max(55, seed.mastery - 3),
      strategicSkill: Math.max(52, seed.intelligence - 4),
      predictionSkill: Math.max(48, seed.intelligence - 8),
      adaptability: Math.max(50, seed.mastery - 7),
      deceptionSkill: 61,
      riskTolerance: 44,
      planningHorizon: 'Поддерживает основной план, одну проверяемую альтернативу и отдельный путь отхода.',
      decisionStyle: 'Сверяет цель, доступные сведения, цену ошибки и характер противника до применения силы.',
      observedPlayerPatterns: [],
      strengths: [seed.doctrine, 'Умение сохранять цель при изменении поля'],
      blindSpots: ['Склонен переоценивать надёжность собственной профессиональной инфраструктуры'],
      currentPlan: seed.goal,
      contingencies: ['Отступить к подготовленному узлу', 'Сменить прямое действие на сбор информации'],
      combatDoctrine: seed.doctrine,
      preferredRange: 'Дистанция, на которой сохраняется контроль источника и минимум один путь отхода.',
      teamworkStyle: 'Распределяет роли по компетенции и не раскрывает союзникам больше необходимого.',
      moraleProfile: 'Не ломается от первой неудачи, но не жертвует целью ради гордости.',
      retreatConditions: ['Источник силы недоступен', 'Цена продолжения превышает ценность текущей цели'],
      ethicalLimits: ['Не причиняет бессмысленный вред непричастным', 'Не применяет непроверенную меру с необратимым массовым последствием'],
      learnedAdaptations: [],
      countermeasures: [{
        name: `Контрмера: ${seed.techniqueName}`,
        against: 'Повторяемое прямое давление на контролируемую позицию',
        response: `Переводит столкновение в условия доктрины «${seed.doctrine}».`,
        requirements: ['Заметить повторение', 'Сохранить доступ к источнику'],
        tradeoffs: ['Расходует оперативный резерв', 'Выдаёт одну грань собственного метода'],
        status: 'available',
        visibility: 'hidden',
      }],
      visibility: 'hidden',
    },
    threatProfile: {
      tier: seed.tier,
      scope: seed.tier === 'dangerous' ? 'Локальная операция и подготовленная группа' : 'Региональная операция или сложное поле боя',
      reputation: `Среди профильных организаций ${seed.name} считается угрозой уровня ${seed.tier}; широкой публике сведения недоступны.`,
      powerBasis: seed.source,
      combatIdentity: seed.doctrine,
      signatureAbilities: [seed.abilityName, seed.techniqueName],
      threatVectors: ['Прямое применение уникального метода', 'Изменение позиции и доступных решений через подготовку'],
      defensiveLayers: ['Профессиональная контрмера против повторяемого давления', 'Заранее выбранный путь разрыва контакта'],
      battlefieldControl: [`Навязывает поле через принцип «${seed.abilityName}».`],
      informationAdvantages: ['Собственная сеть профессиональных наблюдений без доступа к мыслям героя'],
      preparedAssets: ['Один заранее подготовленный безопасный узел', 'Контакт внутри собственной организации'],
      engagementPhases: [
        { name: 'Проверка', trigger: 'Начало прямого противостояния', doctrine: 'Собрать один подтверждённый шаблон и не раскрывать главный приём.', priorities: ['Понять цель противника', 'Сохранить путь отхода'], signatureMoves: [seed.abilityName], openings: ['Неполные сведения ограничивают точность'], exitConditions: ['Шаблон подтверждён', 'Контакт разорван'] },
        { name: 'Навязывание условий', trigger: 'Получен подтверждённый шаблон либо защищаемая цель оказывается под угрозой', doctrine: seed.doctrine, priorities: ['Выполнить собственную цель', 'Не дать повторить успешный приём'], signatureMoves: [seed.techniqueName], openings: ['Расход резерва ограничивает число реакций'], exitConditions: ['Цель выполнена', 'Источник силы потерян', 'Цена стала неприемлемой'] },
      ],
      collateralRisks: ['Повреждение профессиональной инфраструктуры или маршрута, через который действует способность'],
      whyDangerous: [seed.abilityDescription, seed.doctrine, 'Персонаж меняет план после получения новой достоверной информации'],
      knownFeats: [`Успешно завершил операцию уровня ${seed.tier}.`, `Сохранил цель после провала первой тактической схемы.`],
      constraints: ['Не обладает всеведением', 'Зависит от конкретного источника и доступной позиции'],
      defeatRequirements: ['Сорвать доступ к источнику или инфраструктуре', 'Изменить шаблон действий и вынудить расходовать резерв впустую'],
      escalationTriggers: ['Прямая угроза защищаемой цели', 'Уничтожение подготовленного пути отхода'],
      visibility: seed.visibility,
    },
    recruitment: { status: 'unavailable', willingness: 0, reason: 'Не знает героя и занят собственной целью.', requirements: ['Причинно встретиться', 'Создать реальное совпадение интересов'] },
    voice: { style: 'Профессиональная речь с собственной терминологией и короткими решениями.', patterns: ['Сначала называет наблюдаемый факт, затем условие'], avoids: ['Не раскрывает скрытый план постороннему'] },
  }
}

function demoStrongNpcs(): DemoNpc[] {
  return [
    demoStrongNpc({
      name: 'Сава Глухой Колокол', role: 'Охотница на незаконные сигнальные печати', description: 'Следовательница, способная гасить передачу приказов и превращать организованную группу в набор изолированных людей.',
      personality: 'Терпеливая, подозрительная к красивым объяснениям и неожиданно бережная к рядовым исполнителям.', goal: 'Найти источник поддельных сигналов на западных дорогах.', lastSeen: 'Долина Переправ',
      abilityName: 'Глухой контур', techniqueName: 'Обрыв команды', abilityDescription: 'Выделяет и временно разрывает конкретный канал передачи приказа между печатями, людьми или устройствами, если успела установить его структуру.',
      source: 'Многолетняя служба в сигнальной инспекции и набор перенастроенных печатей подавления.', doctrine: 'Сначала лишает группу координации, затем изолирует ключевого исполнителя и предлагает остальным выйти из конфликта.',
      tier: 'dangerous', mastery: 58, visibility: 'hidden', intelligence: 74,
    }),
    demoStrongNpc({
      name: 'Эйд Кромочник', role: 'Независимый мастер границ печатей', description: 'Инженер и дуэлянт, который переносит рабочую границу локального закона и заставляет противника ошибаться в дистанции, праве доступа и направлении силы.',
      personality: 'Холодно любопытный, уважает точность и не прощает разрушения сложной системы из-за нетерпения.', goal: 'Удержать экспериментальный узел от присвоения любой из столичных фракций.', lastSeen: 'Северная обсерватория',
      abilityName: 'Подвижная кромка', techniqueName: 'Смена стороны', abilityDescription: 'Перемещает заранее изученную границу действия одной печати, меняя внутри ограниченной зоны направление допуска, защиты или передачи импульса.',
      source: 'Авторский комплект граничных ключей и глубокое знание геометрии доразрывных печатей.', doctrine: 'Меняет смысл пространства вокруг цели: безопасная сторона становится внешней, а прямой путь выводит под действие другой границы.',
      tier: 'elite', mastery: 74, visibility: 'hidden', intelligence: 81,
    }),
    demoStrongNpc({
      name: 'Лоран Семь Мер', role: 'Арбитр конфликтов великих домов', description: 'Стратег, который превращает обязательства, ресурсы и публичные заявления сторон в точную систему давления, не позволяя сильнейшему навязать единственную цену.',
      personality: 'Вежливый, беспощадно последовательный и искренне убеждённый, что измеримая цена лучше благородной неопределённости.', goal: 'Не допустить открытой войны между Домом Латунного пути и Хранителями.', lastSeen: 'Столица Семи',
      abilityName: 'Семь мер обязательства', techniqueName: 'Встречный залог', abilityDescription: 'Фиксирует семь реально существующих ресурсов и обязательств сторон, затем связывает нарушение конкретного соглашения с немедленной потерей заранее названного преимущества.',
      source: 'Признанный арбитражный титул, сеть гарантов и техники юридических печатей.', doctrine: 'Не атакует первым: сужает пространство выгодных решений, пока оппонент не вынужден выбрать цену, которую сам признал допустимой.',
      tier: 'elite', mastery: 78, visibility: 'rumored', intelligence: 88,
    }),
  ]
}

function demoLegendariumBundle(): Pick<GeneratedWorld['world'], 'legendarium' | 'legends'> {
  return {
    legendarium: {
      name: 'Имена, пережившие печать',
      summary: 'В Эйдоле легендой считают не просто сильного человека, а того, чьё действие изменило право людей на путь, имя или память и оставило проверяемое наследие. Официальные архивы, дорожные предания и семейные записи часто спорят между собой.',
      recognitionRules: [
        'Свершение должно оставить устойчивое изменение закона, пути, печати или судьбы крупного сообщества.',
        'Должны сохраниться независимые свидетельства, материальный след либо действующее наследие.',
        'Известность без доказанного последствия создаёт знаменитость или слух, но не признанную легенду.',
      ],
      transmissionChannels: ['Архивы печатей', 'Песни перевозчиков', 'Семейные книги имён', 'Свидетельства дорожных мастеров', 'Подпольные копии запрещённых указов'],
      distortionForces: ['Государственная цензура', 'Переписывание имён победителями', 'Смешение нескольких носителей одного титула', 'Страх перед запретными печатями'],
      memoryKeepers: ['Архивариусы городов', 'Дорожные мастера', 'Семьи свидетелей', 'Конклав пустого знака'],
      erasureForces: ['Указы о вымарывании имени', 'Разрушение узлов памяти', 'Добровольные клятвы забвения', 'Подмена архивных печатей'],
      successionRules: ['Титул переходит только вместе с подтверждённой обязанностью, а не по праву крови.', 'Техника считается наследием после независимого воспроизведения учеником.', 'Артефакт не делает владельца наследником без признания хранителей свидетельств.'],
      encounterRules: ['Живую фигуру можно встретить только там, куда ведут её цель и доступные пути.', 'Мёртвые влияют через наследие, записи и последствия, если установленная механика не допускает возвращения.', 'Пропавшая или запечатанная фигура требует отдельной цепочки доказательств и условий доступа.'],
      thresholds: [
        { stage: 'notable', minRenown: 20, requirements: ['Одно исключительное действие', 'Хотя бы один достоверный свидетель или материальный след'] },
        { stage: 'renowned', minRenown: 40, requirements: ['Известность за пределами одного сообщества', 'Устойчивое последствие свершения'] },
        { stage: 'legendary', minRenown: 70, requirements: ['Несколько подтверждённых свершений', 'Действующее наследие или широко передаваемый миф'] },
        { stage: 'mythic', minRenown: 90, requirements: ['Влияние на устройство эпохи или мира', 'Наследие, пережившее прямых свидетелей'] },
      ],
    },
    legends: [
      {
        name: 'Аурел Семипечатный',
        aliases: ['Аурел Неподписанный'],
        titles: ['Первый хранитель общего закона'],
        epithet: 'Тот, кто отказался от восьмой печати',
        role: 'Основатель раннего союза городов и создатель принципа открытого свидетельства',
        summary: 'Аурел остановил превращение временного чрезвычайного совета в наследственную власть, отказавшись закрепить за собой тайную восьмую печать.',
        origin: 'Сын переписчика из доразрывного нижнего города, ставший посредником между семью враждующими общинами.',
        era: 'Первые десятилетия после Разрыва',
        stage: 'legendary',
        lifeStatus: 'dead',
        scope: 'national',
        truthStatus: 'partly_true',
        renown: 83,
        influence: 76,
        reputation: 'Хранители называют его основателем порядка, оппозиция — человеком, который первым ограничил власть хранителей; обе стороны опускают неудобные части его решений.',
        powerStanding: {
          classification: 'elite',
          basis: 'Глубокое знание архитектуры государственных печатей позволяло Аурелу вскрывать, перенастраивать и обрывать контуры власти непосредственно во время их применения.',
          domains: ['Контроль сложных печатей', 'Стратегия против институциональной власти'],
          evidence: ['Остановил восьмую печать во время мятежа', 'Удержал семь враждующих советов от силового раскола'],
          uncertainties: ['Неизвестно, мог ли он разрушать печати без доступа к их опорным контурам'],
        },
        knownFeats: ['Добился публичного чтения законов во всех семи городах', 'Остановил применение восьмой печати против целого квартала'],
        disputedClaims: ['Будто бы Аурел уничтожил восьмую печать собственным именем', 'Будто бы его завещание разрешает свергнуть любой закрытый совет'],
        associatedFactionNames: ['Хранители порядка'],
        relatedNpcNames: [],
        successorNpcNames: [],
        deeds: [
          {
            title: 'Открытие Зала свидетелям',
            summary: 'Аурел заставил семь советов допустить представителей городских общин к чтению чрезвычайных указов.',
            era: 'Год Девяти зим',
            scale: 'national',
            scopeNames: ['Столица Семи'],
            factionNames: ['Хранители порядка'],
            witnesses: ['Делегаты семи городов', 'Переписчики первого открытого архива'],
            consequences: ['Законы получили публичные копии', 'Появилось право оспаривать подменённую печать'],
            truth: 'confirmed',
            visibility: 'known',
            renownImpact: 28,
          },
          {
            title: 'Отказ от восьмой печати',
            summary: 'Во время мятежа Аурел не активировал тайный контур, способный стереть имена жителей нижнего города, и разобрал ключевой сегмент механизма.',
            era: 'Последний год Совета без окон',
            scale: 'regional',
            scopeNames: ['Столица Семи', 'Пограничный квартал'],
            factionNames: ['Хранители порядка'],
            witnesses: ['Трое хранителей внутреннего круга', 'Жители нижнего города, чьи имена сохранились'],
            consequences: ['Нижний город избежал коллективного стирания', 'Сведения о восьмом контуре были разделены между несколькими архивами'],
            truth: 'partly_true',
            visibility: 'rumored',
            renownImpact: 34,
          },
        ],
        myths: [{
          title: 'Имя вместо ключа',
          claim: 'Аурел навсегда запечатал восьмой контур, отдав механизму собственное истинное имя.',
          origin: 'Поминальные чтения нижнего города',
          spread: 'Рассказ переходил через семейные книги и подпольные копии запрещённого протокола.',
          believers: ['Семьи нижнего города', 'Часть Союза новой зари'],
          distortion: 'Протокол подтверждает разбор ключа, но не жертву имени; легенда, вероятно, объединила его смерть и исчезнувшую подпись.',
          truth: 'distorted',
          visibility: 'rumored',
        }],
        legacies: [{
          name: 'Право открытого свидетельства',
          kind: 'law',
          description: 'Устойчивый принцип, по которому чрезвычайный указ считается действительным только после сохранения независимой копии вне Зала.',
          status: 'Формально действует, но обходится закрытыми приложениями',
          holderNpcNames: [],
          scopeNames: ['Центральная область', 'Столица Семи'],
          factionNames: ['Хранители порядка'],
          accessConditions: ['Найти подлинную копию указа', 'Предъявить свидетеля или независимую архивную печать'],
          consequences: ['Позволяет оспаривать поддельные чрезвычайные решения', 'Делает уничтожение независимых архивов политически опасным'],
          visibility: 'known',
        }],
        currentState: {
          activity: 'Не действует напрямую; его решения продолжают определять закон и спор о восьмой печати.',
          objective: 'Личной действующей цели нет; незавершённое завещание используется разными сторонами как политическое основание.',
          mobility: 'Историческая фигура; влияние перемещается вместе с копиями протоколов и носителями права.',
          encounterReadiness: 0,
          encounterConditions: [],
          blockers: ['Аурел умер за столетия до текущей эпохи'],
          signs: ['Новые подпольные копии его протокола', 'Споры о подлинности последней подписи'],
          lastConfirmedAt: 'Смерть подтверждена книгой погребальных печатей',
        },
        emergence: {
          momentum: 18,
          nextMilestone: 'Публичная проверка найденной копии последнего протокола',
          qualifyingSigns: ['Его правовой принцип снова используется оппозицией'],
          disqualifiers: ['Доказательство того, что спорный протокол был поздней подделкой'],
        },
        canon: {
          status: 'original',
          source: 'Оригинальная история Эйдола',
          continuity: 'Основная непрерывность демо-мира после Первого Разрыва',
          anchorFacts: ['Аурел исторически умер', 'Он отказался применять восьмой контур', 'Право открытого свидетельства пережило его'],
          forbiddenContradictions: ['Нельзя вернуть Аурела как живого человека без установленной механики восстановления личности', 'Нельзя объявить восьмую печать уничтоженной без новых доказательств'],
          divergenceNotes: [],
        },
        discovery: {
          visibility: 'known',
          awareness: 66,
          revealedSections: ['identity', 'summary', 'power', 'status', 'origin', 'deeds', 'myths', 'legacies', 'affiliations'],
          evidence: [
            { section: 'summary', summary: 'Общедоступные учебные записи связывают Аурела с первым открытым чтением законов.', source: 'Городское образование', reliability: 82 },
            { section: 'power', summary: 'Разбор уцелевшего контура подтверждает, что восьмая печать была остановлена при активном запуске.', source: 'Технический архив печатей', reliability: 91 },
            { section: 'myths', summary: 'В нижнем городе рассказывают, что он отдал печати своё имя.', source: 'Семейное предание', reliability: 38 },
          ],
        },
      },
      {
        name: 'Сера Медный Жетон',
        aliases: ['Сера с Тихой воды'],
        titles: ['Первая хранительница нейтрального моста'],
        epithet: 'Та, перед кем сложили оружие оба берега',
        role: 'Создательница нейтралитета переправ и посредница в речной войне',
        summary: 'Сера превратила один мост из военной цели в место обязательных переговоров и заложила правила, которыми перевозчики пользуются до сих пор.',
        origin: 'Капитан грузовой баржи из семьи, потерявшей людей на обоих берегах речной войны.',
        era: 'Эпоха Речного раскола',
        stage: 'legendary',
        lifeStatus: 'dead',
        scope: 'regional',
        truthStatus: 'confirmed',
        renown: 78,
        influence: 69,
        reputation: 'Для перевозчиков она защитница пути, для старых военных домов — опасный прецедент власти без армии.',
        powerStanding: {
          classification: 'elite',
          basis: 'Сера соединяла мастерство речного боя, управление путями снабжения и сеть взаимных обязательств, способную лишить армию движения без генерального сражения.',
          domains: ['Манёвренный бой на воде', 'Контроль логистики и нейтральных маршрутов'],
          evidence: ['Провела караван сквозь две линии фронта', 'Добилась разоружения обеих сторон на нейтральных мостах'],
          uncertainties: ['Неясно, насколько её преимущество сохранялось вдали от рек и подготовленных маршрутов'],
        },
        knownFeats: ['Провела караван с зерном через линию двух армий без единого выстрела', 'Заключила первый договор нейтральных мостов'],
        disputedClaims: ['Будто бы печать моста сама лишала агрессоров воли', 'Будто бы Сера тайно утопила командиров, отказавшихся от переговоров'],
        associatedFactionNames: ['Дом Латунного пути'],
        relatedNpcNames: [],
        successorNpcNames: [],
        deeds: [
          {
            title: 'Караван без знамён',
            summary: 'Сера сняла флаги обоих берегов с зерновых барж и провела их через осаду под свидетельством голодающих общин.',
            era: 'Третья зима Речного раскола',
            scale: 'regional',
            scopeNames: ['Долина Переправ', 'Тихая переправа'],
            factionNames: ['Дом Латунного пути'],
            witnesses: ['Экипажи двадцати трёх барж', 'Старосты обоих берегов'],
            consequences: ['Города получили продовольствие', 'Военные дома впервые признали гражданский нейтральный конвой'],
            truth: 'confirmed',
            visibility: 'known',
            renownImpact: 31,
          },
          {
            title: 'Клятва середины моста',
            summary: 'Сера добилась соглашения, запрещающего вооружённым отрядам занимать мосты и склады переговорных поселений.',
            era: 'Последний год Речного раскола',
            scale: 'national',
            scopeNames: ['Тихая переправа', 'Долина Переправ'],
            factionNames: ['Дом Латунного пути'],
            witnesses: ['Двенадцать береговых старост', 'Мастера путевой печати'],
            consequences: ['Возникла сеть нейтральных переправ', 'Перевозчики получили самостоятельную политическую роль'],
            truth: 'confirmed',
            visibility: 'known',
            renownImpact: 36,
          },
        ],
        myths: [{
          title: 'Мост, гасящий ненависть',
          claim: 'Любой вошедший на мост с намерением убить забывает лицо врага.',
          origin: 'Послевоенные песни перевозчиков',
          spread: 'Песню поют на посвящении новых рулевых по всей Долине Переправ.',
          believers: ['Молодые перевозчики', 'Паломники безопасных путей'],
          distortion: 'Печать моста подавляет враждебные техники и оружейные контуры, но не меняет волю или память человека.',
          truth: 'distorted',
          visibility: 'known',
        }],
        legacies: [{
          name: 'Медный жетон нейтралитета',
          kind: 'title',
          description: 'Знак гостя и посредника, обязывающий переправу дать безопасное место для первого разговора.',
          status: 'Действующее право, признанное большинством речных общин',
          holderNpcNames: [],
          scopeNames: ['Долина Переправ', 'Тихая переправа'],
          factionNames: ['Дом Латунного пути'],
          accessConditions: ['Жетон выдаёт признанный совет перевозчиков', 'Носитель не должен первым нарушить нейтралитет'],
          consequences: ['Даёт ограниченную защиту и право на переговоры', 'Злоупотребление жетоном лишает доверия всю выдавшую общину'],
          visibility: 'known',
        }],
        currentState: {
          activity: 'Не действует напрямую; договор и жетоны поддерживаются советами перевозчиков.',
          objective: 'Исторической личной цели нет; её наследие направлено на сохранение переговорных путей.',
          mobility: 'Историческая фигура; влияние следует по речным маршрутам и обрядам выдачи жетона.',
          encounterReadiness: 0,
          encounterConditions: [],
          blockers: ['Сера умерла после завершения Речного раскола'],
          signs: ['Жетоны снова предъявляют в споре с Хранителями', 'Военные патрули проверяют пределы старого договора'],
          lastConfirmedAt: 'Могила Серы и книга совета перевозчиков доступны в Тихой переправе',
        },
        emergence: {
          momentum: 26,
          nextMilestone: 'Решение перевозчиков, распространять ли нейтралитет на государственные грузы',
          qualifyingSigns: ['Её договор остаётся рабочим в новом конфликте'],
          disqualifiers: ['Массовое нарушение жетонов самими перевозчиками'],
        },
        canon: {
          status: 'original',
          source: 'Оригинальная история Эйдола',
          continuity: 'Основная непрерывность демо-мира после Первого Разрыва',
          anchorFacts: ['Сера исторически умерла', 'Нейтральные мосты возникли из её соглашения', 'Печать подавляет враждебные техники, а не эмоции'],
          forbiddenContradictions: ['Нельзя приписывать мосту чтение мыслей или стирание памяти', 'Нельзя сделать жетон безусловной защитой после нарушения нейтралитета'],
          divergenceNotes: [],
        },
        discovery: {
          visibility: 'known',
          awareness: 72,
          revealedSections: ['identity', 'summary', 'power', 'status', 'origin', 'deeds', 'myths', 'legacies', 'affiliations', 'canon'],
          evidence: [
            { section: 'deeds', summary: 'Клятва середины моста записана в открытой книге перевозчиков.', source: 'Публичный договор', reliability: 96 },
            { section: 'power', summary: 'Судовые журналы подтверждают её контроль над караваном и действиями охраны под огнём двух берегов.', source: 'Журналы нейтрального конвоя', reliability: 89 },
            { section: 'myths', summary: 'Песня приписывает мосту власть над ненавистью.', source: 'Обрядовая песня', reliability: 44 },
          ],
        },
      },
      {
        name: 'Архивариус Лет',
        aliases: ['Безымянный восьмого окна'],
        titles: ['Последний хранитель доразрывного контура'],
        epithet: 'Человек, которого не удержал ни один список',
        role: 'Исследователь природы имени и создатель метода распределённой памяти',
        summary: 'Лет доказал, что имя можно сохранить не в одном архиве, а в сети независимых людей и предметов, после чего исчез из всех официальных записей.',
        origin: 'Архивариус Северной обсерватории; более ранние сведения о происхождении намеренно стёрты.',
        era: 'Поздняя эпоха восстановления сети',
        stage: 'legendary',
        lifeStatus: 'missing',
        scope: 'continental',
        truthStatus: 'partly_true',
        renown: 74,
        influence: 81,
        reputation: 'Конклав считает Лета спасителем знания, Хранители — автором опасного метода обхода закона, а большинство жителей знает только страшный рассказ о человеке без имени.',
        powerStanding: {
          classification: 'legendary',
          basis: 'Лет превращал память, имена и разнесённые носители в единую вычислительную сеть, способную переживать уничтожение отдельных узлов и обходить централизованный контроль.',
          domains: ['Распределённая память', 'Предсказание отказов архивной сети', 'Сокрытие личности от систем учёта'],
          evidence: ['Его архив пережил уничтожение центрального хранилища', 'Он заранее связал отказы трёх удалённых станций в одну модель'],
          uncertainties: ['Не установлено, сохранилось ли его сознание в распределённой сети', 'Неизвестно, способен ли он воздействовать на живую память напрямую'],
        },
        knownFeats: ['Создал распределённый архив, переживший уничтожение центрального хранилища', 'Предупредил три северные станции о синхронном отказе печатей'],
        disputedClaims: ['Будто бы Лет способен жить в чужих воспоминаниях', 'Будто бы он заранее записал имя нынешнего героя'],
        associatedFactionNames: ['Конклав пустого знака', 'Хранители порядка'],
        relatedNpcNames: ['Рин Астэр'],
        successorNpcNames: [],
        deeds: [
          {
            title: 'Архив без центра',
            summary: 'Лет разделил критические схемы сети между людьми, предметами и независимыми станциями, лишив власть возможности уничтожить знание одним приказом.',
            era: 'Год закрытых архивов',
            scale: 'continental',
            scopeNames: ['Северная обсерватория', 'Столица Семи', 'Тихая переправа'],
            factionNames: ['Конклав пустого знака', 'Хранители порядка'],
            witnesses: ['Хранители фрагментов', 'Мастера трёх путевых станций'],
            consequences: ['Часть схем пережила государственную чистку', 'Поиск фрагментов стал причиной скрытого конфликта'],
            truth: 'confirmed',
            visibility: 'rumored',
            renownImpact: 33,
          },
          {
            title: 'Предупреждение погасших узлов',
            summary: 'Лет связал малые отказы в единую модель и вывел людей с трёх станций до разрушения путей.',
            era: 'Последний подтверждённый год Лета',
            scale: 'regional',
            scopeNames: ['Северное плато', 'Северная обсерватория'],
            factionNames: ['Конклав пустого знака'],
            witnesses: ['Эвакуированные работники станций', 'Наблюдатели Конклава'],
            consequences: ['Сотни людей избежали изоляции', 'Хранители потребовали передать модель под закрытый контроль'],
            truth: 'confirmed',
            visibility: 'rumored',
            renownImpact: 24,
          },
        ],
        myths: [{
          title: 'Человек между воспоминаниями',
          claim: 'Лет не умер и не бежал: он распределил себя между всеми, кто помнит его имя.',
          origin: 'Закрытые семинары Конклава после исчезновения исследователя',
          spread: 'Фрагменты рассказа передают через задачи-пароли и предметы с неполными воспоминаниями.',
          believers: ['Молодые исследователи Конклава', 'Искатели запрещённых архивов'],
          distortion: 'Метод распределял сведения и ключи доступа; существование полной личности Лета внутри сети не подтверждено.',
          truth: 'unknown',
          visibility: 'rumored',
        }],
        legacies: [{
          name: 'Распределённая память',
          kind: 'school',
          description: 'Метод деления опасного знания на фрагменты, каждый из которых безопасен и бесполезен без доверительной сети хранителей.',
          status: 'Запрещён официально и тайно применяется Конклавом',
          holderNpcNames: ['Рин Астэр'],
          scopeNames: ['Северная обсерватория', 'Центральная область'],
          factionNames: ['Конклав пустого знака'],
          accessConditions: ['Получить доверие двух независимых хранителей', 'Доказать, что искатель не собирает знание для единоличного контроля'],
          consequences: ['Сохраняет знание после уничтожения архива', 'Создаёт риск ложного фрагмента и конфликта между хранителями'],
          visibility: 'rumored',
        }],
        currentState: {
          activity: 'Прямые действия не подтверждены; фрагменты его метода продолжают перемещаться между хранителями.',
          objective: 'Неизвестна. Последние записи указывают на попытку сохранить способ остановки цепного отказа сети.',
          locationName: 'Северная обсерватория',
          mobility: 'Физическое местоположение неизвестно; документальные и предметные следы движутся через курьеров Конклава.',
          encounterReadiness: 12,
          encounterConditions: ['Собрать несколько подлинных фрагментов распределённой памяти', 'Установить, сохранилась ли личность Лета или только его протокол'],
          blockers: ['Нет достоверного свидетельства, что Лет физически жив', 'Хранители изымают связанные фрагменты', 'Часть сети содержит намеренно ложные маршруты'],
          signs: ['Повторяющийся знак восьми лучей', 'Предметы, помнящие разные части одной сцены'],
          lastConfirmedAt: 'Последнее личное наблюдение относится к эвакуации северных станций',
        },
        emergence: {
          momentum: 49,
          nextMilestone: 'Совпадение трёх независимых фрагментов подтвердит либо опровергнет сохранение личности Лета',
          qualifyingSigns: ['Его метод снова нужен из-за цепного отказа', 'Новые хранители узнают общий код'],
          disqualifiers: ['Доказательство, что все новые послания созданы подражателем', 'Разрушение ключевых фрагментов сети'],
        },
        canon: {
          status: 'original',
          source: 'Оригинальная история Эйдола',
          continuity: 'Основная непрерывность демо-мира после Первого Разрыва',
          anchorFacts: ['Физическая судьба Лета неизвестна', 'Метод распределённой памяти реален', 'Полное сохранение личности не подтверждено'],
          forbiddenContradictions: ['Нельзя показывать Лета живым без прохождения условий и доказательств', 'Нельзя превращать метод в безошибочное бессмертие', 'Нельзя раскрывать все фрагменты одним слабым эффектом памяти'],
          divergenceNotes: [],
        },
        discovery: {
          visibility: 'rumored',
          awareness: 31,
          revealedSections: ['identity', 'myths', 'legacies'],
          evidence: [
            { section: 'identity', summary: 'Имя Лета встречается на повреждённой архивной печати и в закрытой помете к поручению.', source: 'Фрагмент документа', reliability: 57 },
            { section: 'myths', summary: 'Исследователи шепотом говорят, что он существует между чужими воспоминаниями.', source: 'Слух Конклава', reliability: 29 },
          ],
        },
      },
      ...demoAdditionalLegends(),
    ],
  }
}

export function demoWorld(input: WorldGenerationRequest): GeneratedWorld {
  const worldName = input.inspiration.split(/[,.—–\n]/)[0].trim().slice(0, 60) || 'Новый мир'
  return {
    title: `${worldName}: первая грань`,
    world: {
      name: worldName,
      tagline: 'У каждого решения остаётся след',
      inspiration: input.inspiration,
      genre: input.genre,
      tone: input.tone,
      era: 'Эпоха на границе больших перемен',
      overview: `${worldName} — целостный мир, собранный вокруг замысла: ${input.inspiration}. Привычный порядок начинает рушиться именно в день появления героя.`,
      rules: ['Сила всегда имеет цену и заметные последствия.', 'NPC действуют ради собственных целей и знают не всё.', 'Установленные события кампании важнее предположений и слухов.'],
      factions: [
        {
          name: 'Хранители порядка', kind: 'government', visibility: 'known', description: 'Защищают существующее устройство мира, даже когда оно перестаёт быть справедливым.', attitude: 'Наблюдают за героем',
          status: 'active', power: 72, influence: 'Контролируют городской совет, архивы и большую часть официальной стражи.', territory: ['Зал семи печатей', 'Старый центр'],
          resources: ['Городская стража', 'Архив законов', 'Сеть осведомителей'], goals: ['Сохранить монополию на толкование печатей', 'Не допустить открытого раскола совета'],
          currentMove: 'Проверяют сообщения о треснувшей печати в Пограничном квартале.', publicFace: 'Гаранты безопасности и непрерывности закона.',
          origin: 'Возникли после первого Разрыва как временный совет, но так и не сложили полномочия.', headquarters: 'Зал семи печатей', reach: 'Столица и города, связанные сетью печатей', secrets: ['Часть старших хранителей знает, что одна из печатей уже не действует.'],
        },
        {
          name: 'Союз новой зари', kind: 'movement', visibility: 'known', description: 'Разрозненные люди, желающие изменить правила.', attitude: 'Ищут способ довериться герою',
          status: 'active', power: 41, influence: 'Опираются на ремесленные кварталы, курьеров и сочувствующих чиновников.', territory: ['Пограничный квартал', 'Тихая переправа'],
          resources: ['Подпольные мастерские', 'Тайные переправы', 'Добровольцы'], goals: ['Добиться открытого суда над советом', 'Снять запрет на изучение повреждённых печатей'],
          currentMove: 'Ищут свидетеля, который докажет подделку старого указа.', publicFace: 'Гражданское движение за прозрачные законы.',
          origin: 'Сложились из семей, пострадавших от чрезвычайных указов Хранителей.', headquarters: 'Пограничный квартал', reach: 'Ремесленные города западного берега', secrets: ['Радикальное крыло готовит собственный способ разрушить одну из печатей.'],
        },
        {
          name: 'Дом Латунного пути', kind: 'guild', visibility: 'known', description: 'Союз перевозчиков и мастеров, обслуживающий дороги между печатями.', attitude: 'Оценивают надёжность героя',
          status: 'active', power: 53, influence: 'Контролируют перевозки, ремонт путевых узлов и обмен между берегами.', territory: ['Тихая переправа', 'Восточный тракт'],
          resources: ['Речной флот', 'Мастера путевых печатей', 'Кредитные книги'], goals: ['Сохранить нейтралитет переправы', 'Получить право ремонтировать государственные печати'],
          currentMove: 'Останавливают грузы Хранителей после исчезновения двух барж.', publicFace: 'Нейтральные перевозчики и хранители путей.',
          origin: 'Объединились вокруг первой безопасной переправы после Разрыва.', headquarters: 'Тихая переправа', reach: 'Речные и сухопутные пути центральной области', secrets: ['Старшие мастера тайно пропускают курьеров Новой зари.'],
        },
        {
          name: 'Конклав пустого знака', kind: 'institution', visibility: 'rumored', description: 'Закрытая школа исследователей, изучающая исчезающие имена и сломанные печати.', attitude: 'Считают героя возможным ключом',
          status: 'active', power: 36, influence: 'Имеют редкие знания и скрытые лаборатории, но почти не обладают публичной властью.', territory: ['Северная обсерватория'],
          resources: ['Архив доразрывных схем', 'Наблюдатели аномалий', 'Лаборатории'], goals: ['Понять природу пустого центра', 'Предотвратить цепной отказ сети'],
          currentMove: 'Сверяют случаи исчезновения имён в удалённых городах.', publicFace: 'Учёные, занимающиеся безопасностью старых сооружений.',
          origin: 'Возникли из группы архивариусов, отказавшихся уничтожить опасные исследования.', headquarters: 'Северная обсерватория', reach: 'Исследовательские станции по всему материку', secrets: ['Конклав знает способ временно исключить имя из действия закона.'],
        },
      ],
      locations: [
        { name: 'Пограничный квартал', description: 'Место, где старые законы впервые дают трещину.', danger: 35 },
        { name: 'Зал семи печатей', description: 'Центр власти и хранилище запрещённых решений.', danger: 72 },
        { name: 'Тихая переправа', description: 'Нейтральная земля, где встречаются враги.', danger: 48 },
        { name: 'Северная обсерватория', description: 'Удалённый исследовательский комплекс над полем погасших печатей.', danger: 61 },
      ],
      places: [
        { name: 'Материк Эйдол', kind: 'continent', description: 'Материк, чьи города соединены древней сетью пространственных печатей.', scale: 'материк', population: 'около двенадцати миллионов жителей', government: 'Несколько областных советов признают первенство столицы лишь формально.', economy: 'Речная торговля, ремесло печатей и перевозки между узлами.', culture: ['Имена и договоры считаются частью личности', 'Дороги имеют собственные обряды допуска'], notableFacts: ['Первый Разрыв расколол центральную сеть', 'Северные узлы постепенно гаснут'], currentSituation: 'Области спорят, кто должен оплачивать восстановление сети.', visibility: 'known' },
        { name: 'Центральная область', kind: 'region', parentName: 'Материк Эйдол', description: 'Самая густонаселённая область вокруг столицы и семи главных печатей.', scale: 'область', population: 'около четырёх миллионов жителей', government: 'Совет семи печатей и зависимые городские советы.', economy: 'Архивы, управление, перевозки и производство печатей.', culture: ['Публичная клятва сильнее частной договорённости'], notableFacts: ['Здесь сосредоточена большая часть действующих печатей'], currentSituation: 'Чрезвычайные проверки замедляют торговлю и вызывают протесты.', visibility: 'known' },
        { name: 'Столица Семи', kind: 'city', parentName: 'Центральная область', description: 'Многоуровневый город вокруг Зала семи печатей.', scale: 'столица', population: 'около восьмисот тысяч жителей', government: 'Городской совет под контролем Хранителей порядка.', economy: 'Администрация, архивы, лицензированное ремесло и рынок знаний.', culture: ['Жители носят личные печати доступа'], notableFacts: ['Нижние кварталы построены поверх доразрывного города'], currentSituation: 'Стража ищет источник трещины, а оппозиция собирает свидетелей.', visibility: 'known' },
        { name: 'Пограничный квартал', kind: 'district', parentName: 'Столица Семи', description: 'Рабочий район у нестабильной окраинной печати.', scale: 'городской квартал', population: 'около шестидесяти тысяч жителей', government: 'Выборный староста ограничен чрезвычайными указами столицы.', economy: 'Ремонтные мастерские, мелкая торговля и нелегальное изучение печатей.', culture: ['Соседи предупреждают друг друга ударами по водостокам'], notableFacts: ['Здесь появилась первая подтверждённая трещина'], currentSituation: 'Мастерские работают ночью, пока инспекторы опечатывают улицы.', visibility: 'known' },
        { name: 'Долина Переправ', kind: 'region', parentName: 'Материк Эйдол', description: 'Речная область между центральными и западными городами.', scale: 'речная область', population: 'около девятисот тысяч жителей', government: 'Советы перевозчиков и независимых береговых общин.', economy: 'Перевозки, судостроение, зерно и дорожные сборы.', culture: ['Нейтралитет гостя подтверждается медным жетоном'], notableFacts: ['Вооружённые отряды не имеют права входить на мосты'], currentSituation: 'Исчезновение барж грозит сорвать поставки в столицу.', visibility: 'known' },
        { name: 'Тихая переправа', kind: 'settlement', parentName: 'Долина Переправ', description: 'Нейтральный посёлок у самого стабильного речного узла.', scale: 'поселение', population: 'около восьми тысяч жителей', government: 'Совет перевозчиков и береговых старост.', economy: 'Паромы, склады, ремонт и переговорные дома.', culture: ['Любой спор сначала выносится на середину моста'], notableFacts: ['Местная печать гасит враждебные заклинания'], currentSituation: 'Перевозчики задерживают государственные грузы до расследования пропаж.', visibility: 'known' },
        { name: 'Северное плато', kind: 'wilderness', parentName: 'Материк Эйдол', description: 'Холодное плато с редкими городками и погасшими узлами.', scale: 'обширная дикая местность', population: 'около ста тысяч жителей в разрозненных поселениях', government: 'Формальной власти почти нет; станции договариваются между собой.', economy: 'Добыча редких металлов и наблюдение аномалий.', culture: ['Имена умерших вырезают на дорожных столбах'], notableFacts: ['Ночью здесь видны линии старой сети'], currentSituation: 'Несколько поселений потеряли связь после нового свечения.', visibility: 'rumored' },
        { name: 'Северная обсерватория', kind: 'station', parentName: 'Северное плато', description: 'Исследовательская станция Конклава над крупнейшим погасшим узлом.', scale: 'укреплённая станция', population: 'триста исследователей и обслуживающих работников', government: 'Внутренний совет Конклава пустого знака.', economy: 'Финансируется продажей карт аномалий и тайными грантами.', culture: ['Новые открытия записывают без имён авторов'], notableFacts: ['Под станцией находится доразрывный управляющий контур'], currentSituation: 'Наблюдатели фиксируют синхронное гашение удалённых печатей.', visibility: 'rumored' },
      ],
      processes: [
        { title: 'Цепной отказ северной сети', description: 'Погасшие узлы передают нестабильность на соседние территории.', scopeNames: ['Северное плато', 'Северная обсерватория'], involvedFactionNames: ['Конклав пустого знака', 'Хранители порядка'], drivers: ['Старые управляющие контуры теряют синхронизацию', 'Хранители скрывают масштаб отказов'], obstacles: ['Нехватка полевых мастеров', 'Запрет на независимые исследования'], stage: 'Три удалённых узла погасли почти одновременно.', momentum: 62, direction: 'rising', status: 'active', visibility: 'rumored', nextMilestone: 'Отказ ближайшего населённого путевого узла', dueTurn: 5, consequences: ['Изоляция северных поселений', 'Рост спроса на нелегальные карты', 'Политический конфликт вокруг данных Конклава'] },
        { title: 'Транспортное эмбарго переправ', description: 'Перевозчики удерживают грузы столицы после исчезновения двух барж.', scopeNames: ['Долина Переправ', 'Тихая переправа', 'Столица Семи'], involvedFactionNames: ['Дом Латунного пути', 'Хранители порядка'], drivers: ['Пропажа барж', 'Попытки стражи обыскать нейтральные склады'], obstacles: ['Зависимость переправ от столичных лицензий', 'Риск нехватки продовольствия'], stage: 'Государственные грузы остановлены на трёх причалах.', momentum: 48, direction: 'stable', status: 'active', visibility: 'known', nextMilestone: 'Переговоры Совета семи печатей с перевозчиками', dueTurn: 3, consequences: ['Рост цен в столице', 'Усиление чёрного рынка', 'Возможное вмешательство Новой зари'] },
        { title: 'Раскол Союза новой зари', description: 'Умеренное и радикальное крылья спорят о допустимости разрушения печати.', scopeNames: ['Пограничный квартал', 'Столица Семи'], involvedFactionNames: ['Союз новой зари'], drivers: ['Недоверие к законному суду', 'Репрессии против исследователей'], obstacles: ['Страх жертв среди жителей', 'Отсутствие единого лидера'], stage: 'Радикалы ищут доступ к повреждённому узлу, умеренные — свидетеля подделки.', momentum: 37, direction: 'rising', status: 'active', visibility: 'hidden', nextMilestone: 'Закрытое голосование координаторов движения', dueTurn: 4, consequences: ['Раскол организации', 'Саботаж печати либо публичное расследование', 'Изменение отношения квартала к герою'] },
      ],
      ...demoLegendariumBundle(),
      mysteries: ['Почему героя ждали до его появления?', 'Кто первым нарушил древнее равновесие?'],
      routes: [
        { id: 'route-quarter-hall', from: 'Пограничный квартал', to: 'Зал семи печатей', label: 'Старая караульная дорога', travelTime: 'два часа', distance: 8, danger: 62, discovered: true },
        { id: 'route-quarter-crossing', from: 'Пограничный квартал', to: 'Тихая переправа', label: 'Тропа вдоль воды', travelTime: 'сорок минут', distance: 3, danger: 34, discovered: true },
      ],
      laws: [
        { title: 'Указ о запечатанных знаниях', description: 'Исследование повреждённых печатей разрешено только лицензированным архивариусам.', scope: 'Города под властью Хранителей', authority: 'Совет семи печатей', status: 'contested', visibility: 'known', consequences: ['Конфискация материалов', 'Допрос исследователя', 'Потеря допуска в архивы'] },
        { title: 'Право тихой переправы', description: 'Вооружённые отряды не могут пересекать нейтральную переправу без согласия обеих береговых общин.', scope: 'Тихая переправа и прилегающие берега', authority: 'Совет перевозчиков', status: 'active', visibility: 'known', consequences: ['Отказ в перевозке', 'Общий сигнал тревоги', 'Ответное эмбарго общин'] },
      ],
      mechanics: [
        { name: 'След решения', description: 'Публичные поступки меняют отношение свидетелей и доступ к фракционным ресурсам.', category: 'social', trigger: 'Значимый поступок становится известен группе или фракции.', effects: ['Изменяется репутация', 'Открываются или закрываются контакты', 'NPC корректируют собственные планы'], source: 'Реакция общества на подтверждённые события', discovered: true, status: 'active' },
        { name: 'Трещины печатей', description: 'Повреждённые печати искажают локальные правила пространства и могут создавать новые устойчивые эффекты.', category: 'power', trigger: 'Печать повреждена, исследована или перегружена силой.', effects: ['Возникает локальная аномалия', 'Открывается новая возможность исследования', 'Фракции получают повод изменить планы'], source: 'Нарушение древней сети печатей', discovered: true, status: 'emerging' },
      ],
      interfaceModules: [
        {
          id: 'ui-threshold', title: 'Порог перемен', subtitle: 'Сцена отвечает на решения', description: 'Показывает, насколько текущий момент близок к необратимому перелому.',
          placement: 'scene', visual: 'meters', icon: 'spark', accent: '#71d3b1', secondary: '#e7b96b', priority: 92, visibility: 'known',
          reason: 'В этом мире последствия выбора являются отдельной наблюдаемой силой.', updatePolicy: 'Напряжение берётся из сцены; признаки перелома меняются только после подтверждённых событий.',
          collapsible: false, collapsedByDefault: false,
          elements: [
            { id: 'ui-threshold-tension', label: 'Напряжение', description: 'Непосредственное давление текущей сцены.', kind: 'meter', min: 0, max: 100, unit: '%', state: 'warning', binding: { domain: 'scene.tension' } },
            { id: 'ui-threshold-day', label: 'День истории', kind: 'value', state: 'normal', binding: { domain: 'world.day' } },
            { id: 'ui-threshold-sign', label: 'Точка невозврата', description: 'Пока только приближается.', kind: 'badge', value: 'Не пройдена', state: 'positive', binding: { domain: 'custom' } },
          ],
        },
        {
          id: 'ui-seal-network', title: 'Сеть печатей', subtitle: 'Живая геометрия мира', description: 'Открытые узлы древней системы и состояние связей между ними.',
          placement: 'world', visual: 'nodes', icon: 'network', accent: '#7adcc0', secondary: '#a58df0', priority: 86, visibility: 'known',
          reason: 'Повреждение одной печати меняет соседние территории и доступные маршруты.', updatePolicy: 'Добавлять узлы только после открытия печати; состояние и связи обновлять при повреждении, восстановлении или перегрузке.',
          collapsible: true, collapsedByDefault: false,
          elements: [
            { id: 'seal-quarter', label: 'Квартальная печать', description: 'Обнаружена трещина.', kind: 'node', value: 'Нестабильна', state: 'warning', binding: { domain: 'custom' }, links: ['seal-hall'] },
            { id: 'seal-hall', label: 'Семь печатей', description: 'Главный управляющий узел.', kind: 'node', value: 'Закрыта', state: 'locked', binding: { domain: 'custom' }, links: ['seal-quarter', 'seal-crossing'] },
            { id: 'seal-crossing', label: 'Переправа', description: 'Нейтральный стабилизатор.', kind: 'node', value: 'Стабильна', state: 'positive', binding: { domain: 'custom' }, links: ['seal-hall'] },
          ],
        },
        {
          id: 'ui-inner-compass', title: 'Внутренний компас', subtitle: 'То, на что опирается герой', description: 'Не отдельные характеристики, а связанные опоры, которые действительно двигают путь героя.',
          placement: 'hero', visual: 'radar', icon: 'compass', accent: '#e7b96b', secondary: '#71d3b1', priority: 78, visibility: 'known',
          reason: 'Развитие героя строится на решимости, понимании и сохранённом внимании.', updatePolicy: 'Значения всегда считываются из настоящих характеристик и ресурсов героя.',
          collapsible: true, collapsedByDefault: false,
          elements: [
            { id: 'compass-resolve', label: 'Воля', kind: 'meter', min: 0, max: 10, state: 'normal', binding: { domain: 'player.stat', key: 'resolve' } },
            { id: 'compass-insight', label: 'Видение', kind: 'meter', min: 0, max: 10, state: 'normal', binding: { domain: 'player.stat', key: 'insight' } },
            { id: 'compass-focus', label: 'Фокус', kind: 'meter', min: 0, max: 10, state: 'normal', binding: { domain: 'player.resource', key: 'focus' } },
          ],
        },
      ],
      system: {
        name: 'Грани перемен',
        summary: 'Мир отвечает на решения героя последствиями, отношениями и изменением расстановки сил.',
        progression: 'Развитие происходит через открытия, выполненные обязательства и освоение законов мира.',
        conflictResolution: 'Исход опирается на подходящие характеристики, ресурсы, обстоятельства и цену риска.',
        consequences: 'Неудача создаёт новое осложнение и меняет мир, не отменяя свободу дальнейшего выбора.',
        equipmentSlots: [
          { key: 'hand', label: 'В руке', accepts: ['weapon', 'artifact', 'other'] },
          { key: 'body', label: 'Защита', accepts: ['armor'] },
          { key: 'focus', label: 'Фокус', accepts: ['artifact', 'quest'] },
        ],
      },
      capabilitySystem: {
        id: 'eidol-capability-system',
        title: 'Контуры действия Эйдола',
        summary: 'Единая карта врождённых чувств, реликтовых практик и человеческих доктрин, которые меняют мир разными способами и поэтому не сводятся к рангу заклинаний.',
        masteryMeaning: 'Освоение показывает точность, устойчивость и разнообразие уже доступного владельцу применения.',
        powerMeaning: 'Мощность означает реальный предел и охват возможности; высокая освоенность слабой возможности не повышает её класс автоматически.',
        availabilityMeaning: 'Доступность отражает только существующие сейчас условия, ресурсы, блокировки и подготовку.',
        groups: [
          { id: 'group-omens', label: 'Чутьё границ', description: 'Врождённое восприятие необратимых решений и трещин причинности.', natureKinds: ['innate', 'psionic'], icon: 'eye', accent: '#71d3b1', secondary: '#b99af7', reason: 'Эйдол оставляет наблюдаемый след перед необратимым изменением.' },
          { id: 'group-relics', label: 'Реликтовый резонанс', description: 'Осознанные способы взаимодействия с памятью, печатями и личными реликвиями.', natureKinds: ['trained', 'magical', 'access'], icon: 'rune', accent: '#d1a45f', secondary: '#78c9bc', reason: 'Реликвии действуют по законам памяти и требуют отдельного языка практик.' },
          { id: 'group-strategy', label: 'Доктрины и влияние', description: 'Мастерство, власть, сеть, подготовка и тактические методы без превращения их в магию.', natureKinds: ['trained', 'social', 'authority', 'organizational'], icon: 'network', accent: '#e7b96b', secondary: '#71d3b1', reason: 'Компетентность и инфраструктура меняют доступные решения, но не являются сверхъестественной энергией.' },
        ],
        tiers: [
          { id: 'tier-personal', label: 'Личный отклик', order: 1, description: 'Надёжно влияет на самого владельца, один объект или одно решение.', scope: 'Один человек, предмет или момент', evidenceRequirements: ['Хотя бы одно подтверждённое личное применение.'] },
          { id: 'tier-expert', label: 'Проверенный специалист', order: 2, description: 'Способен устойчиво менять ход сложной сцены в своей области.', scope: 'Сцена, группа или локальная операция', evidenceRequirements: ['Несколько практических применений', 'Известные условия и пределы.'] },
          { id: 'tier-master', label: 'Мастер контура', order: 3, description: 'Перестраивает крупную операцию или устойчивую систему в пределах своей специализации.', scope: 'Поле боя, организация или региональная операция', evidenceRequirements: ['Доказанные крупные результаты', 'Способность адаптировать метод после противодействия.'] },
        ],
        comparisonRules: ['Сначала сравнивать фактический предел, затем доступность, универсальность и только после этого mastery.', 'Социальная власть и технология оцениваются по реальным каналам воздействия, а не как заклинания.', 'Общий источник сохраняет законы школы, но манера, техники и доказательства принадлежат конкретному владельцу.'],
      },
      presentation: {
        accent: '#71d3b1', accentStrong: '#95e6c9', secondary: '#e7b96b', surface: 'minimal', motif: 'след выбора',
        labels: {
          scene: 'Сцена', character: 'Герой', inventory: 'Снаряжение', world: 'Мир', quests: 'Нити', abilities: 'Таланты',
          lore: 'Кодекс', memories: 'Память', stats: 'Грани', resources: 'Ресурсы', conditions: 'Состояния', level: 'Ступень', chapter: 'Глава', turn: 'ход',
          action: 'Действие', speech: 'Реплика', direction: 'Замысел', continue: 'Дальше',
        },
        categoryLabels: {
          weapon: 'Оружие', armor: 'Защита', consumable: 'Припас', artifact: 'Реликвия', quest: 'Ключ', material: 'Материал', other: 'Снаряжение',
        },
        rarityLabels: {
          common: 'Обычное', uncommon: 'Необычное', rare: 'Редкое', exceptional: 'Исключительное', epic: 'Эпическое',
          legendary: 'Легендарное', mythic: 'Мифическое', transcendent: 'Запредельное',
        },
      },
    },
    player: {
      name: input.characterName,
      archetype: input.characterConcept.slice(0, 120),
      appearance: 'Облик героя можно уточнить в карточке персонажа.',
      personality: 'Характер определяется решениями игрока и не навязывается рассказчиком.',
      backstory: `Герой оказался связан с надвигающимися переменами. ${input.characterConcept}`,
      goal: 'Разобраться в конфликте мира и выбрать собственную сторону.',
      stats: [
        { key: 'resolve', label: 'Воля', value: 6, max: 10, description: 'Стойкость перед давлением.' },
        { key: 'insight', label: 'Проницательность', value: 6, max: 10, description: 'Способность замечать скрытые связи.' },
        { key: 'finesse', label: 'Мастерство', value: 5, max: 10, description: 'Точность и владение ремеслом.' },
      ],
      resources: [
        { key: 'health', label: 'Здоровье', value: 10, max: 10, color: '#f17b82', kind: 'health' },
        { key: 'focus', label: 'Фокус', value: 8, max: 10, color: '#71d3b1', kind: 'focus' },
      ],
      abilities: [
        {
          name: 'Чутьё перемен', description: 'Герой замечает моменты, когда решение может необратимо изменить ход событий.', rank: 'I', source: 'Внутренний дар',
          kind: 'passive', mastery: 18, costs: [], effects: ['Показывает признаки приближающейся точки невозврата'], limitations: ['Не раскрывает правильное решение'],
          requirements: ['Внимательно наблюдать за сценой'], progression: 'Развивается после решений с долгими последствиями.',
          category: 'perception', scale: 'Личная сцена', activation: 'Пассивно проявляется у точки необратимого выбора.',
          capabilities: ['Замечает наблюдаемые признаки точки невозврата'], synergies: ['Проницательность усиливает точность признаков'],
          counters: ['Намеренно скрытая причинность может запутать ощущение'], examples: ['Предчувствие необратимого разрыва договора'], canonStatus: 'original',
          techniques: [],
          evolutionPaths: [
            { name: 'Эхо выбора', description: 'Различать последствия для отношений.', requirement: 'Пережить три переломных решения.', unlocked: false },
            { name: 'Точка разлома', description: 'Чувствовать угрозу миру.', requirement: 'Стать свидетелем изменения закона мира.', unlocked: false },
          ],
          history: [{ title: 'Первое предчувствие', description: 'Дар впервые проявился у знака на мокром камне.' }], tags: ['восприятие', 'судьба'],
          profile: demoAbilityProfile({
            name: 'Чутьё перемен', owner: input.characterName,
            coreFantasy: 'Узнавать момент, после которого прежний ход событий уже нельзя вернуть, по конкретным разладам сцены.',
            principle: 'Необратимое решение заранее нарушает согласованность ближайших причин и оставляет воспринимаемый след.', origin: 'Внутренний дар героя, впервые проявившийся у запрещённого знака.',
            interaction: 'Сопоставить несколько наблюдаемых разладов, не превращая ощущение в готовый ответ.', experience: 'Звук на мгновение запаздывает, а одна деталь сцены кажется уже утраченной.',
            groupId: 'group-omens', groupLabel: 'Чутьё границ', tierId: 'tier-personal', tierLabel: 'Личный отклик',
            ceiling: 'Предупреждает об одной близкой точке необратимости, но не раскрывает правильный выбор.', scope: 'Личная сцена и ближайшее решение.',
          }),
        },
        {
          name: 'Настройка реликвии', description: 'Герой устанавливает краткий контакт с личной реликвией и считывает её эмоциональный отклик.', rank: 'I', source: 'Связь с реликвией',
          kind: 'ritual', mastery: 10, costs: [{ resource: 'focus', amount: 2 }], effects: ['Позволяет задать реликвии один вопрос об её памяти'], limitations: ['Ответ приходит образом, а не точным фактом'],
          requirements: ['Держать реликвию в руках'], progression: 'Растёт вместе с доверием реликвии.',
          category: 'perception', scale: 'Один предмет и связанное воспоминание', activation: 'Сосредоточиться на реликвии и потратить фокус.',
          capabilities: ['Считывает эмоциональный отклик', 'Позволяет задать один вопрос памяти реликвии'], synergies: ['Высокая связь делает образы яснее'],
          counters: ['Повреждение реликвии', 'Чужая защита памяти'], examples: ['Увидеть образ места, где реликвия была создана'], canonStatus: 'original',
          techniques: [
            { name: 'Эмоциональный отзвук', description: 'Считывает доминирующее чувство, оставленное в реликвии связанным событием.', kind: 'active', category: 'perception', mastery: 18, activation: 'Удерживать реликвию и сосредоточиться на одном воспоминании.', scale: 'Один эмоциональный след', costs: [{ resource: 'focus', amount: 1 }], effects: ['Передаёт чувство и одну сенсорную деталь'], requirements: ['Физический контакт с реликвией'], limitations: ['Не сообщает точные имена и даты'], unlocked: true },
            { name: 'Вопрос памяти', description: 'Формулирует один вопрос и получает связанный с ним образ из памяти реликвии.', kind: 'ritual', category: 'perception', mastery: 10, activation: 'Произнести вопрос во время полной настройки.', scale: 'Один вопрос к одному доступному следу', costs: [{ resource: 'focus', amount: 2 }], effects: ['Показывает краткий образ-ответ'], requirements: ['Сначала установить эмоциональный отзвук'], limitations: ['Ответ остаётся образом и допускает неверное толкование'], unlocked: true },
          ],
          evolutionPaths: [
            { name: 'Общий сон', description: 'Увидеть целое воспоминание реликвии.', requirement: 'Достичь связи 40.', unlocked: false },
            { name: 'Согласованный импульс', description: 'Совместно направить силу реликвии.', requirement: 'Пробудить реликвию.', unlocked: false },
          ],
          history: [{ title: 'Немой отклик', description: 'Реликвия впервые потеплела рядом со знаком.' }], tags: ['артефакт', 'ритуал'],
          profile: demoAbilityProfile({
            name: 'Настройка реликвии', owner: input.characterName,
            coreFantasy: 'Разговаривать с собственной реликвией через проверяемые чувственные следы вместо готовых воспоминаний.',
            principle: 'Связанный предмет отдаёт только тот сенсорный фрагмент, который удерживается его настоящей памятью.', origin: 'Практика взаимодействия героя с личным медальоном.',
            interaction: 'Взять реликвию, выбрать один вопрос и сопоставить пришедший образ с физическим свидетельством.', experience: 'Латунь теплеет, после чего один запах, звук или холодная поверхность вытесняют окружающую сцену.',
            groupId: 'group-relics', groupLabel: 'Реликтовый резонанс', tierId: 'tier-personal', tierLabel: 'Личный отклик',
            ceiling: 'Один сенсорный или эмоциональный фрагмент доступной памяти реликвии.', scope: 'Одна реликвия и один связанный след.',
          }),
        },
      ],
      currency: { Монеты: 20 },
    },
    inventory: [
      {
        name: 'Личная реликвия', description: 'Латунный медальон с несовпадающими внутренними крышками: при касании он возвращает владельцу только подтверждённые чувственные следы утраченного прошлого.', category: 'artifact', quantity: 1, rarity: 'rare', equipped: false,
        rarityProfile: { basis: 'Создана из фрагмента архивной печати, производство которых утрачено.', scarcity: 'Сохранилась у немногих бывших архивариусов.', knownCopies: 27, recognition: 'Архивариус узнает скрытую печать под крышкой.', marketImpact: 'Официальной цены нет; коллекционеры и Хранители будут пытаться её изъять.', acquisitionRisk: 76 },
        effects: ['Открывает фрагменты прошлого'], origin: 'Принадлежала герою до начала истории',
        history: [{ title: 'До первого хода', description: 'Медальон был единственной вещью при герое, когда его имя исчезло из архива.' }],
        artifact: {
          sentient: true, awakened: false, attunement: 12, bond: 5, personality: 'Терпеливый, настороженный хранитель чужих воспоминаний.',
          desire: 'Вернуть утраченное имя прежнего владельца.', taboo: 'Не позволяет добровольно стереть подлинное воспоминание.', mood: 'Настороженность',
          voice: 'Отвечает короткими образами тепла, звона и запаха дождя.',
          classification: 'Памятная реликвия', powerSource: 'Запечатанные воспоминания владельцев', operatingPrinciple: 'Резонирует с эмоционально связанными местами и предметами.',
          scale: 'Один владелец или локальный след памяти', canonStatus: 'original',
          creativeIdentity: {
            coreFantasy: 'Восстанавливать собственную историю не рассказом, а точными чувственными уликами.',
            centralConcept: 'Медальон хранит не сцены прошлого, а несовместимые сенсорные отпечатки, которые владелец должен связать сам.',
            physicalForm: 'Две латунные крышки открываются в разные стороны и никогда не показывают внутренность одновременно.',
            originPattern: 'Собран из персональной архивной печати героя до исчезновения его имени.',
            interactionModel: 'Владелец зажимает между крышками связанный предмет и формулирует один проверяемый вопрос.',
            signatureExperience: 'Вместо готового ответа приходит запах, звук и температура, складывающиеся в улику только при внимательном сопоставлении.',
            conceptualDomains: ['личная память', 'сенсорное свидетельство', 'утраченное имя'],
            mechanicVerbs: ['зажать', 'сопоставить', 'восстановить', 'проверить'],
            motifs: ['несовпадающие крышки', 'тёплая латунь', 'архивная насечка'],
            differentiation: ['Не показывает готовую сцену прошлого и не сообщает точные имена.', 'Каждый ответ обязан быть связан с физическим свидетелем.'],
          },
          presentation: {
            layout: 'reliquary', motif: 'две несовпадающие половины памяти', symbol: '◐', accent: '#d1a45f', secondary: '#78c9bc',
            surface: 'metal', glow: 'soft', headerStyle: 'inscribed', density: 'comfortable',
            sectionOrder: ['identity', 'powers', 'requirements', 'components', 'drawbacks', 'evolution', 'origin', 'history'],
            summary: 'Две половины медальона возвращают не ответ, а чувственный след, который ещё предстоит понять.',
          },
          discovery: {
            awareness: 35,
            revealedSections: ['identity', 'requirements', 'passives', 'powers', 'drawbacks'],
            powerKnowledge: { 'power-owner-echo': 'known' },
            componentKnowledge: { 'component-archive-seal': 'hinted' },
            evidence: [{ id: 'evidence-first-warmth', section: 'passives', summary: 'Медальон нагрелся рядом со знаком из прошлого героя.', source: 'Личное наблюдение героя', reliability: 100, learnedTurn: 0 }],
            updatedTurn: 0,
          },
          requirements: ['Физический контакт', 'Эмоциональная связь со следом'],
          passiveEffects: ['Слабо нагревается рядом со связанными воспоминаниями'], combinedEffects: ['Совместно с Настройкой реликвии формирует вопрос к памяти'],
          failureModes: ['При конфликтующих воспоминаниях показывает смешанные образы'], components: [{ id: 'component-archive-seal', name: 'Фрагмент архивной печати', description: 'Скрытая пластина под крышкой.', role: 'Фокусирует память.', status: 'active', capabilities: ['Удерживает один глубокий след'], required: true }],
          powers: [{
            id: 'power-owner-echo', name: 'Отзвук владельца', description: 'Показывает эмоциональный след прошлого владельца.', mastery: 8, costs: [{ resource: 'focus', amount: 2 }], limitations: ['Не показывает точных дат и имён'],
            category: 'perception', scale: 'Один эмоциональный след', activation: 'Коснуться медальона и связанного объекта.', capabilities: ['Передаёт образ, чувство и сенсорную деталь прошлого'],
            synergies: ['Настройка реликвии позволяет сформулировать вопрос'], counters: ['Архивная печать более высокого ранга'], examples: ['Запах дождя и звон места прежнего владельца'], canonStatus: 'original',
            techniques: [
              { name: 'Сенсорный след', description: 'Передаёт один запах, звук или тактильное ощущение из прошлого владельца.', kind: 'active', category: 'perception', mastery: 12, activation: 'Коснуться связанного предмета медальоном.', scale: 'Одна сенсорная деталь', costs: [{ resource: 'focus', amount: 1 }], effects: ['Воспроизводит наиболее сильную сенсорную деталь'], requirements: ['Связанный с владельцем объект'], limitations: ['Деталь приходит без объяснения контекста'], unlocked: true },
            ],
          }],
          drawbacks: ['Сильные воспоминания вызывают краткую дезориентацию'],
          evolutionPaths: [
            { name: 'Первое имя', description: 'Медальон произносит имя прежнего владельца.', requirement: 'Найти связанную с ним запись.', unlocked: false },
            { name: 'Память без стекла', description: 'Проецирует целую сцену прошлого.', requirement: 'Достичь настройки 60.', unlocked: false },
          ],
          secrets: ['Внутри скрыта часть печати Архивариусов'],
        },
      },
      { name: 'Дорожный набор', description: 'Самое необходимое для короткого пути.', category: 'other', quantity: 1, rarity: 'common', rarityProfile: { basis: 'Типовой дорожный товар городских лавок.', scarcity: 'Свободно продаётся в большинстве кварталов.', knownCopies: 50_000, recognition: 'Не привлекает особого внимания.', marketImpact: 'Цена стабильна, спрос повседневный.', acquisitionRisk: 2 }, equipped: false, effects: ['Базовые припасы'], weight: 2, history: [{ title: 'Сборы', description: 'Набор был собран перед входом в Пограничный квартал.' }] },
    ],
    npcs: [{
      name: 'Рин Астэр', role: 'Посланник с сомнительным поручением', description: 'Собранный человек, который явно знает о герое больше, чем говорит.', personality: 'Наблюдательная, сдержанная и ответственная; предпочитает проверяемые решения, тяжело переносит бессмысленный риск и не бросает человека, за безопасность которого взялась.', disposition: 'Осторожный интерес', relationship: 5, currentGoal: 'Увести героя из опасной зоны прежде, чем прибудут Хранители.', lastSeen: 'Пограничный квартал', notes: ['Обращается к герою по имени без знакомства.'],
      stats: [
        { key: 'reason', label: 'Расчёт', value: 8, max: 10, description: 'Способность связывать наблюдения в рабочий план.' },
        { key: 'finesse', label: 'Проворство', value: 7, max: 10, description: 'Точные движения и скрытное перемещение.' },
        { key: 'will', label: 'Воля', value: 6, max: 10, description: 'Самоконтроль под давлением.' },
      ],
      resources: [{ key: 'composure', label: 'Самообладание', value: 8, max: 10, kind: 'focus', criticalBelow: 2 }],
      abilities: [{
        name: 'Тактическое чтение', description: 'Рин сопоставляет позу, маршрут отхода и уже замеченные привычки собеседника, чтобы предсказать наиболее вероятный следующий шаг.', rank: 'Опытный', source: 'Подготовка полевого связного',
        kind: 'passive', mastery: 72, costs: [], effects: ['Выделяет наиболее вероятное действие наблюдаемой цели, если у Рин есть фактические наблюдения'],
        limitations: ['Не раскрывает неизвестные намерения и ошибается при сознательной смене привычного шаблона'], requirements: ['Наблюдать цель или иметь надёжные свидетельства её прошлых действий'],
        progression: 'Точность растёт только после проверки предсказаний реальными событиями.',
        evolutionPaths: [
          { name: 'Второй замысел', description: 'Рин удерживает две равновероятные версии действия цели.', requirement: 'Трижды признать и разобрать ошибочный прогноз.', unlocked: false },
          { name: 'Контрритм', description: 'Меняет собственный темп сразу после того, как цель распознала первый план.', requirement: 'Пережить провал подготовленной ловушки.', unlocked: false },
        ],
        history: [{ title: 'Поручение без имени', description: 'Рин заранее выбрал путь отхода, сравнив расписание патрулей.' }], tags: ['тактика', 'наблюдение', 'прогноз'],
        category: 'perception', scale: 'Одна наблюдаемая цель и ближайшая сцена', activation: 'Постоянное наблюдение и сопоставление известных фактов.',
        capabilities: ['Замечает повторяющиеся поведенческие шаблоны', 'Готовит контрмеру против наиболее вероятного действия'], synergies: ['Высокий Расчёт повышает качество альтернативных планов'],
        counters: ['Ложный шаблон поведения', 'Новая способность, которую Рин никогда не видел', 'Неполные или поддельные сведения'], examples: ['Предугадать, каким выходом воспользуется преследуемый'], canonStatus: 'original',
        techniques: [
          { name: 'Чтение шаблона', description: 'Выделяет повторяющийся выбор цели только из лично замеченных действий.', kind: 'passive', category: 'perception', mastery: 72, activation: 'Наблюдать минимум два сопоставимых действия.', scale: 'Одна наблюдаемая цель', costs: [], effects: ['Фиксирует один подтверждённый поведенческий шаблон'], requirements: ['Два доступных наблюдения'], limitations: ['Сознательная смена поведения обесценивает прогноз'], unlocked: true },
          { name: 'Контрсценарий', description: 'Готовит практический ответ на наиболее вероятное следующее действие цели.', kind: 'reaction', category: 'control', mastery: 64, activation: 'Выбрать подтверждённый шаблон и подготовить позицию или ресурс.', scale: 'Один следующий обмен действий', costs: [{ resource: 'composure', amount: 1 }], effects: ['Даёт заранее подготовленную реакцию при совпадении прогноза'], requirements: ['Известный шаблон и время на подготовку'], limitations: ['Не срабатывает против нового или намеренно изменённого действия'], unlocked: true },
        ],
        profile: demoAbilityProfile({
          name: 'Тактическое чтение', owner: 'Рин Астэр',
          coreFantasy: 'Превращать реальные привычки противника и геометрию выхода в проверяемый контрплан, не прибегая к всеведению.',
          principle: 'Повторяемое действие становится предсказуемым только после наблюдения, а каждое новое действие требует новой проверки.', origin: 'Подготовка полевого связного и годы эвакуационных операций.',
          interaction: 'Проверить шаблон малой провокацией, сохранить две развилки и подготовить ответ лишь на подтверждённую версию.', experience: 'Рин отмечает взглядом выходы, сбивает собственный ритм и оказывается там, где повторившийся манёвр цели теряет смысл.',
          groupId: 'group-strategy', groupLabel: 'Доктрины и влияние', tierId: 'tier-expert', tierLabel: 'Проверенный специалист',
          ceiling: 'Надёжный контрсценарий против одной наблюдаемой цели в подготовленной сцене.', scope: 'Одна цель, несколько выходов и ближайший обмен действий.', hidden: true,
        }),
      }],
      knowledge: [{ subject: input.characterName, statement: 'Имя героя было указано в запечатанном поручении.', status: 'known', confidence: 100, source: 'Личное поручение', secret: true }],
      relationshipDimensions: { trust: 5, respect: 10, affection: 0, fear: 5, suspicion: 20, dependence: 0 },
      initiative: { intent: 'Вывести героя из квартала живым.', nextMove: 'Предложить безопасный путь через Тихую переправу.', trigger: 'Появление патруля Хранителей.', urgency: 65, blockedBy: ['Герой пока не доверяет Рин'], visibility: 'rumored' },
      strategy: {
        intelligence: 82, tacticalSkill: 76, strategicSkill: 71, predictionSkill: 78, adaptability: 74, deceptionSkill: 63, riskTolerance: 42,
        planningHorizon: 'Держит основной маршрут на несколько часов вперёд и одну запасную развилку.',
        decisionStyle: 'Сначала собирает наблюдаемые признаки, затем проверяет дешёвую гипотезу и только после этого рискует.',
        observedPlayerPatterns: ['Герой внимательно реагирует на следы собственного прошлого'], strengths: ['Подготовленные пути отхода', 'Сопоставление расписаний и поведения'],
        blindSpots: ['Слишком долго считает личную привязанность помехой для рационального решения'], currentPlan: 'Вывести героя через Тихую переправу до прибытия патруля.',
        contingencies: ['Если герой откажется, показать проверяемый фрагмент поручения', 'Если появится патруль, сменить маршрут на архивные подвалы'], visibility: 'rumored',
        combatDoctrine: 'Избегает затяжного боя, разрывает линию наблюдения и выигрывает время для отхода защищаемой цели.', preferredRange: 'Средняя дистанция с доступом к двум путям отхода.',
        teamworkStyle: 'Коротко обозначает угрозу и маршрут, не требует слепого подчинения.', moraleProfile: 'Сохраняет самообладание под давлением, но пойдёт на повышенный риск ради человека под своей защитой.',
        retreatConditions: ['Задача эвакуации выполнена', 'Противник получил подкрепление, а безопасный путь ещё открыт'], ethicalLimits: ['Не использует заложников', 'Не добивает обезвреженного противника'],
        learnedAdaptations: [],
        countermeasures: [
          { name: 'Ложный коридор', against: 'Прямое преследование или стремительный рывок к Рин', response: 'Отходит по очевидному маршруту, затем закрывает линию движения заранее замеченной створкой и меняет направление.', requirements: ['Заранее осмотреть два выхода', 'Сохранять дистанцию'], tradeoffs: ['Теряет лучший короткий путь', 'Не работает в открытом пространстве'], status: 'available', visibility: 'hidden' },
          { name: 'Сломанный ритм', against: 'Попытка предсказать её движение по повторяющемуся темпу', response: 'Намеренно задерживает шаг и передаёт инициативу союзнику, меняя привычную последовательность.', requirements: ['Заметить, что противник читает ритм'], tradeoffs: ['На мгновение снижает собственную готовность'], status: 'available', visibility: 'hidden' },
        ],
      },
      threatProfile: {
        tier: 'elite',
        scope: 'Сложная локальная операция, погоня или эвакуация через подготовленный район.',
        reputation: 'Полевые связные знают Рин как специалиста, который выводит цель из почти замкнутого кольца и редко повторяет один маршрут.',
        powerBasis: 'Тактическое чтение наблюдаемых шаблонов, сеть проверенных путей и дисциплина полевого связного.',
        combatIdentity: 'Не принимает честный обмен ударами: создаёт ложный маршрут, вынуждает преследователя раскрыть приоритет и меняет ритм после первой разгаданной схемы.',
        signatureAbilities: ['Тактическое чтение', 'Контрсценарий'],
        threatVectors: ['Прогноз повторяемого действия', 'Подготовленное изменение маршрута и темпа'],
        defensiveLayers: ['Заранее выбранные пути отхода', 'Контрритм после раскрытия первой схемы'],
        battlefieldControl: ['Управляет дистанцией и доступными выходами вместо прямого удержания позиции'],
        informationAdvantages: ['Расписания патрулей и лично проверенные наблюдения; скрытые мысли и неизвестные способности ей недоступны'],
        preparedAssets: ['Запечатанное поручение', 'Один проверенный тайный путь из квартала'],
        engagementPhases: [
          { name: 'Чтение выхода', trigger: 'Противник дважды показывает сопоставимый приоритет движения', doctrine: 'Проверить шаблон дешёвой реакцией и сохранить два выхода.', priorities: ['Защитить сопровождаемого', 'Уточнить привычку преследователя'], signatureMoves: ['Чтение шаблона'], openings: ['Новый или намеренно ложный шаблон разрушает прогноз'], exitConditions: ['Шаблон подтверждён', 'Наблюдение потеряно'] },
          { name: 'Контрсценарий', trigger: 'Подтверждённый шаблон повторяется при подготовленной позиции', doctrine: 'Отдать противнику ожидаемый первый коридор и сменить направление после его решения.', priorities: ['Разорвать контакт', 'Не дать противнику перенести бой к герою'], signatureMoves: ['Контрсценарий'], openings: ['Закрытие обоих путей отхода лишает Рин пространства манёвра'], exitConditions: ['Цель выведена', 'Самообладание исчерпано', 'Маршруты перекрыты'] },
        ],
        collateralRisks: ['Закрытие маршрута может оставить жителей квартала без безопасного прохода'],
        whyDangerous: ['Предугадывает повторяемые действия по реальным наблюдениям', 'Подготавливает несколько путей отхода', 'Меняет собственный ритм после раскрытия плана'],
        knownFeats: ['Вывела курьера из двойного патрульного кольца', 'Сорвала засаду, распознав повторяющийся порядок смены постов'],
        constraints: ['Не предсказывает совершенно новое действие', 'Зависит от знания местности и сохранённого самообладания'],
        defeatRequirements: ['Лишить её подготовленных маршрутов', 'Сознательно сменить наблюдаемый шаблон и не дать времени на новую проверку'],
        escalationTriggers: ['Непосредственная угроза человеку под её защитой', 'Уничтожение единственного безопасного пути'],
        visibility: 'known',
      },
      recruitment: { status: 'possible', willingness: 34, reason: 'Рин готова провести героя до убежища, но ещё не решила связывать свою судьбу с героем.', requirements: ['Проверить, что герой не служит Хранителям', 'Пережить первую совместную угрозу'] },
      voice: { style: 'Короткие точные фразы без лишних признаний.', patterns: ['Сначала предупреждает, затем объясняет'], avoids: ['Не называет заказчика поручения'] },
    }, ...demoStrongNpcs()],
    socialLinks: [],
    worldEvents: [{ title: 'Прибытие караула', description: 'Патруль Хранителей порядка войдёт в квартал.', dueTurn: 3, visibility: 'rumored', involvedNpcNames: ['Рин Астэр'] }],
    factionReputation: [
      { factionName: 'Хранители порядка', value: 0, label: 'Наблюдают', notes: [] },
      { factionName: 'Союз новой зари', value: 5, label: 'Заинтересованы', notes: [] },
    ],
    threads: [{ type: 'rumor', title: 'Героя ждали', detail: 'По кварталу ходит слух о человеке, чьё имя появилось на камне заранее.', participantNames: ['Рин Астэр', input.characterName], status: 'active', dueTurn: 4, secret: false }],
    characterArcs: [
      { ownerName: input.characterName, title: 'Вернуть собственное имя', theme: 'Личность против навязанной судьбы.', currentStage: 'Герой ещё не знает, кто и зачем стёр его имя.', progress: 5, stages: ['Найти след стирания', 'Узнать цену возвращения', 'Решить, каким именем жить'], turningPoints: ['Первый человек вспомнит героя без подсказки'], status: 'active', secret: false },
      { ownerName: 'Рин Астэр', title: 'Приказ и совесть', theme: 'Верность приказу против личной ответственности.', currentStage: 'Рин исполняет приказ, не доверяя его источнику.', progress: 12, stages: ['Вывести героя', 'Проверить заказчика', 'Выбрать сторону'], turningPoints: ['Герой потребует раскрыть имя заказчика'], status: 'active', secret: true },
    ],
    mysteryCases: [{
      title: 'Имя на мокром камне', premise: 'Кто заранее вырезал имя героя и почему знак реагирует на реликвию?', truth: 'Знак оставил архивариус Лет, пытавшийся вернуть герою стёртую часть личности через печать реликвии.',
      clues: [
        { title: 'Чернила под камнем', detail: 'В бороздах есть архивная пыль.', location: 'Пограничный квартал', source: 'Осмотр знака', discovered: false, essential: true },
        { title: 'Поручение Рин', detail: 'Печать поручения совпадает с фрагментом в медальоне.', location: 'При Рин', source: 'Сам документ', discovered: false, essential: true },
        { title: 'Неверный звон', detail: 'Одна башня повторяет код старого архива.', location: 'Башня Хранителей', source: 'Запись колокольного боя', discovered: false, essential: true },
        { title: 'Тёплый отклик', detail: 'Реликвия узнаёт знак, но боится его центра.', location: 'Пограничный квартал', source: 'Настройка реликвии', discovered: true, essential: false },
      ],
      redHerrings: ['Безымянные публично берут ответственность за похожие знаки.'], revelationRules: ['Не называть архивариуса без двух существенных улик.', 'Совпадение печатей должно быть доступно до финального вывода.'],
    }],
    antagonistPlans: [{ ownerName: 'Рин Астэр', title: 'Увести носителя печати', objective: 'Доставить героя к архивариусу раньше Хранителей.', method: 'Доверие, безопасный маршрут и сокрытие заказчика.', currentStep: 0, pressure: 35, resources: ['Запечатанное поручение', 'Знание тайного пути'], knowledge: ['Имя героя', 'Прибытие караула'], steps: [{ title: 'Добиться движения', trigger: 'Герой задаёт вопросы о знаке.', consequence: 'Рин предлагает уйти немедленно.', status: 'active' }, { title: 'Пройти переправу', trigger: 'Герой соглашается уйти.', consequence: 'Патруль теряет прямой след.', status: 'pending' }, { title: 'Встретить архивариуса', trigger: 'Герой достигает убежища.', consequence: 'Раскрывается цена возвращения имени.', status: 'pending' }], weaknesses: ['Рин не готов причинить герою вред', 'Поручение можно проверить'], status: 'active', secret: true }],
    worldPressures: [{
      sourceKind: 'faction', sourceName: 'Хранители порядка', targetNames: [input.characterName],
      cause: 'Имя героя проявилось внутри запрещённого знака в Пограничном квартале.',
      objective: 'Установить происхождение знака и взять его носителя под контролируемое наблюдение.',
      tier: 'local', stage: 'investigating', reach: 'Патрули и архивные каналы в пределах столицы.',
      knowledge: ['Стража знает место проявления знака, но ещё не знает намерений героя.'],
      signs: ['Улицы вокруг квартала постепенно перекрывают патрули.', 'Писцы сверяют описание знака с архивными реестрами.'],
      measures: [{ name: 'Кольцо наблюдения', trigger: 'Патруль получит подтверждённое описание героя.', method: 'Проверка выходов из квартала без открытой облавы.', effects: ['Перемещение по главным улицам станет заметнее.'], counterplay: ['Использовать старые проходы или изменить узнаваемые признаки.'], tradeoffs: ['Хранители отвлекут людей от других районов.'], status: 'preparing' }],
      counterplay: ['Выяснить, что именно известно архивным писцам.', 'Покинуть район до замыкания патрульного кольца.'],
      escalationTrigger: 'Подтверждённое применение знака против Хранителей или гибель патрульного.',
      deescalationConditions: ['Доказать непричастность к созданию знака.', 'Скрыть след и переждать активную проверку.'],
      visibility: 'rumored',
    }],
    influenceAssets: [
      { kind: 'favor', title: 'Безопасный путь Рин', description: 'Рин готов один раз провести героя через закрытую переправу.', holderName: input.characterName, targetName: 'Рин Астэр', value: 25, status: 'active', source: 'Условие запечатанного поручения', secret: false },
      { kind: 'leverage', title: 'Печать поручения', description: 'Совпадение печати может заставить Рин раскрыть часть приказа.', holderName: input.characterName, targetName: 'Рин Астэр', value: 20, status: 'active', source: 'Наблюдение за документом', secret: true },
    ],
    quests: [{ title: 'След первой трещины', description: 'Выяснить, почему привычные правила мира начали нарушаться.', objectives: ['Поговорить с Рин', 'Найти источник странного знака'], reward: 'Правда о прошлом героя' }],
    lore: [
      { title: 'Главный закон силы', type: 'rule', content: 'Любое значительное применение силы оставляет наблюдаемый след и имеет цену.', keys: ['сила', 'способность', 'цена'], alwaysOn: true, secret: false, discovered: true, priority: 100 },
      { title: 'Пограничный квартал', type: 'location', content: 'Старая часть города, где влияние двух фракций пересекается.', keys: ['квартал', 'граница'], alwaysOn: false, secret: false, discovered: true, priority: 65 },
      { title: 'Хранители порядка', type: 'faction', content: 'Официальная сила, охраняющая старые законы.', keys: ['Хранители', 'порядок'], alwaysOn: false, secret: false, discovered: true, priority: 75 },
      { title: 'Рин Астэр', type: 'character', content: 'Посланник, получивший приказ вывести героя из квартала.', keys: ['Рин', 'Астэр', 'посланник'], alwaysOn: false, secret: false, discovered: true, priority: 80 },
      { title: 'Причина ожидания', type: 'secret', content: 'Имя героя появилось в запечатанном прогнозе задолго до его рождения.', keys: ['прогноз', 'ожидали', input.characterName], alwaysOn: false, secret: true, discovered: false, priority: 90 },
    ],
    opening: {
      scene: { title: 'Знак на мокром камне', location: 'Пограничный квартал', time: 'Перед рассветом', weather: 'Тёплый дождь', tension: 38, presentNpcNames: ['Рин Астэр'] },
      pacing: { beat: 'setup', intensity: 38, challengeTier: 'light', reason: 'Опасность только начинает проявляться, а у героя ещё есть время осмотреться и выбрать направление.' },
      narrative: `Дождь стирает следы со старой мостовой, но знак у твоих ног становится только ярче. Три линии сходятся вокруг имени — твоего имени — выведенного на камне ещё до того, как ты вошёл в квартал.\n\nНа противоположной стороне улицы человек в дорожном плаще закрывает зонт.\n\n— ${input.characterName}, — произносит он без вопроса. — Если хотите дожить до рассвета, не наступайте в центр знака.\n\nЗа крышами одновременно звонят колокола двух враждующих башен. В переулке справа вспыхивает холодный свет, и незнакомец впервые теряет спокойствие.`,
      suggestions: ['Спросить, кто оставил знак', 'Отойти от символа и потребовать объяснений', 'Проверить, как знак реагирует на личную реликвию'],
    },
  }
}
