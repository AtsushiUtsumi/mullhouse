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

          <Link to="/poker" className="app-card">
            <h2>ポーカー対戦</h2>
            <p>卓を作成・参加してポーカーをリアルタイムでプレイします。</p>
          </Link>
        </div>
      </main>
    </div>
  )
}
