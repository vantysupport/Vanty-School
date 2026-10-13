import { CheckCircle2, ShieldCheck, Star } from 'lucide-react'
import { requireSession } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { nameMap } from '@/lib/data/people'
import { submitTeacherFeedback } from '@/lib/actions/feedback'
import { currentMonth, FEEDBACK_DIMENSIONS, monthLabel, SCALE } from '@/lib/feedback'
import { Avatar, Badge, Card, EmptyState, Notice, PageHeader, StatStrip, Textarea } from '@/components/ui/primitives'
import { FormDialog } from '@/components/ui/dialog'

export default async function StudentFeedback() {
  const session = await requireSession('estudiante')
  const db = await createClient()
  const month = currentMonth()
  const { data: enrollment } = await db.from('course_enrollments').select('course_id, courses(name)')
    .eq('institution_id', session.institutionId).eq('student_id', session.userId).eq('status', 'active').maybeSingle()
  const courseId = enrollment?.course_id as string | undefined

  const [{ data: classes }, { data: done }] = await Promise.all([
    courseId ? db.from('teacher_assignments').select('teacher_id, subject_id, subjects(name)').eq('course_id', courseId) : Promise.resolve({ data: [] }),
    db.from('teacher_feedback').select('teacher_id, subject_id').eq('student_id', session.userId).eq('period_month', month),
  ])
  const list = ((classes ?? []) as unknown as { teacher_id: string; subject_id: string; subjects: { name: string } }[])
    .sort((a, b) => a.subjects.name.localeCompare(b.subjects.name, 'es'))
  const names = await nameMap(db, list.map(c => c.teacher_id))
  const answered = (c: { teacher_id: string; subject_id: string }) => (done ?? []).some(d => d.teacher_id === c.teacher_id && d.subject_id === c.subject_id)
  const pending = list.filter(c => !answered(c)).length

  return (
    <>
      <PageHeader title="Evaluar mis clases" description={`Una vez al mes cuentas cómo van tus clases. Tus respuestas de ${monthLabel(month).toLowerCase()} ayudan a tus profesores a mejorarlas.`} />
      <StatStrip items={[
        { label: 'Clases por evaluar', value: pending, icon: <Star size={15} />, tone: pending ? 'warning' : 'success' },
        { label: 'Evaluadas este mes', value: list.length - pending, hint: `de ${list.length}`, icon: <CheckCircle2 size={15} />, tone: 'success' },
      ]} />
      <div className="mb-4"><Notice title="Tu evaluación es anónima">
        <span className="inline-flex items-start gap-2"><ShieldCheck size={15} className="mt-0.5 shrink-0" />
          Ni tus profesores ni la dirección saben quién respondió qué: solo ven promedios del curso, y recién cuando hay al menos cinco respuestas. No hay respuestas buenas o malas; responde lo que de verdad vives en clases.</span>
      </Notice></div>

      {list.length === 0 ? <Card><EmptyState aria={4} title="Aún no tienes clases para evaluar" description="Aparecerán cuando tu curso tenga docentes asignados." /></Card> : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((c, i) => {
            const teacher = names.get(c.teacher_id) ?? 'Docente'
            const isDone = answered(c)
            return (
              <Card key={c.teacher_id + c.subject_id} index={i + 2} className="p-5">
                <div className="flex items-center gap-3">
                  <Avatar name={teacher} size={42} id={c.teacher_id} />
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-[15px] font-semibold tracking-tight">{c.subjects.name}</h2>
                    <p className="truncate text-xs text-v-muted">{teacher}</p>
                  </div>
                  {isDone && <Badge tone="success"><CheckCircle2 size={11} />Evaluada</Badge>}
                </div>
                <div className="mt-4">
                  {isDone ? <p className="text-[13px] text-v-muted">Gracias. Podrás evaluarla de nuevo el próximo mes.</p> : (
                    <FormDialog trigger={<><Star size={14} />Evaluar esta clase</>} title={`${c.subjects.name} · ${teacher}`} action={submitTeacherFeedback} submitLabel="Enviar evaluación" wide
                      description="Piensa en las clases de este mes. Marca qué tan seguido ocurre cada cosa.">
                      <input type="hidden" name="teacher_id" value={c.teacher_id} />
                      <input type="hidden" name="course_id" value={courseId} />
                      <input type="hidden" name="subject_id" value={c.subject_id} />
                      {FEEDBACK_DIMENSIONS.map(d => (
                        <fieldset key={d.key}>
                          <legend className="mb-1.5 text-[13.5px] font-semibold text-v-text">{d.question}</legend>
                          <div className="grid grid-cols-5 overflow-hidden rounded-v-sm border border-v-border-strong">
                            {SCALE.map((label, n) => (
                              <label key={label} className="cursor-pointer border-r border-v-border-strong px-1 py-2 text-center text-[11.5px] font-medium text-v-muted last:border-r-0 has-[:checked]:bg-v-accent has-[:checked]:text-white has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-v-accent">
                                <input type="radio" name={d.key} value={n + 1} required className="sr-only" />{label}
                              </label>
                            ))}
                          </div>
                        </fieldset>
                      ))}
                      <label className="block">
                        <span className="mb-1.5 block text-[13.5px] font-semibold text-v-text">¿Qué te ayudaría a aprender mejor en esta clase? <span className="font-normal text-v-subtle">(opcional)</span></span>
                        <Textarea name="comment" rows={3} maxLength={500} placeholder="Una idea concreta, sin nombres de compañeros." />
                      </label>
                    </FormDialog>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </>
  )
}
