import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createTable, listTables } from '../pokerApi'
import type { TableSummary } from '../pokerTypes'

const PHASE_LABELS: Record<string, string> = {
  WAITING: '待機中',
  PRE_FLOP: 'プレフロップ',
  FLOP: 'フロップ',
  TURN: 'ターン',
  RIVER: 'リバー',
  SHOWDOWN: 'ショーダウン',
}

const STATUS_LABELS: Record<string, string> = {
  RECRUITING: '募集中',
  PLAYING: '進行中',
  CLOSED: '終了',
  OTHER: '-',
}

function parseLevelSchedule(text: string): [number, number, number][] {
  const levels = text
    .trim()
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [sb, bb, ante] = part.split('/').map((n) => Number(n.trim()))
      return [sb, bb, ante] as [number, number, number]
    })
    .filter(([sb, bb, ante]) => Number.isFinite(sb) && Number.isFinite(bb) && Number.isFinite(ante))
  if (levels.length === 0) {
    throw new Error('レベルスケジュールの形式が正しくありません(例: 25/50/0 または 25/50/0,50/100/25)')
  }
  return levels
}

export function PokerLobby() {
  const navigate = useNavigate()
  const [tables, setTables] = useState<TableSummary[]>([])
  const [name, setName] = useState('練習用卓')
  const [maxPlayers, setMaxPlayers] = useState(6)
  const [rakePercent, setRakePercent] = useState(0)
  const [rakeCap, setRakeCap] = useState<number | ''>('')
  const [rakeMinPot, setRakeMinPot] = useState<number | ''>('')
  const [levelSchedule, setLevelSchedule] = useState(
    '100/200/50, 140/280/70, 200/400/100, 280/560/140, 390/780/200, 550/1100/280, ' +
      '820/1640/410, 1250/2500/630, 1900/3800/950, 2850/5700/1400, 4300/8600/2200, ' +
      '6500/13000/3200, 9800/19600/4900, 14750/29500/7400, 22150/44300/11000, 30000/60000/15000',
  )
  const [levelUpInterval, setLevelUpInterval] = useState<number | ''>(5)
  const [requireFullTable, setRequireFullTable] = useState(false)
  const [initialChips, setInitialChips] = useState<number | ''>(15000)
  const [allowRebuy, setAllowRebuy] = useState(false)
  const [timeoutSeconds, setTimeoutSeconds] = useState(8)
  const [fillWithCpu, setFillWithCpu] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const refresh = () => {
    listTables().then(setTables).catch(() => {})
  }

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 3000)
    return () => clearInterval(id)
  }, [])

  const handleCreate = async () => {
    setCreating(true)
    setError('')
    try {
      const table = await createTable({
        name: name || undefined,
        max_players: maxPlayers,
        rake_percent: rakePercent > 0 ? rakePercent / 100 : undefined,
        rake_cap: rakeCap === '' ? undefined : rakeCap,
        rake_min_pot: rakeMinPot === '' ? undefined : rakeMinPot,
        level_schedule: parseLevelSchedule(levelSchedule),
        level_up_interval_minutes: levelUpInterval === '' ? undefined : levelUpInterval,
        require_full_table: requireFullTable,
        initial_chips: initialChips === '' ? undefined : initialChips,
        allow_rebuy: allowRebuy,
        timeout_seconds: timeoutSeconds,
        fill_with_cpu: fillWithCpu,
      })
      navigate(`/poker/${table.table_id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <Link to="/" className="home-link">← ホーム</Link>
          <h1>ポーカー対戦</h1>
          <p className="subtitle">卓を作成するか、既存の卓に参加してください</p>
        </div>
        <Link to="/poker/api-docs" className="btn">API仕様を見る</Link>
      </header>

      <main className="app-main">
        <section className="panel">
          <h2>卓を作成</h2>
          <div className="form-grid poker-create-form">
            <label>
              卓名
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="任意" />
            </label>
            <label>
              SB/BB/アンティ
              <input
                value={levelSchedule}
                onChange={(e) => setLevelSchedule(e.target.value)}
                placeholder="例: 25/50/0 (固定) または 25/50/0,50/100/25 (上昇スケジュール)"
              />
            </label>
            <label>
              最大人数
              <input
                type="number"
                min={2}
                max={6}
                value={maxPlayers}
                onChange={(e) => setMaxPlayers(Number(e.target.value))}
              />
            </label>
            <label>
              初期チップ額(任意)
              <input
                type="number"
                min={0}
                value={initialChips}
                onChange={(e) => setInitialChips(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="未設定なら自由なバイイン額"
              />
            </label>
            <label>
              レーキ率(%)
              <input
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={rakePercent}
                onChange={(e) => setRakePercent(Number(e.target.value))}
              />
            </label>
            <label>
              レーキ上限(任意)
              <input
                type="number"
                min={0}
                value={rakeCap}
                onChange={(e) => setRakeCap(e.target.value === '' ? '' : Number(e.target.value))}
              />
            </label>
            <label>
              レーキ対象最低ポット(任意)
              <input
                type="number"
                min={0}
                value={rakeMinPot}
                onChange={(e) => setRakeMinPot(e.target.value === '' ? '' : Number(e.target.value))}
              />
            </label>
            <label>
              レベルアップ間隔(分・任意)
              <input
                type="number"
                min={1}
                value={levelUpInterval}
                onChange={(e) => setLevelUpInterval(e.target.value === '' ? '' : Number(e.target.value))}
              />
            </label>
            <label>
              シンキングタイム(秒)
              <input
                type="number"
                min={1}
                value={timeoutSeconds}
                onChange={(e) => setTimeoutSeconds(Number(e.target.value))}
              />
            </label>
            <label className="poker-checkbox-label">
              <input
                type="checkbox"
                checked={requireFullTable}
                onChange={(e) => setRequireFullTable(e.target.checked)}
              />
              満員になるまでゲームを開始しない
            </label>
            <label className="poker-checkbox-label">
              <input
                type="checkbox"
                checked={allowRebuy}
                onChange={(e) => setAllowRebuy(e.target.checked)}
              />
              リバイを許可する
            </label>
            <label className="poker-checkbox-label">
              <input
                type="checkbox"
                checked={fillWithCpu}
                onChange={(e) => setFillWithCpu(e.target.checked)}
              />
              満員になるまでCPUを追加する
            </label>
          </div>
          <button type="button" className="btn primary" onClick={handleCreate} disabled={creating}>
            {creating ? '作成中...' : '卓を作成'}
          </button>
          {error && <p className="message">{error}</p>}
        </section>

        <section className="panel">
          <h2>卓一覧</h2>
          {tables.length === 0 ? (
            <p className="hint">まだ卓がありません。上のフォームから作成してください。</p>
          ) : (
            <ul className="table-list">
              {tables.map((t) => (
                <li key={t.table_id}>
                  <Link to={`/poker/${t.table_id}`} className="load-btn">
                    <span className="load-pos">{t.name}</span>
                    <span className="load-line">
                      {t.seated}/{t.max_players}人 · {STATUS_LABELS[t.status] ?? t.status} ({PHASE_LABELS[t.phase] ?? t.phase}) ·{' '}
                      SB {t.small_blind}/BB {t.big_blind}
                      {t.ante > 0 && ` · アンティ ${t.ante}`}
                      {t.rake_percent > 0 && ` · レーキ ${(t.rake_percent * 100).toFixed(1)}%`}
                      {t.initial_chips != null && ` · 初期チップ ${t.initial_chips}`}
                      {t.require_full_table && ' · 満員待ち'}
                      {!t.allow_rebuy && ' · リバイ禁止'}
                      {` · シンキングタイム ${t.timeout_seconds}秒`}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  )
}
