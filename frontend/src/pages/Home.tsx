import { Link } from 'react-router-dom'

export function Home() {
  return (
    <div className="home">
      <header className="home-header">
        <h1>Mullhouse</h1>
        <p className="subtitle">ポーカーツール集</p>
      </header>

      <main className="home-main">
        <div className="app-grid">
          <Link to="/range" className="app-card">
            <h2>ポーカーレンジ構築・評価システム</h2>
            <p>レンジをマトリクスで編集し、ソルバーでEVを評価します。</p>
          </Link>

          <div className="app-card disabled" aria-disabled="true">
            <span className="coming-soon-badge">Coming Soon</span>
            <h2>ポーカー対戦</h2>
            <p>ポーカーをプレイできるアプリを準備中です。</p>
          </div>
        </div>
      </main>
    </div>
  )
}
