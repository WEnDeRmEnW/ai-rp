/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ActionType, Campaign, OperationProgress, ProviderConfig, WorldGenerationRequest } from '../../shared/types'
import { editCampaign as requestCampaignEdit, generateCampaign, takeTurn } from '../lib/api'
import { ensureCampaignIdentity } from '../lib/campaign-identity'
import { createDemoCampaign } from '../lib/demo'
import { applyPatch, commitTurn, rewindLastTurn } from '../lib/engine'
import { loadProviderConfig, persistProviderConfig } from '../lib/provider-settings'
import { deleteCampaign as deleteStoredCampaign, getCampaigns, readCampaignFile, saveCampaign } from '../lib/storage'

type Theme = 'dark' | 'light'

interface AppContextValue {
  campaigns: Campaign[]
  activeCampaign?: Campaign
  activeCampaignId?: string
  provider: ProviderConfig
  theme: Theme
  loading: boolean
  generating: boolean
  error?: string
  operationProgress?: OperationProgress
  setActiveCampaignId: (id: string) => void
  setProvider: (config: ProviderConfig) => void
  setTheme: (theme: Theme) => void
  dismissError: () => void
  sendTurn: (input: string, actionType: ActionType) => Promise<boolean>
  cancelGeneration: () => void
  retryLastTurn: () => Promise<void>
  retryFailedTurn: () => Promise<boolean>
  canRetryFailedTurn: boolean
  createCampaign: (request: Omit<WorldGenerationRequest, 'provider'>) => Promise<Campaign | undefined>
  aiEditCampaign: (instruction: string) => Promise<string | undefined>
  updateActiveCampaign: (updater: (campaign: Campaign) => Campaign) => Promise<void>
  undoTurn: () => Promise<void>
  duplicateCampaign: (id: string) => Promise<void>
  removeCampaign: (id: string) => Promise<void>
  importCampaign: (file: File) => Promise<void>
}

const AppContext = createContext<AppContextValue | null>(null)
const ACTIVE_KEY = 'letopis-active-campaign'
const THEME_KEY = 'letopis-theme'

export function AppProvider({ children }: { children: ReactNode }) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [activeCampaignId, setActiveId] = useState<string>()
  const [provider, setProviderState] = useState<ProviderConfig>(() => loadProviderConfig())
  const [theme, setThemeState] = useState<Theme>(() => localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark')
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string>()
  const [operationProgress, setOperationProgress] = useState<OperationProgress>()
  const abortRef = useRef<AbortController | undefined>(undefined)
  const lastFailedTurnRef = useRef<{ input: string; actionType: ActionType } | undefined>(undefined)
  const [canRetryFailedTurn, setCanRetryFailedTurn] = useState(false)
  const initializedRef = useRef(false)

  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true
    void (async () => {
      try {
        let stored = await getCampaigns()
        if (!stored.length) {
          const demo = createDemoCampaign()
          await saveCampaign(demo)
          stored = [demo]
        }
        setCampaigns(stored)
        const preferred = localStorage.getItem(ACTIVE_KEY)
        setActiveId(stored.some((campaign) => campaign.id === preferred) ? preferred! : stored[0].id)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Не удалось открыть локальное хранилище.')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  const activeCampaign = campaigns.find((campaign) => campaign.id === activeCampaignId)

  const setActiveCampaignId = useCallback((id: string) => {
    setActiveId(id)
    localStorage.setItem(ACTIVE_KEY, id)
  }, [])

  const setProvider = useCallback((config: ProviderConfig) => {
    setProviderState(config)
    persistProviderConfig(config)
  }, [])

  const setTheme = useCallback((next: Theme) => setThemeState(next), [])

  const upsert = useCallback(async (campaign: Campaign) => {
    const saved = await saveCampaign(ensureCampaignIdentity(campaign))
    setCampaigns((current) => [saved, ...current.filter((item) => item.id !== saved.id)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))
    return saved
  }, [])

  const updateActiveCampaign = useCallback(async (updater: (campaign: Campaign) => Campaign) => {
    const current = campaigns.find((campaign) => campaign.id === activeCampaignId)
    if (!current) return
    const draft = structuredClone(current)
    const updated = updater(draft)
    const next = ensureCampaignIdentity(updated && typeof updated === 'object' && !Array.isArray(updated) ? updated : draft, current.id)
    next.updatedAt = new Date().toISOString()
    await upsert(next)
  }, [activeCampaignId, campaigns, upsert])

  const sendTurn = useCallback(async (input: string, actionType: ActionType) => {
    const campaign = campaigns.find((candidate) => candidate.id === activeCampaignId)
    if (!campaign || generating || !input.trim()) return false
    setGenerating(true)
    setError(undefined)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      setOperationProgress({ percent: 1, stage: 'connecting', detail: 'Передаём ход рассказчику' })
      const response = await takeTurn({ campaign, input: input.trim(), actionType, provider }, controller.signal, setOperationProgress)
      await upsert(commitTurn(campaign, input.trim(), actionType, response))
      lastFailedTurnRef.current = undefined
      setCanRetryFailedTurn(false)
      return true
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
        lastFailedTurnRef.current = { input: input.trim(), actionType }
        setCanRetryFailedTurn(true)
        setError(cause instanceof Error ? cause.message : 'Не удалось продолжить историю.')
      }
      return false
    } finally {
      if (abortRef.current === controller) abortRef.current = undefined
      setGenerating(false)
    }
  }, [activeCampaignId, campaigns, generating, provider, upsert])

  const retryFailedTurn = useCallback(async () => {
    const failed = lastFailedTurnRef.current
    if (!failed || generating) return false
    return sendTurn(failed.input, failed.actionType)
  }, [generating, sendTurn])

  const cancelGeneration = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = undefined
    setGenerating(false)
    setOperationProgress(undefined)
  }, [])

  const retryLastTurn = useCallback(async () => {
    if (!activeCampaign || !activeCampaign.snapshots.length || generating) return
    const lastInput = [...activeCampaign.messages].reverse().find((message) => message.role === 'user')
    if (!lastInput) return
    const rewound = rewindLastTurn(activeCampaign)
    const controller = new AbortController()
    abortRef.current = controller
    setGenerating(true)
    setError(undefined)
    try {
      setOperationProgress({ percent: 1, stage: 'connecting', detail: 'Готовим повторную генерацию' })
      const response = await takeTurn({
        campaign: rewound,
        input: lastInput.content,
        actionType: lastInput.actionType ?? 'do',
        provider,
      }, controller.signal, setOperationProgress)
      await upsert(commitTurn(rewound, lastInput.content, lastInput.actionType ?? 'do', response))
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === 'AbortError')) setError(cause instanceof Error ? cause.message : 'Не удалось повторить ход.')
    } finally {
      if (abortRef.current === controller) abortRef.current = undefined
      setGenerating(false)
    }
  }, [activeCampaign, generating, provider, upsert])

  const createCampaign = useCallback(async (request: Omit<WorldGenerationRequest, 'provider'>) => {
    setGenerating(true)
    setError(undefined)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      setOperationProgress({ percent: 1, stage: 'connecting', detail: 'Передаём замысел архитектору мира' })
      const campaign = await generateCampaign({ ...request, provider }, controller.signal, setOperationProgress)
      const saved = await upsert(ensureCampaignIdentity(campaign))
      setActiveCampaignId(saved.id)
      return saved
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return undefined
      const message = cause instanceof Error ? cause.message : 'Не удалось создать мир.'
      setError(message)
      throw cause
    } finally {
      if (abortRef.current === controller) abortRef.current = undefined
      setGenerating(false)
    }
  }, [provider, setActiveCampaignId, upsert])

  const aiEditCampaign = useCallback(async (instruction: string) => {
    const campaign = campaigns.find((candidate) => candidate.id === activeCampaignId)
    if (!campaign || generating || instruction.trim().length < 3) return undefined
    setGenerating(true)
    setError(undefined)
    setOperationProgress({ percent: 1, stage: 'connecting', detail: 'Передаём корректировку ИИ-редактору' })
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const response = await requestCampaignEdit({ campaign, instruction: instruction.trim(), provider }, controller.signal, setOperationProgress)
      const diagnostics: Parameters<typeof applyPatch>[3] = []
      const next = applyPatch(campaign, response.statePatch, campaign.turn, diagnostics)
      if (response.campaignPatch?.title?.trim()) next.title = response.campaignPatch.title.trim()
      if (response.settingsPatch) next.settings = { ...next.settings, ...response.settingsPatch }
      next.updatedAt = new Date().toISOString()
      await upsert(next)
      return diagnostics.length ? `${response.summary} Отклонено небезопасных ссылок: ${diagnostics.length}.` : response.summary
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === 'AbortError')) setError(cause instanceof Error ? cause.message : 'Не удалось применить ИИ-корректировку.')
      return undefined
    } finally {
      if (abortRef.current === controller) abortRef.current = undefined
      setGenerating(false)
    }
  }, [activeCampaignId, campaigns, generating, provider, upsert])

  const undoTurn = useCallback(async () => {
    if (!activeCampaign?.snapshots.length) return
    await upsert(rewindLastTurn(activeCampaign))
  }, [activeCampaign, upsert])

  const duplicateCampaign = useCallback(async (campaignId: string) => {
    const original = campaigns.find((campaign) => campaign.id === campaignId)
    if (!original) return
    const timestamp = new Date().toISOString()
    const copy = structuredClone(original)
    copy.id = crypto.randomUUID()
    copy.title = `${original.title} — ветка`
    copy.createdAt = timestamp
    copy.updatedAt = timestamp
    copy.snapshots = []
    await upsert(copy)
    setActiveCampaignId(copy.id)
  }, [campaigns, setActiveCampaignId, upsert])

  const removeCampaign = useCallback(async (campaignId: string) => {
    await deleteStoredCampaign(campaignId)
    const remaining = campaigns.filter((campaign) => campaign.id !== campaignId)
    if (!remaining.length) {
      const demo = createDemoCampaign()
      await saveCampaign(demo)
      setCampaigns([demo])
      setActiveCampaignId(demo.id)
    } else {
      setCampaigns(remaining)
      if (activeCampaignId === campaignId) setActiveCampaignId(remaining[0].id)
    }
  }, [activeCampaignId, campaigns, setActiveCampaignId])

  const importCampaign = useCallback(async (file: File) => {
    try {
      const imported = await readCampaignFile(file)
      const campaign = { ...imported, id: crypto.randomUUID(), title: `${imported.title} — импорт`, updatedAt: new Date().toISOString(), snapshots: [] }
      await upsert(campaign)
      setActiveCampaignId(campaign.id)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось импортировать кампанию.')
    }
  }, [setActiveCampaignId, upsert])

  const value = useMemo<AppContextValue>(() => ({
    campaigns, activeCampaign, activeCampaignId, provider, theme, loading, generating, error, operationProgress,
    setActiveCampaignId, setProvider, setTheme, dismissError: () => setError(undefined), sendTurn, cancelGeneration, retryLastTurn, retryFailedTurn, canRetryFailedTurn, createCampaign, aiEditCampaign,
    updateActiveCampaign, undoTurn, duplicateCampaign, removeCampaign, importCampaign,
  }), [campaigns, activeCampaign, activeCampaignId, provider, theme, loading, generating, error, operationProgress, canRetryFailedTurn, setActiveCampaignId, setProvider, setTheme, sendTurn, cancelGeneration, retryLastTurn, retryFailedTurn, createCampaign, aiEditCampaign, updateActiveCampaign, undoTurn, duplicateCampaign, removeCampaign, importCampaign])

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const context = useContext(AppContext)
  if (!context) throw new Error('useApp must be used inside AppProvider')
  return context
}
