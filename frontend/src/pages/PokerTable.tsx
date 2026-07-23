import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { loadAccount } from '../api'
import { PlayingCard } from '../components/PlayingCard'
import {
  clearCredentials,
  connectTableSocket,
  fetchTableState,
  getTable,
  joinTable,
  leaveTable,
  loadCredentials,
  rebuyTable,
  saveCredentials,
  submitAction,
} from '../pokerApi'
import { detectLastAction, playActionSound, playTurnBell } from '../pokerSounds'
import type {
  PokerActionType,
  PokerCredentials,
  PokerGameState,
  PokerPlayerState,
  PokerStatePayload,
  TableSummary,
  WaitingFor,
} from '../pokerTypes'

const DEFAULT_BUY_IN = 1000

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
  const angle = ((180 + (i * 360) / total) * Math.PI) / 180
  const rx = 44
  const ry = 34
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

const ACTION_SHORTCUT_LABELS: Record<PokerActionType, string> = {
  fold: 'Space',
  check: 'Space',
  call: 'C',
  bet: 'B',
  raise: 'R',
}

const RANK_VALUES: Record<string, number> = {
  A: 14, K: 13, Q: 12, J: 11, T: 10,
  '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2,
}

/** 後ろに控えたプレイヤーの人数に応じたキッカーのフォールド閾値。
 * 人数が多いほど後ろからのプレッシャーが強いため、閾値を上げて広く降りる。 */
function kickerThresholdForPlayersBehind(playersBehind: number): number | null {
  if (playersBehind >= 4) return 9
  if (playersBehind === 3) return 8
  if (playersBehind === 2) return 7
  return null
}

/** セミオートプレイのチェック/フォールド自動判定。
 * 「後ろに控えたプレイヤーの人数」「卓に残っている人数」「ハンド」の3つを引数に取り、
 * 卓の人数が5〜6人の場合に限り、オフスートでキッカーが閾値以下のTハイ以下なら降りる。 */
function shouldAutoCheckFold(playersBehind: number, tableSize: number, holeCards: string[] | null): boolean {
  if (tableSize < 5 || tableSize > 6) return false
  const kickerThreshold = kickerThresholdForPlayersBehind(playersBehind)
  if (kickerThreshold === null || !holeCards || holeCards.length !== 2) return false
  const [c1, c2] = holeCards
  const v1 = RANK_VALUES[c1[0]?.toUpperCase()] ?? 0
  const v2 = RANK_VALUES[c2[0]?.toUpperCase()] ?? 0
  const suited = c1[1]?.toLowerCase() === c2[1]?.toLowerCase()
  const hi = Math.max(v1, v2)
  const lo = Math.min(v1, v2)
  return !suited && v1 !== v2 && hi <= 10 && lo <= kickerThreshold
}

/** プリフロップでheroより後に行動する(フォールド/オールインしていない)人数。
 * backend の `_players_to_act_after` と同じ着席順ロジック。 */
function playersToActAfter(state: PokerGameState, playerId: string): number {
  const players = state.players
  const numSeats = players.length
  const dealerIndex = players.findIndex((p) => p.player_id === state.dealer_id)
  const heroIndex = players.findIndex((p) => p.player_id === playerId)
  if (dealerIndex === -1 || heroIndex === -1) return 0
  const start = numSeats === 2 ? dealerIndex : (dealerIndex + 3) % numSeats
  const rank = (i: number) => (((i - start) % numSeats) + numSeats) % numSeats
  const heroRank = rank(heroIndex)
  return players.filter(
    (p, i) => p.player_id !== playerId && !p.folded && !p.is_all_in && rank(i) > heroRank,
  ).length
}

export function PokerTable() {
  const { tableId } = useParams<{ tableId: string }>()
  const navigate = useNavigate()
  const [creds, setCreds] = useState<PokerCredentials | null>(null)
  const [payload, setPayload] = useState<PokerStatePayload | null>(null)
  const [tableSummary, setTableSummary] = useState<TableSummary | null>(null)
  const account = loadAccount()
  const [displayName, setDisplayName] = useState(account?.username ?? '')
  const [buyIn, setBuyIn] = useState<number>(DEFAULT_BUY_IN)
  const [rebuyAmount, setRebuyAmount] = useState<number>(DEFAULT_BUY_IN)
  const [error, setError] = useState('')
  const [betAmount, setBetAmount] = useState<number>(0)
  const [rebuying, setRebuying] = useState(false)
  const [lastActions, setLastActions] = useState<Record<string, PokerActionType>>({})
  const [autoCheckFold, setAutoCheckFold] = useState(false)
  const [semiAutoPlay, setSemiAutoPlay] = useState(false)
  const [cachedWaitingFor, setCachedWaitingFor] = useState<WaitingFor | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const prevStateRef = useRef<PokerGameState | null>(null)
  const autoActingRef = useRef(false)

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
    if (!tableId || creds) return
    getTable(tableId)
      .then((summary) => {
        setTableSummary(summary)
        if (summary.initial_chips != null) setBuyIn(summary.initial_chips)
      })
      .catch(() => {})
  }, [tableId, creds])

  useEffect(() => {
    if (payload?.initial_chips != null) setRebuyAmount(payload.initial_chips)
  }, [payload?.initial_chips])

  useEffect(() => {
    if (payload?.waiting_for && creds && payload.waiting_for.player_id === creds.player_id) {
      setCachedWaitingFor(payload.waiting_for)
    }
  }, [payload, creds])

  useEffect(() => {
    if (!payload) return
    const { phase, big_blind, pot } = payload.state
    if (phase === 'PRE_FLOP') {
      setBetAmount(big_blind * 2)
    } else if (phase === 'FLOP' || phase === 'TURN' || phase === 'RIVER') {
      setBetAmount(Math.max(big_blind, Math.round(pot * 0.1)))
    }
  }, [payload?.state.phase])

  useEffect(() => {
    if (!payload) return
    const prevState = prevStateRef.current
    if (prevState) {
      if (prevState.dealer_id !== payload.state.dealer_id) {
        setLastActions({})
        if (semiAutoPlay && creds) {
          const me = payload.state.players.find((p) => p.player_id === creds.player_id)
          const tableSize = payload.state.players.length
          const playersBehind = playersToActAfter(payload.state, creds.player_id)
          setAutoCheckFold(shouldAutoCheckFold(playersBehind, tableSize, me?.hole_cards ?? null))
        } else {
          setAutoCheckFold(false)
        }
      } else {
        const actorId = prevState.current_player_id
        const action = detectLastAction(prevState, payload.state)
        if (action) {
          playActionSound(action)
          if (actorId) setLastActions((prev) => ({ ...prev, [actorId]: action }))
        }
      }
      if (
        creds &&
        payload.state.current_player_id === creds.player_id &&
        prevState.current_player_id !== creds.player_id
      ) {
        playTurnBell()
      }
    }
    prevStateRef.current = payload.state
  }, [payload, creds, semiAutoPlay])

  useEffect(() => {
    if (!autoCheckFold || !payload || !creds || autoActingRef.current) return
    const waitingFor = payload.waiting_for
    if (!waitingFor || waitingFor.player_id !== creds.player_id) return
    autoActingRef.current = true
    setAutoCheckFold(false)
    const action: PokerActionType = waitingFor.valid_actions.includes('check') ? 'check' : 'fold'
    handleAction(action).finally(() => {
      autoActingRef.current = false
    })
  }, [autoCheckFold, payload, creds])

  useEffect(() => {
    if (!creds || !payload) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'q') {
        setAutoCheckFold((prev) => !prev)
        return
      }
      if (e.key.toLowerCase() === 's') {
        setSemiAutoPlay((prev) => !prev)
        return
      }

      const waitingFor = payload.waiting_for
      if (!waitingFor || waitingFor.player_id !== creds.player_id) return
      const validActions = waitingFor.valid_actions

      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault()
        const action = validActions.includes('check') ? 'check' : validActions.includes('fold') ? 'fold' : null
        if (action) handleAction(action)
      } else if (e.key.toLowerCase() === 'c' && validActions.includes('call')) {
        handleAction('call')
      } else if (e.key.toLowerCase() === 'r' && validActions.includes('raise')) {
        handleAction('raise')
      } else if (e.key.toLowerCase() === 'b' && validActions.includes('bet')) {
        handleAction('bet')
      } else if (e.key === '0') {
        const betOrRaise = validActions.find((a) => a === 'bet' || a === 'raise')
        const me = payload.state.players.find((p) => p.player_id === creds.player_id)
        if (betOrRaise && me) {
          const allInAmount = me.current_bet + me.chips
          setBetAmount(allInAmount)
          handleAction(betOrRaise, allInAmount)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [creds, payload, betAmount])

  const handleJoin = async () => {
    if (!tableId) return
    setError('')
    try {
      const res = await joinTable(tableId, displayName || 'プレイヤー', buyIn)
      const nextCreds = { player_id: res.player_id, token: res.token }
      saveCredentials(tableId, nextCreds)
      setCreds(nextCreds)
      setPayload(res)
      connect(nextCreds)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const handleAction = async (action: PokerActionType, amountOverride?: number) => {
    if (!tableId || !creds) return
    setError('')
    try {
      const amount = action === 'bet' || action === 'raise' ? (amountOverride ?? betAmount) : undefined
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
      const res = await rebuyTable(tableId, creds, rebuyAmount)
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
                  disabled={!!account}
                />
              </label>
              <label>
                バイイン額
                {tableSummary?.initial_chips != null ? (
                  <input type="number" value={tableSummary.initial_chips} disabled />
                ) : (
                  <input
                    type="number"
                    min={1}
                    value={buyIn}
                    onChange={(e) => setBuyIn(Number(e.target.value))}
                  />
                )}
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
  const displayWaitingFor = isMyTurn ? waitingFor : cachedWaitingFor
  const me = state.players.find((p) => p.player_id === creds.player_id)
  const handInProgress = state.phase !== 'WAITING' && state.phase !== 'SHOWDOWN'
  const isBusted = (me !== undefined && me.chips === 0 && state.phase === 'SHOWDOWN') || me === undefined
  const isTableClosed = state.status === 'CLOSED'
  const isWinner = isTableClosed && !isBusted
  const isGameOver = isBusted || isWinner

  return (
    <div className="poker-fullscreen">
      <Link to="/poker" className="poker-float-btn poker-float-back">← ロビー</Link>
      {!isGameOver && (
        <button
          type="button"
          className="poker-float-btn poker-float-leave"
          onClick={handleLeave}
          disabled={handInProgress}
        >
          卓を離れる
        </button>
      )}

      <section className="poker-table-panel poker-table-panel-fullscreen">
        <p className="poker-table-subtitle">
          {PHASE_LABELS[state.phase] ?? state.phase}
          {state.phase === 'WAITING' && ` (${waitingHint(payload)})`} · Lv.{state.level + 1} SB
          {state.small_blind}/BB{state.big_blind}
          {state.ante > 0 && ` · アンティ${state.ante}`}
          {state.rake_percent > 0 && ` · レーキ${(state.rake_percent * 100).toFixed(1)}%`}
        </p>
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
                  {lastActions[p.player_id] && (
                    <div className="poker-seat-status">{ACTION_LABELS[lastActions[p.player_id]]}</div>
                  )}
                  {p.is_all_in && <div className="poker-seat-status">オールイン</div>}
                  {!p.folded && (
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
                  )}
                </div>
              )
            })}
          </div>

          {me && !isGameOver && (
            <div className="poker-action-bar">
              <label className="poker-checkbox-label poker-semiautoplay">
                <input
                  type="checkbox"
                  checked={semiAutoPlay}
                  onChange={(e) => setSemiAutoPlay(e.target.checked)}
                />
                セミオートプレイ (S)
              </label>
              <label className="poker-checkbox-label poker-autocheckfold">
                <input
                  type="checkbox"
                  checked={autoCheckFold}
                  onChange={(e) => setAutoCheckFold(e.target.checked)}
                />
                チェック/フォールド (Q)
              </label>
              {displayWaitingFor ? (
                (() => {
                  const betOrRaise = displayWaitingFor.valid_actions.find((a) => a === 'bet' || a === 'raise')
                  const otherActions = displayWaitingFor.valid_actions.filter(
                    (a) => a !== 'bet' && a !== 'raise',
                  )
                  // checking is free, so folding instead is never useful: only offer fold when facing a call
                  const displayedActions = otherActions.includes('check')
                    ? otherActions.filter((a) => a !== 'fold')
                    : otherActions
                  return (
                    <div className={`poker-action-bar-turn ${isMyTurn ? '' : 'waiting'}`}>
                      {betOrRaise && (
                        <>
                          <div className="poker-action-row">
                            <input
                              type="number"
                              value={betAmount}
                              min={state.big_blind}
                              disabled={!isMyTurn}
                              onChange={(e) => setBetAmount(Number(e.target.value))}
                            />
                            <button
                              type="button"
                              className="btn"
                              disabled={!isMyTurn}
                              onClick={() => me && setBetAmount(me.current_bet + me.chips)}
                            >
                              オールイン (0)
                            </button>
                          </div>
                          <div className="poker-action-row">
                            {betOrRaise === 'raise' &&
                              RAISE_MULTIPLIERS.map((mult) => (
                                <button
                                  key={mult}
                                  type="button"
                                  className="btn"
                                  disabled={!isMyTurn}
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
                                  disabled={!isMyTurn}
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
                        {displayedActions.map((action) => (
                          <button
                            key={action}
                            type="button"
                            className={`btn ${action === 'fold' ? '' : 'primary'}`}
                            disabled={!isMyTurn}
                            onClick={() => handleAction(action)}
                          >
                            {ACTION_LABELS[action]} ({ACTION_SHORTCUT_LABELS[action]})
                          </button>
                        ))}
                        {betOrRaise && (
                          <button
                            type="button"
                            className="btn accent"
                            disabled={!isMyTurn}
                            onClick={() => handleAction(betOrRaise)}
                          >
                            {ACTION_LABELS[betOrRaise]} ({ACTION_SHORTCUT_LABELS[betOrRaise]})
                          </button>
                        )}
                      </div>
                      {!isMyTurn && (
                        <p className="hint">
                          {handInProgress ? '相手の手番です...' : '次のハンドの開始を待っています...'}
                        </p>
                      )}
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
                {rebuyAvailable && (
                  <div className="poker-action-row">
                    {payload.initial_chips != null ? (
                      <input type="number" value={payload.initial_chips} disabled />
                    ) : (
                      <input
                        type="number"
                        min={1}
                        value={rebuyAmount}
                        onChange={(e) => setRebuyAmount(Number(e.target.value))}
                      />
                    )}
                  </div>
                )}
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
