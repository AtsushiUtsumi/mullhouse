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

function parseBlindSchedule(text: string): [number, number][] | undefined {
  const trimmed = text.trim()
  if (!trimmed) return undefined
  const levels = trimmed
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [sb, bb] = part.split('/').map((n) => Number(n.trim()))
      return [sb, bb] as [number, number]
    })
    .filter(([sb, bb]) => Number.isFinite(sb) && Number.isFinite(bb))
  return levels.length > 0 ? levels : undefined
}

function parseAnteSchedule(text: string): number[] | undefined {
  const trimmed = text.trim()
  if (!trimmed) return undefined
  const levels = trimmed
    .split(',')
    .map((n) => Number(n.trim()))
    .filter((n) => Number.isFinite(n))
  return levels.length > 0 ? levels : undefined
}

export function PokerLobby() {
  const navigate = useNavigate()
  const [tables, setTables] = useState<TableSummary[]>([])
  const [name, setName] = useState('')
  const [smallBlind, setSmallBlind] = useState(25)
  const [bigBlind, setBigBlind] = useState(50)
  const [maxPlayers, setMaxPlayers] = useState(6)
  const [rakePercent, setRakePercent] = useState(0)
  const [rakeCap, setRakeCap] = useState<number | ''>('')
  const [rakeMinPot, setRakeMinPot] = useState<number | ''>('')
  const [blindSchedule, setBlindSchedule] = useState('')
  const [anteSchedule, setAnteSchedule] = useState('')
  const [levelUpInterval, setLevelUpInterval] = useState<number | ''>('')
  const [requireFullTable, setRequireFullTable] = useState(false)
  const [initialChips, setInitialChips] = useState<number | ''>('')
  const [allowRebuy, setAllowRebuy] = useState(true)
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
        small_blind: smallBlind,
        big_blind: bigBlind,
        max_players: maxPlayers,
        rake_percent: rakePercent > 0 ? rakePercent / 100 : undefined,
        rake_cap: rakeCap === '' ? undefined : rakeCap,
        rake_min_pot: rakeMinPot === '' ? undefined : rakeMinPot,
        blind_schedule: parseBlindSchedule(blindSchedule),
        ante_schedule: parseAnteSchedule(anteSchedule),
        level_up_interval_minutes: levelUpInterval === '' ? undefined : levelUpInterval,
        require_full_table: requireFullTable,
        initial_chips: initialChips === '' ? undefined : initialChips,
        allow_rebuy: allowRebuy,
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
              スモールブラインド
              <input
                type="number"
                value={smallBlind}
                onChange={(e) => setSmallBlind(Number(e.target.value))}
              />
            </label>
            <label>
              ビッグブラインド
              <input
                type="number"
                value={bigBlind}
                onChange={(e) => setBigBlind(Number(e.target.value))}
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
              ブラインドスケジュール(任意)
              <input
                value={blindSchedule}
                onChange={(e) => setBlindSchedule(e.target.value)}
                placeholder="例: 25/50,50/100,100/200"
              />
            </label>
            <label>
              アンティスケジュール(任意)
              <input
                value={anteSchedule}
                onChange={(e) => setAnteSchedule(e.target.value)}
                placeholder="例: 0,25,50"
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
