'use client'
import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Check, Copy, Loader2, X } from 'lucide-react'
import type { ActionResult } from '@/lib/actions/result'
import { Button, type ButtonSize, type ButtonVariant } from '@/components/ui/primitives'
import { useToast } from '@/components/ui/toast'

export function Modal({ open, onClose, title, description, children, wide }: {
  open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode; wide?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [open, onClose])

  if (!open) return null
  // Portal: una tarjeta animada (con transform) no debe recortar ni reubicar el diálogo.
  return createPortal(
    <div className="v-fade fixed inset-0 z-[90] flex items-end justify-center bg-[#081426]/60 p-0 sm:items-center sm:p-4" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} onMouseDown={e => e.stopPropagation()}
        className={`v-pop flex max-h-[92dvh] w-full flex-col rounded-t-v-lg border border-v-border bg-v-elevated shadow-v-lg sm:rounded-v-lg ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'}`}>
        <div className="flex items-start justify-between gap-3 border-b border-v-border px-6 py-4">
          <div>
            <h2 className="text-[17px] font-bold tracking-tight text-v-text">{title}</h2>
            {description && <p className="mt-0.5 text-[12.5px] text-v-muted">{description}</p>}
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="grid size-7 shrink-0 place-items-center rounded-full text-v-subtle hover:bg-v-fill hover:text-v-text">
            <X size={15} />
          </button>
        </div>
        <div className="overflow-y-auto overscroll-contain px-6 py-5">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

type FormAction = (form: FormData) => Promise<ActionResult>

/** Botón que abre un formulario en modal y ejecuta una Server Action. Muestra errores por campo y avisa el resultado. */
export function FormDialog({ trigger, variant = 'primary', size, title, description, action, submitLabel = 'Guardar', children, wide }: {
  trigger: ReactNode; variant?: ButtonVariant; size?: ButtonSize; title: string; description?: string
  action: FormAction; submitLabel?: string; children: ReactNode; wide?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [result, setResult] = useState<ActionResult | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const toast = useToast()
  const router = useRouter()

  const close = () => { setOpen(false); setResult(null) }

  const submit = (form: FormData) => start(async () => {
    let res: ActionResult
    try { res = await action(form) } catch { res = { ok: false, error: 'No se pudo completar la acción. Revisa tu conexión e inténtalo de nuevo.' } }
    setResult(res)
    if (!res.ok) return
    router.refresh()
    if (res.reveal) return
    toast.success(res.message ?? 'Cambios guardados.')
    close()
  })

  // Marca los campos con error devueltos por el servidor.
  useEffect(() => {
    const form = formRef.current
    if (!form) return
    const errors = result && !result.ok ? result.fieldErrors ?? {} : {}
    for (const el of Array.from(form.elements) as HTMLInputElement[]) {
      if (el.name) el.setAttribute('aria-invalid', errors[el.name] ? 'true' : 'false')
    }
  }, [result])

  const reveal = result?.ok ? result.reveal : undefined

  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)}>{trigger}</Button>
      <Modal open={open} onClose={close} title={title} description={description} wide={wide}>
        {reveal ? (
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-[13px] text-v-text"><Check size={16} className="text-v-success" />{result?.ok && result.message}</p>
            <CopyBox label={reveal.label} value={reveal.value} />
            {reveal.note && <p className="text-[12.5px] text-v-muted">{reveal.note}</p>}
            <div className="flex justify-end pt-1"><Button onClick={close}>Listo</Button></div>
          </div>
        ) : (
          <form ref={formRef} action={submit} className="space-y-3.5">
            {children}
            {result && !result.ok && (
              <div role="alert" className="rounded-v-sm bg-v-danger-soft px-3 py-2 text-[12.5px] text-[#c0343a]">
                <p>{result.error}</p>
                {result.fieldErrors && (
                  <ul className="mt-1 list-disc pl-4">
                    {Object.values(result.fieldErrors).map((m, i) => <li key={i}>{m}</li>)}
                  </ul>
                )}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={close} disabled={pending}>Cancelar</Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 size={14} className="animate-spin" />}{submitLabel}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  )
}

export function CopyBox({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div>
      <p className="mb-1 text-[12.5px] font-medium text-v-text">{label}</p>
      <div className="flex items-center gap-2">
        <input readOnly value={value} onFocus={e => e.currentTarget.select()} className="v-input font-mono !text-[12px]" />
        <Button variant="secondary" onClick={async () => { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 2000) }}>
          {copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'Copiado' : 'Copiar'}
        </Button>
      </div>
    </div>
  )
}

/** Botón que pide confirmación antes de ejecutar una Server Action.
 *  `redirectTo`: a dónde ir si resulta bien. Hace falta cuando la acción elimina lo mismo que muestra la página
 *  (refrescarla ahí terminaría en «no encontrado»). */
export function ConfirmAction({ children, variant = 'ghost', size = 'sm', title, message, confirmLabel = 'Confirmar', danger, action, ariaLabel, redirectTo }: {
  children: ReactNode; variant?: ButtonVariant; size?: ButtonSize; title: string; message: string
  confirmLabel?: string; danger?: boolean; action: () => Promise<ActionResult>; ariaLabel?: string; redirectTo?: string
}) {
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const toast = useToast()
  const router = useRouter()

  const run = () => start(async () => {
    let res: ActionResult
    try { res = await action() } catch { res = { ok: false, error: 'No se pudo completar la acción.' } }
    if (res.ok) { toast.success(res.message ?? 'Listo.'); if (redirectTo) router.replace(redirectTo); else router.refresh() } else toast.error(res.error)
    setOpen(false)
  })

  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)} aria-label={ariaLabel}>{children}</Button>
      <Modal open={open} onClose={() => !pending && setOpen(false)} title={title}>
        <div className="flex gap-3">
          {danger && <span className="grid size-9 shrink-0 place-items-center rounded-full bg-v-danger-soft text-v-danger"><AlertTriangle size={17} /></span>}
          <p className="text-[13px] leading-relaxed text-v-muted">{message}</p>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Cancelar</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={run} disabled={pending}>
            {pending && <Loader2 size={14} className="animate-spin" />}{confirmLabel}
          </Button>
        </div>
      </Modal>
    </>
  )
}

/** Formulario en línea (sin modal) para una Server Action: avisa el resultado y refresca los datos. */
export function InlineForm({ action, children, className, resetOnSuccess = true }: {
  action: FormAction; children: ReactNode; className?: string; resetOnSuccess?: boolean
}) {
  const [pending, start] = useTransition()
  const ref = useRef<HTMLFormElement>(null)
  const toast = useToast()
  const router = useRouter()
  const submit = (form: FormData) => start(async () => {
    let res: ActionResult
    try { res = await action(form) } catch { res = { ok: false, error: 'No se pudo completar la acción.' } }
    if (res.ok) {
      toast.success(res.message ?? 'Cambios guardados.')
      if (resetOnSuccess) ref.current?.reset()
      router.refresh()
    } else {
      toast.error(res.fieldErrors ? `${res.error} ${Object.values(res.fieldErrors).join(' ')}` : res.error)
    }
  })
  return (
    <form ref={ref} action={submit} aria-busy={pending}>
      {/* Las clases de distribución van en el fieldset: los navegadores no aplican bien display:contents a un fieldset. */}
      <fieldset disabled={pending} className={`m-0 min-w-0 border-0 p-0 ${className ?? ''}`}>{children}</fieldset>
    </form>
  )
}

export function SubmitButton({ children, variant, size }: { children: ReactNode; variant?: ButtonVariant; size?: ButtonSize }) {
  return <Button type="submit" variant={variant} size={size}>{children}</Button>
}
