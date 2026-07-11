import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getAccount, loadAccount } from '../api'
import type { AccountSummary } from '../types'

export function Settings() {
  const navigate = useNavigate()
  const [account, setAccount] = useState<AccountSummary | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const stored = loadAccount()
    if (!stored) {
      navigate('/login')
      return
    }
    getAccount(stored.id)
      .then(setAccount)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [navigate])

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <Link to="/" className="home-link">← ホーム</Link>
          <h1>設定</h1>
          <p className="subtitle">アカウント情報を確認します</p>
        </div>
      </header>

      <main className="app-main">
        <section className="panel">
          <h2>アカウント情報</h2>
          {error && <p className="message">{error}</p>}
          {!error && !account && <p className="hint">読み込み中...</p>}
          {account && (
            <p className="hint">
              ユーザー名: {account.username} / 所持コイン: {account.coins.toLocaleString()}
            </p>
          )}
        </section>
      </main>
    </div>
  )
}
