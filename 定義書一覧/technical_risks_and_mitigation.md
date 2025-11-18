# 実験レポート自動化ツール 技術的リスクと対策

## 最重要リスク TOP 3

開発プロジェクト全体を通じて、以下の3つが最も重大な技術的リスクとして特定されました。これらのリスクは、プロジェクトの成否を左右する可能性があるため、事前に十分な対策を講じる必要があります。

---

## リスク1: Dify APIのレスポンス時間とタイムアウト問題

### 問題の詳細

実験データの分析は、本ツールの中核機能です。しかし、Dify APIに大量のデータ(複数のExcelファイル、高解像度の画像、長いコードファイル)を送信した場合、以下の問題が発生する可能性があります。

- **処理時間の長期化**: AI分析に5分以上かかる場合がある
- **タイムアウトエラー**: Vercelのサーバーレス関数は最大60秒(Hobby)または300秒(Pro)でタイムアウトする
- **ユーザー体験の悪化**: ユーザーが画面を開いたまま長時間待つことになり、離脱率が上昇する
- **リトライの困難性**: エラー発生時に、どこまで処理が進んだか不明確

### 影響度

**極めて高い** - この問題が解決されないと、ツールの基本機能が使用不可能になります。

### 具体的な対策

#### 対策1-1: 非同期ジョブキューの導入

Vercelのサーバーレス関数の制限を回避するため、長時間処理を非同期で実行します。

**実装方法**:

1. **Vercel Cron Jobsまたは外部ジョブキューの使用**
   - Vercel Cron Jobsで定期的にジョブをポーリング
   - または、Upstash QStash、Inngest、Triggerなどのサーバーレス対応ジョブキューを使用

2. **処理フロー**:
   ```
   ユーザー → 「生成開始」ボタン
   ↓
   API: レポートステータスを'processing'に更新、ジョブIDを発行
   ↓
   バックグラウンドジョブ: Dify API呼び出し(時間制限なし)
   ↓
   完了後: ステータスを'completed'に更新
   ↓
   フロントエンド: ポーリングまたはWebSocketで進捗を監視
   ```

3. **コード例**:
   ```typescript
   // app/api/reports/generate/route.ts
   export async function POST(request: Request) {
     const { reportId } = await request.json()
     
     // ステータスを更新
     await supabase
       .from('reports')
       .update({ status: 'processing' })
       .eq('id', reportId)
     
     // ジョブキューに追加(例: Upstash QStash)
     await qstash.publishJSON({
       url: `${process.env.NEXT_PUBLIC_APP_URL}/api/jobs/process-report`,
       body: { reportId }
     })
     
     return Response.json({ success: true })
   }
   ```

**メリット**:
- タイムアウトの心配がない
- ユーザーは他の作業を続けられる
- エラー時のリトライが容易

#### 対策1-2: 進捗状況のリアルタイム通知

ユーザーが処理状況を把握できるよう、リアルタイムで進捗を通知します。

**実装方法**:

1. **Supabase Realtime Subscriptionsの活用**:
   ```typescript
   // フロントエンド
   const supabase = createClient()
   
   useEffect(() => {
     const channel = supabase
       .channel('report-updates')
       .on('postgres_changes', {
         event: 'UPDATE',
         schema: 'public',
         table: 'reports',
         filter: `id=eq.${reportId}`
       }, (payload) => {
         setReportStatus(payload.new.status)
       })
       .subscribe()
     
     return () => {
       supabase.removeChannel(channel)
     }
   }, [reportId])
   ```

2. **段階的な進捗表示**:
   - reportsテーブルに`progress`カラム(0-100)を追加
   - Dify API処理中に定期的に進捗を更新
   - フロントエンドでプログレスバーを表示

**メリット**:
- ユーザーの不安を軽減
- 処理が進行中であることを明確に伝える
- 離脱率の低下

#### 対策1-3: データの分割送信と段階的処理

大量のデータを一度に送信せず、分割して処理します。

**実装方法**:

1. **ファイルごとに分割処理**:
   ```typescript
   // 各ファイルを個別にDify APIに送信
   for (const file of experimentFiles) {
     const result = await difyClient.analyze(file)
     await savePartialResult(reportId, file.id, result)
     await updateProgress(reportId, processedCount / totalCount * 100)
   }
   
   // 全ての結果を統合
   const finalResult = await combineResults(reportId)
   ```

2. **タイムアウト設定の調整**:
   ```typescript
   const difyClient = axios.create({
     baseURL: process.env.DIFY_API_URL,
     timeout: 120000, // 2分
     headers: {
       'Authorization': `Bearer ${process.env.DIFY_API_KEY}`
     }
   })
   ```

3. **リトライロジック**:
   ```typescript
   async function callDifyWithRetry(data: any, maxRetries = 3) {
     for (let i = 0; i < maxRetries; i++) {
       try {
         return await difyClient.post('/analyze', data)
       } catch (error) {
         if (i === maxRetries - 1) throw error
         await sleep(2000 * (i + 1)) // 指数バックオフ
       }
     }
   }
   ```

**メリット**:
- 一部のファイルでエラーが発生しても、他のファイルは処理できる
- タイムアウトのリスクを分散
- 進捗の可視化が容易

---

## リスク2: Word文書生成の複雑さとフォーマット再現性

### 問題の詳細

提供されたJinja2テンプレート(`total_template_fixed.docx`)を正確に再現することは、技術的に非常に困難です。特に以下の問題が発生する可能性があります。

- **複雑なレイアウトの再現困難**: 表、図、数式などの配置が崩れる
- **日本語フォントの問題**: MS明朝、ヒラギノ明朝などの特定フォントが環境によって利用できない
- **画像の配置とサイズ調整**: オシロスコープの画像やグラフを適切なサイズで挿入できない
- **ページ番号や目次の自動生成**: docxパッケージでは高度な機能が制限される
- **テンプレートの変更への対応**: 大学や学科ごとに異なるフォーマットに対応する必要がある

### 影響度

**高い** - レポートの見た目が悪いと、学生が提出前に手動で修正する必要があり、自動化の意味が薄れます。

### 具体的な対策

#### 対策2-1: テンプレートベースのアプローチ

既存のWord文書をテンプレートとして使用し、プレースホルダーを置換する方法を採用します。

**実装方法**:

1. **docxtemplaterライブラリの使用**:
   ```bash
   npm install docxtemplater pizzip
   ```

2. **テンプレートファイルの準備**:
   - `total_template_fixed.docx`をそのまま使用
   - プレースホルダーを配置: `{experiment_name}`, `{table_1}`, `{figure_1}`など

3. **実装例**:
   ```typescript
   import Docxtemplater from 'docxtemplater'
   import PizZip from 'pizzip'
   import fs from 'fs'
   
   export async function generateReport(templateData: any) {
     // テンプレートファイルを読み込み
     const content = fs.readFileSync('templates/total_template_fixed.docx', 'binary')
     const zip = new PizZip(content)
     const doc = new Docxtemplater(zip, {
       paragraphLoop: true,
       linebreaks: true
     })
     
     // データを設定
     doc.setData({
       chapter: templateData.chapter,
       experiments: templateData.experiments,
       consideration: templateData.consideration,
       summary: templateData.summary
     })
     
     // レンダリング
     doc.render()
     
     // バッファとして出力
     const buffer = doc.getZip().generate({ type: 'nodebuffer' })
     return buffer
   }
   ```

**メリット**:
- 元のフォーマットを完全に保持
- フォント、スタイル、レイアウトがそのまま維持される
- テンプレートの変更が容易

#### 対策2-2: 画像とグラフの事前生成

Word文書に挿入する前に、画像とグラフを適切なサイズで生成します。

**実装方法**:

1. **グラフ生成ライブラリの使用**:
   ```bash
   npm install chart.js canvas
   ```

2. **グラフ生成関数**:
   ```typescript
   import { ChartJSNodeCanvas } from 'chartjs-node-canvas'
   
   export async function generateGraph(data: number[], labels: string[]) {
     const width = 600
     const height = 400
     const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height })
     
     const configuration = {
       type: 'line',
       data: {
         labels: labels,
         datasets: [{
           label: '実験データ',
           data: data,
           borderColor: 'rgb(75, 192, 192)',
           tension: 0.1
         }]
       }
     }
     
     const buffer = await chartJSNodeCanvas.renderToBuffer(configuration)
     return buffer
   }
   ```

3. **画像のリサイズ**:
   ```bash
   npm install sharp
   ```
   
   ```typescript
   import sharp from 'sharp'
   
   export async function resizeImage(inputBuffer: Buffer, maxWidth: number) {
     return await sharp(inputBuffer)
       .resize(maxWidth, null, { fit: 'inside' })
       .toBuffer()
   }
   ```

4. **Word文書への挿入**:
   ```typescript
   // docxtemplaterのImageModuleを使用
   import ImageModule from 'docxtemplater-image-module'
   
   const imageOpts = {
     centered: false,
     getImage: (tagValue: string) => {
       return fs.readFileSync(tagValue)
     },
     getSize: () => [600, 400] // 幅と高さ
   }
   
   const doc = new Docxtemplater(zip, {
     modules: [new ImageModule(imageOpts)]
   })
   ```

**メリット**:
- 画像サイズが統一され、レイアウトが崩れない
- グラフの品質が高い
- カスタマイズが容易

#### 対策2-3: フォールバック機能とプレビュー

生成に失敗した場合や、ユーザーが手動で調整したい場合に備えます。

**実装方法**:

1. **Markdown形式での出力オプション**:
   ```typescript
   export async function generateMarkdownReport(templateData: any) {
     let markdown = `# ${templateData.chapter}. 実験結果\n\n`
     
     for (const exp of templateData.experiments) {
       markdown += `## ${exp.name}\n\n`
       markdown += `${exp.description}\n\n`
       
       for (const table of exp.tables) {
         markdown += `### ${table.caption}\n\n`
         markdown += generateMarkdownTable(table.data)
       }
     }
     
     return markdown
   }
   ```

2. **プレビュー機能**:
   - 生成前にブラウザでプレビューを表示
   - ユーザーが内容を確認してから生成を実行
   - 問題があれば手動で修正可能

3. **エラー時の代替処理**:
   ```typescript
   try {
     const docxBuffer = await generateReport(templateData)
     return docxBuffer
   } catch (error) {
     console.error('Word生成エラー:', error)
     // Markdownにフォールバック
     const markdown = await generateMarkdownReport(templateData)
     return markdown
   }
   ```

**メリット**:
- Word生成に失敗してもレポートは提供できる
- ユーザーが自分で調整できる
- 柔軟性が高い

---

## リスク3: Supabase Storageの容量制限とコスト増加

### 問題の詳細

学生が実験データ(特に高解像度の画像やオシロスコープのスクリーンショット)を大量にアップロードすると、以下の問題が発生します。

- **ストレージ容量の急速な消費**: Supabaseの無料プランは1GBまで、Proプランでも100GB
- **コストの急増**: 100GBを超えると追加料金が発生($0.021/GB/月)
- **ダウンロード帯域幅の制限**: 無料プランは2GB/月、Proプランは200GB/月
- **パフォーマンスの低下**: 大量のファイルアクセスでレスポンスが遅くなる
- **古いデータの管理**: 卒業した学生のデータをどうするか

### 影響度

**高い** - 運用コストが予想を大きく上回り、サービスの継続が困難になる可能性があります。

### 具体的な対策

#### 対策3-1: 画像の自動圧縮と最適化

アップロード時に画像を自動的に圧縮し、ストレージ使用量を削減します。

**実装方法**:

1. **アップロード時の圧縮処理**:
   ```typescript
   import sharp from 'sharp'
   
   export async function compressImage(buffer: Buffer, fileType: string) {
     if (fileType === 'image') {
       return await sharp(buffer)
         .resize(1920, 1080, { fit: 'inside', withoutEnlargement: true })
         .jpeg({ quality: 80 })
         .toBuffer()
     }
     return buffer
   }
   ```

2. **API実装**:
   ```typescript
   // app/api/upload/route.ts
   export async function POST(request: Request) {
     const formData = await request.formData()
     const file = formData.get('file') as File
     const buffer = Buffer.from(await file.arrayBuffer())
     
     // 画像の場合は圧縮
     const optimizedBuffer = await compressImage(buffer, file.type)
     
     // Supabase Storageにアップロード
     const { data, error } = await supabase.storage
       .from('experiment-files')
       .upload(`${userId}/${reportId}/${file.name}`, optimizedBuffer)
     
     return Response.json({ success: true, path: data.path })
   }
   ```

3. **ファイルサイズ制限の設定**:
   ```typescript
   const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
   
   if (buffer.length > MAX_FILE_SIZE) {
     return Response.json(
       { error: 'ファイルサイズが10MBを超えています' },
       { status: 400 }
     )
   }
   ```

**メリット**:
- ストレージ使用量を50-70%削減
- アップロード・ダウンロード速度の向上
- ユーザー体験の改善

#### 対策3-2: 古いファイルの自動削除ポリシー

一定期間経過後、自動的にファイルを削除します。

**実装方法**:

1. **Supabase Edge Functionでの定期削除**:
   ```typescript
   // supabase/functions/cleanup-old-files/index.ts
   import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
   import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
   
   serve(async (req) => {
     const supabase = createClient(
       Deno.env.get('SUPABASE_URL')!,
       Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
     )
     
     // 6ヶ月以上前のレポートを取得
     const sixMonthsAgo = new Date()
     sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
     
     const { data: oldReports } = await supabase
       .from('reports')
       .select('id, user_id')
       .lt('created_at', sixMonthsAgo.toISOString())
     
     // ファイルを削除
     for (const report of oldReports) {
       await supabase.storage
         .from('experiment-files')
         .remove([`${report.user_id}/${report.id}`])
     }
     
     return new Response('Cleanup completed', { status: 200 })
   })
   ```

2. **Vercel Cron Jobsでの定期実行**:
   ```typescript
   // app/api/cron/cleanup/route.ts
   export async function GET(request: Request) {
     // 認証チェック(Vercel Cron Secret)
     const authHeader = request.headers.get('authorization')
     if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
       return Response.json({ error: 'Unauthorized' }, { status: 401 })
     }
     
     // 古いファイルの削除処理
     await cleanupOldFiles()
     
     return Response.json({ success: true })
   }
   ```

3. **vercel.json設定**:
   ```json
   {
     "crons": [{
       "path": "/api/cron/cleanup",
       "schedule": "0 0 * * 0"
     }]
   }
   ```

**メリット**:
- ストレージコストの抑制
- データベースのパフォーマンス維持
- GDPR等のデータ保持規制への対応

#### 対策3-3: ストレージ使用量の監視とアラート

使用量を監視し、閾値を超えた場合に通知します。

**実装方法**:

1. **ユーザーごとの使用量追跡**:
   ```typescript
   // usersテーブルにカラムを追加
   ALTER TABLE users ADD COLUMN storage_used BIGINT DEFAULT 0;
   
   // アップロード時に使用量を更新
   export async function updateStorageUsage(userId: string, fileSize: number) {
     await supabase.rpc('increment_storage', {
       user_id: userId,
       size: fileSize
     })
   }
   
   // PostgreSQL関数
   CREATE OR REPLACE FUNCTION increment_storage(user_id UUID, size BIGINT)
   RETURNS VOID AS $$
   BEGIN
     UPDATE users
     SET storage_used = storage_used + size
     WHERE id = user_id;
   END;
   $$ LANGUAGE plpgsql;
   ```

2. **使用量制限の実装**:
   ```typescript
   const FREE_PLAN_LIMIT = 100 * 1024 * 1024 // 100MB
   const PREMIUM_PLAN_LIMIT = 1024 * 1024 * 1024 // 1GB
   
   export async function checkStorageLimit(userId: string, fileSize: number) {
     const { data: user } = await supabase
       .from('users')
       .select('storage_used, subscription_status')
       .eq('id', userId)
       .single()
     
     const limit = user.subscription_status === 'premium' 
       ? PREMIUM_PLAN_LIMIT 
       : FREE_PLAN_LIMIT
     
     if (user.storage_used + fileSize > limit) {
       throw new Error('ストレージ容量の上限に達しました')
     }
   }
   ```

3. **管理者向けダッシュボード**:
   ```typescript
   // app/(dashboard)/admin/storage/page.tsx
   export default async function StorageDashboard() {
     const { data: stats } = await supabase
       .from('users')
       .select('subscription_status, storage_used')
     
     const totalUsage = stats.reduce((sum, user) => sum + user.storage_used, 0)
     
     return (
       <div>
         <h1>ストレージ使用状況</h1>
         <p>合計使用量: {(totalUsage / 1024 / 1024 / 1024).toFixed(2)} GB</p>
         {/* グラフやアラート表示 */}
       </div>
     )
   }
   ```

**メリット**:
- コストの予測可能性
- ユーザーへの透明性
- 早期の問題発見

---

## まとめ: リスク対策の優先順位

| リスク | 優先度 | 対策の緊急性 | 実装タイミング |
|:---|:---|:---|:---|
| **Dify APIタイムアウト** | 最高 | 極めて高い | フェーズ6(4日目)で必須実装 |
| **Word生成の複雑さ** | 高 | 高い | フェーズ6(4日目)、改善はフェーズ10(6日目) |
| **ストレージ容量問題** | 高 | 中程度 | フェーズ5(3日目)に圧縮実装、削除ポリシーは運用開始後 |

これらのリスクに対して、開発の早い段階から対策を講じることで、プロジェクトの成功確率を大幅に高めることができます。特に**リスク1(Dify APIタイムアウト)**は、ツールの根幹に関わるため、最優先で対応してください。

以上
