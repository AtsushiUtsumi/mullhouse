const API_BASE = '/api'

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || res.statusText)
  }
  return res.json()
}

import type { AccountSummary, RangeData, RangeListItem, SavedHandRange, SolverResult } from './types'

export async function listRanges(): Promise<RangeListItem[]> {
  return fetchJson('/ranges')
}

export async function saveRange(data: RangeData): Promise<{ path: string; message: string }> {
  return fetchJson('/ranges', { method: 'POST', body: JSON.stringify(data) })
}

export async function loadRange(position: string, board: string, linePath: string): Promise<RangeData> {
  return fetchJson(`/ranges/${position}/${board}/${linePath}`)
}

export async function solveRange(data: RangeData, iterations = 3000): Promise<SolverResult> {
  return fetchJson('/solve', {
    method: 'POST',
    body: JSON.stringify({ data, iterations }),
  })
}

export async function getPositions(): Promise<string[]> {
  return fetchJson('/positions')
}

export async function getActions(): Promise<Record<string, string[]>> {
  return fetchJson('/actions')
}

export async function createAccount(username: string, password: string): Promise<AccountSummary> {
  return fetchJson('/accounts', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

export async function login(username: string, password: string): Promise<AccountSummary> {
  return fetchJson('/accounts/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

export async function getAccount(id: string): Promise<AccountSummary> {
  return fetchJson(`/accounts/${id}`)
}

const ACCOUNT_STORAGE_KEY = 'mullhouse:account'

export function saveAccount(account: AccountSummary): void {
  localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify({ id: account.id, username: account.username }))
}

export function loadAccount(): { id: string; username: string } | null {
  const raw = localStorage.getItem(ACCOUNT_STORAGE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function clearAccount(): void {
  localStorage.removeItem(ACCOUNT_STORAGE_KEY)
}

export async function saveHandRange(
  accountId: string,
  data: Record<string, number>,
): Promise<{ id: string; account_id: string; data: Record<string, number> }> {
  return fetchJson('/hand-ranges', {
    method: 'POST',
    body: JSON.stringify({ account_id: accountId, data }),
  })
}

export async function listHandRanges(accountId: string): Promise<SavedHandRange[]> {
  return fetchJson(`/hand-ranges?account_id=${encodeURIComponent(accountId)}`)
}
