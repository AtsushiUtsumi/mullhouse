import type {
  JoinResponse,
  PokerActionType,
  PokerCredentials,
  PokerStatePayload,
  TableSummary,
} from './pokerTypes'

const API_BASE = '/api/poker'

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

export async function createTable(params: {
  name?: string
  max_players?: number
  rake_percent?: number
  rake_cap?: number
  rake_min_pot?: number
  level_schedule?: [number, number, number][]
  level_up_interval_minutes?: number
  require_full_table?: boolean
  initial_chips?: number
  allow_rebuy?: boolean
  timeout_seconds?: number
}): Promise<TableSummary> {
  return fetchJson('/tables', { method: 'POST', body: JSON.stringify(params) })
}

export async function listTables(): Promise<TableSummary[]> {
  return fetchJson('/tables')
}

export async function getTable(tableId: string): Promise<TableSummary> {
  return fetchJson(`/tables/${tableId}`)
}

export async function joinTable(
  tableId: string,
  displayName: string,
  buyIn = 1000,
): Promise<JoinResponse> {
  return fetchJson(`/tables/${tableId}/join`, {
    method: 'POST',
    body: JSON.stringify({ display_name: displayName, buy_in: buyIn }),
  })
}

export async function leaveTable(tableId: string, creds: PokerCredentials): Promise<void> {
  await fetchJson(`/tables/${tableId}/leave`, { method: 'POST', body: JSON.stringify(creds) })
}

export async function rebuyTable(
  tableId: string,
  creds: PokerCredentials,
  buyIn = 1000,
): Promise<PokerStatePayload> {
  return fetchJson(`/tables/${tableId}/rebuy`, {
    method: 'POST',
    body: JSON.stringify({ ...creds, buy_in: buyIn }),
  })
}

export async function fetchTableState(
  tableId: string,
  creds: PokerCredentials,
): Promise<PokerStatePayload> {
  return fetchJson(`/tables/${tableId}/state?player_id=${creds.player_id}&token=${creds.token}`)
}

export async function submitAction(
  tableId: string,
  creds: PokerCredentials,
  action: PokerActionType,
  amount?: number,
): Promise<PokerStatePayload> {
  return fetchJson(`/tables/${tableId}/action`, {
    method: 'POST',
    body: JSON.stringify({ ...creds, action, amount }),
  })
}

export function connectTableSocket(
  tableId: string,
  creds: PokerCredentials,
  onMessage: (payload: PokerStatePayload) => void,
): WebSocket {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  const url = `${protocol}//${location.host}${API_BASE}/tables/${tableId}/ws?player_id=${creds.player_id}&token=${creds.token}`
  const ws = new WebSocket(url)
  ws.onmessage = (ev) => {
    onMessage(JSON.parse(ev.data))
  }
  return ws
}

export function storageKey(tableId: string): string {
  return `poker:${tableId}`
}

export function loadCredentials(tableId: string): PokerCredentials | null {
  const raw = localStorage.getItem(storageKey(tableId))
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function saveCredentials(tableId: string, creds: PokerCredentials): void {
  localStorage.setItem(storageKey(tableId), JSON.stringify(creds))
}

export function clearCredentials(tableId: string): void {
  localStorage.removeItem(storageKey(tableId))
}
