import { ArrowLeft, ArrowRight, BrainCircuit, Check, Compass, Dices, LoaderCircle, RefreshCw, ShieldCheck, Sparkles, Telescope, UserRound, WandSparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { CampaignSettings, OperationProgress, WorldGenerationRequest, WorldIdea, WorldIdeaRequest } from '../../shared/types'
import { Modal } from './Modal'
import { OperationProgressPanel } from './OperationProgressPanel'

interface NewWorldDialogProps {
  open: boolean
  generating: boolean
  ideating: boolean
  progress?: OperationProgress
  ideaProgress?: OperationProgress
  providerName: string
  isDemo: boolean
  onClose: () => void
  onCreate: (request: Omit<WorldGenerationRequest, 'provider'>) => Promise<unknown>
  onInvent: (request: Omit<WorldIdeaRequest, 'provider'>) => Promise<WorldIdea>
  onCancelIdea: () => void
}

const inspirationSeeds = [
  'Мир шиноби с великими кланами, скрытыми деревнями и собственной системой техник',
  'Готический город, где сны продают на ночном рынке',
  'Космический экспресс на границе погибшей империи',
  'Школа магии, построенная внутри спящего дракона',
]

function architectBrief(idea: WorldIdea) {
  const sections = [
    `Название мира: ${idea.title}`,
    `Ключевая формула: ${idea.tagline}`,
    `Центральная идея:\n${idea.corePremise}`,
    `Подробное устройство:\n${idea.inspiration}`,
    `Опоры мира:\n${idea.pillars.map((pillar) => `- ${pillar.title}: ${pillar.description} Последствия: ${pillar.worldImpact}`).join('\n')}`,
    `Характерная механика «${idea.signatureMechanic.name}»:\n${idea.signatureMechanic.principle}\nВзаимодействие героя: ${idea.signatureMechanic.playerUse}\nПоследствия: ${idea.signatureMechanic.worldConsequences.join('; ')}`,
    `Жизнь без героя:\n${idea.livingWorld.everydayLife}\nАвтономные силы: ${idea.livingWorld.autonomousForces.join('; ')}\nДальние горизонты: ${idea.livingWorld.distantHorizons.join('; ')}`,
    `Центральные напряжения:\n${idea.centralTensions.map((entry) => `- ${entry}`).join('\n')}`,
    `Уникальные обещания кампании:\n${idea.uniquePromises.map((entry) => `- ${entry}`).join('\n')}`,
    `Не скатываться в клише:\n${idea.avoidedCliches.map((entry) => `- ${entry}`).join('\n')}`,
  ]
  return sections.join('\n\n').slice(0, 12_000)
}

export function NewWorldDialog({ open, generating, ideating, progress, ideaProgress, providerName, isDemo, onClose, onCreate, onInvent, onCancelIdea }: NewWorldDialogProps) {
  const [step, setStep] = useState(1)
  const [inspiration, setInspiration] = useState('')
  const [genre, setGenre] = useState('Приключение и драма')
  const [tone, setTone] = useState('Живой, кинематографичный, с серьёзными последствиями')
  const [characterName, setCharacterName] = useState('Акира')
  const [characterConcept, setCharacterConcept] = useState('Молодой странник со скрытым талантом, который хочет заслужить своё место в мире')
  const [opening, setOpening] = useState('Начать с события, которое сразу требует решения, но не навязывает действие герою')
  const [canonMode, setCanonMode] = useState<CampaignSettings['canonMode']>('flexible')
  const [contentBoundaries, setContentBoundaries] = useState('')
  const [submitError, setSubmitError] = useState<string>()
  const [ideaError, setIdeaError] = useState<string>()
  const [idea, setIdea] = useState<WorldIdea>()
  const [previousIdeas, setPreviousIdeas] = useState<string[]>([])

  useEffect(() => {
    if (open) {
      setSubmitError(undefined)
      setIdeaError(undefined)
    }
  }, [open])

  const canContinue = useMemo(() => step === 1 ? inspiration.trim().length > 0 : step === 2 ? characterName.trim().length > 0 && characterConcept.trim().length > 0 : true, [step, inspiration, characterName, characterConcept])

  const submit = async () => {
    setSubmitError(undefined)
    try {
      await onCreate({ inspiration, genre, tone, characterName, characterConcept, opening, canonMode, contentBoundaries })
      onClose()
      setStep(1)
    } catch (cause) {
      setSubmitError(cause instanceof Error ? cause.message : 'Не удалось создать мир.')
    }
  }

  const invent = async () => {
    setIdeaError(undefined)
    try {
      const generated = await onInvent({
        hint: inspiration.trim(),
        contentBoundaries,
        previousIdeas: previousIdeas.slice(-6),
        creativeSeed: crypto.randomUUID(),
      })
      setIdea(generated)
      setPreviousIdeas((current) => [...current, `${generated.title}: ${generated.corePremise}`].slice(-8))
      setInspiration(architectBrief(generated))
      setGenre(generated.genre)
      setTone(generated.tone)
      setCharacterName(generated.heroName)
      setCharacterConcept(generated.heroConcept)
      setOpening(generated.opening)
      setCanonMode('original')
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
        setIdeaError(cause instanceof Error ? cause.message : 'ИИ не смог придумать концепцию мира.')
      }
    }
  }

  const close = () => {
    if (generating) return
    if (ideating) onCancelIdea()
    onClose()
  }

  return <Modal open={open} onClose={close} title="Кузница мира" eyebrow="Новая история" width="large">
    <div className="wizard-progress" aria-label={`Шаг ${step} из 3`}>
      {[1, 2, 3].map((value) => <div className={`${value === step ? 'is-active' : ''} ${value < step ? 'is-done' : ''}`} key={value}><span>{value < step ? <Check size={12} /> : value}</span><i /></div>)}
    </div>

    <div className="wizard-content">
      {step === 1 && <div className="wizard-step">
        <div className="wizard-icon"><Compass size={22} /></div>
        <h3>Какой мир должен ожить?</h3>
        <p className="step-description">Одной фразы достаточно. Можно назвать известную вселенную, смешать жанры или описать собственную.</p>
        <section className={`world-inventor ${idea ? 'has-result' : ''}`}>
          <div className="world-inventor__icon"><BrainCircuit size={20} /><i /></div>
          <div className="world-inventor__copy">
            <small>Полная творческая свобода</small>
            <strong>Пусть ИИ придумает мир за вас</strong>
            <p>DeepSeek создаст оригинальную основу, живые силы мира, необычную механику, героя и стартовую сцену. Отдельный редактор проверит результат на клише и заимствования.</p>
          </div>
          <button className="world-inventor__button" disabled={ideating || generating} onClick={() => void invent()}>
            {ideating ? <LoaderCircle className="spin" size={16} /> : idea ? <RefreshCw size={16} /> : <WandSparkles size={16} />}
            {ideating ? 'Изобретаем…' : idea ? 'Придумать другой' : 'ИИ, удиви меня'}
          </button>
          {isDemo && <span className="world-inventor__notice">Для этой функции подключите DeepSeek V4 Flash в настройках.</span>}
          {ideating && <OperationProgressPanel progress={ideaProgress} compact />}
          {ideaError && <div className="inline-error">{ideaError}</div>}
        </section>
        {idea && <article className="world-idea-preview">
          <header>
            <span><Telescope size={17} /></span>
            <div><small>ИИ заполнил все поля — их можно изменить вручную</small><strong>{idea.title}</strong></div>
            <b>{idea.originalityScore}%</b>
          </header>
          <p>{idea.tagline}</p>
          <div className="world-idea-premise">{idea.corePremise}</div>
          <div className="world-idea-pillars">
            {idea.pillars.slice(0, 4).map((pillar) => <span key={pillar.title}><strong>{pillar.title}</strong><small>{pillar.worldImpact}</small></span>)}
          </div>
          <footer><Sparkles size={13} /><span><b>{idea.signatureMechanic.name}</b> · {idea.uniquePromises[0]}</span></footer>
        </article>}
        <label className="field field--large"><span>Замысел мира</span><textarea autoFocus value={inspiration} onChange={(event) => setInspiration(event.target.value)} rows={5} maxLength={12_000} placeholder="Например: хочу начать карьеру шиноби за несколько лет до великого конфликта. Канон важен, но мой герой может изменить историю…" /></label>
        <div className="seed-list">
          {inspirationSeeds.map((seed) => <button key={seed} onClick={() => setInspiration(seed)}>{seed}</button>)}
        </div>
        <div className="field-grid">
          <label className="field"><span>Жанр</span><input value={genre} onChange={(event) => setGenre(event.target.value)} maxLength={200} /></label>
          <label className="field"><span>Тон</span><input value={tone} onChange={(event) => setTone(event.target.value)} maxLength={200} /></label>
        </div>
      </div>}

      {step === 2 && <div className="wizard-step">
        <div className="wizard-icon"><UserRound size={22} /></div>
        <h3>Кем вы войдёте в историю?</h3>
        <p className="step-description">ИИ соберёт адаптивные характеристики, ресурсы и стартовые способности под правила мира.</p>
        <label className="field"><span>Имя героя</span><input autoFocus value={characterName} onChange={(event) => setCharacterName(event.target.value)} maxLength={160} /></label>
        <label className="field field--large"><span>Концепция персонажа</span><textarea value={characterConcept} onChange={(event) => setCharacterConcept(event.target.value)} rows={5} maxLength={4000} /></label>
        <label className="field field--large"><span>Как начать историю</span><textarea value={opening} onChange={(event) => setOpening(event.target.value)} rows={3} maxLength={4000} /></label>
      </div>}

      {step === 3 && <div className="wizard-step">
        <div className="wizard-icon"><ShieldCheck size={22} /></div>
        <h3>Правила этой истории</h3>
        <p className="step-description">Эти настройки станут договором рассказчика и будут действовать во всей кампании.</p>
        <fieldset className="choice-group">
          <legend>Отношение к канону</legend>
          {([
            ['faithful', 'Строгий канон', 'Соблюдать эпоху, силы и известные события.'],
            ['flexible', 'Живая ветка', 'Канон — основа, но действия героя меняют будущее.'],
            ['original', 'Вдохновлено', 'Сохранить настроение, создать собственный мир и имена.'],
          ] as const).map(([value, title, caption]) => <label className={`choice-card ${canonMode === value ? 'is-selected' : ''}`} key={value}><input type="radio" name="canon" checked={canonMode === value} onChange={() => setCanonMode(value)} /><span className="choice-check">{canonMode === value && <Check size={13} />}</span><span><strong>{title}</strong><small>{caption}</small></span></label>)}
        </fieldset>
        <label className="field"><span>Границы контента <i>необязательно</i></span><textarea value={contentBoundaries} onChange={(event) => setContentBoundaries(event.target.value)} rows={3} placeholder="Темы, которых рассказчик должен избегать…" maxLength={2000} /></label>
        <div className={`generation-summary ${isDemo ? 'is-demo' : ''}`}>
          <div>{isDemo ? <Dices size={19} /> : <WandSparkles size={19} />}</div>
          <span><strong>{isDemo ? 'Быстрая демо-генерация' : 'Глубокая генерация мира'}</strong><small>{isDemo ? 'Создаст рабочий адаптивный мир. Для уникального подробного лора подключите модель в настройках.' : `${providerName} создаст законы, фракции, персонажей, лорбук, героя и стартовую сцену.`}</small></span>
        </div>
      </div>}
    </div>

    {submitError && <div className="inline-error">{submitError}</div>}
    {generating && <OperationProgressPanel progress={progress} />}
    <div className="wizard-actions">
      <button className="secondary-button" disabled={generating} onClick={() => step === 1 ? close() : setStep(step - 1)}>{step > 1 && <ArrowLeft size={16} />}{step === 1 ? 'Отмена' : 'Назад'}</button>
      {step < 3 ? <button className="primary-button" disabled={!canContinue || ideating} onClick={() => setStep(step + 1)}>Продолжить <ArrowRight size={16} /></button> : <button className="primary-button" disabled={generating || ideating} onClick={() => void submit()}>{generating ? <><LoaderCircle className="spin" size={17} /> Готовность {Math.round(progress?.percent ?? 1)}%</> : <><Sparkles size={17} /> Начать историю</>}</button>}
    </div>
  </Modal>
}
