import { Fragment } from 'react'
import { SUITS, SUIT_SYMBOLS, comboBlockedByBoard, comboKey, freqColor, isValidCombo, toggleFreq } from '../utils/hands'

interface SuitComboEditorProps {
  hand: string | null
  comboRange: Record<string, number>
  onChange: (combo: string, freq: number) => void
  boardCards?: string[]
  hue?: number
  // 指定すると、このレンジに含まれない（頻度0の）コンボは選択不可になる
  baseComboRange?: Record<string, number> | null
}

export function SuitComboEditor({
  hand,
  comboRange,
  onChange,
  boardCards = [],
  hue = 145,
  baseComboRange = null,
}: SuitComboEditorProps) {
  const r1 = hand ? hand[0] : null
  const r2 = hand ? hand[1] : null

  return (
    <div className="suit-combo-editor">
      <div className="suit-combo-header">
        <span className="suit-combo-title">{hand ? `${hand} のコンボ` : 'コンボ選択'}</span>
      </div>
      <div className="suit-combo-grid">
        <div className="suit-combo-corner" />
        {SUITS.map((s) => (
          <div key={`col-${s}`} className={`suit-combo-axis suit-${s}`}>
            {r2 ?? ''}
            {SUIT_SYMBOLS[s]}
          </div>
        ))}
        {SUITS.map((s1) => (
          <Fragment key={`row-${s1}`}>
            <div className={`suit-combo-axis suit-${s1}`}>
              {r1 ?? ''}
              {SUIT_SYMBOLS[s1]}
            </div>
            {SUITS.map((s2) => {
              if (!hand || !isValidCombo(hand, s1, s2)) {
                return <div key={`${s1}-${s2}`} className="suit-combo-cell disabled" />
              }
              const combo = comboKey(hand, s1, s2)
              const blocked = comboBlockedByBoard(combo, boardCards)
              if (blocked) {
                return (
                  <div
                    key={`${s1}-${s2}`}
                    className="suit-combo-cell blocked"
                    title={`${combo}: ボードのカードと重複するため選択不可`}
                  >
                    ×
                  </div>
                )
              }
              const notInBase = baseComboRange != null && (baseComboRange[combo] ?? 0) <= 0
              if (notInBase) {
                return (
                  <div
                    key={`${s1}-${s2}`}
                    className="suit-combo-cell not-in-base"
                    title={`${combo}: ベースレンジに含まれないため選択不可`}
                  />
                )
              }
              const freq = comboRange[combo] ?? 0
              return (
                <button
                  key={`${s1}-${s2}`}
                  type="button"
                  className={`suit-combo-cell ${freq > 0 ? 'active' : ''}`}
                  style={{ backgroundColor: freqColor(freq, hue) }}
                  onClick={() => onChange(combo, toggleFreq(freq))}
                  title={`${combo}: ${freq > 0 ? `${Math.round(freq * 100)}%` : '未選択'}`}
                >
                  {freq > 0 && <span className="cell-freq">{Math.round(freq * 100)}</span>}
                </button>
              )
            })}
          </Fragment>
        ))}
      </div>
    </div>
  )
}
