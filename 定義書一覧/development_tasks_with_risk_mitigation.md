# 実験レポート自動化ツール 開発タスクリスト(リスク対策版)

## プロジェクト概要

本ドキュメントは、技術的リスク対策を盛り込んだ開発タスクリストです。特に以下の3つの重大リスクへの対策を各フェーズに統合しています。

- **リスク1**: Dify APIのタイムアウト問題 → 非同期処理とリアルタイム通知
- **リスク2**: Word文書生成の複雑さ → テンプレートベースアプローチ
- **リスク3**: ストレージ容量とコスト → 画像圧縮と自動削除

---

## フェーズ1: プロジェクトセットアップと基盤構築(1日目)

### 1.1. プロジェクト初期化

| タスクID | タスク名 | 詳細 | 担当 | 優先度 | 工数 | リスク対策 |
|:---|:---|:---|:---|:---|:---|:---|
| T1-001 | Next.js 14プロジェクト作成 | TypeScript, App Router, Tailwind CSSで初期化 | Frontend | 高 | 0.5日 | - |
| T1-002 | 必要パッケージのインストール | Supabase, Stripe, docxtemplater, sharp, chart.jsなど | 全員 | 高 | 0.5日 | リスク2,3対策 |
| T1-003 | 環境変数の設定 | .env.localファイルの作成とテンプレート | DevOps | 高 | 0.5日 | - |
| T1-004 | Gitリポジトリ設定 | GitHub連携、ブランチ戦略、.gitignore | DevOps | 高 | 0.5日 | - |

**追加パッケージ(リスク対策用)**:
```bash
# リスク1対策: 非同期ジョブ
npm install @upstash/qstash

# リスク2対策: Word生成
npm install docxtemplater pizzip docxtemplater-image-module

# リスク3対策: 画像圧縮
npm install sharp

# グラフ生成
npm install chart.js chartjs-node-canvas
```

### 1.2. Supabaseプロジェクト設定

| タスクID | タスク名 | 詳細 | 担当 | 優先度 | 工数 | リスク対策 |
|:---|:---|:---|:---|:---|:---|:---|
| T1-101 | Supabaseプロジェクト作成 | 新規プロジェクト作成、リージョン選択(Tokyo) | Backend | 高 | 0.5日 | - |
| T1-102 | データベーススキーマ設計 | ER図作成、テーブル定義 | Backend | 高 | 1日 | リスク1,3対策 |
| T1-103 | データベーススキーマ実装 | SQLスクリプト実行、RLS設定 | Backend | 高 | 1日 | - |
| T1-104 | Supabase Storage設定 | experiment-filesバケット作成、ポリシー設定 | Backend | 高 | 0.5日 | リスク3対策 |
| T1-105 | Supabase Realtime有効化 | reportsテーブルのRealtime設定 | Backend | 高 | 0.5日 | **リスク1対策** |

**拡張スキーマ(リスク対策用)**:
```sql
-- リスク1対策: 進捗管理
ALTER TABLE reports ADD COLUMN progress INTEGER DEFAULT 0;
ALTER TABLE reports ADD COLUMN processing_step TEXT;
ALTER TABLE reports ADD COLUMN error_message TEXT;

-- リスク3対策: ストレージ管理
ALTER TABLE users ADD COLUMN storage_used BIGINT DEFAULT 0;
ALTER TABLE users ADD COLUMN storage_limit BIGINT DEFAULT 104857600; -- 100MB

-- ファイルサイズ追跡
ALTER TABLE experiment_data ADD COLUMN file_size BIGINT;

-- ストレージ使用量更新関数
CREATE OR REPLACE FUNCTION increment_storage(user_id UUID, size BIGINT)
RETURNS VOID AS $$
BEGIN
  UPDATE users
  SET storage_used = storage_used + size
  WHERE id = user_id;
END;
$$ LANGUAGE plpgsql;
```

---

## フェーズ2: 認証機能の実装(1日目後半)

### 2.1. Supabase Auth統合

| タスクID | タスク名 | 詳細 | 担当 | 優先度 | 工数 | リスク対策 |
|:---|:---|:---|:---|:---|:---|:---|
| T2-001 | Supabaseクライアント設定 | client.ts, server.tsの作成 | Backend | 高 | 0.5日 | - |
| T2-002 | 認証レイアウト作成 | app/(auth)/layout.tsx | Frontend | 高 | 0.5日 | - |
| T2-003 | ログインページ実装 | メール/パスワード認証 | Frontend | 高 | 1日 | - |
| T2-004 | 登録ページ実装 | 新規ユーザー登録、バリデーション | Frontend | 高 | 1日 | - |
| T2-005 | 認証ミドルウェア実装 | middleware.tsでルート保護 | Backend | 高 | 0.5日 | - |

---

## フェーズ3: ダッシュボードとレポート管理(2日目)

### 3.1. ダッシュボード基盤

| タスクID | タスク名 | 詳細 | 担当 | 優先度 | 工数 | リスク対策 |
|:---|:---|:---|:---|:---|:---|:---|
| T3-001 | ダッシュボードレイアウト | サイドバー、ヘッダー、メインエリア | Frontend | 高 | 1日 | - |
| T3-002 | ダッシュボードページ | 統計情報、最近のレポート | Frontend | 高 | 1日 | - |
| T3-003 | レポート一覧ページ | テーブル表示、検索、フィルタ | Frontend | 高 | 1.5日 | - |
| T3-004 | レポート一覧API | GET /api/reports、ページネーション | Backend | 高 | 1日 | - |
| T3-005 | レポート作成API | POST /api/reports | Backend | 高 | 0.5日 | - |

---

## フェーズ4: ファイルアップロード機能(3日目)

### 4.1. ファイルアップロードとストレージ管理

| タスクID | タスク名 | 詳細 | 担当 | 優先度 | 工数 | リスク対策 |
|:---|:---|:---|:---|:---|:---|:---|
| T4-001 | FileUploadコンポーネント | react-dropzone、プレビュー機能 | Frontend | 高 | 1.5日 | - |
| T4-002 | 画像圧縮ユーティリティ | Sharpで自動圧縮(1920x1080, 80%品質) | Backend | 高 | 1日 | **リスク3対策** |
| T4-003 | ファイルアップロードAPI | POST /api/upload、圧縮処理統合 | Backend | 高 | 1.5日 | **リスク3対策** |
| T4-004 | ストレージ使用量チェック | アップロード前に容量制限を確認 | Backend | 高 | 0.5日 | **リスク3対策** |
| T4-005 | ストレージ使用量更新 | アップロード後にusers.storage_usedを更新 | Backend | 高 | 0.5日 | **リスク3対策** |
| T4-006 | 新規レポート作成ページ | タイトル入力、ファイルアップロード | Frontend | 高 | 1日 | - |

**画像圧縮実装例**:
```typescript
// lib/utils/image-compression.ts
import sharp from 'sharp'

export async function compressImage(buffer: Buffer, mimeType: string): Promise<Buffer> {
  if (!mimeType.startsWith('image/')) {
    return buffer
  }

  try {
    const compressed = await sharp(buffer)
      .resize(1920, 1080, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({ quality: 80 })
      .toBuffer()

    // 圧縮後のサイズが元より大きい場合は元のバッファを返す
    return compressed.length < buffer.length ? compressed : buffer
  } catch (error) {
    console.error('画像圧縮エラー:', error)
    return buffer
  }
}

// app/api/upload/route.ts
import { compressImage } from '@/lib/utils/image-compression'

export async function POST(request: Request) {
  const formData = await request.formData()
  const file = formData.get('file') as File
  const reportId = formData.get('reportId') as string
  
  const buffer = Buffer.from(await file.arrayBuffer())
  
  // 画像圧縮
  const optimizedBuffer = await compressImage(buffer, file.type)
  
  // ストレージ容量チェック
  const user = await getCurrentUser()
  await checkStorageLimit(user.id, optimizedBuffer.length)
  
  // Supabase Storageにアップロード
  const filePath = `${user.id}/${reportId}/${file.name}`
  const { data, error } = await supabase.storage
    .from('experiment-files')
    .upload(filePath, optimizedBuffer)
  
  if (error) throw error
  
  // experiment_dataテーブルに記録
  await supabase.from('experiment_data').insert({
    report_id: reportId,
    file_name: file.name,
    file_type: getFileType(file.type),
    file_url: data.path,
    file_size: optimizedBuffer.length
  })
  
  // ストレージ使用量を更新
  await supabase.rpc('increment_storage', {
    user_id: user.id,
    size: optimizedBuffer.length
  })
  
  return Response.json({ success: true })
}
```

---

## フェーズ5: 非同期ジョブシステムの実装(4日目前半)

### 5.1. ジョブキューとバックグラウンド処理

| タスクID | タスク名 | 詳細 | 担当 | 優先度 | 工数 | リスク対策 |
|:---|:---|:---|:---|:---|:---|:---|
| T5-001 | Upstash QStashセットアップ | アカウント作成、API キー取得 | DevOps | 高 | 0.5日 | **リスク1対策** |
| T5-002 | ジョブキュークライアント実装 | lib/queue/client.ts | Backend | 高 | 1日 | **リスク1対策** |
| T5-003 | ジョブハンドラーAPI作成 | POST /api/jobs/process-report | Backend | 高 | 1.5日 | **リスク1対策** |
| T5-004 | 進捗更新ユーティリティ | reportsテーブルのprogress更新関数 | Backend | 高 | 0.5日 | **リスク1対策** |
| T5-005 | Realtime購読コンポーネント | フロントエンドでの進捗監視 | Frontend | 高 | 1日 | **リスク1対策** |

**ジョブキュー実装例**:
```typescript
// lib/queue/client.ts
import { Client } from '@upstash/qstash'

const qstash = new Client({
  token: process.env.QSTASH_TOKEN!
})

export async function enqueueReportGeneration(reportId: string) {
  await qstash.publishJSON({
    url: `${process.env.NEXT_PUBLIC_APP_URL}/api/jobs/process-report`,
    body: { reportId },
    retries: 3
  })
}

// app/api/reports/generate/route.ts
export async function POST(request: Request) {
  const { reportId } = await request.json()
  
  // ステータスを'processing'に更新
  await supabase
    .from('reports')
    .update({
      status: 'processing',
      progress: 0,
      processing_step: 'データ収集中'
    })
    .eq('id', reportId)
  
  // ジョブキューに追加
  await enqueueReportGeneration(reportId)
  
  return Response.json({ success: true })
}

// app/api/jobs/process-report/route.ts
export async function POST(request: Request) {
  const { reportId } = await request.json()
  
  try {
    // ステップ1: データ取得(10%)
    await updateProgress(reportId, 10, 'データ取得中')
    const experimentData = await fetchExperimentData(reportId)
    
    // ステップ2: Dify API呼び出し(20-60%)
    await updateProgress(reportId, 20, 'AI分析中')
    const analysisResult = await callDifyAPI(experimentData, reportId)
    
    // ステップ3: Word生成(60-90%)
    await updateProgress(reportId, 60, 'レポート生成中')
    const docxBuffer = await generateWordDocument(analysisResult)
    
    // ステップ4: アップロード(90-100%)
    await updateProgress(reportId, 90, 'アップロード中')
    const fileUrl = await uploadToStorage(reportId, docxBuffer)
    
    // 完了
    await supabase
      .from('reports')
      .update({
        status: 'completed',
        progress: 100,
        file_url: fileUrl,
        processing_step: '完了'
      })
      .eq('id', reportId)
    
    return Response.json({ success: true })
  } catch (error) {
    await supabase
      .from('reports')
      .update({
        status: 'error',
        error_message: error.message
      })
      .eq('id', reportId)
    
    throw error
  }
}

// lib/utils/progress.ts
export async function updateProgress(
  reportId: string,
  progress: number,
  step: string
) {
  await supabase
    .from('reports')
    .update({
      progress,
      processing_step: step
    })
    .eq('id', reportId)
}
```

**Realtime購読実装例**:
```typescript
// components/ReportProgress.tsx
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function ReportProgress({ reportId }: { reportId: string }) {
  const [progress, setProgress] = useState(0)
  const [step, setStep] = useState('')
  const supabase = createClient()

  useEffect(() => {
    const channel = supabase
      .channel('report-progress')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'reports',
        filter: `id=eq.${reportId}`
      }, (payload) => {
        setProgress(payload.new.progress)
        setStep(payload.new.processing_step)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [reportId])

  return (
    <div className="w-full">
      <div className="mb-2 flex justify-between">
        <span className="text-sm font-medium">{step}</span>
        <span className="text-sm font-medium">{progress}%</span>
      </div>
      <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-600 transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  )
}
```

---

## フェーズ6: Dify API連携とデータ分析(4日目後半)

### 6.1. Dify API統合

| タスクID | タスク名 | 詳細 | 担当 | 優先度 | 工数 | リスク対策 |
|:---|:---|:---|:---|:---|:---|:---|
| T6-001 | Dify APIクライアント実装 | lib/dify/client.ts、リトライロジック | Backend | 高 | 1日 | **リスク1対策** |
| T6-002 | データ変換処理 | 実験データをDify形式に変換 | Backend | 高 | 1日 | - |
| T6-003 | 分割処理ロジック | ファイルごとに分割してAPI呼び出し | Backend | 高 | 1日 | **リスク1対策** |
| T6-004 | 分析結果の保存 | analysis_resultsテーブルへの保存 | Backend | 高 | 0.5日 | - |
| T6-005 | グラフ生成機能 | Chart.jsでグラフ画像を生成 | Backend | 高 | 1日 | **リスク2対策** |

**分割処理実装例**:
```typescript
// lib/dify/client.ts
import axios from 'axios'

const difyClient = axios.create({
  baseURL: process.env.DIFY_API_URL,
  timeout: 120000, // 2分
  headers: {
    'Authorization': `Bearer ${process.env.DIFY_API_KEY}`
  }
})

export async function analyzeSingleFile(
  file: ExperimentFile,
  reportId: string,
  onProgress?: (progress: number) => void
) {
  const maxRetries = 3
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await difyClient.post('/analyze', {
        file_url: file.url,
        file_type: file.type,
        report_id: reportId
      })
      
      return response.data
    } catch (error) {
      if (attempt === maxRetries - 1) throw error
      
      // 指数バックオフ
      const delay = 2000 * Math.pow(2, attempt)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
}

export async function analyzeAllFiles(
  reportId: string,
  files: ExperimentFile[]
) {
  const results = []
  const totalFiles = files.length
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    
    // 進捗を更新(20-60%の範囲で)
    const progress = 20 + Math.floor((i / totalFiles) * 40)
    await updateProgress(reportId, progress, `AI分析中 (${i + 1}/${totalFiles})`)
    
    const result = await analyzeSingleFile(file, reportId)
    results.push(result)
    
    // 部分結果を保存
    await supabase.from('analysis_results').insert({
      report_id: reportId,
      file_id: file.id,
      dify_response: result
    })
  }
  
  return results
}
```

---

## フェーズ7: Word文書生成機能(5日目前半)

### 7.1. テンプレートベースのWord生成

| タスクID | タスク名 | 詳細 | 担当 | 優先度 | 工数 | リスク対策 |
|:---|:---|:---|:---|:---|:---|:---|
| T7-001 | Wordテンプレート準備 | total_template_fixed.docxをプレースホルダー化 | Backend | 高 | 1日 | **リスク2対策** |
| T7-002 | docxtemplater統合 | lib/docx/generator.ts実装 | Backend | 高 | 1.5日 | **リスク2対策** |
| T7-003 | 画像挿入モジュール | docxtemplater-image-moduleの設定 | Backend | 高 | 1日 | **リスク2対策** |
| T7-004 | テンプレートデータ構築 | Dify結果をテンプレート形式に変換 | Backend | 高 | 1日 | - |
| T7-005 | Markdownフォールバック | Word生成失敗時の代替処理 | Backend | 中 | 0.5日 | **リスク2対策** |

**docxtemplater実装例**:
```typescript
// lib/docx/generator.ts
import Docxtemplater from 'docxtemplater'
import PizZip from 'pizzip'
import ImageModule from 'docxtemplater-image-module'
import fs from 'fs'
import path from 'path'

export async function generateReport(templateData: TemplateData): Promise<Buffer> {
  try {
    // テンプレートファイルを読み込み
    const templatePath = path.join(process.cwd(), 'templates', 'total_template_fixed.docx')
    const content = fs.readFileSync(templatePath, 'binary')
    const zip = new PizZip(content)
    
    // 画像モジュールの設定
    const imageOpts = {
      centered: false,
      getImage: (tagValue: string) => {
        return fs.readFileSync(tagValue)
      },
      getSize: (img: Buffer, tagValue: string, tagName: string) => {
        // 画像サイズを指定(ピクセル単位)
        return [600, 400]
      }
    }
    
    // Docxtemplaterの初期化
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      modules: [new ImageModule(imageOpts)]
    })
    
    // データを設定
    doc.setData({
      chapter: templateData.chapter,
      chapter_plus_1: templateData.chapter + 1,
      chapter_plus_2: templateData.chapter + 2,
      experiments: templateData.experiments,
      consideration: templateData.consideration,
      summary: templateData.summary
    })
    
    // レンダリング
    doc.render()
    
    // バッファとして出力
    const buffer = doc.getZip().generate({
      type: 'nodebuffer',
      compression: 'DEFLATE'
    })
    
    return buffer
  } catch (error) {
    console.error('Word生成エラー:', error)
    
    // フォールバック: Markdown生成
    const markdown = generateMarkdownReport(templateData)
    return Buffer.from(markdown, 'utf-8')
  }
}

// Markdownフォールバック
function generateMarkdownReport(templateData: TemplateData): string {
  let markdown = `# ${templateData.chapter}. 実験結果\n\n`
  
  for (const exp of templateData.experiments) {
    markdown += `## ${templateData.chapter}.${exp.idx} ${exp.name}\n\n`
    markdown += `${exp.description_brief}\n\n`
    
    if (exp.tables && exp.tables.length > 0) {
      for (const table of exp.tables) {
        markdown += `### ${table.label} ${table.caption}\n\n`
        markdown += generateMarkdownTable(table.data) + '\n\n'
      }
    }
    
    if (exp.figures && exp.figures.length > 0) {
      for (const fig of exp.figures) {
        markdown += `### ${fig.label} ${fig.caption}\n\n`
        markdown += `![${fig.caption}](${fig.url})\n\n`
      }
    }
  }
  
  markdown += `\n# ${templateData.chapter + 1}. 考察\n\n`
  markdown += `(ここに考察を記入してください)\n\n`
  
  markdown += `\n# ${templateData.chapter + 2}. まとめ\n\n`
  markdown += `${templateData.summary}\n\n`
  
  return markdown
}
```

---

## フェーズ8: レポート詳細ページと進捗表示(5日目後半)

### 8.1. レポート詳細とダウンロード

| タスクID | タスク名 | 詳細 | 担当 | 優先度 | 工数 | リスク対策 |
|:---|:---|:---|:---|:---|:---|:---|
| T8-001 | ProgressBarコンポーネント | ステップインジケーター、アニメーション | Frontend | 高 | 1日 | **リスク1対策** |
| T8-002 | レポート詳細ページ | ステータス別UI、進捗表示 | Frontend | 高 | 1.5日 | **リスク1対策** |
| T8-003 | レポート詳細API | GET /api/reports/[id] | Backend | 高 | 0.5日 | - |
| T8-004 | ダウンロード機能 | Word文書のダウンロード | Frontend | 高 | 0.5日 | - |
| T8-005 | エラーハンドリングUI | エラー時の再試行ボタン | Frontend | 高 | 0.5日 | **リスク1対策** |

---

## フェーズ9: Stripe課金システム(6日目前半)

### 9.1. サブスクリプション管理

| タスクID | タスク名 | 詳細 | 担当 | 優先度 | 工数 | リスク対策 |
|:---|:---|:---|:---|:---|:---|:---|
| T9-001 | Stripeアカウント設定 | 商品・プラン作成(Free/Premium) | DevOps | 高 | 0.5日 | - |
| T9-002 | Stripeクライアント実装 | lib/stripe/client.ts | Backend | 高 | 0.5日 | - |
| T9-003 | Checkout API実装 | POST /api/stripe/checkout | Backend | 高 | 1日 | - |
| T9-004 | Webhook実装 | POST /api/stripe/webhook | Backend | 高 | 1日 | - |
| T9-005 | サブスクリプション管理ページ | 現在のプラン表示、アップグレード | Frontend | 高 | 1日 | - |
| T9-006 | ストレージ制限の統合 | プランごとの容量制限を適用 | Backend | 高 | 0.5日 | **リスク3対策** |

**プラン設定**:
- **Freeプラン**: 月0円、レポート5件/月、ストレージ100MB
- **Premiumプラン**: 月980円、レポート無制限、ストレージ1GB

---

## フェーズ10: 運用機能とストレージ管理(6日目後半)

### 10.1. ストレージ最適化と自動削除

| タスクID | タスク名 | 詳細 | 担当 | 優先度 | 工数 | リスク対策 |
|:---|:---|:---|:---|:---|:---|:---|
| T10-001 | ストレージ使用量ダッシュボード | ユーザー向け使用量表示 | Frontend | 中 | 1日 | **リスク3対策** |
| T10-002 | 古いファイル削除Cron Job | 6ヶ月以上前のファイルを削除 | Backend | 中 | 1日 | **リスク3対策** |
| T10-003 | 管理者ダッシュボード | 全体のストレージ使用状況監視 | Frontend | 低 | 1日 | **リスク3対策** |
| T10-004 | アラート機能 | ストレージ使用率80%で通知 | Backend | 中 | 0.5日 | **リスク3対策** |

**自動削除Cron Job実装例**:
```typescript
// app/api/cron/cleanup/route.ts
export async function GET(request: Request) {
  // Vercel Cron認証
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
  
  // 古いレポートを取得
  const { data: oldReports } = await supabase
    .from('reports')
    .select('id, user_id')
    .lt('created_at', sixMonthsAgo.toISOString())
  
  let deletedFiles = 0
  let freedSpace = 0
  
  for (const report of oldReports) {
    // ファイル情報を取得
    const { data: files } = await supabase
      .from('experiment_data')
      .select('file_url, file_size')
      .eq('report_id', report.id)
    
    // ファイルを削除
    for (const file of files) {
      await supabase.storage
        .from('experiment-files')
        .remove([file.file_url])
      
      freedSpace += file.file_size
      deletedFiles++
    }
    
    // ストレージ使用量を更新
    await supabase.rpc('increment_storage', {
      user_id: report.user_id,
      size: -freedSpace
    })
    
    // レポートを削除
    await supabase
      .from('reports')
      .delete()
      .eq('id', report.id)
  }
  
  return Response.json({
    success: true,
    deletedReports: oldReports.length,
    deletedFiles,
    freedSpace: `${(freedSpace / 1024 / 1024).toFixed(2)} MB`
  })
}

// vercel.json
{
  "crons": [{
    "path": "/api/cron/cleanup",
    "schedule": "0 0 * * 0"
  }]
}
```

---

## フェーズ11: 参考文献検索機能(7日目前半)

### 11.1. 参考文献自動検索

| タスクID | タスク名 | 詳細 | 担当 | 優先度 | 工数 | リスク対策 |
|:---|:---|:---|:---|:---|:---|:---|
| T11-001 | 参考文献検索API統合 | 既存APIとの連携 | Backend | 中 | 1日 | - |
| T11-002 | キーワード抽出機能 | 実験内容からキーワード抽出 | Backend | 中 | 1日 | - |
| T11-003 | ReferenceManagerコンポーネント | 検索、追加、編集UI | Frontend | 中 | 1.5日 | - |
| T11-004 | 手動追加機能 | ユーザーが手動で文献を追加 | Frontend | 中 | 0.5日 | - |

---

## フェーズ12: テストとデバッグ(7日目後半)

### 12.1. テストとバグ修正

| タスクID | タスク名 | 詳細 | 担当 | 優先度 | 工数 | リスク対策 |
|:---|:---|:---|:---|:---|:---|:---|
| T12-001 | 単体テスト作成 | 主要関数のテスト | Backend | 高 | 1日 | - |
| T12-002 | E2Eテスト作成 | Playwrightでの主要フロー | QA | 高 | 1日 | - |
| T12-003 | リスク対策の動作確認 | タイムアウト、圧縮、削除の検証 | 全員 | 高 | 1日 | **全リスク対策** |
| T12-004 | バグ修正 | 発見されたバグの修正 | 全員 | 高 | 1日 | - |
| T12-005 | パフォーマンステスト | 大量データでの動作確認 | QA | 中 | 0.5日 | **リスク1,3対策** |

**テストシナリオ(リスク対策)**:
```typescript
// tests/e2e/report-generation.spec.ts
import { test, expect } from '@playwright/test'

test('大量ファイルでのレポート生成(リスク1対策)', async ({ page }) => {
  await page.goto('/reports/new')
  
  // 10個のファイルをアップロード
  for (let i = 0; i < 10; i++) {
    await page.setInputFiles('input[type="file"]', `test-data/large-file-${i}.xlsx`)
  }
  
  // 生成開始
  await page.click('button:has-text("レポートを生成")')
  
  // 進捗バーが表示されることを確認
  await expect(page.locator('[data-testid="progress-bar"]')).toBeVisible()
  
  // タイムアウトせずに完了することを確認(最大5分)
  await expect(page.locator('text=完了')).toBeVisible({ timeout: 300000 })
})

test('画像圧縮の動作確認(リスク3対策)', async ({ page }) => {
  await page.goto('/reports/new')
  
  // 高解像度画像をアップロード
  const fileInput = await page.locator('input[type="file"]')
  await fileInput.setInputFiles('test-data/high-res-image.png')
  
  // アップロード完了を待つ
  await expect(page.locator('text=アップロード完了')).toBeVisible()
  
  // ストレージ使用量が適切に更新されていることを確認
  const storageUsed = await page.locator('[data-testid="storage-used"]').textContent()
  expect(parseInt(storageUsed)).toBeLessThan(5 * 1024 * 1024) // 5MB未満
})
```

---

## フェーズ13: デプロイと運用開始(8日目)

### 13.1. 本番環境デプロイ

| タスクID | タスク名 | 詳細 | 担当 | 優先度 | 工数 | リスク対策 |
|:---|:---|:---|:---|:---|:---|:---|
| T13-001 | Vercelプロジェクト作成 | GitHubリポジトリ連携 | DevOps | 高 | 0.5日 | - |
| T13-002 | 環境変数設定 | Vercelに全ての環境変数を設定 | DevOps | 高 | 0.5日 | - |
| T13-003 | Stripe Webhook設定 | 本番URLでWebhook登録 | DevOps | 高 | 0.5日 | - |
| T13-004 | カスタムドメイン設定 | DNS設定、SSL証明書 | DevOps | 中 | 0.5日 | - |
| T13-005 | エラー監視設定 | Sentry統合 | DevOps | 高 | 0.5日 | - |
| T13-006 | 本番デプロイ実施 | デプロイとスモークテスト | DevOps | 高 | 0.5日 | - |
| T13-007 | ドキュメント作成 | README、API仕様書 | 全員 | 中 | 1日 | - |

---

## リスク対策の実装状況チェックリスト

### リスク1: Dify APIタイムアウト対策

- [ ] T5-001: Upstash QStashセットアップ完了
- [ ] T5-002: ジョブキュークライアント実装完了
- [ ] T5-003: ジョブハンドラーAPI作成完了
- [ ] T5-004: 進捗更新ユーティリティ実装完了
- [ ] T5-005: Realtime購読コンポーネント実装完了
- [ ] T6-001: リトライロジック実装完了
- [ ] T6-003: 分割処理ロジック実装完了
- [ ] T12-005: パフォーマンステスト完了

### リスク2: Word生成の複雑さ対策

- [ ] T1-002: docxtemplater等のパッケージインストール完了
- [ ] T6-005: グラフ生成機能実装完了
- [ ] T7-001: Wordテンプレート準備完了
- [ ] T7-002: docxtemplater統合完了
- [ ] T7-003: 画像挿入モジュール設定完了
- [ ] T7-005: Markdownフォールバック実装完了

### リスク3: ストレージ容量対策

- [ ] T1-002: Sharpパッケージインストール完了
- [ ] T1-104: Supabase Storage設定完了
- [ ] T4-002: 画像圧縮ユーティリティ実装完了
- [ ] T4-003: 圧縮処理統合完了
- [ ] T4-004: ストレージ使用量チェック実装完了
- [ ] T4-005: ストレージ使用量更新実装完了
- [ ] T10-002: 古いファイル削除Cron Job実装完了
- [ ] T10-004: アラート機能実装完了
- [ ] T12-003: 圧縮動作の検証完了

---

## まとめ

本タスクリストは、3つの重大な技術的リスクへの対策を各フェーズに統合しています。特に以下の点に注意して開発を進めてください。

1. **フェーズ5(4日目前半)**: 非同期ジョブシステムの実装は最優先事項です。これがないとDify APIのタイムアウト問題が発生します。

2. **フェーズ4(3日目)**: 画像圧縮機能は必ず実装してください。これがないとストレージコストが急増します。

3. **フェーズ7(5日目前半)**: docxtemplaterを使用したテンプレートベースのアプローチにより、Word生成の複雑さを軽減します。

4. **フェーズ12(7日目後半)**: リスク対策の動作確認を必ず実施してください。特に大量データでのテストが重要です。

各タスクを着実に進めることで、8日間で安定したMVPを完成させることができます。

以上
