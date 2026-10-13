'use client'
import { useState } from 'react'
import { CheckCircle2, Link2, Loader2, Search } from 'lucide-react'
import { youtubeEmbed, youtubeId, youtubeThumb } from '@/lib/youtube'
import { Field, Input } from '@/components/ui/primitives'

type Result = { id: string; title: string; channel: string }

/** Elegir un video para una misión: se busca en YouTube sin salir de la plataforma, o se pega el enlace.
 *  La búsqueda pasa por el servidor (la clave de la API no llega al navegador). */
export function VideoPicker() {
  const [link, setLink] = useState('')
  const [title, setTitle] = useState('')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const id = youtubeId(link)

  const search = async () => {
    if (query.trim().length < 2 || busy) return
    setBusy(true); setNote(null)
    try {
      const res = await fetch(`/api/youtube/buscar?q=${encodeURIComponent(query.trim())}`)
      const data = await res.json() as { videos?: Result[]; error?: string }
      if (!res.ok) { setResults([]); setNote(data.error ?? 'No se pudo buscar.') }
      else { setResults(data.videos ?? []); if (!data.videos?.length) setNote('No encontramos videos con esa búsqueda.') }
    } catch { setNote('No se pudo buscar. Revisa tu conexión.') }
    setBusy(false)
  }

  return (
    <div className="space-y-4">
      <div>
        <span className="mb-1 block text-[12.5px] font-medium text-v-text">Buscar en YouTube</span>
        <div className="flex gap-2">
          <Input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void search() } }} placeholder="Ej.: fracciones equivalentes explicación" aria-label="Buscar en YouTube" />
          <button type="button" onClick={() => void search()} disabled={busy} className="v-brand inline-flex h-11 shrink-0 items-center gap-2 rounded-full px-5 text-[13.5px] font-semibold disabled:opacity-60">{busy ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}Buscar</button>
        </div>
        {note && <p className="mt-2 rounded-v-sm bg-v-warning/10 px-3 py-2 text-[12.5px] text-v-text">{note}</p>}
        {results.length > 0 && (
          <ul className="mt-3 grid max-h-72 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
            {results.map(v => {
              const on = id === v.id
              return (
                <li key={v.id}>
                  <button type="button" onClick={() => { setLink(`https://youtu.be/${v.id}`); setTitle(t => t || v.title) }} aria-pressed={on}
                    className={`flex w-full items-center gap-3 rounded-v-sm border p-2 text-left transition-colors ${on ? 'border-v-accent bg-v-accent-soft' : 'border-v-border hover:border-v-accent/50'}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={youtubeThumb(v.id)} alt="" className="h-14 w-24 shrink-0 rounded-md object-cover" />
                    <span className="min-w-0 flex-1"><span className="line-clamp-2 text-[12.5px] font-semibold leading-snug text-v-text">{v.title}</span><span className="block truncate text-[11.5px] text-v-muted">{v.channel}</span></span>
                    {on && <CheckCircle2 size={17} className="shrink-0 text-v-accent" />}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <Field label="O pega el enlace del video" hint="De youtube.com o youtu.be.">
        <div className="relative"><Link2 size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-v-subtle" />
          <Input name="video" required value={link} onChange={e => setLink(e.target.value)} placeholder="https://www.youtube.com/watch?v=…" className="!pl-10" /></div>
      </Field>
      {link && !id && <p className="-mt-2 text-[12.5px] text-v-danger">Ese no parece un enlace de YouTube válido.</p>}
      {id && (
        <div className="aspect-video w-full overflow-hidden rounded-v-sm bg-black">
          <iframe src={youtubeEmbed(id)} title="Vista previa del video" className="size-full" loading="lazy" referrerPolicy="strict-origin-when-cross-origin" allow="encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
        </div>
      )}
      <Field label="Qué le dices al estudiante" hint="Ej.: «Mira cómo se simplifican las fracciones». Revisa el video completo antes de agregarlo.">
        <Input name="prompt" value={title} onChange={e => setTitle(e.target.value)} maxLength={200} placeholder="Mira este video" />
      </Field>
    </div>
  )
}
