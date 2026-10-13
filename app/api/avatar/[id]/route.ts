import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Foto de perfil de una persona. El archivo es privado: se entrega solo si quien pregunta puede ver ese perfil
// (RLS sobre profiles y sobre storage.objects; aquí no se repite la comprobación). Si no hay foto, o no hay permiso,
// responde un píxel transparente y el avatar muestra las iniciales; así no se revela si la persona existe ni si tiene foto.

const EMPTY = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')
const empty = () => new NextResponse(EMPTY, { headers: { 'Content-Type': 'image/gif', 'Cache-Control': 'private, max-age=120' } })
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID.test(id)) return empty()
  const db = await createClient()

  const { data: profile } = await db.from('profiles').select('avatar_path').eq('id', id).maybeSingle()
  const path = profile?.avatar_path as string | null | undefined
  if (!path || !path.startsWith(`${id}/`)) return empty()

  const { data } = await db.storage.from('avatars').createSignedUrl(path, 600)
  if (!data?.signedUrl) return empty()
  const res = NextResponse.redirect(data.signedUrl, 302)
  res.headers.set('Cache-Control', 'private, max-age=300')
  return res
}
