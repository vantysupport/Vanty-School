import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, CalendarClock, Download, FileText, Lock, Save, MessageSquareText, Paperclip, Pencil, Send, Trash2, Undo2, Users } from 'lucide-react'
import { requireSession } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { nameMap } from '@/lib/data/people'
import { deleteAssignment, saveGrade, saveGrades, setAssignmentStatus, updateAssignment } from '@/lib/actions/teaching'
import { fmtWeight, isEvaluation, KIND_LABEL } from '@/lib/assessments'
import { average, fmtDateTime, fmtScore, scoreTone, toLocalInput } from '@/lib/format'
import { fileHref } from '@/components/shared/resources'
import { Avatar, Badge, buttonClass, Card, CardBody, EmptyState, Field, Input, Textarea } from '@/components/ui/primitives'
import { ConfirmAction, FormDialog, InlineForm, SubmitButton } from '@/components/ui/dialog'
import { Reveal } from '@/components/ui/motion'
import { AssignmentFields } from '@/components/teaching/assignment-fields'

type Search = { vista?: string; f?: string }
const COVER: Record<string, string> = { parvularia: 'linear-gradient(135deg,#f59e0b,#f97316)', basica: 'linear-gradient(135deg,#01abfc,#0063d8)', media: 'linear-gradient(135deg,#6366f1,#7c3aed)' }
const STATUS: Record<string, string> = { draft: 'Borrador', published: 'Publicada', closed: 'Cerrada' }

export default async function TeacherAssignment({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Search> }) {
  const session = await requireSession('docente')
  const { id } = await params
  const sp = await searchParams
  const db = await createClient()
  // RLS: la tarea solo existe para el docente que imparte ese curso y asignatura.
  const { data: a } = await db.from('assignments')
    .select('id, title, description, topic, due_at, status, kind, weight, course_id, subject_id, attachment_path, attachment_name, courses(name, grade_levels(stage)), subjects(name)')
    .eq('id', id).eq('institution_id', session.institutionId).maybeSingle()
  if (!a) notFound()
  const meta = a as unknown as typeof a & { courses: { name: string; grade_levels: { stage: string } | null }; subjects: { name: string } }

  const evaluation = isEvaluation(a.kind as string)

  const [{ data: enrollments }, { data: submissions }, { data: grades }] = await Promise.all([
    db.from('course_enrollments').select('student_id').eq('course_id', a.course_id).eq('status', 'active'),
    db.from('assignment_submissions').select('student_id, content, file_path, file_name, submitted_at').eq('assignment_id', id),
    db.from('grades').select('student_id, score, feedback').eq('assignment_id', id),
  ])
  const names = await nameMap(db, (enrollments ?? []).map(e => e.student_id as string))
  const subOf = new Map((submissions ?? []).map(s => [s.student_id as string, s]))
  const gradeOf = new Map((grades ?? []).map(g => [g.student_id as string, g]))
  const students = (enrollments ?? []).map(e => {
    const sid = e.student_id as string, sub = subOf.get(sid), grade = gradeOf.get(sid)
    return { id: sid, name: names.get(sid) ?? 'Estudiante', sub, grade, state: grade ? 'calificadas' : sub ? 'porcorregir' : 'sinentregar' }
  }).sort((x, y) => x.name.localeCompare(y.name, 'es'))
  const scores = (grades ?? []).map(g => Number(g.score))
  const count = (state: string) => students.filter(s => s.state === state).length
  const view = sp.vista === 'instrucciones' ? 'instrucciones' : 'trabajo'
  const filter = sp.f ?? 'todos'
  const shown = students.filter(s => filter === 'todos' || s.state === filter)
    .sort((x, y) => ['porcorregir', 'sinentregar', 'calificadas'].indexOf(x.state) - ['porcorregir', 'sinentregar', 'calificadas'].indexOf(y.state) || x.name.localeCompare(y.name, 'es'))
  const late = (at: string) => new Date(at) > new Date(a.due_at)
  const href = (patch: Search) => {
    const next = new URLSearchParams()
    for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v) next.set(k, v)
    const q = next.toString()
    return q ? `/docente/tareas/${id}?${q}` : `/docente/tareas/${id}`
  }
  const tab = (on: boolean) => `inline-flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-[13px] font-semibold ${on ? 'v-brand shadow-v-brand' : 'text-v-muted hover:bg-v-fill hover:text-v-text'}`
  const chip = (on: boolean) => `whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold ${on ? 'bg-v-accent-soft text-v-accent' : 'text-v-muted hover:bg-v-fill'}`

  return (
    <>
      <Link href={`/docente/cursos/${a.course_id}?tab=${a.subject_id}`} className="mb-3 inline-flex items-center gap-1 text-[12.5px] font-medium text-v-muted hover:text-v-accent"><ArrowLeft size={14} />{meta.courses.name}</Link>

      {/* Portada de la tarea */}
      <Reveal className="relative mb-4 overflow-hidden rounded-v-lg text-white shadow-v">
        <div className="relative p-6 sm:p-7" style={{ background: a.status === 'draft' ? 'linear-gradient(135deg,#94a3b8,#475569)' : evaluation ? 'linear-gradient(135deg,#8b5cf6,#6d28d9)' : COVER[meta.courses.grade_levels?.stage ?? 'basica'] ?? COVER.basica }}>
          <span aria-hidden className="pointer-events-none absolute -right-12 -top-20 size-64 rounded-full bg-white/15" />
          <span aria-hidden className="pointer-events-none absolute -bottom-24 right-32 size-56 rounded-full bg-white/10" />
          <div className="relative flex flex-wrap items-end justify-between gap-5">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-[12px] font-semibold text-white/90">
                <Link href={`/docente/cursos/${a.course_id}?tab=${a.subject_id}`} className="hover:underline">{meta.courses.name} · {meta.subjects.name}</Link>
                {evaluation && <span className="rounded-full bg-white px-2.5 py-0.5 text-[#5b21b6]">{KIND_LABEL[a.kind as string]}</span>}
                <span className="rounded-full bg-white/20 px-2.5 py-0.5">{STATUS[a.status as string]}</span>
                {a.topic && <span className="rounded-full bg-white/20 px-2.5 py-0.5">{a.topic}</span>}
                {a.weight != null && <span className="rounded-full bg-white/20 px-2.5 py-0.5">{fmtWeight(a.weight as number)} del promedio</span>}
              </p>
              <h1 className="v-display mt-2 text-[1.8rem] font-bold leading-tight tracking-tight sm:text-[2.1rem]">{a.title}</h1>
              <p className="mt-1.5 inline-flex items-center gap-1.5 text-[14px] text-white/90"><CalendarClock size={15} />{evaluation ? 'Se rinde el' : 'Entrega hasta el'} {fmtDateTime(a.due_at)}</p>
            </div>
            <dl className="flex divide-x divide-white/25 text-center">
              {(evaluation ? [['Con nota', scores.length], ['Sin nota', students.length - scores.length], ['Promedio', fmtScore(average(scores))]] : [['Entregadas', (submissions ?? []).length], ['Sin entregar', count('sinentregar')], ['Calificadas', scores.length]]).map(([label, value]) => (
                <div key={label as string} className="px-5"><dd className="v-display text-4xl font-bold leading-none tabular-nums">{value}</dd><dt className="mt-1.5 text-[12px] text-white/85">{label}</dt></div>
              ))}
            </dl>
          </div>
        </div>
      </Reveal>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Vistas de la tarea" className="flex max-w-full gap-1 overflow-x-auto rounded-full border border-v-border bg-v-elevated p-1 shadow-v-xs">
          <Link href={href({ vista: undefined })} scroll={false} className={tab(view === 'trabajo')}><Users size={15} />{evaluation ? 'Notas' : 'Trabajo de los estudiantes'}</Link>
          <Link href={href({ vista: 'instrucciones', f: undefined })} scroll={false} className={tab(view === 'instrucciones')}><FileText size={15} />Instrucciones</Link>
        </nav>
        <div className="flex flex-wrap gap-2">
          <FormDialog trigger={<><Pencil size={14} />Editar</>} variant="secondary" title={evaluation ? 'Editar evaluación' : 'Editar tarea'} action={updateAssignment.bind(null, id)} submitLabel="Guardar cambios" wide>
            <AssignmentFields institutionId={session.institutionId} editing dueDefault={toLocalInput(a.due_at as string)}
              defaults={{ title: a.title as string, description: a.description as string, topic: a.topic as string | null, attachmentName: a.attachment_name as string | null, weight: a.weight as number | null }} />
          </FormDialog>
          {a.status === 'draft' && <ConfirmAction action={setAssignmentStatus.bind(null, id, 'published')} variant="primary" size="md" title="Publicar tarea" confirmLabel="Publicar" message="La tarea será visible para los estudiantes del curso y sus apoderados."><Send size={14} />Publicar</ConfirmAction>}
          {a.status === 'published' && !evaluation && <ConfirmAction action={setAssignmentStatus.bind(null, id, 'closed')} variant="secondary" size="md" title="Cerrar tarea" confirmLabel="Cerrar" message="La tarea dejará de recibir entregas. Podrás seguir calificando."><Lock size={14} />Cerrar entregas</ConfirmAction>}
          {a.status === 'closed' && !evaluation && <ConfirmAction action={setAssignmentStatus.bind(null, id, 'published')} variant="secondary" size="md" title="Reabrir tarea" confirmLabel="Reabrir" message="La tarea volverá a recibir entregas."><Undo2 size={14} />Reabrir</ConfirmAction>}
          {(submissions ?? []).length === 0 && scores.length === 0 && (
            <ConfirmAction action={deleteAssignment.bind(null, id)} redirectTo={`/docente/cursos/${a.course_id}?tab=${a.subject_id}`} variant="danger" size="md" danger title="Eliminar tarea" confirmLabel="Eliminar" message="La tarea se eliminará de forma definitiva. Solo es posible porque aún no tiene entregas ni notas."><Trash2 size={14} />Eliminar</ConfirmAction>
          )}
        </div>
      </div>

      {/* ── Instrucciones ── */}
      {view === 'instrucciones' && (
        <Card index={2}>
          <CardBody className="!pt-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-v-subtle">Instrucciones</p>
            {a.description ? <p className="mt-2 max-w-3xl whitespace-pre-wrap text-[14.5px] leading-relaxed text-v-text">{a.description}</p>
              : <p className="mt-2 text-[14px] text-v-muted">Esta tarea no tiene instrucciones escritas. Puedes agregarlas con «Editar».</p>}
            <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.1em] text-v-subtle">Archivo adjunto</p>
            {a.attachment_path ? (
              <a href={fileHref('materials', a.attachment_path)} target="_blank" rel="noreferrer" className="mt-2 inline-flex max-w-full items-center gap-3 rounded-v-sm border border-v-border p-3 pr-5 hover:border-v-accent">
                <span className="grid size-10 shrink-0 place-items-center rounded-[30%] bg-v-accent-soft text-v-accent"><Paperclip size={17} /></span>
                <span className="min-w-0"><span className="block truncate text-[13.5px] font-semibold">{a.attachment_name}</span><span className="inline-flex items-center gap-1 text-xs text-v-muted"><Download size={11} />Descargar</span></span>
              </a>
            ) : <p className="mt-2 text-[14px] text-v-muted">Sin archivo. Puedes subir una guía o pauta con «Editar».</p>}
          </CardBody>
        </Card>
      )}

      {/* ── Planilla de notas de una evaluación ── */}
      {view === 'trabajo' && evaluation && (
        <Card index={2}>
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div>
              <p className="text-[15.5px] font-semibold tracking-tight">Planilla de notas</p>
              <p className="mt-0.5 text-[12.5px] text-v-muted">Escribe las notas de todo el curso y guárdalas de una vez. Puedes dejar en blanco a quien no rindió.</p>
            </div>
            <p className="text-[13px] text-v-muted">Promedio <span className="v-display ml-1 text-lg font-bold text-v-text">{fmtScore(average(scores))}</span></p>
          </div>
          {students.length === 0 ? <EmptyState aria={4} title="El curso no tiene estudiantes matriculados" /> : (
            <InlineForm action={saveGrades.bind(null, id)} resetOnSuccess={false}>
              <ul className="divide-y divide-v-border border-t border-v-border">
                {students.map((st, n) => (
                  <li key={st.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                    <span className="w-6 shrink-0 text-right text-[12.5px] tabular-nums text-v-subtle">{n + 1}</span>
                    <Avatar name={st.name} size={38} id={st.id} />
                    <p className="min-w-0 flex-1 basis-44 truncate text-[14.5px] font-semibold">{st.name}{!st.grade && <span className="ml-2 text-xs font-normal text-v-subtle">sin nota</span>}</p>
                    <Input name={`score:${st.id}`} inputMode="decimal" defaultValue={st.grade ? fmtScore(st.grade.score) : ''} placeholder="Nota" pattern="[1-7]([.,][0-9])?" aria-label={`Nota de ${st.name}`} autoComplete="off"
                      className={`!h-11 !w-[84px] text-center text-[16px] font-bold ${st.grade ? (scoreTone(Number(st.grade.score)) === 'danger' ? '!border-v-danger/40 !text-v-danger' : '!border-v-success/40') : ''}`} />
                    <Input name={`feedback:${st.id}`} defaultValue={(st.grade?.feedback as string | undefined) ?? ''} maxLength={2000} placeholder="Comentario (opcional)" aria-label={`Comentario para ${st.name}`} className="!h-11 min-w-0 flex-1 basis-56" />
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-v-border px-5 py-4">
                <p className="text-xs text-v-subtle">Escala de 1,0 a 7,0 (aprueba con 4,0). Usa coma o punto decimal.</p>
                <SubmitButton><Save size={15} />Guardar notas</SubmitButton>
              </div>
            </InlineForm>
          )}
        </Card>
      )}

      {/* ── Trabajo de los estudiantes ── */}
      {view === 'trabajo' && !evaluation && (
        <Card index={2}>
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
            <nav aria-label="Filtrar entregas" className="flex flex-wrap gap-1">
              {([['todos', 'Todos', students.length], ['porcorregir', 'Por corregir', count('porcorregir')], ['sinentregar', 'Sin entregar', count('sinentregar')], ['calificadas', 'Calificadas', count('calificadas')]] as const)
                .map(([v, l, n]) => <Link key={v} href={href({ f: v === 'todos' ? undefined : v })} scroll={false} className={chip(filter === v)}>{l} <span className="opacity-70">{n}</span></Link>)}
            </nav>
            <p className="text-[13px] text-v-muted">Promedio <span className="v-display ml-1 text-lg font-bold text-v-text">{fmtScore(average(scores))}</span></p>
          </div>
          {students.length === 0 ? <EmptyState aria={4} title="El curso no tiene estudiantes matriculados" /> : shown.length === 0 ? <EmptyState title="Ningún estudiante en este grupo" /> : (
            <ul className="divide-y divide-v-border border-t border-v-border">
              {shown.map(s => (
                <li key={s.id} className="flex flex-wrap items-start gap-x-4 gap-y-3 px-5 py-4">
                  <Avatar name={s.name} size={40} id={s.id} />
                  <div className="min-w-0 flex-1 basis-64">
                    <p className="flex flex-wrap items-center gap-2 text-[14.5px] font-semibold">{s.name}
                      {s.state === 'porcorregir' && <Badge tone="warning">Por corregir</Badge>}
                      {s.state === 'sinentregar' && <Badge>Sin entregar</Badge>}
                      {s.sub && late(s.sub.submitted_at as string) && <Badge tone="danger">Fuera de plazo</Badge>}
                    </p>
                    {s.sub ? (
                      <>
                        <p className="mt-0.5 text-xs text-v-subtle">Entregó el {fmtDateTime(s.sub.submitted_at)}</p>
                        {s.sub.content && <p className="mt-2 max-w-2xl whitespace-pre-wrap rounded-v-sm bg-v-fill px-3.5 py-2.5 text-[13.5px] leading-relaxed text-v-text">{s.sub.content}</p>}
                        {s.sub.file_path && <a href={fileHref('submissions', s.sub.file_path as string)} target="_blank" rel="noreferrer" className={buttonClass('secondary', 'sm', 'mt-2')}><Download size={13} />{s.sub.file_name}</a>}
                      </>
                    ) : <p className="mt-0.5 text-xs text-v-subtle">No ha entregado en la plataforma. Igual puedes ponerle nota (por ejemplo, trabajos en papel).</p>}
                    {s.grade?.feedback && <p className="mt-2 max-w-2xl rounded-v-sm border-l-[3px] border-v-accent bg-v-accent-soft px-3 py-2 text-[13px] text-v-text"><span className="font-semibold">Tu retroalimentación:</span> {s.grade.feedback}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {/* Nota rápida: se escribe y se guarda sin abrir nada. */}
                    <InlineForm action={saveGrade.bind(null, id)} resetOnSuccess={false} className="flex items-center gap-2">
                      <input type="hidden" name="student_id" value={s.id} />
                      <input type="hidden" name="feedback" value={(s.grade?.feedback as string | undefined) ?? ''} />
                      <Input name="score" inputMode="decimal" required defaultValue={s.grade ? fmtScore(s.grade.score) : ''} placeholder="Nota" pattern="[1-7]([.,][0-9])?" aria-label={`Nota de ${s.name}`}
                        className={`!h-10 !w-[76px] text-center text-[15px] font-bold ${s.grade ? (scoreTone(Number(s.grade.score)) === 'danger' ? '!border-v-danger/40 !text-v-danger' : '!border-v-success/40') : ''}`} />
                      <SubmitButton variant={s.grade ? 'secondary' : 'primary'} size="sm">{s.grade ? 'Cambiar' : 'Guardar'}</SubmitButton>
                    </InlineForm>
                    <FormDialog trigger={<MessageSquareText size={15} />} size="sm" variant="ghost" title={`Nota y comentario para ${s.name}`} description={`${a.title} · escala de 1,0 a 7,0`} action={saveGrade.bind(null, id)} submitLabel="Guardar">
                      <input type="hidden" name="student_id" value={s.id} />
                      <Field label="Nota" hint="Usa coma o punto decimal. Nota de aprobación: 4,0."><Input name="score" inputMode="decimal" required defaultValue={s.grade ? fmtScore(s.grade.score) : ''} placeholder="5,5" pattern="[1-7]([.,][0-9])?" /></Field>
                      <Field label="Retroalimentación para el estudiante"><Textarea name="feedback" rows={4} maxLength={2000} defaultValue={(s.grade?.feedback as string | undefined) ?? ''} placeholder="Qué logró, qué puede mejorar y cómo." /></Field>
                    </FormDialog>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="border-t border-v-border px-5 py-3 text-xs text-v-subtle">Escala de 1,0 a 7,0 (aprueba con 4,0). Escribe la nota y pulsa Guardar; el ícono de mensaje permite agregar una retroalimentación.</p>
        </Card>
      )}
    </>
  )
}
