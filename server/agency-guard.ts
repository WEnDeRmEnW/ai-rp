import type { ActionType } from '../shared/types.js'

export type AgencyViolationKind = 'speech' | 'action' | 'thought' | 'emotion' | 'decision' | 'motive'

export interface AgencyViolation {
  kind: AgencyViolationKind
  evidence: string
  reason: string
  instruction: string
  severity: 'high'
}

type AgencyGuardInput = {
  playerName: string
  input: string
  actionType: ActionType
  narrative: string
  agencyMode: 'strict' | 'cinematic'
}

export interface AgencySanitizationResult {
  narrative: string
  violations: AgencyViolation[]
  removedParagraphs: number
}

const attributionVerbs = [
  'говорит', 'отвечает', 'продолжает', 'спрашивает', 'произносит', 'шепчет', 'кричит',
  'добавляет', 'возражает', 'соглашается', 'отказывается', 'обещает',
]

const voluntaryVerbs = [
  'смотрит', 'оглядывается', 'кивает', 'качает', 'берёт', 'берет', 'опускает', 'поднимает',
  'протягивает', 'отдёргивает', 'отдергивает', 'отходит', 'подходит', 'идёт', 'идет',
  'садится', 'встаёт', 'встает', 'поворачивается', 'улыбается', 'усмехается', 'обнимает',
  'целует', 'атакует', 'бьёт', 'бьет', 'хватает', 'отпускает', 'отвечает', 'говорит',
  'продолжает', 'спрашивает', 'произносит', 'шепчет', 'кричит', 'молчит', 'решает',
  'выбирает', 'соглашается', 'отказывается', 'принимает', 'обещает', 'клянётся',
  'клянется', 'верит', 'думает', 'чувствует', 'понимает', 'осознаёт', 'осознает',
  'вспоминает', 'хочет', 'надеется',
]

const mentalPattern = /(?:думает|чувствует|понимает|осозна[её]т|вспоминает|решает|выбирает|верит|надеется|боится|хочет|не хочет|слова приходят сами|не из головы|внутри него|внутри неё|в его голове|в её голове|из того места,\s*где|память подсказывает|сердце подсказывает)/iu
const emotionPattern = /(?:любит|ненавидит|радуется|стыдится|ревнует|испытывает|ощущает\s+(?:любовь|ненависть|вину|стыд|ревность)|ему становится\s+(?:радостно|стыдно|страшно)|ей становится\s+(?:радостно|стыдно|страшно))/iu
const motivePattern = /(?:потому что он хочет|потому что она хочет|не для того,\s*чтобы|с намерением|решив|желая|намереваясь)/iu

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalize(value: string) {
  return value
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/gu, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/gu, ' ')
}

function roughStem(token: string) {
  return normalize(token).replace(/(?:ться|ется|ится|ается|яется|ует|ают|яют|уют|ишь|ешь|ете|ите|али|яли|или|ала|яла|ила|ает|яет|уют|ит|ет|ют|ут|ат|ят|аю|яю|ую|им|ем|ил|ел|ал|ял|ла|ли|лю|ю|у|ть|л)$/u, '')
}

function inputSupportsVerb(input: string, verb: string) {
  const stem = roughStem(verb)
  if (stem.length < 3) return false
  return normalize(input).split(' ').some((token) => roughStem(token) === stem)
}

function dialogueContent(paragraph: string, playerName: string) {
  const name = escapeRegExp(playerName)
  const attribution = attributionVerbs.join('|')
  return paragraph
    .replace(new RegExp(`^\\s*${name}\\s*:\\s*[—–-]\\s*`, 'iu'), '')
    .replace(/^\s*[—–-]\s*/u, '')
    .replace(new RegExp(`[—–-]\\s*(?:${attribution})\\s+(?:${name}|он|она)(?![\\p{L}\\p{N}_])[^—–-]*(?:[—–-]|$)`, 'giu'), ' ')
    .replace(new RegExp(`(?:${attribution})\\s+(?:${name}|он|она)(?![\\p{L}\\p{N}_])[^.!?]*(?:[.!?]|$)`, 'giu'), ' ')
    .replace(/[—–-]+/gu, ' ')
    .trim()
}

function inputSupportsDialogue(input: string, dialogue: string) {
  const source = normalize(input)
  const candidate = normalize(dialogue)
  if (!candidate) return true
  if (source.includes(candidate)) return true

  const sourceTokens = new Set(source.split(' ').filter((token) => token.length > 2))
  const candidateTokens = candidate.split(' ').filter((token) => token.length > 2)
  if (!candidateTokens.length) return true
  const supported = candidateTokens.filter((token) => sourceTokens.has(token)).length
  return supported / candidateTokens.length >= 0.82 && candidateTokens.length <= sourceTokens.size * 1.35
}

function inputSupportsParagraph(input: string, paragraph: string, actionType: ActionType) {
  if (actionType === 'continue') return false
  const source = normalize(input)
  const candidate = normalize(paragraph)
  if (source.includes(candidate)) return true
  const sourceTokens = new Set(source.split(' ').filter((token) => token.length > 3))
  const candidateTokens = candidate.split(' ').filter((token) => token.length > 3)
  if (!candidateTokens.length) return false
  return candidateTokens.filter((token) => sourceTokens.has(token)).length / candidateTokens.length >= 0.72
}

function pushUnique(violations: AgencyViolation[], violation: AgencyViolation) {
  if (!violations.some((entry) => entry.kind === violation.kind && entry.evidence === violation.evidence)) violations.push(violation)
}

/**
 * Conservative deterministic backstop for obvious player-agency violations.
 * It does not try to understand the whole scene; the focused model audit handles
 * nuanced cases. Its job is to make concrete failures such as an extra player
 * speech, thought, motive, or voluntary follow-up impossible to silently pass.
 */
export function findAgencyViolations({
  playerName,
  input,
  actionType,
  narrative,
  agencyMode,
}: AgencyGuardInput): AgencyViolation[] {
  const name = escapeRegExp(playerName.trim())
  if (!name) return []

  const playerNamePattern = new RegExp(`(?:^|[^\\p{L}\\p{N}_])${name}(?![\\p{L}\\p{N}_])`, 'iu')
  const explicitAttributionPattern = new RegExp(`(?:^${name}\\s*:\\s*[—–-]|(?:${attributionVerbs.join('|')})\\s+${name}(?![\\p{L}\\p{N}_]))`, 'iu')
  const pronounAttributionPattern = new RegExp(`(?:${attributionVerbs.join('|')})\\s+(?:он|она)(?![\\p{L}\\p{N}_])`, 'iu')
  const playerActionPattern = new RegExp(`(?:^|[.!?]\\s+)${name}\\s+(?:не\\s+)?(${voluntaryVerbs.join('|')})(?![\\p{L}])`, 'iu')
  const paragraphs = narrative.split(/\n\s*\n/gu).map((paragraph) => paragraph.trim()).filter(Boolean)
  const violations: AgencyViolation[] = []

  paragraphs.forEach((paragraph, index) => {
    const previous = paragraphs[index - 1] ?? ''
    const isDialogue = /^(?:[\p{L}\p{N}_ -]{1,80}:\s*)?[—–-]\s*/u.test(paragraph)
    const previousFocusesPlayer = playerNamePattern.test(previous)
    const attributedToPlayer = isDialogue && (
      explicitAttributionPattern.test(paragraph)
      || (pronounAttributionPattern.test(paragraph) && previousFocusesPlayer)
    )

    if (attributedToPlayer) {
      const speech = dialogueContent(paragraph, playerName)
      if (!inputSupportsDialogue(input, speech)) {
        pushUnique(violations, {
          kind: 'speech',
          evidence: paragraph,
          reason: 'Модель добавила реплику героя, которой нет во вводе игрока.',
          instruction: `Удали всю незаявленную речь ${playerName}. Сохрани только дословно заданные игроком слова и продолжи реакциями NPC, среды и последствиями.`,
          severity: 'high',
        })
      }
    }

    const mentionsPlayer = playerNamePattern.test(paragraph)
    const supportedParagraph = inputSupportsParagraph(input, paragraph, actionType)
    if ((mentionsPlayer || previousFocusesPlayer) && mentalPattern.test(paragraph) && !supportedParagraph) {
      pushUnique(violations, {
        kind: 'thought',
        evidence: paragraph,
        reason: 'Рассказчик назначил герою незаявленную мысль, память, понимание или внутренний вывод.',
        instruction: `Удали внутреннее содержание ${playerName}. Покажи только наблюдаемое извне и оставь вывод игроку.`,
        severity: 'high',
      })
    }
    if (mentionsPlayer && emotionPattern.test(paragraph) && !supportedParagraph) {
      pushUnique(violations, {
        kind: 'emotion',
        evidence: paragraph,
        reason: 'Рассказчик назначил герою незаявленное чувство.',
        instruction: `Удали назначенную эмоцию ${playerName}; допустимы только непроизвольные телесные симптомы без их эмоциональной трактовки.`,
        severity: 'high',
      })
    }
    if (mentionsPlayer && motivePattern.test(paragraph) && !supportedParagraph) {
      pushUnique(violations, {
        kind: 'motive',
        evidence: paragraph,
        reason: 'Рассказчик приписал герою мотив или намерение, которого игрок не задавал.',
        instruction: `Удали объяснение мотива ${playerName}. Оставь наблюдаемый результат заявленного действия без авторской трактовки намерений.`,
        severity: 'high',
      })
    }

    const actionMatch = paragraph.match(playerActionPattern)
    if (actionMatch && !inputSupportsVerb(input, actionMatch[1]) && !supportedParagraph) {
      const kind: AgencyViolationKind = /решает|выбирает|соглашается|отказывается|принимает|обещает|клян/iu.test(actionMatch[1]) ? 'decision' : 'action'
      const cinematicTransitionAllowed = agencyMode === 'cinematic'
        && /смотрит|оглядывается|поворачивается|подходит|отходит|садится|вста[её]т/iu.test(actionMatch[1])
        && actionType !== 'continue'
      if (!cinematicTransitionAllowed) {
        pushUnique(violations, {
          kind,
          evidence: paragraph,
          reason: kind === 'decision'
            ? 'Модель приняла новое решение за героя.'
            : 'Модель добавила новое добровольное действие героя после границы ввода.',
          instruction: `Удали незаявленное действие ${playerName}. Сцена должна остановиться до этого выбора и развиваться только действиями NPC, среды и неизбежными последствиями уже заявленного.`,
          severity: 'high',
        })
      }
    }
  })

  return violations
}

function narrativeBlocks(narrative: string): string[] {
  return narrative.replace(/\r/gu, '').trim().split(/\n[\t ]*\n+/u).map((block) => block.trim()).filter(Boolean)
}

/**
 * Deterministically removes only paragraphs that assign new speech, choices, thoughts or
 * voluntary actions to the player. This is a final safety filter, not a prose rewrite: NPC
 * reactions, environment and already valid consequences remain byte-for-byte unchanged.
 */
export function sanitizePlayerAgency(input: AgencyGuardInput): AgencySanitizationResult {
  let narrative = input.narrative.trim()
  let removedParagraphs = 0
  const collected: AgencyViolation[] = []
  let restoredSubmittedSpeech = false

  for (let pass = 0; pass < 4 && narrative; pass += 1) {
    const violations = findAgencyViolations({ ...input, narrative })
    if (!violations.length) return { narrative, violations: collected, removedParagraphs }
    violations.forEach((violation) => pushUnique(collected, violation))

    const rejected = new Set(violations.map((violation) => violation.evidence.trim()))
    const blocks = narrativeBlocks(narrative)
    const kept = blocks.filter((block) => {
      if (!rejected.has(block)) return true
      removedParagraphs += 1
      return false
    })
    if (kept.length === blocks.length) break
    narrative = kept.join('\n\n')

    if (!restoredSubmittedSpeech && input.actionType === 'say' && violations.some((violation) => violation.kind === 'speech')) {
      const submitted = input.input.replace(/\r?\n+/gu, ' ').replace(/^\s*[—–-]\s*/u, '').trim()
      if (submitted) narrative = [`— ${submitted}`, narrative].filter(Boolean).join('\n\n')
      restoredSubmittedSpeech = true
    }
  }

  // A second exact pass handles a paragraph that became attributable only after its neighbour
  // was removed. If anything exotic remains, discard its exact paragraph instead of failing the turn.
  const remaining = findAgencyViolations({ ...input, narrative })
  if (remaining.length) {
    remaining.forEach((violation) => pushUnique(collected, violation))
    const rejected = new Set(remaining.map((violation) => violation.evidence.trim()))
    narrative = narrativeBlocks(narrative).filter((block) => {
      if (!rejected.has(block)) return true
      removedParagraphs += 1
      return false
    }).join('\n\n')
  }

  return { narrative, violations: collected, removedParagraphs }
}
