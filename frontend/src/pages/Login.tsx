import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { login, saveAccount } from '../api'

export function Login() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loggingIn, setLoggingIn] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async () => {
    setLoggingIn(true)
    setError('')
    try {
      const account = await login(username, password)
      saveAccount(account)
      navigate('/')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoggingIn(false)
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <Link to="/" className="home-link">← ホーム</Link>
          <h1>ログイン</h1>
          <p className="subtitle">ユーザー名とパスワードでログインします</p>
        </div>
      </header>

      <main className="app-main">
        <section className="panel">
          <h2>ログイン</h2>
          <div className="form-grid">
            <label>
              ユーザー名
              <input value={username} onChange={(e) => setUsername(e.target.value)} />
            </label>
            <label>
              パスワード
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
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
          <p className="hint">
            アカウントをお持ちでない場合は<Link to="/create-account">こちら</Link>から作成してください。
          </p>
        </section>
      </main>
    </div>
  )
}
