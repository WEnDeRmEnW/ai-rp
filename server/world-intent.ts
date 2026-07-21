export interface WorldIntentInput {
  inspiration: string
  genre: string
  tone: string
  opening: string
  canonMode: string
}

export type WorldFamiliarityMode = 'canon' | 'familiar' | 'guided' | 'open'

export interface WorldRequestIntent {
  mode: WorldFamiliarityMode
  animeLike: boolean
  asksForFamiliarConventions: boolean
  asksForRadicalOriginality: boolean
  referenceRole: 'canon' | 'inspiration' | 'none'
  signals: string[]
}

const normalize = (value: string) => value
  .normalize('NFKC')
  .toLocaleLowerCase('ru-RU')
  .replace(/ё/gu, 'е')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim()

export function analyzeWorldRequestIntent(input: WorldIntentInput): WorldRequestIntent {
  const inspiration = normalize(input.inspiration)
  const full = normalize([input.inspiration, input.genre, input.tone, input.opening].join(' '))
  const animeLike = /аниме|исекай|манг|раноб|перерожд|реинкарнац|безработн|слиз|anime|isekai|mushoku|tensei|slime/iu.test(full)
  const asksForFamiliarConventions = animeLike
    || /(?:^|\s)(?:обычн|классич|дефолт|типич|клише)|(?:^|\s)знаком\p{L}*\s+(?:жанр|мир)|как в|в духе|в стиле|похож\p{L}*\s+на/iu.test(full)
  const asksForRadicalOriginality = /полност\p{L}*\s+уникал|совершенн\p{L}*\s+нов|ни на что не похож|радикальн|экспериментальн|необычн\p{L}*\s+мир/iu.test(full)
  const hasNamedReference = /как в|в духе|в стиле|по мотивам|inspired by/iu.test(inspiration)
    || /безработн|слиз|mushoku|tensei|slime/iu.test(inspiration)
  const mode: WorldFamiliarityMode = input.canonMode === 'faithful'
    ? 'canon'
    : asksForFamiliarConventions && asksForRadicalOriginality
      ? 'guided'
      : asksForFamiliarConventions
        ? 'familiar'
        : 'open'

  return {
    mode,
    animeLike,
    asksForFamiliarConventions,
    asksForRadicalOriginality,
    referenceRole: input.canonMode === 'faithful' ? 'canon' : hasNamedReference ? 'inspiration' : 'none',
    signals: [
      animeLike ? 'аниме/исекай-ожидания' : '',
      asksForFamiliarConventions ? 'знакомые жанровые конвенции' : '',
      asksForRadicalOriginality ? 'явная радикальная оригинальность' : '',
      hasNamedReference ? 'названные произведения-ориентиры' : '',
    ].filter(Boolean),
  }
}

export function worldIntentPrompt(input: WorldIntentInput): string {
  const intent = analyzeWorldRequestIntent(input)
  const modeRule = intent.mode === 'canon'
    ? 'Пользователь выбрал точный канон: не заменяй его авторским аналогом.'
    : intent.mode === 'familiar'
      ? 'Пользователю нужно узнаваемое жанровое удовольствие. Не ломай его ради демонстративной необычности.'
      : intent.mode === 'guided'
        ? 'Сохрани узнаваемую жанровую основу, а оригинальность вложи в конкретные культуры, людей, конфликты и историю.'
        : 'Пользователь не задал жесткую степень знакомости: выбери цельную основу, не подменяя запрос любимыми модельными тропами.'
  const animeRule = intent.animeLike
    ? 'Для аниме/исекай-фэнтези разрешены знакомые опоры вроде королевств, гильдий, магии, монстров, народов, рангов и путешествия, если они подходят запросу. Не заменяй их без просьбы абстрактным «эфиром/резонансом/разломом». Это ориентиры, а не обязательный чек-лист.'
    : ''
  const referenceRule = intent.referenceRole === 'inspiration'
    ? 'Названные произведения задают ритм, тип мира и ожидаемую фантазию, но не разрешают копировать их имена, карту или сюжет. Не ставь recognizedCanon=true только из-за названий произведений-ориентиров; для этого нужен отдельный прямой запрос канона.'
    : ''

  return `
ДОГОВОР ПОНИМАНИЯ ЗАПРОСА (важнее автоматической оригинальности):
- Режим: ${intent.mode}; сигналы: ${intent.signals.join(', ') || 'общий авторский запрос'}.
- ${modeRule}
${animeRule ? `- ${animeRule}\n` : ''}${referenceRule ? `- ${referenceRule}\n` : ''}- Буквальные пожелания пользователя важнее твоего желания удивить. Не подменяй жанр единой сложной метафизикой и не связывай все слои мира одним тайным принципом.`
}
