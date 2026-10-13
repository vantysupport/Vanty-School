// Utilidades de YouTube sin acceso a red: se pueden usar en el servidor y en el navegador.

/** Extrae el identificador de un video desde un enlace de YouTube (watch, youtu.be, shorts, embed) o desde el id mismo. */
export function youtubeId(input: string): string | null {
  const text = input.trim()
  if (/^[A-Za-z0-9_-]{11}$/.test(text)) return text
  try {
    const url = new URL(text.startsWith('http') ? text : `https://${text}`)
    const host = url.hostname.replace(/^www\.|^m\./, '')
    let id: string | null = null
    if (host === 'youtu.be') id = url.pathname.slice(1).split('/')[0]
    else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      id = url.pathname === '/watch' ? url.searchParams.get('v') : url.pathname.match(/^\/(?:embed|shorts|live)\/([^/?]+)/)?.[1] ?? null
    }
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null
  } catch { return null }
}

/** Reproductor incrustado en el dominio sin cookies de YouTube, sin videos relacionados de otros canales. */
export const youtubeEmbed = (id: string) => `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&playsinline=1`
export const youtubeThumb = (id: string) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`
