import { assessLegendEcology, assessStrongCharacterEcology } from '../shared/legend-ecology.js'
import { generateWorld } from './orchestrator.js'
import { generatedWorldSchema } from './schemas.js'

const apiKey = process.env.OLLAMA_API_KEY
if (!apiKey) throw new Error('OLLAMA_API_KEY is required for the live world-generation smoke test.')

const world = await generateWorld({
  inspiration: 'Оригинальный обширный киберпанк-мир Солнечной системы после открытия квантового резонанса. Корпорации, станции, колонии, независимые флоты и земные мегаполисы развиваются автономно. Сильные люди должны быть уникальными продуктами собственных профессий, технологий, фракций и истории, а не вариациями одного бойца.',
  genre: 'Научная фантастика, киберпанк, космическая опера',
  tone: 'Живой, серьёзный, кинематографичный, без постоянного пафоса',
  characterName: 'Акира',
  characterConcept: 'Молодой наследник исчезнувшего исследователя резонанса, умеющий чувствовать гравитационные искажения, но ещё не понимающий происхождение этой особенности.',
  opening: 'Акира прибывает на орбитальную станцию по зашифрованному приглашению и пока не знает, кто его отправил.',
  canonMode: 'original',
  contentBoundaries: '',
  provider: {
    provider: 'ollama',
    model: 'deepseek-v4-flash:cloud',
    baseUrl: 'https://ollama.com/v1',
    apiKey,
    temperature: 0.85,
  },
}, (progress) => console.log(JSON.stringify({ progress: progress.percent, stage: progress.stage, detail: progress.detail })))

generatedWorldSchema.parse(world)
const legends = assessLegendEcology(world.world.legends)
const strongCharacters = assessStrongCharacterEcology(world.npcs)
if (!legends.healthy || !strongCharacters.healthy) {
  throw new Error(`Live ecology remained incomplete: legends=${JSON.stringify(legends.deficits)} strong=${JSON.stringify(strongCharacters.deficits)}`)
}

console.log(JSON.stringify({
  ok: true,
  world: world.world.name,
  player: world.player.name,
  npcCount: world.npcs.length,
  legendCount: world.world.legends.length,
  strongCharacters: strongCharacters.counts,
  legendEcology: legends.counts,
}, null, 2))
