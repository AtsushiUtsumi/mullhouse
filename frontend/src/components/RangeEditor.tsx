import { useCallback, useEffect, useState } from 'react'
import { BoardCards } from './PlayingCard'
import { HandMatrix } from './HandMatrix'
import { SolverResults } from './SolverResults'
import { getActions, listRanges, loadRange, saveRange, solveRange } from '../api'
import type { PlayerType, RangeData, RangeListItem, SolverResult, Street } from '../types'
import {
  actionLabel,
  cardsForStreet,
  carryForwardRange,
  formatBoardDisplay,
  lineToFilename,
  POSITIONS,
  SAMPLE_RANGES_BY_POSITION,
  STREET_ACTIONS,
  validateBoard,
} from '../utils/hands'

const STREETS: Street[] = ['preflop', 'flop', 'turn', 'river']

export function RangeEditor() {
  const [position, setPosition] = useState('BTN_vs_BB')
  const [board, setBoard] = useState('As5dTc6h8c')
  const [flopAction, setFlopAction] = useState('flop_b33')
  const [turnAction, setTurnAction] = useState('turn_x')
  const [riverAction, setRiverAction] = useState('river_b60')
  const [currentStreet, setCurrentStreet] = useState<Street>('preflop')
  const [activePlayer, setActivePlayer] = useState<PlayerType>('hero')
  const [configOpen, setConfigOpen] = useState(false)

  const [heroRange, setHeroRange] = useState<Record<string, number>>({})
  const [villainRange, setVillainRange] = useState<Record<string, number>>({})

  const [streetHeroRanges, setStreetHeroRanges] = useState<Record<Street, Record<string, number>>>({
    preflop: {},
    flop: {},
    turn: {},
    river: {},
  })
  const [streetVillainRanges, setStreetVillainRanges] = useState<Record<Street, Record<string, number>>>({
    preflop: {},
    flop: {},
    turn: {},
    river: {},
  })

  const [savedRanges, setSavedRanges] = useState<RangeListItem[]>([])
  const [solverResult, setSolverResult] = useState<SolverResult | null>(null)
  const [solverLoading, setSolverLoading] = useState(false)
  const [solverError, setSolverError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [actions, setActions] = useState<Record<string, string[]>>(STREET_ACTIONS)

  const line = [flopAction, turnAction, riverAction]

  const currentStreetAction =
    currentStreet === 'flop' ? flopAction
    : currentStreet === 'turn' ? turnAction
    : currentStreet === 'river' ? riverAction
    : null

  const refreshSavedRanges = useCallback(async () => {
    try {
      const ranges = await listRanges()
      setSavedRanges(ranges)
    } catch {
      /* backend may not be running yet */
    }
  }, [])

  useEffect(() => {
    refreshSavedRanges()
    getActions().then(setActions).catch(() => {})
  }, [refreshSavedRanges])

  const currentRange = activePlayer === 'hero' ? heroRange : villainRange
  const setCurrentRange = activePlayer === 'hero' ? setHeroRange : setVillainRange

  const handleHandChange = (hand: string, freq: number) => {
    setCurrentRange((prev) => {
      const next = { ...prev }
      if (freq <= 0) delete next[hand]
      else next[hand] = freq
      return next
    })
  }

  const saveCurrentStreetRange = () => {
    if (activePlayer === 'hero') {
      setStreetHeroRanges((prev) => ({ ...prev, [currentStreet]: { ...heroRange } }))
    } else {
      setStreetVillainRanges((prev) => ({ ...prev, [currentStreet]: { ...villainRange } }))
    }
  }

  const advanceStreet = () => {
    saveCurrentStreetRange()
    const streetIdx = STREETS.indexOf(currentStreet)
    if (streetIdx >= STREETS.length - 1) {
      setMessage('最終ストリート（River）に到達しています')
      return
    }
    const nextStreet = STREETS[streetIdx + 1]
    const newHero = carryForwardRange(heroRange)
    const newVillain = carryForwardRange(villainRange)
    setHeroRange(newHero)
    setVillainRange(newVillain)
    setStreetHeroRanges((prev) => ({ ...prev, [nextStreet]: newHero }))
    setStreetVillainRanges((prev) => ({ ...prev, [nextStreet]: newVillain }))
    setCurrentStreet(nextStreet)
    setMessage(`${nextStreet} へレンジを引き継ぎました（未選択ハンドは除外）`)
  }

  const buildRangeData = (): RangeData => ({
    position,
    board,
    line,
    hero_range: heroRange,
    villain_range: villainRange,
  })

  const handleSave = async () => {
    if (!validateBoard(board)) {
      setMessage('ボードは5枚のカード（例: As5dTc6h8c）で入力してください')
      return
    }
    try {
      const data = buildRangeData()
      const res = await saveRange(data)
      setMessage(`保存しました: ${res.path}`)
      await refreshSavedRanges()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '保存に失敗しました')
    }
  }

  const handleLoad = async (item: RangeListItem) => {
    try {
      const filename = lineToFilename(item.line)
      const data = await loadRange(item.position, item.board, filename)
      setPosition(data.position)
      setBoard(data.board)
      if (data.line.length >= 3) {
        setFlopAction(data.line[0])
        setTurnAction(data.line[1])
        setRiverAction(data.line[2])
      }
      setHeroRange(data.hero_range)
      setVillainRange(data.villain_range)
      setCurrentStreet('river')
      setMessage(`読み込み: ${item.path}`)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '読み込みに失敗しました')
    }
  }

  const handleSolve = async () => {
    if (!validateBoard(board)) {
      setSolverError('ボードが不正です')
      return
    }
    setSolverLoading(true)
    setSolverError(null)
    try {
      const result = await solveRange(buildRangeData())
      setSolverResult(result)
    } catch (e) {
      setSolverError(e instanceof Error ? e.message : 'ソルバー実行に失敗しました')
      setSolverResult(null)
    } finally {
      setSolverLoading(false)
    }
  }

  const clearRange = () => {
    setCurrentRange({})
  }

  const loadSampleRange = () => {
    const sample = SAMPLE_RANGES_BY_POSITION[position]
    if (!sample) {
      setMessage('このポジションのサンプルレンジはありません')
      return
    }
    setHeroRange({ ...sample.hero })
    setVillainRange({ ...sample.villain })
    setMessage(`${position} のサンプルレンジを読み込みました`)
  }

  return (
    <div className="range-editor">
      <section className="panel config-panel">
        <div className="config-panel-header">
          <h2>レンジ設定</h2>
          <button type="button" className="btn" onClick={() => setConfigOpen((v) => !v)}>
            {configOpen ? 'レンジ設定を閉じる' : 'レンジ設定を開く'}
          </button>
        </div>
        {configOpen && (
          <>
            <div className="form-grid">
              <label>
                ポジション
                <select value={position} onChange={(e) => setPosition(e.target.value)}>
                  {POSITIONS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </label>
              <label>
                ボード
                <input
                  type="text"
                  value={board}
                  onChange={(e) => setBoard(e.target.value)}
                  placeholder="As5dTc6h8c"
                  maxLength={10}
                />
              </label>
              {board.length === 10 && validateBoard(board) && (
                <div className="board-display">{formatBoardDisplay(board)}</div>
              )}
            </div>

            <h3>プレーライン</h3>
            <div className="line-selectors">
              <label>
                Flop
                <select value={flopAction} onChange={(e) => setFlopAction(e.target.value)}>
                  {(actions.flop ?? STREET_ACTIONS.flop).map((a) => (
                    <option key={a} value={a}>{actionLabel(a)}</option>
                  ))}
                </select>
              </label>
              <label>
                Turn
                <select value={turnAction} onChange={(e) => setTurnAction(e.target.value)}>
                  {(actions.turn ?? STREET_ACTIONS.turn).map((a) => (
                    <option key={a} value={a}>{actionLabel(a)}</option>
                  ))}
                </select>
              </label>
              <label>
                River
                <select value={riverAction} onChange={(e) => setRiverAction(e.target.value)}>
                  {(actions.river ?? STREET_ACTIONS.river).map((a) => (
                    <option key={a} value={a}>{actionLabel(a)}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="line-preview">
              ファイル名: <code>{lineToFilename(line)}</code>
            </div>
          </>
        )}
      </section>

      <section className="panel street-panel">
        <h2>ストリート遷移</h2>
        <div className="street-row">
          <div className="street-tabs">
            {STREETS.map((s) => (
              <button
                key={s}
                type="button"
                className={`street-tab ${currentStreet === s ? 'active' : ''}`}
                onClick={() => {
                  saveCurrentStreetRange()
                  setCurrentStreet(s)
                  setHeroRange(streetHeroRanges[s] ?? (s === 'preflop' ? heroRange : {}))
                  setVillainRange(streetVillainRanges[s] ?? (s === 'preflop' ? villainRange : {}))
                }}
              >
                {s}
              </button>
            ))}
          </div>
          <button type="button" className="btn primary" onClick={advanceStreet}>
            次ストリートへ引き継ぐ
          </button>
        </div>
        <p className="hint">選択済みハンドのみ次ストリートへ進み、未選択ハンドは除外されます。</p>
      </section>

      <section className="panel matrix-panel">
        <BoardCards
          cards={cardsForStreet(board, currentStreet)}
          street={currentStreet}
          action={currentStreetAction ? actionLabel(currentStreetAction) : undefined}
        />
        <div className="player-tabs">
          <button
            type="button"
            className={`player-tab hero ${activePlayer === 'hero' ? 'active' : ''}`}
            onClick={() => setActivePlayer('hero')}
          >
            Hero レンジ
          </button>
          <button
            type="button"
            className={`player-tab villain ${activePlayer === 'villain' ? 'active' : ''}`}
            onClick={() => setActivePlayer('villain')}
          >
            Villain レンジ
          </button>
          <div className="matrix-actions">
            <button type="button" className="btn" onClick={clearRange}>クリア</button>
            <button type="button" className="btn" onClick={loadSampleRange}>サンプル</button>
          </div>
        </div>
        <HandMatrix
          range={currentRange}
          onChange={handleHandChange}
          hue={activePlayer === 'hero' ? 145 : 0}
          label={activePlayer === 'hero' ? 'Hero' : 'Villain'}
        />
        <p className="hint">クリックで選択/解除を切り替え: 0% ⇔ 100%</p>
      </section>

      <section className="panel actions-panel">
        <h2>保存 / 読み込み</h2>
        <div className="action-buttons">
          <button type="button" className="btn primary" onClick={handleSave}>レンジ保存</button>
          <button type="button" className="btn accent" onClick={handleSolve}>ソルバー実行</button>
        </div>
        {message && <div className="message">{message}</div>}

        {savedRanges.length > 0 && (
          <div className="saved-list">
            <h3>保存済みレンジ</h3>
            <ul>
              {savedRanges.map((item) => (
                <li key={item.path}>
                  <button type="button" className="load-btn" onClick={() => handleLoad(item)}>
                    <span className="load-pos">{item.position}</span>
                    <span className="load-board">{item.board}</span>
                    <span className="load-line">{item.line.join(' → ')}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="panel solver-panel">
        <SolverResults result={solverResult} loading={solverLoading} error={solverError} />
      </section>
    </div>
  )
}
