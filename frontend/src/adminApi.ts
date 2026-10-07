import type { AdminAccountSummary, AdminLogEntry } from './types'
import type { TableSummary } from './pokerTypes'

const API_BASE = '/api/admin'
const TOKEN_KEY = 'mullhouse:admin_token'

export function loadAdminToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function saveAdminToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearAdminToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const token = loadAdminToken()
  const res = await fetch(`${API_BASE}${url}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...options,
  })
  if (res.status === 401 || res.status === 403) {
    clearAdminToken()
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || res.statusText)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

export async function adminLogin(username: string, password: string): Promise<{ token: string; username: string }> {
  const res = await fetch(`${API_BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || res.statusText)
  }
  return res.json()
}

export async function adminLogout(): Promise<void> {
  try {
    await fetchJson('/logout', { method: 'POST' })
  } finally {
    clearAdminToken()
  }
}

export async function listAdminAccounts(): Promise<AdminAccountSummary[]> {
  return fetchJson('/accounts')
}

export async function freezeAccount(
  accountId: string,
  frozen: boolean,
  reason = '',
): Promise<AdminAccountSummary> {
  return fetchJson(`/accounts/${accountId}/freeze`, {
    method: 'POST',
    body: JSON.stringify({ frozen, reason }),
  })
}

export async function deleteAdminAccount(accountId: string, reason = ''): Promise<void> {
  return fetchJson(`/accounts/${accountId}`, {
    method: 'DELETE',
    body: JSON.stringify({ reason }),
  })
}

export async function adjustCoins(accountId: string, delta: number, reason = ''): Promise<AdminAccountSummary> {
  return fetchJson(`/accounts/${accountId}/coins`, {
    method: 'POST',
    body: JSON.stringify({ delta, reason }),
  })
}

export async function listAdminTables(): Promise<TableSummary[]> {
  return fetchJson('/tables')
}

export async function forceEndTable(tableId: string, reason = ''): Promise<void> {
  await fetchJson(`/tables/${tableId}/force-end`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  })
}

export async function listAdminLogs(limit = 200): Promise<AdminLogEntry[]> {
  return fetchJson(`/logs?limit=${limit}`)
}
