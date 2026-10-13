'use client'
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { AlertCircle, CheckCircle2, X } from 'lucide-react'

type Toast = { id: number; kind: 'success' | 'error'; text: string }
type Ctx = { success: (text: string) => void; error: (text: string) => void }

const ToastContext = createContext<Ctx | null>(null)

// Sin proveedor (pasa de forma transitoria en desarrollo, cuando una recarga en caliente deja dos copias de este
// módulo) los avisos se omiten en vez de botar la página entera: un aviso perdido es mejor que una pantalla caída.
const SILENT: Ctx = { success: () => {}, error: text => console.warn('[toast sin proveedor]', text) }

export function useToast(): Ctx {
  return useContext(ToastContext) ?? SILENT
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const push = useCallback((kind: Toast['kind'], text: string) => {
    const id = Date.now() + Math.random()
    setToasts(list => [...list.slice(-3), { id, kind, text }])
    setTimeout(() => setToasts(list => list.filter(t => t.id !== id)), kind === 'error' ? 7000 : 4000)
  }, [])

  const [api] = useState<Ctx>(() => ({ success: t => push('success', t), error: t => push('error', t) }))

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-5 sm:items-end" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} role={t.kind === 'error' ? 'alert' : 'status'}
            className="v-pop pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-v-sm border border-v-border bg-v-elevated px-3.5 py-2.5 shadow-v-lg">
            {t.kind === 'success'
              ? <CheckCircle2 size={17} className="mt-px shrink-0 text-v-success" />
              : <AlertCircle size={17} className="mt-px shrink-0 text-v-danger" />}
            <p className="flex-1 text-[13px] text-v-text">{t.text}</p>
            <button onClick={() => setToasts(list => list.filter(x => x.id !== t.id))} aria-label="Cerrar aviso" className="text-v-subtle hover:text-v-text">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
