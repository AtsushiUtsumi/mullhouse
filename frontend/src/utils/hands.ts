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

export function freqColor(freq: number, baseHue: number): string {
  if (freq <= 0) return 'transparent'
  const alpha = 0.25 + freq * 0.65
  return `hsla(${baseHue}, 70%, 45%, ${alpha})`
}

export const POSITIONS = ['BTN_vs_BB', 'CO_vs_BB', 'SB_vs_BB', 'HJ_vs_BB', 'UTG_vs_BB']

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
