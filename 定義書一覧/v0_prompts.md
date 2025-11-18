# v0用プロンプト集（定義書準拠）

本プロンプト集は、定義書一覧の仕様を前提に、v0へ貼り付けるだけでUIをv0整備できるようにまとめたものです。UIのみの変更（最小差分）を基本とし、ロジック・API・イベントは一切変更しません。

## 共通コンテキスト（必ず添付）

- 参照ドキュメント
  - 画面/デザイン仕様: `定義書一覧/ui_ux_specification.md:1`
  - 要件/出力構造: `定義書一覧/requirements_final.md:1`
  - ルーティング/ボタン遷移/定数: `定義書一覧/variables_routing_specification.md:1`
  - 任意: リスク: `定義書一覧/technical_risks_and_mitigation.md:1`

- 技術と制約
  - Next.js App Router + TypeScript + Tailwind。外部UIライブラリ追加は不可、`lucide-react`のみ使用可。
  - 既存のイベント/状態/props/APIは変更禁止。UI（TSX構造とTailwindクラス）だけ編集。
  - 既存の共通クラスを最優先で再利用: `primary-button` / `secondary-button` / `card` / `feature-card` / `kpi-card` / `cta-card` / `live-card` / `status-pill` / `workflow-card` / `wizard-steps` / `page-container` / `section` / `dark-section` / `help-menu`。
  - a11y（フォーカスリング/aria/コントラスト）とレスポンシブ（モバイル優先）を遵守。
  - DOM階層・ID・テストに影響しうる属性は維持。差分は最小限。

---

## マスタープロンプト（最初に貼る）

以下をそのままv0へ貼り、対象TSXを添付して指示してください。

```prompt
以下の定義書を設計原則として厳守し、UIだけを改善してください。
- 画面/デザイン: 定義書一覧/ui_ux_specification.md:1
- 要件/出力構造: 定義書一覧/requirements_final.md:1
- ルーティング/ボタン遷移/定数: 定義書一覧/variables_routing_specification.md:1

制約:
- TypeScript/Next.js/Tailwindのみ。`lucide-react`は使用可。外部UIライブラリは追加禁止。
- 既存のイベント/状態/props/APIは変更しない（UIのみ変更）。
- 既存の共通クラス（primary-button/secondary-button/card/feature-card/kpi-card/cta-card/live-card/status-pill/workflow-card/wizard-steps/page-container/section/dark-section/help-menu）を最優先で使用。
- アクセシビリティ（フォーカスリング、aria属性、コントラスト 4.5:1 以上）とレスポンシブ最適化（モバイルファースト）。
- 差分は最小限。DOM階層・ID・data属性は維持。

成果物:
- 対象TSXの差し替え提案（UIリファクタのみ、最小差分）。Tailwindクラスと軽微なDOM整理中心。
```

---

## ページ別プロンプト

各プロンプトは「対象ファイルのTSXを貼り付けた上で」実行してください。

### ランディング（app/page.tsx:1）

```prompt
目的: 読みやすさ/視線誘導/訴求の明確化。ヒーロー→特長→ワークフロー→ライブ→価格/セキュリティ→最終CTA の構造を整理。
要件: 既存のコピー/ロジック/ID/イベントは維持。共通クラスとグラデ配色（紫→水色）を踏襲。
変更点:
- Hero: 1行コピー + 補足 + `primary-button`/`secondary-button`。`kpi-band`は維持し簡潔に。
- 特長: 3〜4枚の`feature-card`グリッド。アイコン＋箇条書き。
- ワークフロー: 横スクロール対応、UI/YAML切替はタブ表現で簡潔化。
- ライブ: `live-card`で最新3件に絞り、JSONは省スペース表示。
- 最終CTA: `cta-card`で行動を促す。コントラストAAを満たす。
```

### ログイン（app/(auth)/login/page.tsx:1）

```prompt
`ui_ux_specification.md`の認証画面仕様遵守。中央カード/グラデ背景/最大幅400px。
- 入力は `rounded-lg` / `focus:ring-2 ring-blue-500`。
- ログインは `primary-button` 風、リンクは下線なし青系。
- エラーは入力下に赤テキスト、aria/labelを設定。
ロジック/イベントは不変更。UIのみ最小差分で改善。
```

### 新規登録（app/(auth)/register/page.tsx:1）

```prompt
ログインと同レイアウト。追加フィールド（名前/パスワード確認）を`ui_ux_specification.md`の入力仕様で配置。
- バリデーションエラー表示はフィールド直下。
- Tab順/aria属性の適正化。
UIのみ、ロジックは変更不可。
```

### ダッシュボード（app/(dashboard)/dashboard/page.tsx:1）

```prompt
`ui_ux_specification.md`の“ダッシュボード”準拠。
- 上段: 3カラムの統計カード（アイコン/数値/ラベル）。
- 下段: 最近のレポート一覧（行ホバー/視認性）。
- 余白、見出し階層、リストのa11yを整理。
UIのみ、API/状態は維持。
```

### レポート一覧（app/(dashboard)/reports/page.tsx:1）

```prompt
`ui_ux_specification.md`“レポート一覧”準拠、`variables_routing_specification.md`の遷移表を反映。
- フィルタータブ: アクティブは下線+太字。
- 検索バー: 高さ48px、右側に虫眼鏡アイコン。
- テーブル: ヘッダーbg-gray-50、行ホバー、操作メニューは既存イベント踏襲。
UIのみ変更。
```

### 新規レポート作成（app/(dashboard)/reports/new/NewReportForm.tsx:1）

```prompt
`ui_ux_specification.md`“新規レポート作成”4ステップの視認性を強化。
- 進行ステッパー: サイズ/コントラスト改善、状態（完了/現在/未着手）を明確に。
- 各ステップは`card`で囲い、説明は簡潔に。
- `FileUpload`ドロップゾーン強調、アップロード中/済みの情報設計を改善。
- 生成/モック生成のCTAを右寄せ（または下部）に整理。
ロジック・APIは不変更、UIリファクタのみ。
```

### レポート詳細（app/(dashboard)/reports/[id]/ReportDetailClient.tsx:1）

```prompt
UI整理のみ。`variables_routing_specification.md`のボタン遷移ラベルを尊重。
- ヘッダー: タイトル + `status-pill` + アクション（ダウンロード/再生成/削除/更新）。
- 進捗: `ProgressBar`の視認性（AAコントラスト/余白/サイズ）を改善。
- 添付画像: サムネイルグリッド化（クリック拡大は構造だけ用意、ロジック追加なし）。
- 解析プレビュー/Rawレスポンス: タブ切替（ロジック不変更）。
```

### 設定（app/(dashboard)/settings/page.tsx:1）

```prompt
`ui_ux_specification.md`の“設定/プラン比較”準拠。
- 現行プランカード（利用状況/CTA）。
- プラン比較は2カラム、Premiumカードは紫強調と影。
- Stripe関連ボタンのラベル/aria整備。
UIのみ。
```

### Template Playground（app/(dashboard)/template-playground/TemplatePlaygroundClient.tsx:1）

```prompt
UI/レイアウトのみ2カラム最適化。
- 上部: 使い方カード（`live-card`調）。
- 左: タイトル入力 + JSONエディタ（等幅/自動行数）。
- 右: 整形/サンプル/ヒントのまとまり。
- 下部: 生成ボタン + 注意書き（横並び可）。
ロジック変更不可。既存アイコン/配色を踏襲。
```

---

## 部品強化プロンプト

### ProgressBar（components/ProgressBar.tsx:1）

```prompt
視認性とa11yを強化。丸アイコン/コネクタのコントラストをAAに、`aria-current`/`aria-describedby`を適用。モバイルで折返し最適化。ロジックや型は変更禁止。サイズ/余白/色/ariaのみ調整。
```

### FileUpload（components/FileUpload.tsx:1）

```prompt
ドロップゾーンの状態差（通常/ホバー/ドラッグ）を明確化。非画像サムネはアイコン+ラベルで視認性向上。アップロード中の行でファイル名/サイズ/進捗の整列、エラー時は赤系と文言明確化。イベント/APIは変更不可。UIのみ。
```

### ヘッダーナビ（app/page.tsx:1）

```prompt
スクロール縮小/陰影を滑らかにし、アクティブ下線のコントラストを上げ、`JA/EN`を`lang-toggle`相当の見た目に。ランドマーク/ariaは維持。UIのみ。
```

---

## 微調整スニペット（差分の口述依頼に便利）

- 余白/行間: 「Padding/Gapを一段階増やし、行間を+0.05em。見出しの字間を控えめに。」
- フォーカスリング: 「`focus:outline-none focus:ring-2 ring-blue-300`でホバーと差別化。」
- モバイル: 「<640pxでカード`p-4`、見出し`text-base`に縮小。」
- アニメーション: 「フェード/移動を250ms、移動距離小でモーション負荷軽減。」
- コントラスト: 「白×薄背景の文字は`text-white`へ、リンクのホバー色を濃く。」

---

## 運用Tips

- v0には必ず対象TSXを貼り、「UIのみ変更/最小差分/既存クラス優先」を再掲。
- 不明点は該当の定義書パスを添えて明示（例: フローは`variables_routing_specification.md:1`）。
- セクション単位で小刻みに実行→検証→次セクションの順で進める。

