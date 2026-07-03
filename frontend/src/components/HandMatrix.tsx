import { Fragment } from 'react'
import { getHandLabel, freqColor, nextFreq, RANKS } from '../utils/hands'

interface HandMatrixProps {
  range: Record<string, number>
  onChange: (hand: string, freq: number) => void
  hue?: number
  label?: string
  readOnly?: boolean
}

export function HandMatrix({ range, onChange, hue = 145, label, readOnly = false }: HandMatrixProps) {
  const handleClick = (hand: string) => {
    if (readOnly) return
    const current = range[hand] ?? 0
    onChange(hand, nextFreq(current))
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
              return (
                <button
                  key={hand}
                  type="button"
                  className={`matrix-cell ${isPair ? 'pair' : isSuited ? 'suited' : 'offsuit'} ${freq > 0 ? 'active' : ''}`}
                  style={{ backgroundColor: freqColor(freq, hue) }}
                  onClick={() => handleClick(hand)}
                  title={`${hand}: ${freq > 0 ? `${Math.round(freq * 100)}%` : '未選択'}`}
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
