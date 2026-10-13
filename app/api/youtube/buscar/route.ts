import { NextResponse } from 'next/server'
import { actionContext } from '@/lib/auth/session'
import { decodeEntities } from '@/lib/youtube-search'

// Búsqueda de videos para armar misiones de repaso. La clave de la API de YouTube vive solo en el servidor
// (YOUTUBE_API_KEY, sin prefijo público): el navegador nunca la ve. Solo docentes pueden buscar.
export async function GET(req: Request) {
  const ctx = await actionContext('docente')
  if (!ctx) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim().slice(0, 100)
  if (q.length < 2) return NextResponse.json({ error: 'Escribe qué quieres buscar.' }, { status: 400 })
  const key = process.env.YOUTUBE_API_KEY
  if (!key) return NextResponse.json({ error: 'La búsqueda en YouTube aún no está configurada. Mientras tanto, pega el enlace del video.', code: 'not_configured' }, { status: 503 })

  const params = new URLSearchParams({
    part: 'snippet', type: 'video', maxResults: '8', q, key,
    safeSearch: 'strict', videoEmbeddable: 'true', relevanceLanguage: 'es', regionCode: 'CL',
  })
  try {
    const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`, { cache: 'no-store' })
    if (!res.ok) return NextResponse.json({ error: res.status === 403 ? 'YouTube rechazó la búsqueda: revisa la clave o el cupo diario de la API.' : 'No se pudo buscar en YouTube.' }, { status: 502 })
    const data = await res.json() as { items?: { id?: { videoId?: string }; snippet?: { title?: string; channelTitle?: string } }[] }
    const videos = (data.items ?? []).filter(v => v.id?.videoId).map(v => ({ id: v.id!.videoId!, title: decodeEntities(v.snippet?.title ?? 'Video'), channel: decodeEntities(v.snippet?.channelTitle ?? '') }))
    return NextResponse.json({ videos })
  } catch {
    return NextResponse.json({ error: 'No se pudo conectar con YouTube.' }, { status: 502 })
  }
}
