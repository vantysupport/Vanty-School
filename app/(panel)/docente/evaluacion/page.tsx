import { Handshake, Pencil, Plus, ShieldCheck, Star, Trash2, TrendingUp } from 'lucide-react'
import { requireSession } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { addCommitment, deleteCommitment, updateCommitment } from '@/lib/actions/feedback'
import { COMMITMENT_FOCUS, COMMITMENT_STATUS, FEEDBACK_DIMENSIONS, MIN_RESPONSES, monthLabel, type FeedbackMonth } from '@/lib/feedback'
import { Badge, Card, CardBody, CardHeader, EmptyState, Field, PageHeader, Select, Textarea } from '@/components/ui/primitives'
import { ConfirmAction, FormDialog } from '@/components/ui/dialog'
import { Bar, BarChart, Ring } from '@/components/ui/motion'
import { AriaAvatar } from '@/components/aria/aria-chat'
import { Delta, Insight, one, tone } from '@/components/direction/teacher-feedback'

/** Lo que el docente ve de la evaluación mensual de sus clases: solo promedios (nunca comentarios ni respuestas
 *  individuales), la lectura de ARIA que dirección decida compartirle y las estrategias que él mismo se propone. */
export default async function MyClassFeedback() {
  const session = await requireSession('docente')
  const db = await createClient()
  const inst = session.institutionId
  const [{ data: summary }, { data: teaching }, { data: shared }, { data: commitments }] = await Promise.all([
    db.rpc('teacher_feedback_summary', { p_inst: inst, p_teacher: session.userId }),
    db.from('teacher_assignments').select('course_id, subject_id, courses(name), subjects(name)').eq('institution_id', inst).eq('teacher_id', session.userId),
    // RLS: solo llegan las lecturas que dirección marcó como compartidas.
    db.from('teacher_feedback_insights').select('period_month, content, shared_at').eq('institution_id', inst).eq('teacher_id', session.userId).order('period_month', { ascending: false }).limit(3),
    db.from('teaching_commitments').select('id, period_month, focus, action, status, reflection').eq('institution_id', inst).eq('teacher_id', session.userId).order('period_month', { ascending: false }).order('created_at', { ascending: false }),
  ])
  const months = (summary ?? []) as FeedbackMonth[]
  const latest = months[0], previous = months[1]
  const groups = (teaching ?? []) as unknown as { course_id: string; subject_id: string; courses: { name: string } | null; subjects: { name: string } | null }[]
  const label = (c: string, s: string) => { const g = groups.find(x => x.course_id === c && x.subject_id === s); return g ? `${g.courses?.name ?? 'Curso'} · ${g.subjects?.name ?? 'Asignatura'}` : 'Curso' }
  const C = commitments ?? []
  const reading = (shared ?? [])[0]
  const sorted = latest ? [...FEEDBACK_DIMENSIONS].sort((a, b) => latest.dims[b.key] - latest.dims[a.key]) : []

  const newStrategy = (
    <FormDialog trigger={<><Plus size={15} />Registrar estrategia</>} title="Nueva estrategia" description="Algo concreto que vas a probar en tus clases. La ve dirección para acompañarte; nadie más." action={addCommitment} submitLabel="Registrar" wide>
      <Field label="¿A qué aspecto apunta?">
        <Select name="focus" required defaultValue={sorted[sorted.length - 1]?.key ?? 'general'}>{COMMITMENT_FOCUS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}</Select>
      </Field>
      <Field label="¿Qué vas a hacer?" hint="Ej.: «Cerrar cada clase con dos minutos de preguntas y un resumen en la pizarra».">
        <Textarea name="action" required minLength={5} maxLength={1000} rows={4} />
      </Field>
    </FormDialog>
  )

  return (
    <>
      <PageHeader title="Evaluación de mis clases" description="Cómo perciben tus clases los estudiantes, mes a mes, y lo que te propones a partir de eso." actions={newStrategy} />

      <p className="mb-4 flex items-start gap-3 rounded-v-lg border border-v-border bg-v-elevated px-5 py-3.5 text-[13px] leading-relaxed text-v-muted shadow-v-xs">
        <ShieldCheck size={18} className="mt-0.5 shrink-0 text-v-accent" />
        <span><span className="font-semibold text-v-text">Es una señal para mejorar, no una calificación.</span> Ves solo promedios de {MIN_RESPONSES} o más respuestas: nunca comentarios ni quién respondió qué. Es la percepción de los estudiantes sobre la clase y depende también del horario, el tamaño del curso y la dificultad del contenido.</span>
      </p>

      {!latest ? (
        <Card><EmptyState aria={3} title="Aún no hay resultados" description={`Se muestran cuando un mes reúne al menos ${MIN_RESPONSES} respuestas, para resguardar el anonimato de tus estudiantes.`} /></Card>
      ) : (
        <div className="grid items-stretch gap-4 xl:grid-cols-[1.4fr_1fr]">
          <Card index={1} className="flex flex-col">
            <CardHeader icon={<Star size={15} />} title={monthLabel(latest.month)} description={`${latest.responses} respuestas de tus estudiantes`} actions={<Badge tone="accent"><ShieldCheck size={11} />Anónima</Badge>} />
            <CardBody className="flex flex-1 flex-col">
              <div className="flex flex-wrap items-center gap-5 rounded-v-sm bg-v-fill p-4">
                <Ring value={(latest.score / 5) * 100} size={84} label={`Promedio ${one(latest.score)} de 5`} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-baseline gap-2"><span className="v-display text-4xl font-bold leading-none tabular-nums">{one(latest.score)}</span><span className="text-sm text-v-subtle">de 5</span>{previous && <Delta value={latest.score - previous.score} />}</p>
                  <p className="mt-1.5 text-xs text-v-muted">Lo más valorado: <span className="font-semibold text-v-text">{sorted[0].label.toLowerCase()}</span> · Mayor espacio de mejora: <span className="font-semibold text-v-text">{sorted[sorted.length - 1].label.toLowerCase()}</span></p>
                </div>
              </div>
              <ul className="mt-5 space-y-3.5">
                {FEEDBACK_DIMENSIONS.map((d, i) => (
                  <li key={d.key}>
                    <div className="mb-1.5 flex items-center justify-between gap-3 text-[13px]">
                      <span className="min-w-0"><span className="font-semibold">{d.label}</span><span className="ml-2 hidden text-xs text-v-subtle sm:inline">«{d.question}»</span></span>
                      <span className="flex shrink-0 items-center gap-2"><span className="v-display w-8 text-right font-bold tabular-nums">{one(latest.dims[d.key])}</span><Delta value={previous ? latest.dims[d.key] - previous.dims[d.key] : null} /></span>
                    </div>
                    <Bar value={(latest.dims[d.key] / 5) * 100} tone={tone(latest.dims[d.key])} delay={0.2 + i * 0.06} />
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>

          <div className="flex min-w-0 flex-col gap-4">
            {months.length > 1 && (
              <Card index={2}>
                <CardHeader icon={<TrendingUp size={15} />} tone="success" title="Evolución mensual" description="Promedio general de cada mes" />
                <CardBody><BarChart height={150} data={[...months].reverse().slice(-6).map(m => ({ label: monthLabel(m.month).slice(0, 3), value: m.score, display: one(m.score) }))} /></CardBody>
              </Card>
            )}
            <Card index={3} className="flex flex-1 flex-col">
              <CardHeader icon={<Star size={15} />} title="Por curso y asignatura" description={`Solo los grupos con ${MIN_RESPONSES} o más respuestas`} />
              <CardBody className="flex-1">
                {latest.groups.length === 0 ? <p className="text-[13.5px] text-v-muted">Ningún curso reunió suficientes respuestas este mes.</p> : (
                  <ul className="space-y-3">
                    {latest.groups.map(g => (
                      <li key={g.course_id + g.subject_id}>
                        <div className="mb-1 flex justify-between gap-2 text-xs"><span className="truncate font-medium">{label(g.course_id, g.subject_id)}</span>
                          <span className="shrink-0 tabular-nums text-v-muted"><span className="font-semibold text-v-text">{one(g.score)}</span> · {g.responses} resp.</span></div>
                        <Bar value={(g.score / 5) * 100} tone={tone(g.score)} />
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          </div>
        </div>
      )}

      {reading && (
        <Card index={4} className="relative mt-4">
          <div aria-hidden className="v-brand absolute inset-x-0 top-0 h-[3px]" />
          <div className="flex items-center gap-2.5 px-5 pb-3 pt-5">
            <span className="rounded-full ring-2 ring-v-accent-soft"><AriaAvatar size={34} /></span>
            <div><h2 className="text-[15px] font-semibold tracking-tight">Lectura de ARIA <span className="font-normal text-v-muted">· {monthLabel(reading.period_month as string)}</span></h2><p className="text-xs text-v-subtle">La compartió dirección contigo. Son hipótesis y apoyos posibles, no una evaluación.</p></div>
          </div>
          <CardBody><Insight text={reading.content as string} /></CardBody>
        </Card>
      )}

      <Card index={5} className="mt-4">
        <CardHeader icon={<Handshake size={15} />} tone="success" title="Mis estrategias" description="Lo que te propones probar. Anota después cómo te fue: así el próximo mes puedes comparar." actions={C.length > 0 ? <Badge tone="accent">{C.filter(c => c.status !== 'done').length} en curso</Badge> : undefined} />
        {C.length === 0 ? (
          <EmptyState aria={2} title="Aún no registras estrategias" description="Elige un aspecto de tu evaluación y anota algo concreto que vas a probar con «Registrar estrategia»." />
        ) : (
          <ul className={`grid gap-3 p-5 ${C.length > 1 ? 'lg:grid-cols-2' : ''}`}>
            {C.map(c => (
              <li key={c.id as string} className="flex flex-col rounded-v-sm border border-v-border p-4">
                <p className="flex flex-wrap items-center gap-2 text-[11.5px] font-semibold text-v-muted">
                  <Badge tone="accent">{COMMITMENT_FOCUS.find(f => f.key === c.focus)?.label ?? 'General'}</Badge>
                  <Badge tone={COMMITMENT_STATUS[c.status as string]?.tone ?? 'neutral'}>{COMMITMENT_STATUS[c.status as string]?.label ?? 'Por empezar'}</Badge>
                  <span>{monthLabel(c.period_month as string)}</span>
                </p>
                <p className="mt-2 whitespace-pre-wrap text-[13.5px] leading-relaxed text-v-text">{c.action as string}</p>
                {c.reflection && <p className="mt-2 rounded-v-sm bg-v-fill px-3 py-2 text-[12.5px] leading-relaxed text-v-muted"><span className="font-semibold text-v-text">Cómo me fue: </span>{c.reflection as string}</p>}
                <div className="mt-auto flex items-center justify-end gap-1 pt-3">
                  <FormDialog trigger={<><Pencil size={13} />Actualizar</>} variant="secondary" size="sm" title="Actualizar estrategia" action={updateCommitment.bind(null, c.id as string)} submitLabel="Guardar">
                    <Field label="¿En qué va?">
                      <Select name="status" defaultValue={c.status as string}>{Object.entries(COMMITMENT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select>
                    </Field>
                    <Field label="¿Cómo te fue?" hint="Opcional. Qué resultó, qué cambiarías."><Textarea name="reflection" rows={3} maxLength={1000} defaultValue={(c.reflection as string | null) ?? ''} /></Field>
                  </FormDialog>
                  <ConfirmAction action={deleteCommitment.bind(null, c.id as string)} variant="ghost" size="sm" danger ariaLabel="Eliminar estrategia" title="Eliminar estrategia" confirmLabel="Eliminar" message="Se eliminará esta estrategia de tu registro."><Trash2 size={14} /></ConfirmAction>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  )
}
