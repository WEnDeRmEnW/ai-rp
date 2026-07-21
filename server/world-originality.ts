import type { WorldGenerationRequest } from '../shared/types.js'
import type { GeneratedWorld, WorldGenerationManifest } from './schemas.js'
import type { WorldGenerationStage } from './prompts.js'

const stopWords = new Set([
  'авторский', 'большой', 'будет', 'весь', 'всего', 'герой', 'где', 'для', 'его', 'если', 'есть', 'или', 'как', 'мир', 'мира', 'мире',
  'может', 'новый', 'один', 'очень', 'после', 'при', 'свой', 'система', 'системы', 'также', 'этого', 'этот', 'это', 'the', 'and', 'with', 'world',
])

const clicheFamilies = [
  { label: 'эфир как универсальная субстанция', roots: ['эфир', 'этериум', 'эфириум', 'aether', 'etherium'] },
  { label: 'резонанс как универсальное объяснение', roots: ['резонанс', 'резонатор', 'resonance'] },
  { label: 'разлом реальности как основа всего мира', roots: ['разлом', 'rift'] },
  { label: 'осколки и кристаллы как универсальный носитель силы', roots: ['оскол', 'кристалл', 'crystal', 'shard'] },
  { label: 'эхо как универсальная метафизика', roots: ['эхо', 'echo'] },
  { label: 'пустота как универсальный источник', roots: ['пустот', 'void'] },
  { label: 'безымянная древняя энергия', roots: ['древн энерг', 'древн сил', 'ancient energy', 'primordial energy'] },
  { label: 'избранный и пророчество по умолчанию', roots: ['избранн', 'пророчеств', 'chosen one', 'prophecy'] },
] as const

const normalize = (value: string) => value.toLocaleLowerCase('ru-RU').replace(/ё/gu, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
const includesRoot = (value: string, root: string) => normalize(value).includes(normalize(root))
const requestedText = (request: WorldGenerationRequest) => [request.inspiration, request.genre, request.tone, request.opening].join(' ')

function identityTokens(value: string): Set<string> {
  return new Set(normalize(value).split(/\s+/gu)
    .filter((token) => token.length >= 4 && !stopWords.has(token))
    .map((token) => token.length > 7 ? token.slice(0, 7) : token))
}

function identitySimilarity(left: string, right: string): { score: number; shared: number } {
  const a = identityTokens(left)
  const b = identityTokens(right)
  const shared = [...a].filter((token) => b.has(token)).length
  if (!a.size || !b.size) return { score: 0, shared }
  const union = new Set([...a, ...b]).size
  const jaccard = shared / union
  const containment = shared / Math.min(a.size, b.size)
  return { score: Math.max(jaccard, containment * 0.82), shared }
}

function clicheIssues(request: WorldGenerationRequest, fields: Array<{ label: string; value: string }>): string[] {
  const requested = requestedText(request)
  return clicheFamilies.flatMap((family) => {
    if (family.roots.some((root) => includesRoot(requested, root))) return []
    const hits = fields.filter((field) => family.roots.some((root) => includesRoot(field.value, root)))
    const titleHit = hits.some((field) => field.label === 'название мира')
    return titleHit || hits.length >= 3
      ? [`Повторяется клише «${family.label}» в ${hits.map((field) => field.label).join(', ')}; пользователь его не задавал.`]
      : []
  })
}

function priorWorldIssues(request: WorldGenerationRequest, name: string, identity: string): string[] {
  if (request.canonMode === 'faithful') return []
  return (request.noveltyReferences ?? []).flatMap((reference) => {
    if (normalize(reference.name) === normalize(name)) return [`Название мира дословно повторяет уже существующий мир «${reference.name}».`]
    const referenceIdentity = [reference.name, reference.tagline, reference.premise, ...reference.signatureTerms].join(' ')
    const similarity = identitySimilarity(identity, referenceIdentity)
    return similarity.shared >= 5 && similarity.score >= 0.48
      ? [`Основа мира слишком похожа на уже созданный мир «${reference.name}» (${Math.round(similarity.score * 100)}% сходства ключевых понятий).`]
      : []
  })
}

function abilityMirroringIssues(groupLabels: string[], abilityNames: string[]): string[] {
  if (groupLabels.length < 2 || abilityNames.length === 0) return []
  const abilityTokens = identityTokens(abilityNames.join(' '))
  const mirrored = groupLabels.filter((label) => [...identityTokens(label)].some((token) => abilityTokens.has(token))).length
  return mirrored >= Math.max(2, Math.ceil(groupLabels.length * 0.7))
    ? ['Большинство групп мировой системы напрямую зеркалит стартовые способности героя вместо описания возможностей общества в целом.']
    : []
}

export function worldManifestOriginalityIssues(manifest: WorldGenerationManifest, request: WorldGenerationRequest): string[] {
  const identityFields = [
    { label: 'название мира', value: manifest.world.name },
    { label: 'слоган', value: manifest.world.tagline },
    { label: 'основа мира', value: manifest.world.overview },
    { label: 'система возможностей', value: manifest.world.capabilityGroups.map((entry) => entry.label).join(' ') },
    { label: 'фракции', value: manifest.factions.map((entry) => `${entry.name} ${entry.role}`).join(' ') },
    { label: 'география', value: manifest.places.map((entry) => entry.name).join(' ') },
    { label: 'история', value: [...manifest.narrative.processTitles, ...manifest.narrative.eventTitles, ...manifest.narrative.threadTitles].join(' ') },
  ]
  const identity = identityFields.map((entry) => entry.value).join(' ')
  const heroName = normalize(manifest.player.name)
  const heroCentric = heroName.length >= 3 && normalize(manifest.world.overview).includes(heroName)
    ? ['Паспорт описывает устройство мира через героя; overview должен оставаться истинным, даже если герой никогда не родился.']
    : []
  return [...new Set([
    ...clicheIssues(request, identityFields),
    ...priorWorldIssues(request, manifest.world.name, identity),
    ...heroCentric,
    ...abilityMirroringIssues(manifest.world.capabilityGroups.map((entry) => entry.label), manifest.player.abilityNames),
  ])]
}

export interface GeneratedWorldOriginalityIssue {
  stage: WorldGenerationStage
  message: string
}

export function generatedWorldOriginalityIssues(world: GeneratedWorld, request: WorldGenerationRequest): GeneratedWorldOriginalityIssue[] {
  const identityFields = [
    { label: 'название мира', value: world.world.name },
    { label: 'слоган', value: world.world.tagline },
    { label: 'основа мира', value: world.world.overview },
    { label: 'правила мира', value: world.world.rules.join(' ') },
    { label: 'система возможностей', value: [world.world.capabilitySystem?.title, ...(world.world.capabilitySystem?.groups ?? []).map((entry) => entry.label)].filter(Boolean).join(' ') },
    { label: 'фракции', value: world.world.factions.map((entry) => `${entry.name} ${entry.description}`).join(' ') },
    { label: 'география', value: world.world.places.map((entry) => `${entry.name} ${entry.kind}`).join(' ') },
    { label: 'история', value: [...world.world.processes.map((entry) => entry.title), ...world.worldEvents.map((entry) => entry.title)].join(' ') },
  ]
  const identity = identityFields.map((entry) => entry.value).join(' ')
  const issues: GeneratedWorldOriginalityIssue[] = [
    ...clicheIssues(request, identityFields).map((message) => ({ stage: 'core' as const, message })),
    ...priorWorldIssues(request, world.world.name, identity).map((message) => ({ stage: 'core' as const, message })),
    ...abilityMirroringIssues((world.world.capabilitySystem?.groups ?? []).map((entry) => entry.label), world.player.abilities.map((entry) => entry.name))
      .map((message) => ({ stage: 'core' as const, message })),
  ]
  const heroName = normalize(world.player.name)
  const foundation = [world.world.overview, ...world.world.rules, world.world.system.summary, world.world.system.progression].join(' ')
  if (heroName.length >= 3 && normalize(foundation).includes(heroName)) issues.push({
    stage: 'core',
    message: 'Фундамент мира ссылается на героя и потому не существует независимо от него.',
  })
  if (world.world.mechanics.length >= 4 && world.world.mechanics.every((entry) => entry.category === 'power')) issues.push({
    stage: 'civilization',
    message: 'Все мировые механики описывают только силы; отсутствуют независимые социальные, экономические, политические, транспортные или бытовые причинные системы.',
  })
  if (heroName.length >= 3 && world.world.processes.length >= 3) {
    const heroProcesses = world.world.processes.filter((entry) => normalize(`${entry.title} ${entry.description}`).includes(heroName)).length
    if (heroProcesses === world.world.processes.length) issues.push({
      stage: 'narrative',
      message: 'Все автономные процессы мира вращаются вокруг героя; нужны линии, которые развиваются без его участия.',
    })
  }
  return issues.filter((issue, index) => issues.findIndex((candidate) => candidate.stage === issue.stage && candidate.message === issue.message) === index)
}
