import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { RangeEditor } from './components/RangeEditor'
import './index.css'

function App() {
  const [tab, setTab] = useState<'editor' | 'about'>('editor')

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <h1>ポーカーレンジ構築・評価システム</h1>
          <p className="subtitle">Range Editor → JSON → Solver Engine</p>
        </div>
        <nav className="app-nav">
          <button
            type="button"
            className={tab === 'editor' ? 'active' : ''}
            onClick={() => setTab('editor')}
          >
            レンジ構築
          </button>
          <button
            type="button"
            className={tab === 'about' ? 'active' : ''}
            onClick={() => setTab('about')}
          >
            概要
          </button>
        </nav>
      </header>

      <main className="app-main">
        {tab === 'editor' ? (
          <RangeEditor />
        ) : (
          <section className="about-panel panel">
            <h2>システム構成</h2>
            <div className="architecture">
              <div className="arch-step">Range Editor</div>
              <div className="arch-arrow">↓</div>
              <div className="arch-step">JSON保存 (ranges/)</div>
              <div className="arch-arrow">↓</div>
              <div className="arch-step">Solver Engine</div>
              <div className="arch-arrow">↓</div>
              <div className="arch-step">EV結果</div>
            </div>
            <h3>コンポーネント</h3>
            <ul>
              <li><strong>レンジ構築ツール</strong> — 13×13ハンドマトリクスでレンジ編集・可視化</li>
              <li><strong>ソルバー</strong> — 保存されたJSONレンジを評価しEV・比率を算出</li>
            </ul>
            <h3>データ形式</h3>
            <pre>{`{
  "position": "BTN_vs_BB",
  "board": "As5dTc6h8c",
  "line": ["flop_b33", "turn_x", "river_b60"],
  "hero_range": { "AA": 1.0, "AKs": 1.0 },
  "villain_range": { "ATs": 1.0, "88": 1.0 }
}`}</pre>
          </section>
        )}
      </main>

      <footer className="app-footer">
        Poker Range System v1.0
      </footer>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
