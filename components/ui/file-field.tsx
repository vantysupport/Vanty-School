'use client'
import { useState } from 'react'
import { CheckCircle2, Loader2, Paperclip, X } from 'lucide-react'
import { browserClient } from '@/lib/supabase/client'

const MAX_BYTES = 10 * 1024 * 1024

/** Sube un archivo a Storage con la sesión del usuario (las políticas del bucket deciden si puede) y deja
 *  la ruta en campos ocultos para que la Server Action la valide y la guarde. */
export function FileField({ bucket, prefix, label = 'Adjuntar archivo', required }: {
  bucket: 'materials' | 'submissions'; prefix: string; label?: string; required?: boolean
}) {
  const [state, setState] = useState<{ path: string; name: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const upload = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    if (file.size > MAX_BYTES) { setError('El archivo supera los 10 MB.'); return }
    setBusy(true)
    const safe = file.name.normalize('NFD').replace(/[^\w.\- ]+/g, '').replace(/\s+/g, '_').slice(-80) || 'archivo'
    const path = `${prefix}/${crypto.randomUUID()}-${safe}`
    const { error: upErr } = await browserClient().storage.from(bucket).upload(path, file, { contentType: file.type || undefined })
    setBusy(false)
    if (upErr) {
      setError(/mime|type/i.test(upErr.message) ? 'Ese tipo de archivo no está permitido.' : 'No se pudo subir el archivo.')
      return
    }
    setState({ path, name: file.name })
  }

  return (
    <div>
      <span className="mb-1 block text-[12.5px] font-medium text-v-text">{label}</span>
      <input type="hidden" name="file_path" value={state?.path ?? ''} />
      <input type="hidden" name="file_name" value={state?.name ?? ''} />
      {state ? (
        <div className="flex items-center gap-2 rounded-v-sm border border-v-border-strong bg-v-fill px-3 py-2 text-[13px]">
          <CheckCircle2 size={15} className="shrink-0 text-v-success" />
          <span className="min-w-0 flex-1 truncate">{state.name}</span>
          <button type="button" onClick={() => setState(null)} aria-label="Quitar archivo" className="text-v-subtle hover:text-v-text"><X size={14} /></button>
        </div>
      ) : (
        <label className="flex cursor-pointer items-center gap-2 rounded-v-sm border border-dashed border-v-border-strong px-3 py-2.5 text-[13px] text-v-muted hover:bg-v-fill">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Paperclip size={15} />}
          {busy ? 'Subiendo…' : 'Seleccionar archivo (PDF, Word, imagen · máx. 10 MB)'}
          <input type="file" className="sr-only" disabled={busy} required={required && !state}
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.webp,.txt" onChange={e => upload(e.target.files?.[0])} />
        </label>
      )}
      {error && <p role="alert" className="mt-1 text-[12px] text-v-danger">{error}</p>}
    </div>
  )
}
