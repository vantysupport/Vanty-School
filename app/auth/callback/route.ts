import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Destino de los enlaces de recuperación de acceso: canjea el código por una sesión y continúa.
export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const next = url.searchParams.get('next') ?? '/'
  // Solo rutas internas: evita redirecciones abiertas.
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(new URL(safeNext, url.origin))
  }
  return NextResponse.redirect(new URL('/login', url.origin))
}
