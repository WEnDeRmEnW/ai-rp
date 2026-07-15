import { AlignJustify, BookOpen, Check, Eye, EyeOff, Gauge, KeyRound, Moon, RotateCcw, Server, Sun, Type } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Campaign, ProviderConfig, ProviderKind } from '../../shared/types'
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

export function SettingsDialog({ open, provider, theme, interfacePreferences, campaign, onClose, onProvider, onTheme, onInterface, onCampaign }: SettingsDialogProps) {
  const [draft, setDraft] = useState(provider)
  const [showKey, setShowKey] = useState(false)
  const [authorsNote, setAuthorsNote] = useState(campaign?.settings.authorsNote ?? '')
  const [responseLength, setResponseLength] = useState(campaign?.settings.responseLength ?? 'balanced')
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
  const [canonMode, setCanonMode] = useState(campaign?.settings.canonMode ?? 'flexible')
  const [contentBoundaries, setContentBoundaries] = useState(campaign?.settings.contentBoundaries ?? '')
  const [saved, setSaved] = useState(false)
  const [interfaceDraft, setInterfaceDraft] = useState(interfacePreferences)
  const [themeDraft, setThemeDraft] = useState(theme)

  useEffect(() => {
    if (open) {
      setDraft(provider)
      setAuthorsNote(campaign?.settings.authorsNote ?? '')
      setResponseLength(campaign?.settings.responseLength ?? 'balanced')
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
          <label className="field"><span>Длина ответа</span><select value={responseLength} onChange={(event) => setResponseLength(event.target.value as typeof responseLength)}><option value="compact">Коротко</option><option value="balanced">Сбалансированно</option><option value="detailed">Подробно</option></select></label>
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
          <label className="field"><span><Gauge size={13} /> Размер текста: {interfaceDraft.fontScale}%</span><input type="range" min={90} max={125} step={5} value={interfaceDraft.fontScale} onChange={(event) => setInterfaceDraft({ ...interfaceDraft, fontScale: Number(event.target.value) })} /></label>
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
