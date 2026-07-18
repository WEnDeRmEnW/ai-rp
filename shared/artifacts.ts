import type {
  ArtifactDiscovery,
  ArtifactDiscoverySection,
  ArtifactFingerprint,
  ArtifactKnowledgeLevel,
  ArtifactRegistryEntry,
  InventoryItem,
} from './types.js'

const allSections: ArtifactDiscoverySection[] = [
  'identity', 'origin', 'principle', 'requirements', 'passives', 'components', 'powers',
  'combined', 'drawbacks', 'failureModes', 'evolution', 'history', 'sentience', 'secrets',
]

const clean = (values: string[] | undefined, limit: number) => [...new Set(
  (values ?? []).map((value) => value.trim()).filter(Boolean),
)].slice(0, limit)

const normalize = (value: string) => value
  .normalize('NFKC')
  .toLocaleLowerCase('ru-RU')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim()

const tokens = (values: Array<string | undefined>) => new Set(
  values.flatMap((value) => normalize(value ?? '').split(' ').filter((token) => token.length >= 3)),
)

const overlap = (left: Set<string>, right: Set<string>) => {
  if (!left.size || !right.size) return 0
  const intersection = [...left].filter((token) => right.has(token)).length
  return intersection / Math.max(1, Math.min(left.size, right.size))
}

export function normalizeArtifactDiscovery(
  discovery: ArtifactDiscovery | undefined,
  item: Pick<InventoryItem, 'artifact'>,
  turn: number,
): ArtifactDiscovery | undefined {
  if (!discovery) return undefined
  const powerIds = new Set(item.artifact?.powers.map((power) => power.id) ?? [])
  const componentIds = new Set(item.artifact?.components.map((component) => component.id) ?? [])
  const normalizeKnowledge = (source: Record<string, ArtifactKnowledgeLevel>, knownIds: Set<string>) => Object.fromEntries(
    Object.entries(source ?? {}).filter(([key]) => knownIds.has(key)).slice(0, 96),
  )
  return {
    awareness: Math.min(100, Math.max(0, Math.round(discovery.awareness))),
    revealedSections: [...new Set(discovery.revealedSections ?? [])]
      .filter((section) => allSections.includes(section))
      .slice(0, allSections.length),
    powerKnowledge: normalizeKnowledge(discovery.powerKnowledge ?? {}, powerIds),
    componentKnowledge: normalizeKnowledge(discovery.componentKnowledge ?? {}, componentIds),
    evidence: (discovery.evidence ?? []).map((entry) => ({
      ...entry,
      reliability: Math.min(100, Math.max(0, Math.round(entry.reliability))),
      learnedTurn: Math.min(turn, Math.max(0, Math.round(entry.learnedTurn))),
    })).slice(-64),
    updatedTurn: turn,
  }
}

export function artifactSectionKnown(item: InventoryItem, section: ArtifactDiscoverySection): boolean {
  const discovery = item.artifact?.discovery
  return !discovery || discovery.revealedSections.includes(section)
}

export function artifactPowerKnowledge(item: InventoryItem, powerId: string): ArtifactKnowledgeLevel {
  const discovery = item.artifact?.discovery
  if (!discovery) return 'understood'
  return discovery.powerKnowledge[powerId] ?? (discovery.revealedSections.includes('powers') ? 'known' : 'hidden')
}

export function artifactComponentKnowledge(item: InventoryItem, componentId: string): ArtifactKnowledgeLevel {
  const discovery = item.artifact?.discovery
  if (!discovery) return 'understood'
  return discovery.componentKnowledge[componentId] ?? (discovery.revealedSections.includes('components') ? 'known' : 'hidden')
}

/** A player-safe view used by ordinary help and UI contexts. Full state remains untouched. */
export function artifactPlayerView(item: InventoryItem): InventoryItem {
  const artifact = item.artifact
  if (!artifact) return item
  const discovery = artifact.discovery
  if (!discovery) return item
  const section = (name: ArtifactDiscoverySection) => artifactSectionKnown(item, name)
  return {
    ...item,
    origin: section('origin') ? item.origin : undefined,
    history: section('history') ? item.history : [],
    artifact: {
      ...artifact,
      personality: section('sentience') ? artifact.personality : undefined,
      desire: section('sentience') ? artifact.desire : undefined,
      taboo: section('sentience') ? artifact.taboo : undefined,
      mood: section('sentience') ? artifact.mood : undefined,
      voice: section('sentience') ? artifact.voice : undefined,
      powerSource: section('origin') ? artifact.powerSource : undefined,
      operatingPrinciple: section('principle') ? artifact.operatingPrinciple : undefined,
      requirements: section('requirements') ? artifact.requirements : [],
      passiveEffects: section('passives') ? artifact.passiveEffects : [],
      combinedEffects: section('combined') ? artifact.combinedEffects : [],
      failureModes: section('failureModes') ? artifact.failureModes : [],
      drawbacks: section('drawbacks') ? artifact.drawbacks : [],
      evolutionPaths: section('evolution') ? artifact.evolutionPaths : [],
      components: artifact.components.filter((component) => {
        const knowledge = artifactComponentKnowledge(item, component.id)
        return knowledge === 'known' || knowledge === 'understood'
      }),
      powers: artifact.powers.filter((power) => {
        const knowledge = artifactPowerKnowledge(item, power.id)
        return knowledge === 'known' || knowledge === 'understood'
      }),
      secrets: section('secrets') ? artifact.secrets : [],
      creativeIdentity: undefined,
      discovery: {
        ...discovery,
        powerKnowledge: Object.fromEntries(
          Object.entries(discovery.powerKnowledge).filter(([, knowledge]) => knowledge !== 'hidden'),
        ),
        componentKnowledge: Object.fromEntries(
          Object.entries(discovery.componentKnowledge).filter(([, knowledge]) => knowledge !== 'hidden'),
        ),
      },
    },
  }
}

export function artifactFingerprint(
  item: Pick<InventoryItem, 'name' | 'description' | 'origin' | 'effects' | 'artifact'>,
): ArtifactFingerprint {
  const artifact = item.artifact
  const identity = artifact?.creativeIdentity
  return {
    coreFantasy: identity?.coreFantasy ?? item.description,
    centralConcept: identity?.centralConcept ?? artifact?.operatingPrinciple ?? item.description,
    physicalForm: identity?.physicalForm ?? item.name,
    originPattern: identity?.originPattern ?? item.origin ?? artifact?.powerSource ?? '',
    interactionModel: identity?.interactionModel
      ?? artifact?.powers.map((power) => power.activation ?? power.trigger ?? '').filter(Boolean).join(' · ')
      ?? '',
    signatureExperience: identity?.signatureExperience
      ?? artifact?.powers.flatMap((power) => power.examples ?? []).join(' · ')
      ?? item.effects.join(' · '),
    conceptualDomains: clean(identity?.conceptualDomains, 12),
    mechanicVerbs: clean(identity?.mechanicVerbs, 16),
    motifs: clean(identity?.motifs, 16),
    powerPatterns: clean(
      artifact?.powers.flatMap((power) => [
        power.name,
        power.description,
        ...(power.capabilities ?? []),
        ...(power.techniques ?? []).map((technique) => technique.name),
      ]) ?? item.effects,
      48,
    ),
    visualSignature: artifact?.presentation
      ? `${artifact.presentation.layout} · ${artifact.presentation.motif} · ${artifact.presentation.symbol} · ${artifact.presentation.surface} · ${artifact.presentation.glow}`
      : item.name,
  }
}

export interface ArtifactSimilarity {
  registryEntry: ArtifactRegistryEntry
  overall: number
  idea: number
  form: number
  mechanics: number
  origin: number
  interaction: number
  experience: number
  visual: number
  allowedReuse: boolean
}

export function compareArtifactToRegistry(item: InventoryItem, registry: ArtifactRegistryEntry[]): ArtifactSimilarity[] {
  const fingerprint = artifactFingerprint(item)
  const identity = item.artifact?.creativeIdentity
  return registry
    .filter((entry) => entry.artifactId !== item.id)
    .map((entry) => {
      const previous = entry.fingerprint
      const idea = overlap(
        tokens([fingerprint.coreFantasy, fingerprint.centralConcept, ...fingerprint.conceptualDomains]),
        tokens([previous.coreFantasy, previous.centralConcept, ...previous.conceptualDomains]),
      )
      const form = overlap(tokens([fingerprint.physicalForm, ...fingerprint.motifs]), tokens([previous.physicalForm, ...previous.motifs]))
      const mechanics = overlap(tokens([...fingerprint.mechanicVerbs, ...fingerprint.powerPatterns]), tokens([...previous.mechanicVerbs, ...previous.powerPatterns]))
      const origin = overlap(tokens([fingerprint.originPattern]), tokens([previous.originPattern]))
      const interaction = overlap(tokens([fingerprint.interactionModel]), tokens([previous.interactionModel]))
      const experience = overlap(tokens([fingerprint.signatureExperience]), tokens([previous.signatureExperience]))
      const visual = overlap(tokens([fingerprint.visualSignature]), tokens([previous.visualSignature]))
      const sharesLineage = Boolean(identity?.lineageId && identity.lineageId === entry.lineageId)
      const explicitlyRelated = Boolean(identity?.relatedArtifactIds?.includes(entry.artifactId))
      const allowedReuse = Boolean(
        identity?.resemblanceKind
        && identity.resemblanceReason?.trim()
        && (sharesLineage || explicitlyRelated || identity.resemblanceKind === 'canon'),
      )
      const overall = idea * .2 + form * .1 + mechanics * .24 + origin * .12
        + interaction * .14 + experience * .12 + visual * .08
      return { registryEntry: entry, overall, idea, form, mechanics, origin, interaction, experience, visual, allowedReuse }
    })
    .sort((left, right) => right.overall - left.overall)
}

const genericMotifs = /(?:кристалл|осколок|эхо|резонанс|безымянн\S* энерг|древн\S* сил|универсальн\S* барьер|таинственн\S* сфер)/iu

export function artifactNoveltyIssues(item: InventoryItem, registry: ArtifactRegistryEntry[]): string[] {
  const identity = item.artifact?.creativeIdentity
  if (!identity) return [`«${item.name}» не имеет creativeIdentity и потому не может быть проверен на уникальность.`]
  const issues: string[] = []
  const closest = compareArtifactToRegistry(item, registry)[0]
  if (closest && !closest.allowedReuse) {
    if (closest.overall >= .66) {
      issues.push(`«${item.name}» слишком похож на «${closest.registryEntry.name}»: общий творческий отпечаток ${Math.round(closest.overall * 100)}%.`)
    }
    if (closest.idea >= .76 && closest.mechanics >= .68) {
      issues.push(`Центральная идея и механика повторяют «${closest.registryEntry.name}», а не только разделяют мотив мира.`)
    }
    if (closest.form >= .8 && closest.interaction >= .72 && closest.visual >= .7) {
      issues.push(`Форма, взаимодействие и визуальная подача повторяют «${closest.registryEntry.name}».`)
    }
  }
  const identityText = [
    identity.coreFantasy,
    identity.centralConcept,
    identity.physicalForm,
    identity.originPattern,
    identity.interactionModel,
    identity.signatureExperience,
    ...identity.motifs,
  ].join(' ')
  if (genericMotifs.test(identityText) && !identity.resemblanceReason?.trim() && identity.differentiation.length < 2) {
    issues.push(`Клишированный мотив «${item.name}» допустим только с причинным основанием мира и минимум двумя конкретными отличиями.`)
  }
  return [...new Set(issues)]
}

export function artifactNoveltyScore(item: InventoryItem, registry: ArtifactRegistryEntry[]): number {
  if (!item.artifact?.creativeIdentity) return 0
  const closest = compareArtifactToRegistry(item, registry)[0]
  if (!closest || closest.allowedReuse) return 100
  const penalty = artifactNoveltyIssues(item, registry).length * 8
  return Math.max(0, Math.round(100 - closest.overall * 100 - penalty))
}

export function updateArtifactRegistry(
  registry: ArtifactRegistryEntry[] | undefined,
  item: InventoryItem,
  status: ArtifactRegistryEntry['status'],
  turn: number,
): ArtifactRegistryEntry[] {
  if (!item.artifact) return registry ?? []
  const current = registry?.find((entry) => entry.artifactId === item.id)
  const next: ArtifactRegistryEntry = {
    artifactId: item.id,
    name: item.name,
    rarity: item.rarity,
    status,
    fingerprint: artifactFingerprint(item),
    lineageId: item.artifact.creativeIdentity?.lineageId,
    canonStatus: item.artifact.canonStatus,
    createdTurn: current?.createdTurn ?? item.discoveredTurn ?? turn,
    lastChangedTurn: turn,
  }
  return [...(registry ?? []).filter((entry) => entry.artifactId !== item.id), next].slice(-5_000)
}
