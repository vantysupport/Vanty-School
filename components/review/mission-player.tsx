'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, ArrowRight, BookOpen, Check, CheckCircle2, HelpCircle, Loader2, PlayCircle, RotateCcw, Sparkles, Star, Target, Trophy, XCircle } from 'lucide-react'
import { answerItem } from '@/lib/actions/review'
import { youtubeEmbed } from '@/lib/youtube'

export type PlayerItem = { id: string; kind: 'video' | 'question' | 'note'; prompt: string; body?: string | null; youtubeId: string | null; options: string[] | null; done: boolean; firstTry: boolean }
type Feedback = { correct: boolean; choice: number; explanation: string | null }

/** Una misión de repaso, paso a paso: se mira el video o se responde la pregunta y recién entonces se avanza.
 *  El servidor decide si una respuesta es correcta; aquí nunca llega la clave. */
export function MissionPlayer({ title, subject, cover, items: initial, byAria = false, simple = false }: { title: string; subject: string; cover: string; items: PlayerItem[]; byAria?: boolean; simple?: boolean }) {
  const [items, setItems] = useState(initial)
  const firstPending = initial.findIndex(i => !i.done)
  const [index, setIndex] = useState(firstPending < 0 ? initial.length : firstPending)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const total = items.length
  const done = items.filter(i => i.done).length
  const stars = items.filter(i => i.kind === 'question' && i.firstTry).length
  const questions = items.filter(i => i.kind === 'question').length
  const item = items[index]
  const go = (n: number) => { setIndex(n); setFeedback(null); setError(null) }
  const mark = (id: string, patch: Partial<PlayerItem>) => setItems(list => list.map(i => (i.id === id ? { ...i, ...patch } : i)))

  const watch = () => start(async () => {
    const res = await answerItem(item.id, null)
    if (!res.ok) { setError(res.error); return }
    mark(item.id, { done: true })
    go(index + 1)
  })
  const answer = (choice: number) => start(async () => {
    setError(null)
    const first = !feedback && !item.done
    const res = await answerItem(item.id, choice)
    if (!res.ok) { setError(res.error); return }
    setFeedback({ correct: !!res.correct, choice, explanation: res.explanation ?? null })
    if (res.correct) mark(item.id, { done: true, firstTry: item.firstTry || first })
  })

  return (
    <div>
      <Link href="/estudiante/repaso" className="mb-3 inline-flex items-center gap-1 text-[12.5px] font-medium text-v-muted hover:text-v-accent"><ArrowLeft size={14} />{simple ? 'Repasemos' : 'Repaso de clases'}</Link>

      {/* Cabecera con el avance */}
      <div className="relative mb-4 overflow-hidden rounded-v-lg p-5 text-white shadow-v sm:p-6" style={{ background: cover }}>
        <span aria-hidden className="pointer-events-none absolute -right-10 -top-16 size-56 rounded-full bg-white/15" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0"><p className="flex flex-wrap items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-white/85"><span>{simple ? 'Misión' : 'Repaso'} · {subject}</span>{byAria && <span className="inline-flex items-center gap-1 rounded-full bg-white/25 px-2 py-0.5 normal-case tracking-normal text-white"><Sparkles size={11} />Creado con ARIA</span>}</p>
            <h1 className="v-display mt-0.5 text-[1.6rem] font-bold leading-tight tracking-tight sm:text-[1.9rem]">{title}</h1></div>
          <p className="flex items-center gap-3 text-[14px] font-semibold">
            <span>{done} de {total} pasos</span>
            {questions > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-3 py-1">{simple ? <Star size={14} className="fill-current" /> : <Target size={14} />}{stars}/{questions}{!simple && ' al primer intento'}</span>}
          </p>
        </div>
        <div className="relative mt-4 flex gap-1.5">
          {items.map((it, n) => (
            <button key={it.id} type="button" onClick={() => go(n)} disabled={n > done && !it.done} aria-label={`Paso ${n + 1}`} aria-current={n === index}
              className={`h-2.5 flex-1 rounded-full transition-all ${it.done ? 'bg-white' : n === index ? 'bg-white/70' : 'bg-white/25'} disabled:cursor-not-allowed`} />
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {!item ? (
          /* Misión completa */
          <motion.div key="fin" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="rounded-v-lg border border-v-border bg-v-elevated p-8 text-center shadow-v">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {simple ? <img src="/aria/pose-2.webp" alt="" className="v-float mx-auto h-36 w-auto drop-shadow-[0_10px_18px_rgba(0,60,160,0.25)]" /> : <span className="mx-auto grid size-14 place-items-center rounded-full bg-v-success/15 text-[#157a4b]"><CheckCircle2 size={28} /></span>}
            <p className="v-display mt-3 flex items-center justify-center gap-2 text-[1.8rem] font-bold tracking-tight text-v-text">{simple ? <><Trophy size={28} className="text-[#f59e0b]" />¡Misión cumplida!</> : 'Repaso completado'}</p>
            <p className="mt-1 text-[16px] text-v-muted">{simple ? `Terminaste los ${total} pasos de «${title}».` : `Completaste los ${total} pasos de «${title}».`}</p>
            {!simple && questions > 0 && (
              <div className="mx-auto mt-5 max-w-md">
                <p className="v-display text-4xl font-bold tabular-nums text-v-text">{stars}<span className="text-xl font-semibold text-v-muted"> / {questions}</span></p>
                <p className="mt-1 text-[14px] text-v-muted">preguntas acertadas al primer intento</p>
                <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-v-fill"><div className="v-brand h-full rounded-full" style={{ width: `${(stars / questions) * 100}%` }} /></div>
              </div>
            )}
            {simple && questions > 0 && (
              <p className="mt-4 flex items-center justify-center gap-1.5" aria-label={`${stars} de ${questions} estrellas`}>
                {Array.from({ length: questions }, (_, n) => <Star key={n} size={30} className={n < stars ? 'fill-[#f59e0b] text-[#f59e0b]' : 'text-v-border-strong'} />)}
              </p>
            )}
            {simple && questions > 0 && <p className="mt-2 text-[14px] text-v-muted">Ganas una estrella por cada pregunta que respondes bien al primer intento.</p>}
            <div className="mt-6 flex flex-wrap justify-center gap-2.5">
              <button type="button" onClick={() => go(0)} className="inline-flex h-11 items-center gap-2 rounded-full border border-v-border-strong px-5 text-[14px] font-semibold text-v-text hover:border-v-accent hover:text-v-accent"><RotateCcw size={16} />{simple ? 'Repasar otra vez' : 'Repetir'}</button>
              <Link href="/estudiante/repaso" className="v-brand inline-flex h-11 items-center gap-2 rounded-full px-6 text-[14px] font-semibold shadow-v-brand">{simple ? 'Ver más misiones' : 'Volver a los repasos'}<ArrowRight size={16} /></Link>
            </div>
          </motion.div>
        ) : (
          <motion.div key={item.id} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ type: 'spring', stiffness: 260, damping: 26 }}
            className="rounded-v-lg border border-v-border bg-v-elevated p-5 shadow-v sm:p-6">
            <p className="mb-3 flex items-center gap-2 text-[12.5px] font-semibold uppercase tracking-[0.08em] text-v-accent">
              {item.kind === 'video' ? <PlayCircle size={16} /> : item.kind === 'note' ? <BookOpen size={16} /> : <HelpCircle size={16} />}Paso {index + 1} de {total} · {item.kind === 'video' ? (simple ? 'Mira el video' : 'Video') : item.kind === 'note' ? (simple ? 'Lee' : 'Resumen') : simple ? 'Responde' : 'Pregunta'}
              {item.done && <span className="inline-flex items-center gap-1 rounded-full bg-v-success/15 px-2 py-0.5 normal-case tracking-normal text-[#157a4b]"><Check size={12} />Listo</span>}
            </p>
            <h2 className={`${simple ? 'text-[26px]' : 'text-[20px]'} font-bold leading-snug tracking-tight text-v-text`}>{item.prompt}</h2>

            {item.kind === 'note' ? (
              <>
                <p className={`mt-3 whitespace-pre-line ${simple ? 'text-[21px]' : 'text-[17px]'} leading-relaxed text-v-text`}>{item.body}</p>
                <div className="mt-5 flex justify-end">
                  <button type="button" onClick={item.done ? () => go(index + 1) : watch} disabled={pending} className="v-brand inline-flex h-12 items-center gap-2 rounded-full px-6 text-[15px] font-bold shadow-v-brand disabled:opacity-60">
                    {pending ? <Loader2 size={17} className="animate-spin" /> : <CheckCircle2 size={17} />}{item.done || !simple ? 'Continuar' : 'Listo, a practicar'}
                  </button>
                </div>
              </>
            ) : item.kind === 'video' && item.youtubeId ? (
              <>
                <div className="mt-4 aspect-video max-h-[58vh] w-full overflow-hidden rounded-v-sm bg-black shadow-v">
                  <iframe src={youtubeEmbed(item.youtubeId)} title={item.prompt} className="size-full" loading="lazy" referrerPolicy="strict-origin-when-cross-origin"
                    allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowFullScreen />
                </div>
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-[13.5px] text-v-muted">{simple ? 'Mira el video completo y después continúa.' : 'Revisa el video antes de pasar a las preguntas.'}</p>
                  <button type="button" onClick={item.done ? () => go(index + 1) : watch} disabled={pending} className="v-brand inline-flex h-12 items-center gap-2 rounded-full px-6 text-[15px] font-bold shadow-v-brand disabled:opacity-60">
                    {pending ? <Loader2 size={17} className="animate-spin" /> : <CheckCircle2 size={17} />}{item.done || !simple ? 'Continuar' : 'Ya lo vi, continuar'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
                  {(item.options ?? []).map((option, n) => {
                    const chosen = feedback?.choice === n
                    const state = chosen ? (feedback!.correct ? 'right' : 'wrong') : 'idle'
                    return (
                      <motion.button key={n} type="button" whileTap={{ scale: 0.98 }} onClick={() => answer(n)} disabled={pending || !!feedback?.correct}
                        className={`flex items-center gap-3 rounded-v-sm border-2 text-left font-semibold transition-colors ${simple ? 'p-5 text-[20px]' : 'p-4 text-[16px]'} disabled:cursor-default ${state === 'right' ? 'border-v-success bg-v-success/10 text-[#157a4b]' : state === 'wrong' ? 'border-v-danger/60 bg-v-danger/10 text-v-danger' : 'border-v-border text-v-text hover:border-v-accent hover:bg-v-accent-soft/40'}`}>
                        <span className={`grid size-9 shrink-0 place-items-center rounded-full text-[14px] font-bold ${state === 'right' ? 'bg-v-success text-white' : state === 'wrong' ? 'bg-v-danger text-white' : 'bg-v-fill text-v-muted'}`}>{state === 'right' ? <Check size={17} /> : state === 'wrong' ? <XCircle size={17} /> : String.fromCharCode(65 + n)}</span>
                        <span className="min-w-0 flex-1">{option}</span>
                      </motion.button>
                    )
                  })}
                </div>
                {feedback && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} role="status"
                    className={`mt-4 rounded-v-sm px-4 py-3.5 ${simple ? 'text-[19px]' : 'text-[15px]'} leading-relaxed ${feedback.correct ? 'bg-v-success/10 text-v-text' : 'bg-v-warning/15 text-v-text'}`}>
                    <p className="font-bold">{feedback.correct ? (simple ? '¡Muy bien! Esa es la respuesta.' : 'Correcto.') : simple ? 'Todavía no. Piénsalo otra vez y prueba con otra.' : 'Incorrecto. Revisa el enunciado e inténtalo de nuevo.'}</p>
                    {feedback.correct && feedback.explanation && <p className="mt-1">{feedback.explanation}</p>}
                  </motion.div>
                )}
                {(feedback?.correct || item.done) && (
                  <div className="mt-5 flex justify-end">
                    <button type="button" onClick={() => go(index + 1)} className="v-brand inline-flex h-12 items-center gap-2 rounded-full px-6 text-[15px] font-bold shadow-v-brand">{index + 1 >= total ? (simple ? 'Terminar misión' : 'Finalizar') : 'Siguiente'}<ArrowRight size={17} /></button>
                  </div>
                )}
              </>
            )}
            {error && <p role="alert" className="mt-3 rounded-v-sm bg-v-danger-soft px-3 py-2 text-[13px] text-[#c0343a]">{error}</p>}
          </motion.div>
        )}
      </AnimatePresence>
      {byAria && <p className="mt-3 px-1 text-[12.5px] leading-relaxed text-v-subtle">Este repaso lo preparó ARIA, una inteligencia artificial, y puede tener errores{items.some(i => i.kind === 'video') ? '; el video lo eligió ARIA en YouTube y nadie lo revisó antes' : ''}. Si algo no calza con lo que viste en clases, pregúntale a tu profesor.</p>}
    </div>
  )
}
