'use client'
import { useState } from 'react'
import { FileText, Film, ImageIcon, Loader2, Mic, Paperclip, X } from 'lucide-react'
import { browserClient } from '@/lib/supabase/client'

export type Evidence = { path: string; name: string; type: string; size: number }

const MAX_FILES = 5
const MAX_BYTES = 50 * 1024 * 1024
const size = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`)

export function EvidenceIcon({ type, size: px = 16 }: { type: string; size?: number }) {
  return type.startsWith('image/') ? <ImageIcon size={px} /> : type.startsWith('video/') ? <Film size={px} /> : type.startsWith('audio/') ? <Mic size={px} /> : <FileText size={px} />
}

/** Pruebas opcionales de un caso: fotos, capturas, documentos, audio o video. Se suben al bucket confidencial `evidence`
 *  con la sesión de quien reporta y viajan al formulario como JSON en un campo oculto, que la Server Action vuelve a validar. */
export function EvidenceField({ prefix }: { prefix: string }) {
  const [files, setFiles] = useState<Evidence[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const upload = async (picked: FileList | null) => {
    if (!picked?.length) return
    setError(null)
    const room = MAX_FILES - files.length
    const list = [...picked].slice(0, room)
    if (picked.length > room) setError(`Puedes adjuntar hasta ${MAX_FILES} archivos.`)
    setBusy(true)
    const added: Evidence[] = []
    for (const file of list) {
      if (file.size > MAX_BYTES) { setError(`«${file.name}» supera los 50 MB.`); continue }
      const safe = file.name.normalize('NFD').replace(/[^\w.\- ]+/g, '').replace(/\s+/g, '_').slice(-80) || 'archivo'
      const path = `${prefix}/${crypto.randomUUID()}-${safe}`
      const { error: upErr } = await browserClient().storage.from('evidence').upload(path, file, { contentType: file.type || undefined })
      if (upErr) { setError(/mime|type/i.test(upErr.message) ? `«${file.name}»: ese tipo de archivo no está permitido.` : `No se pudo subir «${file.name}».`); continue }
      added.push({ path, name: file.name.slice(0, 200), type: file.type || 'application/octet-stream', size: file.size })
    }
    setFiles(current => [...current, ...added])
    setBusy(false)
  }

  return (
    <div>
      <span className="mb-1 block text-[12.5px] font-medium text-v-text">Pruebas <span className="font-normal text-v-subtle">· opcional</span></span>
      <input type="hidden" name="evidence" value={JSON.stringify(files)} />
      {files.length > 0 && (
        <ul className="mb-2 space-y-1.5">
          {files.map(f => (
            <li key={f.path} className="flex items-center gap-2.5 rounded-v-sm border border-v-border-strong bg-v-fill px-3 py-2 text-[13px]">
              <span className="shrink-0 text-v-accent"><EvidenceIcon type={f.type} /></span>
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
              <span className="shrink-0 text-xs text-v-subtle">{size(f.size)}</span>
              <button type="button" onClick={() => setFiles(current => current.filter(x => x.path !== f.path))} aria-label={`Quitar ${f.name}`} className="shrink-0 text-v-subtle hover:text-v-text"><X size={14} /></button>
            </li>
          ))}
        </ul>
      )}
      {files.length < MAX_FILES && (
        <label className="relative flex cursor-pointer items-center gap-2.5 rounded-v-sm border border-dashed border-v-border-strong px-3.5 py-3 text-[13px] text-v-muted hover:bg-v-fill">
          {busy ? <Loader2 size={16} className="shrink-0 animate-spin" /> : <Paperclip size={16} className="shrink-0" />}
          <span>{busy ? 'Subiendo…' : files.length ? 'Agregar otro archivo' : 'Adjuntar fotos, capturas, documentos, audio o video'}</span>
          <input type="file" multiple className="sr-only" disabled={busy} onChange={e => { void upload(e.target.files); e.target.value = '' }}
            accept="image/png,image/jpeg,image/webp,image/heic,application/pdf,text/plain,.doc,.docx,video/mp4,video/quicktime,video/webm,audio/*" />
        </label>
      )}
      <p className="mt-1 text-xs text-v-subtle">Hasta {MAX_FILES} archivos de 50 MB cada uno. Solo los ve el equipo directivo.</p>
      {error && <p role="alert" className="mt-1 text-[12px] text-v-danger">{error}</p>}
    </div>
  )
}
