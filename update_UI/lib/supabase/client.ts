// lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
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
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: safeFetch },
    }
  )
}
