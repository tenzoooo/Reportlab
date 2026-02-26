// lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'

const looksLikeSessionObject = (value: unknown) => {
  if (!value || typeof value !== "object") return false
  const record = value as Record<string, unknown>
  return typeof record.access_token === "string" && typeof record.refresh_token === "string"
}

const repairSupabaseAuthStorage = (supabaseUrl: string) => {
  if (typeof window === "undefined") return

  try {
    const projectRef = new URL(supabaseUrl).hostname.split(".")[0]
    const authKeyPrefix = `sb-${projectRef}-auth-token`

    const keys: string[] = []
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i)
      if (key && key.startsWith(authKeyPrefix)) keys.push(key)
    }

    for (const key of keys) {

      const raw = window.localStorage.getItem(key)
      if (!raw) continue

      let parsed: unknown = null
      try {
        parsed = JSON.parse(raw)
      } catch {
        // keep unknown formats untouched
        continue
      }

      if (typeof parsed !== "string") continue

      const normalized = parsed.trim()
      if (!normalized) {
        window.localStorage.removeItem(key)
        continue
      }

      try {
        const reparsed = JSON.parse(normalized)
        if (looksLikeSessionObject(reparsed) || Array.isArray(reparsed)) {
          window.localStorage.setItem(key, JSON.stringify(reparsed))
        } else {
          // Invalid payload: clear to avoid auth client crash.
          window.localStorage.removeItem(key)
        }
      } catch {
        window.localStorage.removeItem(key)
      }
    }
  } catch {
    // best-effort repair only
  }
}

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  repairSupabaseAuthStorage(supabaseUrl)

  const safeFetch: typeof fetch = async (input, init) => {
    try {
      return await fetch(input, init)
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.warn('[supabase] fetch failed', err)
      }
      return new Response(JSON.stringify({ error: { message: err instanceof Error ? err.message : String(err) } }), {
        status: 599,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  }

  return createBrowserClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      global: { fetch: safeFetch },
    }
  )
}
