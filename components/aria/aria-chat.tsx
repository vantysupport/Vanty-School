'use client'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  ArrowUp, ArrowUpRight, BarChart3, BookOpenCheck, CalendarRange, ClipboardList, Compass, HeartHandshake, Info,
  Lightbulb, ListChecks, RotateCcw, Sparkles, Square, Target, Volume2, VolumeX, type LucideIcon,
} from 'lucide-react'
import type { AriaMode } from '@/lib/aria/modes'
import { useAriaVoice } from '@/components/aria/use-voice'

export type AriaMessage = { role: 'user' | 'assistant'; content: string; error?: boolean }
export type AriaScopeOption = { value: string; label: string }

type Props = {
  mode: AriaMode
  title: string
  tagline: string
  disclaimer: string
  suggestions: string[]
  scopeLabel?: string
  scopeOptions?: AriaScopeOption[]
  scopeRequired?: boolean
  initialScope?: string
  fixedScope?: boolean   // el alcance lo decide otra parte de la pantalla (el selector de estudiante del apoderado)
  compact?: boolean
  /** Acción opcional sobre cada respuesta (p. ej. guardar o reutilizar el texto). */
  renderAction?: (text: string) => ReactNode
}

// Iconos de las tarjetas de sugerencia de cada modo.
const ICONS: Record<AriaMode, LucideIcon[]> = {
  pedagogica: [BarChart3, Lightbulb, BookOpenCheck],
  bienestar: [ClipboardList, Compass, CalendarRange],
  familias: [CalendarRange, BookOpenCheck, HeartHandshake],
  gestion: [BarChart3, Target, ListChecks],
}

export function AriaAvatar({ size = 28 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/aria/avatar.webp" alt="" aria-hidden width={size} height={size} draggable={false}
      className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  )
}

/** Presenta el texto del modelo: párrafos, listas con guion y **negritas**. Nunca interpreta HTML. */
export function Formatted({ text }: { text: string }) {
  const inline = (line: string) => line.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong> : part)
  const blocks: ReactNode[] = []
  let list: { text: string; nested: boolean }[] = []
  const flush = () => {
    if (list.length) blocks.push(<ul key={blocks.length} className="ml-4 list-disc space-y-1.5 marker:text-v-accent">{list.map((l, i) => <li key={i} className={l.nested ? 'ml-5 list-[circle] text-v-muted' : undefined}>{inline(l.text)}</li>)}</ul>)
    list = []
  }
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    const bullet = line.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/)
    if (bullet) { list.push({ text: bullet[1], nested: /^(\s{2,}|\t)/.test(raw) && list.length > 0 }); continue }
    flush()
    if (!line) continue
    const heading = line.match(/^#{1,4}\s+(.*)$/)
    blocks.push(heading
      ? <p key={blocks.length} className="font-semibold text-v-text">{inline(heading[1])}</p>
      : <p key={blocks.length}>{inline(line)}</p>)
  }
  flush()
  return <div className="space-y-2.5">{blocks}</div>
}

function Typing() {
  return (
    <div className="flex items-center gap-1.5 rounded-[6px_18px_18px_18px] border border-v-border bg-v-elevated px-4 py-3 shadow-v-xs" role="status" aria-label="ARIA está escribiendo">
      {[0, 1, 2].map(n => (
        <motion.span key={n} className="size-1.5 rounded-full bg-v-accent" animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: n * 0.15 }} />
      ))}
    </div>
  )
}

/** Barras que se mueven mientras ARIA lee en voz alta. */
function Waves({ className = 'bg-v-accent' }: { className?: string }) {
  return (
    <span className="inline-flex h-3 items-end gap-[2px]" aria-hidden>
      {[0, 1, 2, 3].map(n => (
        <motion.span key={n} className={`w-[2.5px] rounded-full ${className}`} animate={{ height: ['30%', '100%', '45%', '80%', '30%'] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: n * 0.12, ease: 'easeInOut' }} />
      ))}
    </span>
  )
}

export function AriaChat({ mode, title, tagline, disclaimer, suggestions, scopeLabel, scopeOptions, scopeRequired, initialScope, fixedScope, compact, renderAction }: Props) {
  const [messages, setMessages] = useState<AriaMessage[]>([])
  const [input, setInput] = useState('')
  const [scope, setScope] = useState(initialScope ?? (scopeRequired ? scopeOptions?.[0]?.value ?? '' : ''))
  const [loading, setLoading] = useState(false)
  const [quota, setQuota] = useState<{ used: number; limit: number } | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const icons = ICONS[mode]
  const voice = useAriaVoice()
  const reset = () => { voice.stop(); setMessages([]) }

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [messages, loading])

  const blocked = scopeRequired && !scope
  const send = async (text: string) => {
    const message = text.trim()
    if (!message || loading || blocked) return
    const history = messages.filter(m => !m.error)
    voice.stop()
    setMessages(m => [...m, { role: 'user', content: message }])
    setInput('')
    setLoading(true)
    try {
      const res = await fetch('/api/aria', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, message, scope: scope || null, history }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMessages(m => [...m, { role: 'assistant', content: data?.error ?? 'ARIA no pudo responder. Inténtalo de nuevo.', error: true }])
      } else {
        setMessages(m => [...m, { role: 'assistant', content: data.text }])
        if (voice.auto) voice.speak(data.text, messages.length + 1)
        if (typeof data.used === 'number') setQuota({ used: data.used, limit: data.limit })
      }
    } catch {
      setMessages(m => [...m, { role: 'assistant', content: 'No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.', error: true }])
    } finally {
      setLoading(false)
    }
  }

  const scopeSelect = scopeOptions && !fixedScope && (
    <label className="flex min-w-0 items-center gap-2">
      <span className={`shrink-0 text-xs font-semibold ${compact ? 'text-v-muted' : 'uppercase tracking-[0.08em] text-v-subtle'}`}>{scopeLabel}</span>
      <select value={scope} onChange={e => { setScope(e.target.value); reset() }} aria-label={scopeLabel}
        className="v-input !w-auto min-w-0 max-w-full !rounded-full !py-1.5 !text-[13px] font-medium">
        {!scopeRequired && <option value="">Consulta general</option>}
        {scopeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  )

  const thread = (
    <>
      {messages.map((m, i) => (
        <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 24 }}
          className={m.role === 'user' ? 'flex justify-end' : 'flex items-start gap-2.5'}>
          {m.role === 'user' ? (
            <p className="v-brand max-w-[85%] whitespace-pre-wrap rounded-[18px_6px_18px_18px] px-4 py-2.5 text-[13.5px] leading-relaxed shadow-v-brand">{m.content}</p>
          ) : (
            <>
              <span className="mt-0.5 rounded-full ring-2 ring-v-accent-soft"><AriaAvatar size={compact ? 28 : 34} /></span>
              <div className="min-w-0 max-w-[88%]">
                {!compact && <p className="mb-1 text-[11px] font-semibold text-v-subtle">ARIA</p>}
                <div className={`rounded-[6px_18px_18px_18px] border px-4 py-3 text-[13.5px] leading-relaxed shadow-v-xs ${m.error ? 'border-v-danger/25 bg-v-danger/10 text-[#c0343a]' : 'border-v-border bg-v-elevated text-v-text'}`}>
                  {m.error ? m.content : <Formatted text={m.content} />}
                </div>
                {!m.error && (voice.supported || renderAction) && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {voice.supported && (
                      <button type="button" onClick={() => (voice.speaking === i ? voice.stop() : voice.speak(m.content, i))} aria-pressed={voice.speaking === i}
                        className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold ${voice.speaking === i ? 'border-v-accent bg-v-accent-soft text-v-accent' : 'border-v-border-strong text-v-muted hover:border-v-accent hover:text-v-accent'}`}>
                        {voice.speaking === i ? <><Waves /><span>Detener</span><Square size={10} className="fill-current" /></> : <><Volume2 size={13} />Escuchar</>}
                      </button>
                    )}
                    {renderAction?.(m.content)}
                  </div>
                )}
              </div>
            </>
          )}
        </motion.div>
      ))}
      {loading && <div className="flex items-center gap-2.5"><span className="rounded-full ring-2 ring-v-accent-soft"><AriaAvatar size={compact ? 28 : 34} /></span><Typing /></div>}
      <div ref={endRef} />
    </>
  )

  const composer = (
    <form onSubmit={e => { e.preventDefault(); send(input) }}
      className="flex items-end gap-2 rounded-[22px] border border-v-border-strong bg-v-elevated p-2 pl-4 shadow-v transition-shadow focus-within:border-v-accent focus-within:shadow-[0_0_0_4px_var(--v-accent-soft),var(--v-shadow)]">
      <textarea value={input} onChange={e => setInput(e.target.value)} rows={1} maxLength={1500} disabled={blocked}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) } }}
        placeholder={blocked ? 'No hay datos disponibles para consultar' : 'Pregúntale a ARIA…'} aria-label="Mensaje para ARIA"
        className="max-h-32 min-h-[40px] flex-1 resize-none bg-transparent py-2.5 text-[14px] text-v-text outline-none placeholder:text-v-subtle" />
      <motion.button type="submit" disabled={!input.trim() || loading || blocked} aria-label="Enviar" whileTap={{ scale: 0.92 }}
        className="v-brand grid size-10 shrink-0 place-items-center rounded-full shadow-v-brand disabled:opacity-35 disabled:shadow-none">
        <ArrowUp size={17} strokeWidth={2.4} />
      </motion.button>
    </form>
  )

  // ── Versión compacta (panel flotante) ───────────────────────────────────────
  if (compact) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="v-brand flex items-center gap-2.5 py-3 pl-4 pr-12">
          <span className="rounded-full ring-2 ring-white/30"><AriaAvatar size={36} /></span>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold leading-tight">{title}</p>
            <p className="truncate text-[12px] text-white/80">{tagline}</p>
          </div>
          {voice.supported && (
            <button onClick={() => voice.setAuto(!voice.auto)} aria-pressed={voice.auto} aria-label={voice.auto ? 'Desactivar la voz de ARIA' : 'Activar la voz de ARIA'} title={voice.auto ? 'Voz activada: ARIA lee sus respuestas' : 'Activar la voz de ARIA'}
              className={`grid size-8 place-items-center rounded-full hover:bg-white/15 ${voice.auto ? 'bg-white/20 text-white' : 'text-white/85'}`}>
              {voice.speaking != null ? <Waves className="bg-white" /> : voice.auto ? <Volume2 size={15} /> : <VolumeX size={15} />}
            </button>
          )}
          {messages.length > 0 && (
            <button onClick={reset} aria-label="Nueva conversación" title="Nueva conversación" className="grid size-8 place-items-center rounded-full text-white/85 hover:bg-white/15">
              <RotateCcw size={15} />
            </button>
          )}
        </div>
        {scopeSelect && <div className="border-b border-v-border px-4 py-2">{scopeSelect}</div>}
        <div className="flex-1 space-y-3.5 overflow-y-auto bg-v-bg/60 px-4 py-4" aria-live="polite">
          {messages.length === 0 && (
            <div className="flex flex-col items-center pt-1 text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/aria/pose-1.webp" alt="" className="v-float h-24 w-auto drop-shadow-[0_10px_18px_rgba(0,60,160,0.25)]" />
              <p className="mt-3 text-[15px] font-bold">Hola, soy <span className="v-brand-text">ARIA</span></p>
              <p className="mt-1 max-w-xs text-[12.5px] text-v-muted">{blocked ? 'Aún no hay datos disponibles para consultar en este modo.' : '¿En qué te ayudo hoy?'}</p>
              {!blocked && (
                <div className="mt-4 flex w-full flex-col gap-1.5">
                  {suggestions.map(s => (
                    <button key={s} onClick={() => send(s)} disabled={loading}
                      className="rounded-v-sm border border-v-border bg-v-elevated px-3 py-2.5 text-left text-[12.5px] font-medium text-v-muted shadow-v-xs hover:border-v-accent hover:text-v-accent">{s}</button>
                  ))}
                </div>
              )}
            </div>
          )}
          {thread}
        </div>
        <div className="border-t border-v-border px-3 pb-3 pt-3">
          {composer}
          <p className="mt-2 px-1 text-[11px] leading-snug text-v-subtle">{disclaimer}</p>
        </div>
      </div>
    )
  }

  // ── Página completa: espacio de trabajo de ARIA ─────────────────────────────
  return (
    <div className="h-[calc(100dvh-6.5rem)] min-h-[560px] md:h-[calc(100dvh-7rem)]">
      <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 180, damping: 24 }}
        className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-v border border-v-border bg-v-elevated shadow-v">
        <div aria-hidden className="v-brand absolute inset-x-0 top-0 z-10 h-[3px]" />
        <div aria-hidden className="pointer-events-none absolute inset-0"
          style={{ background: 'radial-gradient(46rem 22rem at 50% -4%, var(--v-glow-1), transparent 70%), radial-gradient(30rem 18rem at 100% 100%, var(--v-glow-2), transparent 70%)' }} />

        <header className="relative flex flex-wrap items-center gap-3 border-b border-v-border px-5 py-3.5">
          <span className="relative">
            <span className="block rounded-full shadow-v-brand ring-2 ring-white"><AriaAvatar size={42} /></span>
            <span className={`absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-white ${voice.speaking != null ? 'animate-pulse bg-v-accent' : 'bg-v-success'}`} title={voice.speaking != null ? 'Hablando' : 'Disponible'} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-[16px] font-bold tracking-tight text-v-text">{title}
              <span className="inline-flex items-center gap-1 rounded-full bg-v-accent-soft px-2 py-0.5 text-[10px] font-semibold text-v-accent"><Sparkles size={10} />IA</span>
            </p>
            <p className="truncate text-xs text-v-muted">{tagline}</p>
          </div>
          {scopeSelect}
          {voice.supported && (
            <button onClick={() => voice.setAuto(!voice.auto)} aria-pressed={voice.auto} title={voice.auto ? 'ARIA lee en voz alta cada respuesta' : 'Activa la voz para que ARIA lea sus respuestas'}
              className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold ${voice.auto ? 'border-v-accent bg-v-accent-soft text-v-accent' : 'border-v-border-strong text-v-muted hover:border-v-accent hover:text-v-accent'}`}>
              {voice.speaking != null ? <Waves /> : voice.auto ? <Volume2 size={14} /> : <VolumeX size={14} />}{voice.auto ? 'Voz activada' : 'Voz desactivada'}
            </button>
          )}
          {messages.length > 0 && (
            <button onClick={reset} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-v-border-strong px-3.5 text-xs font-semibold text-v-muted hover:border-v-accent hover:text-v-accent">
              <RotateCcw size={13} />Nueva conversación
            </button>
          )}
        </header>

        <div className="relative flex-1 overflow-y-auto" aria-live="polite">
          <AnimatePresence mode="wait">
            {messages.length === 0 ? (
              <motion.div key="welcome" exit={{ opacity: 0, y: -8 }} className="mx-auto flex min-h-full w-full max-w-3xl flex-col items-center justify-center px-5 py-8 text-center">
                <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 16, delay: 0.1 }} className="relative">
                  <motion.span aria-hidden className="v-brand absolute inset-2 rounded-full opacity-30 blur-3xl"
                    animate={{ scale: [1, 1.18, 1], opacity: [0.25, 0.42, 0.25] }} transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }} />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/aria/pose-1.webp" alt="ARIA" className="v-float relative h-40 w-auto drop-shadow-[0_16px_28px_rgba(0,60,160,0.3)]" />
                </motion.div>
                <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="v-headline mt-5 text-[2rem] sm:text-[2.4rem]">
                  Hola, soy <span className="v-brand-text">ARIA</span>
                </motion.h1>
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="mt-2 max-w-md text-[15px] text-v-muted">
                  {blocked ? 'Aún no hay datos disponibles para consultar en este modo.' : 'Tu asistente de inteligencia educativa. Elige una idea para partir o escríbeme lo que necesites.'}
                </motion.p>

                {!blocked && (
                  <div className="mt-8 grid w-full gap-3 sm:grid-cols-3">
                    {suggestions.map((s, i) => {
                      const Icon = icons[i % icons.length]
                      return (
                        <motion.button key={s} onClick={() => send(s)} disabled={loading}
                          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} whileHover={{ y: -4 }} whileTap={{ scale: 0.98 }}
                          transition={{ delay: 0.35 + i * 0.07, type: 'spring', stiffness: 200, damping: 22 }}
                          className="group relative overflow-hidden rounded-v border border-v-border bg-v-elevated p-4 text-left shadow-v hover:border-v-accent">
                          <span aria-hidden className="pointer-events-none absolute -right-8 -top-10 size-28 rounded-full opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100" style={{ background: 'var(--v-glow-1)' }} />
                          <span className="relative flex items-center justify-between">
                            <span className="grid size-9 place-items-center rounded-[30%] bg-v-accent-soft text-v-accent transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110"><Icon size={16} /></span>
                            <ArrowUpRight size={15} className="text-v-subtle opacity-0 transition-all group-hover:text-v-accent group-hover:opacity-100" />
                          </span>
                          <span className="relative mt-3 block text-[13.5px] font-semibold leading-snug text-v-text">{s}</span>
                        </motion.button>
                      )
                    })}
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div key="thread" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mx-auto w-full max-w-3xl space-y-5 px-5 py-6">{thread}</motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="relative px-5 pb-4 pt-2">
          <div className="mx-auto w-full max-w-3xl">
            {composer}
            <p className="mt-2 flex items-center justify-center gap-1.5 text-center text-[11px] text-v-subtle">
              <Info size={11} className="shrink-0" /><span>{disclaimer}{quota && ` · Consultas de hoy: ${quota.used} de ${quota.limit}`}</span>
            </p>
          </div>
        </div>
      </motion.section>

    </div>
  )
}
