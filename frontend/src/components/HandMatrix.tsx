import { Fragment, useEffect, useRef } from 'react'
import { getHandLabel, freqColor, isHandFullyBlocked, toggleFreq, RANKS } from '../utils/hands'

interface HandMatrixProps {
  range: Record<string, number>
  onChange: (hand: string, freq: number) => void
  onSelectHand?: (hand: string) => void
  selectedHand?: string | null
  boardCards?: string[]
  hue?: number
  label?: string
  readOnly?: boolean
  // 指定すると、このレンジに含まれない（頻度0の）ハンドは選択不可になる
  baseRange?: Record<string, number> | null
}

export function HandMatrix({
  range,
  onChange,
  onSelectHand,
  selectedHand,
  boardCards = [],
  hue = 145,
  label,
  readOnly = false,
  baseRange = null,
}: HandMatrixProps) {
  const draggingRef = useRef(false)
  const dragValueRef = useRef(0)
  const visitedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    const stopDragging = () => {
      draggingRef.current = false
      visitedRef.current.clear()
    }
    window.addEventListener('mouseup', stopDragging)
    return () => window.removeEventListener('mouseup', stopDragging)
  }, [])

  const applyToHand = (hand: string, value: number) => {
    if (visitedRef.current.has(hand)) return
    visitedRef.current.add(hand)
    onChange(hand, value)
  }

  const isNotInBase = (hand: string) => baseRange != null && (baseRange[hand] ?? 0) <= 0

  const handleMouseDown = (hand: string) => {
    if (isHandFullyBlocked(hand, boardCards) || isNotInBase(hand)) return
    onSelectHand?.(hand)
    if (readOnly) return
    const current = range[hand] ?? 0
    const value = toggleFreq(current)
    draggingRef.current = true
    dragValueRef.current = value
    applyToHand(hand, value)
  }

  const handleMouseEnter = (hand: string) => {
    if (readOnly || !draggingRef.current) return
    if (isHandFullyBlocked(hand, boardCards) || isNotInBase(hand)) return
    applyToHand(hand, dragValueRef.current)
  }

  const comboCount = Object.values(range).reduce((sum, f) => sum + (f > 0 ? f : 0), 0)

  return (
    <div className="hand-matrix-wrapper">
      {label && <div className="matrix-label">{label}</div>}
      <div className="hand-matrix">
        <div className="matrix-corner" />
        {RANKS.map((r) => (
          <div key={`col-${r}`} className="matrix-header">
            {r}
          </div>
        ))}
        {RANKS.map((_, row) => (
          <Fragment key={`row-${row}`}>
            <div className="matrix-header">
              {RANKS[row]}
            </div>
            {RANKS.map((_, col) => {
              const hand = getHandLabel(row, col)
              const freq = range[hand] ?? 0
              const isPair = row === col
              const isSuited = row < col
              const blocked = isHandFullyBlocked(hand, boardCards)
              const notInBase = !blocked && isNotInBase(hand)
              const disabled = blocked || notInBase
              const title = blocked
                ? `${hand}: ボードのカードと重複するため選択不可`
                : notInBase
                  ? `${hand}: ベースレンジに含まれないため選択不可`
                  : `${hand}: ${freq > 0 ? `${Math.round(freq * 100)}%` : '未選択'}`
              return (
                <button
                  key={hand}
                  type="button"
                  disabled={disabled}
                  className={`matrix-cell ${isPair ? 'pair' : isSuited ? 'suited' : 'offsuit'} ${freq > 0 ? 'active' : ''} ${selectedHand === hand ? 'selected' : ''} ${blocked ? 'blocked' : ''} ${notInBase ? 'not-in-base' : ''}`}
                  style={{ backgroundColor: disabled ? undefined : freqColor(freq, hue) }}
                  onMouseDown={() => handleMouseDown(hand)}
                  onMouseEnter={() => handleMouseEnter(hand)}
                  onDragStart={(e) => e.preventDefault()}
                  title={title}
                >
                  <span className="cell-hand">{hand}</span>
                  {freq > 0 && freq < 1 && <span className="cell-freq">{Math.round(freq * 100)}</span>}
                </button>
              )
            })}
          </Fragment>
        ))}
      </div>
      <div className="matrix-stats">選択コンボ: {comboCount.toFixed(1)}</div>
    </div>
  )
}
