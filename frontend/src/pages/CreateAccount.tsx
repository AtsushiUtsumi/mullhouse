import { useState } from 'react'
import { Link } from 'react-router-dom'
import { createAccount, saveAccount } from '../api'
import type { AccountSummary } from '../types'

export function CreateAccount() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState<AccountSummary | null>(null)

  const handleCreate = async () => {
    setCreating(true)
    setError('')
    try {
      const account = await createAccount(username, password)
      saveAccount(account)
      setCreated(account)
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
          <h1>アカウント作成</h1>
          <p className="subtitle">ユーザー名とパスワードで新しいアカウントを作成します</p>
        </div>
      </header>

      <main className="app-main">
        <section className="panel">
          {created ? (
            <>
              <h2>作成完了</h2>
              <p className="hint">
                ユーザー名: {created.username} / 所持コイン: {created.coins.toLocaleString()}
              </p>
              <Link to="/" className="btn primary">ホームへ戻る</Link>
            </>
          ) : (
            <>
              <h2>新規アカウント</h2>
              <div className="form-grid">
                <label>
                  ユーザー名
                  <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="3〜32文字"
                  />
                </label>
                <label>
                  パスワード
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="8文字以上"
                  />
                </label>
              </div>
              <button
                type="button"
                className="btn primary"
                onClick={handleCreate}
                disabled={creating || !username || !password}
              >
                {creating ? '作成中...' : 'アカウントを作成'}
              </button>
              {error && <p className="message">{error}</p>}
              <p className="hint">初期所持コインは10,000です。</p>
            </>
          )}
        </section>
      </main>
    </div>
  )
}
