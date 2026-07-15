import { createDemoCampaign } from '../src/lib/demo.js'
import { commitTurn } from '../src/lib/engine.js'
import { runTurn } from './orchestrator.js'

const apiKey = process.env.OLLAMA_API_KEY
if (!apiKey) throw new Error('OLLAMA_API_KEY is required for the opt-in live upgrade smoke test.')

const campaign = createDemoCampaign()
campaign.turn = 4
campaign.settings.qualityMode = 'balanced'
campaign.player.name = 'Акира'

const ability = campaign.player.abilities[0]
Object.assign(ability, {
  name: 'Сандевистан: ускорение', source: 'Имплант Сандевистан Militech Falcon', rank: 'Mk I', mastery: 35,
  description: 'Даёт одно короткое окно ускоренного восприятия и движения.', costs: [{ resource: 'energy', amount: 8 }],
  capabilities: ['Один скоростной рывок'], effects: ['Краткое ускорение реакции'], limitations: ['Перегрев после одного импульса'], history: [],
})

const item = campaign.inventory[0]
Object.assign(item, {
  name: 'Сандевистан Militech Falcon', description: 'Серийный боевой нейроускоритель Mk I.', category: 'artifact', effects: ['Один импульс ускорения'], history: [],
  artifact: {
    sentient: false, awakened: true, mastery: 35, attunement: 40, bond: 0,
    classification: 'Боевой нейроимплант Mk I', powerSource: 'Нейроэлектрический контур',
    operatingPrinciple: 'Однофазное ускорение нейросигналов', scale: 'Личный',
    requirements: ['Совместимая нервная система'], passiveEffects: [], combinedEffects: [], failureModes: ['Перегрев после одного импульса'],
    components: [{ id: 'falcon-cooling', name: 'Штатный контур охлаждения', description: 'Отводит тепло после одного импульса.', role: 'Охлаждение', status: 'active', capabilities: ['Охлаждение одного импульса'], required: true }],
    powers: [{
      id: 'falcon-time-dilation', name: 'Окно ускорения', description: 'Даёт одно короткое окно ускорения.', mastery: 35,
      costs: [{ resource: 'energy', amount: 8 }], limitations: ['Только один импульс до перегрева'], capabilities: ['Один скоростной рывок'],
      synergies: [], counters: ['ЭМИ'], examples: ['Мгновенно сократить дистанцию'], category: 'time', scale: 'Личный', activation: 'Нейрокоманда', canonStatus: 'derived',
    }],
    drawbacks: ['Нейронная нагрузка и перегрев'], evolutionPaths: [], secrets: [],
  },
})

campaign.messages.push({
  id: 'scene-upgrade-sandevistan', role: 'assistant', turn: 4, createdAt: new Date().toISOString(),
  content: 'Техник завершает реальную модернизацию Сандевистана: заменяет штатное охлаждение на двухступенчатый контур, перепрошивает контроллер, снижает расход каждого запуска с 8 до 6 единиц энергии и разблокирует второй последовательный импульс. Теперь это версия Mk II: два окна ускорения подряд, затем обязателен полный цикл охлаждения.',
})

const beforeTechnique = JSON.stringify(ability)
const beforeItem = JSON.stringify(item)
const result = await runTurn({
  campaign,
  input: 'Продолжаю сцену после завершённой модернизации и проверяю показания системы.',
  actionType: 'continue',
  provider: {
    provider: 'ollama', model: 'deepseek-v4-flash:cloud', baseUrl: 'https://ollama.com/v1', apiKey, temperature: 0.75,
  },
})
const committed = commitTurn(campaign, 'Продолжаю сцену после завершённой модернизации и проверяю показания системы.', 'continue', result)
const changedAbility = committed.player.abilities.find((entry) => entry.id === ability.id)
const changedItem = committed.inventory.find((entry) => entry.id === item.id)
const abilityPatch = result.statePatch.abilityChanges?.filter((change) => change.abilityId === ability.id) ?? []
const artifactPatch = result.statePatch.artifactChanges?.filter((change) => change.itemId === item.id) ?? []
const substantiveAbility = abilityPatch.some((change) => ['rank', 'description', 'costs', 'capabilities', 'effects', 'limitations', 'addCapabilities', 'addEffects', 'addLimitations'].some((key) => Object.hasOwn(change, key)))
const substantiveArtifact = artifactPatch.some((change) => ['itemDescription', 'itemEffects', 'classification', 'operatingPrinciple', 'passiveEffects', 'powerChanges', 'componentChanges', 'addPowers', 'addComponents'].some((key) => Object.hasOwn(change, key)))

if (!substantiveAbility) throw new Error(`Live upgrade smoke failed: technique received no substantive update: ${JSON.stringify(abilityPatch)}`)
if (!substantiveArtifact) throw new Error(`Live upgrade smoke failed: inventory artifact received no substantive update: ${JSON.stringify(artifactPatch)}`)
if (!changedAbility || JSON.stringify(changedAbility) === beforeTechnique) throw new Error('Live upgrade smoke failed: committed technique stayed unchanged.')
if (!changedItem || JSON.stringify(changedItem) === beforeItem) throw new Error('Live upgrade smoke failed: committed inventory dossier stayed unchanged.')

console.log(JSON.stringify({
  ok: true,
  model: 'deepseek-v4-flash:cloud',
  abilityPatch,
  artifactPatch,
  committedTechnique: changedAbility,
  committedItem: changedItem,
  stateChanges: committed.messages.at(-1)?.stateChanges?.filter((change) => change.kind === 'ability' || change.kind === 'artifact' || change.kind === 'inventory'),
}, null, 2))
