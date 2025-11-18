# 実験レポート自動化ツール プロジェクトマスターガイド

> **このドキュメントは、Cursorが常に参照する中央ハブです。**  
> 開発を開始する前に、必ずこのガイドを読み、各ドキュメントの役割を理解してください。

---

## 📚 ドキュメント構成

本プロジェクトには、以下の8つの主要ドキュメントがあります。各ドキュメントは特定の目的のために作成されており、開発の各フェーズで参照してください。

### 1. **PROJECT_MASTER_GUIDE.md** (このドキュメント)
- **目的**: 全ドキュメントへのナビゲーション、開発の進め方
- **対象**: 開発者全員、Cursor
- **参照タイミング**: プロジェクト開始時、迷った時

### 2. **requirements_final.md**
- **目的**: ヒアリングで確認した全要件の詳細
- **対象**: プロジェクトマネージャー、開発者
- **参照タイミング**: 要件確認時、機能追加時
- **主な内容**:
  - プロジェクト概要
  - 課題と目標
  - 機能要件
  - 非機能要件
  - 技術スタック

### 3. **project_plan.md**
- **目的**: プロジェクト全体の計画、スケジュール
- **対象**: プロジェクトマネージャー、チームリーダー
- **参照タイミング**: プロジェクト開始時、進捗確認時
- **主な内容**:
  - 5つの開発フェーズ(9週間)
  - システムアーキテクチャ
  - 推奨技術スタック
  - リスク管理

### 4. **cursor_instructions.md**
- **目的**: Cursor向けの超詳細な開発手順書
- **対象**: Cursor、開発者
- **参照タイミング**: 実装時、Cursorに指示を出す時
- **主な内容**:
  - 12フェーズの詳細ステップ(7日間)
  - 各ステップでCursorに入力する具体的な指示
  - ファイル構成
  - コード例
  - 環境変数リスト
  - トラブルシューティング

### 5. **development_tasks_with_risk_mitigation.md**
- **目的**: リスク対策を盛り込んだ開発タスクリスト
- **対象**: 開発チーム全員
- **参照タイミング**: 日々の開発作業、タスク管理
- **主な内容**:
  - 13フェーズ、120+タスク
  - 各タスクの担当、優先度、工数
  - 3つの重大リスクへの対策
  - リスク対策チェックリスト

### 6. **technical_risks_and_mitigation.md**
- **目的**: 技術的リスクと具体的な対策
- **対象**: 技術リーダー、開発者
- **参照タイミング**: リスク対策実装時、問題発生時
- **主な内容**:
  - リスク1: Dify APIタイムアウト対策
  - リスク2: Word生成の複雑さ対策
  - リスク3: ストレージ容量対策
  - 各リスクの詳細な実装例

### 7. **ui_ux_specification.md**
- **目的**: UI/UXの詳細仕様、デザインガイドライン
- **対象**: フロントエンド開発者、デザイナー、Cursor
- **参照タイミング**: UI実装時、デザイン確認時
- **主な内容**:
  - デザインコンセプト
  - カラーパレット、タイポグラフィ
  - 全画面のレイアウト図
  - コンポーネント仕様
  - レスポンシブデザイン

### 8. **variables_routing_specification.md**
- **目的**: 環境変数、定数、ルーティングの定義
- **対象**: 全開発者、Cursor
- **参照タイミング**: 実装時、変数名確認時
- **主な内容**:
  - 必須・オプション環境変数
  - グローバル定数
  - ページルート、APIルート
  - ナビゲーションフロー
  - データベーススキーマ
  - ボタンと遷移先の対応表

### 9. **user_manual.md**
- **目的**: エンドユーザー向けの使い方ガイド
- **対象**: エンドユーザー(学生)
- **参照タイミング**: リリース後、ユーザーサポート時
- **主な内容**:
  - クイックスタートガイド
  - レポート作成手順
  - よくある質問(FAQ)

---

## 🚀 開発の進め方

### ステップ1: プロジェクト理解(1日目開始前)

1. **このドキュメント(PROJECT_MASTER_GUIDE.md)を読む**
2. **requirements_final.mdを読む**: 何を作るのかを理解
3. **project_plan.mdを読む**: 全体像とスケジュールを把握
4. **technical_risks_and_mitigation.mdを読む**: 重要なリスクを認識

### ステップ2: 環境セットアップ(1日目午前)

1. **cursor_instructions.mdのフェーズ1を参照**
2. **variables_routing_specification.mdの環境変数セクションを参照**
3. 以下を実行:
   ```bash
   # Next.js 14プロジェクト作成
   npx create-next-app@latest experiment-report-automation --typescript --tailwind --app
   
   # 必要パッケージをインストール
   cd experiment-report-automation
   npm install @supabase/supabase-js @supabase/ssr stripe @upstash/qstash docxtemplater pizzip sharp chart.js chartjs-node-canvas
   
   # 環境変数ファイルを作成
   cp .env.example .env.local
   # .env.localを編集して、環境変数を設定
   ```

### ステップ3: データベースセットアップ(1日目午後)

1. **cursor_instructions.mdのフェーズ1-2を参照**
2. **variables_routing_specification.mdのデータベーススキーマを参照**
3. Supabase Dashboardでスキーマを実行

### ステップ4: 日々の開発(2日目〜7日目)

1. **development_tasks_with_risk_mitigation.mdを開く**
2. 今日のフェーズのタスクを確認
3. **cursor_instructions.mdの該当フェーズを開く**
4. Cursorに指示をコピー&ペースト
5. 実装時に以下を参照:
   - **ui_ux_specification.md**: UI実装時
   - **variables_routing_specification.md**: 変数名、ルート確認時
   - **technical_risks_and_mitigation.md**: リスク対策実装時

### ステップ5: テストとデプロイ(7日目〜8日目)

1. **development_tasks_with_risk_mitigation.mdのフェーズ12-13を参照**
2. リスク対策チェックリストを確認
3. デプロイ手順に従う

---

## 📖 Cursorでの使い方

### 基本的な流れ

1. **このドキュメント(PROJECT_MASTER_GUIDE.md)をCursorで開く**
2. **今日のフェーズを確認**: development_tasks_with_risk_mitigation.mdで今日のタスクを確認
3. **cursor_instructions.mdを開く**: 該当フェーズの「Cursorへの指示」をコピー
4. **Cursorのチャットに貼り付け**: 指示を実行
5. **必要に応じて他のドキュメントを参照**:
   - UI実装 → ui_ux_specification.md
   - 変数名確認 → variables_routing_specification.md
   - リスク対策 → technical_risks_and_mitigation.md

### Cursorへの指示例

#### 例1: ログインページを作成する場合

```
以下の仕様に従って、ログインページを作成してください:

1. ui_ux_specification.mdの「2.1. ログインページ」を参照
2. variables_routing_specification.mdの「3.1. ページルート」で/loginのルートを確認
3. variables_routing_specification.mdの「3.2. APIルート」で/api/auth/loginのAPIを確認

要件:
- ファイルパス: app/(auth)/login/page.tsx
- メールアドレスとパスワードの入力フィールド
- ログインボタン(プライマリボタン)
- 新規登録リンク
- リアルタイムバリデーション
- エラーメッセージ表示
- ログイン成功時は/dashboardにリダイレクト

デザイン:
- カラー: ui_ux_specification.mdのカラーパレットを使用
- ボタン: ui_ux_specification.mdの「3.1. プライマリボタン」のスタイルを使用
- 入力フィールド: ui_ux_specification.mdの「3.2. 入力フィールド」のスタイルを使用
```

#### 例2: レポート生成APIを作成する場合

```
以下の仕様に従って、レポート生成APIを作成してください:

1. cursor_instructions.mdのフェーズ6「Dify API連携」を参照
2. technical_risks_and_mitigation.mdの「リスク1: Dify APIタイムアウト対策」を参照
3. variables_routing_specification.mdの「3.2. APIルート」で/api/reports/generateを確認

要件:
- ファイルパス: app/api/reports/generate/route.ts
- メソッド: POST
- リクエスト: { reportId: string }
- レスポンス: { success: boolean }
- 処理内容:
  1. reportsテーブルのstatusを'processing'に更新
  2. progressを0に設定
  3. QStashにジョブを追加
  4. 成功レスポンスを返す

リスク対策:
- 非同期ジョブキュー(Upstash QStash)を使用
- タイムアウトを回避
- technical_risks_and_mitigation.mdの「対策1-1」のコード例を参考にする
```

---

## 🎯 重要な注意事項

### 1. リスク対策は必須実装

以下の3つのリスク対策は、プロジェクトの成否を左右します。必ず実装してください。

- **リスク1対策(フェーズ5)**: 非同期ジョブシステム
- **リスク2対策(フェーズ7)**: docxtemplaterでのWord生成
- **リスク3対策(フェーズ4)**: 画像圧縮

詳細は**technical_risks_and_mitigation.md**を参照。

### 2. 一貫性を保つ

- **変数名**: variables_routing_specification.mdの定義に従う
- **UI**: ui_ux_specification.mdのデザインシステムに従う
- **ルーティング**: variables_routing_specification.mdのルート定義に従う

### 3. ドキュメントの優先順位

複数のドキュメントで矛盾がある場合、以下の優先順位で判断してください:

1. **variables_routing_specification.md**: 変数名、ルートは最優先
2. **ui_ux_specification.md**: UIデザインは最優先
3. **cursor_instructions.md**: 実装手順は最優先
4. **technical_risks_and_mitigation.md**: リスク対策は最優先
5. **development_tasks_with_risk_mitigation.md**: タスク管理
6. **requirements_final.md**: 要件確認
7. **project_plan.md**: 全体計画

### 4. Cursorへの指示の書き方

Cursorに指示を出す際は、以下のフォーマットを使用してください:

```
【タスク】
[何を作るか]

【参照ドキュメント】
- [ドキュメント名] の [セクション名]

【要件】
- [要件1]
- [要件2]

【デザイン/技術仕様】
- [仕様1]
- [仕様2]

【リスク対策】(該当する場合)
- [対策内容]
```

---

## 📊 開発進捗の確認方法

### 日次チェック

毎日の開発終了時に、以下を確認してください:

1. **development_tasks_with_risk_mitigation.md**で今日のタスクが完了しているか
2. リスク対策チェックリストで該当項目にチェックを入れる
3. 問題があれば、technical_risks_and_mitigation.mdで対策を確認

### 週次チェック

毎週末に、以下を確認してください:

1. **project_plan.md**でフェーズが予定通り進んでいるか
2. リスク対策が適切に実装されているか
3. 次週の計画を確認

---

## 🔧 トラブルシューティング

### 問題が発生した場合

1. **cursor_instructions.mdのトラブルシューティングセクションを確認**
2. **technical_risks_and_mitigation.mdで該当するリスクを確認**
3. **variables_routing_specification.mdで変数名、ルートが正しいか確認**
4. それでも解決しない場合は、チームに相談

### よくある問題

| 問題 | 参照ドキュメント | セクション |
|:---|:---|:---|
| 環境変数が見つからない | variables_routing_specification.md | 1. 環境変数 |
| UIが仕様と異なる | ui_ux_specification.md | 該当画面のセクション |
| APIが動作しない | variables_routing_specification.md | 3.2. APIルート |
| タイムアウトエラー | technical_risks_and_mitigation.md | リスク1 |
| Word生成エラー | technical_risks_and_mitigation.md | リスク2 |
| ストレージ容量エラー | technical_risks_and_mitigation.md | リスク3 |

---

## 📝 ドキュメントの更新

### 更新が必要な場合

以下の場合は、該当するドキュメントを更新してください:

- **新しい機能を追加**: requirements_final.md、development_tasks_with_risk_mitigation.md
- **新しい画面を追加**: ui_ux_specification.md、variables_routing_specification.md
- **新しいAPIを追加**: variables_routing_specification.md
- **新しい環境変数を追加**: variables_routing_specification.md
- **新しいリスクを発見**: technical_risks_and_mitigation.md

### 更新手順

1. 該当ドキュメントを編集
2. 変更内容をチームに共有
3. このドキュメント(PROJECT_MASTER_GUIDE.md)の更新履歴に記録

---

## 📅 開発スケジュール(8日間)

| 日 | フェーズ | 主な作業 | 参照ドキュメント |
|:---|:---|:---|:---|
| **1日目** | 1-2 | セットアップ、DB設計、認証 | cursor_instructions.md (フェーズ1-2) |
| **2日目** | 3 | ダッシュボード、レポート一覧 | cursor_instructions.md (フェーズ3) |
| **3日目** | 4 | ファイルアップロード、画像圧縮 | cursor_instructions.md (フェーズ4)<br>technical_risks_and_mitigation.md (リスク3) |
| **4日目前半** | 5 | 非同期ジョブシステム | cursor_instructions.md (フェーズ5)<br>technical_risks_and_mitigation.md (リスク1) |
| **4日目後半** | 6 | Dify API連携、分割処理 | cursor_instructions.md (フェーズ6)<br>technical_risks_and_mitigation.md (リスク1) |
| **5日目前半** | 7 | Word生成、テンプレート | cursor_instructions.md (フェーズ7)<br>technical_risks_and_mitigation.md (リスク2) |
| **5日目後半** | 8 | レポート詳細、進捗表示 | cursor_instructions.md (フェーズ8) |
| **6日目前半** | 9 | Stripe課金 | cursor_instructions.md (フェーズ9) |
| **6日目後半** | 10 | ストレージ管理、自動削除 | cursor_instructions.md (フェーズ10)<br>technical_risks_and_mitigation.md (リスク3) |
| **7日目前半** | 11 | 参考文献検索 | cursor_instructions.md (フェーズ11) |
| **7日目後半** | 12 | テスト、リスク対策検証 | cursor_instructions.md (フェーズ12)<br>development_tasks_with_risk_mitigation.md (チェックリスト) |
| **8日目** | 13 | デプロイ、ドキュメント | cursor_instructions.md (フェーズ13) |

---

## 🎓 学習リソース

### 技術スタック

- **Next.js 14**: https://nextjs.org/docs
- **Supabase**: https://supabase.com/docs
- **Stripe**: https://stripe.com/docs
- **Upstash QStash**: https://upstash.com/docs/qstash
- **docxtemplater**: https://docxtemplater.com/docs
- **Sharp**: https://sharp.pixelplumbing.com/
- **Chart.js**: https://www.chartjs.org/docs

---

## ✅ プロジェクト完了チェックリスト

プロジェクトが完了したら、以下を確認してください:

### 機能チェック

- [ ] ユーザー登録・ログインが動作する
- [ ] ダッシュボードが表示される
- [ ] ファイルアップロードが動作する
- [ ] 画像が自動圧縮される
- [ ] レポート生成が非同期で動作する
- [ ] 進捗がリアルタイムで表示される
- [ ] Word文書が正しく生成される
- [ ] ダウンロードが動作する
- [ ] Stripe課金が動作する
- [ ] ストレージ制限が機能する
- [ ] 古いファイルが自動削除される

### リスク対策チェック

- [ ] **リスク1対策**: 非同期ジョブシステムが動作する
- [ ] **リスク1対策**: 進捗がリアルタイムで表示される
- [ ] **リスク1対策**: 分割処理が動作する
- [ ] **リスク2対策**: docxtemplaterでWord生成が動作する
- [ ] **リスク2対策**: 画像挿入が正しく動作する
- [ ] **リスク2対策**: Markdownフォールバックが動作する
- [ ] **リスク3対策**: 画像圧縮が動作する
- [ ] **リスク3対策**: ストレージ使用量が追跡される
- [ ] **リスク3対策**: 自動削除Cron Jobが動作する

### ドキュメントチェック

- [ ] README.mdが作成されている
- [ ] API仕様書が作成されている
- [ ] user_manual.mdが最新である
- [ ] 環境変数が全て設定されている

---

## 🎉 おわりに

このプロジェクトマスターガイドは、開発の中心的なドキュメントです。迷った時は、必ずこのドキュメントに戻ってきてください。

**開発を楽しんでください!**

---

## 📞 サポート

問題が発生した場合や質問がある場合は、以下を参照してください:

1. **cursor_instructions.mdのトラブルシューティング**
2. **technical_risks_and_mitigation.md**
3. チームに相談

---

**最終更新日**: 2024年10月29日  
**バージョン**: 1.0.0

以上
