import { afterEach, describe, expect, it, vi } from 'vitest'
import { demoWorld } from './demo'
import { generateWorld, splitGeneratedWorldSections } from './orchestrator'

type CompletionBody = { messages: Array<{ role: string; content: string }> }
type Stage = 'core' | 'civilization' | 'characters' | 'legends' | 'narrative' | 'interface'

const request = {
  inspiration: 'Эйдол',
  genre: 'Фэнтези',
  tone: 'Серьёзный',
  characterName: 'Акира',
  characterConcept: 'Искатель забытых дорог',
  opening: 'Пограничный квартал',
  canonMode: 'original' as const,
  contentBoundaries: '',
  provider: {
    provider: 'ollama' as const,
    model: 'deepseek-v4-flash:cloud',
    baseUrl: 'https://example.test/v1',
    apiKey: 'test-key',
    temperature: 0.75,
  },
}

function providerResponse(value: unknown) {
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function requestedGenerationStage(system: string): Stage | undefined {
  if (!system.includes('МНОГОЭТАПНАЯ ГЕНЕРАЦИЯ')) return undefined
  if (system.includes('ЭТАП «ФУНДАМЕНТ И ГЕРОЙ»')) return 'core'
  if (system.includes('ЭТАП «МИР, ГЕОГРАФИЯ И ЦИВИЛИЗАЦИИ»')) return 'civilization'
  if (system.includes('ЭТАП «ЖИВЫЕ ПЕРСОНАЖИ И ЦЕНТРЫ СИЛЫ»')) return 'characters'
  if (system.includes('ЭТАП «ЛЕГЕНДАРИУМ И ГЛУБОКИЙ ЛОР»')) return 'legends'
  if (system.includes('ЭТАП «АВТОНОМНАЯ ИСТОРИЯ И СТАРТОВАЯ СЦЕНА»')) return 'narrative'
  if (system.includes('ЭТАП «АДАПТИВНЫЙ ИНТЕРФЕЙС МИРА»')) return 'interface'
  throw new Error('Неизвестный этап генерации')
}

const passedQualityReview = {
  pass: true,
  coverage: 100,
  issues: [],
  missingCapabilities: [],
  coverageAudit: [],
  constraintAudit: [],
  rewriteInstructions: 'Исправления не требуются',
}

const originalConcept = {
  recognizedCanon: false,
  startingAccess: 'developing',
  entities: [],
  powerFantasy: 'Исследование неизвестного мира',
  desiredScale: 'Обширная кампания',
  originalityRules: ['Не копировать чужие вселенные'],
}

afterEach(() => vi.unstubAllGlobals())

describe('multi-stage world generation', () => {
  it('never asks the provider to emit the entire world in one completion', async () => {
    const completeWorld = demoWorld({ ...request, provider: { provider: 'demo' as const } })
    const sections = splitGeneratedWorldSections(completeWorld)
    const requestedStages: string[] = []

    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as CompletionBody
      const system = body.messages.find((message) => message.role === 'system')?.content ?? ''

      const stage = requestedGenerationStage(system)
      if (stage) {
        requestedStages.push(stage)
        return providerResponse(sections[stage])
      }

      if (system.includes('Составь coverageAudit')) return providerResponse(passedQualityReview)
      return providerResponse(originalConcept)
    }))

    const generated = await generateWorld(request)

    expect(requestedStages).toEqual(['core', 'civilization', 'characters', 'legends', 'narrative', 'interface'])
    expect(generated).toEqual(completeWorld)
  })

  it('repairs only the section that owns a broken cross-world binding', async () => {
    const completeWorld = demoWorld({ ...request, provider: { provider: 'demo' as const } })
    const sections = splitGeneratedWorldSections(completeWorld)
    const brokenInterface = structuredClone(sections.interface)
    const firstElement = brokenInterface.world.interfaceModules[0]?.elements[0]
    expect(firstElement).toBeDefined()
    if (!firstElement) return
    firstElement.binding = { domain: 'world.metric', key: 'missing-metric' }
    let interfaceCalls = 0
    const requestedStages: Stage[] = []

    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as CompletionBody
      const system = body.messages.find((message) => message.role === 'system')?.content ?? ''
      const stage = requestedGenerationStage(system)
      if (stage) {
        requestedStages.push(stage)
        if (stage === 'interface') {
          interfaceCalls += 1
          return providerResponse(interfaceCalls === 1 ? brokenInterface : sections.interface)
        }
        return providerResponse(sections[stage])
      }
      if (system.includes('Составь coverageAudit')) return providerResponse(passedQualityReview)
      return providerResponse(originalConcept)
    }))

    await expect(generateWorld(request)).resolves.toEqual(completeWorld)
    expect(requestedStages).toEqual(['core', 'civilization', 'characters', 'legends', 'narrative', 'interface', 'interface'])
  })
})
