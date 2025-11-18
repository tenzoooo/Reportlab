import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request)

  const { pathname } = request.nextUrl

  // Protect dashboard routes
  if (pathname.startsWith('/dashboard')) {
    if (!user) {
      const url = new URL('/login', request.url)
      return NextResponse.redirect(url)
    }
  }

  // Redirect logged-in users away from auth pages
  if ((pathname === '/login' || pathname === '/register') && user) {
    const url = new URL('/dashboard', request.url)
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: [
    // Run on all paths except static files and images
    '/((?!_next/static|_next/image|favicon.ico|icon.*|apple-icon.png|.*\\.(?:png|jpg|jpeg|svg|gif|ico)$).*)',
  ],
}

