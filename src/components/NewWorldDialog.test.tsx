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

const secondIdea: WorldIdea = {
  ...idea,
  title: 'Сады Непрожитых Имен',
  tagline: 'Человек получает имя только после поступка, который общество решает запомнить.',
  corePremise: 'Города выращивают общественные имена как живые сады, а безымянные люди могут менять роль, прошлое и юридическую личность ценой утраты прежних связей.',
  inspiration: 'Самостоятельный мир городов-садов, где имя является общественным договором, а не врождённой меткой. Политика, наследование и близость зависят от того, какие поступки признаны достойными памяти.',
  genre: 'Социальное фэнтези и путешествие',
  heroName: 'Терн',
  heroConcept: 'Безымянный курьер, который переносит чужие непризнанные поступки между враждующими садами.',
  opening: 'Во время церемонии имя умершего правителя прорастает на руке героя, хотя никто не признаёт его наследником.',
  signatureMechanic: {
    name: 'Признание имени',
    principle: 'Поступок меняет личность только после независимого общественного свидетельства.',
    playerUse: 'Герой собирает свидетельства, оспаривает память и временно действует без закреплённой роли.',
    worldConsequences: ['Ложное признание меняет наследование', 'Отвергнутые поступки порождают сообщества безымянных'],
  },
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
    onInvent.mockResolvedValueOnce(idea).mockResolvedValueOnce(secondIdea)
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

    fireEvent.change(screen.getByLabelText(/Что обязательно сохранить/u), { target: { value: 'Без магии и без избранного героя' } })
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
    expect(await screen.findByText(secondIdea.title)).toBeTruthy()
    expect(onInvent.mock.calls[1]![0].previousIdeas[0]).toContain('Море Неслучившихся Берегов')
    expect(onInvent.mock.calls[1]![0].creativeSeed).not.toBe(onInvent.mock.calls[0]![0].creativeSeed)
    expect(onInvent.mock.calls[1]![0].hint).toBe('Без магии и без избранного героя')
    expect(onInvent.mock.calls[1]![0].hint).not.toContain(idea.title)
    expect((screen.getByLabelText('Замысел мира') as HTMLTextAreaElement).value).toContain(secondIdea.title)
  })

  it('keeps the current world visible when a repeated response slips through the API', async () => {
    const onInvent = vi.fn<(request: Omit<WorldIdeaRequest, 'provider'>) => Promise<WorldIdea>>()
      .mockResolvedValueOnce(idea)
      .mockResolvedValueOnce(idea)
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
    expect(await screen.findByText(idea.title)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Придумать другой' }))

    expect(await screen.findByText(/DeepSeek повторил прошлый мир/u)).toBeTruthy()
    expect(screen.getByText(idea.title)).toBeTruthy()
    expect((screen.getByLabelText('Замысел мира') as HTMLTextAreaElement).value).toContain(idea.title)
  })

  it('starts only one generation when the button is clicked twice before React updates its disabled state', async () => {
    let resolveIdea!: (value: WorldIdea) => void
    const pendingIdea = new Promise<WorldIdea>((resolve) => {
      resolveIdea = resolve
    })
    const onInvent = vi.fn<(request: Omit<WorldIdeaRequest, 'provider'>) => Promise<WorldIdea>>()
      .mockReturnValue(pendingIdea)
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

    const button = screen.getByRole('button', { name: 'ИИ, удиви меня' })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(onInvent).toHaveBeenCalledTimes(1)

    resolveIdea(idea)
    expect(await screen.findByText(idea.title)).toBeTruthy()
  })
})
