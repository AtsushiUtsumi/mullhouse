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

import type { RangeData, RangeListItem, SolverResult } from './types'

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
