import { createDemoCampaign } from '../src/lib/demo.js'
import { commitTurn } from '../src/lib/engine.js'
import { runTurn } from './orchestrator.js'

const apiKey = process.env.OLLAMA_API_KEY
if (!apiKey) throw new Error('OLLAMA_API_KEY is required for the opt-in live smoke test.')

const campaign = createDemoCampaign()
campaign.title = 'Ashes of Neon'
campaign.turn = 3
campaign.settings.qualityMode = 'balanced'
campaign.player.name = 'Akira'

const ability = campaign.player.abilities[0]
ability.name = 'Sandevistan'
ability.description = 'A combat implant that accelerates perception and movement.'
ability.mastery = 35
ability.costs = [{ resource: 'focus', amount: 2 }]
ability.effects = ['Extreme short burst speed']
ability.limitations = ['Causes neural strain']
ability.requirements = ['Implant operational']
ability.history = []

const item = campaign.inventory[0]
item.name = 'Sandevistan implant'
item.category = 'artifact'
item.history = []
item.artifact = {
  sentient: false,
  awakened: true,
  mastery: 30,
  attunement: 45,
  bond: 10,
  classification: 'combat implant',
  powerSource: 'neural battery',
  operatingPrinciple: 'subjective time acceleration',
  scale: 'personal',
  requirements: ['Installed neural interface'],
  passiveEffects: ['Accelerated threat recognition'],
  combinedEffects: [],
  failureModes: ['Neural overload'],
  components: [],
  powers: [{
    id: 'power-sandevistan-speed',
    name: 'Time acceleration',
    description: 'Accelerates perception and movement for a short burst.',
    mastery: 35,
    costs: [{ resource: 'focus', amount: 2 }],
    limitations: ['Short duration'],
    capabilities: ['Close distance before an opponent reacts'],
    synergies: [],
    counters: ['EMP'],
    examples: ['Disarm an opponent in a blink'],
  }],
  drawbacks: ['Neural strain'],
  evolutionPaths: [],
  secrets: [],
}

const npc = campaign.npcs[0]
npc.name = 'Raven'
npc.role = 'Leader of the Ash Crows'
npc.currentGoal = 'Force Akira to surrender the case'
npc.lastSeen = 'Ruins'
npc.stats = [
  { key: 'strength', label: 'Strength', value: 7, max: 10 },
  { key: 'reflex', label: 'Reflex', value: 6, max: 10 },
  { key: 'intellect', label: 'Intellect', value: 9, max: 10 },
]
npc.resources = [
  { key: 'health', label: 'Health', value: 10, max: 10, kind: 'health' },
  { key: 'morale', label: 'Morale', value: 8, max: 10, kind: 'morale' },
  { key: 'tactical-focus', label: 'Tactical focus', value: 8, max: 10, kind: 'focus' },
]
npc.statusEffects = []
npc.abilities = [{
  id: 'raven-three-move-anticipation',
  name: 'Three-move anticipation',
  description: 'Raven reads stance, attention and terrain to prepare three plausible counterbranches before an exchange begins.',
  rank: 'Master tactician', source: 'Years commanding Ash Crow ambushes', kind: 'reaction', mastery: 82,
  costs: [{ resource: 'tactical-focus', amount: 2 }], effects: ['Prepares a counterposition and an escape route before committing.'],
  limitations: ['Cannot predict information or abilities Raven has never observed.'], requirements: ['Must observe the target and terrain.'],
  progression: 'Improves only when a prediction is tested against real behavior.', evolutionPaths: [], history: [], tags: ['prediction', 'tactics'],
  category: 'perception', scale: 'One immediate confrontation', activation: 'Focused observation of micro-movements and available routes.',
  capabilities: ['Build three likely action branches.', 'Discard a failed branch and switch to a prepared contingency.'],
  synergies: ['Prepared escape routes'], counters: ['Genuinely novel tactics', 'Obscured senses'],
  examples: ['Baits a forward rush and uses the committed momentum to seize an exposed object.'], canonStatus: 'original',
}]
npc.strategy = {
  intelligence: 92, tacticalSkill: 90, strategicSkill: 86, predictionSkill: 91, adaptability: 88, deceptionSkill: 84, riskTolerance: 58,
  planningHorizon: 'Three branches in the current fight and one escape route', decisionStyle: 'Tests reactions with bait, then commits only after preserving an exit.',
  currentPlan: 'Provoke Akira into using speed, sacrifice position, seize the dossier during the overcommitment, then retreat through the ash passage.',
  observedPlayerPatterns: ['Akira closes distance immediately when openly challenged.'], strengths: ['Layered contingencies', 'Rapid adaptation'], blindSpots: ['Has never observed the full Sandevistan limit'],
  contingencies: ['Drop smoke and retreat if the first grab fails.', 'Use subordinates to split Akira attention.'], visibility: 'known', lastUpdatedTurn: 3,
}

const dossier = campaign.inventory[1]
dossier.name = 'Black dossier'
dossier.description = 'A unique dossier containing evidence against the Ash Crows.'
dossier.rarity = 'legendary'
dossier.category = 'quest'
dossier.quantity = 1
dossier.equipped = false

campaign.scene = {
  title: 'Ambush in the ruins',
  location: 'Ruins',
  time: 'Morning',
  weather: 'Ashfall',
  tension: 70,
  presentNpcIds: [npc.id],
}
campaign.world.factions[0] = { name: 'Ash Crows', description: 'Armed scavenger faction.', attitude: 'Hostile caution' }
campaign.factionReputation = [{ factionName: 'Ash Crows', value: 0, label: 'Neutral', notes: [] }]

const input = "Binding story event: this has already happened. Raven used Three-move anticipation, correctly baited Akira's usual forward rush, and spent 2 tactical-focus. Akira still activated Sandevistan, crossed the distance in an instant and broke Raven's finger, but Raven switched to his prepared contingency, tore the Black dossier from Akira and escaped with it. The unique legendary dossier is no longer in Akira's inventory. Track Raven's injury without deleting his other stats, both characters' ability costs and progression, Raven's ability history and updated strategic observations, the full inventory removal regardless of rarity, relationship and Ash Crows reputation, memory, timeline event, and scene tension."
const result = await runTurn({
  campaign,
  input,
  actionType: 'story',
  provider: {
    provider: 'ollama',
    model: 'deepseek-v4-flash:cloud',
    baseUrl: 'https://ollama.com/v1',
    apiKey,
    temperature: 0.75,
  },
})
const committed = commitTurn(campaign, input, 'story', result)
const afterNpc = committed.npcs.find((entry) => entry.id === npc.id)
const afterAbility = committed.player.abilities.find((entry) => entry.id === ability.id)
const afterItem = committed.inventory.find((entry) => entry.id === item.id)
const afterNpcAbility = afterNpc?.abilities?.find((entry) => entry.id === 'raven-three-move-anticipation')
const reputation = committed.factionReputation?.find((entry) => entry.factionName === 'Ash Crows')
const dossierRemoved = !committed.inventory.some((entry) => entry.id === dossier.id)
const npcFocus = afterNpc?.resources?.find((entry) => entry.key === 'tactical-focus')?.value
if (!dossierRemoved) throw new Error('Live smoke failed: the explicitly lost legendary dossier remained in inventory.')
if (npcFocus !== 6) throw new Error(`Live smoke failed: NPC ability cost was not applied exactly (expected 6, received ${npcFocus}).`)
if (!afterNpcAbility?.history?.length) throw new Error('Live smoke failed: NPC ability history was not recorded.')

console.log(JSON.stringify({
  ok: true,
  model: 'deepseek-v4-flash:cloud',
  patchKeys: Object.keys(result.statePatch),
  sceneTension: committed.scene.tension,
  abilityMastery: afterAbility?.mastery,
  abilityHistory: afterAbility?.history?.map((entry) => entry.title),
  artifact: afterItem?.artifact ? {
    mastery: afterItem.artifact.mastery,
    attunement: afterItem.artifact.attunement,
    bond: afterItem.artifact.bond,
  } : null,
  artifactHistory: afterItem?.history?.map((entry) => entry.title),
  npcResources: afterNpc?.resources,
  npcAbility: afterNpcAbility ? { mastery: afterNpcAbility.mastery, history: afterNpcAbility.history?.map((entry) => entry.title) } : null,
  npcStrategy: afterNpc?.strategy,
  dossierRemoved,
  npcStatuses: afterNpc?.statusEffects?.map((effect) => ({ name: effect.name, severity: effect.severity, duration: effect.duration })),
  npcStatsCount: afterNpc?.stats?.length,
  reputation,
  memoriesAdded: committed.memories.length - campaign.memories.length,
  eventsAdded: committed.timeline.length - campaign.timeline.length,
  stateChanges: committed.messages.at(-1)?.stateChanges?.map((change) => ({ kind: change.kind, label: change.label, detail: change.detail })),
  narrative: result.narrative.slice(0, 500),
}, null, 2))
