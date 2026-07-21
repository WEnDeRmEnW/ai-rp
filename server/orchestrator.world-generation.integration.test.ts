import { afterEach, describe, expect, it, vi } from 'vitest'
import { demoWorld } from './demo'
import { generateWorld, splitGeneratedWorldSections } from './orchestrator'

type CompletionBody = { messages: Array<{ role: string; content: string }> }
type Stage = 'manifest' | 'core' | 'civilization' | 'characters' | 'legends' | 'narrative' | 'interface'

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

function emptyProviderResponse() {
  return new Response(JSON.stringify({ choices: [{ message: { content: '' } }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function requestedGenerationStage(system: string): Stage | undefined {
  if (system.includes('единый компактный паспорт большого ролевого мира')) return 'manifest'
  if (!system.includes('МНОГОЭТАПНАЯ ГЕНЕРАЦИЯ')) return undefined
  if (system.includes('ЭТАП «ФУНДАМЕНТ И ГЕРОЙ»')) return 'core'
  if (system.includes('ЭТАП «МИР, ГЕОГРАФИЯ И ЦИВИЛИЗАЦИИ»')) return 'civilization'
  if (system.includes('ЭТАП «ЖИВЫЕ ПЕРСОНАЖИ И ЦЕНТРЫ СИЛЫ»')) return 'characters'
  if (system.includes('ЭТАП «ЛЕГЕНДАРИУМ И ГЛУБОКИЙ ЛОР»')) return 'legends'
  if (system.includes('ЭТАП «АВТОНОМНАЯ ИСТОРИЯ И СТАРТОВАЯ СЦЕНА»')) return 'narrative'
  if (system.includes('ЭТАП «АДАПТИВНЫЙ ИНТЕРФЕЙС МИРА»')) return 'interface'
  throw new Error('Неизвестный этап генерации')
}

function manifestFromWorld(world: ReturnType<typeof demoWorld>) {
  const capabilitySystem = world.world.capabilitySystem!
  return {
    world: {
      name: world.world.name,
      tagline: world.world.tagline,
      era: world.world.era,
      overview: world.world.overview,
      capabilitySystemId: capabilitySystem.id ?? 'capability-system',
      capabilityGroups: capabilitySystem.groups.map((group) => ({ id: group.id ?? group.label, label: group.label })),
      capabilityTiers: capabilitySystem.tiers.map((tier) => ({ id: tier.id ?? tier.label, label: tier.label })),
    },
    player: {
      name: world.player.name,
      statKeys: world.player.stats.map((stat) => stat.key),
      resourceKeys: world.player.resources.map((resource) => resource.key),
      abilityNames: world.player.abilities.map((ability) => ability.name),
      inventory: world.inventory.map((item, index) => ({ id: item.id ?? `item-${index}`, name: item.name, category: item.category, rarity: item.rarity })),
    },
    factions: world.world.factions.map((faction) => ({ name: faction.name, role: faction.description })),
    places: world.world.places.map((place) => ({ name: place.name, kind: place.kind, ...(place.parentName ? { parentName: place.parentName } : {}), ...(place.controllingFactionName ? { controllingFactionName: place.controllingFactionName } : {}) })),
    npcs: world.npcs.map((npc) => ({ name: npc.name, role: npc.role, locationName: npc.lastSeen, factionNames: npc.factionNames ?? [], threatTier: npc.threatProfile?.tier ?? 'capable', hidden: npc.dossier?.familiarity === 'recognized' })),
    legends: world.world.legends.map((legend) => ({ name: legend.name, ...(legend.characterName ? { characterName: legend.characterName } : {}), stage: legend.stage, lifeStatus: legend.lifeStatus, era: legend.era })),
    narrative: {
      processTitles: world.world.processes.map((process) => process.title),
      eventTitles: world.worldEvents.map((event) => event.title),
      threadTitles: world.threads.map((thread) => thread.title),
      openingLocationName: world.opening.scene.location,
      openingNpcNames: world.opening.scene.presentNpcNames,
    },
    interface: {
      metricIds: (world.world.metrics ?? []).map((metric) => metric.id),
      moduleIds: (world.world.interfaceModules ?? []).map((module) => module.id),
    },
  }
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
    const manifest = manifestFromWorld(completeWorld)
    const requestedStages: string[] = []
    let activeWorldSections = 0
    let peakWorldSections = 0

    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as CompletionBody
      const system = body.messages.find((message) => message.role === 'system')?.content ?? ''

      const stage = requestedGenerationStage(system)
      if (stage) {
        requestedStages.push(stage)
        if (stage === 'manifest') return providerResponse(manifest)
        activeWorldSections += 1
        peakWorldSections = Math.max(peakWorldSections, activeWorldSections)
        await new Promise((resolve) => setTimeout(resolve, 10))
        activeWorldSections -= 1
        return providerResponse(sections[stage])
      }

      if (system.includes('Составь coverageAudit')) return providerResponse(passedQualityReview)
      return providerResponse(originalConcept)
    }))

    const generated = await generateWorld(request)

    expect(requestedStages).toEqual(['manifest', 'core', 'civilization', 'characters', 'legends', 'narrative', 'interface'])
    expect(peakWorldSections).toBe(6)
    expect(generated).toEqual(completeWorld)
  })

  it('extracts every requested section when DeepSeek returns a wrapped complete world', async () => {
    const completeWorld = demoWorld({ ...request, provider: { provider: 'demo' as const } })
    const manifest = manifestFromWorld(completeWorld)
    const requestedStages: Stage[] = []

    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as CompletionBody
      const system = body.messages.find((message) => message.role === 'system')?.content ?? ''
      const stage = requestedGenerationStage(system)
      if (stage) {
        requestedStages.push(stage)
        if (stage === 'manifest') return providerResponse(manifest)
        return providerResponse({ data: { generatedWorld: completeWorld } })
      }
      if (system.includes('Составь coverageAudit')) return providerResponse(passedQualityReview)
      return providerResponse(originalConcept)
    }))

    await expect(generateWorld(request)).resolves.toEqual(completeWorld)
    expect(requestedStages).toEqual(['manifest', 'core', 'civilization', 'characters', 'legends', 'narrative', 'interface'])
  })

  it('repairs only the section that owns a broken cross-world binding', async () => {
    const completeWorld = demoWorld({ ...request, provider: { provider: 'demo' as const } })
    const sections = splitGeneratedWorldSections(completeWorld)
    const manifest = manifestFromWorld(completeWorld)
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
        if (stage === 'manifest') return providerResponse(manifest)
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
    expect(requestedStages).toEqual(['manifest', 'core', 'civilization', 'characters', 'legends', 'narrative', 'interface', 'interface'])
  })

  it('repairs a living legend through its factual NPC before touching the legend again', async () => {
    const completeWorld = demoWorld({ ...request, provider: { provider: 'demo' as const } })
    const factualNpc = completeWorld.npcs.find((npc) => npc.threatProfile?.tier === 'elite')
    const legend = completeWorld.world.legends.find((entry) => entry.stage === 'legendary' && entry.powerStanding.classification === 'elite')
    expect(factualNpc?.threatProfile).toBeDefined()
    expect(legend).toBeDefined()
    if (!factualNpc?.threatProfile || !legend) return
    legend.lifeStatus = 'living'
    legend.characterName = factualNpc.name
    const sections = splitGeneratedWorldSections(completeWorld)
    const manifest = manifestFromWorld(completeWorld)
    const brokenCharacters = structuredClone(sections.characters)
    const linkedNpc = brokenCharacters.npcs.find((npc) => npc.name === factualNpc.name)
    expect(linkedNpc?.threatProfile).toBeDefined()
    if (!linkedNpc?.threatProfile) return
    linkedNpc.threatProfile.tier = 'capable'

    let characterCalls = 0
    let legendCalls = 0
    const requestedStages: Stage[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as CompletionBody
      const system = body.messages.find((message) => message.role === 'system')?.content ?? ''
      const stage = requestedGenerationStage(system)
      if (stage) {
        requestedStages.push(stage)
        if (stage === 'manifest') return providerResponse(manifest)
        if (stage === 'characters') {
          characterCalls += 1
          return providerResponse(characterCalls === 1 ? brokenCharacters : sections.characters)
        }
        if (stage === 'legends') legendCalls += 1
        return providerResponse(sections[stage])
      }
      if (system.includes('Составь coverageAudit')) return providerResponse(passedQualityReview)
      return providerResponse(originalConcept)
    }))

    await expect(generateWorld(request)).resolves.toEqual(completeWorld)
    expect(characterCalls).toBe(2)
    expect(legendCalls).toBe(1)
    expect(requestedStages.slice(-1)).toEqual(['characters'])
  })

  it('returns the best valid world when only an optional final rewrite gets an empty provider response', async () => {
    const completeWorld = demoWorld({ ...request, provider: { provider: 'demo' as const } })
    const sections = splitGeneratedWorldSections(completeWorld)
    const manifest = manifestFromWorld(completeWorld)
    let interfaceCalls = 0
    const incompleteInterfaceReview = {
      pass: false,
      coverage: 88,
      issues: [{ type: 'completeness', entity: 'Интерфейс мира', detail: 'Нужно улучшить подпись интерфейса.', severity: 'high' }],
      missingCapabilities: ['Более точная подпись интерфейса'],
      coverageAudit: [{ capability: 'Адаптивный интерфейс', importance: 'major', status: 'partial', location: 'world.interfaceModules', detail: 'Нужна более точная подпись.' }],
      constraintAudit: [],
      rewriteInstructions: 'Улучши только interface, не меняя факты мира.',
    }

    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as CompletionBody
      const system = body.messages.find((message) => message.role === 'system')?.content ?? ''
      const stage = requestedGenerationStage(system)
      if (stage) {
        if (stage === 'manifest') return providerResponse(manifest)
        if (stage === 'interface') {
          interfaceCalls += 1
          return interfaceCalls === 1 ? providerResponse(sections.interface) : emptyProviderResponse()
        }
        return providerResponse(sections[stage])
      }
      if (system.includes('Составь coverageAudit')) return providerResponse(incompleteInterfaceReview)
      return providerResponse(originalConcept)
    }))

    await expect(generateWorld(request)).resolves.toEqual(completeWorld)
    expect(interfaceCalls).toBe(2)
  })
})
