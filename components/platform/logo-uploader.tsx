'use client'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ImagePlus, Loader2, Trash2 } from 'lucide-react'
import { browserClient } from '@/lib/supabase/client'
import type { ActionResult } from '@/lib/actions/result'
import { Button } from '@/components/ui/primitives'
import { useToast } from '@/components/ui/toast'

export const LOGO_MAX_BYTES = 1024 * 1024
export const LOGO_TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }

/** Sube un logo a la carpeta del colegio en Storage. Devuelve la ruta, o un mensaje de error. */
export async function uploadLogo(institutionId: string, file: File): Promise<{ path: string } | { error: string }> {
  const ext = LOGO_TYPES[file.type]
  if (!ext) return { error: 'Usa una imagen PNG, JPG o WebP.' }
  if (file.size > LOGO_MAX_BYTES) return { error: 'El logo supera 1 MB. Prueba con uno más liviano.' }
  const path = `${institutionId}/logo-${Date.now()}.${ext}`
  const { error } = await browserClient().storage.from('school-logos').upload(path, file, { contentType: file.type })
  return error ? { error: 'No se pudo subir el logo. Inténtalo de nuevo.' } : { path }
}

/** Logo de un colegio que ya existe: lo cambian la secretaría (Configuración) o el equipo Vanty (ficha del colegio). */
export function LogoUploader({ institutionId, name, url, save }: { institutionId: string; name: string; url: string | null; save: (path: string | null) => Promise<ActionResult> }) {
  const [preview, setPreview] = useState<string | null>(null)
  const [removed, setRemoved] = useState(false)
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const toast = useToast()
  const router = useRouter()
  const src = removed ? null : preview ?? url

  const pick = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    const up = await uploadLogo(institutionId, file)
    if ('error' in up) { setBusy(false); toast.error(up.error); return }
    const res = await save(up.path)
    setBusy(false)
    if (!res.ok) { toast.error(res.error); return }
    setPreview(URL.createObjectURL(file)); setRemoved(false)
    toast.success(res.message ?? 'Logo actualizado.')
    router.refresh()
  }
  const remove = async () => {
    setBusy(true)
    const res = await save(null)
    setBusy(false)
    if (!res.ok) { toast.error(res.error); return }
    setPreview(null); setRemoved(true)
    toast.success(res.message ?? 'Logo eliminado.')
    router.refresh()
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <button type="button" onClick={() => input.current?.click()} disabled={busy} aria-label={`Cambiar el logo de ${name}`}
        className="group relative grid size-24 shrink-0 place-items-center overflow-hidden rounded-[26%] border border-v-border bg-v-fill shadow-v-xs">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {src ? <img src={src} alt="" className="size-full object-contain p-1.5" /> : <ImagePlus size={26} className="text-v-subtle" />}
        <span className={`absolute inset-0 grid place-items-center bg-[#081426]/55 text-white transition-opacity ${busy ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
          {busy ? <Loader2 size={20} className="animate-spin" /> : <ImagePlus size={20} />}
        </span>
      </button>
      <div className="min-w-0">
        <p className="text-[14px] font-semibold text-v-text">Logo del colegio</p>
        <p className="mt-0.5 max-w-sm text-[12.5px] text-v-muted">Se ve en el menú de todas las personas del colegio. PNG, JPG o WebP, hasta 1 MB; mejor cuadrado y con fondo transparente.</p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => input.current?.click()} disabled={busy}><ImagePlus size={14} />{src ? 'Cambiar logo' : 'Subir logo'}</Button>
          {src && <Button size="sm" variant="ghost" onClick={remove} disabled={busy}><Trash2 size={14} />Quitar</Button>}
        </div>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={e => { pick(e.target.files?.[0]); e.target.value = '' }} />
      </div>
    </div>
  )
}
