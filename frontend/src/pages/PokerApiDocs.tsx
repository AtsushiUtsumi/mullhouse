import { Link } from 'react-router-dom'

export function PokerApiDocs() {
  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <Link to="/poker" className="home-link">← ポーカー対戦</Link>
          <h1>ポーカー対戦 API</h1>
          <p className="subtitle">ボットやスクリプトからAPI経由で卓に参加・プレイするための説明です</p>
        </div>
      </header>

      <main className="app-main">
        <section className="panel about-panel">
          <h2>概要</h2>
          <p>
            ベースURLは <code>/api/poker</code> です。ゲームロジックはすべてバックエンドに閉じており、
            フロントエンドと同じREST + WebSocket APIを使えば誰でもボットやスクリプトから卓に参加してプレイできます。
          </p>
          <h3>認証方式</h3>
          <p>
            ログイン等の事前登録は不要です。<code>join</code> のレスポンスで発行される <code>player_id</code> と{' '}
            <code>token</code> の組が、その席で以後のすべてのリクエストに必要な認証情報になります。
            紛失した場合、その席として復帰する手段はありません。
          </p>
        </section>

        <section className="panel about-panel">
          <h2>REST エンドポイント</h2>

          <div className="api-endpoint">
            <div className="api-endpoint-line">
              <span className="api-method post">POST</span>
              <code>/api/poker/tables</code>
            </div>
            <p>卓を作成します。作成者は自動では着席しません。</p>
            <pre>{`{
  "name": "任意の卓名",          // 省略可
  "max_players": 6,
  "rake_percent": 0.0,          // 省略可 (0.05 = 5%)
  "rake_cap": null,             // 省略可 レーキの上限額
  "rake_min_pot": null,         // 省略可 この額未満のポットはレーキなし
  "level_schedule": [[25, 50, 0]], // [[sb, bb, ante], ...] 1要素なら固定、複数なら上昇スケジュール
  "level_up_interval_minutes": null, // 省略可 ブラインド/アンティを自動昇格させる間隔(分)
  "require_full_table": false,  // true で満員になるまで自動開始しない
  "initial_chips": null,         // 省略可 指定すると join/rebuy の buy_in を無視してこの額で固定
  "allow_rebuy": true,           // false でチップ切れ後のリバイを禁止
  "timeout_seconds": 15          // 省略可 シンキングタイム(秒)。デフォルト15秒
}`}</pre>
            <p>戻り値は卓のサマリー(下記「卓サマリー」を参照)。</p>
          </div>

          <div className="api-endpoint">
            <div className="api-endpoint-line">
              <span className="api-method get">GET</span>
              <code>/api/poker/tables</code>
            </div>
            <p>現在存在する卓のサマリー一覧を返します。</p>
          </div>

          <div className="api-endpoint">
            <div className="api-endpoint-line">
              <span className="api-method get">GET</span>
              <code>/api/poker/tables/{'{table_id}'}</code>
            </div>
            <p>指定した卓のサマリーを返します。</p>
            <pre>{`{
  "table_id": "316c3dc1",
  "name": "Table 316c3dc1",
  "small_blind": 25,
  "big_blind": 50,
  "ante": 0,
  "level": 0,
  "rake_percent": 0.0,
  "max_players": 6,
  "seated": 2,
  "phase": "WAITING",           // GameState.phase と同じ値
  "status": "RECRUITING",       // RECRUITING / PLAYING / CLOSED / OTHER
  "require_full_table": false,
  "initial_chips": null,
  "allow_rebuy": true,
  "timeout_seconds": 15,
  "created_at": "2026-07-07T06:13:06.500261+00:00"
}`}</pre>
          </div>

          <div className="api-endpoint">
            <div className="api-endpoint-line">
              <span className="api-method post">POST</span>
              <code>/api/poker/tables/{'{table_id}'}/join</code>
            </div>
            <p>
              卓に着席します。戻り値の <code>player_id</code>/<code>token</code> を保存し、以後のリクエストで使ってください。
            </p>
            <pre>{`// request
{ "display_name": "MyBot", "buy_in": 1000 }

// response (卓の状態ペイロードに player_id/token/table_id が付与される)
{
  "player_id": "73952fba",
  "token": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "table_id": "316c3dc1",
  "type": "state",
  "state": { ... },
  "waiting_for": null,
  "rebuy_available": false,
  "max_players": 6,
  "require_full_table": false,
  "events": []
}`}</pre>
          </div>

          <div className="api-endpoint">
            <div className="api-endpoint-line">
              <span className="api-method post">POST</span>
              <code>/api/poker/tables/{'{table_id}'}/leave</code>
            </div>
            <p>卓を離れます。ゲーム進行中は離脱できません(WAITING/SHOWDOWN のときのみ可)。</p>
            <pre>{`{ "player_id": "73952fba", "token": "..." }`}</pre>
          </div>

          <div className="api-endpoint">
            <div className="api-endpoint-line">
              <span className="api-method get">GET</span>
              <code>/api/poker/tables/{'{table_id}'}/state?player_id=...&token=...</code>
            </div>
            <p>現在の状態ペイロードを取得します(再接続やポーリング用)。</p>
          </div>

          <div className="api-endpoint">
            <div className="api-endpoint-line">
              <span className="api-method post">POST</span>
              <code>/api/poker/tables/{'{table_id}'}/action</code>
            </div>
            <p>
              自分の手番のときにアクションを送ります。<code>waiting_for.player_id</code> が自分の{' '}
              <code>player_id</code> と一致する時だけ有効です。
            </p>
            <pre>{`{
  "player_id": "73952fba",
  "token": "...",
  "action": "bet",   // "fold" | "check" | "call" | "bet" | "raise"
  "amount": 50        // bet/raise のときのみ必須
}`}</pre>
          </div>

          <div className="api-endpoint">
            <div className="api-endpoint-line">
              <span className="api-method post">POST</span>
              <code>/api/poker/tables/{'{table_id}'}/rebuy</code>
            </div>
            <p>
              チップが0になった後、ハンドの区切り(WAITING/SHOWDOWN)かつ卓がクローズしていない場合のみ、
              新しいバイインで復帰できます。状態ペイロードの <code>rebuy_available</code> で可否を確認できます。
              卓の <code>allow_rebuy</code> が false の場合は常に不可。<code>initial_chips</code> が設定されている
              卓では <code>buy_in</code> の値は無視され、その固定額でリバイされます。
            </p>
            <pre>{`{ "player_id": "73952fba", "token": "...", "buy_in": 1000 }`}</pre>
          </div>

          <div className="api-endpoint">
            <div className="api-endpoint-line">
              <span className="api-method get">WS</span>
              <code>/api/poker/tables/{'{table_id}'}/ws?player_id=...&token=...</code>
            </div>
            <p>
              接続すると即座に現在の状態ペイロードが1件送られ、以後は誰かのアクション・入退室のたびに
              最新の状態ペイロードがサーバーからpushされます。ポーリング不要でリアルタイムにプレイしたい場合はこちらを使ってください。
            </p>
          </div>
        </section>

        <section className="panel about-panel">
          <h2>状態ペイロード (state payload)</h2>
          <p>
            <code>join</code>/<code>action</code>/<code>rebuy</code>/<code>state</code>/WebSocket の
            いずれも同じ形のペイロードを返します。
          </p>
          <pre>{`{
  "type": "state",
  "state": {
    "table_id": "316c3dc1",
    "phase": "PRE_FLOP",       // WAITING/PRE_FLOP/FLOP/TURN/RIVER/SHOWDOWN
    "pot": 75,
    "current_bet": 50,
    "community_cards": ["Qh", "6c", "Kh"],
    "players": [
      {
        "player_id": "73952fba",
        "display_name": "Alice",
        "chips": 975,
        "current_bet": 25,
        "folded": false,
        "is_all_in": false,
        "hole_cards": ["2h", "8h"]   // 自分以外は showdown まで null
      }
    ],
    "current_player_id": "73952fba",
    "dealer_id": "73952fba",
    "small_blind": 25,
    "big_blind": 50,
    "ante": 0,
    "level": 0,
    "status": "PLAYING",             // RECRUITING/PLAYING/CLOSED/OTHER
    "side_pots": [
      { "amount": 50, "eligible_player_ids": ["73952fba", "5041bd70"] }
    ],
    "rake_percent": 0.05,
    "rake_cap": 20,
    "rake_min_pot": 100
  },
  "waiting_for": {
    "player_id": "73952fba",
    "valid_actions": ["fold", "call", "raise"],
    "timeout_seconds": 15
  },
  "rebuy_available": false,
  "max_players": 6,
  "require_full_table": false,
  "initial_chips": null,
  "events": [
    { "type": "turn_changed", "payload": { "player_id": "73952fba" } }
  ]
}`}</pre>
          <h3>カード表記</h3>
          <p>
            ランク1文字 + スート1文字で表します。ランク: <code>2 3 4 5 6 7 8 9 T J Q K A</code>、
            スート: <code>h</code>(ハート) <code>d</code>(ダイヤ) <code>c</code>(クラブ)
            <code>s</code>(スペード)。例: <code>Ah</code> = ハートのエース。
          </p>
          <h3>waiting_for が null になるとき</h3>
          <p>
            <code>phase</code> が <code>WAITING</code>/<code>SHOWDOWN</code> のとき(誰の手番でもない)は{' '}
            <code>null</code> です。
          </p>
          <h3>シンキングタイム超過時の自動アクション</h3>
          <p>
            手番のプレイヤーが <code>waiting_for.timeout_seconds</code> 以内にアクションを送らなかった場合、
            サーバーが自動的にアクションを行います(<code>check</code> が可能ならチェック、不可能ならフォールド)。
            自動アクションの結果も通常のアクションと同様に <code>events</code> とWebSocketのpushで通知されます。
          </p>
        </section>

        <section className="panel about-panel">
          <h2>エラー</h2>
          <p>失敗時は <code>{`{ "detail": "説明文" }`}</code> とともに以下のHTTPステータスが返ります。</p>
          <ul>
            <li><strong>401</strong> — player_id/token が不正(認証エラー)</li>
            <li><strong>403</strong> — 対象外のプレイヤーによる操作</li>
            <li><strong>400</strong> — 不正なアクション(手番でない、amount未指定など)</li>
            <li><strong>404</strong> — 卓が見つからない</li>
            <li><strong>409</strong> — その他のドメインエラー(満席、ゲーム進行中、卓クローズ済みなど)</li>
          </ul>
        </section>

        <section className="panel about-panel">
          <h2>ボットの実装例(疑似コード)</h2>
          <pre>{`# 1. 卓を作成
POST /api/poker/tables { "level_schedule": [[25, 50, 0]], "max_players": 6 }
-> table_id を得る

# 2. 着席
POST /api/poker/tables/{table_id}/join { "display_name": "MyBot", "buy_in": 1000 }
-> player_id, token を保存

# 3. WebSocketに接続して状態を購読
WS /api/poker/tables/{table_id}/ws?player_id=...&token=...

# 4. 受信したペイロードの waiting_for.player_id が自分なら、
#    valid_actions から選んでアクションを送信
POST /api/poker/tables/{table_id}/action
  { "player_id": ..., "token": ..., "action": "call" }

# 5. チップが尽きたら rebuy_available を見て再バイインするか、
#    卓が終了(status: CLOSED)していれば /leave してホームに戻る`}</pre>
        </section>
      </main>
    </div>
  )
}
