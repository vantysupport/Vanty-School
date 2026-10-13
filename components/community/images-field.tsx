'use client'
import { useState } from 'react'
import { ImagePlus, Loader2, X } from 'lucide-react'
import { browserClient } from '@/lib/supabase/client'
import { IMAGE_TYPES, MAX_IMAGES } from '@/lib/community'

const MAX_BYTES = 5 * 1024 * 1024

/** Hasta cuatro imágenes para una publicación. Se suben a la carpeta de comunidad del colegio y la ruta viaja en
 *  campos ocultos `images[]`; la Server Action vuelve a validar cada ruta. */
export function ImagesField({ prefix }: { prefix: string }) {
  const [items, setItems] = useState<{ path: string; preview: string }[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const upload = async (files: FileList | null) => {
    if (!files?.length) return
    setError(null)
    const room = MAX_IMAGES - items.length
    const chosen = [...files].slice(0, room)
    if (files.length > room) setError(`Puedes adjuntar hasta ${MAX_IMAGES} imágenes.`)
    setBusy(true)
    const added: { path: string; preview: string }[] = []
    for (const file of chosen) {
      const ext = IMAGE_TYPES[file.type]
      if (!ext) { setError('Usa imágenes JPG, PNG o WebP.'); continue }
      if (file.size > MAX_BYTES) { setError('Cada imagen puede pesar hasta 5 MB.'); continue }
      const path = `${prefix}${crypto.randomUUID()}.${ext}`
      const { error: upErr } = await browserClient().storage.from('materials').upload(path, file, { contentType: file.type })
      if (upErr) { setError('No se pudo subir una de las imágenes.'); continue }
      added.push({ path, preview: URL.createObjectURL(file) })
    }
    setItems(prev => [...prev, ...added])
    setBusy(false)
  }

  const remove = (path: string) => {
    setItems(prev => prev.filter(i => i.path !== path))
    void browserClient().storage.from('materials').remove([path])
  }

  return (
    <div>
      <span className="mb-1.5 block text-[13px] font-medium text-v-muted">Imágenes <span className="font-normal text-v-subtle">· opcional, hasta {MAX_IMAGES}</span></span>
      <div className="flex flex-wrap gap-2">
        {items.map(i => (
          <div key={i.path} className="relative size-24 overflow-hidden rounded-v-sm border border-v-border">
            <input type="hidden" name="images[]" value={i.path} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={i.preview} alt="" className="size-full object-cover" />
            <button type="button" onClick={() => remove(i.path)} aria-label="Quitar imagen" className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-[#081426]/70 text-white hover:bg-[#081426]"><X size={13} /></button>
          </div>
        ))}
        {items.length < MAX_IMAGES && (
          <label className="grid size-24 cursor-pointer place-items-center rounded-v-sm border border-dashed border-v-border-strong text-v-muted hover:border-v-accent hover:bg-v-accent-soft hover:text-v-accent">
            <span className="flex flex-col items-center gap-1 text-[11px] font-semibold">{busy ? <Loader2 size={18} className="animate-spin" /> : <ImagePlus size={18} />}{busy ? 'Subiendo…' : 'Agregar'}</span>
            <input type="file" multiple accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={busy} onChange={e => { void upload(e.target.files); e.target.value = '' }} />
          </label>
        )}
      </div>
      <p className="mt-1.5 text-xs text-v-subtle">No subas fotos donde se reconozca a estudiantes sin la autorización de sus apoderados.</p>
      {error && <p role="alert" className="mt-1 text-xs text-v-danger">{error}</p>}
    </div>
  )
}
