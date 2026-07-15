import { describe, expect, it } from 'vitest'
import type { TurnPatch } from '../shared/types'
import { mergePatches } from './orchestrator'

describe('turn patch merging', () => {
  it('preserves simultaneous world rules, mechanics, interface modules and nested presentation changes', () => {
    const background = {
      world: {
        system: { summary: 'Нейронная нагрузка меняет состояние имплантов.' },
        presentation: { labels: { scene: 'Сейчас' }, categoryLabels: { artifact: 'Киберимплант' } },
        upsertLaws: [{ id: 'law-neural', title: 'Нейронный предел' }],
        upsertMechanics: [{ id: 'mechanic-strain', name: 'Нейронная нагрузка' }],
        upsertInterfaceModules: [{ id: 'module-neural', title: 'Состояние кибернетики' }],
        removeInterfaceModuleIds: ['module-old'],
      },
    } as TurnPatch
    const foreground = {
      world: {
        system: { progression: 'Импланты развиваются через настройку и безопасные испытания.' },
        presentation: { labels: { resources: 'Нагрузка' }, rarityLabels: { legendary: 'Единственный прототип' } },
        upsertLaws: [{ id: 'law-corp', title: 'Корпоративный контроль' }],
        upsertMechanics: [{ id: 'mechanic-scan', name: 'Удалённое сканирование' }],
        upsertInterfaceModules: [{ id: 'module-corp', title: 'Внимание корпорации' }],
        removeLawIds: ['law-obsolete'],
      },
    } as TurnPatch

    const merged = mergePatches(background, foreground)

    expect(merged.world?.upsertLaws?.map((entry) => entry.id)).toEqual(['law-neural', 'law-corp'])
    expect(merged.world?.upsertMechanics?.map((entry) => entry.id)).toEqual(['mechanic-strain', 'mechanic-scan'])
    expect(merged.world?.upsertInterfaceModules?.map((entry) => entry.id)).toEqual(['module-neural', 'module-corp'])
    expect(merged.world?.removeInterfaceModuleIds).toEqual(['module-old'])
    expect(merged.world?.removeLawIds).toEqual(['law-obsolete'])
    expect(merged.world?.system).toMatchObject({
      summary: 'Нейронная нагрузка меняет состояние имплантов.',
      progression: 'Импланты развиваются через настройку и безопасные испытания.',
    })
    expect(merged.world?.presentation).toMatchObject({
      labels: { scene: 'Сейчас', resources: 'Нагрузка' },
      categoryLabels: { artifact: 'Киберимплант' },
      rarityLabels: { legendary: 'Единственный прототип' },
    })
  })
})
