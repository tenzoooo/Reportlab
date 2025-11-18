import { createClient } from "@/lib/supabase/client"

const BUCKET_NAME = "experiment-files"

/**
 * Returns a temporary download URL for the given storage object.
 * Falls back to the public URL when the bucket is public and signing fails.
 */
export const getFileUrl = async (path: string | null | undefined, downloadName?: string) => {
  if (!path) throw new Error("ファイルパスが指定されていません")

  const supabase = createClient()
  const objectPath = path.replace(/^\/+/, "")

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .createSignedUrl(objectPath, 60 * 60, downloadName ? { download: downloadName } : {})

  const signedUrl = data?.signedUrl
  const isTrulySigned = Boolean(signedUrl && (signedUrl.includes("/sign/") || signedUrl.includes("token=")))

  if (!error && isTrulySigned && signedUrl) {
    return signedUrl
  }

  // If the bucket is public (temporary), fallback to the public URL.
  const publicUrl = supabase.storage.from(BUCKET_NAME).getPublicUrl(objectPath).data.publicUrl
  if (publicUrl) {
    if (downloadName) {
      const separator = publicUrl.includes("?") ? "&" : "?"
      return `${publicUrl}${separator}download=${encodeURIComponent(downloadName)}`
    }
    return publicUrl
  }

  throw error ?? new Error("署名付きURLの作成に失敗しました")
}
