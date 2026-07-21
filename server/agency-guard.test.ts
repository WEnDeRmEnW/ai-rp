import { describe, expect, it } from 'vitest'
import { findAgencyViolations, sanitizePlayerAgency } from './agency-guard'

describe('player agency guard', () => {
  const playerName = 'Фейн'
  const input = 'они могут выписать тебя из истории, но не сделают этого если ты не будешь в истории вместе со мной'

  it('allows the submitted line but rejects added speech, inner narration, and voluntary action', () => {
    const narrative = `Фейн смотрит на протянутую руку Элиры, но не берёт её сразу. Слова приходят сами — не из головы, а откуда-то глубже, из того места, где хранятся версии, которые он помнит, но не проживал.

— Они могут выписать тебя из истории, — говорит он тихо, но твёрдо. — Но не сделают этого, если ты не будешь в истории вместе со мной.

Элира замирает.

— Пока мы вместе, — продолжает Фейн, — мы — один якорь. Если они вычеркнут тебя — придётся вычеркнуть и меня.`

    const violations = findAgencyViolations({
      playerName,
      input,
      actionType: 'do',
      narrative,
      agencyMode: 'strict',
    })

    expect(violations.map((violation) => violation.kind)).toEqual(expect.arrayContaining(['action', 'thought', 'speech']))
    expect(violations.filter((violation) => violation.kind === 'speech')).toHaveLength(1)
    expect(violations.find((violation) => violation.kind === 'speech')?.evidence).toContain('Пока мы вместе')
  })

  it('does not reject a verbatim submitted player line surrounded by NPC reactions', () => {
    const narrative = `Элира не убирает протянутую руку.

— Они могут выписать тебя из истории, — говорит Фейн. — Но не сделают этого, если ты не будешь в истории вместе со мной.

Улыбка исчезает с лица Элиры; теперь она слушает без прежней насмешки.`

    expect(findAgencyViolations({
      playerName,
      input,
      actionType: 'say',
      narrative,
      agencyMode: 'strict',
    })).toEqual([])
  })

  it('forbids new player actions and speech on continue', () => {
    const violations = findAgencyViolations({
      playerName,
      input: 'Продолжить.',
      actionType: 'continue',
      narrative: `Фейн кивает и подходит к двери.

— Я согласен, — говорит Фейн.`,
      agencyMode: 'strict',
    })

    expect(violations.map((violation) => violation.kind)).toEqual(expect.arrayContaining(['action', 'speech']))
  })

  it('removes only violating paragraphs and preserves the submitted player line plus NPC reaction', () => {
    const narrative = `Фейн смотрит на протянутую руку Элиры, но не берёт её сразу. Слова приходят сами — не из головы, а откуда-то глубже.

— Они могут выписать тебя из истории, — говорит Фейн. — Но не сделают этого, если ты не будешь в истории вместе со мной.

Элира опускает руку и медленно кивает.

— Пока мы вместе, — продолжает Фейн, — они не рискнут.`
    const result = sanitizePlayerAgency({
      playerName,
      input,
      actionType: 'say',
      narrative,
      agencyMode: 'strict',
    })

    expect(result.narrative).toContain(`— ${input}`)
    expect(result.narrative).toContain('Элира опускает руку')
    expect(result.narrative).not.toContain('Слова приходят сами')
    expect(result.narrative).not.toContain('Пока мы вместе')
    expect(findAgencyViolations({ playerName, input, actionType: 'say', narrative: result.narrative, agencyMode: 'strict' })).toEqual([])
  })

  it('returns a safe empty result instead of throwing when a continue response contains only player decisions', () => {
    const result = sanitizePlayerAgency({
      playerName,
      input: 'Продолжить.',
      actionType: 'continue',
      narrative: 'Фейн кивает, принимает предложение и подходит к двери.',
      agencyMode: 'strict',
    })

    expect(result.narrative).toBe('')
    expect(result.removedParagraphs).toBe(1)
  })
})
