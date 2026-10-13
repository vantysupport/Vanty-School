'use client'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { X } from 'lucide-react'
import { AriaAvatar, AriaChat, type AriaScopeOption } from '@/components/aria/aria-chat'
import type { AriaMode } from '@/lib/aria/modes'

type Props = {
  mode: AriaMode; title: string; tagline: string; disclaimer: string; suggestions: string[]
  scopeLabel?: string; scopeOptions?: AriaScopeOption[]; scopeRequired?: boolean
  firstName: string; greetings: { pose: number; text: string }[]; initialScope?: string; fixedScope?: boolean
}

const GREETING_MS = 8000

/** ARIA siempre a mano: saludo breve al entrar (una vez por sesión) y chat flotante en todo el panel. */
export function AriaFloating({ firstName, greetings, ...chat }: Props) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const still = useReducedMotion()
  const [greeting, setGreeting] = useState<{ pose: number; text: string } | null>(null)

  useEffect(() => {
    try {
      if (sessionStorage.getItem('vs_aria_saludo')) return
      sessionStorage.setItem('vs_aria_saludo', '1')
    } catch { /* sin almacenamiento: se muestra igual */ }
    const hour = new Date().getHours()
    const prefix = hour < 12 ? 'Buenos días' : hour < 20 ? 'Buenas tardes' : 'Buenas noches'
    const pick = greetings[Math.floor(Math.random() * greetings.length)]
    const show = setTimeout(() => setGreeting({ pose: pick.pose, text: `${prefix}, ${firstName}. ${pick.text}` }), 900)
    const hide = setTimeout(() => setGreeting(null), 900 + GREETING_MS)
    return () => { clearTimeout(show); clearTimeout(hide) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // En la página completa de ARIA el botón flotante sobra.
  if (pathname.endsWith('/aria')) return null

  return (
    <>
      {/* Saludo al centro, como en VANTY ABA: la mascota junto a una tarjeta grande que se cierra sola. */}
      <AnimatePresence>
        {greeting && !open && (
          <motion.div role="status" initial={{ opacity: 0, y: 40, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 30, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 260, damping: 22 }}
            className="pointer-events-none fixed inset-x-0 bottom-24 z-[95] flex justify-center px-4 md:bottom-8">
            <button type="button" onClick={() => setGreeting(null)} aria-label="Cerrar saludo de ARIA"
              className="pointer-events-auto relative flex w-full max-w-[400px] items-end text-left sm:max-w-[460px]">
              <motion.span aria-hidden className="relative z-[2] -mr-6 block h-[92px] shrink-0 sm:-mr-7 sm:h-[124px]"
                initial={{ rotate: -8, y: 12 }} animate={still ? { rotate: 0, y: 0 } : { rotate: [0, -3, 0, 3, 0], y: [0, -4, 0] }}
                transition={still ? { duration: 0.3 } : { rotate: { duration: 2.4, repeat: Infinity, ease: 'easeInOut' }, y: { duration: 1.8, repeat: Infinity, ease: 'easeInOut' } }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/aria/pose-${greeting.pose}.webp`} alt="" draggable={false} style={{ height: '100%', width: 'auto', maxWidth: 'none' }} className="drop-shadow-[0_10px_18px_rgba(0,60,160,0.28)]" />
              </motion.span>
              <span className="v-brand relative mb-2 flex min-h-[64px] min-w-0 flex-1 items-center overflow-hidden rounded-[18px] py-3 pl-8 pr-9 shadow-v-lg sm:mb-3 sm:min-h-[80px] sm:rounded-[22px] sm:py-4 sm:pl-10 sm:pr-10">
                <span className="text-[12.5px] font-extrabold uppercase leading-snug tracking-wide text-white sm:text-[15px]">{greeting.text}</span>
                <span className="absolute right-2 top-2 grid size-5 place-items-center rounded-full bg-white/15 text-white/85 sm:right-2.5 sm:top-2.5 sm:size-6"><X size={12} /></span>
                <motion.span className="absolute bottom-0 left-0 h-[3px] bg-white/50" initial={{ width: '100%' }} animate={{ width: '0%' }} transition={{ duration: GREETING_MS / 1000, ease: 'linear' }} />
              </span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {open && (
        <div className="v-pop fixed inset-x-0 bottom-0 z-[70] flex h-[78dvh] flex-col overflow-hidden rounded-t-v-lg border border-v-border bg-v-elevated shadow-v-lg sm:inset-x-auto sm:bottom-5 sm:right-5 sm:h-[600px] sm:max-h-[calc(100dvh-2.5rem)] sm:w-[380px] sm:rounded-v-lg">
          <button onClick={() => setOpen(false)} aria-label="Cerrar ARIA"
            className="absolute right-3 top-3.5 z-10 grid size-7 place-items-center rounded-full text-white/90 hover:bg-white/15">
            <X size={15} />
          </button>
          <AriaChat {...chat} compact />
        </div>
      )}

      {!open && (
        <button onClick={() => { setOpen(true); setGreeting(null) }} aria-label="Abrir ARIA" title="Hablar con ARIA"
          className="fixed bottom-5 right-4 z-[60] rounded-full shadow-v-lg ring-4 ring-white transition-transform hover:scale-105 md:right-6">
          <AriaAvatar size={54} />
        </button>
      )}
    </>
  )
}
