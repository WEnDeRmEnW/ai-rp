/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ActionType, Campaign, OperationProgress, ProviderConfig, WorkshopEventOptions, WorldGenerationRequest } from '../../shared/types'
import { normalizeEventDirectorSettings } from '../../shared/event-director'
import { editCampaign as requestCampaignEdit, generateCampaign, takeTurn } from '../lib/api'
import { ensureCampaignIdentity, nextCampaignUpdatedAt } from '../lib/campaign-identity'
import { createDemoCampaign } from '../lib/demo'
import { applyPatch, commitTurn, rewindLastTurn } from '../lib/engine'
import { loadProviderConfig, persistProviderConfig } from '../lib/provider-settings'
import { syncApi } from '../lib/auth-api'
import { buildWorldNoveltyReferences } from '../lib/world-novelty'
import { claimGuestCampaigns, deleteCampaign as deleteStoredCampaign, getCampaignsForOwner, readCampaignFile, saveCampaign } from '../lib/storage'
import { useAuth } from './AuthContext'

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
  errorTitle: string
  operationProgress?: OperationProgress
  syncState: 'local' | 'syncing' | 'synced' | 'error'
  syncMessage?: string
  lastSyncedAt?: string
  syncNow: () => Promise<void>
  setActiveCampaignId: (id: string) => void
  setProvider: (config: ProviderConfig) => void
  setTheme: (theme: Theme) => void
  dismissError: () => void
  sendTurn: (input: string, actionType: ActionType) => Promise<boolean>
  cancelGeneration: () => void
  retryLastTurn: () => Promise<void>
  retryFailedTurn: () => Promise<boolean>
  canRetryFailedTurn: boolean
  createCampaign: (request: Omit<WorldGenerationRequest, 'provider' | 'noveltyReferences' | 'creativeSeed'>) => Promise<Campaign | undefined>
  aiEditCampaign: (instruction: string, eventOptions?: WorkshopEventOptions) => Promise<string | undefined>
  updateActiveCampaign: (updater: (campaign: Campaign) => Campaign) => Promise<void>
  undoLastEdit: () => Promise<void>
  canUndoEdit: boolean
  undoTurn: () => Promise<void>
  duplicateCampaign: (id: string) => Promise<void>
  removeCampaign: (id: string) => Promise<void>
  importCampaign: (file: File) => Promise<void>
}

const AppContext = createContext<AppContextValue | null>(null)
const ACTIVE_KEY = 'letopis-active-campaign'
const THEME_KEY = 'letopis-theme'
const pendingDeleteKey = (userId: string) => `letopis-pending-deletes-${userId}`
const getPendingDeletes = (userId: string): string[] => {
  try {
    const value = JSON.parse(localStorage.getItem(pendingDeleteKey(userId)) || '[]')
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []
  } catch { return [] }
}
const setPendingDeletes = (userId: string, ids: string[]) => localStorage.setItem(pendingDeleteKey(userId), JSON.stringify([...new Set(ids)]))

export function AppProvider({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [activeCampaignId, setActiveId] = useState<string>()
  const [provider, setProviderState] = useState<ProviderConfig>(() => loadProviderConfig())
  const [theme, setThemeState] = useState<Theme>(() => localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark')
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string>()
  const [errorTitle, setErrorTitle] = useState('Операция не завершена')
  const [operationProgress, setOperationProgress] = useState<OperationProgress>()
  const abortRef = useRef<AbortController | undefined>(undefined)
  const lastFailedTurnRef = useRef<{ input: string; actionType: ActionType } | undefined>(undefined)
  const [canRetryFailedTurn, setCanRetryFailedTurn] = useState(false)
  const lastEditBackupRef = useRef<Campaign | undefined>(undefined)
  const [canUndoEdit, setCanUndoEdit] = useState(false)
  const [syncState, setSyncState] = useState<'local' | 'syncing' | 'synced' | 'error'>('local')
  const [syncMessage, setSyncMessage] = useState<string>()
  const [lastSyncedAt, setLastSyncedAt] = useState<string>()
  const loadSequenceRef = useRef(0)
  const syncQueueRef = useRef<Promise<unknown>>(Promise.resolve())
  const localMutationQueueRef = useRef<Promise<unknown>>(Promise.resolve())
  const campaignsRef = useRef<Campaign[]>([])
  const ownerId = auth.user?.id || 'guest'

  const queueCloudWrite = useCallback((task: () => Promise<unknown>) => {
    setSyncState('syncing')
    setSyncMessage('Сохраняем изменения в облаке…')
    syncQueueRef.current = syncQueueRef.current.catch(() => undefined).then(task).then(() => {
      setLastSyncedAt(new Date().toISOString())
      setSyncState('synced')
      setSyncMessage('Все изменения сохранены')
    }).catch((cause) => {
      setSyncState('error')
      setSyncMessage(cause instanceof Error ? cause.message : 'Нет связи с облаком. Локальная копия сохранена.')
    })
  }, [])

  const reconcileOwner = useCallback(async (knownLocal?: Campaign[], timeoutMs?: number) => {
    if (!auth.user) return knownLocal ?? getCampaignsForOwner('guest')
    setSyncState('syncing')
    setSyncMessage('Объединяем истории с облаком…')
    await claimGuestCampaigns(auth.user.id)
    const local = knownLocal ?? await getCampaignsForOwner(auth.user.id)
    try {
      const pending = getPendingDeletes(auth.user.id)
      const result = await syncApi.reconcile(local, pending, timeoutMs)
      for (const tombstone of result.tombstones) await deleteStoredCampaign(tombstone.id)
      for (const campaign of result.campaigns) {
        const current = campaignsRef.current.find((item) => item.id === campaign.id)
        await saveCampaign(current && current.updatedAt > campaign.updatedAt ? current : campaign, auth.user.id)
      }
      setPendingDeletes(auth.user.id, [])
      setLastSyncedAt(result.syncedAt)
      setSyncState('synced')
      setSyncMessage('Истории доступны на всех устройствах')
      return getCampaignsForOwner(auth.user.id)
    } catch (cause) {
      setSyncState('error')
      setSyncMessage(cause instanceof Error ? cause.message : 'Облако временно недоступно. Работаем с локальной копией.')
      return local
    }
  }, [auth.user])

  useEffect(() => {
    if (auth.loading) return
    const sequence = ++loadSequenceRef.current
    let hasShownLocalCopy = false
    const showCampaigns = (stored: Campaign[]) => {
      if (sequence !== loadSequenceRef.current || !stored.length) return
      const currentById = new Map((hasShownLocalCopy ? campaignsRef.current : []).map((campaign) => [campaign.id, campaign]))
      for (const campaign of stored) {
        const current = currentById.get(campaign.id)
        if (!current || campaign.updatedAt > current.updatedAt) currentById.set(campaign.id, campaign)
      }
      const merged = [...currentById.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      hasShownLocalCopy = true
      campaignsRef.current = merged
      setCampaigns(merged)
      const preferred = localStorage.getItem(`${ACTIVE_KEY}-${ownerId}`)
      setActiveId(merged.some((campaign) => campaign.id === preferred) ? preferred! : merged[0].id)
    }
    void (async () => {
      setLoading(true)
      try {
        if (auth.user) await claimGuestCampaigns(auth.user.id)
        let stored = await getCampaignsForOwner(ownerId)

        // Open the durable local copy before a potentially large cloud merge.
        // The merge continues in the background and replaces the list only
        // after the complete remote result has been saved locally.
        if (stored.length) {
          showCampaigns(stored)
          if (sequence === loadSequenceRef.current) setLoading(false)
          if (auth.user) {
            void reconcileOwner(stored).then((merged) => {
              if (merged.length) showCampaigns(merged)
            }).catch((cause) => {
              setSyncState('error')
              setSyncMessage(cause instanceof Error ? cause.message : 'Облако временно недоступно. Локальная копия уже открыта.')
            })
          }
          return
        }

        // On a genuinely new device there is no local copy to open. Wait once
        // for the bounded cloud request, then fall back to a usable local world.
        if (auth.user) stored = await reconcileOwner(stored, 12_000)
        if (!stored.length) {
          const demo = createDemoCampaign()
          await saveCampaign(demo, ownerId)
          stored = [demo]
          if (auth.user) queueCloudWrite(() => syncApi.save(demo))
        }
        showCampaigns(stored)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Не удалось открыть локальное хранилище.')
      } finally {
        if (sequence === loadSequenceRef.current) setLoading(false)
      }
    })()
  }, [auth.loading, auth.user, ownerId, queueCloudWrite, reconcileOwner])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  const activeCampaign = campaigns.find((campaign) => campaign.id === activeCampaignId)

  const setActiveCampaignId = useCallback((id: string) => {
    setActiveId(id)
    localStorage.setItem(`${ACTIVE_KEY}-${ownerId}`, id)
  }, [ownerId])

  const setProvider = useCallback((config: ProviderConfig) => {
    setProviderState(config)
    persistProviderConfig(config)
  }, [])

  const setTheme = useCallback((next: Theme) => setThemeState(next), [])

  const replaceCampaign = useCallback((campaign: Campaign) => {
    const next = [campaign, ...campaignsRef.current.filter((item) => item.id !== campaign.id)]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    campaignsRef.current = next
    setCampaigns(next)
  }, [])

  const upsert = useCallback(async (campaign: Campaign) => {
    const saved = await saveCampaign(ensureCampaignIdentity(campaign), ownerId)
    replaceCampaign(saved)
    if (auth.user) queueCloudWrite(async () => {
      const result = await syncApi.save(saved)
      if (result.campaign.updatedAt > saved.updatedAt) {
        const current = campaignsRef.current.find((item) => item.id === saved.id)
        if (!current || result.campaign.updatedAt > current.updatedAt) {
          const remote = await saveCampaign(result.campaign, auth.user!.id)
          replaceCampaign(remote)
        }
      }
    })
    return saved
  }, [auth.user, ownerId, queueCloudWrite, replaceCampaign])

  const syncNow = useCallback(async () => {
    if (!auth.user) return
    const stored = await reconcileOwner()
    campaignsRef.current = stored
    setCampaigns(stored)
    if (!stored.some((campaign) => campaign.id === activeCampaignId) && stored[0]) setActiveCampaignId(stored[0].id)
  }, [activeCampaignId, auth.user, reconcileOwner, setActiveCampaignId])

  const updateActiveCampaign = useCallback(async (updater: (campaign: Campaign) => Campaign) => {
    const campaignId = activeCampaignId
    if (!campaignId) return
    const mutation = localMutationQueueRef.current.catch(() => undefined).then(async () => {
      const current = campaignsRef.current.find((campaign) => campaign.id === campaignId)
      if (!current) return
      const draft = structuredClone(current)
      const updated = updater(draft)
      const next = ensureCampaignIdentity(updated && typeof updated === 'object' && !Array.isArray(updated) ? updated : draft, current.id)
      next.updatedAt = nextCampaignUpdatedAt(current.updatedAt)
      lastEditBackupRef.current = structuredClone(current)
      setCanUndoEdit(true)
      await upsert(next)
    })
    localMutationQueueRef.current = mutation
    await mutation
  }, [activeCampaignId, upsert])

  const sendTurn = useCallback(async (input: string, actionType: ActionType) => {
    if (generating || !input.trim()) return false
    setGenerating(true)
    setErrorTitle('Ход не применён')
    setError(undefined)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      await localMutationQueueRef.current.catch(() => undefined)
      const campaign = campaignsRef.current.find((candidate) => candidate.id === activeCampaignId)
      if (!campaign) return false
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
  }, [activeCampaignId, generating, provider, upsert])

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
    setErrorTitle('Повтор хода не завершён')
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

  const createCampaign = useCallback(async (request: Omit<WorldGenerationRequest, 'provider' | 'noveltyReferences' | 'creativeSeed'>) => {
    setGenerating(true)
    setErrorTitle('Мир не создан')
    setError(undefined)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      setOperationProgress({ percent: 1, stage: 'connecting', detail: 'Передаём замысел архитектору мира' })
      const campaign = await generateCampaign({
        ...request,
        noveltyReferences: buildWorldNoveltyReferences(campaigns),
        provider,
      }, controller.signal, setOperationProgress)
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
  }, [campaigns, provider, setActiveCampaignId, upsert])

  const aiEditCampaign = useCallback(async (instruction: string, eventOptions?: WorkshopEventOptions) => {
    const campaign = campaigns.find((candidate) => candidate.id === activeCampaignId)
    if (!campaign || generating || instruction.trim().length < 3) return undefined
    setGenerating(true)
    setErrorTitle('Изменения не применены')
    setError(undefined)
    setOperationProgress({ percent: 1, stage: 'connecting', detail: 'Передаём корректировку ИИ-редактору' })
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const response = await requestCampaignEdit({ campaign, instruction: instruction.trim(), provider, eventOptions }, controller.signal, setOperationProgress)
      const diagnostics: Parameters<typeof applyPatch>[3] = []
      const next = applyPatch(campaign, response.statePatch, campaign.turn, diagnostics, { advanceStatusClock: false })
      if (response.campaignPatch?.title?.trim()) next.title = response.campaignPatch.title.trim()
      if (response.settingsPatch) {
        const { eventDirector, ...settingsPatch } = response.settingsPatch
        next.settings = {
          ...next.settings,
          ...settingsPatch,
          ...(eventDirector ? {
            eventDirector: normalizeEventDirectorSettings({
              ...next.settings.eventDirector,
              ...eventDirector,
              permissions: {
                ...next.settings.eventDirector?.permissions,
                ...eventDirector.permissions,
              },
            }),
          } : {}),
        }
      }
      next.updatedAt = new Date().toISOString()
      lastEditBackupRef.current = structuredClone(campaign)
      setCanUndoEdit(true)
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

  const undoLastEdit = useCallback(async () => {
    const backup = lastEditBackupRef.current
    if (!backup) return
    const restored = structuredClone(backup)
    restored.updatedAt = new Date().toISOString()
    lastEditBackupRef.current = undefined
    setCanUndoEdit(false)
    await upsert(restored)
  }, [upsert])

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
    if (auth.user) {
      setPendingDeletes(auth.user.id, [...getPendingDeletes(auth.user.id), campaignId])
      queueCloudWrite(async () => {
        await syncApi.remove(campaignId)
        setPendingDeletes(auth.user!.id, getPendingDeletes(auth.user!.id).filter((id) => id !== campaignId))
      })
    }
    const remaining = campaigns.filter((campaign) => campaign.id !== campaignId)
    if (!remaining.length) {
      const demo = createDemoCampaign()
      await saveCampaign(demo, ownerId)
      if (auth.user) queueCloudWrite(() => syncApi.save(demo))
      campaignsRef.current = [demo]
      setCampaigns([demo])
      setActiveCampaignId(demo.id)
    } else {
      campaignsRef.current = remaining
      setCampaigns(remaining)
      if (activeCampaignId === campaignId) setActiveCampaignId(remaining[0].id)
    }
  }, [activeCampaignId, auth.user, campaigns, ownerId, queueCloudWrite, setActiveCampaignId])

  const importCampaign = useCallback(async (file: File) => {
    setErrorTitle('Импорт не завершён')
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
    campaigns, activeCampaign, activeCampaignId, provider, theme, loading, generating, error, errorTitle, operationProgress, syncState, syncMessage, lastSyncedAt, syncNow,
    setActiveCampaignId, setProvider, setTheme, dismissError: () => setError(undefined), sendTurn, cancelGeneration, retryLastTurn, retryFailedTurn, canRetryFailedTurn, createCampaign, aiEditCampaign,
    updateActiveCampaign, undoLastEdit, canUndoEdit, undoTurn, duplicateCampaign, removeCampaign, importCampaign,
  }), [campaigns, activeCampaign, activeCampaignId, provider, theme, loading, generating, error, errorTitle, operationProgress, syncState, syncMessage, lastSyncedAt, syncNow, canRetryFailedTurn, setActiveCampaignId, setProvider, setTheme, sendTurn, cancelGeneration, retryLastTurn, retryFailedTurn, createCampaign, aiEditCampaign, updateActiveCampaign, undoLastEdit, canUndoEdit, undoTurn, duplicateCampaign, removeCampaign, importCampaign])

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const context = useContext(AppContext)
  if (!context) throw new Error('useApp must be used inside AppProvider')
  return context
}
