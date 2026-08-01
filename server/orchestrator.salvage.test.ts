import { describe, expect, it } from 'vitest'
import { salvageTurnPatch, salvageTurnPlan } from './orchestrator'

describe('partial turn recovery', () => {
  it('keeps valid domains and array entries while quarantining malformed siblings', () => {
    const patch = salvageTurnPatch({
      resourceDeltas: { health: -4 },
      removeConditions: ['Оглушение', { invalid: true }],
      world: { addRules: ['Ночью навигация сложнее.'], impossibleField: true },
      notARealPatchField: true,
    })

    expect(patch.resourceDeltas).toEqual({ health: -4 })
    expect(patch.removeConditions).toEqual(['Оглушение'])
    expect(patch.world?.addRules).toEqual(['Ночью навигация сложнее.'])
    expect(patch).not.toHaveProperty('notARealPatchField')
  })

  it('recovers an authored plan without inventing suggestions or losing a valid consequence', () => {
    const plan = salvageTurnPlan({
      outcome: 'Страж отступает после удара.',
      statePatch: {
        resourceDeltas: { stamina: -3 },
        abilityChanges: [undefined],
      },
    })

    expect(plan).toMatchObject({
      outcome: 'Страж отступает после удара.',
      beats: ['Страж отступает после удара.'],
      suggestions: [],
      abilityExecutions: [],
      statePatch: { resourceDeltas: { stamina: -3 } },
    })
  })
})
