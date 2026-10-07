import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  adjustCoins,
  adminLogin,
  adminLogout,
  deleteAdminAccount,
  forceEndTable,
  freezeAccount,
  listAdminAccounts,
  listAdminLogs,
  listAdminTables,
  loadAdminToken,
  saveAdminToken,
} from '../adminApi'
import type { AdminAccountSummary, AdminLogEntry } from '../types'
import type { TableSummary } from '../pokerTypes'

type Tab = 'users' | 'tables' | 'logs'

function formatDate(iso: string | null): string {
  if (!iso) return '-'
  try {
    return new Date(iso).toLocaleString('ja-JP')
  } catch {
    return iso
  }
}

function AdminLoginForm({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loggingIn, setLoggingIn] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async () => {
    setLoggingIn(true)
    setError('')
    try {
      const res = await adminLogin(username, password)
      saveAdminToken(res.token)
      onLoggedIn()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoggingIn(false)
    }
  }

  return (
    <section className="panel">
      <h2>管理者ログイン</h2>
      <p className="hint">管理者権限を持つアカウントのユーザー名・パスワードでログインしてください。</p>
      <div className="form-grid">
        <label>
          ユーザー名
          <input value={username} onChange={(e) => setUsername(e.target.value)} />
        </label>
        <label>
          パスワード
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
          />
        </label>
      </div>
      <button
        type="button"
        className="btn primary"
        onClick={handleLogin}
        disabled={loggingIn || !username || !password}
      >
        {loggingIn ? 'ログイン中...' : 'ログイン'}
      </button>
      {error && <p className="message">{error}</p>}
    </section>
  )
}

function UsersPanel() {
  const [accounts, setAccounts] = useState<AdminAccountSummary[] | null>(null)
  const [error, setError] = useState('')
  const [coinInputs, setCoinInputs] = useState<Record<string, string>>({})
  const [reasonInputs, setReasonInputs] = useState<Record<string, string>>({})
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = () => {
    setError('')
    listAdminAccounts()
      .then(setAccounts)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }

  useEffect(load, [])

  const handleFreeze = async (account: AdminAccountSummary) => {
    setBusyId(account.id)
    setError('')
    try {
      await freezeAccount(account.id, !account.is_frozen, reasonInputs[account.id] ?? '')
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyId(null)
    }
  }

  const handleAdjustCoins = async (account: AdminAccountSummary) => {
    const raw = coinInputs[account.id]
    const delta = Number(raw)
    if (!raw || Number.isNaN(delta) || delta === 0) return
    setBusyId(account.id)
    setError('')
    try {
      await adjustCoins(account.id, delta, reasonInputs[account.id] ?? '')
      setCoinInputs((prev) => ({ ...prev, [account.id]: '' }))
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async (account: AdminAccountSummary) => {
    setBusyId(account.id)
    setError('')
    try {
      await deleteAdminAccount(account.id, reasonInputs[account.id] ?? '')
      setConfirmDeleteId(null)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="panel">
      <div className="config-panel-header">
        <h2>ユーザー一覧</h2>
        <button type="button" className="btn" onClick={load}>再読み込み</button>
      </div>
      {error && <p className="message">{error}</p>}
      {!error && accounts === null && <p className="hint">読み込み中...</p>}
      {accounts !== null && accounts.length === 0 && <p className="hint">アカウントがありません。</p>}
      <div className="admin-list">
        {accounts?.map((a) => (
          <div key={a.id} className="admin-row">
            <div className="admin-row-main">
              <span className="admin-row-name">{a.username}</span>
              {a.is_admin && <span className="admin-badge admin">管理者</span>}
              {a.is_frozen && <span className="admin-badge frozen">凍結中</span>}
              <span className="admin-row-coins">{a.coins.toLocaleString()} コイン</span>
            </div>
            <p className="hint">
              作成: {formatDate(a.created_at)} / 最終ログイン: {formatDate(a.last_login_at)}
            </p>
            <div className="admin-actions">
              <input
                type="text"
                className="admin-reason-input"
                placeholder="理由(任意)"
                value={reasonInputs[a.id] ?? ''}
                onChange={(e) => setReasonInputs((prev) => ({ ...prev, [a.id]: e.target.value }))}
              />
              <button type="button" className="btn" onClick={() => handleFreeze(a)} disabled={busyId === a.id}>
                {a.is_frozen ? '凍結解除' : '凍結する'}
              </button>
              <input
                type="number"
                className="admin-coin-input"
                placeholder="±コイン"
                value={coinInputs[a.id] ?? ''}
                onChange={(e) => setCoinInputs((prev) => ({ ...prev, [a.id]: e.target.value }))}
              />
              <button
                type="button"
                className="btn"
                onClick={() => handleAdjustCoins(a)}
                disabled={busyId === a.id || !coinInputs[a.id]}
              >
                コイン適用
              </button>
              {confirmDeleteId === a.id ? (
                <>
                  <span className="hint error">本当に削除しますか?</span>
                  <button
                    type="button"
                    className="btn danger"
                    onClick={() => handleDelete(a)}
                    disabled={busyId === a.id}
                  >
                    削除を確定
                  </button>
                  <button type="button" className="btn" onClick={() => setConfirmDeleteId(null)}>
                    キャンセル
                  </button>
                </>
              ) : (
                <button type="button" className="btn danger" onClick={() => setConfirmDeleteId(a.id)}>
                  削除
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function TablesPanel() {
  const [tables, setTables] = useState<TableSummary[] | null>(null)
  const [error, setError] = useState('')
  const [reasonInputs, setReasonInputs] = useState<Record<string, string>>({})
  const [confirmEndId, setConfirmEndId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = () => {
    setError('')
    listAdminTables()
      .then(setTables)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }

  useEffect(load, [])

  const handleForceEnd = async (table: TableSummary) => {
    setBusyId(table.table_id)
    setError('')
    try {
      await forceEndTable(table.table_id, reasonInputs[table.table_id] ?? '')
      setConfirmEndId(null)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="panel">
      <div className="config-panel-header">
        <h2>卓一覧</h2>
        <button type="button" className="btn" onClick={load}>再読み込み</button>
      </div>
      {error && <p className="message">{error}</p>}
      {!error && tables === null && <p className="hint">読み込み中...</p>}
      {tables !== null && tables.length === 0 && <p className="hint">進行中の卓がありません。</p>}
      <div className="admin-list">
        {tables?.map((t) => (
          <div key={t.table_id} className="admin-row">
            <div className="admin-row-main">
              <span className="admin-row-name">{t.name}</span>
              <span className="admin-badge">{t.status}</span>
              <span className="hint">
                {t.seated}/{t.max_players}人 SB{t.small_blind}/BB{t.big_blind}
              </span>
            </div>
            <p className="hint">作成: {formatDate(t.created_at)} / table_id: {t.table_id}</p>
            <div className="admin-actions">
              <input
                type="text"
                className="admin-reason-input"
                placeholder="理由(任意)"
                value={reasonInputs[t.table_id] ?? ''}
                onChange={(e) => setReasonInputs((prev) => ({ ...prev, [t.table_id]: e.target.value }))}
              />
              {confirmEndId === t.table_id ? (
                <>
                  <span className="hint error">本当に強制終了しますか?</span>
                  <button
                    type="button"
                    className="btn danger"
                    onClick={() => handleForceEnd(t)}
                    disabled={busyId === t.table_id}
                  >
                    強制終了を確定
                  </button>
                  <button type="button" className="btn" onClick={() => setConfirmEndId(null)}>
                    キャンセル
                  </button>
                </>
              ) : (
                <button type="button" className="btn danger" onClick={() => setConfirmEndId(t.table_id)}>
                  強制終了
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function LogsPanel() {
  const [logs, setLogs] = useState<AdminLogEntry[] | null>(null)
  const [error, setError] = useState('')

  const load = () => {
    setError('')
    listAdminLogs()
      .then(setLogs)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }

  useEffect(load, [])

  return (
    <section className="panel">
      <div className="config-panel-header">
        <h2>操作ログ</h2>
        <button type="button" className="btn" onClick={load}>再読み込み</button>
      </div>
      {error && <p className="message">{error}</p>}
      {!error && logs === null && <p className="hint">読み込み中...</p>}
      {logs !== null && logs.length === 0 && <p className="hint">ログがありません。</p>}
      <div className="admin-list">
        {logs?.map((l) => (
          <div key={l.id} className="admin-row">
            <div className="admin-row-main">
              <span className="admin-badge">{l.action}</span>
              <span className="admin-row-name">{l.admin_username}</span>
              <span className="hint">{formatDate(l.created_at)}</span>
            </div>
            {l.target && <p className="hint">対象: {l.target}</p>}
            {l.detail && <p className="hint">{l.detail}</p>}
          </div>
        ))}
      </div>
    </section>
  )
}

export function Admin() {
  const [loggedIn, setLoggedIn] = useState(() => loadAdminToken() !== null)
  const [tab, setTab] = useState<Tab>('users')

  const handleLogout = async () => {
    await adminLogout().catch(() => {})
    setLoggedIn(false)
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <Link to="/" className="home-link">← ホーム</Link>
          <h1>管理者画面</h1>
          <p className="subtitle">ユーザー管理・コイン調整・卓の強制終了を行えます</p>
        </div>
        {loggedIn && (
          <button type="button" className="btn" onClick={handleLogout}>
            管理者ログアウト
          </button>
        )}
      </header>

      <main className="app-main">
        {!loggedIn ? (
          <AdminLoginForm onLoggedIn={() => setLoggedIn(true)} />
        ) : (
          <>
            <div className="admin-tabs">
              <button
                type="button"
                className={`admin-tab ${tab === 'users' ? 'active' : ''}`}
                onClick={() => setTab('users')}
              >
                ユーザー
              </button>
              <button
                type="button"
                className={`admin-tab ${tab === 'tables' ? 'active' : ''}`}
                onClick={() => setTab('tables')}
              >
                卓
              </button>
              <button
                type="button"
                className={`admin-tab ${tab === 'logs' ? 'active' : ''}`}
                onClick={() => setTab('logs')}
              >
                ログ
              </button>
            </div>
            {tab === 'users' && <UsersPanel />}
            {tab === 'tables' && <TablesPanel />}
            {tab === 'logs' && <LogsPanel />}
          </>
        )}
      </main>
    </div>
  )
}
