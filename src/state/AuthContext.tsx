/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { authApi, type AccountUser } from '../lib/auth-api'

interface AuthContextValue {
  user: AccountUser | null
  sessionId: string | null
  loading: boolean
  googleAvailable: boolean
  needsAdminBootstrap: boolean
  login: (email: string, password: string) => Promise<void>
  register: (displayName: string, email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  logoutAll: () => Promise<void>
  refresh: () => Promise<void>
  updateProfile: (displayName: string) => Promise<void>
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>
  bootstrapAdmin: (token: string) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AccountUser | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [googleAvailable, setGoogleAvailable] = useState(false)
  const [needsAdminBootstrap, setNeedsAdminBootstrap] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const result = await authApi.me()
      setUser(result.user)
      setSessionId(result.sessionId)
      setGoogleAvailable(result.googleAvailable)
      setNeedsAdminBootstrap(result.needsAdminBootstrap)
    } catch {
      setUser(null)
      setSessionId(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const login = useCallback(async (email: string, password: string) => {
    const result = await authApi.login({ email, password })
    setUser(result.user)
    await refresh()
  }, [refresh])

  const register = useCallback(async (displayName: string, email: string, password: string) => {
    const result = await authApi.register({ displayName, email, password })
    setUser(result.user)
    await refresh()
  }, [refresh])

  const logout = useCallback(async () => {
    await authApi.logout()
    setUser(null)
    setSessionId(null)
    await refresh()
  }, [refresh])

  const logoutAll = useCallback(async () => {
    await authApi.logoutAll()
    setUser(null)
    setSessionId(null)
    await refresh()
  }, [refresh])

  const updateProfile = useCallback(async (displayName: string) => {
    const result = await authApi.updateProfile(displayName)
    setUser(result.user)
  }, [])

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    await authApi.changePassword(currentPassword, newPassword)
    await refresh()
  }, [refresh])

  const bootstrapAdmin = useCallback(async (token: string) => {
    const result = await authApi.bootstrapAdmin(token)
    setUser(result.user)
    setNeedsAdminBootstrap(false)
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    user, sessionId, loading, googleAvailable, needsAdminBootstrap,
    login, register, logout, logoutAll, refresh, updateProfile, changePassword, bootstrapAdmin,
  }), [user, sessionId, loading, googleAvailable, needsAdminBootstrap, login, register, logout, logoutAll, refresh, updateProfile, changePassword, bootstrapAdmin])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
