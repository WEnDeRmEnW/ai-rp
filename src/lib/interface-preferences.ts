export type InterfaceDensity = 'compact' | 'comfortable'
export type ReadingWidth = 'narrow' | 'balanced' | 'wide'
export type ReadingFont = 'literary' | 'modern'
export type InspectorWidth = 'compact' | 'balanced' | 'wide'

export interface InterfacePreferences {
  density: InterfaceDensity
  readingWidth: ReadingWidth
  readingFont: ReadingFont
  inspectorWidth: InspectorWidth
  fontScale: number
  showVitals: boolean
  reducedMotion: boolean
}

export const defaultInterfacePreferences: InterfacePreferences = {
  density: 'comfortable',
  readingWidth: 'balanced',
  readingFont: 'literary',
  inspectorWidth: 'balanced',
  fontScale: 100,
  showVitals: true,
  reducedMotion: false,
}

const STORAGE_KEY = 'letopis-interface-preferences-v1'

export function loadInterfacePreferences(): InterfacePreferences {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<InterfacePreferences>
    return {
      density: stored.density === 'compact' ? 'compact' : 'comfortable',
      readingWidth: ['narrow', 'balanced', 'wide'].includes(stored.readingWidth ?? '') ? stored.readingWidth! : 'balanced',
      readingFont: stored.readingFont === 'modern' ? 'modern' : 'literary',
      inspectorWidth: ['compact', 'balanced', 'wide'].includes(stored.inspectorWidth ?? '') ? stored.inspectorWidth! : 'balanced',
      fontScale: Math.max(90, Math.min(125, Number(stored.fontScale) || 100)),
      showVitals: stored.showVitals !== false,
      reducedMotion: stored.reducedMotion === true,
    }
  } catch {
    return { ...defaultInterfacePreferences }
  }
}

export function saveInterfacePreferences(preferences: InterfacePreferences) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences))
}
