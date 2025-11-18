import { NextRequest } from "next/server"

const redactHeaders = (headers: Headers) => {
  const out: Record<string, string> = {}
  for (const [k, v] of headers.entries()) {
    const key = k.toLowerCase()
    if (key === "authorization" || key === "x-supabase-api-key") {
      out[key] = "[redacted]"
    } else {
      out[key] = v
    }
  }
  return out
}

export function logRequest(req: NextRequest, label = "request", extra?: Record<string, unknown>) {
  try {
    const url = new URL(req.url)
    // Keep logs compact; avoid dumping all headers by default
    const info = {
      method: req.method,
      path: url.pathname,
      search: url.search || undefined,
      ...(extra || {}),
    }
    // eslint-disable-next-line no-console
    console.log(`[API] ${label}`, info)
  } catch {
    // eslint-disable-next-line no-console
    console.log(`[API] ${label} (url parse failed)`, { method: req.method })
  }
}

export function logInfo(label: string, data?: Record<string, unknown>) {
  // eslint-disable-next-line no-console
  console.log(`[API] ${label}`, data || {})
}

export function logError(label: string, err: unknown, data?: Record<string, unknown>) {
  // eslint-disable-next-line no-console
  console.error(`[API] ${label}`, {
    ...(data || {}),
    error: err instanceof Error ? { message: err.message, stack: err.stack } : String(err),
  })
}

