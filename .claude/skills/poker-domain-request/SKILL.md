---
name: poker-domain-request
description: Write a change-request markdown document for the poker_domain dependency and save it directly to the poker-domain repo root. Use when the user says something like "poker_domainに依頼する/変更してほしい", asks to spec out a change to the poker_domain package/engine that can't be made inside mullhouse itself, or wants a request doc for the poker-domain maintainers/repo. Triggers: "poker_domainに依頼", "poker_domain側で対応してほしい", "poker-domainに変更をお願いしたい", "エンジン側の変更を依頼".
user-invocable: true
allowed-tools:
  - Read
  - Write
  - Bash(pip show *)
  - Bash(ls *)
  - Glob
---

# poker-domain 変更依頼ドキュメント作成

`mullhouse`(このリポジトリ)は `poker_domain` を editable install した別リポジトリの
poker エンジンに依存している。`bots/table_bot.py` や `backend/` 側の都合で
`poker_domain` 自体にAPI追加・仕様変更が必要になった場合、このリポジトリを直接
編集するのではなく、依頼内容をmarkdownにまとめて `poker-domain` リポジトリの
ルートに置く、というのがこのプロジェクトで確立したワークフロー。

このスキルは「出力先を毎回聞かれるのが面倒」という理由で作られた。**保存先は
毎回自動で `poker-domain` のルートに決め打ちし、パスを聞き返さない。**

## 手順

1. **`poker_domain` のルートパスを解決する。**
   ハードコードせず、都度これで解決する(開発機が変わっても壊れないように):
   ```
   pip show poker_domain
   ```
   出力の `Editable project location:` 行がルートパス。取得できなければ
   `Location:` 行 + `/poker_domain` にフォールバックし、それも失敗したら
   ユーザーに直接パスを尋ねる(黙って推測しない)。

2. **会話の文脈から依頼内容を組み立てる。** 直前までの調査・議論(該当コードを
   読んだ箇所、なぜ mullhouse 側だけでは実現できないか、代替案を検討して
   却下した経緯があればそれも)を踏まえ、以下の構成でmarkdownを書く。
   実際に読んだファイル・関数名を具体的に引用すること(抽象論で終わらせない)。

   ```markdown
   # poker_domain: <一言タイトル>

   ## 背景・目的
   <なぜこの変更が要るのか。mullhouse側のどの機能・どのファイルが困っているか>

   ## 依頼内容
   <具体的なAPI/データ構造の変更案。可能な限りコード例・対象ファイル名・
   対象メソッド名を明示する>

   ## 対象外(今回は不要)
   <スコープを絞るために明示的に除外する項目があれば>

   ## 影響範囲
   <変更が及ぶファイル一覧、破壊的変更の有無>

   ## mullhouse側で追って対応すること(参考・今回のスコープ外)
   <poker_domain側の対応が終わった後、mullhouse側で必要になる追従対応>
   ```

   セクションは内容に応じて増減してよいが、「背景」「依頼内容」「影響範囲」の
   3つは必須。

3. **ファイル名を決める。** `poker_domain_request_<トピックのkebab-caseスラッグ>.md`
   (例: `poker_domain_request_action_log.md`)。同名ファイルが既にある場合は
   上書きする前に一度だけユーザーに確認する。

4. **`poker_domain` リポジトリのルート直下に `Write` で保存する。** 保存先を
   ユーザーに尋ねない。保存後、絶対パスを一行で報告する。

5. mullhouse側のコードはこの時点では変更しない。あくまで依頼書の作成が目的。
   poker_domain側の対応が完了したと後で報告されたら、そこで初めて
   `bots/table_bot.py` などmullhouse側の追従実装に着手する。
