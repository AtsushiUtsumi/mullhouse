import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { PlayingCard } from '../components/PlayingCard'
import {
  clearCredentials,
  connectTableSocket,
  fetchTableState,
  joinTable,
  leaveTable,
  loadCredentials,
  rebuyTable,
  saveCredentials,
  submitAction,
} from '../pokerApi'
import type {
  PokerActionType,
  PokerCredentials,
  PokerGameState,
  PokerPlayerState,
  PokerStatePayload,
} from '../pokerTypes'

const RAISE_MULTIPLIERS = [2, 2.5, 3, 4]
const BET_POT_FRACTIONS = [0.2, 0.33, 0.5, 0.75, 1.25]

function clampBetAmount(state: PokerGameState, me: PokerPlayerState, amount: number): number {
  const max = me.current_bet + me.chips
  return Math.min(Math.max(Math.round(amount), state.big_blind), max)
}

/** Rotates the seat list so the viewer's own seat comes first, keeping everyone
 * else in their real table order (so dealer rotation still reads correctly). */
function orderSeatsFromViewer(players: PokerPlayerState[], viewerId: string): PokerPlayerState[] {
  const myIndex = players.findIndex((p) => p.player_id === viewerId)
  if (myIndex === -1) return players
  return players.map((_, i) => players[(myIndex + i) % players.length])
}

/** Position for seat `i` of `total`, arranged clockwise around an oval starting
 * at the bottom (the viewer's own seat), as a percentage of the table's box. */
function seatPosition(i: number, total: number): { left: number; top: number } {
  const angle = ((180 - (i * 360) / total) * Math.PI) / 180
  const rx = 44
  const ry = 40
  return {
    left: 50 + rx * Math.sin(angle),
    top: 50 - ry * Math.cos(angle),
  }
}

const PHASE_LABELS: Record<string, string> = {
  WAITING: '待機中',
  PRE_FLOP: 'プレフロップ',
  FLOP: 'フロップ',
  TURN: 'ターン',
  RIVER: 'リバー',
  SHOWDOWN: 'ショーダウン',
}

function waitingHint(payload: PokerStatePayload): string {
  const seated = payload.state.players.length
  if (payload.require_full_table) {
    return `満員(${seated}/${payload.max_players}人)になると自動開始`
  }
  return `2人以上の参加で自動開始(${seated}/${payload.max_players}人)`
}

const ACTION_LABELS: Record<PokerActionType, string> = {
  fold: 'フォールド',
  check: 'チェック',
  call: 'コール',
  bet: 'ベット',
  raise: 'レイズ',
}

export function PokerTable() {
  const { tableId } = useParams<{ tableId: string }>()
  const navigate = useNavigate()
  const [creds, setCreds] = useState<PokerCredentials | null>(null)
  const [payload, setPayload] = useState<PokerStatePayload | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState('')
  const [betAmount, setBetAmount] = useState<number>(0)
  const [rebuying, setRebuying] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)

  const connect = useCallback(
    (nextCreds: PokerCredentials) => {
      if (!tableId) return
      wsRef.current?.close()
      const ws = connectTableSocket(tableId, nextCreds, setPayload)
      wsRef.current = ws
    },
    [tableId],
  )

  useEffect(() => {
    if (!tableId) return
    const stored = loadCredentials(tableId)
    if (stored) {
      fetchTableState(tableId, stored)
        .then((state) => {
          setCreds(stored)
          setPayload(state)
          connect(stored)
        })
        .catch(() => {
          clearCredentials(tableId)
        })
    }
    return () => {
      wsRef.current?.close()
    }
  }, [tableId, connect])

  useEffect(() => {
    if (!payload) return
    const { phase, big_blind, pot } = payload.state
    if (phase === 'PRE_FLOP') {
      setBetAmount(big_blind * 2)
    } else if (phase === 'FLOP' || phase === 'TURN' || phase === 'RIVER') {
      setBetAmount(Math.max(big_blind, Math.round(pot * 0.1)))
    }
  }, [payload?.state.phase])

  const handleJoin = async () => {
    if (!tableId) return
    setError('')
    try {
      const res = await joinTable(tableId, displayName || 'プレイヤー')
      const nextCreds = { player_id: res.player_id, token: res.token }
      saveCredentials(tableId, nextCreds)
      setCreds(nextCreds)
      setPayload(res)
      connect(nextCreds)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const handleAction = async (action: PokerActionType) => {
    if (!tableId || !creds) return
    setError('')
    try {
      const amount = action === 'bet' || action === 'raise' ? betAmount : undefined
      const res = await submitAction(tableId, creds, action, amount)
      setPayload(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const handleLeave = async () => {
    if (!tableId || !creds) return
    try {
      await leaveTable(tableId, creds)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return
    }
    clearCredentials(tableId)
    wsRef.current?.close()
    navigate('/poker')
  }

  const handleRebuy = async () => {
    if (!tableId || !creds) return
    setRebuying(true)
    setError('')
    try {
      const res = await rebuyTable(tableId, creds)
      setPayload(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRebuying(false)
    }
  }

  const handleGoHome = async () => {
    if (tableId && creds) {
      try {
        await leaveTable(tableId, creds)
      } catch {
        // best-effort: the player may already be gone from the table server-side
      }
      clearCredentials(tableId)
    }
    wsRef.current?.close()
    navigate('/')
  }

  if (!tableId) return null

  if (!creds || !payload) {
    return (
      <div className="app">
        <header className="app-header">
          <div className="header-content">
            <Link to="/poker" className="home-link">← ロビー</Link>
            <h1>卓に参加</h1>
          </div>
        </header>
        <main className="app-main">
          <section className="panel">
            <div className="form-grid">
              <label>
                表示名
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="プレイヤー"
                />
              </label>
            </div>
            <button type="button" className="btn primary" onClick={handleJoin}>
              参加する
            </button>
            {error && <p className="message">{error}</p>}
          </section>
        </main>
      </div>
    )
  }

  const { state, waiting_for: waitingFor, rebuy_available: rebuyAvailable } = payload
  const isMyTurn = waitingFor?.player_id === creds.player_id
  const me = state.players.find((p) => p.player_id === creds.player_id)
  const handInProgress = state.phase !== 'WAITING' && state.phase !== 'SHOWDOWN'
  const isBusted = (me !== undefined && me.chips === 0 && state.phase === 'SHOWDOWN') || me === undefined
  const isTableClosed = state.status === 'CLOSED'
  const isWinner = isTableClosed && !isBusted
  const isGameOver = isBusted || isWinner

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <Link to="/poker" className="home-link">← ロビー</Link>
          <h1>ポーカー対戦</h1>
          <p className="subtitle">
            {PHASE_LABELS[state.phase] ?? state.phase}
            {state.phase === 'WAITING' && ` (${waitingHint(payload)})`} · Lv.{state.blind_level + 1} SB
            {state.small_blind}/BB{state.big_blind}
            {state.ante > 0 && ` · アンティ${state.ante}`}
            {state.rake_percent > 0 && ` · レーキ${(state.rake_percent * 100).toFixed(1)}%`}
          </p>
        </div>
        {!isGameOver && (
          <button type="button" className="btn" onClick={handleLeave} disabled={handInProgress}>
            卓を離れる
          </button>
        )}
      </header>

      <main className="app-main">
        <section className="panel poker-table-panel">
          <div className="poker-table-oval">
            <div className="poker-table-center">
              <div className="poker-pot-row">
                <span className="rec-label">ポット</span>
                <span className="rec-value">{state.pot}</span>
              </div>

              {state.side_pots.length > 1 && (
                <div className="poker-side-pots">
                  {state.side_pots.map((sidePot, i) => (
                    <span key={i}>
                      {i === 0 ? 'メインポット' : `サイドポット${i}`}: {sidePot.amount}
                    </span>
                  ))}
                </div>
              )}

              <div className="board-cards">
                <span className="board-cards-label">コミュニティカード</span>
                <div className="board-cards-row">
                  {state.community_cards.map((card, i) => (
                    <PlayingCard key={`${card}-${i}`} card={card} />
                  ))}
                  {state.community_cards.length === 0 && <span className="hint">-</span>}
                </div>
              </div>
            </div>

            {orderSeatsFromViewer(state.players, creds.player_id).map((p, i) => {
              const { left, top } = seatPosition(i, state.players.length)
              return (
                <div
                  key={p.player_id}
                  className={`poker-seat ${p.player_id === state.current_player_id ? 'active' : ''} ${p.folded ? 'folded' : ''} ${p.player_id === creds.player_id ? 'me' : ''}`}
                  style={{ left: `${left}%`, top: `${top}%` }}
                >
                  <div className="poker-seat-name">
                    {p.display_name}
                    {p.player_id === state.dealer_id && <span className="poker-dealer-badge">D</span>}
                  </div>
                  <div className="poker-seat-chips">チップ: {p.chips}</div>
                  <div className="poker-seat-bet">ベット: {p.current_bet}</div>
                  {p.folded && <div className="poker-seat-status">フォールド</div>}
                  {p.is_all_in && <div className="poker-seat-status">オールイン</div>}
                  <div className="board-cards-row">
                    {p.hole_cards ? (
                      p.hole_cards.map((card, i2) => <PlayingCard key={`${card}-${i2}`} card={card} />)
                    ) : (
                      <>
                        <div className="playing-card back" />
                        <div className="playing-card back" />
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {me && !isGameOver && (
            <div className="poker-action-bar">
              {waitingFor && isMyTurn ? (
                (() => {
                  const betOrRaise = waitingFor.valid_actions.find((a) => a === 'bet' || a === 'raise')
                  const otherActions = waitingFor.valid_actions.filter((a) => a !== 'bet' && a !== 'raise')
                  return (
                    <div className="poker-action-bar-turn">
                      {betOrRaise && (
                        <>
                          <div className="poker-action-row">
                            <input
                              type="number"
                              value={betAmount}
                              min={state.big_blind}
                              onChange={(e) => setBetAmount(Number(e.target.value))}
                            />
                            <button
                              type="button"
                              className="btn"
                              onClick={() => me && setBetAmount(me.current_bet + me.chips)}
                            >
                              オールイン
                            </button>
                          </div>
                          <div className="poker-action-row">
                            {betOrRaise === 'raise' &&
                              RAISE_MULTIPLIERS.map((mult) => (
                                <button
                                  key={mult}
                                  type="button"
                                  className="btn"
                                  onClick={() =>
                                    me && setBetAmount(clampBetAmount(state, me, state.current_bet * mult))
                                  }
                                >
                                  x{mult}
                                </button>
                              ))}
                            {betOrRaise === 'bet' &&
                              BET_POT_FRACTIONS.map((fraction) => (
                                <button
                                  key={fraction}
                                  type="button"
                                  className="btn"
                                  onClick={() =>
                                    me && setBetAmount(clampBetAmount(state, me, state.pot * fraction))
                                  }
                                >
                                  {Math.round(fraction * 100)}%
                                </button>
                              ))}
                          </div>
                        </>
                      )}
                      <div className="poker-action-row">
                        {otherActions.map((action) => (
                          <button
                            key={action}
                            type="button"
                            className={`btn ${action === 'fold' ? '' : 'primary'}`}
                            onClick={() => handleAction(action)}
                          >
                            {ACTION_LABELS[action]}
                          </button>
                        ))}
                        {betOrRaise && (
                          <button type="button" className="btn accent" onClick={() => handleAction(betOrRaise)}>
                            {ACTION_LABELS[betOrRaise]}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })()
              ) : (
                <p className="hint">
                  {handInProgress ? '相手の手番です...' : '次のハンドの開始を待っています...'}
                </p>
              )}
            </div>
          )}

          {!isGameOver && error && <p className="message">{error}</p>}
        </section>
      </main>

      {isGameOver && (
        <div className="poker-busted-overlay">
          <div className="panel poker-busted-dialog">
            {isWinner ? (
              <>
                <h2>あなたの勝利です</h2>
                <p className="hint">対戦相手がいなくなったため卓は終了しました。ホームに戻ってください。</p>
                <div className="poker-action-bar">
                  <button type="button" className="btn primary" onClick={handleGoHome}>
                    ホームに戻る
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2>{isTableClosed ? '対局が終了しました' : 'チップがなくなりました'}</h2>
                <p className="hint">
                  {isTableClosed
                    ? '対戦相手がいなくなったため卓は終了しました。ホームに戻ってください。'
                    : rebuyAvailable
                      ? 'リバイして続けるか、ホームに戻るか選択してください。'
                      : '現在はリバイできません。ハンドの区切りをお待ちいただくか、ホームに戻ってください。'}
                </p>
                <div className="poker-action-bar">
                  <button
                    type="button"
                    className="btn accent"
                    onClick={handleRebuy}
                    disabled={!rebuyAvailable || rebuying}
                  >
                    {rebuying ? 'リバイ中...' : 'リバイ'}
                  </button>
                  <button type="button" className="btn primary" onClick={handleGoHome}>
                    ホームに戻る
                  </button>
                </div>
              </>
            )}
            {error && <p className="message">{error}</p>}
          </div>
        </div>
      )}
    </div>
  )
}
