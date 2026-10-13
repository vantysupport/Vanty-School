'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Lightbulb, Loader2, MessageSquareWarning, Send, ShieldAlert, ShieldCheck, type LucideIcon } from 'lucide-react'
import type { ActionResult } from '@/lib/actions/result'
import { createReport } from '@/lib/actions/reports'
import { Button, Field, Input, Select, Textarea } from '@/components/ui/primitives'
import { Modal } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import { EvidenceField } from '@/components/shared/evidence-field'

type Kind = 'reclamo' | 'denuncia' | 'sugerencia'

const KINDS: { kind: Kind; title: string; text: string; example: string; icon: LucideIcon; cover: string; ask: string; hint: string }[] = [
  { kind: 'reclamo', title: 'Reclamo', text: 'Algo no está funcionando como debería.', example: 'Un servicio, una decisión, un trámite.',
    icon: MessageSquareWarning, cover: 'linear-gradient(135deg,#f59e0b,#f97316)', ask: '¿Qué no está funcionando?', hint: 'Cuenta qué pasó, cuándo y dónde.' },
  { kind: 'denuncia', title: 'Denuncia', text: 'Una situación grave que el colegio debe conocer.', example: 'Maltrato, acoso, discriminación, un riesgo.',
    icon: ShieldAlert, cover: 'linear-gradient(135deg,#f43f5e,#be123c)', ask: '¿Qué ocurrió?', hint: 'Cuenta los hechos tal como los viste o supiste: qué pasó, cuándo y dónde.' },
  { kind: 'sugerencia', title: 'Sugerencia', text: 'Una idea para que el colegio mejore.', example: 'Una propuesta, algo que se podría hacer distinto.',
    icon: Lightbulb, cover: 'linear-gradient(135deg,#01abfc,#0063d8)', ask: '¿Cuál es tu idea?', hint: 'Explica qué propones y qué mejoraría.' },
]

const PILL = 'block cursor-pointer rounded-full border border-v-border-strong px-3.5 py-1.5 text-center text-[12.5px] font-semibold text-v-muted transition-colors hover:border-v-accent peer-checked:border-transparent peer-checked:bg-v-accent peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-v-accent'

/** Tres portadas grandes: se elige qué se quiere contar y recién entonces aparece el formulario. */
export function ReportComposer({ categories, students, evidencePrefix }: { categories: [string, string][]; students?: { id: string; name: string }[]; evidencePrefix: string }) {
  const [kind, setKind] = useState<Kind | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const router = useRouter()
  const toast = useToast()
  const current = KINDS.find(k => k.kind === kind)
  const close = () => { setKind(null); setError(null) }

  const submit = (form: FormData) => start(async () => {
    let res: ActionResult
    try { res = await createReport(form) } catch { res = { ok: false, error: 'No se pudo enviar. Revisa tu conexión e inténtalo de nuevo.' } }
    if (!res.ok) { setError([res.error, ...Object.values(res.fieldErrors ?? {})].join(' ')); return }
    toast.success(res.message ?? 'Enviado.')
    close()
    router.refresh()
  })

  return (
    <>
      <div className="grid gap-4 md:grid-cols-3">
        {KINDS.map(k => (
          <button key={k.kind} type="button" onClick={() => setKind(k.kind)}
            className="group flex flex-col overflow-hidden rounded-v-lg border border-v-border bg-v-elevated text-left shadow-v-sm transition-all hover:-translate-y-1 hover:shadow-v-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v-accent">
            <span className="relative flex h-28 items-end overflow-hidden px-5 pb-4 text-white" style={{ background: k.cover }}>
              <k.icon size={96} strokeWidth={1.25} className="absolute -right-3 -top-3 opacity-20 transition-transform group-hover:scale-110" />
              <span className="grid size-11 place-items-center rounded-2xl bg-white/20"><k.icon size={22} /></span>
              <span className="ml-3 text-[22px] font-bold tracking-tight">{k.title}</span>
            </span>
            <span className="flex flex-1 flex-col px-5 py-4">
              <span className="text-[14.5px] font-semibold text-v-text">{k.text}</span>
              <span className="mt-1 text-[12.5px] text-v-muted">{k.example}</span>
              <span className="mt-4 flex items-center gap-1.5 text-[13px] font-semibold text-v-accent">Presentar {k.title.toLowerCase()}<ArrowRight size={14} className="transition-transform group-hover:translate-x-1" /></span>
            </span>
          </button>
        ))}
      </div>

      <Modal open={!!current} onClose={close} title={current ? `Presentar ${current.title.toLowerCase()}` : ''} description="Solo lo recibe el equipo directivo." wide>
        {current && (
          <form action={submit} className="space-y-4">
            <input type="hidden" name="kind" value={current.kind} />
            <fieldset>
              <legend className="mb-2 text-[12.5px] font-medium text-v-text">¿Sobre qué tema es?</legend>
              <div className="flex flex-wrap gap-2">
                {categories.map(([value, label], i) => (
                  <label key={value}><input type="radio" name="category" value={value} defaultChecked={i === 0} className="peer sr-only" /><span className={PILL}>{label}</span></label>
                ))}
              </div>
            </fieldset>
            {students && students.length > 0 && (
              <Field label="Estudiante afectado" hint="Opcional.">
                <Select name="student_id" defaultValue=""><option value="">No aplica</option>{students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
              </Field>
            )}
            <Field label="Asunto" hint="Un título corto."><Input name="subject" required minLength={3} maxLength={160} /></Field>
            <Field label={current.ask} hint={current.hint}><Textarea name="description" required minLength={10} maxLength={6000} rows={6} /></Field>
            <Field label="Personas o lugar involucrados" hint="Opcional."><Input name="involved" maxLength={500} /></Field>
            <EvidenceField prefix={evidencePrefix} />
            <p className="flex items-start gap-2 rounded-v-sm bg-v-accent-soft px-3.5 py-2.5 text-[12.5px] leading-relaxed text-v-text">
              <ShieldCheck size={15} className="mt-0.5 shrink-0 text-v-accent" />
              No lo ven otros apoderados, estudiantes, docentes ni la secretaría, y tu identidad no se comparte con las personas involucradas.
            </p>
            {error && <p role="alert" className="rounded-v-sm bg-v-danger-soft px-3 py-2 text-[12.5px] text-[#c0343a]">{error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={close} disabled={pending}>Cancelar</Button>
              <Button type="submit" disabled={pending}>{pending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}Enviar a dirección</Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  )
}
