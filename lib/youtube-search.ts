import 'server-only'

/** Los títulos de la API de YouTube vienen con entidades HTML; se devuelven como texto normal. */
export const decodeEntities = (text: string) => text.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')

export type YoutubeVideo = { id: string; title: string; channel: string }

/** Busca videos en YouTube desde el servidor (YOUTUBE_API_KEY, sin prefijo público). Siempre con filtro de contenido
 *  estricto y solo videos que se puedan ver incrustados. Devuelve null si la clave no está configurada o YouTube falla. */
export async function searchYoutube(query: string, max = 5): Promise<YoutubeVideo[] | null> {
  const key = process.env.YOUTUBE_API_KEY
  const q = query.trim().slice(0, 100)
  if (!key || q.length < 2) return null
  const params = new URLSearchParams({
    part: 'snippet', type: 'video', maxResults: String(max), q, key,
    safeSearch: 'strict', videoEmbeddable: 'true', relevanceLanguage: 'es', regionCode: 'CL', videoDuration: 'medium',
  })
  try {
    const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`, { cache: 'no-store', signal: AbortSignal.timeout(8000) })
    if (!res.ok) { console.warn(`[YouTube] búsqueda → HTTP ${res.status}`); return null }
    const data = await res.json() as { items?: { id?: { videoId?: string }; snippet?: { title?: string; channelTitle?: string } }[] }
    return (data.items ?? []).filter(v => /^[A-Za-z0-9_-]{11}$/.test(v.id?.videoId ?? '')).map(v => ({ id: v.id!.videoId!, title: decodeEntities(v.snippet?.title ?? 'Video'), channel: decodeEntities(v.snippet?.channelTitle ?? '') }))
  } catch { return null }
}
