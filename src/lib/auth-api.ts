import type { Campaign } from '../../shared/types'

export interface AccountUser {
  id: string
  email: string
  displayName: string
  avatarUrl: string | null
  role: 'user' | 'admin'
  isOwner: boolean
  status: 'active' | 'disabled'
  hasPassword: boolean
  hasGoogle: boolean
}

export interface AccountSession {
  id: string
  createdAt: string
  lastSeenAt: string
  expiresAt: string
  userAgent: string
  ip: string
  current: 0 | 1
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: 'same-origin',
    headers: init?.body ? { 'content-type': 'application/json', ...init.headers } : init?.headers,
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null
    throw new Error(body?.error || `Сервер вернул ошибку ${response.status}.`)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export const authApi = {
  me: () => request<{ user: AccountUser | null; sessionId: string | null; googleAvailable: boolean; needsAdminBootstrap: boolean }>('/api/auth/me'),
  register: (body: { email: string; password: string; displayName: string }) => request<{ user: AccountUser }>('/api/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  login: (body: { email: string; password: string }) => request<{ user: AccountUser }>('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  logout: () => request<void>('/api/auth/logout', { method: 'POST' }),
  logoutAll: () => request<void>('/api/auth/logout-all', { method: 'POST' }),
  updateProfile: (displayName: string) => request<{ user: AccountUser }>('/api/auth/profile', { method: 'PATCH', body: JSON.stringify({ displayName }) }),
  changePassword: (currentPassword: string, newPassword: string) => request<void>('/api/auth/password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }),
  sessions: () => request<{ sessions: AccountSession[] }>('/api/auth/sessions'),
  revokeSession: (id: string) => request<void>(`/api/auth/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  bootstrapAdmin: (token: string) => request<{ user: AccountUser }>('/api/auth/admin-bootstrap', { method: 'POST', body: JSON.stringify({ token }) }),
}

export interface SyncResult {
  campaigns: Campaign[]
  tombstones: Array<{ id: string; deletedAt: string }>
  syncedAt: string
}

export const syncApi = {
  reconcile: (campaigns: Campaign[], deletedIds: string[]) => request<SyncResult>('/api/sync/reconcile', { method: 'POST', body: JSON.stringify({ campaigns, deletedIds }) }),
  save: (campaign: Campaign) => request<{ campaign: Campaign; syncedAt: string }>(`/api/sync/campaigns/${campaign.id}`, { method: 'PUT', body: JSON.stringify(campaign) }),
  remove: (id: string) => request<void>(`/api/sync/campaigns/${id}`, { method: 'DELETE' }),
}

export async function adminRequest<T>(url: string, init?: RequestInit) {
  return request<T>(`/api/admin${url}`, init)
}
