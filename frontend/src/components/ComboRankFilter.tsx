import { useEffect, useState } from 'react'

interface ComboRankFilterProps {
  boardReady: boolean
  baseComboTotal: number
  onSelect: (topCount: number, bottomCount: number) => void
}

// [0, max] の範囲にクランプする（0は「この側からは選択しない」を意味する）。
function clampCount(value: number, max: number): number {
  if (Number.isNaN(value)) return 0
  return Math.min(Math.max(Math.round(value), 0), Math.max(max, 0))
}

// ベースレンジのコンボを、そのボードでの役の強さでランク付けし、
// 上位N個・下位M個を別々のスライダー/数値入力で指定して、同時に（合わせ技で）選択するフィルター。
export function ComboRankFilter({ boardReady, baseComboTotal, onSelect }: ComboRankFilterProps) {
  const maxCount = Math.max(baseComboTotal, 0)
  const [topCount, setTopCount] = useState(() => Math.min(10, maxCount))
  const [bottomCount, setBottomCount] = useState(0)

  // ベースレンジが変わって最大値が縮んだら、選択数もそれに合わせて丸める
  useEffect(() => {
    setTopCount((prev) => clampCount(prev, maxCount))
    setBottomCount((prev) => clampCount(prev, maxCount))
  }, [maxCount])

  return (
    <div className="combo-rank-filter">
      <div className="combo-rank-filter-title">役の強さで上位/下位選択</div>
      {!boardReady ? (
        <p className="hint">フロップ以降のボード（3枚以上）を入力すると使用できます。</p>
      ) : baseComboTotal === 0 ? (
        <p className="hint">ベースレンジのコンボがありません。</p>
      ) : (
        <>
          <p className="hint">対象: ベースレンジ（{baseComboTotal.toFixed(1)}コンボ）</p>

          <label className="combo-rank-label">上位（強い方から）</label>
          <div className="combo-rank-row">
            <input
              type="range"
              className="combo-rank-slider"
              min={0}
              max={maxCount}
              step={1}
              value={topCount}
              onChange={(e) => setTopCount(clampCount(Number(e.target.value), maxCount))}
            />
            <input
              type="number"
              className="combo-rank-number"
              min={0}
              max={maxCount}
              value={topCount}
              onChange={(e) => setTopCount(clampCount(Number(e.target.value), maxCount))}
            />
          </div>

          <label className="combo-rank-label">下位（弱い方から）</label>
          <div className="combo-rank-row">
            <input
              type="range"
              className="combo-rank-slider"
              min={0}
              max={maxCount}
              step={1}
              value={bottomCount}
              onChange={(e) => setBottomCount(clampCount(Number(e.target.value), maxCount))}
            />
            <input
              type="number"
              className="combo-rank-number"
              min={0}
              max={maxCount}
              value={bottomCount}
              onChange={(e) => setBottomCount(clampCount(Number(e.target.value), maxCount))}
            />
          </div>

          <div className="combo-rank-buttons">
            <button
              type="button"
              className="btn primary"
              onClick={() => onSelect(topCount, bottomCount)}
              disabled={topCount <= 0 && bottomCount <= 0}
            >
              上位{topCount}・下位{bottomCount}コンボを選択
            </button>
          </div>
          <p className="hint">
            クリックすると、現在のレンジを置き換えてボード上での役の強さの上位/下位を合わせて選択します（0の側は選択されません）。
          </p>
        </>
      )}
    </div>
  )
}
