import { AlignJustify, BookOpen, Check, Eye, EyeOff, Gauge, KeyRound, Moon, RotateCcw, Server, Sparkles, Sun, Type } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Campaign, EventDirectorPermissions, ProviderConfig, ProviderKind } from '../../shared/types'
import { normalizeEventDirectorSettings } from '../../shared/event-director'
import { providerDefaults, switchProvider } from '../lib/provider-settings'
import { defaultInterfacePreferences, type InterfacePreferences } from '../lib/interface-preferences'
import { Modal } from './Modal'

interface SettingsDialogProps {
  open: boolean
  provider: ProviderConfig
  theme: 'dark' | 'light'
  interfacePreferences: InterfacePreferences
  campaign?: Campaign
  onClose: () => void
  onProvider: (provider: ProviderConfig) => void
  onTheme: (theme: 'dark' | 'light') => void
  onInterface: (preferences: InterfacePreferences) => void
  onCampaign: (updater: (campaign: Campaign) => Campaign) => Promise<void>
}

const providers: Array<{ value: ProviderKind; label: string; caption: string }> = [
  { value: 'demo', label: 'Демо', caption: 'Без ключа' },
  { value: 'openai', label: 'OpenAI', caption: 'API' },
  { value: 'openrouter', label: 'OpenRouter', caption: 'Много моделей' },
  { value: 'ollama', label: 'Ollama', caption: 'DeepSeek V4 Flash' },
  { value: 'custom', label: 'Свой API', caption: 'Совместимый' },
]

const eventPermissionLabels: Array<{ key: keyof EventDirectorPermissions; label: string; caption: string }> = [
  { key: 'newCharacters', label: 'Новые персонажи', caption: 'Путешественники, учителя, свидетели, соперники и другие живые люди мира.' },
  { key: 'strongEnemies', label: 'Сильные противники', caption: 'Опасные охотники и враги с полноценными силами, стратегией и ограничениями.' },
  { key: 'allies', label: 'Новые союзники', caption: 'Возможность встретить помощь, не превращая встречу в автоматическое вступление в отряд.' },
  { key: 'legends', label: 'Легенды и мифы', caption: 'Возвращения, наследие, новые подвиги и встречи с исключительными фигурами.' },
  { key: 'powerAwakenings', label: 'Пробуждение сил', caption: 'Новые способности, формы, техники и источники силы после причинного события.' },
  { key: 'powerLoss', label: 'Изменение и потеря сил', caption: 'Блокировка, кража, искажение или окончательная утрата способности.' },
  { key: 'bodyChanges', label: 'Изменения тела', caption: 'Метки, мутации, превращения и физические последствия без управления личностью героя.' },
  { key: 'artifactCreation', label: 'Новые артефакты', caption: 'Создание, пробуждение, объединение и преобразование особых предметов.' },
  { key: 'itemLoss', label: 'Потеря вещей', caption: 'Кража, разрушение, расход или иная фактическая утрата предметов.' },
  { key: 'politics', label: 'Политика и фракции', caption: 'Смена власти, расколы, союзы, санкции, культы и общественные движения.' },
  { key: 'wars', label: 'Войны и большие конфликты', caption: 'Причинные столкновения государств, кланов и иных сил мира.' },
  { key: 'disasters', label: 'Катастрофы', caption: 'Природные, магические, технологические и общественные бедствия.' },
  { key: 'anomalies', label: 'Аномалии', caption: 'Необычные нарушения среды, силы, пространства и привычного порядка.' },
  { key: 'realityChanges', label: 'Изменение законов мира', caption: 'Только через крупную арку с предвестниками и устойчивыми последствиями.' },
  { key: 'dimensionalTravel', label: 'Другие измерения', caption: 'Открытие слоёв реальности, порталов и межпространственных маршрутов.' },
  { key: 'temporalEvents', label: 'События времени', caption: 'Петли, сдвиги эпох и другие причинно подготовленные временные явления.' },
  { key: 'socialEvents', label: 'Личные и социальные события', caption: 'Праздники, встречи, просьбы, предательства, наследство и перемены отношений.' },
  { key: 'miracles', label: 'Редкие чудеса', caption: 'Исключительное спасение без стирания уже произошедших потерь и решений.' },
]

export function SettingsDialog({ open, provider, theme, interfacePreferences, campaign, onClose, onProvider, onTheme, onInterface, onCampaign }: SettingsDialogProps) {
  const [draft, setDraft] = useState(provider)
  const [showKey, setShowKey] = useState(false)
  const [authorsNote, setAuthorsNote] = useState(campaign?.settings.authorsNote ?? '')
  const [responseLength, setResponseLength] = useState(campaign?.settings.responseLength ?? 'adaptive')
  const [difficulty, setDifficulty] = useState(campaign?.settings.difficulty ?? 'balanced')
  const [playerAgency, setPlayerAgency] = useState(campaign?.settings.playerAgency ?? 'strict')
  const [resolutionMode, setResolutionMode] = useState(campaign?.settings.resolutionMode ?? 'hidden')
  const [contextProfile, setContextProfile] = useState(campaign?.settings.contextProfile ?? 'million')
  const [qualityMode, setQualityMode] = useState(campaign?.settings.qualityMode ?? 'deep')
  const [scenePace, setScenePace] = useState(campaign?.settings.scenePace ?? 'balanced')
  const [proseStyle, setProseStyle] = useState(campaign?.settings.proseStyle ?? 'literary')
  const [dialogueDensity, setDialogueDensity] = useState(campaign?.settings.dialogueDensity ?? 'balanced')
  const [npcAutonomy, setNpcAutonomy] = useState(campaign?.settings.npcAutonomy ?? 'independent')
  const [worldDynamics, setWorldDynamics] = useState(campaign?.settings.worldDynamics ?? 'living')
  const [eventDirector, setEventDirector] = useState(normalizeEventDirectorSettings(campaign?.settings.eventDirector))
  const [canonMode, setCanonMode] = useState(campaign?.settings.canonMode ?? 'flexible')
  const [contentBoundaries, setContentBoundaries] = useState(campaign?.settings.contentBoundaries ?? '')
  const [saved, setSaved] = useState(false)
  const [interfaceDraft, setInterfaceDraft] = useState(interfacePreferences)
  const [themeDraft, setThemeDraft] = useState(theme)

  useEffect(() => {
    if (open) {
      setDraft(provider)
      setAuthorsNote(campaign?.settings.authorsNote ?? '')
      setResponseLength(campaign?.settings.responseLength ?? 'adaptive')
      setDifficulty(campaign?.settings.difficulty ?? 'balanced')
      setPlayerAgency(campaign?.settings.playerAgency ?? 'strict')
      setResolutionMode(campaign?.settings.resolutionMode ?? 'hidden')
      setContextProfile(campaign?.settings.contextProfile ?? 'million')
      setQualityMode(campaign?.settings.qualityMode ?? 'deep')
      setScenePace(campaign?.settings.scenePace ?? 'balanced')
      setProseStyle(campaign?.settings.proseStyle ?? 'literary')
      setDialogueDensity(campaign?.settings.dialogueDensity ?? 'balanced')
      setNpcAutonomy(campaign?.settings.npcAutonomy ?? 'independent')
      setWorldDynamics(campaign?.settings.worldDynamics ?? 'living')
      setEventDirector(normalizeEventDirectorSettings(campaign?.settings.eventDirector))
      setCanonMode(campaign?.settings.canonMode ?? 'flexible')
      setContentBoundaries(campaign?.settings.contentBoundaries ?? '')
      setInterfaceDraft(interfacePreferences)
      setThemeDraft(theme)
      setSaved(false)
    }
  }, [open, provider, campaign, interfacePreferences, theme])

  const save = async () => {
    onProvider(draft)
    onTheme(themeDraft)
    onInterface(interfaceDraft)
    if (campaign) await onCampaign((next) => {
      next.settings.authorsNote = authorsNote.trim()
      next.settings.responseLength = responseLength
      next.settings.difficulty = difficulty
      next.settings.playerAgency = playerAgency
      next.settings.resolutionMode = resolutionMode
      next.settings.contextProfile = contextProfile
      next.settings.qualityMode = qualityMode
      next.settings.scenePace = scenePace
      next.settings.proseStyle = proseStyle
      next.settings.dialogueDensity = dialogueDensity
      next.settings.npcAutonomy = npcAutonomy
      next.settings.worldDynamics = worldDynamics
      next.settings.eventDirector = normalizeEventDirectorSettings(eventDirector)
      next.settings.canonMode = canonMode
      next.settings.contentBoundaries = contentBoundaries.trim()
      return next
    })
    setSaved(true)
    setTimeout(onClose, 500)
  }

  return <Modal open={open} onClose={onClose} title="Настройки" eyebrow="Рассказчик и интерфейс" width="large">
    <div className="settings-layout">
      <section className="settings-section">
        <div className="settings-title"><div><Server size={18} /></div><span><h3>Нейросеть</h3><p>Ключ живёт только в текущей вкладке и не записывается в файлы.</p></span></div>
        <div className="provider-grid">
          {providers.map((item) => <button key={item.value} className={draft.provider === item.value ? 'is-selected' : ''} onClick={() => setDraft(switchProvider(draft, item.value))}><span className="radio-dot">{draft.provider === item.value && <Check size={11} />}</span><strong>{item.label}</strong><small>{item.caption}</small></button>)}
        </div>

        {draft.provider === 'demo' ? <div className="settings-note"><strong>Рабочий демо-режим</strong><span>Показывает весь игровой цикл и автоматические изменения состояния. Для свободного бесконечного RP выберите настоящую модель.</span></div> : <div className="form-stack compact-form">
          <label className="field"><span>Модель</span><input value={draft.model} onChange={(event) => setDraft({ ...draft, model: event.target.value })} placeholder={providerDefaults[draft.provider].model} /></label>
          <label className="field"><span>Базовый URL</span><input value={draft.baseUrl} onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })} placeholder={providerDefaults[draft.provider].baseUrl} /></label>
          <label className="field"><span>API-ключ {draft.provider === 'ollama' && <i>для локальной Ollama не нужен</i>}</span><div className="secret-field"><KeyRound size={15} /><input type={showKey ? 'text' : 'password'} value={draft.apiKey ?? ''} onChange={(event) => setDraft({ ...draft, apiKey: event.target.value })} placeholder={draft.provider === 'ollama' ? 'Обязателен для https://ollama.com/v1' : 'Можно оставить пустым, если ключ задан в .env'} autoComplete="off" /><button type="button" onClick={() => setShowKey(!showKey)} aria-label={showKey ? 'Скрыть ключ' : 'Показать ключ'}>{showKey ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label>
          <label className="field"><span>Творческая свобода: {draft.temperature.toFixed(2)}</span><input type="range" min={0.2} max={1.4} step={0.05} value={draft.temperature} onChange={(event) => setDraft({ ...draft, temperature: Number(event.target.value) })} /></label>
        </div>}
      </section>

      {campaign && <section className="settings-section">
        <div className="settings-title"><div><KeyRound size={18} /></div><span><h3>Режиссёрская заметка</h3><p>Короткая установка, которую рассказчик учитывает особенно внимательно.</p></span></div>
        <label className="field"><textarea value={authorsNote} onChange={(event) => setAuthorsNote(event.target.value)} rows={4} maxLength={4000} placeholder="Например: больше живых диалогов, медленнее раскрывать тайну…" /></label>
        <div className="field-grid settings-selects">
          <label className="field"><span>Длина ответа</span><select value={responseLength} onChange={(event) => setResponseLength(event.target.value as typeof responseLength)}><option value="adaptive">По сцене — без фиксированного лимита</option><option value="compact">Коротко</option><option value="balanced">Сбалансированно</option><option value="detailed">Подробно</option></select></label>
          <label className="field"><span>Сложность</span><select value={difficulty} onChange={(event) => setDifficulty(event.target.value as typeof difficulty)}><option value="story">Сюжетная</option><option value="balanced">Честная</option><option value="harsh">Суровая</option></select></label>
          <label className="field"><span>Свобода героя</span><select value={playerAgency} onChange={(event) => setPlayerAgency(event.target.value as typeof playerAgency)}><option value="strict">Только мои решения</option><option value="cinematic">Кинематографично</option></select></label>
          <label className="field"><span>Контекст истории</span><select value={contextProfile} onChange={(event) => setContextProfile(event.target.value as typeof contextProfile)}><option value="standard">Стандартный</option><option value="long">Долгий</option><option value="million">DeepSeek 1M</option></select></label>
          <label className="field"><span>Качество сцены</span><select value={qualityMode} onChange={(event) => setQualityMode(event.target.value as typeof qualityMode)}><option value="balanced">Один черновик</option><option value="deep">Два черновика + критик</option></select></label>
          <label className="field"><span>Темп сцены</span><select value={scenePace} onChange={(event) => setScenePace(event.target.value as typeof scenePace)}><option value="slow">Медленное погружение</option><option value="balanced">Сбалансированный</option><option value="fast">Динамичный</option><option value="montage">Монтаж и пропуск рутины</option></select></label>
          <label className="field"><span>Проверки риска</span><select value={resolutionMode} onChange={(event) => setResolutionMode(event.target.value as typeof resolutionMode)}><option value="off">Выключены</option><option value="hidden">Скрытые</option><option value="visible">Показывать бросок</option></select></label>
          <label className="field"><span>Стиль прозы</span><select value={proseStyle} onChange={(event) => setProseStyle(event.target.value as typeof proseStyle)}><option value="literary">Живой литературный</option><option value="cinematic">Кинематографичный</option><option value="direct">Прямой и ясный</option></select></label>
          <label className="field"><span>Плотность диалогов</span><select value={dialogueDensity} onChange={(event) => setDialogueDensity(event.target.value as typeof dialogueDensity)}><option value="low">Редкие и весомые</option><option value="balanced">Баланс</option><option value="high">Много живых реплик</option></select></label>
          <label className="field"><span>Самостоятельность персонажей</span><select value={npcAutonomy} onChange={(event) => setNpcAutonomy(event.target.value as typeof npcAutonomy)}><option value="reactive">В основном реагируют</option><option value="balanced">Баланс инициативы</option><option value="independent">Живут независимо</option></select></label>
          <label className="field"><span>Динамика мира</span><select value={worldDynamics} onChange={(event) => setWorldDynamics(event.target.value as typeof worldDynamics)}><option value="quiet">Медленные перемены</option><option value="living">Живой мир</option><option value="volatile">Бурно развивающийся</option></select></label>
          <label className="field"><span>Отношение к канону</span><select value={canonMode} onChange={(event) => setCanonMode(event.target.value as typeof canonMode)}><option value="faithful">Строгий канон</option><option value="flexible">Гибкая ветка</option><option value="original">Оригинальный мир</option></select></label>
        </div>
        <label className="field settings-boundaries"><span>Границы контента</span><textarea value={contentBoundaries} onChange={(event) => setContentBoundaries(event.target.value)} rows={3} maxLength={2000} placeholder="Темы и детали, которые рассказчик обязан исключить…" /></label>
        <div className="settings-note settings-note--real"><strong>Эти настройки действуют</strong><span>Они передаются режиссёру, рассказчику и фоновому симулятору каждого хода. Сложность меняет проверки, качество — число черновиков и критика, контекст — реальный объём долгой памяти.</span></div>
        <div className="settings-note"><strong>Долгая память</strong><span>Профиль DeepSeek 1M хранит исходную переписку целиком, подаёт свежие сцены дословно и извлекает старые главы, факты и канон по смыслу. Окно не заполняется всей историей подряд.</span></div>
      </section>}

      {campaign && <section className="settings-section event-director-settings">
        <div className="settings-title"><div><Sparkles size={18} /></div><span><h3>Неожиданные события</h3><p>Редкие причинные повороты: новые люди, силы, артефакты, открытия, войны, аномалии и изменения мира.</p></span></div>
        <div className="interface-toggle-list">
          <button role="switch" aria-checked={eventDirector.enabled} className={eventDirector.enabled ? 'is-on' : ''} onClick={() => setEventDirector({ ...eventDirector, enabled: !eventDirector.enabled })}><span><strong>Универсальный режиссёр событий</strong><small>DeepSeek сначала предлагает смысловое событие, затем приложение проверяет и привязывает его к настоящему состоянию.</small></span><i /></button>
        </div>
        <div className="field-grid settings-selects event-director-selects">
          <label className="field"><span>Частота</span><select value={eventDirector.frequency} onChange={(event) => setEventDirector({ ...eventDirector, frequency: event.target.value as typeof eventDirector.frequency })}><option value="rare">Редко, но сильно</option><option value="balanced">Сбалансированно</option><option value="frequent">Чаще и динамичнее</option></select></label>
          <label className="field"><span>Максимальный масштаб</span><select value={eventDirector.maxMagnitude} onChange={(event) => setEventDirector({ ...eventDirector, maxMagnitude: event.target.value as typeof eventDirector.maxMagnitude })}><option value="subtle">Только малые</option><option value="notable">Заметные</option><option value="major">Крупные</option><option value="legendary">До легендарных</option><option value="mythic">Без ограничения масштаба</option></select></label>
          <label className="field"><span>Опасность</span><select value={eventDirector.lethality} onChange={(event) => setEventDirector({ ...eventDirector, lethality: event.target.value as typeof eventDirector.lethality })}><option value="fair">Честно и смертельно</option><option value="ruthless">Без сюжетной защиты</option><option value="cinematic">Кинематографично</option></select></label>
          <label className="field"><span>Чудеса</span><select value={eventDirector.miraclePolicy} onChange={(event) => setEventDirector({ ...eventDirector, miraclePolicy: event.target.value as typeof eventDirector.miraclePolicy })}><option value="rare">Крайне редкое чистое чудо</option><option value="signals-only">Только знаки и возможности</option><option value="off">Отключены</option></select></label>
          <label className="field"><span>Влияние на историю</span><select value={eventDirector.storyImpact} onChange={(event) => setEventDirector({ ...eventDirector, storyImpact: event.target.value as typeof eventDirector.storyImpact })}><option value="fate-changing">Может менять судьбу мира</option><option value="side-arcs">Только боковые арки</option><option value="scene-only">Только текущая сцена</option></select></label>
          <label className="field"><span>Создание нового</span><select value={eventDirector.canonPolicy} onChange={(event) => setEventDirector({ ...eventDirector, canonPolicy: event.target.value as typeof eventDirector.canonPolicy })}><option value="follow-campaign">По режиму канона кампании</option><option value="established-only">Только существующие сущности</option><option value="free">Полная авторская свобода</option></select></label>
          <label className="field"><span>Повторы</span><select value={eventDirector.repetitionPolicy} onChange={(event) => setEventDirector({ ...eventDirector, repetitionPolicy: event.target.value as typeof eventDirector.repetitionPolicy })}><option value="evolving-only">Только как развитие</option><option value="rare-repeat">Редко после перерыва</option><option value="unrestricted">Решает ИИ</option></select></label>
          <label className="field"><span>Раскрытие</span><select value={eventDirector.revealMode} onChange={(event) => setEventDirector({ ...eventDirector, revealMode: event.target.value as typeof eventDirector.revealMode })}><option value="world-only">Только через события мира</option><option value="indicator">Безымянный индикатор</option><option value="transparent">Показывать подготовку</option></select></label>
        </div>
        <details className="event-permission-details">
          <summary><span>Тонкая настройка возможностей</span><small>По умолчанию разрешены все области, но крупным изменениям всё равно нужны причины и подготовка.</small></summary>
          <div className="event-permission-grid">
            {eventPermissionLabels.map((permission) => {
              const enabled = eventDirector.permissions[permission.key]
              return <button key={permission.key} role="switch" aria-checked={enabled} className={enabled ? 'is-on' : ''} onClick={() => setEventDirector({
                ...eventDirector,
                permissions: { ...eventDirector.permissions, [permission.key]: !enabled },
              })}><span><strong>{permission.label}</strong><small>{permission.caption}</small></span><i /></button>
            })}
          </div>
        </details>
        <div className="settings-note settings-note--real"><strong>Это не генератор случайных нападений</strong><span>Событие проходит проверку причинности, канона, повторов, масштаба и агентности. Если DeepSeek не смог полноценно обновить связанные данные, поворот откладывается, а обычный ход продолжается.</span></div>
      </section>}

      <section className="settings-section">
        <div className="settings-title"><div>{themeDraft === 'dark' ? <Moon size={18} /> : <Sun size={18} />}</div><span><h3>Интерфейс и чтение</h3><p>Настройте под свой экран и привычный темп — параметры применяются ко всему приложению после сохранения.</p></span></div>
        <div className="theme-switch">
          <button className={themeDraft === 'dark' ? 'is-selected' : ''} onClick={() => setThemeDraft('dark')}><Moon size={17} /> Тёмная</button>
          <button className={themeDraft === 'light' ? 'is-selected' : ''} onClick={() => setThemeDraft('light')}><Sun size={17} /> Светлая</button>
        </div>
        <div className="interface-settings-grid">
          <label className="field"><span><BookOpen size={13} /> Ширина истории</span><select value={interfaceDraft.readingWidth} onChange={(event) => setInterfaceDraft({ ...interfaceDraft, readingWidth: event.target.value as InterfacePreferences['readingWidth'] })}><option value="narrow">Узкая — для сосредоточения</option><option value="balanced">Сбалансированная</option><option value="wide">Широкая — для больших экранов</option></select></label>
          <label className="field"><span><Type size={13} /> Шрифт истории</span><select value={interfaceDraft.readingFont} onChange={(event) => setInterfaceDraft({ ...interfaceDraft, readingFont: event.target.value as InterfacePreferences['readingFont'] })}><option value="literary">Литературный</option><option value="modern">Современный</option></select></label>
          <label className="field"><span><AlignJustify size={13} /> Плотность панелей</span><select value={interfaceDraft.density} onChange={(event) => setInterfaceDraft({ ...interfaceDraft, density: event.target.value as InterfacePreferences['density'] })}><option value="comfortable">Просторная</option><option value="compact">Компактная</option></select></label>
          <label className="field"><span><AlignJustify size={13} /> Ширина правого пульта</span><select value={interfaceDraft.inspectorWidth} onChange={(event) => setInterfaceDraft({ ...interfaceDraft, inspectorWidth: event.target.value as InterfacePreferences['inspectorWidth'] })}><option value="compact">Компактная</option><option value="balanced">Сбалансированная</option><option value="wide">Широкая</option></select></label>
          <label className="field"><span><Gauge size={13} /> Размер текста истории и панелей: {interfaceDraft.fontScale}%</span><input type="range" min={95} max={135} step={5} value={interfaceDraft.fontScale} onChange={(event) => setInterfaceDraft({ ...interfaceDraft, fontScale: Number(event.target.value) })} /></label>
        </div>
        <div className="interface-toggle-list">
          <button role="switch" aria-checked={interfaceDraft.showVitals} className={interfaceDraft.showVitals ? 'is-on' : ''} onClick={() => setInterfaceDraft({ ...interfaceDraft, showVitals: !interfaceDraft.showVitals })}><span><strong>Постоянная строка состояния героя</strong><small>Ресурсы и эффекты всегда видны над историей</small></span><i /></button>
          <button role="switch" aria-checked={interfaceDraft.reducedMotion} className={interfaceDraft.reducedMotion ? 'is-on' : ''} onClick={() => setInterfaceDraft({ ...interfaceDraft, reducedMotion: !interfaceDraft.reducedMotion })}><span><strong>Минимум анимации</strong><small>Спокойные переходы без движения и мерцания</small></span><i /></button>
        </div>
        <button className="reset-interface" onClick={() => setInterfaceDraft({ ...defaultInterfacePreferences })}><RotateCcw size={14} /> Вернуть удобные значения</button>
      </section>
    </div>
    <div className="modal-actions settings-actions"><button className="secondary-button" onClick={onClose}>Отмена</button><button className="primary-button" onClick={() => void save()}>{saved ? <><Check size={16} /> Сохранено</> : 'Сохранить настройки'}</button></div>
  </Modal>
}
