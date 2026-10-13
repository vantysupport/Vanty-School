import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Destino de los enlaces de recuperación que envía la propia aplicación por correo:
// verifica el token de un solo uso en el servidor, abre la sesión y lleva a elegir la nueva contraseña.
export async function GET(req: Request) {
  const url = new URL(req.url)
  const tokenHash = url.searchParams.get('token_hash')
  if (tokenHash && url.searchParams.get('type') === 'recovery') {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({ type: 'recovery', token_hash: tokenHash })
    if (!error) return NextResponse.redirect(new URL('/restablecer', url.origin))
  }
  return NextResponse.redirect(new URL('/login', url.origin))
}
