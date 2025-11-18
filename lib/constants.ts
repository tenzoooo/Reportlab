// lib/constants.ts

// Supabase Storage
export const STORAGE_BUCKET = "experiment-files"

// ストレージ制限(バイト単位)
export const STORAGE_LIMITS = {
  FREE: 100 * 1024 * 1024, // 100MB
  PREMIUM: 1024 * 1024 * 1024, // 1GB
} as const

// レポート作成制限(月あたり)
export const REPORT_LIMITS = {
  FREE: 5,
  PREMIUM: Infinity,
} as const

// ファイルサイズ制限
export const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

// 対応ファイル形式
export const ALLOWED_FILE_TYPES = {
  EXCEL: [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
  ],
  IMAGE: ["image/jpeg", "image/png", "image/gif", "image/webp"],
  CODE: ["text/plain", "text/x-python", "application/javascript"],
  DOCUMENT: ["application/pdf"],
} as const

// 画像圧縮設定
export const IMAGE_COMPRESSION = {
  MAX_WIDTH: 1920,
  MAX_HEIGHT: 1080,
  QUALITY: 80,
} as const

// Dify API設定
export const DIFY_CONFIG = {
  TIMEOUT: 600000, // 10分
  MAX_RETRIES: 3,
  RETRY_DELAY: 2000, // 2秒
} as const

// 自動削除設定
export const AUTO_DELETE_MONTHS = 6

// ページネーション
export const ITEMS_PER_PAGE = 10

// サブスクリプションプラン
export const SUBSCRIPTION_PLANS = {
  FREE: "free",
  PREMIUM: "premium",
} as const

// レポートステータス
export const REPORT_STATUS = {
  DRAFT: "draft",
  PROCESSING: "processing",
  COMPLETED: "completed",
  ERROR: "error",
} as const

// ファイルタイプ
export const FILE_TYPE = {
  EXCEL: "excel",
  IMAGE: "image",
  CODE: "code",
  PAST_REPORT: "past_report",
  DOCUMENT: "document",
} as const

// エラーメッセージ
export const ERROR_MESSAGES = {
  // 認証エラー
  AUTH_INVALID_CREDENTIALS: "メールアドレスまたはパスワードが正しくありません",
  AUTH_EMAIL_ALREADY_EXISTS: "このメールアドレスは既に登録されています",
  AUTH_WEAK_PASSWORD: "パスワードは8文字以上で、大文字・小文字・数字を含む必要があります",

  // ファイルエラー
  FILE_TOO_LARGE: "ファイルサイズが10MBを超えています",
  FILE_INVALID_TYPE: "対応していないファイル形式です",

  // ストレージエラー
  STORAGE_LIMIT_EXCEEDED: "ストレージ容量の上限に達しました",

  // レポートエラー
  REPORT_LIMIT_EXCEEDED: "今月のレポート作成上限に達しました",
  REPORT_NOT_FOUND: "レポートが見つかりません",
  REPORT_GENERATION_FAILED: "レポート生成に失敗しました",

  // 一般エラー
  UNKNOWN_ERROR: "予期しないエラーが発生しました",
  NETWORK_ERROR: "ネットワークエラーが発生しました",
} as const
