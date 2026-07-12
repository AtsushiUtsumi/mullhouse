export interface RangeData {
  position: string
  board: string
  line: string[]
  hero_range: Record<string, number>
  villain_range: Record<string, number>
}

export interface SolverResult {
  hero_ev: number
  villain_ev: number
  nut_advantage: number
  range_advantage: number
  value_ratio: number
  bluff_ratio: number
  recommended_action: string
  hero_equity?: number
  source?: string
}

export interface RangeListItem {
  position: string
  board: string
  line: string[]
  path: string
  title: string
}

export type PlayerType = 'hero' | 'villain'
export type Street = 'preflop' | 'flop' | 'turn' | 'river'

export interface AccountSummary {
  id: string
  username: string
  coins: number
}

export interface SavedHandRange {
  id: string
  account_id: string
  data: Record<string, number>
  title: string
  created_at: string
}
