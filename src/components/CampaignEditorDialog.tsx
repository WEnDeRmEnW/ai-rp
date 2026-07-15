import { Bot, Braces, Check, PencilLine, RotateCcw, Save, Sparkles, WandSparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Campaign, OperationProgress } from '../../shared/types'
import { migrateCampaign } from '../lib/storage'
import { Modal } from './Modal'
import { OperationProgressPanel } from './OperationProgressPanel'

type EditorMode = 'basic' | 'ai' | 'json'
type AiEditScope = 'all' | 'world' | 'interface' | 'hero' | 'ability' | 'artifact' | 'npc' | 'faction' | 'mechanic'

interface CampaignEditorDialogProps {
  open: boolean
  campaign: Campaign
  generating: boolean
  progress?: OperationProgress
  onClose: () => void
  onManual: (updater: (campaign: Campaign) => Campaign) => Promise<void>
  onAi: (instruction: string) => Promise<string | undefined>
  onUndoEdit?: () => Promise<void>
  canUndoEdit?: boolean
}

const aiSeeds = [
  'Перепроверь и подробно доработай систему сил мира, не меняя уже установленные факты.',
  'Сделай всех важных персонажей самостоятельнее: уточни цели, знания, планы и готовность к отряду.',
  'Углуби живой мир: проверь фракции, действующие законы и устойчивые механики, добавляя только причинно обоснованные элементы.',
  'Перепроверь мои способности и артефакты: устрани противоречия и дополни недостающую механику.',
  'Адаптируй оформление, подписи интерфейса и системные описания под атмосферу этого мира.',
  'Самостоятельно спроектируй уникальные адаптивные модули интерфейса из реальных законов, сил, ресурсов и конфликтов именно этого мира. Не используй жанровые шаблоны и не дублируй обычные панели.',
]

const scopeLabels: Record<AiEditScope, string> = {
  all: 'Вся кампания', world: 'Мир и его жизнь', interface: 'Правая панель и механики', hero: 'Главный герой', ability: 'Способность героя',
  artifact: 'Предмет или артефакт', npc: 'Персонаж мира', faction: 'Фракция', mechanic: 'Закон или механика',
}

function validateEditableCampaign(value: unknown, protectedId: string): Campaign {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Корень JSON должен быть объектом кампании.')
  const campaign = value as Campaign
  const requiredArrays: Array<[string, unknown]> = [
    ['inventory', campaign.inventory], ['npcs', campaign.npcs], ['messages', campaign.messages], ['lore', campaign.lore], ['memories', campaign.memories],
    ['timeline', campaign.timeline], ['quests', campaign.quests], ['snapshots', campaign.snapshots], ['world.rules', campaign.world?.rules],
    ['world.factions', campaign.world?.factions], ['world.locations', campaign.world?.locations], ['world.mysteries', campaign.world?.mysteries],
    ['player.stats', campaign.player?.stats], ['player.resources', campaign.player?.resources], ['player.abilities', campaign.player?.abilities],
    ['player.conditions', campaign.player?.conditions], ['scene.presentNpcIds', campaign.scene?.presentNpcIds],
  ]
  const missing = requiredArrays.filter(([, entry]) => !Array.isArray(entry)).map(([name]) => name)
  if (missing.length) throw new Error(`Повреждена структура массивов: ${missing.join(', ')}.`)
  if (!campaign.world || !campaign.player || !campaign.scene || !campaign.settings || typeof campaign.player.currency !== 'object' || Array.isArray(campaign.player.currency)) throw new Error('Обязательные объекты мира, героя, сцены, валют и настроек должны существовать.')
  if (!Number.isFinite(campaign.turn) || !Number.isFinite(campaign.scene.tension) || campaign.scene.tension < 0 || campaign.scene.tension > 100) throw new Error('Номер хода и напряжение сцены должны быть корректными числами.')
  const identityGroups: Array<[string, Array<{ id?: string }>]> = [['предметов', campaign.inventory], ['NPC', campaign.npcs], ['сообщений', campaign.messages], ['способностей', campaign.player.abilities]]
  for (const [label, entries] of identityGroups) {
    const ids = entries.map((entry) => entry.id)
    if (ids.some((id) => typeof id !== 'string' || !id.trim()) || new Set(ids).size !== ids.length) throw new Error(`Идентификаторы ${label} должны существовать и быть уникальными.`)
  }
  for (const metric of campaign.world.metrics ?? []) {
    if (!metric.id?.trim() || !metric.key?.trim() || !Number.isFinite(metric.value) || !Number.isFinite(metric.min) || !Number.isFinite(metric.max) || metric.max <= metric.min || metric.value < metric.min || metric.value > metric.max) throw new Error(`Показатель мира «${metric.label || metric.key || 'без названия'}» имеет неверный диапазон или значение.`)
  }
  for (const module of campaign.world.interfaceModules ?? []) {
    if (!module.id?.trim() || !Array.isArray(module.elements)) throw new Error('Каждый модуль интерфейса должен иметь id и массив элементов.')
    const ids = module.elements.map((entry) => entry.id)
    if (new Set(ids).size !== ids.length) throw new Error(`В модуле «${module.title}» повторяются идентификаторы элементов.`)
    const known = new Set(ids)
    if (module.elements.some((entry) => entry.links?.some((link) => link === entry.id || !known.has(link)))) throw new Error(`В модуле «${module.title}» есть ссылка на отсутствующий или тот же самый элемент.`)
  }
  campaign.id = protectedId
  return migrateCampaign(campaign)
}

export function CampaignEditorDialog({ open, campaign, generating, progress, onClose, onManual, onAi, onUndoEdit, canUndoEdit }: CampaignEditorDialogProps) {
  const [mode, setMode] = useState<EditorMode>('basic')
  const [basic, setBasic] = useState(() => structuredClone(campaign))
  const [json, setJson] = useState('')
  const [instruction, setInstruction] = useState('')
  const [message, setMessage] = useState<string>()
  const [error, setError] = useState<string>()
  const [scope, setScope] = useState<AiEditScope>('all')
  const [entityId, setEntityId] = useState('')
  const bodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    setBasic(structuredClone(campaign))
    setJson(JSON.stringify(campaign, null, 2))
    setMessage(undefined)
    setError(undefined)
    setScope('all')
    setEntityId('')
  }, [open, campaign])

  useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() => {
      if (bodyRef.current) bodyRef.current.scrollTop = 0
    })
    return () => cancelAnimationFrame(frame)
  }, [open, mode])

  const saveBasic = async () => {
    setError(undefined)
    await onManual((next) => {
      next.title = basic.title.trim() || next.title
      next.world = { ...next.world, ...basic.world, system: basic.world.system, presentation: basic.world.presentation }
      next.scene = { ...next.scene, ...basic.scene, tension: Math.max(0, Math.min(100, Number(basic.scene.tension) || 0)) }
      next.player = { ...next.player, name: basic.player.name, archetype: basic.player.archetype, appearance: basic.player.appearance, personality: basic.player.personality, backstory: basic.player.backstory, goal: basic.player.goal }
      return next
    })
    setMessage('Основные параметры мира, сцены и героя сохранены.')
  }

  const saveJson = async () => {
    setError(undefined)
    try {
      const parsed = validateEditableCampaign(JSON.parse(json), campaign.id)
      parsed.createdAt = campaign.createdAt
      await onManual(() => parsed)
      setMessage('Полное состояние проверено и сохранено. Идентификатор кампании защищён от случайной замены.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'JSON не удалось прочитать.')
    }
  }

  const runAi = async () => {
    setError(undefined)
    setMessage(undefined)
    if (instruction.trim().length < 3) return setError('Опишите, что именно нужно изменить.')
    const candidates = scope === 'ability' ? campaign.player.abilities.map((entry) => ({ id: entry.id, name: entry.name }))
      : scope === 'artifact' ? campaign.inventory.map((entry) => ({ id: entry.id, name: entry.name }))
        : scope === 'npc' ? campaign.npcs.map((entry) => ({ id: entry.id, name: entry.name }))
          : scope === 'faction' ? campaign.world.factions.map((entry) => ({ id: entry.id ?? entry.name, name: entry.name }))
            : scope === 'mechanic' ? (campaign.world.mechanics ?? []).map((entry) => ({ id: entry.id, name: entry.name })) : []
    const entity = candidates.find((entry) => entry.id === entityId)
    const scopeInstruction = `ОБЛАСТЬ ПРАВКИ: ${scopeLabels[scope]}.${entity ? ` ТОЧНАЯ СУЩНОСТЬ: «${entity.name}», id=${entity.id}.` : ''} Не изменяй данные вне выбранной области, кроме обязательных ссылок для целостности.\n\n${instruction.trim()}`
    const result = await onAi(scopeInstruction)
    if (result) {
      setMessage(result)
      setInstruction('')
    }
  }

  const setWorld = (field: keyof Campaign['world'], value: string) => setBasic((current) => ({ ...current, world: { ...current.world, [field]: value } }))
  const setScene = (field: keyof Campaign['scene'], value: string | number) => setBasic((current) => ({ ...current, scene: { ...current.scene, [field]: value } }))
  const setPlayer = (field: 'name' | 'archetype' | 'appearance' | 'personality' | 'backstory' | 'goal', value: string) => setBasic((current) => ({ ...current, player: { ...current.player, [field]: value } }))
  const setSystem = (field: 'name' | 'summary' | 'progression' | 'conflictResolution' | 'consequences', value: string) => setBasic((current) => ({
    ...current,
    world: { ...current.world, system: { ...(current.world.system ?? { name: '', summary: '', progression: '', conflictResolution: '', consequences: '', equipmentSlots: [] }), [field]: value } },
  }))
  const entityOptions = scope === 'ability' ? campaign.player.abilities.map((entry) => ({ id: entry.id, name: entry.name }))
    : scope === 'artifact' ? campaign.inventory.map((entry) => ({ id: entry.id, name: entry.name }))
      : scope === 'npc' ? campaign.npcs.map((entry) => ({ id: entry.id, name: entry.name }))
        : scope === 'faction' ? campaign.world.factions.map((entry) => ({ id: entry.id ?? entry.name, name: entry.name }))
          : scope === 'mechanic' ? (campaign.world.mechanics ?? []).map((entry) => ({ id: entry.id, name: entry.name })) : []

  return <Modal open={open} onClose={() => !generating && onClose()} title="Мастерская кампании" eyebrow="Полный контроль" width="large">
    <div className="campaign-editor-tabs" role="tablist" aria-label="Режим редактора">
      <button className={mode === 'basic' ? 'is-active' : ''} onClick={() => setMode('basic')}><PencilLine size={15} /> Быстрая правка</button>
      <button className={mode === 'ai' ? 'is-active' : ''} onClick={() => setMode('ai')}><Bot size={15} /> ИИ-корректор</button>
      <button className={mode === 'json' ? 'is-active' : ''} onClick={() => setMode('json')}><Braces size={15} /> Полное состояние</button>
    </div>

    <div className="campaign-editor-body" ref={bodyRef}>
      {mode === 'basic' && <div className="campaign-editor-basic">
        <section><h3>Кампания и мир</h3><div className="field-grid">
          <label className="field"><span>Название кампании</span><input value={basic.title} onChange={(event) => setBasic({ ...basic, title: event.target.value })} /></label>
          <label className="field"><span>Название мира</span><input value={basic.world.name} onChange={(event) => setWorld('name', event.target.value)} /></label>
          <label className="field"><span>Жанр</span><input value={basic.world.genre} onChange={(event) => setWorld('genre', event.target.value)} /></label>
          <label className="field"><span>Тон</span><input value={basic.world.tone} onChange={(event) => setWorld('tone', event.target.value)} /></label>
          <label className="field"><span>Эпоха</span><input value={basic.world.era} onChange={(event) => setWorld('era', event.target.value)} /></label>
          <label className="field"><span>Короткий девиз</span><input value={basic.world.tagline} onChange={(event) => setWorld('tagline', event.target.value)} /></label>
        </div><label className="field"><span>Полное описание мира</span><textarea rows={5} value={basic.world.overview} onChange={(event) => setWorld('overview', event.target.value)} /></label></section>

        <section><h3>Система мира</h3><div className="field-grid">
          <label className="field"><span>Название системы</span><input value={basic.world.system?.name ?? ''} onChange={(event) => setSystem('name', event.target.value)} /></label>
          <label className="field"><span>Краткое устройство</span><textarea rows={3} value={basic.world.system?.summary ?? ''} onChange={(event) => setSystem('summary', event.target.value)} /></label>
          <label className="field"><span>Прогрессия</span><textarea rows={3} value={basic.world.system?.progression ?? ''} onChange={(event) => setSystem('progression', event.target.value)} /></label>
          <label className="field"><span>Разрешение конфликтов</span><textarea rows={3} value={basic.world.system?.conflictResolution ?? ''} onChange={(event) => setSystem('conflictResolution', event.target.value)} /></label>
        </div><label className="field"><span>Последствия и цена ошибок</span><textarea rows={3} value={basic.world.system?.consequences ?? ''} onChange={(event) => setSystem('consequences', event.target.value)} /></label></section>

        <section><h3>Текущая сцена</h3><div className="field-grid">
          <label className="field"><span>Заголовок</span><input value={basic.scene.title} onChange={(event) => setScene('title', event.target.value)} /></label>
          <label className="field"><span>Локация</span><input value={basic.scene.location} onChange={(event) => setScene('location', event.target.value)} /></label>
          <label className="field"><span>Время</span><input value={basic.scene.time} onChange={(event) => setScene('time', event.target.value)} /></label>
          <label className="field"><span>Погода</span><input value={basic.scene.weather} onChange={(event) => setScene('weather', event.target.value)} /></label>
          <label className="field"><span>Напряжение: {basic.scene.tension}%</span><input type="range" min={0} max={100} value={basic.scene.tension} onChange={(event) => setScene('tension', Number(event.target.value))} /></label>
        </div></section>

        <section><h3>Главный герой</h3><div className="field-grid">
          <label className="field"><span>Имя</span><input value={basic.player.name} onChange={(event) => setPlayer('name', event.target.value)} /></label>
          <label className="field"><span>Архетип</span><input value={basic.player.archetype} onChange={(event) => setPlayer('archetype', event.target.value)} /></label>
          <label className="field"><span>Внешность</span><textarea rows={3} value={basic.player.appearance} onChange={(event) => setPlayer('appearance', event.target.value)} /></label>
          <label className="field"><span>Характер</span><textarea rows={3} value={basic.player.personality} onChange={(event) => setPlayer('personality', event.target.value)} /></label>
          <label className="field"><span>Предыстория</span><textarea rows={3} value={basic.player.backstory} onChange={(event) => setPlayer('backstory', event.target.value)} /></label>
          <label className="field"><span>Цель</span><textarea rows={3} value={basic.player.goal} onChange={(event) => setPlayer('goal', event.target.value)} /></label>
        </div></section>
      </div>}

      {mode === 'ai' && <div className="campaign-editor-ai">
        <div className="editor-ai-intro"><WandSparkles size={22} /><div><strong>Корректировка без сюжетного хода</strong><span>ИИ читает фактическое состояние, использует точные идентификаторы и возвращает только проверенные изменения. Время и история не двигаются.</span></div></div>
        <div className="editor-ai-scope"><label className="field"><span>Область правки</span><select value={scope} onChange={(event) => { setScope(event.target.value as AiEditScope); setEntityId('') }}>{Object.entries(scopeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>{entityOptions.length > 0 && <label className="field"><span>Точная сущность</span><select value={entityId} onChange={(event) => setEntityId(event.target.value)}><option value="">Выбрать…</option>{entityOptions.map((entry) => <option value={entry.id} key={entry.id}>{entry.name}</option>)}</select></label>}</div>
        <label className="field field--large"><span>Что изменить</span><textarea autoFocus rows={7} value={instruction} onChange={(event) => setInstruction(event.target.value)} placeholder="Например: Нунобоко должен быть каноничным оружием из мира Naruto. Перепроверь его силы, ограничения и связь со способностью героя, сохрани уже произошедшие сцены…" /></label>
        <div className="editor-ai-seeds">{aiSeeds.map((seed) => <button key={seed} onClick={() => setInstruction(seed)}>{seed}</button>)}</div>
        {generating && <OperationProgressPanel progress={progress} />}
      </div>}

      {mode === 'json' && <div className="campaign-editor-json">
        <div className="editor-json-warning"><Braces size={18} /><span><strong>Доступно абсолютно всё состояние</strong> — от цветов и правил мира до каждой силы, записи памяти и плана персонажа. Идентификатор кампании защищён, остальные изменения сохраняются как введены.</span></div>
        <textarea value={json} onChange={(event) => setJson(event.target.value)} spellCheck={false} aria-label="Полный JSON кампании" />
      </div>}
    </div>

    {error && <div className="inline-error">{error}</div>}
    {message && <div className="editor-success"><Check size={16} /><span>{message}</span>{canUndoEdit && onUndoEdit && <button onClick={() => void onUndoEdit()}><RotateCcw size={14} /> Вернуть состояние до правки</button>}</div>}
    <div className="modal-actions settings-actions">
      <button className="secondary-button" disabled={generating} onClick={onClose}>Закрыть</button>
      {mode === 'basic' && <button className="primary-button" onClick={() => void saveBasic()}><Save size={16} /> Сохранить правки</button>}
      {mode === 'json' && <button className="primary-button" onClick={() => void saveJson()}><Save size={16} /> Проверить и сохранить</button>}
      {mode === 'ai' && <button className="primary-button" disabled={generating || instruction.trim().length < 3} onClick={() => void runAi()}><Sparkles size={16} /> {generating ? `Готовность ${Math.round(progress?.percent ?? 1)}%` : 'Применить через ИИ'}</button>}
    </div>
  </Modal>
}
