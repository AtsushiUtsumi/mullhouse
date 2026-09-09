import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { HandMatrix } from '../components/HandMatrix'
import { SuitComboEditor } from '../components/SuitComboEditor'
import { HandCategoryFilter } from '../components/HandCategoryFilter'
import { ComboRankFilter } from '../components/ComboRankFilter'
import { PlayingCard } from '../components/PlayingCard'
import { listHandRanges, loadAccount, saveHandRange } from '../api'
import type { SavedHandRange } from '../types'
import {
  comboBlockedByBoard,
  countBaseCombos,
  filterRangeByCategory,
  filterRangeByComboRank,
  getCombosForHand,
  parseBoardCards,
} from '../utils/hands'

function comboCount(data: Record<string, number>): number {
  return Object.values(data).reduce((sum, f) => sum + (f > 0 ? f : 0), 0)
}

// ハンド単位のレンジを、各ハンドの全スートコンボへ展開する（コンボ別頻度の初期値として利用）。
// ボードと重複するコンボは展開しない。
function expandRangeToCombos(range: Record<string, number>, boardCards: string[]): Record<string, number> {
  const combos: Record<string, number> = {}
  for (const [hand, freq] of Object.entries(range)) {
    if (freq <= 0) continue
    for (const c of getCombosForHand(hand)) {
      if (!comboBlockedByBoard(c, boardCards)) combos[c] = freq
    }
  }
  return combos
}

// ボードと重複するコンボ/完全にブロックされたハンドを取り除く
function pruneBlockedCombos(comboRange: Record<string, number>, boardCards: string[]): Record<string, number> {
  const next = { ...comboRange }
  let changed = false
  for (const combo of Object.keys(comboRange)) {
    if (comboBlockedByBoard(combo, boardCards)) {
      delete next[combo]
      changed = true
    }
  }
  return changed ? next : comboRange
}

function pruneFullyBlockedHands(range: Record<string, number>, boardCards: string[]): Record<string, number> {
  const next = { ...range }
  let changed = false
  for (const hand of Object.keys(range)) {
    if (getCombosForHand(hand).every((c) => comboBlockedByBoard(c, boardCards))) {
      delete next[hand]
      changed = true
    }
  }
  return changed ? next : range
}

export function HandRangeEditor() {
  const [range, setRange] = useState<Record<string, number>>({})
  const [comboRange, setComboRange] = useState<Record<string, number>>({})
  const [selectedHand, setSelectedHand] = useState<string | null>(null)
  const [baseRange, setBaseRange] = useState<Record<string, number> | null>(null)
  const [baseComboRange, setBaseComboRange] = useState<Record<string, number>>({})
  const [boardInput, setBoardInput] = useState('')
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [savedRanges, setSavedRanges] = useState<SavedHandRange[] | null>(null)
  const [loadingSaved, setLoadingSaved] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const account = loadAccount()

  // ベースレンジ（コンボ単位の合計）に対して、現在の選択がどれだけの割合を占めるか
  const baseComboTotal = useMemo(() => comboCount(baseComboRange), [baseComboRange])
  const selectedComboTotal = useMemo(() => comboCount(comboRange), [comboRange])
  const baseSelectedPercent = baseRange && baseComboTotal > 0 ? (selectedComboTotal / baseComboTotal) * 100 : null
  const baseSnapshot = useMemo(
    () => (baseRange ? { range: baseRange, comboRange: baseComboRange } : null),
    [baseRange, baseComboRange]
  )

  const boardInputTrimmed = boardInput.trim()
  const parsedBoard = useMemo(() => parseBoardCards(boardInputTrimmed), [boardInputTrimmed])
  const boardValid = parsedBoard !== null
  const boardCards = useMemo(() => parsedBoard ?? [], [parsedBoard])
  // 上位/下位フィルターのスライダー最大値（ベースレンジのうちボードと重複しないコンボ数）
  const rankFilterComboTotal = useMemo(() => countBaseCombos(baseSnapshot, boardCards), [baseSnapshot, boardCards])

  // ボードが変わったら、既に選択済みのコンボ/ハンド（ベースレンジ含む）のうちボードと重複するものを取り除く
  useEffect(() => {
    if (boardCards.length === 0) return
    setComboRange((prev) => pruneBlockedCombos(prev, boardCards))
    setRange((prev) => pruneFullyBlockedHands(prev, boardCards))
    setBaseComboRange((prev) => pruneBlockedCombos(prev, boardCards))
    setBaseRange((prev) => (prev ? pruneFullyBlockedHands(prev, boardCards) : prev))
    if (selectedHand && getCombosForHand(selectedHand).every((c) => comboBlockedByBoard(c, boardCards))) {
      setSelectedHand(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardCards])

  // ハンド単位の頻度だけを更新する（range のみ変更、コンボ別の内訳には触れない）
  const setHandFreq = (hand: string, freq: number) => {
    setRange((prev) => {
      const next = { ...prev }
      if (freq <= 0) delete next[hand]
      else next[hand] = freq
      return next
    })
  }

  // マス全体をクリックした場合: そのハンドの全スート(ボードと重複しないもの)を同じ頻度に揃えて選択/解除する
  const handleHandChange = (hand: string, freq: number) => {
    const combos = getCombosForHand(hand).filter((c) => !comboBlockedByBoard(c, boardCards))
    if (combos.length === 0) return
    setHandFreq(hand, freq)
    setComboRange((prev) => {
      const next = { ...prev }
      for (const c of combos) {
        if (freq <= 0) delete next[c]
        else next[c] = freq
      }
      return next
    })
  }

  // スート別エディタで個別コンボを編集した場合: そのコンボだけ変更し、ハンド頻度は平均値に更新する
  const handleComboChange = (hand: string, combo: string, freq: number) => {
    if (comboBlockedByBoard(combo, boardCards)) return
    const combos = getCombosForHand(hand).filter((c) => !comboBlockedByBoard(c, boardCards))
    const baseFreq = range[hand] ?? 0
    const updated: Record<string, number> = {}
    for (const c of combos) {
      updated[c] = comboRange[c] ?? baseFreq
    }
    updated[combo] = freq
    setComboRange((prev) => ({ ...prev, ...updated }))
    const avg = combos.reduce((sum, c) => sum + updated[c], 0) / combos.length
    setHandFreq(hand, avg)
  }

  const clearRange = () => {
    setRange({})
    setComboRange({})
    setSelectedHand(null)
  }

  // 現在の選択内容を「ベースレンジ」として保存する（役フィルターの対象範囲になる）
  const setCurrentAsBase = () => {
    setBaseRange({ ...range })
    setBaseComboRange({ ...comboRange })
    setMessage(`現在のレンジ（${Object.keys(range).length}ハンド）をベースに設定しました`)
  }

  const restoreBase = () => {
    if (!baseRange) return
    setRange(pruneFullyBlockedHands(baseRange, boardCards))
    setComboRange(pruneBlockedCombos(baseComboRange, boardCards))
    setSelectedHand(null)
  }

  const clearBase = () => {
    setBaseRange(null)
    setBaseComboRange({})
  }

  // 「ワンペア以上」等のボタン: ベースレンジ（未設定なら全ハンド）を、ボード上で指定役以上になる
  // コンボだけに絞り込み、現在のレンジを置き換える
  const applyCategoryFilter = (minCategory: number, label: string) => {
    const base = baseRange ? { range: baseRange, comboRange: baseComboRange } : null
    const { range: newRange, comboRange: newComboRange } = filterRangeByCategory(base, boardCards, minCategory)
    setRange(newRange)
    setComboRange(newComboRange)
    setSelectedHand(null)
    const handCount = Object.keys(newRange).length
    setMessage(handCount > 0 ? `${label}のハンドを選択しました（${handCount}ハンド）` : `${label}に該当するハンドがありませんでした`)
  }

  // 「上位N・下位Mコンボを選択」: ベースレンジ（未設定なら全ハンド）のコンボを役の強さでランク付けし、
  // 上位topCount個と下位bottomCount個を合わせて選択し、現在のレンジを置き換える
  const applyComboRankFilter = (topCount: number, bottomCount: number) => {
    const { range: newRange, comboRange: newComboRange } = filterRangeByComboRank(
      baseSnapshot,
      boardCards,
      topCount,
      bottomCount
    )
    setRange(newRange)
    setComboRange(newComboRange)
    setSelectedHand(null)
    const label = `上位${topCount}・下位${bottomCount}コンボ`
    const handCount = Object.keys(newRange).length
    setMessage(handCount > 0 ? `${label}を選択しました（${handCount}ハンド）` : `${label}に該当するコンボがありませんでした`)
  }

  const handleSave = async () => {
    if (!account) return
    setSaving(true)
    setMessage('')
    try {
      await saveHandRange(account.id, range, title)
      setMessage('保存しました')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const handleToggleSaved = async () => {
    if (!account) return
    if (savedRanges !== null) {
      setSavedRanges(null)
      return
    }
    setLoadingSaved(true)
    setMessage('')
    try {
      const ranges = await listHandRanges(account.id)
      setSavedRanges(ranges)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e))
    } finally {
      setLoadingSaved(false)
    }
  }

  // 現在のレンジ（ハンド/コンボ/ボード/タイトル）をJSONファイルとしてダウンロードする
  const handleExportJson = () => {
    const payload = { title, board: boardInputTrimmed, range, comboRange }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const safeName = (title || 'hand-range').trim().replace(/[\\/:*?"<>|]/g, '_') || 'hand-range'
    a.href = url
    a.download = `${safeName}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    setMessage('JSONファイルをエクスポートしました')
  }

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  // JSONファイルを読み込んでレンジ/コンボ/ボードを復元する（ベースレンジにも設定する）
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // 同じファイルを続けて選び直せるようにする
    if (!file) return
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      if (!parsed || typeof parsed !== 'object' || typeof parsed.range !== 'object' || parsed.range === null) {
        throw new Error('range が見つかりません')
      }
      const importedRange: Record<string, number> = parsed.range
      const importedBoardInput = typeof parsed.board === 'string' ? parsed.board : ''
      const importedBoardCards = parseBoardCards(importedBoardInput.trim()) ?? []
      const importedCombos: Record<string, number> =
        parsed.comboRange && typeof parsed.comboRange === 'object'
          ? parsed.comboRange
          : expandRangeToCombos(importedRange, importedBoardCards)

      setBoardInput(importedBoardInput)
      setRange(importedRange)
      setComboRange(importedCombos)
      setBaseRange({ ...importedRange })
      setBaseComboRange({ ...importedCombos })
      setSelectedHand(null)
      if (typeof parsed.title === 'string') setTitle(parsed.title)
      setMessage('JSONファイルをインポートしました（ベースレンジにも設定しました）')
    } catch (err) {
      setMessage(`インポートに失敗しました: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const handleLoad = (item: SavedHandRange) => {
    const loadedCombos = expandRangeToCombos(item.data, boardCards)
    setRange(item.data)
    setComboRange(loadedCombos)
    // 読み込んだレンジは同時にベースレンジとしても設定する（役フィルターの対象範囲になる）
    setBaseRange({ ...item.data })
    setBaseComboRange({ ...loadedCombos })
    setSelectedHand(null)
    setSavedRanges(null)
    setMessage(`読み込みました（ベースレンジにも設定しました）`)
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <Link to="/" className="home-link">← ホーム</Link>
          <h1>ハンドレンジエディター</h1>
          <p className="subtitle">マトリクスをクリック/ドラッグしてハンドレンジを構築します</p>
        </div>
      </header>

      <main className="app-main">
        <section className="panel board-panel">
          <label className="board-input-label">
            ボード
            <input
              type="text"
              value={boardInput}
              onChange={(e) => setBoardInput(e.target.value)}
              placeholder="As5dTc（0〜5枚、未入力可）"
              maxLength={10}
            />
          </label>
          {!boardValid && boardInput.trim().length > 0 && (
            <p className="hint error">カード形式が不正です（例: As5dTc6h8c）。重複するカードも指定できません。</p>
          )}
          {boardValid && boardCards.length > 0 && (
            <div className="board-cards-row">
              {boardCards.map((c) => (
                <PlayingCard key={c} card={c} />
              ))}
            </div>
          )}
          {boardCards.length > 0 && <p className="hint">ボードのカードを含むコンボはレンジで選択できません。</p>}
        </section>

        <section className="panel matrix-panel">
          <div className="matrix-actions">
            <button type="button" className="btn" onClick={clearRange}>クリア</button>
            <button type="button" className="btn" onClick={setCurrentAsBase}>このレンジをベースに設定</button>
            {baseRange && (
              <>
                <button type="button" className="btn" onClick={restoreBase}>ベースに戻す</button>
                <button type="button" className="btn" onClick={clearBase}>ベース解除</button>
              </>
            )}
            <button type="button" className="btn" onClick={handleExportJson}>JSONエクスポート</button>
            <button type="button" className="btn" onClick={handleImportClick}>JSONインポート</button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              onChange={handleImportFile}
              style={{ display: 'none' }}
            />
          </div>
          {baseRange && (
            <p className="hint">
              ベースレンジ設定済み: {Object.keys(baseRange).length}ハンド。役フィルターはこの範囲内から絞り込みます。
              現在の選択: {selectedComboTotal.toFixed(1)} / {baseComboTotal.toFixed(1)} コンボ
              {baseSelectedPercent !== null && `（ベースの${baseSelectedPercent.toFixed(1)}%）`}
            </p>
          )}
          <div className="matrix-with-suit-editor">
            <div>
              <HandMatrix
                range={range}
                onChange={handleHandChange}
                onSelectHand={setSelectedHand}
                selectedHand={selectedHand}
                boardCards={boardCards}
                baseRange={baseRange}
                label="ハンドレンジ"
              />
              <p className="hint">クリックで選択/解除を切り替え: 0% ⇔ 100%</p>
            </div>
            <HandCategoryFilter
              boardReady={boardCards.length >= 3}
              baseHandCount={baseRange ? Object.keys(baseRange).length : null}
              onSelect={applyCategoryFilter}
            />
            <ComboRankFilter
              boardReady={boardCards.length >= 3}
              baseComboTotal={rankFilterComboTotal}
              onSelect={applyComboRankFilter}
            />
            {selectedHand && (
              <SuitComboEditor
                hand={selectedHand}
                comboRange={comboRange}
                onChange={(combo, freq) => handleComboChange(selectedHand, combo, freq)}
                onClose={() => setSelectedHand(null)}
                boardCards={boardCards}
                baseComboRange={baseRange ? baseComboRange : null}
              />
            )}
          </div>

          {account && (
            <div className="action-buttons">
              <input
                type="text"
                className="title-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="タイトルを入力"
              />
              <button type="button" className="btn primary" onClick={handleSave} disabled={saving}>
                {saving ? '保存中...' : '保存'}
              </button>
              <button type="button" className="btn" onClick={handleToggleSaved} disabled={loadingSaved}>
                {loadingSaved ? '読み込み中...' : '保存したレンジを読み込む'}
              </button>
            </div>
          )}
          {message && <p className="message">{message}</p>}

          {savedRanges !== null && (
            <div className="saved-list">
              <h3>保存済みレンジ</h3>
              {savedRanges.length === 0 ? (
                <p className="hint">保存済みのレンジがありません。</p>
              ) : (
                <ul>
                  {savedRanges.map((item) => (
                    <li key={item.id}>
                      <button type="button" className="load-btn" onClick={() => handleLoad(item)}>
                        <span className="load-pos">{item.title || new Date(item.created_at).toLocaleString('ja-JP')}</span>
                        <span className="load-line">{comboCount(item.data).toFixed(1)} コンボ</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
