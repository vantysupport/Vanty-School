import { NextResponse } from 'next/server'
import { actionContext } from '@/lib/auth/session'

// Descarga de archivos: genera un enlace firmado de 60 s con la sesión del usuario.
// Las políticas de storage.objects deciden si esa persona puede leer el archivo.
export async function GET(req: Request) {
  const ctx = await actionContext()
  if (!ctx) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const url = new URL(req.url)
  const bucket = url.searchParams.get('b')
  const path = url.searchParams.get('p') ?? ''
  if ((bucket !== 'materials' && bucket !== 'submissions' && bucket !== 'evidence') || !path || path.includes('..')) {
    return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400 })
  }
  // Solo archivos del colegio activo.
  if (!path.startsWith(`${ctx.session.institutionId}/`)) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const { data, error } = await ctx.db.storage.from(bucket).createSignedUrl(path, 60)
  if (error || !data?.signedUrl) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  return NextResponse.redirect(data.signedUrl)
}
