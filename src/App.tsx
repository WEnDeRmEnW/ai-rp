import { AlertCircle, LoaderCircle, X } from 'lucide-react'
import { useEffect, useState, type CSSProperties } from 'react'
import type { ActionType, MemoryEntry, StoryMessage } from '../shared/types'
import { Composer } from './components/Composer'
import { CommandPalette } from './components/CommandPalette'
import { CampaignEditorDialog } from './components/CampaignEditorDialog'
import { HeroVitals } from './components/HeroVitals'
import { Inspector, type InspectorTab } from './components/Inspector'
import { NewWorldDialog } from './components/NewWorldDialog'
import { SettingsDialog } from './components/SettingsDialog'
import { Sidebar } from './components/Sidebar'
import { StoryView } from './components/StoryView'
import { TopBar } from './components/TopBar'
import { useApp } from './state/AppContext'
import { getWorldPresentation } from './lib/world-customization'
import { loadInterfacePreferences, saveInterfacePreferences, type InterfacePreferences } from './lib/interface-preferences'

export function App() {
  const app = useApp()
  const [newWorldOpen, setNewWorldOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)
  const [focusMode, setFocusMode] = useState(false)
  const [interfacePreferences, setInterfacePreferences] = useState<InterfacePreferences>(() => loadInterfacePreferences())
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarVisible, setSidebarVisible] = useState(() => window.innerWidth <= 800 ? false : localStorage.getItem('letopis-sidebar-visible') !== 'false')
  const [inspectorOpen, setInspectorOpen] = useState(() => window.innerWidth > 800)
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('dashboard')
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [mode, setMode] = useState<ActionType>('do')

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase('ru-RU') === 'k') {
        event.preventDefault()
        setCommandOpen((value) => !value)
      }
      if (event.key === 'Escape' && focusMode && !commandOpen) setFocusMode(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [commandOpen, focusMode])

  useEffect(() => {
    saveInterfacePreferences(interfacePreferences)
  }, [interfacePreferences])

  if (app.loading) return <div className="app-loading"><div className="brand-mark brand-mark--large"><span /></div><LoaderCircle className="spin" size={22} /><span>Открываем летопись…</span></div>
  if (!app.activeCampaign) return null
  const campaign = app.activeCampaign
  const draftKey = `letopis-draft-${campaign.id}`
  const draft = drafts[campaign.id] ?? localStorage.getItem(draftKey) ?? ''
  const setDraft = (value: string) => {
    setDrafts((current) => ({ ...current, [campaign.id]: value }))
    if (value) localStorage.setItem(draftKey, value)
    else localStorage.removeItem(draftKey)
  }
  const presentation = getWorldPresentation(campaign.world)
  const worldStyle = {
    '--accent': presentation.accent,
    '--accent-strong': presentation.accentStrong,
    '--accent-soft': `color-mix(in srgb, ${presentation.accent} 12%, transparent)`,
    '--gold': presentation.secondary,
    '--reader-scale': interfacePreferences.fontScale / 100,
    '--panel-scale': interfacePreferences.fontScale / 100,
    '--inspector-width': interfacePreferences.inspectorWidth === 'compact' ? '420px' : interfacePreferences.inspectorWidth === 'wide' ? '560px' : '480px',
  } as CSSProperties

  const send = async () => {
    const content = draft.trim() || (mode === 'continue' ? 'Продолжи сцену, не принимая решений за моего героя.' : '')
    if (!content || app.generating) return
    const success = await app.sendTurn(content, mode)
    if (success) setDraft('')
  }

  const pinMessage = (message: StoryMessage) => {
    void app.updateActiveCampaign((next) => {
      const memory: MemoryEntry = {
        id: crypto.randomUUID(), kind: 'fact', content: message.content.slice(0, 1200), tags: [next.scene.location, 'закреплено'],
        importance: 100, pinned: true, turn: message.turn, createdAt: new Date().toISOString(),
      }
      next.memories.push(memory)
      return next
    })
  }

  const toggleSidebar = () => {
    if (focusMode) setFocusMode(false)
    if (window.innerWidth <= 800) {
      setInspectorOpen(false)
      setSidebarOpen((value) => !value)
      return
    }
    const next = !sidebarVisible
    setSidebarVisible(next)
    localStorage.setItem('letopis-sidebar-visible', String(next))
  }

  const shellClasses = [
    'app-shell', sidebarVisible ? 'has-sidebar' : '', inspectorOpen ? 'has-inspector' : '', focusMode ? 'is-focus-mode' : '',
    `density-${interfacePreferences.density}`, `reading-${interfacePreferences.readingWidth}`, `font-${interfacePreferences.readingFont}`,
    !interfacePreferences.showVitals ? 'hide-vitals' : '', interfacePreferences.reducedMotion ? 'reduce-motion' : '',
  ].filter(Boolean).join(' ')

  const openInspectorTab = (tab: InspectorTab) => {
    setFocusMode(false)
    setSidebarOpen(false)
    setInspectorTab(tab)
    setInspectorOpen(true)
  }

  return <div className={shellClasses} style={worldStyle} data-world-surface={presentation.surface}>
    <a className="skip-link" href="#main-story">К истории</a>
    <Sidebar
      campaigns={app.campaigns}
      activeId={app.activeCampaignId}
      provider={app.provider}
      mobileOpen={sidebarOpen}
      onCloseMobile={() => setSidebarOpen(false)}
      onSelect={(id) => { app.setActiveCampaignId(id); setSidebarOpen(false) }}
      onNew={() => setNewWorldOpen(true)}
      onSettings={() => setSettingsOpen(true)}
      onDuplicate={(id) => void app.duplicateCampaign(id)}
      onDelete={(id) => void app.removeCampaign(id)}
      onImport={(file) => void app.importCampaign(file)}
    />
    <div className="workspace">
      <TopBar
        campaign={campaign}
        canUndo={campaign.snapshots.length > 0 && !app.generating}
        sidebarOpen={window.innerWidth <= 800 ? sidebarOpen : sidebarVisible}
        inspectorOpen={inspectorOpen}
        focusMode={focusMode}
        onMenu={toggleSidebar}
        onInspector={() => { setFocusMode(false); setSidebarOpen(false); setInspectorOpen(!inspectorOpen) }}
        onUndo={() => void app.undoTurn()}
        onSettings={() => setSettingsOpen(true)}
        onEdit={() => setEditorOpen(true)}
        onFocusMode={() => setFocusMode((value) => !value)}
        onCommand={() => setCommandOpen(true)}
      />
      <HeroVitals campaign={campaign} onOpen={() => openInspectorTab('hero')} />
      <StoryView
        campaign={campaign}
        generating={app.generating}
        progress={app.operationProgress}
        onSuggestion={(suggestion) => { setMode('do'); setDraft(suggestion) }}
        onPin={pinMessage}
        onUndo={() => void app.undoTurn()}
        onRetry={() => void app.retryLastTurn()}
        onBranch={() => void app.duplicateCampaign(campaign.id)}
      />
      <Composer value={draft} mode={mode} generating={app.generating} progress={app.operationProgress} labels={presentation.labels} onValue={setDraft} onMode={setMode} onSend={() => void send()} onCancel={app.cancelGeneration} />
    </div>
    <Inspector
      campaign={campaign}
      open={inspectorOpen}
      activeTab={inspectorTab}
      onTabChange={setInspectorTab}
      onClose={() => setInspectorOpen(false)}
      onUpdate={app.updateActiveCampaign}
      designingInterface={app.generating}
      onDesignInterface={(instruction) => void app.aiEditCampaign(instruction?.trim() || 'Полностью и безопасно перестрой правую панель именно под этот мир. Создай или обнови world.interfaceBlueprint, настоящие world.metrics и 2–6 уникальных адаптивных модулей с живыми привязками. Сохрани закреплённые пользователем модули, не раскрывай скрытые знания и не меняй сюжет, время или установленные факты.')}
    />

    <NewWorldDialog
      open={newWorldOpen}
      generating={app.generating}
      progress={app.operationProgress}
      providerName={app.provider.model}
      isDemo={app.provider.provider === 'demo'}
      onClose={() => setNewWorldOpen(false)}
      onCreate={app.createCampaign}
    />
    <SettingsDialog open={settingsOpen} provider={app.provider} theme={app.theme} interfacePreferences={interfacePreferences} campaign={campaign} onClose={() => setSettingsOpen(false)} onProvider={app.setProvider} onTheme={app.setTheme} onInterface={setInterfacePreferences} onCampaign={app.updateActiveCampaign} />
    <CampaignEditorDialog open={editorOpen} campaign={campaign} generating={app.generating} progress={app.operationProgress} onClose={() => setEditorOpen(false)} onManual={app.updateActiveCampaign} onAi={app.aiEditCampaign} onUndoEdit={app.undoLastEdit} canUndoEdit={app.canUndoEdit} />

    <CommandPalette
      open={commandOpen}
      campaign={campaign}
      campaigns={app.campaigns}
      focusMode={focusMode}
      canUndo={campaign.snapshots.length > 0 && !app.generating}
      onClose={() => setCommandOpen(false)}
      onFocusMode={() => setFocusMode((value) => !value)}
      onSidebar={toggleSidebar}
      onInspector={() => { setFocusMode(false); setInspectorOpen((value) => !value) }}
      onInspectorTab={openInspectorTab}
      onSelectCampaign={app.setActiveCampaignId}
      onNew={() => setNewWorldOpen(true)}
      onSettings={() => setSettingsOpen(true)}
      onEdit={() => setEditorOpen(true)}
      onUndo={() => void app.undoTurn()}
    />

    {app.error && <div className="error-toast" role="alert"><AlertCircle size={18} /><div><strong>Ход не применён</strong><span>{app.error}</span>{app.canRetryFailedTurn && <button className="error-retry" disabled={app.generating} onClick={() => void app.retryFailedTurn()}>Повторить ход</button>}</div><button onClick={app.dismissError} aria-label="Закрыть ошибку"><X size={16} /></button></div>}
  </div>
}
