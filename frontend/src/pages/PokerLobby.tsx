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

export function PokerLobby() {
  const navigate = useNavigate()
  const [tables, setTables] = useState<TableSummary[]>([])
  const [name, setName] = useState('')
  const [smallBlind, setSmallBlind] = useState(25)
  const [bigBlind, setBigBlind] = useState(50)
  const [maxPlayers, setMaxPlayers] = useState(6)
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
                      {t.seated}/{t.max_players}人 · {PHASE_LABELS[t.phase] ?? t.phase} · SB {t.small_blind}/BB {t.big_blind}
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
