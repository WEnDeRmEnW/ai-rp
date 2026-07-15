import { AlertCircle, LoaderCircle, X } from 'lucide-react'
import { useState, type CSSProperties } from 'react'
import type { ActionType, MemoryEntry, StoryMessage } from '../shared/types'
import { Composer } from './components/Composer'
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

export function App() {
  const app = useApp()
  const [newWorldOpen, setNewWorldOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarVisible, setSidebarVisible] = useState(() => window.innerWidth <= 800 ? false : localStorage.getItem('letopis-sidebar-visible') !== 'false')
  const [inspectorOpen, setInspectorOpen] = useState(() => window.innerWidth > 800)
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('scene')
  const [draft, setDraft] = useState('')
  const [mode, setMode] = useState<ActionType>('do')

  if (app.loading) return <div className="app-loading"><div className="brand-mark brand-mark--large"><span /></div><LoaderCircle className="spin" size={22} /><span>Открываем летопись…</span></div>
  if (!app.activeCampaign) return null
  const campaign = app.activeCampaign
  const presentation = getWorldPresentation(campaign.world)
  const worldStyle = {
    '--accent': presentation.accent,
    '--accent-strong': presentation.accentStrong,
    '--accent-soft': `color-mix(in srgb, ${presentation.accent} 12%, transparent)`,
    '--gold': presentation.secondary,
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
    if (window.innerWidth <= 800) {
      setInspectorOpen(false)
      setSidebarOpen((value) => !value)
      return
    }
    const next = !sidebarVisible
    setSidebarVisible(next)
    localStorage.setItem('letopis-sidebar-visible', String(next))
  }

  return <div className={`app-shell ${sidebarVisible ? 'has-sidebar' : ''} ${inspectorOpen ? 'has-inspector' : ''}`} style={worldStyle} data-world-surface={presentation.surface}>
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
        onMenu={toggleSidebar}
        onInspector={() => { setSidebarOpen(false); setInspectorOpen(!inspectorOpen) }}
        onUndo={() => void app.undoTurn()}
        onSettings={() => setSettingsOpen(true)}
        onEdit={() => setEditorOpen(true)}
      />
      <HeroVitals campaign={campaign} onOpen={() => { setSidebarOpen(false); setInspectorTab('hero'); setInspectorOpen(true) }} />
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
      onDesignInterface={() => void app.aiEditCampaign('Самостоятельно спроектируй для этого конкретного мира 2–6 уникальных адаптивных интерфейсных модулей. Не используй жанровые шаблоны и не копируй обычные HP, характеристики или инвентарь. Изучи фактические законы, механику сил, фракции, особые ресурсы, путь героя и открытые тайны; сама реши, что важно постоянно видеть, где это расположить и каким визуальным способом показать. Используй живые привязки к данным там, где они существуют, и custom только для действительно уникального состояния мира. Верни модули через world.upsertInterfaceModules, не меняя сюжет, время и установленные факты.')}
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
    <SettingsDialog open={settingsOpen} provider={app.provider} theme={app.theme} campaign={campaign} onClose={() => setSettingsOpen(false)} onProvider={app.setProvider} onTheme={app.setTheme} onCampaign={app.updateActiveCampaign} />
    <CampaignEditorDialog open={editorOpen} campaign={campaign} generating={app.generating} progress={app.operationProgress} onClose={() => setEditorOpen(false)} onManual={app.updateActiveCampaign} onAi={app.aiEditCampaign} />

    {app.error && <div className="error-toast" role="alert"><AlertCircle size={18} /><div><strong>Ход не применён</strong><span>{app.error}</span>{app.canRetryFailedTurn && <button className="error-retry" disabled={app.generating} onClick={() => void app.retryFailedTurn()}>Повторить ход</button>}</div><button onClick={app.dismissError} aria-label="Закрыть ошибку"><X size={16} /></button></div>}
  </div>
}
