'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion } from 'motion/react'
import { ArrowLeft, CheckCircle2, ClipboardCheck, Eye, Loader2, Search } from 'lucide-react'
import type { ActionResult } from '@/lib/actions/result'
import { Avatar } from '@/components/ui/primitives'
import { useToast } from '@/components/ui/toast'

export type ApplyQuestion = { id: string; text: string; type: 'scale' | 'text'; min?: number; max?: number; minLabel?: string; maxLabel?: string; section?: string }
export type ApplyCase = { id: string; studentId: string; student: string; course: string | null }

const INPUT = 'w-full rounded-v-sm border border-v-border-strong bg-v-elevated px-4 py-3 text-[14.5px] leading-relaxed text-v-text outline-none placeholder:text-v-subtle focus:border-v-accent focus:shadow-[0_0_0_4px_var(--v-accent-soft)]'

/** Pantalla para responder un instrumento, al estilo de VANTY ABA: preguntas grandes, botones para la escala y un anillo
 *  de avance. La usa el equipo (elige el caso y registra) y también el apoderado (`family`), que solo responde.
 *  En vista previa (borrador o archivado) no se puede registrar. */
export function ApplyForm({ action, title, description, questions, cases = [], initialCase, preview, ruleNote, guide, family, backHref, backLabel, doneHref, submitLabel = 'Registrar aplicación' }: {
  action: (form: FormData) => Promise<ActionResult>; title: string; description: string; questions: ApplyQuestion[]; cases?: ApplyCase[]; initialCase?: string; preview?: string; ruleNote?: string; guide?: string
  family?: boolean; backHref: string; backLabel: string; doneHref: string; submitLabel?: string
}) {
  const [caseId, setCaseId] = useState(cases.some(c => c.id === initialCase) ? initialCase! : '')
  const [query, setQuery] = useState('')
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const router = useRouter()
  const toast = useToast()

  const scale = questions.filter(q => q.type === 'scale')
  const done = questions.filter(q => (answers[q.id] ?? '').trim()).length
  const missing = scale.filter(q => !answers[q.id])
  const progress = questions.length ? done / questions.length : 0
  const circ = 2 * Math.PI * 20
  const chosen = cases.find(c => c.id === caseId)
  const shown = cases.filter(c => !query.trim() || `${c.student} ${c.course ?? ''}`.toLowerCase().includes(query.trim().toLowerCase()))
  const set = (id: string, value: string) => setAnswers(a => ({ ...a, [id]: value }))

  const submit = () => {
    setError(null)
    if (!family && !caseId) { setError('Elige primero a qué caso corresponde esta aplicación.'); return }
    if (missing.length) { setError(`Falta responder ${missing.length === 1 ? 'una pregunta' : `${missing.length} preguntas`} de número.`); document.getElementById(`q-${missing[0].id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return }
    start(async () => {
      const form = new FormData()
      if (!family) form.set('case_id', caseId)
      for (const q of questions) form.set(`q:${q.id}`, answers[q.id] ?? '')
      let res: ActionResult
      try { res = await action(form) } catch { res = { ok: false, error: 'No se pudo registrar. Revisa tu conexión e inténtalo de nuevo.' } }
      if (!res.ok) { setError(res.error); return }
      toast.success(res.message ?? 'Aplicación registrada.')
      router.push(doneHref)
      router.refresh()
    })
  }

  return (
    <div className="mx-auto max-w-3xl pb-28">
      <Link href={backHref} className="mb-3 inline-flex items-center gap-1 text-[12.5px] font-medium text-v-muted hover:text-v-accent"><ArrowLeft size={14} />{backLabel}</Link>

      {/* Cabecera con el avance */}
      <div className="mb-4 flex items-center gap-4 rounded-v-lg border border-v-border bg-v-elevated p-5 shadow-v">
        <span className="v-brand grid size-12 shrink-0 place-items-center rounded-[30%] shadow-v-brand"><ClipboardCheck size={22} /></span>
        <div className="min-w-0 flex-1">
          <h1 className="v-display text-[1.35rem] font-bold leading-tight tracking-tight">{title}</h1>
          <p className={`mt-0.5 text-[13px] leading-relaxed text-v-muted ${family ? '' : 'line-clamp-2'}`}>{description || `${questions.length} preguntas`}</p>
        </div>
        <div className="relative size-12 shrink-0" title={`${done} de ${questions.length} respondidas`}>
          <svg viewBox="0 0 48 48" className="size-12 -rotate-90"><circle cx="24" cy="24" r="20" fill="none" strokeWidth="4" className="stroke-v-fill" />
            <motion.circle cx="24" cy="24" r="20" fill="none" strokeWidth="4" strokeLinecap="round" className="stroke-v-accent" strokeDasharray={circ}
              initial={{ strokeDashoffset: circ }} animate={{ strokeDashoffset: circ * (1 - progress) }} transition={{ type: 'spring', stiffness: 120, damping: 20 }} /></svg>
          <span className="absolute inset-0 grid place-items-center text-[11.5px] font-bold tabular-nums text-v-text">{done}/{questions.length}</span>
        </div>
      </div>

      {preview && <p className="mb-4 flex items-center gap-2.5 rounded-v-sm bg-v-warning/10 px-4 py-3 text-[13px] text-v-text"><Eye size={16} className="shrink-0 text-[#b45309]" /><span><span className="font-semibold">Vista previa.</span> {preview}</span></p>}

      {/* Paso 1: el caso */}
      {!preview && !family && (
        <section className="mb-4 rounded-v-lg border border-v-border bg-v-elevated p-5 shadow-v">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2.5 text-[15.5px] font-semibold tracking-tight"><span className="v-brand grid size-6 place-items-center rounded-full text-[12px] font-bold">1</span>¿A quién se la aplicas?</h2>
            {cases.length > 6 && <label className="flex items-center gap-2 rounded-full border border-v-border px-3.5 py-1.5 text-[13px]"><Search size={14} className="text-v-subtle" /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar estudiante" className="w-40 bg-transparent outline-none placeholder:text-v-subtle" /></label>}
          </div>
          {cases.length === 0 ? <p className="text-[13.5px] text-v-muted">No hay casos activos. Un instrumento se aplica a un estudiante con caso de acompañamiento abierto.</p> : (
            <div className="grid gap-2 sm:grid-cols-2">
              {shown.map(c => (
                <button key={c.id} type="button" onClick={() => setCaseId(c.id)} aria-pressed={caseId === c.id}
                  className={`flex items-center gap-3 rounded-v-sm border px-3.5 py-3 text-left transition-all ${caseId === c.id ? 'border-v-accent/50 bg-v-accent-soft ring-4 ring-v-accent-soft' : 'border-v-border hover:border-v-accent/40'}`}>
                  <Avatar name={c.student} id={c.studentId} size={38} />
                  <span className="min-w-0 flex-1"><span className="block truncate text-[14px] font-semibold text-v-text">{c.student}</span><span className="block truncate text-xs text-v-muted">{c.course ?? 'Sin curso'}</span></span>
                  {caseId === c.id && <CheckCircle2 size={18} className="shrink-0 text-v-accent" />}
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Paso 2: las preguntas */}
      <section className="space-y-3">
        {!preview && !family && <h2 className="flex items-center gap-2.5 px-1 pt-1 text-[15.5px] font-semibold tracking-tight"><span className="v-brand grid size-6 place-items-center rounded-full text-[12px] font-bold">2</span>Responde las preguntas</h2>}
        {questions.map((q, i) => {
          const value = answers[q.id] ?? ''
          const min = q.min ?? 1, max = q.max ?? 5
          const heading = q.section && q.section !== questions[i - 1]?.section ? q.section : null
          return (
            <div key={q.id} className="space-y-3">
            {heading && <h3 className="px-1 pt-3 text-[12px] font-bold uppercase tracking-[0.1em] text-v-accent">{heading}</h3>}
            <motion.div id={`q-${q.id}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.04, type: 'spring', stiffness: 220, damping: 24 }}
              className={`rounded-v-lg border bg-v-elevated p-5 shadow-v transition-colors ${value ? 'border-v-accent/30' : 'border-v-border'}`}>
              <p className="mb-3.5 flex items-start gap-3 text-[15.5px] font-semibold leading-snug text-v-text">
                <span className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-[11.5px] font-bold ${value ? 'bg-v-accent text-white' : 'bg-v-fill text-v-muted'}`}>{value ? <CheckCircle2 size={14} /> : i + 1}</span>{q.text}
              </p>
              {q.type === 'scale' ? (
                <div className="pl-9">
                  <div className="inline-flex flex-wrap gap-1.5 rounded-full bg-v-fill p-1.5">
                    {Array.from({ length: max - min + 1 }, (_, n) => min + n).map(n => (
                      <motion.button key={n} type="button" whileTap={{ scale: 0.9 }} disabled={!!preview} onClick={() => set(q.id, String(n))} aria-pressed={value === String(n)} aria-label={`${n} de ${max}`}
                        className={`grid size-11 place-items-center rounded-full text-base font-semibold tabular-nums transition-all ${value === String(n) ? 'v-brand' : 'text-v-muted hover:bg-v-elevated hover:text-v-text'}`}>{n}</motion.button>
                    ))}
                  </div>
                  <p className="mt-1.5 text-[11.5px] text-v-subtle">{min} = {q.minLabel ?? 'lo mínimo'} · {max} = {q.maxLabel ?? 'lo máximo'}</p>
                </div>
              ) : (
                <div className="pl-9"><textarea rows={3} maxLength={2000} disabled={!!preview} value={value} onChange={e => set(q.id, e.target.value)} placeholder="Escribe aquí (opcional)" className={`${INPUT} resize-y`} aria-label={q.text} /></div>
              )}
            </motion.div>
            </div>
          )
        })}
      </section>

      {guide && !family && <p className="mt-4 rounded-v-sm bg-v-accent-soft px-4 py-3 text-[12.5px] leading-relaxed text-v-text"><span className="font-semibold">Guía de lectura (solo para el equipo):</span> {guide}</p>}
      {ruleNote && <p className="mt-4 rounded-v-sm bg-v-fill/70 px-4 py-3 text-[12.5px] leading-relaxed text-v-muted"><span className="font-semibold text-v-text">Sobre el resultado:</span> {ruleNote}</p>}

      {/* Barra fija para registrar */}
      {!preview && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-v-border bg-v-elevated/95 px-4 py-3 backdrop-blur md:left-[248px]">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3">
            <p className={`min-w-0 flex-1 text-[13px] ${error ? 'font-semibold text-v-danger' : 'text-v-muted'}`} role={error ? 'alert' : undefined}>
              {error ?? (family ? `${done} de ${questions.length} respondidas` : chosen ? `${chosen.student} · ${done} de ${questions.length} respondidas` : 'Elige el caso y responde las preguntas.')}
            </p>
            <button type="button" onClick={submit} disabled={pending} className="v-brand inline-flex h-11 items-center gap-2 rounded-full px-6 text-[14px] font-semibold shadow-v-brand disabled:opacity-60">
              {pending ? <Loader2 size={16} className="animate-spin" /> : <ClipboardCheck size={16} />}{submitLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
