import { describe, expect, it } from 'vitest'
import { formatStoryText } from './story-format'

describe('story typography parser', () => {
  it('recognizes Russian dialogue paragraphs', () => {
    expect(formatStoryText('— Держи, парень.\n\nОн ставит кружку на стол.')).toEqual([
      { kind: 'dialogue', text: '— Держи, парень.' },
      { kind: 'narration', text: 'Он ставит кружку на стол.' },
    ])
  })

  it('separates dialogue on a single line break but heals accidental prose wraps', () => {
    expect(formatStoryText('Ветер шевелит занавески.\nТени ползут по стене.\n— Здесь кто-нибудь есть?\nОн замирает у двери.')).toEqual([
      { kind: 'narration', text: 'Ветер шевелит занавески. Тени ползут по стене.' },
      { kind: 'dialogue', text: '— Здесь кто-нибудь есть?' },
      { kind: 'narration', text: 'Он замирает у двери.' },
    ])

    expect(formatStoryText('Он медленно подходит к окну\nи осторожно отводит тяжёлую штору.')).toEqual([
      { kind: 'narration', text: 'Он медленно подходит к окну и осторожно отводит тяжёлую штору.' },
    ])
  })

  it('recognizes marked thoughts and removes technical markers', () => {
    expect(formatStoryText('*Что-то здесь не сходится.*\n\nМысль: Нужно уходить прямо сейчас.')).toEqual([
      { kind: 'thought', text: 'Что-то здесь не сходится.' },
      { kind: 'thought', text: 'Нужно уходить прямо сейчас.' },
    ])
  })

  it('supports explicit thought markers from compatible models', () => {
    expect(formatStoryText('[[thought]]Нельзя показывать страх.[[/thought]]')).toEqual([
      { kind: 'thought', text: 'Нельзя показывать страх.' },
    ])
  })

  it('extracts a speaker only when a name precedes an actual dialogue line', () => {
    expect(formatStoryText('Харуки: — Держи, парень.\n\nЦена: 10 золотых.')).toEqual([
      { kind: 'dialogue', speaker: 'Харуки', text: '— Держи, парень.' },
      { kind: 'narration', text: 'Цена: 10 золотых.' },
    ])
  })

  it('turns scene separators and markdown beat headings into clean transitions', () => {
    expect(formatStoryText('Первый зал остаётся позади.\n\n***\n\n## Под башней\n\nВнизу слышится вода.')).toEqual([
      { kind: 'narration', text: 'Первый зал остаётся позади.' },
      { kind: 'transition', text: '' },
      { kind: 'transition', text: 'Под башней' },
      { kind: 'narration', text: 'Внизу слышится вода.' },
    ])
  })

  it('balances a wall of text into readable paragraphs without losing words', () => {
    const sentences = Array.from({ length: 12 }, (_, index) => `Предложение номер ${index + 1} описывает важную деталь происходящего вокруг героя.`)
    const source = sentences.join(' ')
    const result = formatStoryText(source)

    expect(result.length).toBeGreaterThan(1)
    expect(result.every((block) => block.kind === 'narration' && block.text.length <= 520)).toBe(true)
    expect(result.map((block) => block.text).join(' ')).toBe(source)
  })

  it('combines consecutive tiny narrative beats to reduce visual noise', () => {
    expect(formatStoryText('Он замер.\n\nДверь открылась.\n\nВ коридоре никого не было.')).toEqual([
      { kind: 'narration', text: 'Он замер. Дверь открылась. В коридоре никого не было.' },
    ])
  })
})
