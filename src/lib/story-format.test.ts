import { describe, expect, it } from 'vitest'
import { formatStoryText } from './story-format'

describe('story typography parser', () => {
  it('recognizes Russian dialogue paragraphs', () => {
    expect(formatStoryText('— Держи, парень.\n\nОн ставит кружку на стол.')).toEqual([
      { kind: 'dialogue', text: '— Держи, парень.' },
      { kind: 'narration', text: 'Он ставит кружку на стол.' },
    ])
  })

  it('recognizes marked thoughts and removes the technical markers', () => {
    expect(formatStoryText('*Что-то здесь не сходится.*')).toEqual([
      { kind: 'thought', text: 'Что-то здесь не сходится.' },
    ])
  })

  it('supports explicit thought markers from compatible models', () => {
    expect(formatStoryText('[[thought]]Нельзя показывать страх.[[/thought]]')).toEqual([
      { kind: 'thought', text: 'Нельзя показывать страх.' },
    ])
  })
})
