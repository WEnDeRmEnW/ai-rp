import { describe, expect, it } from 'vitest'
import { artifactPlanQualityIssues, requestedArtifactRarity } from './orchestrator'
import { artifactRewardRepairSchema, turnPlanSchema } from './schemas'

function transcendentPlan(worldImpact = 98) {
  const power = (id: string, name: string) => ({
    id,
    name,
    description: `${name} directly expresses a distinct part of the artifact's causal authority.`,
    mastery: 100,
    costs: [],
    limitations: [`${name} only affects a precisely declared causal relation.`],
    activation: `The bearer names the causal relation governed by ${name}.`,
    capabilities: [`${name} replaces the selected causal rule.`, `${name} sustains that replacement against ordinary forces.`],
    counters: [`An equal external authority can contest ${name}.`],
    examples: [`Use ${name} to make an otherwise impossible consequence follow from an established cause.`],
    techniques: [],
  })
  return turnPlanSchema.parse({
    outcome: 'The workshop grants the requested artifact.',
    beats: ['The completed artifact recognizes its bearer.'],
    suggestions: ['Inspect the authority', 'Ask about its origin'],
    statePatch: {
      inventory: [{
        operation: 'add',
        item: {
          id: 'artifact-causal-crown',
          name: 'Crown of the Unwritten Cause',
          description: 'A workshop-built authority able to replace a fundamental relation between cause and consequence.',
          category: 'artifact',
          quantity: 1,
          rarity: 'transcendent',
          rarityProfile: {
            basis: 'Forged from an authority outside the current causal order.',
            scarcity: 'Only one established instance exists.',
            knownCopies: 1,
            recognition: 'Reality custodians recognize its external authority.',
            marketImpact: 'It cannot enter an ordinary market.',
            acquisitionRisk: 90,
            potency: 95,
            versatility: 85,
            worldImpact,
            provenance: 90,
            limitations: ['The bearer must state the relation being replaced.'],
            assessment: 'It changes a fundamental law instead of exploiting one.',
          },
          equipped: false,
          effects: ['Can replace a fundamental causal relation.', 'Preserves the rewritten relation until explicitly released.'],
          origin: 'The master workshop beyond the causal archive.',
          artifact: {
            sentient: false,
            awakened: true,
            attunement: 100,
            bond: 0,
            classification: 'External causal authority',
            powerSource: 'The unwritten boundary preceding local causality',
            operatingPrinciple: 'Declares and enforces a replacement for one fundamental causal relation.',
            scale: 'cosmic',
            requirements: ['The affected relation must be defined without contradiction.'],
            passiveEffects: ['Perceives active causal bindings.', 'Protects declared bindings from ordinary alteration.'],
            combinedEffects: ['All three authorities can establish a self-consistent replacement law.'],
            failureModes: ['A contradictory declaration does not take effect.'],
            components: [],
            powers: [power('power-declare', 'Declaration'), power('power-sever', 'Severance'), power('power-bind', 'Binding')],
            drawbacks: [],
            evolutionPaths: [],
            secrets: ['Its authority predates the current universe.'],
          },
        },
      }],
    },
  })
}

describe('artifact workshop quality gate', () => {
  it('recognizes a Russian request for the highest artifact tier', () => {
    expect(requestedArtifactRarity('Прошу мастерскую выдать мне трансцендентный артефакт.')).toBe('transcendent')
    expect(requestedArtifactRarity('Создайте самый сильный артефакт максимального уровня.')).toBe('transcendent')
  })

  it('rejects a mythic-scale artifact disguised as transcendent', () => {
    const issues = artifactPlanQualityIssues('Выдайте трансцендентный артефакт.', transcendentPlan(95))

    expect(issues.some((issue) => issue.includes('фактически имеет класс mythic'))).toBe(true)
    expect(issues.some((issue) => issue.includes('worldImpact 95/98'))).toBe(true)
  })

  it('accepts a fully authored artifact that satisfies the real transcendent contract', () => {
    const plan = transcendentPlan()
    expect(artifactPlanQualityIssues('Выдайте трансцендентный артефакт.', plan)).toEqual([])
    const mutation = plan.statePatch.inventory?.[0]
    expect(mutation?.operation).toBe('add')
    if (!mutation || mutation.operation !== 'add') throw new Error('Expected an inventory addition')
    expect(artifactRewardRepairSchema.parse({ item: mutation.item }).item.rarity).toBe('transcendent')
  })
})
