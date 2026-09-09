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

// 13x13マトリクスに現れる169種類のハンドラベルを全て列挙したもの。
export const ALL_HANDS: string[] = (() => {
  const list: string[] = []
  for (let row = 0; row < RANKS.length; row++) {
    for (let col = 0; col < RANKS.length; col++) {
      list.push(getHandLabel(row, col))
    }
  }
  return list
})()

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

// スートコンボ関連 -----------------------------------------------------
// ハンドラベル（例: "AKo", "AKs", "AA"）は上位ランクが先頭に来る（getHandLabel参照）。
// isValidCombo/comboKey/getCombosForHand はその前提で動作する。

export function isValidCombo(hand: string, suit1: string, suit2: string): boolean {
  const r1 = hand[0]
  const r2 = hand[1]
  const type = hand.length >= 3 ? hand[2] : undefined
  if (r1 === r2) {
    const suitOrder: readonly string[] = SUITS
    return suit1 !== suit2 && suitOrder.indexOf(suit1) < suitOrder.indexOf(suit2)
  }
  if (type === 's') return suit1 === suit2
  return suit1 !== suit2
}

export function comboKey(hand: string, suit1: string, suit2: string): string {
  const r1 = hand[0]
  const r2 = hand[1]
  return `${r1}${suit1}${r2}${suit2}`
}

export function getCombosForHand(hand: string): string[] {
  const combos: string[] = []
  for (const s1 of SUITS) {
    for (const s2 of SUITS) {
      if (isValidCombo(hand, s1, s2)) combos.push(comboKey(hand, s1, s2))
    }
  }
  return combos
}

// ボードとの重複判定 -----------------------------------------------------
// ボード入力欄のテキスト（例: "As5dTc"）を正規化済みカード配列（例: ["As","5d","Tc"]、
// ランク大文字・スート小文字）へ変換する。構文が不正、重複カード、6枚超の場合は null。
export function parseBoardCards(board: string): string[] | null {
  if (board.length === 0) return []
  if (board.length % 2 !== 0) return null
  const cardRe = /^[2-9TJQKA][cdhs]$/i
  const cards: string[] = []
  for (let i = 0; i < board.length; i += 2) {
    const token = board.slice(i, i + 2)
    if (!cardRe.test(token)) return null
    cards.push(`${token[0].toUpperCase()}${token[1].toLowerCase()}`)
  }
  if (cards.length > 5) return null
  if (new Set(cards).size !== cards.length) return null
  return cards
}

// コンボ（例: "AsKh"）がボードのいずれかのカードと重複しているか。
export function comboBlockedByBoard(combo: string, boardCards: string[]): boolean {
  if (boardCards.length === 0) return false
  const card1 = combo.slice(0, 2)
  const card2 = combo.slice(2, 4)
  return boardCards.includes(card1) || boardCards.includes(card2)
}

// ハンドの全コンボがボードと重複していて、1つも選択できない状態か。
export function isHandFullyBlocked(hand: string, boardCards: string[]): boolean {
  if (boardCards.length === 0) return false
  const combos = getCombosForHand(hand)
  return combos.every((c) => comboBlockedByBoard(c, boardCards))
}

// 役判定 -----------------------------------------------------------------
// backend/hand_eval.py の分類（0=ハイカード 〜 8=ストレートフラッシュ）と揃えている。

export const HAND_CATEGORY_LABELS = [
  'ハイカード',
  'ワンペア',
  'ツーペア',
  'スリーカード',
  'ストレート',
  'フラッシュ',
  'フルハウス',
  'フォーカード',
  'ストレートフラッシュ',
] as const

const RANK_VALUE: Record<string, number> = {
  '2': 0, '3': 1, '4': 2, '5': 3, '6': 4, '7': 5, '8': 6,
  '9': 7, T: 8, J: 9, Q: 10, K: 11, A: 12,
}

function cardRankValue(card: string): number {
  return RANK_VALUE[card[0].toUpperCase()]
}

function cardSuitChar(card: string): string {
  return card[1].toLowerCase()
}

function combinations5(cards: string[]): string[][] {
  const result: string[][] = []
  const combo: string[] = []
  const helper = (start: number) => {
    if (combo.length === 5) {
      result.push([...combo])
      return
    }
    for (let i = start; i < cards.length; i++) {
      combo.push(cards[i])
      helper(i + 1)
      combo.pop()
    }
  }
  helper(0)
  return result
}

type HandScore = [category: number, tiebreakers: number[]]

function compareScores(a: HandScore, b: HandScore): number {
  if (a[0] !== b[0]) return a[0] - b[0]
  for (let i = 0; i < a[1].length; i++) {
    if (a[1][i] !== b[1][i]) return a[1][i] - b[1][i]
  }
  return 0
}

function evaluateFive(cards: string[]): HandScore {
  const ranks = cards.map(cardRankValue).sort((a, b) => b - a)
  const suits = cards.map(cardSuitChar)
  const isFlush = new Set(suits).size === 1

  const uniqueRanks = Array.from(new Set(ranks)).sort((a, b) => b - a)
  const rankCounts = new Map<number, number>()
  for (const r of ranks) rankCounts.set(r, (rankCounts.get(r) ?? 0) + 1)
  const countsSorted = Array.from(rankCounts.entries()).sort((a, b) => b[1] - a[1] || b[0] - a[0])

  let isStraight = false
  let straightHigh = ranks[0]
  if (uniqueRanks.length === 5) {
    if (uniqueRanks[0] - uniqueRanks[4] === 4) {
      isStraight = true
      straightHigh = uniqueRanks[0]
    } else if (uniqueRanks[0] === 12 && uniqueRanks[1] === 3 && uniqueRanks[4] === 0) {
      // A-5 の特殊ストレート（ホイール）
      isStraight = true
      straightHigh = 3
    }
  }

  if (isStraight && isFlush) return [8, [straightHigh]]
  if (countsSorted[0][1] === 4) {
    const quad = countsSorted[0][0]
    const kicker = countsSorted[1][0]
    return [7, [quad, kicker]]
  }
  if (countsSorted[0][1] === 3 && countsSorted[1][1] === 2) {
    return [6, [countsSorted[0][0], countsSorted[1][0]]]
  }
  if (isFlush) return [5, ranks]
  if (isStraight) return [4, [straightHigh]]
  if (countsSorted[0][1] === 3) {
    const kickers = ranks.filter((r) => r !== countsSorted[0][0]).slice(0, 2)
    return [3, [countsSorted[0][0], ...kickers]]
  }
  if (countsSorted[0][1] === 2 && countsSorted[1][1] === 2) {
    const [highPair, lowPair] = [countsSorted[0][0], countsSorted[1][0]].sort((a, b) => b - a)
    const kicker = ranks.find((r) => r !== highPair && r !== lowPair)!
    return [2, [highPair, lowPair, kicker]]
  }
  if (countsSorted[0][1] === 2) {
    const pair = countsSorted[0][0]
    const kickers = ranks.filter((r) => r !== pair)
    return [1, [pair, ...kickers]]
  }
  return [0, ranks]
}

// hole(2枚) + board(3〜5枚) から最も強い5枚の役を求める。board が3枚未満の場合は評価できない。
export function evaluateBestHand(hole: [string, string], board: string[]): HandScore {
  const allCards = [...hole, ...board]
  let best: HandScore | null = null
  for (const combo of combinations5(allCards)) {
    const score = evaluateFive(combo)
    if (best === null || compareScores(score, best) > 0) best = score
  }
  return best!
}

export interface RangeSnapshot {
  range: Record<string, number>
  comboRange: Record<string, number>
}

interface BaseComboEntry {
  hand: string
  combo: string
  freq: number
  // そのハンドが持つ「ボードと重複しない全コンボ数」（baseでの頻度に関わらず一定）。
  // 役フィルター/上位・下位フィルターで、ハンド単位の頻度を平均する際の分母に使う。
  totalCombosForHand: number
}

// base（未指定なら全169ハンド）のうち、ボードと重複せず頻度が0より大きいコンボを列挙する。
function collectBaseComboEntries(base: RangeSnapshot | null, boardCards: string[]): BaseComboEntry[] {
  const hands = base ? Object.keys(base.range) : ALL_HANDS
  const entries: BaseComboEntry[] = []
  for (const hand of hands) {
    const handBaseFreq = base ? base.range[hand] ?? 0 : 1
    if (handBaseFreq <= 0) continue
    const combos = getCombosForHand(hand).filter((c) => !comboBlockedByBoard(c, boardCards))
    if (combos.length === 0) continue
    for (const combo of combos) {
      const comboBaseFreq = base ? base.comboRange[combo] ?? handBaseFreq : 1
      if (comboBaseFreq <= 0) continue
      entries.push({ hand, combo, freq: comboBaseFreq, totalCombosForHand: combos.length })
    }
  }
  return entries
}

// 選択されたコンボ群から、ハンド単位のレンジ（totalCombosForHandを分母にした平均頻度）を組み立てる。
function buildRangeFromSelection(
  selected: { hand: string; combo: string; freq: number; totalCombosForHand: number }[]
): RangeSnapshot {
  const range: Record<string, number> = {}
  const comboRange: Record<string, number> = {}
  const handSums = new Map<string, { sum: number; total: number }>()
  for (const { hand, combo, freq, totalCombosForHand } of selected) {
    comboRange[combo] = freq
    const entry = handSums.get(hand) ?? { sum: 0, total: totalCombosForHand }
    entry.sum += freq
    handSums.set(hand, entry)
  }
  for (const [hand, { sum, total }] of handSums) {
    if (sum > 0) range[hand] = sum / total
  }
  return { range, comboRange }
}

// ボード（3枚以上）に対して、指定カテゴリ以上の役になるコンボのみを含むレンジを組み立てる。
// base を指定すると、その範囲内（ベースレンジ）のハンド/コンボだけを対象に絞り込む
// （ベース内での頻度も維持する）。base が null の場合は全169ハンドが対象になる。
// 結果は既存の選択内容を置き換える形で使う想定。
export function filterRangeByCategory(
  base: RangeSnapshot | null,
  boardCards: string[],
  minCategory: number
): RangeSnapshot {
  if (boardCards.length < 3) return { range: {}, comboRange: {} }

  const selected = collectBaseComboEntries(base, boardCards).filter((entry) => {
    const hole: [string, string] = [entry.combo.slice(0, 2), entry.combo.slice(2, 4)]
    const [category] = evaluateBestHand(hole, boardCards)
    return category >= minCategory
  })
  return buildRangeFromSelection(selected)
}

// ボード（3枚以上）に対して、base（未指定なら全169ハンド）のコンボを役の強さでランク付けし、
// 上位topCount個と下位bottomCount個の両方（合わせ技）を選択したレンジを組み立てる。
// 例: topCount=10, bottomCount=5 なら、最も強い10コンボと最も弱い5コンボを選択する。
// 重なった場合（topCount+bottomCount がコンボ総数を超える等）は重複なく1回だけ選択される。
export function filterRangeByComboRank(
  base: RangeSnapshot | null,
  boardCards: string[],
  topCount: number,
  bottomCount: number
): RangeSnapshot {
  if (boardCards.length < 3) return { range: {}, comboRange: {} }
  if (topCount <= 0 && bottomCount <= 0) return { range: {}, comboRange: {} }

  const entries = collectBaseComboEntries(base, boardCards)
  if (entries.length === 0) return { range: {}, comboRange: {} }

  const scored = entries
    .map((entry) => ({
      ...entry,
      score: evaluateBestHand([entry.combo.slice(0, 2), entry.combo.slice(2, 4)], boardCards),
    }))
    .sort((a, b) => compareScores(b.score, a.score)) // 強い順（先頭が最強）

  const topN = Math.min(Math.max(topCount, 0), scored.length)
  const bottomN = Math.min(Math.max(bottomCount, 0), scored.length)
  const selectedByCombo = new Map<string, (typeof scored)[number]>()
  for (const entry of scored.slice(0, topN)) selectedByCombo.set(entry.combo, entry)
  for (const entry of scored.slice(scored.length - bottomN)) selectedByCombo.set(entry.combo, entry)

  return buildRangeFromSelection(Array.from(selectedByCombo.values()))
}

// base（未指定なら全169ハンド）のうち、ボードと重複せず頻度が0より大きいコンボの総数。
// 上位・下位フィルターのスライダーの最大値として使う。
export function countBaseCombos(base: RangeSnapshot | null, boardCards: string[]): number {
  if (boardCards.length < 3) return 0
  return collectBaseComboEntries(base, boardCards).length
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
