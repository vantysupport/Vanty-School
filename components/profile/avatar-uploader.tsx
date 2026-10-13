'use client'
import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, Loader2, Trash2 } from 'lucide-react'
import { browserClient } from '@/lib/supabase/client'
import { removeAvatar, saveAvatar } from '@/lib/actions/profile'
import { Button } from '@/components/ui/primitives'
import { useToast } from '@/components/ui/toast'

const MAX_BYTES = 2 * 1024 * 1024
const TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }

/** Sube la foto de perfil a la carpeta privada del usuario y la registra en su perfil. */
export function AvatarUploader({ userId, name, hasPhoto, version }: { userId: string; name: string; hasPhoto: boolean; version: string }) {
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pending, start] = useTransition()
  const input = useRef<HTMLInputElement>(null)
  const toast = useToast()
  const router = useRouter()
  const working = busy || pending
  const initials = name.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('') || '?'
  const src = preview ?? (hasPhoto ? `/api/avatar/${userId}?v=${encodeURIComponent(version)}` : null)

  const upload = async (file: File | undefined) => {
    if (!file) return
    const ext = TYPES[file.type]
    if (!ext) { toast.error('Usa una imagen JPG, PNG o WebP.'); return }
    if (file.size > MAX_BYTES) { toast.error('La foto supera los 2 MB. Prueba con una más liviana.'); return }
    setBusy(true)
    const path = `${userId}/foto-${Date.now()}.${ext}`
    const { error } = await browserClient().storage.from('avatars').upload(path, file, { contentType: file.type })
    if (error) { setBusy(false); toast.error('No se pudo subir la foto. Inténtalo de nuevo.'); return }
    const res = await saveAvatar(path)
    setBusy(false)
    if (!res.ok) { toast.error(res.error); return }
    setPreview(URL.createObjectURL(file))
    toast.success(res.message ?? 'Foto actualizada.')
    router.refresh()
  }

  const remove = () => start(async () => {
    const res = await removeAvatar()
    if (res.ok) { setPreview(null); toast.success(res.message ?? 'Foto eliminada.'); router.refresh() } else toast.error(res.error)
  })

  return (
    <div className="flex flex-wrap items-center gap-5">
      <button type="button" onClick={() => input.current?.click()} disabled={working} aria-label="Cambiar foto de perfil"
        className="group relative size-28 shrink-0 overflow-hidden rounded-full shadow-v-brand ring-4 ring-white">
        <span className="v-brand v-display grid size-full place-items-center text-4xl font-semibold">{initials}</span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {src && <img src={src} alt="" className="absolute inset-0 size-full object-cover" />}
        <span className={`absolute inset-0 grid place-items-center bg-[#081426]/55 text-white transition-opacity ${working ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
          {working ? <Loader2 size={22} className="animate-spin" /> : <Camera size={22} />}
        </span>
      </button>
      <div className="min-w-0">
        <p className="text-[15px] font-semibold tracking-tight">Foto de perfil</p>
        <p className="mt-0.5 max-w-sm text-[13px] text-v-muted">La verán las personas de tu colegio que ya pueden ver tu nombre. JPG, PNG o WebP, hasta 2 MB.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={() => input.current?.click()} disabled={working}><Camera size={14} />{hasPhoto || preview ? 'Cambiar foto' : 'Subir foto'}</Button>
          {(hasPhoto || preview) && <Button variant="ghost" onClick={remove} disabled={working}><Trash2 size={14} />Quitar</Button>}
        </div>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={e => { upload(e.target.files?.[0]); e.target.value = '' }} />
      </div>
    </div>
  )
}
