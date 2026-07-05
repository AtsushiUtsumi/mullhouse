export const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'] as const
export const SUITS = ['s', 'h', 'd', 'c'] as const
export const SUIT_SYMBOLS: Record<string, string> = { s: '♠', h: '♥', d: '♦', c: '♣' }

export const FREQ_LEVELS = [0, 0.25, 0.5, 0.75, 1.0]

export function getHandLabel(row: number, col: number): string {
  const r1 = RANKS[row]
  const r2 = RANKS[col]
  if (row === col) return `${r1}${r2}`
  if (row < col) return `${r1}${r2}s`
  return `${r2}${r1}o`
}

export function lineToFilename(line: string[]): string {
  return line.join('_') + '.json'
}

export function parseBoard(board: string): string[] {
  const cards: string[] = []
  for (let i = 0; i < board.length; i += 2) {
    cards.push(board.slice(i, i + 2))
  }
  return cards
}

export function formatBoardDisplay(board: string): string {
  return parseBoard(board)
    .map((c) => {
      const rank = c[0]
      const suit = c[1]?.toLowerCase()
      return `${rank}${SUIT_SYMBOLS[suit] ?? suit}`
    })
    .join(' ')
}

const STREET_CARD_COUNT: Record<string, number> = {
  preflop: 0,
  flop: 3,
  turn: 4,
  river: 5,
}

export function cardsForStreet(board: string, street: string): string[] {
  const count = STREET_CARD_COUNT[street] ?? 0
  return parseBoard(board).slice(0, count)
}

export function validateBoard(board: string): boolean {
  if (board.length !== 10) return false
  const cardRe = /^[2-9TJQKA][cdhs]$/i
  for (let i = 0; i < 10; i += 2) {
    if (!cardRe.test(board.slice(i, i + 2))) return false
  }
  const cards = parseBoard(board)
  return new Set(cards.map((c) => c.toLowerCase())).size === 5
}

export function carryForwardRange(range: Record<string, number>): Record<string, number> {
  const next: Record<string, number> = {}
  for (const [hand, freq] of Object.entries(range)) {
    if (freq > 0) next[hand] = freq
  }
  return next
}

export function nextFreq(current: number): number {
  const idx = FREQ_LEVELS.indexOf(current)
  if (idx === -1 || idx === FREQ_LEVELS.length - 1) return 0
  return FREQ_LEVELS[idx + 1]
}

export function toggleFreq(current: number): number {
  return current > 0 ? 0 : 1
}

export function freqColor(freq: number, baseHue: number): string {
  if (freq <= 0) return 'transparent'
  const alpha = 0.25 + freq * 0.65
  return `hsla(${baseHue}, 70%, 45%, ${alpha})`
}

export const POSITIONS = ['BTN_vs_BB', 'CO_vs_BB', 'SB_vs_BB', 'HJ_vs_BB', 'UTG_vs_BB']

interface SampleRange {
  hero: Record<string, number>
  villain: Record<string, number>
}

// Heroのオープンポジションごとのサンプルレンジ（Villainは常にBBディフェンス想定）。
// ポジションが後ろになるほどオープン/ディフェンスともにレンジが広がる。
export const SAMPLE_RANGES_BY_POSITION: Record<string, SampleRange> = {
  UTG_vs_BB: {
    hero: {
      AA: 1, KK: 1, QQ: 1, JJ: 1, TT: 1, '99': 0.75,
      AKs: 1, AQs: 1, AJs: 0.75, KQs: 0.75,
      AKo: 1, AQo: 0.5,
    },
    villain: {
      QQ: 0.5, JJ: 0.75, TT: 1, '99': 1, '88': 1,
      AQs: 1, AJs: 1, KQs: 1,
      ATo: 0.5, KQo: 0.75,
    },
  },
  HJ_vs_BB: {
    hero: {
      AA: 1, KK: 1, QQ: 1, JJ: 1, TT: 1, '99': 1, '88': 1,
      AKs: 1, AQs: 1, AJs: 1, ATs: 1, KQs: 1, KJs: 0.75, QJs: 0.5,
      AKo: 1, AQo: 0.75, AJo: 0.5, KQo: 0.5,
    },
    villain: {
      QQ: 0.5, JJ: 0.75, TT: 1, '99': 1, '88': 1, '77': 1,
      AQs: 1, AJs: 1, ATs: 1, KQs: 1, KTs: 0.75,
      ATo: 0.75, KQo: 1, JTo: 0.5,
    },
  },
  CO_vs_BB: {
    hero: {
      AA: 1, KK: 1, QQ: 1, JJ: 1, TT: 1, '99': 1, '88': 1, '77': 1, '66': 0.75,
      AKs: 1, AQs: 1, AJs: 1, ATs: 1, A9s: 1, A8s: 0.75,
      KQs: 1, KJs: 1, KTs: 1, QJs: 1, QTs: 1, JTs: 1, T9s: 0.5,
      AKo: 1, AQo: 1, AJo: 0.75, KQo: 1, KJo: 0.5,
    },
    villain: {
      QQ: 0.5, JJ: 0.75, TT: 1, '99': 1, '88': 1, '77': 1, '66': 1,
      AQs: 1, AJs: 1, ATs: 1, A8s: 1, KQs: 1, KTs: 1, Q9s: 0.5, J9s: 0.5, T9s: 0.5,
      ATo: 1, KQo: 1, KJo: 0.75, QJo: 0.5,
    },
  },
  SB_vs_BB: {
    hero: {
      AA: 1, KK: 1, QQ: 1, JJ: 1, TT: 1, '99': 1, '88': 1, '77': 1, '66': 1, '55': 1, '44': 0.75, '33': 0.5, '22': 0.5,
      AKs: 1, AQs: 1, AJs: 1, ATs: 1, A9s: 1, A8s: 1, A7s: 0.75, A5s: 0.75, A4s: 0.5,
      KQs: 1, KJs: 1, KTs: 1, K9s: 0.75, QJs: 1, QTs: 1, JTs: 1, T9s: 0.75, '98s': 0.5, '87s': 0.5,
      AKo: 1, AQo: 1, AJo: 1, ATo: 0.75, KQo: 1, KJo: 0.75, QJo: 0.5,
    },
    villain: {
      QQ: 1, JJ: 1, TT: 1, '99': 1, '88': 1, '77': 1, '66': 0.75, '55': 0.5,
      AQs: 1, AJs: 1, ATs: 1, A9s: 0.75, KQs: 1, KJs: 1, KTs: 0.75, QJs: 0.75, JTs: 0.5, T9s: 0.5,
      AQo: 1, AJo: 0.75, KQo: 1, ATo: 0.5, KJo: 0.5,
    },
  },
  BTN_vs_BB: {
    hero: {
      AA: 1, KK: 1, QQ: 1, JJ: 1, TT: 1, '99': 1, '88': 1, '77': 1, '66': 1, '55': 1, '44': 1, '33': 0.75, '22': 0.75,
      AKs: 1, AQs: 1, AJs: 1, ATs: 1, A9s: 1, A8s: 1, A7s: 1, A6s: 0.75, A5s: 1, A4s: 0.75, A3s: 0.5, A2s: 0.5,
      KQs: 1, KJs: 1, KTs: 1, K9s: 1, K8s: 0.5, QJs: 1, QTs: 1, Q9s: 0.75, JTs: 1, J9s: 0.5,
      T9s: 1, '98s': 0.75, '87s': 0.75, '76s': 0.5, '65s': 0.5,
      AKo: 1, AQo: 1, AJo: 1, ATo: 1, A9o: 0.5, KQo: 1, KJo: 1, KTo: 0.5, QJo: 0.75, JTo: 0.5,
    },
    villain: {
      QQ: 1, JJ: 1, TT: 1, '99': 1, '88': 1, '77': 1, '66': 1, '55': 0.75, '44': 0.5,
      AQs: 1, AJs: 1, ATs: 1, A9s: 1, A8s: 0.75, A5s: 0.75,
      KQs: 1, KJs: 1, KTs: 1, K9s: 0.75, QJs: 1, QTs: 0.75, JTs: 0.75, T9s: 0.75, '98s': 0.5,
      AQo: 1, AJo: 1, ATo: 0.75, KQo: 1, KJo: 0.75, QJo: 0.5,
    },
  },
}

export const STREET_ACTIONS: Record<string, string[]> = {
  flop: ['flop_b33', 'flop_b50', 'flop_b75', 'flop_x'],
  turn: ['turn_b33', 'turn_b50', 'turn_b75', 'turn_x'],
  river: ['river_b33', 'river_b50', 'river_b60', 'river_b75', 'river_x'],
}

export function actionLabel(action: string): string {
  const parts = action.split('_')
  const street = parts[0]
  const act = parts[1]
  if (act === 'x') return `${street}: Check`
  const pct = act?.replace('b', '')
  return `${street}: Bet ${pct}%`
}
