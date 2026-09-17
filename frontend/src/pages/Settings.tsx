import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { clearAccount, deleteAccount, getAccount, loadAccount } from '../api'
import type { AccountSummary } from '../types'

export function Settings() {
  const navigate = useNavigate()
  const [account, setAccount] = useState<AccountSummary | null>(null)
  const [error, setError] = useState('')

  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

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

  const handleDeleteAccount = async () => {
    if (!account) return
    setDeleting(true)
    setDeleteError('')
    try {
      await deleteAccount(account.id, deletePassword)
      clearAccount()
      navigate('/')
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : String(e))
    } finally {
      setDeleting(false)
    }
  }

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

        {account && (
          <section className="panel danger-zone">
            <h2>退会</h2>
            <p className="hint">
              退会するとアカウント・所持コイン・保存済みレンジがすべて完全に削除され、元に戻せません。
            </p>

            {!confirmingDelete ? (
              <button
                type="button"
                className="btn danger"
                onClick={() => {
                  setConfirmingDelete(true)
                  setDeleteError('')
                }}
              >
                退会する
              </button>
            ) : (
              <div className="form-grid danger-zone-confirm">
                <label>
                  確認のためパスワードを入力してください
                  <input
                    type="password"
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                  />
                </label>
                <div className="action-buttons">
                  <button
                    type="button"
                    className="btn danger"
                    onClick={handleDeleteAccount}
                    disabled={deleting || !deletePassword}
                  >
                    {deleting ? '削除中...' : '退会を確定する'}
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      setConfirmingDelete(false)
                      setDeletePassword('')
                      setDeleteError('')
                    }}
                    disabled={deleting}
                  >
                    キャンセル
                  </button>
                </div>
                {deleteError && <p className="message">{deleteError}</p>}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  )
}
