'use client'
import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Send } from 'lucide-react'
import type { ActionResult } from '@/lib/actions/result'
import { useToast } from '@/components/ui/toast'

/** Lleva la conversación al último mensaje al abrirla y cada vez que llega uno nuevo. */
export function ScrollToEnd({ signal }: { signal: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { ref.current?.scrollIntoView({ block: 'end' }) }, [signal])
  return <div ref={ref} aria-hidden />
}

/** Caja para escribir: Enter envía, Mayús + Enter hace salto de línea, y crece con el texto. */
export function ChatComposer({ action, placeholder = 'Escribe un mensaje…' }: { action: (form: FormData) => Promise<ActionResult>; placeholder?: string }) {
  const [value, setValue] = useState('')
  const [pending, start] = useTransition()
  const router = useRouter()
  const toast = useToast()
  const area = useRef<HTMLTextAreaElement>(null)

  const send = () => {
    const body = value.trim()
    if (!body || pending) return
    start(async () => {
      const form = new FormData()
      form.set('body', body)
      let res: ActionResult
      try { res = await action(form) } catch { res = { ok: false, error: 'No se pudo enviar el mensaje.' } }
      if (res.ok) { setValue(''); if (area.current) area.current.style.height = 'auto'; router.refresh() }
      else toast.error(res.error)
    })
  }

  return (
    <form onSubmit={e => { e.preventDefault(); send() }} className="flex items-end gap-2.5 border-t border-v-border bg-v-elevated p-3 sm:p-4">
      <textarea ref={area} value={value} rows={1} maxLength={4000} placeholder={placeholder} aria-label="Mensaje" disabled={pending}
        onChange={e => { setValue(e.target.value); e.target.style.height = 'auto'; e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px` }}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
        className="max-h-[140px] min-h-[46px] flex-1 resize-none rounded-[22px] border border-v-border-strong bg-v-fill/60 px-4 py-3 text-[14px] leading-snug text-v-text outline-none placeholder:text-v-subtle focus:border-v-accent focus:bg-v-elevated focus:shadow-[0_0_0_4px_var(--v-accent-soft)]" />
      <button type="submit" disabled={!value.trim() || pending} aria-label="Enviar mensaje"
        className="v-brand grid size-[46px] shrink-0 place-items-center rounded-full shadow-v-brand transition-transform active:scale-95 disabled:opacity-40 disabled:shadow-none">
        {pending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
      </button>
    </form>
  )
}
