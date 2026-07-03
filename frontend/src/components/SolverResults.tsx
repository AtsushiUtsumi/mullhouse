import type { SolverResult } from '../types'

interface SolverResultsProps {
  result: SolverResult | null
  loading: boolean
  error: string | null
}

function MetricCard({ label, value, unit = '', highlight = false }: {
  label: string
  value: string | number
  unit?: string
  highlight?: boolean
}) {
  return (
    <div className={`metric-card ${highlight ? 'highlight' : ''}`}>
      <div className="metric-label">{label}</div>
      <div className="metric-value">
        {value}
        {unit && <span className="metric-unit">{unit}</span>}
      </div>
    </div>
  )
}

export function SolverResults({ result, loading, error }: SolverResultsProps) {
  if (loading) {
    return (
      <div className="solver-results loading">
        <div className="spinner" />
        <p>ソルバー実行中...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="solver-results error">
        <p>{error}</p>
      </div>
    )
  }

  if (!result) {
    return (
      <div className="solver-results empty">
        <p>レンジを保存して「ソルバー実行」を押すと評価結果が表示されます。</p>
      </div>
    )
  }

  return (
    <div className="solver-results">
      <h3>評価結果</h3>
      <div className="metrics-grid">
        <MetricCard label="Hero EV" value={result.hero_ev} unit="bb" highlight />
        <MetricCard label="Villain EV" value={result.villain_ev} unit="bb" />
        <MetricCard label="ナッツアドバンテージ" value={(result.nut_advantage * 100).toFixed(0)} unit="%" />
        <MetricCard label="レンジアドバンテージ" value={(result.range_advantage * 100).toFixed(0)} unit="%" />
        <MetricCard label="バリュー比率" value={(result.value_ratio * 100).toFixed(0)} unit="%" />
        <MetricCard label="ブラフ比率" value={(result.bluff_ratio * 100).toFixed(0)} unit="%" />
      </div>
      <div className="recommended-action">
        <span className="rec-label">推奨アクション</span>
        <span className="rec-value">{result.recommended_action}</span>
      </div>
      {result.hero_equity !== undefined && (
        <div className="equity-bar">
          <div className="equity-label">Hero Equity: {(result.hero_equity * 100).toFixed(1)}%</div>
          <div className="equity-track">
            <div className="equity-fill hero" style={{ width: `${result.hero_equity * 100}%` }} />
            <div className="equity-fill villain" style={{ width: `${(1 - result.hero_equity) * 100}%` }} />
          </div>
        </div>
      )}
    </div>
  )
}
