import type { PersistentProviderConfig, ProviderConfig, ProviderKind } from '../../shared/types'

const SETTINGS_KEY = 'letopis-provider-settings'
const API_KEY = 'letopis-api-key'

export const providerDefaults: Record<ProviderKind, PersistentProviderConfig> = {
  demo: { provider: 'demo', model: 'Живой демо-рассказчик', baseUrl: '', temperature: 0.85 },
  openai: { provider: 'openai', model: 'gpt-4.1-mini', baseUrl: 'https://api.openai.com/v1', temperature: 0.85 },
  openrouter: { provider: 'openrouter', model: 'anthropic/claude-sonnet-4', baseUrl: 'https://openrouter.ai/api/v1', temperature: 0.85 },
  ollama: {
    provider: 'ollama',
    model: 'deepseek-v4-flash:cloud',
    baseUrl: 'https://ollama.com/v1',
    temperature: 0.85,
    useAuxiliaryModel: true,
    auxiliaryModel: 'gpt-oss:20b',
  },
  custom: { provider: 'custom', model: '', baseUrl: '', temperature: 0.85 },
}

export function loadProviderConfig(): ProviderConfig {
  try {
    const persistent = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null') as PersistentProviderConfig | null
    const base = persistent?.provider
      ? { ...providerDefaults[persistent.provider], ...persistent }
      : providerDefaults.demo
    return { ...base, apiKey: sessionStorage.getItem(API_KEY) || undefined }
  } catch {
    return { ...providerDefaults.demo }
  }
}

export function persistProviderConfig(config: ProviderConfig) {
  const { apiKey, ...persistent } = config
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(persistent))
  if (apiKey) sessionStorage.setItem(API_KEY, apiKey)
  else sessionStorage.removeItem(API_KEY)
}

export function switchProvider(current: ProviderConfig, provider: ProviderKind): ProviderConfig {
  return {
    ...providerDefaults[provider],
    apiKey: provider === current.provider ? current.apiKey : undefined,
  }
}
