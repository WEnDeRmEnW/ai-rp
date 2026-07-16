import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { demoWorld } from '../../server/demo'
import { generatedWorldSchema } from '../../server/schemas'
import { normalizeWorld } from '../../server/world-normalizer'
import { LegendariumPanel } from './LegendariumPanel'

const request = {
  inspiration: 'Город живых созвездий',
  genre: 'Фэнтези',
  tone: 'Таинственный',
  characterName: 'Эрен',
  characterConcept: 'Искатель имён',
  opening: 'Ночной вокзал',
  canonMode: 'original' as const,
  contentBoundaries: '',
  provider: { provider: 'demo' as const, model: 'demo', baseUrl: '', temperature: 0.8 },
}

describe('legendarium progressive disclosure', () => {
  it('shows known history and rumors but keeps hidden sections and figures out of the interface', () => {
    const campaign = normalizeWorld(generatedWorldSchema.parse(demoWorld(request)), request)
    const hidden = structuredClone(campaign.world.legends![0])
    hidden.id = 'legend-hidden'
    hidden.name = 'Имя, которого герой не знает'
    hidden.discovery.visibility = 'hidden'
    campaign.world.legends!.push(hidden)

    const html = renderToStaticMarkup(<LegendariumPanel campaign={campaign} />)

    expect(html).toContain('Имена, пережившие печать')
    expect(html).toContain('Панорама мира')
    expect(html).toContain('Известные герою сильные фигуры')
    expect(html).toContain('Это только открытые сведения')
    expect(html).toContain('Ступени признания в этом мире')
    expect(html).toContain('Путь этого имени')
    expect(html).toContain('Подтверждённая сила')
    expect(html).toContain('Элитный уровень')
    expect(html).toContain('Контроль сложных печатей')
    expect(html).toContain('Аурел Семипечатный')
    expect(html).toContain('Архивариус Лет')
    expect(html).toContain('Человек между воспоминаниями')
    expect(html).toContain('Сведения требуют проверки')
    expect(html).not.toContain('Последние записи указывают на попытку сохранить способ остановки')
    expect(html).not.toContain('Имя, которого герой не знает')
    expect(html).not.toContain('Предупредил три северные станции')
  })
})
