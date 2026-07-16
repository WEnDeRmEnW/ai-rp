// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorldIdea, WorldIdeaRequest } from '../../shared/types'
import { NewWorldDialog } from './NewWorldDialog'

const idea: WorldIdea = {
  title: 'Море Неслучившихся Берегов',
  tagline: 'Каждый отлив оставляет доказательство будущего, которое ещё можно отвергнуть.',
  corePremise: 'Берега получают материальные следы возможных последствий раньше породивших их решений.',
  inspiration: 'Обширный оригинальный мир прибрежных республик, кочующих судов и внутренних морей, где будущие последствия появляются на берегу как спорные вещественные доказательства. Общества строят право, торговлю, войну и личные отношения вокруг проверки этих следов.',
  genre: 'Социальная фантастика, путешествие и приключение',
  tone: 'Живой и загадочный: от тёплой портовой повседневности до тяжёлых решений о будущем',
  heroName: 'Ина',
  heroConcept: 'Молодая картографка отливов, умеющая сопоставлять противоречивые следы и не считающая их судьбой.',
  opening: 'На рассвете Ина находит на дне гавани памятник собственной гибели, установленный городом, которого ещё не существует.',
  pillars: [
    { title: 'Будущие обломки', description: 'Отлив приносит предметы возможных событий.', worldImpact: 'Порты меняют право и торговлю вокруг достоверности находок.' },
    { title: 'Разные берега', description: 'Каждое побережье видит иной вариант.', worldImpact: 'Государства спорят о праве объявлять будущее официальным.' },
    { title: 'Человеческое свидетельство', description: 'След без проверки ничего не доказывает.', worldImpact: 'Архивисты, рыбаки и курьеры становятся политически значимыми.' },
  ],
  signatureMechanic: {
    name: 'Сверка отлива',
    principle: 'След показывает последствие, но не единственную причину.',
    playerUse: 'Герой сопоставляет находки, свидетелей и интересы сторон.',
    worldConsequences: ['Ошибочное толкование приближает событие', 'Скрытая находка меняет планы далёких государств'],
  },
  livingWorld: {
    everydayLife: 'Рыбаки продают улов вместе с заверенными наблюдениями.',
    autonomousForces: ['Архив гавани', 'Союз страховых домов', 'Береговые общины'],
    distantHorizons: ['Сухое внутреннее море', 'Архипелаг без следов', 'Плавучие суды достоверности'],
  },
  centralTensions: ['Свобода против безопасности', 'Открытость против права на неизвестность', 'Единый закон против множества вариантов'],
  uniquePromises: ['Расследовать последствия до причин', 'Путешествовать между культурами будущего', 'Менять политику достоверностью свидетельств'],
  avoidedCliches: ['Нет избранного', 'Нет точного пророчества', 'Нет безликой империи'],
  originalityScore: 92,
}

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 0))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('automatic world inventor in the world forge', () => {
  it('fills every editable creation field and prevents the next result from repeating the previous idea', async () => {
    const onInvent = vi.fn<(request: Omit<WorldIdeaRequest, 'provider'>) => Promise<WorldIdea>>()
    onInvent.mockResolvedValue(idea)
    render(<NewWorldDialog
      open
      generating={false}
      ideating={false}
      providerName="deepseek-v4-flash:cloud"
      isDemo={false}
      onClose={() => undefined}
      onCreate={async () => undefined}
      onInvent={onInvent}
      onCancelIdea={() => undefined}
    />)

    fireEvent.click(screen.getByRole('button', { name: 'ИИ, удиви меня' }))
    expect(await screen.findByText('Море Неслучившихся Берегов')).toBeTruthy()
    expect((screen.getByLabelText('Замысел мира') as HTMLTextAreaElement).value).toContain(`Название мира: ${idea.title}`)
    expect((screen.getByLabelText('Замысел мира') as HTMLTextAreaElement).value).toContain(idea.inspiration)
    expect((screen.getByLabelText('Замысел мира') as HTMLTextAreaElement).value).toContain(idea.signatureMechanic.name)
    expect((screen.getByLabelText('Жанр') as HTMLInputElement).value).toBe(idea.genre)
    expect((screen.getByLabelText('Тон') as HTMLInputElement).value).toBe(idea.tone)
    expect(screen.getByText('92%')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Придумать другой' }))
    await waitFor(() => expect(onInvent).toHaveBeenCalledTimes(2))
    expect(onInvent.mock.calls[1]![0].previousIdeas[0]).toContain('Море Неслучившихся Берегов')
    expect(onInvent.mock.calls[1]![0].creativeSeed).not.toBe(onInvent.mock.calls[0]![0].creativeSeed)
  })
})
