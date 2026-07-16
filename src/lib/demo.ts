import type { Campaign } from '../../shared/types'

const id = () => crypto.randomUUID()

export function createDemoCampaign(): Campaign {
  const timestamp = new Date().toISOString()
  const miraId = id()
  const playerId = id()
  const campaignId = id()

  return {
    id: campaignId,
    title: 'Пепельное созвездие',
    createdAt: timestamp,
    updatedAt: timestamp,
    turn: 0,
    world: {
      name: 'Эйдол',
      tagline: 'Город помнит каждое имя — кроме вашего',
      inspiration: 'Оригинальное городское фэнтези о памяти, долгах и живых созвездиях',
      genre: 'Городское фэнтези',
      tone: 'Таинственный, живой, кинематографичный',
      era: 'Эпоха газовых фонарей и звёздной механики',
      overview: 'Эйдол стоит внутри кратера упавшей звезды. Здесь воспоминания можно заключать в стекло, а забытые обещания обретают тела. Этой ночью над городом исчезло одно из семи созвездий.',
      rules: [
        'Память имеет вес: сильное воспоминание можно обменять, украсть или запечатать.',
        'Звёздная механика работает только в присутствии честно названной цели.',
        'Ни один дух не может войти в дом, пока хозяин помнит своё настоящее имя.',
      ],
      factions: [
        { name: 'Архивариусы Тихого света', description: 'Хранят запечатанные воспоминания горожан.', attitude: 'Осторожный нейтралитет' },
        { name: 'Латунный хор', description: 'Механики, научившиеся слышать голоса созвездий.', attitude: 'Ищут союзников' },
        { name: 'Безымянные', description: 'Люди, добровольно отдавшие свои прошлые жизни.', attitude: 'Непредсказуемы' },
      ],
      locations: [
        { name: 'Вокзал Нулевого часа', description: 'Поезда приходят сюда на минуту раньше, чем отправились.', danger: 28 },
        { name: 'Рынок стеклянных имён', description: 'Под навесами продают голоса, клятвы и чужие сны.', danger: 52 },
        { name: 'Обсерватория Семи окон', description: 'Закрыта после исчезновения созвездия Паломника.', danger: 76 },
      ],
      mysteries: ['Кто стёр имя героя из городского архива?', 'Почему созвездие Паломника погасло?', 'Что Мира прячет в латунном футляре?'],
      routes: [
        { id: id(), from: 'Вокзал Нулевого часа', to: 'Рынок стеклянных имён', label: 'Линия фонарей', travelTime: 'двадцать минут пешком', distance: 2, danger: 38, discovered: true },
        { id: id(), from: 'Рынок стеклянных имён', to: 'Обсерватория Семи окон', label: 'Латунный подъём', travelTime: 'один час', distance: 6, danger: 74, discovered: true },
      ],
      system: {
        name: 'Механика отголосков',
        summary: 'Решения оставляют след в памяти людей и города; сила требует честно названной цели.',
        progression: 'Новые грани героя открываются через возвращённые воспоминания, исполненные обещания и отношения.',
        conflictResolution: 'Исход определяется подходящей гранью героя, ценой действия и текущим напряжением сцены.',
        consequences: 'Неудача создаёт долг, потерю памяти или осложнение, но продолжает историю.',
        equipmentSlots: [
          { key: 'hand', label: 'В руке', accepts: ['weapon', 'artifact', 'other'] },
          { key: 'attire', label: 'Облачение', accepts: ['armor'] },
          { key: 'echo', label: 'Якорь памяти', accepts: ['artifact', 'quest'] },
        ],
      },
      presentation: {
        accent: '#71d3b1', accentStrong: '#95e6c9', secondary: '#e7b96b', surface: 'arcane', motif: 'латунная нить созвездия',
        labels: {
          scene: 'Мгновение', character: 'Искатель', inventory: 'Дорожная сумка', world: 'Эйдол', quests: 'Обещания', abilities: 'Отголоски',
          lore: 'Архив', memories: 'Память города', stats: 'Грани', resources: 'Нити', conditions: 'Следы', level: 'Ступень', chapter: 'Созвездие', turn: 'минута',
          action: 'Поступок', speech: 'Слово', direction: 'Замысел', continue: 'Течение',
        },
        categoryLabels: {
          weapon: 'Орудие', armor: 'Облачение', consumable: 'Запас', artifact: 'Реликвия', quest: 'Ключ истории', material: 'Материал', other: 'Вещь',
        },
        rarityLabels: {
          common: 'Знакомое', uncommon: 'Примечательное', rare: 'Памятное', epic: 'Звёздное', legendary: 'Именное',
        },
      },
      calendar: { day: 1, label: 'Ночь Погасшего Паломника' },
    },
    player: {
      id: playerId,
      name: 'Эрен',
      archetype: 'Искатель утраченных имён',
      level: 1,
      appearance: 'Тёмное дорожное пальто, серебряная нить на запястье и глаза человека, который узнаёт места, где никогда не был.',
      personality: 'Наблюдательный, упрямый, сострадательный; скрывает растущую тревогу за собственную память.',
      backstory: 'Три дня назад Эрен очнулся в поезде без билета и прошлого. В кармане была только записка: «Не позволяй им зажечь восьмое окно».',
      goal: 'Вернуть своё настоящее имя и понять, что произошло в Обсерватории.',
      stats: [
        { key: 'resolve', label: 'Воля', value: 6, max: 10, description: 'Способность не отступить перед страхом и чужим влиянием.' },
        { key: 'insight', label: 'Проницательность', value: 7, max: 10, description: 'Внимание к деталям, мотивам и скрытым связям.' },
        { key: 'finesse', label: 'Ловкость', value: 5, max: 10, description: 'Точность движений и реакция.' },
        { key: 'presence', label: 'Влияние', value: 4, max: 10, description: 'Убедительность и сила личности.' },
      ],
      resources: [
        { key: 'health', label: 'Здоровье', value: 10, max: 10, color: '#f17b82', kind: 'health' },
        { key: 'focus', label: 'Фокус', value: 8, max: 10, color: '#71d3b1', kind: 'focus' },
        { key: 'memory', label: 'Целостность памяти', value: 7, max: 10, color: '#b99af7', kind: 'custom' },
      ],
      abilities: [
        { id: id(), name: 'Эхо прикосновения', description: 'Коснувшись предмета, Эрен иногда видит обрывок связанного с ним сильного воспоминания.', rank: 'I', source: 'Неизвестное прошлое' },
      ],
      conditions: [],
      statusEffects: [],
      lifeState: 'active',
      currency: { 'Серебряные марки': 18 },
    },
    inventory: [
      {
        id: id(), name: 'Записка без почерка', description: '«Не позволяй им зажечь восьмое окно». Чернила остаются тёплыми.', category: 'quest', quantity: 1,
        rarity: 'rare', equipped: false, effects: ['Отзывается на звёздные механизмы'], origin: 'Найдена после пробуждения в поезде', discoveredTurn: 0,
      },
      {
        id: id(), name: 'Складной фонарь', description: 'Старый латунный фонарь с одной синей линзой.', category: 'other', quantity: 1,
        rarity: 'common', equipped: true, equippedSlot: 'hand', effects: ['Рассеивает слабую мглу'], weight: 0.8, origin: 'Дорожная сумка', discoveredTurn: 0,
      },
    ],
    npcs: [
      {
        id: miraId,
        name: 'Мира Вей',
        role: 'Курьер Латунного хора',
        description: 'Девушка в коротком плаще, с медными очками на лбу и футляром для чертежей за спиной.',
        disposition: 'Настороженно дружелюбна',
        relationship: 8,
        status: 'active',
        currentGoal: 'Добраться до Обсерватории раньше Архивариусов.',
        lastSeen: 'Вокзал Нулевого часа',
        notes: ['Назвала героя по имени до того, как он представился.'],
        knowledge: [
          { id: id(), subject: 'Эрен', statement: 'Эрен сам попросил Миру сохранить его имя.', status: 'known', confidence: 100, source: 'Личное обещание', secret: true },
          { id: id(), subject: 'Восьмое окно', statement: 'Открытие окна вернёт Эрену все воспоминания.', status: 'believed', confidence: 55, source: 'Чертежи Хора', secret: true },
        ],
      },
    ],
    socialLinks: [],
    threads: [{ id: id(), type: 'promise', title: 'Сохранить имя Эрена', detail: 'Мира пообещала произнести имя Эрена в ночь, когда погаснет Паломник.', participantIds: [miraId, playerId], status: 'active', secret: true, createdTurn: 0 }],
    worldEvents: [{ id: id(), title: 'Архивариусы прибывают на вокзал', description: 'Патруль проверит след погасшего созвездия и записи пассажиров.', dueTurn: 3, status: 'scheduled', visibility: 'rumored', involvedIds: [miraId], createdTurn: 0 }],
    factionReputation: [
      { factionName: 'Архивариусы Тихого света', value: 0, label: 'Нейтрально', notes: [] },
      { factionName: 'Латунный хор', value: 8, label: 'Заинтересованы', notes: ['Мира готова поручиться за героя неофициально.'] },
    ],
    documents: [],
    archives: [],
    partyMemberIds: [],
    partyRoles: {},
    quests: [
      {
        id: id(),
        title: 'Восьмое окно',
        description: 'Выяснить смысл записки и не допустить неизвестного ритуала в Обсерватории.',
        status: 'active',
        objectives: [
          { id: id(), text: 'Добраться до Обсерватории Семи окон', completed: false },
          { id: id(), text: 'Узнать, кому принадлежит записка', completed: false },
        ],
      },
    ],
    lore: [
      {
        id: id(), title: 'Законы памяти', type: 'rule',
        content: 'В Эйдоле воспоминание можно извлечь только с добровольного согласия либо назвав истинное имя владельца. Извлечённая память хранится в звёздном стекле.',
        keys: ['память', 'воспоминание', 'стекло', 'имя'], enabled: true, alwaysOn: true, secret: false, discovered: true, priority: 100,
      },
      {
        id: id(), title: 'Вокзал Нулевого часа', type: 'location',
        content: 'Вокзал построен вокруг часов, которые никогда не показывают полночь. Смотритель знает расписание поездов из ещё не случившихся дней.',
        keys: ['вокзал', 'поезд', 'нулевой час', 'смотритель'], enabled: true, alwaysOn: false, secret: false, discovered: true, priority: 70,
      },
      {
        id: miraId, title: 'Мира Вей', type: 'character',
        content: 'Мира Вей — молодой курьер Латунного хора, прямолинейная и находчивая. Она знает Эрена, но боится объяснить, откуда.',
        keys: ['Мира', 'Вей', 'курьер', 'Латунный хор'], enabled: true, alwaysOn: false, secret: false, discovered: true, priority: 85,
      },
      {
        id: id(), title: 'Тайна латунного футляра', type: 'secret',
        content: 'В футляре Миры находится карта неба, на которой отмечено восьмое созвездие с именем Эрена.',
        keys: ['футляр', 'карта неба', 'Мира'], enabled: true, alwaysOn: false, secret: true, discovered: false, priority: 90,
      },
    ],
    memories: [
      { id: id(), kind: 'fact', content: 'Эрен очнулся без памяти и получил предупреждение о восьмом окне.', tags: ['Эрен', 'записка', 'восьмое окно'], importance: 95, turn: 0, createdAt: timestamp },
      { id: id(), kind: 'relationship', content: 'Мира знает Эрена из его утраченного прошлого, но пока это скрывает.', tags: ['Мира', 'Эрен', 'прошлое'], importance: 85, turn: 0, createdAt: timestamp },
    ],
    timeline: [
      { id: id(), turn: 0, title: 'Прибытие без прошлого', description: 'Эрен сошёл с ночного поезда на Вокзале Нулевого часа.', category: 'story', createdAt: timestamp },
    ],
    messages: [
      {
        id: id(), role: 'assistant', turn: 0, createdAt: timestamp,
        content: 'Поезд уходит без свистка. Его последние окна скользят мимо, отражая не перрон, а незнакомое звёздное небо — восемь созвездий вместо семи. Затем рельсы пустеют, и отражение исчезает.\n\nВокзал Нулевого часа почти безлюден. Под стеклянным куполом висят часы без полуночи, а в кармане твоего пальто снова теплеет записка. Напротив стоит девушка в медных очках. Она сжимает латунный футляр так, будто внутри бьётся живое сердце.\n\n— Эрен, — говорит она прежде, чем ты успеваешь представиться. — Если ты действительно ничего не помнишь, у нас осталось ещё меньше времени.\n\nГде-то над городом гаснет последняя звезда Паломника. Все часы на вокзале одновременно переводят стрелки назад.',
        suggestions: ['Спросить Миру, откуда она знает моё имя', 'Коснуться записки и вызвать Эхо', 'Осмотреть часы под куполом'],
        activeLoreIds: [], recalledMemoryIds: [], changeSummary: [],
      },
    ],
    scene: {
      title: 'Минута, которой не было',
      location: 'Вокзал Нулевого часа',
      time: '23:59',
      weather: 'Холодный звёздный дождь',
      tension: 42,
      presentNpcIds: [miraId],
    },
    settings: {
      responseLength: 'adaptive',
      playerAgency: 'strict',
      difficulty: 'balanced',
      canonMode: 'original',
      autoApplyChanges: true,
      contentBoundaries: '',
      authorsNote: 'Сохраняй тайну, давай персонажам собственную волю и всегда оставляй пространство для решения игрока.',
      resolutionMode: 'hidden',
      contextProfile: 'million',
      qualityMode: 'deep',
      scenePace: 'balanced',
      proseStyle: 'literary',
      dialogueDensity: 'balanced',
      npcAutonomy: 'independent',
      worldDynamics: 'living',
    },
    snapshots: [],
  }
}
