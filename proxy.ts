// Proxy global (Next.js 16: proxy.ts reemplaza a middleware.ts).
// 1) Renueva la sesión de Supabase en cada petición. 2) Sin sesión no se entra a ningún panel ni a /api.
// La autorización por rol e institución se vuelve a validar en cada layout, acción y política RLS.

import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// La portada ('/') y sus archivos ('/landing/', que incluye un video) son públicos.
const PUBLIC_PATHS = ['/', '/login', '/recuperar', '/restablecer']
const PUBLIC_PREFIXES = ['/invitacion/', '/auth/', '/landing/']

export async function proxy(req: NextRequest) {
  let res = NextResponse.next({ request: req })
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll(list) {
        for (const { name, value } of list) req.cookies.set(name, value)
        res = NextResponse.next({ request: req })
        for (const { name, value, options } of list) res.cookies.set(name, value, options)
      },
    },
  })

  // getClaims valida la firma del token y lo renueva si venció.
  const { data } = await supabase.auth.getClaims()
  const signedIn = !!data?.claims?.sub

  const { pathname } = req.nextUrl
  const isPublic = PUBLIC_PATHS.includes(pathname) || PUBLIC_PREFIXES.some(p => pathname.startsWith(p))

  if (!signedIn && !isPublic) {
    if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    return NextResponse.redirect(url)
  }
  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)'],
}
