import { describe, expect, it } from 'vitest'
import { analyzeWorldRequestIntent, worldIntentPrompt } from './world-intent'

const request = {
  inspiration: 'Хочу обычный аниме-мир в духе «Реинкарнации безработного» и «О моём перерождении в слизь».',
  genre: 'Аниме-фэнтези, исекай',
  tone: 'Приключенческий',
  opening: 'Новая жизнь в незнакомом королевстве',
  canonMode: 'original',
}

describe('world request intent', () => {
  it('treats a familiar anime isekai request as a genre contract rather than a demand for alien metaphysics', () => {
    const intent = analyzeWorldRequestIntent(request)
    expect(intent).toMatchObject({ mode: 'familiar', animeLike: true, referenceRole: 'inspiration' })

    const prompt = worldIntentPrompt(request)
    expect(prompt).toContain('узнаваемое жанровое удовольствие')
    expect(prompt).toContain('королевств, гильдий, магии')
    expect(prompt).toContain('не разрешают копировать')
  })

  it('keeps exact canon and explicit radical originality distinct', () => {
    expect(analyzeWorldRequestIntent({ ...request, canonMode: 'faithful' }).mode).toBe('canon')
    expect(analyzeWorldRequestIntent({ ...request, inspiration: 'Придумай полностью уникальный необычный мир', genre: 'Фэнтези' }).mode).toBe('open')
  })
})
