import { describe, expect, it } from 'vitest'
import { findNarrativeRepetitionIssues, findRepeatedNarrativePhrases } from './narrative-repetition'
import type { StoryMessage } from './types'

const penthouseParagraph = 'В пентхаусе тихо. Только гул систем жизнеобеспечения — вентиляция, фильтры, терморегуляция — и ровный свет голографических панелей на стенах. За панорамным окном — тёмные провалы Машинного Пояса, редкие огни аварийных генераторов, силуэты заброшенных кранов на фоне тусклого зарева Центрального Купола.'

function assistantMessage(turn: number, content: string): StoryMessage {
  return {
    id: `assistant-${turn}`,
    role: 'assistant',
    content,
    createdAt: new Date(2026, 6, turn).toISOString(),
    turn,
  }
}

describe('narrative repetition guard', () => {
  it('finds the recurring penthouse description from a real campaign example', () => {
    const messages = [
      assistantMessage(51, penthouseParagraph),
      assistantMessage(52, `На столе раскрывается отчёт корпорации. За панорамным окном — тёмные провалы Машинного Пояса, редкие огни аварийных генераторов и силуэты заброшенных кранов.`),
      assistantMessage(53, `Лифт останавливается этажом ниже. За стеклом остаются тёмные провалы Машинного Пояса, редкие огни аварийных генераторов, силуэты заброшенных кранов.`),
      assistantMessage(54, `Только гул систем жизнеобеспечения нарушает тишину. За панорамным окном видны тёмные провалы Машинного Пояса и редкие огни аварийных генераторов.`),
    ]

    const issues = findNarrativeRepetitionIssues(penthouseParagraph, messages)

    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'recent-paragraph', severity: 'high', priorTurn: 51 }),
      expect.objectContaining({ kind: 'recurring-phrases' }),
    ]))
    expect(findRepeatedNarrativePhrases(messages).some(({ phrase }) => phrase.includes('темные провалы машинного пояса'))).toBe(true)
  })

  it('finds a duplicated environment paragraph inside the same answer', () => {
    const candidate = `${penthouseParagraph}\n\nЭллира кладёт на стол ключ-карту и называет номер закрытого ангара.\n\n${penthouseParagraph}`
    const issues = findNarrativeRepetitionIssues(candidate, [])

    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'internal-paragraph', severity: 'high', candidateParagraph: 2 }),
    ]))
  })

  it('allows the same location name when the paragraph carries a new actionable fact', () => {
    const messages = [assistantMessage(51, penthouseParagraph)]
    const candidate = 'Из Машинного Пояса приходит подписанный аварийный пакет: шлюз девятого дока откроется через шесть минут, а одноразовый код уже записан на ключ-карту Эллиры.'

    expect(findNarrativeRepetitionIssues(candidate, messages)).toEqual([])
  })
})
