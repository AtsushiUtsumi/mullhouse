# mullhouse プロジェクト概要

ポーカーサイト。「リアルタイム対戦ポーカー」と「ハンドレンジ構築・ソルバーツール」の2つの機能を、
共通のアカウント基盤の上で提供する。

## システム構成

```
ブラウザ
  ↓
nginx (80番ポート, リバースプロキシ)
  ├─ /            → frontend (React + Vite, 開発サーバ:5173)
  ├─ /api         → backend  (FastAPI, 8000番ポート)
  └─ /admin       → backend
```

- **backend**: FastAPI製ヘッドレスAPIサーバ。ゲームロジック本体は外部ライブラリ
  [poker_domain](https://github.com/AtsushiUtsumi/poker-domain.git) に実装されており、
  `backend/requirements.txt` で特定コミットに固定して取り込んでいる
  (`poker-domain-sync` / `poker-domain-request` スキルで更新・変更依頼を行う)。
- **frontend**: React 18 + TypeScript + Vite + react-router-dom。
- **nginx**: フロント/バックエンドへのリバースプロキシ。WebSocketアップグレードにも対応。
- **永続化**: SQLite (`sqlite_data` ボリューム、コンテナ内 `/app/db`)。アカウント・保存レンジ・
  ハンドレンジを格納。
- **bots/**: サードパーティ視点でAPI経由にプレイする参考ボット/負荷生成スクリプト
  (標準ライブラリのみで動作、外部依存なし)。
- **ranges/**: レンジ構築ツールが出力するJSONの置き場(ディレクトリ構成は仕様書参照)。

起動: `./run.sh` (Linux) / `run.bat` (Windows) で `docker compose up -d --build`。
本番は `docker-compose.prod.yml` + `ghcr.io/atsushiutsumi/mullhouse` の各イメージを使用
(`run-prod.sh`)。

## 主な機能

### 1. アカウント機能
- ユーザー名/パスワードでアカウント作成・ログイン(`backend/accounts_api.py`)。
- ログイン中はホーム画面のアカウント作成リンクを非表示にするなど、ログイン状態をUIに反映。
- アカウントには所持コイン(`coins`)を保持。

### 2. ポーカー対戦(卓プレイ)
- `backend/poker_api.py` + `poker_service.py` が REST + WebSocket で卓を提供。
- 複数卓を同時進行できるロビー形式(`GET/POST /api/poker/tables`)。
- 卓作成時にブラインド/アンティのレベルスケジュール(`level_schedule: (SB, BB, ante)[]`)、
  最大人数、レーキ(%・上限・最低ポット)、リバイ可否、アクションタイムアウト等を指定可能。
- 参加(`join`)・退出(`leave`)・アクション(`fold/check/call/bet/raise`)・リバイ(`rebuy`)を
  プレイヤートークンで認証しつつ提供。
- `GET /tables/{id}/state` のポーリングに加え `WS /tables/{id}/ws` でリアルタイム更新。
- 接続が切れてもトークンで再接続し、プレイ中の卓に復帰可能。
- チップが0になった場合、そのハンド終了時に「リバイ」(可能な場合のみ)か「ホームに戻る」かを
  選択させる。
- サードパーティのボット/スクリプトもAPI経由で参加してプレイ可能(`bots/simple_bot.py`,
  `bots/table_bot.py` が参考実装)。API仕様はフロントの `/poker/api-docs` ページにも掲載。

### 3. ハンドレンジ構築・評価システム
仕様の詳細は `frontend/仕様.md` を参照。レンジ構築ツールとソルバーは疎結合な別コンポーネント。

- **レンジ構築ツール**: 13×13のハンドマトリクスUIでポジション・ボード・プレーラインごとに
  ハンドを選択し、頻度(0.0〜1.0)付きでレンジを保存・読み込み(`backend/hand_ranges_api.py`,
  `range_storage_sqlite.py`、フロントは `HandMatrix.tsx` / `RangeEditor.tsx`)。
  ストリートごとに前ストリートで選択したハンドのみを引き継ぎ、未選択ハンドは除外する。
  保存時にタイトルを付けられる。
- **ソルバー**(`backend/solver.py`, `POST /api/solve`): 保存済み/送信されたレンジJSONを評価し、
  Hero EV・Villain EV・ナッツアドバンテージ・レンジアドバンテージ・バリュー比率・ブラフ比率・
  推奨アクションを返す。
- レンジJSONは `position` / `board` / `line`(プレーライン配列) / `hero_range` / `villain_range`
  からなり、`ranges/<position>/<board>/<line>.json` に配置される想定(将来的にEV・コンボ数・
  ブロッカー等の拡張フィールドにも対応予定)。

## フロントエンド画面構成

`frontend/src/main.tsx` のルーティングより:

| パス | 画面 |
|---|---|
| `/` | Home(トップ) |
| `/range` | RangeApp(レンジ構築・ソルバー) |
| `/hand-range-editor` | HandRangeEditor |
| `/poker` | PokerLobby(卓一覧・作成) |
| `/poker/:tableId` | PokerTable(対戦画面) |
| `/poker/api-docs` | PokerApiDocs(外部ボット向けAPI仕様) |
| `/create-account` | CreateAccount |
| `/login` | Login |
| `/settings` | Settings |

## 主なバックエンドモジュール

| ファイル | 役割 |
|---|---|
| `main.py` | FastAPIアプリ本体。レンジ関連API・ソルバーAPI・ルーター登録 |
| `poker_api.py` / `poker_service.py` | 卓管理のREST+WebSocket API、poker_domainとの橋渡し |
| `accounts_api.py` / `accounts_storage.py` | アカウント作成・ログイン・永続化 |
| `hand_ranges_api.py` / `hand_ranges_storage.py` | ハンドレンジ(13×13マトリクス)の保存・一覧 |
| `range_storage_sqlite.py` / `storage.py` / `storage_db.py` / `storage_fs.py` | レンジ保存バックエンド(SQLite/ファイル)の切り替え |
| `solver.py` | レンジ評価(EV計算等) |
| `hand_eval.py` | ハンド評価ロジック |

## 依存関係・外部連携

- ゲームロジック本体は本リポジトリではなく [poker-domain](https://github.com/AtsushiUtsumi/poker-domain.git)
  リポジトリに実装されており、`backend/requirements.txt` でコミットハッシュ固定して取り込む。
  - 仕様変更を依頼するときは `poker-domain-request` スキルで依頼ドキュメントを作成。
  - 取り込み更新するときは `poker-domain-sync` スキルで最新コミットへの追随・動作確認を行う。
  - 現在 `backend/スケジュール統合依頼.md` にて、ブラインド/アンティスケジュールを
    `level_schedule: (SB, BB, ante)[]` に統合する変更を poker_domain 側へ依頼中
    (mullhouse側の追随修正は先方対応後に実施予定)。

## 開発コマンド

```
./run.sh   # プロジェクト全体を起動 (Linux)
./run.bat  # プロジェクト全体を起動 (Windows)
```
