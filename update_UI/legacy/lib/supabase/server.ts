// lib/supabase/server.ts
import { createServerClient, type CookieOptions } from "@supabase/ssr"
import { createClient as createAdminClient, createClient as createSupabaseClient } from "@supabase/supabase-js"
import { cookies, headers } from "next/headers"
import type { Database } from "@/lib/supabase/types"

export async function createClient() {
  const cookieStore = await cookies()
  const headerStore = await headers()

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  // If Authorization: Bearer <jwt> is present, prefer token-based client.
  const authz = headerStore.get("authorization") ?? headerStore.get("Authorization")
  if (authz && authz.toLowerCase().startsWith("bearer ")) {
    return createSupabaseClient<Database>(supabaseUrl, supabaseAnon, {
      global: {
        headers: {
          Authorization: authz,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  }

  // Fallback to cookie-based SSR client
  return createServerClient<Database>(supabaseUrl, supabaseAnon, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value
      },
      set(name: string, value: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value, ...options })
        } catch {
          // Server Component経由のsetは失敗する場合があるため無視
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value: "", ...options })
        } catch {
          // Server Component経由のremoveは失敗する場合があるため無視
        }
      },
    },
  })
}

export function createServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceKey) {
    throw new Error("Missing Supabase service role environment variables.")
  }

  return createAdminClient<Database>(supabaseUrl, serviceKey)
}
