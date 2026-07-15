import { Bot, Braces, Check, PencilLine, Save, Sparkles, WandSparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Campaign, OperationProgress } from '../../shared/types'
import { Modal } from './Modal'
import { OperationProgressPanel } from './OperationProgressPanel'

type EditorMode = 'basic' | 'ai' | 'json'

interface CampaignEditorDialogProps {
  open: boolean
  campaign: Campaign
  generating: boolean
  progress?: OperationProgress
  onClose: () => void
  onManual: (updater: (campaign: Campaign) => Campaign) => Promise<void>
  onAi: (instruction: string) => Promise<string | undefined>
}

const aiSeeds = [
  'Перепроверь и подробно доработай систему сил мира, не меняя уже установленные факты.',
  'Сделай всех важных персонажей самостоятельнее: уточни цели, знания, планы и готовность к отряду.',
  'Углуби живой мир: проверь фракции, действующие законы и устойчивые механики, добавляя только причинно обоснованные элементы.',
  'Перепроверь мои способности и артефакты: устрани противоречия и дополни недостающую механику.',
  'Адаптируй оформление, подписи интерфейса и системные описания под атмосферу этого мира.',
  'Самостоятельно спроектируй уникальные адаптивные модули интерфейса из реальных законов, сил, ресурсов и конфликтов именно этого мира. Не используй жанровые шаблоны и не дублируй обычные панели.',
]

export function CampaignEditorDialog({ open, campaign, generating, progress, onClose, onManual, onAi }: CampaignEditorDialogProps) {
  const [mode, setMode] = useState<EditorMode>('basic')
  const [basic, setBasic] = useState(() => structuredClone(campaign))
  const [json, setJson] = useState('')
  const [instruction, setInstruction] = useState('')
  const [message, setMessage] = useState<string>()
  const [error, setError] = useState<string>()
  const bodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    setBasic(structuredClone(campaign))
    setJson(JSON.stringify(campaign, null, 2))
    setMessage(undefined)
    setError(undefined)
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
      const parsed = JSON.parse(json) as Campaign
      if (!parsed || typeof parsed !== 'object' || !parsed.world || !parsed.player || !parsed.scene || !parsed.settings || !Array.isArray(parsed.inventory) || !Array.isArray(parsed.npcs) || !Array.isArray(parsed.messages)) {
        throw new Error('Полное состояние должно содержать мир, героя, сцену, настройки, инвентарь, персонажей и сообщения.')
      }
      parsed.id = campaign.id
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
    const result = await onAi(instruction.trim())
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
    {message && <div className="editor-success"><Check size={16} /><span>{message}</span></div>}
    <div className="modal-actions settings-actions">
      <button className="secondary-button" disabled={generating} onClick={onClose}>Закрыть</button>
      {mode === 'basic' && <button className="primary-button" onClick={() => void saveBasic()}><Save size={16} /> Сохранить правки</button>}
      {mode === 'json' && <button className="primary-button" onClick={() => void saveJson()}><Save size={16} /> Проверить и сохранить</button>}
      {mode === 'ai' && <button className="primary-button" disabled={generating || instruction.trim().length < 3} onClick={() => void runAi()}><Sparkles size={16} /> {generating ? `Готовность ${Math.round(progress?.percent ?? 1)}%` : 'Применить через ИИ'}</button>}
    </div>
  </Modal>
}
