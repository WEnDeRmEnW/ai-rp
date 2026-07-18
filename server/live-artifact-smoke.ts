import { artifactPlayerView } from '../shared/artifacts.js'
import { grantedItemAbilities } from '../shared/effective-abilities.js'
import { assessItemRarity } from '../shared/rarity.js'
import type { Campaign, Rarity } from '../shared/types.js'
import { applyPatch } from '../src/lib/engine.js'
import { createDemoCampaign } from '../src/lib/demo.js'
import { artifactPlanQualityIssues, editCampaign } from './orchestrator.js'
import { turnPlanSchema } from './schemas.js'

const apiKey = process.env.OLLAMA_API_KEY
if (!apiKey) throw new Error('OLLAMA_API_KEY is required for the live artifact smoke test.')

const provider = {
  provider: 'ollama' as const,
  model: 'deepseek-v4-flash:cloud',
  baseUrl: 'https://ollama.com/v1',
  apiKey,
  temperature: 0.82,
}

const cases: Array<{ rarity: Rarity; world: string; instruction: string }> = [
  { rarity: 'common', world: 'Город медленных дождей', instruction: 'Добавь герою обычный артефакт городского быта: очень узкий по силе, но с полностью оригинальным взаимодействием, не кристалл и не универсальный барьер.' },
  { rarity: 'uncommon', world: 'Архипелаг поющих приливов', instruction: 'Добавь герою необычный морской артефакт навигации с одним законченным применением и уникальной физической формой.' },
  { rarity: 'rare', world: 'Республика забытых профессий', instruction: 'Добавь герою редкий ремесленный артефакт, чья механика вырастает из исчезнувшей профессии и не похожа на магический жезл.' },
  { rarity: 'exceptional', world: 'Стеклянная степь договоров', instruction: 'Добавь герою исключительный артефакт переговорщика, сильный в своей специализации, но не способный решать войны или менять законы мира.' },
  { rarity: 'epic', world: 'Подземная империя живых маршрутов', instruction: 'Добавь герою эпический артефакт путешествий с несколькими разными практическими применениями и причинными контрмерами.' },
  { rarity: 'legendary', world: 'Королевства механических сезонов', instruction: 'Добавь герою легендарный артефакт, способный менять исход великих сражений и судьбу региона, оставаясь внутри законов мира.' },
  { rarity: 'mythic', world: 'Океан, на котором строят эпохи', instruction: 'Добавь герою мифический артефакт эпохального масштаба, который глубоко использует уже существующие законы мира, но не переписывает фундаментальную реальность.' },
  { rarity: 'transcendent', world: 'Вселенная письменных причин', instruction: 'Добавь герою трансцендентный артефакт — настоящую власть над одним фундаментальным законом. Не ослабляй его ниже мифического и докажи класс конкретными различающимися механиками.' },
]

function prepareCampaign(world: string): Campaign {
  const campaign = createDemoCampaign()
  campaign.title = `Проверка: ${world}`
  campaign.world.name = world
  campaign.world.inspiration = `Оригинальный мир «${world}» для проверки неповторяющихся артефактов.`
  campaign.world.overview = `Законы, культура и материальная среда мира «${world}» должны определять форму и механику каждого предмета.`
  campaign.world.rules = [`Артефакты мира «${world}» действуют только через его собственную материальную и социальную причинность.`]
  campaign.settings.canonMode = 'original'
  campaign.inventory = campaign.inventory.filter((item) => !item.artifact)
  campaign.artifactRegistry = []
  return campaign
}

async function runCase(testCase: typeof cases[number]) {
  const campaign = prepareCampaign(testCase.world)
  const result = await editCampaign({ campaign, instruction: testCase.instruction, provider })
  const additions = result.statePatch.inventory?.filter((mutation) => mutation.operation === 'add' && mutation.item.category === 'artifact') ?? []
  if (additions.length !== 1 || additions[0]?.operation !== 'add') throw new Error(`${testCase.rarity}: expected exactly one artifact addition.`)
  const item = additions[0].item
  const plan = turnPlanSchema.parse({ outcome: result.summary, beats: [result.summary], suggestions: [], statePatch: result.statePatch })
  const issues = artifactPlanQualityIssues(testCase.instruction, plan, campaign.artifactRegistry)
  if (issues.length) throw new Error(`${testCase.rarity}: ${issues.join(' ')}`)
  const assessment = assessItemRarity(item)
  if (assessment.rarity !== item.rarity) throw new Error(`${testCase.rarity}: claimed ${item.rarity}, assessed ${assessment.rarity}.`)
  if (item.rarity !== testCase.rarity) throw new Error(`${testCase.rarity}: editor returned ${item.rarity}.`)

  const applied = applyPatch(campaign, result.statePatch, 1)
  const saved = applied.inventory.find((candidate) => candidate.id === item.id || candidate.name === item.name)
  if (!saved?.artifact?.creativeIdentity || !saved.artifact.presentation || !saved.artifact.discovery) throw new Error(`${testCase.rarity}: full profile was not persisted.`)
  if (!applied.artifactRegistry?.some((entry) => entry.artifactId === saved.id)) throw new Error(`${testCase.rarity}: registry fingerprint was not persisted.`)
  const safe = JSON.stringify(artifactPlayerView(saved))
  const hiddenPowerNames = saved.artifact.powers.filter((power) => saved.artifact?.discovery?.powerKnowledge[power.id] === 'hidden').map((power) => power.name)
  if (hiddenPowerNames.some((name) => safe.includes(name))) throw new Error(`${testCase.rarity}: a hidden power leaked into the player view.`)
  const visiblePowerCount = grantedItemAbilities(applied).filter((entry) => entry.itemId === saved.id && !entry.synthetic).length
  const expectedVisiblePowerCount = saved.artifact.powers.filter((power) => ['known', 'understood'].includes(saved.artifact!.discovery!.powerKnowledge[power.id] ?? 'hidden')).length
  if (visiblePowerCount !== expectedVisiblePowerCount) throw new Error(`${testCase.rarity}: hero ability projection disagrees with discovery.`)

  return { rarity: item.rarity, name: item.name, novelty: saved.artifact.creativeIdentity.centralConcept, powers: saved.artifact.powers.length, visiblePowerCount }
}

const results = []
for (const testCase of cases) {
  results.push(await runCase(testCase))
  console.log(JSON.stringify({ passed: testCase.rarity, artifact: results.at(-1)?.name }))
}

const canonCampaign = prepareCampaign('Marvel, основная Земля с Камнями Бесконечности')
canonCampaign.settings.canonMode = 'faithful'
const canonInstruction = 'Добавь герою каноническую Перчатку Бесконечности Marvel с шестью Камнями. Сохрани точное имя, форму, основные силы, принцип, эпоху и реальные ограничения оригинала; не создавай одноимённый аналог.'
const canonResult = await editCampaign({ campaign: canonCampaign, instruction: canonInstruction, provider })
const canonAddition = canonResult.statePatch.inventory?.find((mutation) => mutation.operation === 'add' && mutation.item.category === 'artifact')
if (!canonAddition || canonAddition.operation !== 'add') throw new Error('canon: Infinity Gauntlet was not added.')
if (canonAddition.item.artifact?.canonStatus !== 'canonical' || canonAddition.item.artifact.creativeIdentity?.resemblanceKind !== 'canon') {
  throw new Error('canon: Infinity Gauntlet was replaced by an original analogue.')
}

console.log(JSON.stringify({ ok: true, model: provider.model, cases: results, canon: canonAddition.item.name }, null, 2))
