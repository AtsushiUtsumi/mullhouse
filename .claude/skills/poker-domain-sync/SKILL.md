---
name: poker-domain-sync
description: Bump backend/requirements.txt's pinned poker_domain git commit to the latest commit in the poker-domain repo, rebuild the backend Docker image, and verify it actually works. Use when the user says something like "poker_domainを最新にして", "poker_domain側の対応が終わったので取り込んで", "poker_domainを更新して確認して", or wants to pull in a change that was previously requested via the poker-domain-request skill. Triggers: "poker_domainを最新に", "poker_domainを更新", "poker_domain取り込んで", "poker_domain反映して", "poker_domain側の対応終わった".
user-invocable: true
allowed-tools:
  - Read
  - Edit
  - Bash(pip show *)
  - Bash(git *)
  - Bash(docker *)
  - Bash(curl *)
---

# poker-domain 依存バージョン更新

`mullhouse` の `backend/requirements.txt` は `poker_domain` をコミットハッシュ固定の
git依存として参照している(`poker_domain @ git+https://github.com/AtsushiUtsumi/poker-domain.git@<hash>`)。
`poker-domain` 側に変更が入っても、この `<hash>` を手動で追従させて Docker イメージを
再ビルドしない限り、実行中の `mullhouse` には一切反映されない。

このスキルは、まさにその「ピン留め更新を忘れる」で一度500エラーを起こした反省から
作られた。**「最新にした」と言うだけで終わらせず、実際に動くところまで確認する。**

## 手順

1. **`poker_domain` リポジトリのルートを解決する。**
   ```
   pip show poker_domain
   ```
   `Editable project location:` があればそれを使う。無ければ `Location:` +
   `/poker_domain` にフォールバックし、それも取れなければユーザーに直接尋ねる。

2. **最新コミットハッシュを取得する。**
   ```
   git -C <poker-domain root> fetch
   git -C <poker-domain root> log -1 --format=%H origin/main
   ```
   ローカルがそのコミットを持っていなければ(≒未pushの変更を取り込もうとしている)、
   その旨をユーザーに伝えて確認する。持っていれば `git -C <poker-domain root> rev-parse HEAD`
   と比較し、ローカルの方が進んでいたらそちらを優先してよいか確認する。

3. **`backend/requirements.txt` の現在のピン留めハッシュと比較する。**
   一致していれば「既に最新です」と報告して終了(再ビルド不要、無駄な作業をしない)。

4. **不一致なら `requirements.txt` の `<hash>` 部分だけを書き換える。** バージョン
   指定の他の行やパッケージは触らない。

5. **Docker イメージの再ビルドが必要である旨を明示し、実行前にユーザーに確認する。**
   (`docker compose up -d --build backend`)。再ビルドは既存コンテナを作り直す
   ため、無条件には実行しない。承認が得られたら実行する。

6. **再ビルド後、実際に動くか確認する。**
   - `curl` などで対象APIが200を返すか
   - 追加/変更されたフィールドや挙動が実際にレスポンスに現れているか
     (poker_domain側の変更が何を追加したものかに応じて、具体的な項目を確認する)
   - 500系が出た場合は `docker logs mullhouse-backend --tail 60` でスタック
     トレースを確認し、原因を切り分けてから報告する(「再ビルドしました」だけで
     終わらせない)

7. 結果をユーザーに簡潔に報告する: 何のコミットから何のコミットに上げたか、
   再ビルドしたか、動作確認の結果はどうだったか。
