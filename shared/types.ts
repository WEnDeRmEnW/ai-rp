export type ID = string

export type ActionType = 'do' | 'say' | 'story' | 'continue'
export type Rarity = 'common' | 'uncommon' | 'rare' | 'exceptional' | 'epic' | 'legendary' | 'mythic' | 'transcendent'

export interface ItemRarityProfile {
  /** Why the item is scarce in this world. Scarcity is only one part of its resulting class. */
  basis: string
  scarcity: string
  knownCopies?: number
  recognition: string
  marketImpact: string
  acquisitionRisk: number
  /** Actual mechanical potency, not fame or scarcity. Optional only for migrated saves. */
  potency?: number
  /** Breadth of useful applications and adaptability. Optional only for migrated saves. */
  versatility?: number
  /** Maximum plausible influence on a scene, region or the laws of the world. */
  worldImpact?: number
  /** Historical, canonical and metaphysical significance of its origin. */
  provenance?: number
  /** Real conditions and weaknesses which reduce practical value. */
  limitations?: string[]
  /** Short world-specific justification of the resulting class. */
  assessment?: string
}
export type ItemCategory = 'weapon' | 'armor' | 'consumable' | 'artifact' | 'quest' | 'material' | 'other'
export type LoreType = 'character' | 'location' | 'faction' | 'object' | 'rule' | 'history' | 'secret'
export type MemoryKind = 'summary' | 'fact' | 'promise' | 'relationship' | 'mystery'

export interface WorldLabels {
  scene: string
  character: string
  inventory: string
  world: string
  quests: string
  abilities: string
  lore: string
  memories: string
  stats: string
  resources: string
  conditions: string
  level: string
  chapter: string
  turn: string
  action: string
  speech: string
  direction: string
  continue: string
}

export interface WorldPresentation {
  accent: string
  accentStrong: string
  secondary: string
  surface: 'paper' | 'arcane' | 'tech' | 'organic' | 'noir' | 'minimal'
  motif: string
  labels: WorldLabels
  categoryLabels: Record<ItemCategory, string>
  rarityLabels: Record<Rarity, string>
}

/** Safe visual grammar which the model composes into a world-specific interface. */
export type AdaptiveInterfacePlacement = 'dashboard' | 'scene' | 'hero' | 'inventory' | 'world'
export type AdaptiveInterfaceVisual = 'meters' | 'nodes' | 'slots' | 'track' | 'ledger' | 'signals' | 'radar' | 'cards'
export type AdaptiveInterfaceIcon = 'spark' | 'eye' | 'shield' | 'network' | 'pulse' | 'compass' | 'crown' | 'rune' | 'gear' | 'flame' | 'star' | 'moon'
export type AdaptiveInterfaceElementKind = 'meter' | 'value' | 'badge' | 'node' | 'slot' | 'step' | 'text'
export type AdaptiveInterfaceElementState = 'normal' | 'positive' | 'warning' | 'danger' | 'locked' | 'inactive'
export type AdaptiveInterfaceBindingDomain =
  | 'custom'
  | 'player.level'
  | 'player.resource'
  | 'player.stat'
  | 'player.currency'
  | 'player.condition-count'
  | 'player.ability-mastery'
  | 'scene.tension'
  | 'conflict.round'
  | 'conflict.participant-readiness'
  | 'conflict.participant-morale'
  | 'world.day'
  | 'world.metric'
  | 'world.location-danger'
  | 'world.process-momentum'
  | 'world.pressure'
  | 'faction.reputation'
  | 'faction.power'
  | 'inventory.category-count'
  | 'inventory.item-charges'
  | 'inventory.item-quantity'
  | 'inventory.item-durability'
  | 'artifact.mastery'
  | 'artifact.attunement'
  | 'artifact.bond'
  | 'artifact.power-mastery'
  | 'quest.active-count'
  | 'quest.objective-progress'
  | 'mystery.progress'
  | 'party.size'
  | 'npc.stat'
  | 'npc.resource'
  | 'npc.initiative-urgency'
  | 'npc.relationship-dimension'
  | 'npc.relationship'

export interface AdaptiveInterfaceBinding {
  domain: AdaptiveInterfaceBindingDomain
  /** Exact key, category, currency or faction name, depending on domain. */
  key?: string
  /** Exact NPC/item id or name for an entity-specific binding. */
  target?: string
}

export interface AdaptiveInterfaceElement {
  id: ID
  label: string
  description?: string
  kind: AdaptiveInterfaceElementKind
  value?: string | number | boolean
  min?: number
  max?: number
  unit?: string
  state: AdaptiveInterfaceElementState
  /** Optional live thresholds. They derive the visual state from a numeric binding without another model call. */
  stateRules?: {
    dangerBelow?: number
    warningBelow?: number
    positiveBelow?: number
    positiveAbove?: number
    warningAbove?: number
    dangerAbove?: number
  }
  binding?: AdaptiveInterfaceBinding
  links?: ID[]
}

export interface AdaptiveInterfaceModule {
  id: ID
  title: string
  subtitle?: string
  description: string
  placement: AdaptiveInterfacePlacement
  visual: AdaptiveInterfaceVisual
  icon: AdaptiveInterfaceIcon
  accent: string
  secondary: string
  priority: number
  visibility: 'known' | 'rumored' | 'hidden'
  /** Why this exact module belongs to this world instead of being generic HUD chrome. */
  reason: string
  /** Facts which require the model to update custom values or restructure the module. */
  updatePolicy: string
  collapsible: boolean
  collapsedByDefault: boolean
  /** Pinned modules are also surfaced in the campaign dashboard. */
  pinned?: boolean
  density?: 'compact' | 'comfortable'
  emphasis?: 'quiet' | 'standard' | 'prominent'
  elements: AdaptiveInterfaceElement[]
  createdTurn: number
  lastChangedTurn: number
}

/** A safe granular update for an existing adaptive module. Full structural redesign still uses upsertInterfaceModules. */
export interface AdaptiveInterfaceModuleChange {
  moduleId: ID
  module?: Partial<Pick<AdaptiveInterfaceModule,
    'title' | 'subtitle' | 'description' | 'placement' | 'visual' | 'icon' | 'accent' | 'secondary' |
    'priority' | 'visibility' | 'reason' | 'updatePolicy' | 'collapsible' | 'collapsedByDefault' | 'pinned' | 'density' | 'emphasis'
  >>
  upsertElements?: AdaptiveInterfaceElement[]
  removeElementIds?: ID[]
}

export type InspectorTabId = 'dashboard' | 'scene' | 'hero' | 'inventory' | 'changes' | 'world'
export type DashboardSectionId = 'scene' | 'stakes' | 'modules' | 'worldPulse' | 'openLoops' | 'mechanics' | 'interfaceHealth'

/** Declarative, model-safe composition of the right panel. It never contains HTML or executable code. */
export interface WorldInterfaceBlueprint {
  title: string
  subtitle: string
  defaultTab: InspectorTabId
  tabs: Array<{ id: InspectorTabId; label: string; visible: boolean }>
  dashboardSections: DashboardSectionId[]
  reason: string
  updatedTurn: number
}

/** A real world-specific counter such as neural load, lunar phase, wanted level or ritual stability. */
export interface WorldMetric {
  id: ID
  key: string
  label: string
  description: string
  value: number
  min: number
  max: number
  unit?: string
  visibility: 'known' | 'rumored' | 'hidden'
  source: string
  updatePolicy: string
  lastChangedTurn: number
}

export interface EquipmentSlotDefinition {
  key: string
  label: string
  accepts: ItemCategory[]
}

export interface WorldSystem {
  name: string
  summary: string
  progression: string
  conflictResolution: string
  consequences: string
  equipmentSlots: EquipmentSlotDefinition[]
}

export interface Stat {
  key: string
  label: string
  value: number
  max?: number
  description?: string
  aliases?: string[]
}

export interface Resource extends Stat {
  color?: string
  kind?: ResourceKind
  criticalBelow?: number
}

export type ResourceKind = 'health' | 'stamina' | 'mana' | 'energy' | 'focus' | 'sanity' | 'morale' | 'hunger' | 'ammo' | 'charges' | 'custom'

export type StatusEffectCategory = 'injury' | 'buff' | 'debuff' | 'disease' | 'poison' | 'curse' | 'blessing' | 'environment' | 'mental' | 'other'

export interface StatusEffect {
  id: ID
  name: string
  description: string
  category: StatusEffectCategory
  severity: number
  source: string
  effects: string[]
  /** Deterministic recurring resource changes applied once at the start of each following turn. */
  resourceDeltasPerTurn?: Record<string, number>
  /** Deterministic action-check modifiers: exact stat key and/or "*" for every check. */
  checkModifiers?: Record<string, number>
  stacks: number
  duration: {
    unit: 'turns' | 'scenes' | 'days' | 'until' | 'indefinite'
    remaining?: number
    expiresTurn?: number
    condition?: string
  }
  appliedTurn: number
  hidden?: boolean
}

export interface AbilityCost {
  resource: string
  amount: number
}

export type PowerCategory = 'offense' | 'defense' | 'control' | 'mobility' | 'utility' | 'perception' | 'creation' | 'summoning' | 'transformation' | 'reality' | 'time' | 'space' | 'mind' | 'soul' | 'energy' | 'matter' | 'other'
export type CanonStatus = 'canonical' | 'derived' | 'original'
export type AbilityKind = 'active' | 'passive' | 'reaction' | 'ritual' | 'transformation' | 'other'

/** A distinct named application contained inside a broader power or school. */
export interface PowerTechnique {
  id: ID
  name: string
  /** One or two concise sentences describing the concrete result. */
  description: string
  kind: AbilityKind
  category: PowerCategory
  mastery: number
  activation: string
  scale: string
  costs: AbilityCost[]
  effects: string[]
  requirements: string[]
  limitations: string[]
  unlocked: boolean
}

export type PowerTechniqueDraft = Omit<PowerTechnique, 'id'> & { id?: ID }

export interface PowerTechniqueChangePatch {
  techniqueId: ID
  name?: string
  description?: string
  kind?: AbilityKind
  category?: PowerCategory
  mastery?: number
  masteryDelta?: number
  activation?: string
  scale?: string
  costs?: AbilityCost[]
  effects?: string[]
  requirements?: string[]
  limitations?: string[]
  unlocked?: boolean
}

export interface PowerSpecification {
  category?: PowerCategory
  scale?: string
  activation?: string
  capabilities?: string[]
  synergies?: string[]
  counters?: string[]
  examples?: string[]
  techniques?: PowerTechnique[]
  canonStatus?: CanonStatus
  canonReference?: string
}

export interface EvolutionPath {
  id: ID
  name: string
  description: string
  requirement: string
  unlocked: boolean
}

export interface ProgressHistoryEntry {
  id: ID
  turn: number
  title: string
  description: string
}

export type ProgressHistoryDraft = Omit<ProgressHistoryEntry, 'id' | 'turn'> & {
  id?: ID
  turn?: number
}

export interface Ability extends PowerSpecification {
  id: ID
  name: string
  description: string
  rank?: string
  source?: string
  cooldown?: string
  kind?: AbilityKind
  mastery?: number
  costs?: AbilityCost[]
  effects?: string[]
  limitations?: string[]
  requirements?: string[]
  progression?: string
  evolutionPaths?: EvolutionPath[]
  history?: ProgressHistoryEntry[]
  tags?: string[]
}

export type AbilityDraft = Omit<Ability, 'id' | 'history' | 'evolutionPaths' | 'techniques'> & {
  id?: ID
  history?: ProgressHistoryDraft[]
  evolutionPaths?: Array<Omit<EvolutionPath, 'id'> & { id?: ID }>
  techniques?: PowerTechniqueDraft[]
}

export interface AbilityChangePatch {
  abilityId: ID
  mastery?: number
  masteryDelta?: number
  kind?: Ability['kind']
  rank?: string
  description?: string
  cooldown?: string
  costs?: AbilityCost[]
  requirements?: string[]
  progression?: string
  tags?: string[]
  category?: PowerCategory
  scale?: string
  activation?: string
  canonStatus?: CanonStatus
  canonReference?: string
  /** Exact replacement fields used when a technique is materially rebuilt or upgraded. */
  capabilities?: string[]
  synergies?: string[]
  counters?: string[]
  examples?: string[]
  effects?: string[]
  limitations?: string[]
  addCapabilities?: string[]
  addSynergies?: string[]
  addCounters?: string[]
  addExamples?: string[]
  addEffects?: string[]
  addLimitations?: string[]
  addTechniques?: PowerTechniqueDraft[]
  techniqueChanges?: PowerTechniqueChangePatch[]
  removeTechniqueIds?: ID[]
  addEvolutionPaths?: Array<Omit<EvolutionPath, 'id'> & { id?: ID }>
  unlockEvolutionPathIds?: ID[]
  history?: { title: string; description: string }
}

export interface ArtifactPower extends PowerSpecification {
  id: ID
  name: string
  description: string
  mastery: number
  costs: AbilityCost[]
  trigger?: string
  limitations: string[]
}

export type ArtifactPowerDraft = Omit<ArtifactPower, 'id' | 'techniques'> & {
  id?: ID
  techniques?: PowerTechniqueDraft[]
}

export interface ArtifactComponent {
  id: ID
  name: string
  description: string
  role: string
  status: 'active' | 'dormant' | 'missing' | 'damaged' | 'destroyed'
  capabilities: string[]
  required: boolean
}

export interface ArtifactPowerChangePatch {
  powerId: ID
  name?: string
  description?: string
  mastery?: number
  masteryDelta?: number
  costs?: AbilityCost[]
  trigger?: string
  category?: PowerCategory
  scale?: string
  activation?: string
  canonStatus?: CanonStatus
  canonReference?: string
  capabilities?: string[]
  synergies?: string[]
  counters?: string[]
  examples?: string[]
  limitations?: string[]
  addCapabilities?: string[]
  addSynergies?: string[]
  addCounters?: string[]
  addExamples?: string[]
  addLimitations?: string[]
  addTechniques?: PowerTechniqueDraft[]
  techniqueChanges?: PowerTechniqueChangePatch[]
  removeTechniqueIds?: ID[]
}

export interface ArtifactComponentChangePatch {
  componentId: ID
  name?: string
  description?: string
  role?: string
  status?: ArtifactComponent['status']
  required?: boolean
  capabilities?: string[]
  addCapabilities?: string[]
}

export interface ArtifactChangePatch {
  itemId: ID
  /** Inventory-facing dossier fields that must stay in sync with the artifact profile. */
  itemDescription?: string
  itemEffects?: string[]
  mastery?: number
  attunement?: number
  bond?: number
  masteryDelta?: number
  bondDelta?: number
  attunementDelta?: number
  awakened?: boolean
  mood?: string
  classification?: string
  powerSource?: string
  operatingPrinciple?: string
  scale?: string
  canonStatus?: CanonStatus
  canonReference?: string
  requirements?: string[]
  passiveEffects?: string[]
  combinedEffects?: string[]
  failureModes?: string[]
  drawbacks?: string[]
  addPassiveEffects?: string[]
  addCombinedEffects?: string[]
  addFailureModes?: string[]
  addPowers?: ArtifactPowerDraft[]
  powerChanges?: ArtifactPowerChangePatch[]
  powerMasteryDeltas?: Record<ID, number>
  addComponents?: Array<Omit<ArtifactComponent, 'id'> & { id?: ID }>
  componentChanges?: ArtifactComponentChangePatch[]
  addDrawbacks?: string[]
  addEvolutionPaths?: Array<Omit<EvolutionPath, 'id'> & { id?: ID }>
  unlockEvolutionPathIds?: ID[]
  history?: { title: string; description: string }
}

export interface ArtifactProfile {
  sentient: boolean
  awakened: boolean
  /** Общая степень освоения предмета. Не заменяет mastery его отдельных сил. */
  mastery?: number
  attunement: number
  bond: number
  personality?: string
  desire?: string
  taboo?: string
  mood?: string
  voice?: string
  classification?: string
  powerSource?: string
  operatingPrinciple?: string
  scale?: string
  canonStatus?: CanonStatus
  canonReference?: string
  requirements: string[]
  passiveEffects: string[]
  combinedEffects: string[]
  failureModes: string[]
  components: ArtifactComponent[]
  powers: ArtifactPower[]
  drawbacks: string[]
  evolutionPaths: EvolutionPath[]
  secrets: string[]
}

export interface KnowledgeFact {
  id: ID
  subject: string
  statement: string
  status: 'known' | 'believed' | 'suspected' | 'false'
  confidence: number
  source: string
  secret: boolean
}

export interface Character {
  id: ID
  name: string
  pronouns?: string
  archetype: string
  level: number
  portrait?: string
  appearance: string
  personality: string
  backstory: string
  goal: string
  stats: Stat[]
  resources: Resource[]
  abilities: Ability[]
  conditions: string[]
  statusEffects: StatusEffect[]
  lifeState: 'active' | 'unconscious' | 'incapacitated' | 'dead' | 'missing'
  currency: Record<string, number>
}

export interface InventoryItem {
  id: ID
  name: string
  description: string
  category: ItemCategory
  quantity: number
  rarity: Rarity
  rarityProfile?: ItemRarityProfile
  equipped: boolean
  equippedSlot?: string
  weight?: number
  durability?: number
  maxDurability?: number
  charges?: number
  maxCharges?: number
  state?: 'intact' | 'damaged' | 'broken' | 'depleted' | 'sealed'
  effects: string[]
  origin?: string
  discoveredTurn: number
  history?: ProgressHistoryEntry[]
  artifact?: ArtifactProfile
}

export interface RelationshipDimensions {
  trust: number
  respect: number
  affection: number
  fear: number
  suspicion: number
  dependence: number
}

export interface NPCInitiative {
  intent: string
  nextMove: string
  trigger: string
  urgency: number
  blockedBy: string[]
  lastAdvancedTurn: number
  visibility: 'known' | 'rumored' | 'hidden'
}

export interface NPCStrategy {
  intelligence: number
  tacticalSkill: number
  strategicSkill: number
  predictionSkill: number
  adaptability: number
  deceptionSkill: number
  riskTolerance: number
  planningHorizon: string
  decisionStyle: string
  observedPlayerPatterns: string[]
  strengths: string[]
  blindSpots: string[]
  currentPlan: string
  contingencies: string[]
  /** How this NPC approaches direct confrontation; omitted for true noncombatants. */
  combatDoctrine?: string
  preferredRange?: string
  teamworkStyle?: string
  moraleProfile?: string
  retreatConditions?: string[]
  ethicalLimits?: string[]
  learnedAdaptations?: string[]
  countermeasures?: TacticalCountermeasure[]
  visibility: 'known' | 'rumored' | 'hidden'
  lastUpdatedTurn: number
}

export interface TacticalCountermeasure {
  name: string
  against: string
  response: string
  requirements: string[]
  tradeoffs: string[]
  status: 'available' | 'prepared' | 'spent' | 'broken'
  visibility: 'known' | 'rumored' | 'hidden'
}

export type ThreatTier = 'minor' | 'capable' | 'dangerous' | 'elite' | 'legendary' | 'mythic'

/** A meaningful change of doctrine during a confrontation, not an arbitrary boss health phase. */
export interface ThreatEngagementPhase {
  name: string
  trigger: string
  doctrine: string
  priorities: string[]
  signatureMoves: string[]
  openings: string[]
  exitConditions: string[]
}

/** A factual dossier for an exceptional opponent. The tier must be supported by actual abilities, resources and feats. */
export interface ThreatProfile {
  tier: ThreatTier
  scope: string
  reputation: string
  /** Where the exceptional capability actually comes from. */
  powerBasis?: string
  /** The distinct way this character imposes their strength in a confrontation. */
  combatIdentity?: string
  /** Names of real abilities or techniques in the NPC profile. */
  signatureAbilities?: string[]
  threatVectors?: string[]
  defensiveLayers?: string[]
  battlefieldControl?: string[]
  informationAdvantages?: string[]
  preparedAssets?: string[]
  engagementPhases?: ThreatEngagementPhase[]
  collateralRisks?: string[]
  whyDangerous: string[]
  knownFeats: string[]
  constraints: string[]
  defeatRequirements: string[]
  escalationTriggers: string[]
  visibility: 'known' | 'rumored' | 'hidden'
}

export interface NPCRecruitment {
  status: 'unavailable' | 'possible' | 'invited' | 'member' | 'left'
  willingness: number
  reason: string
  requirements: string[]
}

/** What the player-character has actually learned about an NPC. Internal NPC state may be much richer. */
export type NPCDossierSection =
  | 'description'
  | 'personality'
  | 'disposition'
  | 'relationship'
  | 'relationshipDimensions'
  | 'goal'
  | 'conditions'
  | 'initiative'
  | 'strategyOverview'
  | 'strategyMetrics'
  | 'strategyPlan'
  | 'strategyDetails'
  | 'countermeasures'
  | 'threatProfile'
  | 'recruitment'
  | 'voice'
  | 'stats'
  | 'resources'
  | 'abilities'

export type NPCFamiliarity = 'recognized' | 'acquainted' | 'familiar' | 'close' | 'expert'

export interface NPCDossierEvidence {
  id: ID
  section: NPCDossierSection
  summary: string
  source: string
  learnedTurn: number
}

export interface NPCDossier {
  familiarity: NPCFamiliarity
  revealedSections: NPCDossierSection[]
  revealedStatKeys: string[]
  revealedResourceKeys: string[]
  revealedAbilityIds: ID[]
  evidence: NPCDossierEvidence[]
  updatedTurn: number
}

export interface NPC {
  id: ID
  name: string
  role: string
  description: string
  personality?: string
  disposition: string
  relationship: number
  status: 'active' | 'absent' | 'missing' | 'dead' | 'unknown'
  currentGoal: string
  lastSeen: string
  notes: string[]
  stats?: Stat[]
  resources?: Resource[]
  statusEffects?: StatusEffect[]
  abilities?: Ability[]
  knowledge?: KnowledgeFact[]
  relationshipDimensions?: RelationshipDimensions
  initiative?: NPCInitiative
  strategy?: NPCStrategy
  threatProfile?: ThreatProfile
  recruitment?: NPCRecruitment
  dossier?: NPCDossier
  voice?: {
    style: string
    patterns: string[]
    avoids: string[]
  }
}

export interface CharacterArc {
  id: ID
  ownerId: ID
  title: string
  theme: string
  currentStage: string
  progress: number
  stages: string[]
  turningPoints: string[]
  status: 'active' | 'completed' | 'broken'
  secret: boolean
  lastAdvancedTurn: number
}

export interface MysteryClue {
  id: ID
  title: string
  detail: string
  location: string
  source: string
  discovered: boolean
  essential: boolean
}

export interface MysteryCase {
  id: ID
  title: string
  premise: string
  truth: string
  culpritId?: ID
  status: 'open' | 'solved' | 'failed'
  clues: MysteryClue[]
  redHerrings: string[]
  revelationRules: string[]
  conclusion?: string
  createdTurn: number
  solvedTurn?: number
}

export interface AntagonistPlanStep {
  id: ID
  title: string
  trigger: string
  consequence: string
  status: 'pending' | 'active' | 'completed' | 'failed' | 'abandoned'
}

export interface AntagonistPlan {
  id: ID
  ownerNpcId: ID
  title: string
  objective: string
  method: string
  currentStep: number
  pressure: number
  resources: string[]
  knowledge: string[]
  steps: AntagonistPlanStep[]
  weaknesses: string[]
  status: 'active' | 'completed' | 'failed' | 'abandoned'
  secret: boolean
  lastAdvancedTurn: number
}

export interface InfluenceAsset {
  id: ID
  kind: 'favor' | 'debt' | 'leverage' | 'contact' | 'access' | 'reputation' | 'oath' | 'other'
  title: string
  description: string
  holderId: ID
  targetId?: ID
  value: number
  status: 'active' | 'spent' | 'repaid' | 'lost'
  source: string
  secret: boolean
  acquiredTurn: number
}

export interface SocialLink {
  id: ID
  fromNpcId: ID
  toNpcId: ID
  kind: string
  label: string
  score: number
  secret: boolean
  notes: string[]
}

export type StoryThreadType = 'promise' | 'debt' | 'witness' | 'rumor'
export type StoryThreadStatus = 'active' | 'fulfilled' | 'broken' | 'resolved'

export interface StoryThread {
  id: ID
  type: StoryThreadType
  title: string
  detail: string
  participantIds: ID[]
  status: StoryThreadStatus
  dueTurn?: number
  secret: boolean
  createdTurn: number
  /** Optional spatial and causal metadata used by the autonomous world simulator. */
  scale?: WorldScale
  scopeIds?: ID[]
  causeIds?: ID[]
  lastChangedTurn?: number
}

export interface ScheduledWorldEvent {
  id: ID
  title: string
  description: string
  dueTurn?: number
  dueDay?: number
  status: 'scheduled' | 'due' | 'resolved' | 'cancelled'
  visibility: 'known' | 'rumored' | 'hidden'
  involvedIds: ID[]
  createdTurn: number
  /** Where the event propagates and which persistent records caused it. */
  scale?: WorldScale
  scopeIds?: ID[]
  causeIds?: ID[]
  consequences?: string[]
  lastChangedTurn?: number
}

export interface FactionReputation {
  factionName: string
  value: number
  label: string
  notes: string[]
}

export interface CanonChunk {
  id: ID
  text: string
  keys: string[]
}

export interface CanonDocument {
  id: ID
  title: string
  chunks: CanonChunk[]
  createdAt: string
}

export interface StoryArchive {
  id: ID
  kind: 'scene' | 'chapter' | 'era'
  title: string
  summary: string
  startTurn: number
  endTurn: number
  tags: string[]
  entityIds: ID[]
  importance: number
  createdAt: string
}

export interface WorldRoute {
  id: ID
  from: string
  to: string
  label: string
  travelTime: string
  distance: number
  danger: number
  discovered: boolean
}

export type WorldLawStatus = 'proposed' | 'active' | 'contested' | 'repealed'
export type WorldVisibility = 'known' | 'rumored' | 'hidden'

/** A mutable social or political law. Metaphysical truths remain in world.rules. */
export interface WorldLaw {
  id: ID
  title: string
  description: string
  scope: string
  authority: string
  status: WorldLawStatus
  visibility: WorldVisibility
  consequences: string[]
  createdTurn: number
  lastChangedTurn: number
}

export type WorldMechanicCategory = 'power' | 'social' | 'economic' | 'travel' | 'crafting' | 'survival' | 'political' | 'other'
export type WorldMechanicStatus = 'emerging' | 'active' | 'obsolete'

/** A persistent rule of play that may emerge from discoveries and world events. */
export interface WorldMechanic {
  id: ID
  name: string
  description: string
  category: WorldMechanicCategory
  trigger: string
  effects: string[]
  source: string
  discovered: boolean
  status: WorldMechanicStatus
  createdTurn: number
  lastChangedTurn: number
}

export interface WorldFaction {
  id?: ID
  name: string
  kind?: 'government' | 'corporation' | 'guild' | 'military' | 'religion' | 'criminal' | 'clan' | 'movement' | 'institution' | 'other'
  visibility?: WorldVisibility
  description: string
  attitude: string
  status?: 'active' | 'dormant' | 'dissolved'
  power?: number
  influence?: string
  territory?: string[]
  resources?: string[]
  goals?: string[]
  currentMove?: string
  publicFace?: string
  origin?: string
  headquarters?: string
  reach?: string
  secrets?: string[]
  lastChangedTurn?: number
}

export type WorldPlaceKind = 'continent' | 'country' | 'region' | 'city' | 'district' | 'settlement' | 'wilderness' | 'realm' | 'planet' | 'system' | 'station' | 'dimension' | 'other'

/** A persistent place in the large-scale atlas. parentId creates a world → country → city hierarchy. */
export interface WorldPlace {
  id: ID
  name: string
  kind: WorldPlaceKind
  parentId?: ID
  description: string
  scale: string
  population?: string
  government?: string
  economy?: string
  culture: string[]
  notableFacts: string[]
  currentSituation: string
  visibility: WorldVisibility
  createdTurn: number
  lastChangedTurn: number
}

export type WorldProcessStatus = 'active' | 'stalled' | 'resolved' | 'failed'
export type WorldProcessDirection = 'rising' | 'stable' | 'declining'
export type WorldScale = 'personal' | 'local' | 'regional' | 'national' | 'continental' | 'global' | 'cosmic'

/** A causal off-screen process that can develop without the player being present. */
export interface WorldProcess {
  id: ID
  title: string
  description: string
  scopeIds: ID[]
  involvedFactionNames: string[]
  drivers: string[]
  obstacles: string[]
  stage: string
  momentum: number
  direction: WorldProcessDirection
  status: WorldProcessStatus
  visibility: WorldVisibility
  nextMilestone: string
  dueTurn?: number
  consequences: string[]
  createdTurn: number
  lastAdvancedTurn: number
  /** Explicit causal links prevent the simulator from treating off-screen changes as isolated flavor. */
  scale?: WorldScale
  causeIds?: ID[]
}

export type LegendStage = 'notable' | 'renowned' | 'legendary' | 'mythic'
export type LegendPowerClass = 'noncombatant' | ThreatTier | 'unknown'
export type LegendLifeStatus = 'living' | 'dead' | 'missing' | 'sealed' | 'dormant' | 'returned' | 'ascended' | 'unknown'
export type LegendTruthStatus = 'confirmed' | 'partly_true' | 'distorted' | 'fabricated' | 'unknown'
export type LegendLegacyKind = 'technique' | 'artifact' | 'bloodline' | 'school' | 'faction' | 'cult' | 'law' | 'place' | 'prophecy' | 'title' | 'other'
export type LegendDiscoverySection =
  | 'identity'
  | 'summary'
  | 'power'
  | 'status'
  | 'origin'
  | 'deeds'
  | 'myths'
  | 'legacies'
  | 'affiliations'
  | 'whereabouts'
  | 'encounter'
  | 'canon'

export interface LegendThreshold {
  stage: LegendStage
  minRenown: number
  requirements: string[]
}

/** How this particular culture recognizes, transmits, distorts and preserves legends. */
export interface Legendarium {
  name: string
  summary: string
  recognitionRules: string[]
  transmissionChannels: string[]
  distortionForces: string[]
  memoryKeepers: string[]
  erasureForces: string[]
  successionRules: string[]
  encounterRules: string[]
  thresholds: LegendThreshold[]
  updatedTurn: number
}

export interface LegendDeed {
  id: ID
  title: string
  summary: string
  era: string
  scale: WorldScale
  scopeIds: ID[]
  factionNames: string[]
  witnesses: string[]
  consequences: string[]
  truth: LegendTruthStatus
  visibility: WorldVisibility
  renownImpact: number
}

export interface LegendMyth {
  id: ID
  title: string
  claim: string
  origin: string
  spread: string
  believers: string[]
  distortion: string
  truth: LegendTruthStatus
  visibility: WorldVisibility
}

export interface LegendLegacy {
  id: ID
  name: string
  kind: LegendLegacyKind
  description: string
  status: string
  holderNpcIds: ID[]
  scopeIds: ID[]
  factionNames: string[]
  accessConditions: string[]
  consequences: string[]
  visibility: WorldVisibility
}

export interface LegendDiscoveryEvidence {
  id: ID
  section: LegendDiscoverySection
  summary: string
  source: string
  learnedTurn: number
  reliability: number
}

export interface LegendDiscovery {
  visibility: WorldVisibility
  awareness: number
  revealedSections: LegendDiscoverySection[]
  evidence: LegendDiscoveryEvidence[]
  updatedTurn: number
}

export interface LegendCurrentState {
  activity: string
  objective: string
  locationId?: ID
  mobility: string
  encounterReadiness: number
  encounterConditions: string[]
  blockers: string[]
  signs: string[]
  lastConfirmedAt: string
  lastUpdatedTurn: number
}

export interface LegendCanonProfile {
  status: 'canonical' | 'derived' | 'original'
  source: string
  continuity: string
  anchorFacts: string[]
  forbiddenContradictions: string[]
  divergenceNotes: string[]
}

/** Publicly supportable assessment of power, kept separate from fame and cultural influence. */
export interface LegendPowerStanding {
  classification: LegendPowerClass
  basis: string
  domains: string[]
  evidence: string[]
  uncertainties: string[]
}

/** A real or culturally believed exceptional person, distinct from the stories told about them. */
export interface LegendaryFigure {
  id: ID
  /** Player or NPC whose live state realizes this figure in the current continuity. */
  characterId?: ID
  name: string
  aliases: string[]
  titles: string[]
  epithet?: string
  role: string
  summary: string
  origin: string
  era: string
  stage: LegendStage
  lifeStatus: LegendLifeStatus
  scope: WorldScale
  truthStatus: LegendTruthStatus
  renown: number
  influence: number
  reputation: string
  powerStanding?: LegendPowerStanding
  knownFeats: string[]
  disputedClaims: string[]
  associatedFactionNames: string[]
  relatedNpcIds: ID[]
  successorNpcIds: ID[]
  deeds: LegendDeed[]
  myths: LegendMyth[]
  legacies: LegendLegacy[]
  currentState: LegendCurrentState
  emergence: {
    momentum: number
    nextMilestone: string
    qualifyingSigns: string[]
    disqualifiers: string[]
    lastEvaluatedTurn: number
  }
  canon: LegendCanonProfile
  discovery: LegendDiscovery
  createdTurn: number
  lastChangedTurn: number
}

export type WorldChronicleKind = 'process' | 'event' | 'thread' | 'quest' | 'pressure' | 'plan'

/**
 * Compact, durable result of a finished world-state record. The active arrays stay small while
 * causeIds preserve long-running causal chains across cities, countries and eras.
 */
export interface WorldChronicleEntry {
  id: ID
  sourceId: ID
  kind: WorldChronicleKind
  title: string
  summary: string
  outcome: string
  scale: WorldScale
  scopeIds: ID[]
  causeIds: ID[]
  entityIds: ID[]
  visibility: WorldVisibility
  startTurn: number
  endTurn: number
  importance: number
  createdAt: string
}

export type WorldPressureSourceKind = 'npc' | 'faction' | 'authority' | 'corporation' | 'deity' | 'cosmic' | 'environment' | 'other'
export type WorldPressureTier = 'trace' | 'local' | 'serious' | 'critical' | 'legendary' | 'mythic'
export type WorldPressureStage = 'watching' | 'investigating' | 'preparing' | 'acting' | 'cooling' | 'resolved'

export interface WorldPressureMeasure {
  id: ID
  name: string
  trigger: string
  method: string
  effects: string[]
  counterplay: string[]
  tradeoffs: string[]
  status: 'considered' | 'preparing' | 'active' | 'spent' | 'foiled'
}

/** A causal response by an organization, entity or force that can develop off-screen. */
export interface WorldPressure {
  id: ID
  sourceKind: WorldPressureSourceKind
  sourceName: string
  sourceNpcId?: ID
  targetIds: ID[]
  cause: string
  objective: string
  tier: WorldPressureTier
  stage: WorldPressureStage
  reach: string
  knowledge: string[]
  signs: string[]
  measures: WorldPressureMeasure[]
  counterplay: string[]
  escalationTrigger: string
  deescalationConditions: string[]
  visibility: WorldVisibility
  createdTurn: number
  lastAdvancedTurn: number
}

export interface Quest {
  id: ID
  title: string
  description: string
  status: 'active' | 'completed' | 'failed' | 'hidden'
  objectives: Array<{ id: ID; text: string; completed: boolean }>
  reward?: string
  giver?: string
  createdTurn?: number
  lastChangedTurn?: number
}

export interface LoreEntry {
  id: ID
  title: string
  type: LoreType
  content: string
  keys: string[]
  enabled: boolean
  alwaysOn: boolean
  secret: boolean
  discovered: boolean
  priority: number
  conditions?: {
    locations?: string[]
    npcIds?: ID[]
    questIds?: ID[]
    minTurn?: number
    maxTurn?: number
    minRelationship?: number
  }
}

export interface MemoryEntry {
  id: ID
  kind: MemoryKind
  content: string
  tags: string[]
  importance: number
  pinned?: boolean
  turn: number
  createdAt: string
}

export interface GameEvent {
  id: ID
  turn: number
  title: string
  description: string
  category: 'story' | 'inventory' | 'character' | 'relationship' | 'quest' | 'world' | 'ability' | 'artifact' | 'influence' | 'mystery'
  createdAt: string
}

export interface SceneState {
  title: string
  location: string
  time: string
  weather: string
  tension: number
  presentNpcIds: ID[]
}

export type StoryBeat = 'respite' | 'setup' | 'exploration' | 'rising' | 'challenge' | 'aftermath' | 'climax'
export type ChallengeTier = 'none' | 'light' | 'standard' | 'hard' | 'severe' | 'legendary' | 'mythic'

export interface StoryPacingState {
  beat: StoryBeat
  intensity: number
  challengeTier: ChallengeTier
  /** A spoiler-safe explanation based only on facts available in the current scene. */
  reason: string
  consecutivePressureTurns: number
  lastRespiteTurn?: number
  lastPeakTurn?: number
  updatedTurn: number
}

export type StoryPacingUpdate = Pick<StoryPacingState, 'beat' | 'intensity' | 'challengeTier' | 'reason'>

export type NarrativeEventMode = 'none' | 'seed' | 'foreshadow' | 'advance' | 'manifest'
export type NarrativeEventStage = 'seeded' | 'foreshadowed' | 'forming' | 'imminent' | 'manifested' | 'aftermath' | 'resolved' | 'cancelled'
export type NarrativeEventMagnitude = 'subtle' | 'notable' | 'major' | 'legendary' | 'mythic'
export type NarrativeEventMiracleKind = 'none' | 'sign' | 'intervention'
export type NarrativeEventCategory =
  | 'encounter'
  | 'consequence'
  | 'opportunity'
  | 'revelation'
  | 'transformation'
  | 'power_shift'
  | 'artifact_shift'
  | 'faction_move'
  | 'social_reversal'
  | 'environmental'
  | 'anomaly'
  | 'disaster'
  | 'legend'
  | 'divine'
  | 'temporal'
  | 'dimensional'
  | 'law_change'
  | 'other'

export type NarrativeEventOrigin =
  | 'player'
  | 'npc'
  | 'new_npc'
  | 'party'
  | 'antagonist'
  | 'legend'
  | 'faction'
  | 'state'
  | 'artifact'
  | 'ability'
  | 'technology'
  | 'environment'
  | 'deity'
  | 'cosmic'
  | 'dimension'
  | 'unknown'
  | 'multiple'

export type NarrativeEventDomain =
  | 'player'
  | 'npc'
  | 'ability'
  | 'artifact'
  | 'inventory'
  | 'relationship'
  | 'party'
  | 'quest'
  | 'conflict'
  | 'scene'
  | 'faction'
  | 'place'
  | 'route'
  | 'process'
  | 'law'
  | 'mechanic'
  | 'legend'
  | 'lore'
  | 'world-event'
  | 'world-pressure'
  | 'time'
  | 'interface'

export type NarrativeEventOperation = 'create' | 'update' | 'remove' | 'transform' | 'reveal'

export interface NarrativeEventRequirement {
  domain: NarrativeEventDomain
  operation: NarrativeEventOperation
  targetId?: ID
  requirement: string
  observable: boolean
  mandatory: boolean
}

export interface NarrativeEventProposal {
  mode: Exclude<NarrativeEventMode, 'none'>
  existingEventId?: ID
  lifecycleStage?: NarrativeEventStage
  concept: string
  category: NarrativeEventCategory
  magnitude: NarrativeEventMagnitude
  miracleKind: NarrativeEventMiracleKind
  originKind: NarrativeEventOrigin
  sourceIds: ID[]
  causeIds: ID[]
  scopeIds: ID[]
  participantIds: ID[]
  affectedDomains: NarrativeEventDomain[]
  knowledgeChannel: string
  trigger: string
  arrivalMethod: string
  observableSigns: string[]
  immediateEffects: NarrativeEventRequirement[]
  persistentEffects: NarrativeEventRequirement[]
  counterplay: string[]
  cancellationConditions: string[]
  canonReasoning: string
  pacingReasoning: string
  noveltyReasoning: string
  minimumDelay: number
}

export type NarrativeEventDecision =
  | { mode: 'none'; reason: string }
  | NarrativeEventProposal

export interface NarrativeEventRecord extends Omit<NarrativeEventProposal, 'mode' | 'existingEventId' | 'lifecycleStage'> {
  id: ID
  stage: NarrativeEventStage
  signature: string
  createdTurn: number
  lastAdvancedTurn: number
  nextEligibleTurn: number
}

export interface NarrativeEventSignature {
  signature: string
  category: NarrativeEventCategory
  magnitude: NarrativeEventMagnitude
  originKind: NarrativeEventOrigin
  affectedDomains: NarrativeEventDomain[]
  turn: number
  outcome: 'manifested' | 'resolved' | 'cancelled'
}

export interface NarrativeEventHistoryEntry extends NarrativeEventSignature {
  id: ID
  concept: string
  sourceIds: ID[]
  causeIds: ID[]
  scopeIds: ID[]
  participantIds: ID[]
  keyConsequences: string[]
  previousEventId?: ID
}

export interface EventDirectorPermissions {
  newCharacters: boolean
  strongEnemies: boolean
  allies: boolean
  legends: boolean
  powerAwakenings: boolean
  powerLoss: boolean
  bodyChanges: boolean
  artifactCreation: boolean
  itemLoss: boolean
  politics: boolean
  wars: boolean
  disasters: boolean
  anomalies: boolean
  realityChanges: boolean
  dimensionalTravel: boolean
  temporalEvents: boolean
  socialEvents: boolean
  miracles: boolean
}

export interface EventDirectorSettings {
  enabled: boolean
  frequency: 'rare' | 'balanced' | 'frequent'
  maxMagnitude: NarrativeEventMagnitude
  lethality: 'fair' | 'ruthless' | 'cinematic'
  miraclePolicy: 'rare' | 'signals-only' | 'off'
  canonPolicy: 'follow-campaign' | 'established-only' | 'free'
  storyImpact: 'fate-changing' | 'side-arcs' | 'scene-only'
  revealMode: 'world-only' | 'indicator' | 'transparent'
  repetitionPolicy: 'evolving-only' | 'rare-repeat' | 'unrestricted'
  permissions: EventDirectorPermissions
}

export interface EventDirectorState {
  surpriseCharge: number
  lastEvaluatedTurn: number
  nextEvaluationTurn?: number
  lastSeedTurn?: number
  lastManifestedTurn?: number
  lastLegendaryTurn?: number
  lastMiracleTurn?: number
  miracleCount: number
  categoryCooldowns: Partial<Record<NarrativeEventCategory, number>>
  recentSignatures: NarrativeEventSignature[]
  history: NarrativeEventHistoryEntry[]
  activeEvents: NarrativeEventRecord[]
}

export interface ConflictParticipantState {
  entityId: ID
  side: 'player' | 'ally' | 'opposition' | 'neutral'
  objective: string
  position: string
  readiness: number
  morale: number
  intent: string
  lastAction: string
  advantages: string[]
  vulnerabilities: string[]
  visibility: 'known' | 'rumored' | 'hidden'
}

export interface ActiveConflict {
  id: ID
  kind: 'combat' | 'chase' | 'social' | 'stealth' | 'other'
  title: string
  round: number
  phase: string
  stakes: string
  terrain: string[]
  hazards: string[]
  tier?: ChallengeTier
  victoryConditions?: string[]
  failureConsequences?: string[]
  escapeRoutes?: string[]
  telegraphs?: string[]
  momentum: 'player' | 'opposition' | 'contested'
  participants: ConflictParticipantState[]
  startedTurn: number
  lastUpdatedTurn: number
}

export type ConflictMutation =
  | { operation: 'start' | 'update'; state: ActiveConflict }
  | { operation: 'resolve'; outcome: string }

export interface StoryMessage {
  id: ID
  role: 'user' | 'assistant'
  content: string
  createdAt: string
  turn: number
  actionType?: ActionType
  suggestions?: string[]
  activeLoreIds?: ID[]
  recalledMemoryIds?: ID[]
  activeDocumentChunkIds?: ID[]
  changeSummary?: string[]
  stateChanges?: StateChange[]
  continuityNotes?: string[]
  check?: ActionCheck
  failed?: boolean
}

export type StateChangeKind = 'health' | 'resource' | 'stat' | 'currency' | 'condition' | 'inventory' | 'ability' | 'artifact' | 'relationship' | 'reputation' | 'quest' | 'character' | 'knowledge' | 'scene' | 'conflict' | 'world' | 'system'

export interface StateChange {
  kind: StateChangeKind
  label: string
  detail: string
  tone: 'positive' | 'negative' | 'neutral' | 'warning'
  entityId?: ID
  before?: number | string
  after?: number | string
  delta?: number
  source?: string
}

export interface ActionCheck {
  statKey: string
  statLabel: string
  roll: number
  modifier: number
  target: number
  total: number
  outcome: 'critical' | 'success' | 'mixed' | 'failure'
  visibility: 'hidden' | 'visible'
  oppositionNpcId?: ID
  oppositionLabel?: string
  oppositionModifier?: number
  oppositionTier?: ThreatTier
  oppositionFactors?: string[]
}

export interface World {
  name: string
  tagline: string
  inspiration: string
  genre: string
  tone: string
  era: string
  overview: string
  rules: string[]
  factions: WorldFaction[]
  locations: Array<{ name: string; description: string; danger: number }>
  mysteries: string[]
  calendar: { day: number; label: string }
  routes?: WorldRoute[]
  places?: WorldPlace[]
  processes?: WorldProcess[]
  legendarium?: Legendarium
  legends?: LegendaryFigure[]
  chronicle?: WorldChronicleEntry[]
  laws?: WorldLaw[]
  mechanics?: WorldMechanic[]
  interfaceModules?: AdaptiveInterfaceModule[]
  interfaceBlueprint?: WorldInterfaceBlueprint
  metrics?: WorldMetric[]
  system?: WorldSystem
  presentation?: WorldPresentation
}

export interface CampaignSettings {
  responseLength: 'compact' | 'balanced' | 'detailed' | 'adaptive'
  playerAgency: 'strict' | 'cinematic'
  difficulty: 'story' | 'balanced' | 'harsh'
  canonMode: 'faithful' | 'flexible' | 'original'
  autoApplyChanges: boolean
  contentBoundaries: string
  authorsNote: string
  resolutionMode?: 'off' | 'hidden' | 'visible'
  contextProfile?: 'standard' | 'long' | 'million'
  qualityMode?: 'balanced' | 'deep'
  scenePace?: 'slow' | 'balanced' | 'fast' | 'montage'
  proseStyle?: 'literary' | 'cinematic' | 'direct'
  dialogueDensity?: 'low' | 'balanced' | 'high'
  npcAutonomy?: 'reactive' | 'balanced' | 'independent'
  worldDynamics?: 'quiet' | 'living' | 'volatile'
  eventDirector?: EventDirectorSettings
}

export interface CampaignSnapshot {
  turn: number
  world: World
  player: Character
  inventory: InventoryItem[]
  npcs: NPC[]
  quests: Quest[]
  lore: LoreEntry[]
  memories: MemoryEntry[]
  scene: SceneState
  pacing?: StoryPacingState
  activeConflict?: ActiveConflict
  socialLinks?: SocialLink[]
  threads?: StoryThread[]
  worldEvents?: ScheduledWorldEvent[]
  factionReputation?: FactionReputation[]
  archives?: StoryArchive[]
  partyMemberIds?: ID[]
  partyRoles?: Record<ID, string>
  characterArcs?: CharacterArc[]
  mysteryCases?: MysteryCase[]
  antagonistPlans?: AntagonistPlan[]
  worldPressures?: WorldPressure[]
  influenceAssets?: InfluenceAsset[]
  eventDirectorState?: EventDirectorState
  messageCount: number
  eventCount: number
}

export interface Campaign {
  id: ID
  title: string
  createdAt: string
  updatedAt: string
  turn: number
  world: World
  player: Character
  inventory: InventoryItem[]
  npcs: NPC[]
  quests: Quest[]
  lore: LoreEntry[]
  memories: MemoryEntry[]
  timeline: GameEvent[]
  messages: StoryMessage[]
  scene: SceneState
  pacing?: StoryPacingState
  activeConflict?: ActiveConflict
  socialLinks?: SocialLink[]
  threads?: StoryThread[]
  worldEvents?: ScheduledWorldEvent[]
  factionReputation?: FactionReputation[]
  documents?: CanonDocument[]
  archives?: StoryArchive[]
  partyMemberIds?: ID[]
  partyRoles?: Record<ID, string>
  characterArcs?: CharacterArc[]
  mysteryCases?: MysteryCase[]
  antagonistPlans?: AntagonistPlan[]
  worldPressures?: WorldPressure[]
  influenceAssets?: InfluenceAsset[]
  eventDirectorState?: EventDirectorState
  settings: CampaignSettings
  snapshots: CampaignSnapshot[]
}

export type InventoryItemPatch = Omit<Partial<InventoryItem>, 'history'> & {
  name?: string
  history?: ProgressHistoryDraft[]
}

export type InventoryMutation =
  | { operation: 'add'; item: InventoryItemPatch }
  | { operation: 'update'; targetId: ID; item: InventoryItemPatch }
  | {
    operation: 'remove'
    targetId: ID
    /** Omit to remove the whole entry, or provide a number for a partial stack. */
    quantity?: number
    reason?: string
  }

export interface QuestMutation {
  operation: 'add' | 'update' | 'complete' | 'fail'
  targetId?: ID
  quest?: Partial<Quest> & { title?: string }
}

export type NPCUpdatePatch = Partial<Omit<NPC,
  'id' | 'stats' | 'resources' | 'statusEffects' | 'abilities' | 'knowledge' | 'relationshipDimensions' | 'initiative' | 'strategy' | 'voice' | 'dossier'
>> & {
  /** Arrays on NPC updates are safe upserts; omitted entries are preserved. */
  stats?: Stat[]
  resources?: Resource[]
  statusEffects?: Array<Omit<StatusEffect, 'id' | 'appliedTurn'> & { id?: ID; appliedTurn?: number }>
  /** Existing entries are preserved; these arrays are safe ability upserts. */
  abilities?: AbilityDraft[]
  upsertAbilities?: AbilityDraft[]
  removeAbilityIds?: ID[]
  abilityChanges?: AbilityChangePatch[]
  knowledge?: Array<Omit<KnowledgeFact, 'id'> & { id?: ID }>
  relationshipDimensions?: Partial<RelationshipDimensions>
  initiative?: Partial<NPCInitiative>
  strategy?: Partial<NPCStrategy>
  dossier?: Partial<NPCDossier>
  voice?: Partial<NonNullable<NPC['voice']>>
  upsertStats?: Stat[]
  removeStatKeys?: string[]
  upsertResources?: Resource[]
  removeResourceKeys?: string[]
  statDeltas?: Record<string, number>
  resourceDeltas?: Record<string, number>
  upsertStatusEffects?: Array<Omit<StatusEffect, 'id' | 'appliedTurn'> & { id?: ID; appliedTurn?: number }>
  removeStatusEffectIds?: ID[]
  removeKnowledgeIds?: ID[]
}

export type NPCMutation =
  | { operation: 'add'; npc: NPC }
  | { operation: 'update'; targetId: ID; npc: NPCUpdatePatch }

export interface WorldPatch {
  name?: string
  tagline?: string
  inspiration?: string
  genre?: string
  tone?: string
  overview?: string
  era?: string
  system?: Partial<WorldSystem>
  presentation?: Partial<Omit<WorldPresentation, 'labels' | 'categoryLabels' | 'rarityLabels'>> & {
    labels?: Partial<WorldLabels>
    categoryLabels?: Partial<WorldPresentation['categoryLabels']>
    rarityLabels?: Partial<WorldPresentation['rarityLabels']>
  }
  addRules?: string[]
  removeRules?: string[]
  upsertFactions?: Array<Partial<WorldFaction> & Pick<WorldFaction, 'name' | 'description' | 'attitude'>>
  removeFactions?: string[]
  upsertLocations?: Array<{ name: string; description: string; danger: number }>
  removeLocations?: string[]
  addMysteries?: string[]
  resolveMysteries?: string[]
  calendarDayDelta?: number
  calendarLabel?: string
  upsertRoutes?: WorldRoute[]
  removeRouteIds?: ID[]
  upsertPlaces?: Array<Omit<WorldPlace, 'createdTurn' | 'lastChangedTurn'> & Partial<Pick<WorldPlace, 'createdTurn' | 'lastChangedTurn'>>>
  removePlaceIds?: ID[]
  upsertProcesses?: Array<Omit<WorldProcess, 'createdTurn' | 'lastAdvancedTurn'> & Partial<Pick<WorldProcess, 'createdTurn' | 'lastAdvancedTurn'>>>
  retireProcessIds?: ID[]
  legendarium?: Omit<Legendarium, 'updatedTurn'> & Partial<Pick<Legendarium, 'updatedTurn'>>
  upsertLegends?: Array<
    Omit<LegendaryFigure, 'createdTurn' | 'lastChangedTurn' | 'currentState' | 'emergence' | 'discovery'>
    & Partial<Pick<LegendaryFigure, 'createdTurn' | 'lastChangedTurn'>>
    & {
      currentState: Omit<LegendCurrentState, 'lastUpdatedTurn'> & Partial<Pick<LegendCurrentState, 'lastUpdatedTurn'>>
      emergence: Omit<LegendaryFigure['emergence'], 'lastEvaluatedTurn'> & Partial<Pick<LegendaryFigure['emergence'], 'lastEvaluatedTurn'>>
      discovery: Omit<LegendDiscovery, 'updatedTurn' | 'evidence'> & {
        evidence: Array<Omit<LegendDiscoveryEvidence, 'learnedTurn'> & Partial<Pick<LegendDiscoveryEvidence, 'learnedTurn'>>>
        updatedTurn?: number
      }
    }
  >
  removeLegendIds?: ID[]
  upsertLaws?: Array<Omit<WorldLaw, 'createdTurn' | 'lastChangedTurn'> & Partial<Pick<WorldLaw, 'createdTurn' | 'lastChangedTurn'>>>
  removeLawIds?: ID[]
  upsertMechanics?: Array<Omit<WorldMechanic, 'createdTurn' | 'lastChangedTurn'> & Partial<Pick<WorldMechanic, 'createdTurn' | 'lastChangedTurn'>>>
  removeMechanicIds?: ID[]
  upsertInterfaceModules?: Array<Omit<AdaptiveInterfaceModule, 'createdTurn' | 'lastChangedTurn'> & Partial<Pick<AdaptiveInterfaceModule, 'createdTurn' | 'lastChangedTurn'>>>
  interfaceModuleChanges?: AdaptiveInterfaceModuleChange[]
  removeInterfaceModuleIds?: ID[]
  interfaceBlueprint?: Omit<WorldInterfaceBlueprint, 'updatedTurn'> & Partial<Pick<WorldInterfaceBlueprint, 'updatedTurn'>>
  upsertMetrics?: Array<Omit<WorldMetric, 'lastChangedTurn'> & Partial<Pick<WorldMetric, 'lastChangedTurn'>>>
  metricDeltas?: Record<string, number>
  removeMetricIds?: ID[]
}

export interface PlayerProfilePatch {
  name?: string
  archetype?: string
  appearance?: string
  personality?: string
  backstory?: string
  goal?: string
  levelDelta?: number
  lifeState?: Character['lifeState']
}

export interface TurnPatch {
  inventory?: InventoryMutation[]
  playerProfile?: PlayerProfilePatch
  upsertStats?: Stat[]
  removeStatKeys?: string[]
  upsertResources?: Resource[]
  removeResourceKeys?: string[]
  statDeltas?: Record<string, number>
  resourceDeltas?: Record<string, number>
  currencyDeltas?: Record<string, number>
  addAbilities?: AbilityDraft[]
  removeAbilityIds?: ID[]
  abilityChanges?: AbilityChangePatch[]
  artifactChanges?: ArtifactChangePatch[]
  addConditions?: string[]
  removeConditions?: string[]
  upsertStatusEffects?: Array<Omit<StatusEffect, 'id' | 'appliedTurn'> & { id?: ID; appliedTurn?: number }>
  removeStatusEffectIds?: ID[]
  relationships?: Array<{
    npcId: ID
    delta: number
    dimensions?: Partial<RelationshipDimensions>
    note?: string
  }>
  npcs?: NPCMutation[]
  quests?: QuestMutation[]
  lore?: Array<Omit<LoreEntry, 'id'> & { id?: ID }>
  scene?: Partial<SceneState>
  pacing?: StoryPacingUpdate
  conflict?: ConflictMutation
  world?: WorldPatch
  socialLinks?: SocialLink[]
  threads?: Array<{ operation: 'add' | 'update' | 'resolve' | 'break'; targetId?: ID; thread?: Partial<StoryThread> & { title?: string } }>
  worldEvents?: Array<{ operation: 'add' | 'update' | 'resolve' | 'cancel'; targetId?: ID; event?: Partial<ScheduledWorldEvent> & { title?: string } }>
  factionReputationDeltas?: Record<string, number>
  upsertFactionReputation?: Array<{
    factionName: string
    value: number
    label?: string
    notes?: string[]
  }>
  party?: { addNpcIds?: ID[]; removeNpcIds?: ID[]; roles?: Record<ID, string> }
  upsertCharacterArcs?: CharacterArc[]
  upsertMysteryCases?: MysteryCase[]
  upsertAntagonistPlans?: AntagonistPlan[]
  upsertWorldPressures?: WorldPressure[]
  upsertInfluenceAssets?: InfluenceAsset[]
  removeInfluenceAssetIds?: ID[]
  cleanup?: {
    threads?: Array<{ targetId: ID; reason: string }>
    worldEvents?: Array<{ targetId: ID; reason: string }>
    quests?: Array<{ targetId: ID; reason: string }>
    antagonistPlans?: Array<{ targetId: ID; reason: string }>
    worldPressures?: Array<{ targetId: ID; reason: string }>
    memories?: Array<{ targetId: ID; reason: string }>
  }
  memories?: Array<Omit<MemoryEntry, 'id' | 'turn' | 'createdAt'>>
  events?: Array<Omit<GameEvent, 'id' | 'turn' | 'createdAt'>>
  /** Internal deterministic state. Model-facing schemas intentionally do not expose this key. */
  eventDirectorState?: EventDirectorState
}

export interface TurnResponse {
  narrative: string
  suggestions: string[]
  statePatch: TurnPatch
  stateChanges?: StateChange[]
  activeLoreIds: ID[]
  recalledMemoryIds: ID[]
  activeDocumentChunkIds?: ID[]
  continuityNotes?: string[]
  check?: ActionCheck
  archives?: Array<Omit<StoryArchive, 'id' | 'createdAt'>>
}

export interface OperationProgress {
  percent: number
  stage: string
  detail: string
  completedSteps?: number
  totalSteps?: number
}

export interface CampaignEditRequest {
  campaign: Campaign
  instruction: string
  provider: ProviderConfig
}

export interface CampaignEditResponse {
  summary: string
  statePatch: TurnPatch
  campaignPatch?: { title?: string }
  settingsPatch?: Omit<Partial<CampaignSettings>, 'eventDirector'> & {
    eventDirector?: Omit<Partial<EventDirectorSettings>, 'permissions'> & {
      permissions?: Partial<EventDirectorPermissions>
    }
  }
}

export type WorldQuestionScope = 'known' | 'complete'

export interface WorldQuestionMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface WorldQuestionRequest {
  campaign: Campaign
  question: string
  scope: WorldQuestionScope
  history: WorldQuestionMessage[]
  provider: ProviderConfig
}

export interface WorldQuestionResponse {
  answer: string
  scope: WorldQuestionScope
  generatedAt: string
}

export type ProviderKind = 'demo' | 'openai' | 'openrouter' | 'ollama' | 'custom'

export interface ProviderConfig {
  provider: ProviderKind
  model: string
  baseUrl: string
  apiKey?: string
  temperature: number
}

export type PersistentProviderConfig = Omit<ProviderConfig, 'apiKey'>

export interface WorldGenerationRequest {
  inspiration: string
  genre: string
  tone: string
  characterName: string
  characterConcept: string
  opening: string
  canonMode: CampaignSettings['canonMode']
  contentBoundaries: string
  provider: ProviderConfig
}

export interface TurnRequest {
  campaign: Campaign
  input: string
  actionType: ActionType
  provider: ProviderConfig
}
