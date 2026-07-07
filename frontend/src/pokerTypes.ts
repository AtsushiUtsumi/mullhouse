export type PokerActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise'

export interface PokerPlayerState {
  player_id: string
  display_name: string
  chips: number
  current_bet: number
  folded: boolean
  is_all_in: boolean
  hole_cards: string[] | null
}

export interface PokerGameState {
  table_id: string
  phase: 'WAITING' | 'PRE_FLOP' | 'FLOP' | 'TURN' | 'RIVER' | 'SHOWDOWN'
  pot: number
  current_bet: number
  community_cards: string[]
  players: PokerPlayerState[]
  current_player_id: string | null
  dealer_id: string
  small_blind: number
  big_blind: number
}

export interface WaitingFor {
  player_id: string
  valid_actions: PokerActionType[]
  timeout_seconds: number
}

export interface PokerEvent {
  type: string
  payload: Record<string, unknown>
}

export interface PokerStatePayload {
  type: 'state'
  state: PokerGameState
  waiting_for: WaitingFor | null
  rebuy_available: boolean
  events: PokerEvent[]
}

export interface TableSummary {
  table_id: string
  name: string
  small_blind: number
  big_blind: number
  max_players: number
  seated: number
  phase: string
  created_at: string
}

export interface JoinResponse extends PokerStatePayload {
  player_id: string
  token: string
  table_id: string
}

export interface PokerCredentials {
  player_id: string
  token: string
}
