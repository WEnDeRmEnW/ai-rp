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
  it('shows known people and rumors compactly while keeping closed dossiers and hidden figures out of the initial DOM', () => {
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
    expect(html).toContain('Аурел Семипечатный')
    expect(html).toContain('Архивариус Лет')
    expect(html).toContain('Сведения требуют проверки')
    expect(html).not.toContain('Путь этого имени')
    expect(html).not.toContain('Подтверждённая сила')
    expect(html).not.toContain('Контроль сложных печатей')
    expect(html).not.toContain('Человек между воспоминаниями')
    expect(html).not.toContain('Последние записи указывают на попытку сохранить способ остановки')
    expect(html).not.toContain('Имя, которого герой не знает')
    expect(html).not.toContain('Предупредил три северные станции')
  })

  it('shows people rather than event records and resolves the real linked character name', () => {
    const campaign = normalizeWorld(generatedWorldSchema.parse(demoWorld(request)), request)
    const source = structuredClone(campaign.world.legends![0])
    const eventRecord = {
      ...structuredClone(source),
      id: 'legend-event-record',
      characterId: undefined,
      name: 'Падение Первозданного Эфира',
      role: 'Катастрофа, изменившая мир',
      discovery: { ...source.discovery, visibility: 'known' as const },
    }
    const linkedPerson = {
      ...structuredClone(source),
      id: 'legend-linked-person',
      characterId: campaign.npcs[0].id,
      name: 'Восхождение Рин',
      role: 'Легендарная путешественница и защитница пути',
      discovery: { ...source.discovery, visibility: 'known' as const },
    }
    campaign.world.legends!.push(eventRecord, linkedPerson)

    const html = renderToStaticMarkup(<LegendariumPanel campaign={campaign} />)

    expect(html).toContain(campaign.npcs[0].name)
    expect(html).not.toContain('Восхождение Рин')
    expect(html).not.toContain('Падение Первозданного Эфира')
  })
})
