import { useState } from 'react'
import { Link } from 'react-router-dom'
import { HandMatrix } from '../components/HandMatrix'
import { listHandRanges, loadAccount, saveHandRange } from '../api'
import type { SavedHandRange } from '../types'

function comboCount(data: Record<string, number>): number {
  return Object.values(data).reduce((sum, f) => sum + (f > 0 ? f : 0), 0)
}

export function HandRangeEditor() {
  const [range, setRange] = useState<Record<string, number>>({})
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [savedRanges, setSavedRanges] = useState<SavedHandRange[] | null>(null)
  const [loadingSaved, setLoadingSaved] = useState(false)

  const account = loadAccount()

  const handleHandChange = (hand: string, freq: number) => {
    setRange((prev) => {
      const next = { ...prev }
      if (freq <= 0) delete next[hand]
      else next[hand] = freq
      return next
    })
  }

  const clearRange = () => {
    setRange({})
  }

  const handleSave = async () => {
    if (!account) return
    setSaving(true)
    setMessage('')
    try {
      await saveHandRange(account.id, range)
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
          <HandMatrix range={range} onChange={handleHandChange} label="ハンドレンジ" />
          <p className="hint">クリックで選択/解除を切り替え: 0% ⇔ 100%</p>

          {account && (
            <div className="action-buttons">
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
                        <span className="load-pos">{new Date(item.created_at).toLocaleString('ja-JP')}</span>
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
