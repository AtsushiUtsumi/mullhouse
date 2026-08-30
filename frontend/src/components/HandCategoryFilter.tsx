import { HAND_CATEGORY_LABELS } from '../utils/hands'

interface HandCategoryFilterProps {
  boardReady: boolean
  baseHandCount: number | null
  onSelect: (minCategory: number, label: string) => void
}

// ワンペア(1) 〜 ストレートフラッシュ(8) までのボタンを用意する。
// ハイカード(0)は「以上」を選ぶと全ハンドになってしまうため対象外。
const CATEGORY_BUTTONS = HAND_CATEGORY_LABELS.slice(1).map((label, i) => {
  const category = i + 1
  const isTop = category === HAND_CATEGORY_LABELS.length - 1
  return { category, label: isTop ? label : `${label}以上` }
})

export function HandCategoryFilter({ boardReady, baseHandCount, onSelect }: HandCategoryFilterProps) {
  return (
    <div className="hand-category-filter">
      <div className="hand-category-filter-title">役で自動選択</div>
      {!boardReady ? (
        <p className="hint">フロップ以降のボード（3枚以上）を入力すると使用できます。</p>
      ) : (
        <>
          <p className="hint">
            {baseHandCount === null
              ? '対象: 全ハンド（ベース未設定）'
              : `対象: ベースレンジ（${baseHandCount}ハンド）`}
          </p>
          <div className="hand-category-buttons">
            {CATEGORY_BUTTONS.map(({ category, label }) => (
              <button
                key={category}
                type="button"
                className="btn"
                onClick={() => onSelect(category, label)}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="hint">クリックすると、現在のレンジを置き換えてボード上でその役以上になるコンボのみを選択します。</p>
        </>
      )}
    </div>
  )
}
