import { useState } from 'react'
import { Link } from 'react-router-dom'
import { HandMatrix } from '../components/HandMatrix'
import { SuitComboEditor } from '../components/SuitComboEditor'
import { listHandRanges, loadAccount, saveHandRange } from '../api'
import type { SavedHandRange } from '../types'
import { getCombosForHand } from '../utils/hands'

function comboCount(data: Record<string, number>): number {
  return Object.values(data).reduce((sum, f) => sum + (f > 0 ? f : 0), 0)
}

// ハンド単位のレンジを、各ハンドの全スートコンボへ展開する（コンボ別頻度の初期値として利用）。
function expandRangeToCombos(range: Record<string, number>): Record<string, number> {
  const combos: Record<string, number> = {}
  for (const [hand, freq] of Object.entries(range)) {
    if (freq <= 0) continue
    for (const c of getCombosForHand(hand)) combos[c] = freq
  }
  return combos
}

export function HandRangeEditor() {
  const [range, setRange] = useState<Record<string, number>>({})
  const [comboRange, setComboRange] = useState<Record<string, number>>({})
  const [selectedHand, setSelectedHand] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [savedRanges, setSavedRanges] = useState<SavedHandRange[] | null>(null)
  const [loadingSaved, setLoadingSaved] = useState(false)

  const account = loadAccount()

  // ハンド単位の頻度だけを更新する（range のみ変更、コンボ別の内訳には触れない）
  const setHandFreq = (hand: string, freq: number) => {
    setRange((prev) => {
      const next = { ...prev }
      if (freq <= 0) delete next[hand]
      else next[hand] = freq
      return next
    })
  }

  // マス全体をクリックした場合: そのハンドの全スートを同じ頻度に揃えて選択/解除する
  const handleHandChange = (hand: string, freq: number) => {
    setHandFreq(hand, freq)
    setComboRange((prev) => {
      const next = { ...prev }
      for (const c of getCombosForHand(hand)) {
        if (freq <= 0) delete next[c]
        else next[c] = freq
      }
      return next
    })
  }

  // スート別エディタで個別コンボを編集した場合: そのコンボだけ変更し、ハンド頻度は平均値に更新する
  const handleComboChange = (hand: string, combo: string, freq: number) => {
    const combos = getCombosForHand(hand)
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

  const handleLoad = (item: SavedHandRange) => {
    setRange(item.data)
    setComboRange(expandRangeToCombos(item.data))
    setSelectedHand(null)
    setSavedRanges(null)
    setMessage('読み込みました')
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
        <section className="panel matrix-panel">
          <div className="matrix-actions">
            <button type="button" className="btn" onClick={clearRange}>クリア</button>
          </div>
          <div className="matrix-with-suit-editor">
            <div>
              <HandMatrix
                range={range}
                onChange={handleHandChange}
                onSelectHand={setSelectedHand}
                selectedHand={selectedHand}
                label="ハンドレンジ"
              />
              <p className="hint">クリックで選択/解除を切り替え: 0% ⇔ 100%</p>
            </div>
            {selectedHand && (
              <SuitComboEditor
                hand={selectedHand}
                comboRange={comboRange}
                onChange={(combo, freq) => handleComboChange(selectedHand, combo, freq)}
                onClose={() => setSelectedHand(null)}
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
