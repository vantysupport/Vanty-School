import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, BookOpen, CalendarDays, ClipboardCheck, ClipboardList, GraduationCap, Mail, Phone, Plus, Star, Trash2, Users } from 'lucide-react'
import { requireSession } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { listMembers } from '@/lib/data/people'
import { assignmentStats, loadPlan, loadSnapshot } from '@/lib/data/academic'
import { assignTeacher, deleteAcademic } from '@/lib/actions/admin'
import { average, fmtDate, fmtScore, scoreTone } from '@/lib/format'
import { Avatar, Badge, Card, CardBody, CardHeader, EmptyState, Field, Select, StatStrip, Table, Td, Th } from '@/components/ui/primitives'
import { ConfirmAction, FormDialog } from '@/components/ui/dialog'
import { Reveal } from '@/components/ui/motion'
import { TeacherFeedback } from '@/components/direction/teacher-feedback'

const STAGE: Record<string, string> = { parvularia: 'Educación parvularia', basica: 'Enseñanza básica', media: 'Enseñanza media' }

export default async function TeacherProfile({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ mes?: string }> }) {
  const session = await requireSession('directivo')
  const { id } = await params
  const db = await createClient()
  const inst = session.institutionId
  const teachers = await listMembers(db, inst, ['docente'])
  const teacher = teachers.find(t => t.userId === id)
  if (!teacher) notFound()

  const [snap, plan, { data: teaching }, { data: courses }, { data: levels }, { data: tasks }] = await Promise.all([
    loadSnapshot(db, inst),
    loadPlan(db, inst),
    db.from('teacher_assignments').select('id, course_id, subject_id, teacher_id').eq('institution_id', inst),
    db.from('courses').select('id, name, section, grade_level_id, head_teacher_id').eq('is_archived', false).eq('institution_id', inst).order('section'),
    db.from('grade_levels').select('id, name, stage, sort_order').eq('institution_id', inst).order('sort_order'),
    db.from('assignments').select('id, title, course_id, subject_id, due_at, status, created_at').eq('institution_id', inst).eq('teacher_id', id).order('created_at', { ascending: false }).limit(8),
  ])
  const C = courses ?? [], L = levels ?? []
  const subjectName = new Map(snap.subjects.map(s => [s.id, s.name]))
  const courseOf = new Map(C.map(c => [c.id as string, c]))
  const mine = (teaching ?? []).filter(t => t.teacher_id === id)

  // Una fila por curso y asignatura a su cargo.
  const load = mine.map(t => {
    const course = courseOf.get(t.course_id as string)
    const stats = assignmentStats(snap, t.course_id as string, t.subject_id as string)
    const scores = snap.grades.filter(g => g.course_id === t.course_id && g.subject_id === t.subject_id).map(g => g.score)
    return {
      id: t.id as string, courseId: t.course_id as string, subjectId: t.subject_id as string,
      course: (course?.name as string) ?? 'Curso', section: (course?.section as string) ?? '', levelId: course?.grade_level_id as string,
      subject: subjectName.get(t.subject_id as string) ?? 'Asignatura',
      students: snap.enrollments.filter(e => e.course_id === t.course_id).length,
      tasks: stats.length, pending: stats.reduce((n, a) => n + a.pendingReview, 0), avg: average(scores),
    }
  })
  const courseIds = [...new Set(load.map(l => l.courseId))]
  const students = new Set(snap.enrollments.filter(e => courseIds.includes(e.course_id)).map(e => e.student_id)).size
  const headOf = C.filter(c => c.head_teacher_id === id)
  const gradesTaught = L.filter(l => load.some(x => x.levelId === l.id))
  // Vacantes del colegio que podría tomar: asignaturas de algún plan sin docente.
  const vacancies = plan.filter(p => !(teaching ?? []).some(t => t.course_id === p.course_id && t.subject_id === p.subject_id))

  return (
    <>
      <Link href="/direccion/docentes" className="mb-4 inline-flex items-center gap-1 text-[12.5px] text-v-muted hover:text-v-text"><ArrowLeft size={14} />Docentes</Link>

      {/* Ficha */}
      <Reveal className="relative mb-4 overflow-hidden rounded-v border border-v-border bg-v-elevated shadow-v">
        <div aria-hidden className="v-brand absolute inset-x-0 top-0 h-[3px]" />
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(40rem 14rem at 0% 0%, var(--v-glow-1), transparent 70%)' }} />
        <div className="relative flex flex-wrap items-center gap-5 p-5 sm:p-6">
          <span className="rounded-full shadow-v-brand ring-4 ring-white"><Avatar name={teacher.fullName} size={76} id={teacher.userId} /></span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-v-accent">Docente</p>
              <Badge tone={teacher.status === 'active' ? 'success' : 'neutral'}>{teacher.status === 'active' ? 'Activo' : 'Inactivo'}</Badge>
              {headOf.map(c => <Badge key={c.id as string} tone="accent"><Star size={10} />Profesor jefe de {c.name as string}</Badge>)}
            </div>
            <h1 className="v-headline mt-1 text-[1.75rem]">{teacher.fullName}</h1>
            <dl className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1.5 text-[13px] text-v-muted">
              <div className="flex items-center gap-1.5"><Mail size={13} className="text-v-subtle" /><dt className="sr-only">Correo</dt><dd>{teacher.email ?? 'Sin correo'}</dd></div>
              <div className="flex items-center gap-1.5"><Phone size={13} className="text-v-subtle" /><dt className="sr-only">Teléfono</dt><dd>{teacher.phone ?? 'Sin teléfono registrado'}</dd></div>
              <div className="flex items-center gap-1.5"><CalendarDays size={13} className="text-v-subtle" /><dt className="sr-only">Alta</dt><dd>En el colegio desde el {fmtDate(teacher.createdAt)}</dd></div>
            </dl>
          </div>
          {teacher.status === 'active' && (
            <FormDialog trigger={<><Plus size={15} />Asignar curso</>} title={`Asignar curso a ${teacher.fullName.split(' ')[0]}`} action={assignTeacher} submitLabel="Asignar"
              description="Elige el curso (grado y sección) y la asignatura. Si esa asignatura ya tenía docente en el curso, se reemplaza.">
              <input type="hidden" name="teacher_id" value={id} />
              <Field label="Curso">
                <Select name="course_id" required defaultValue="">
                  <option value="" disabled>Selecciona grado y sección…</option>
                  {L.map(l => {
                    const inLevel = C.filter(c => c.grade_level_id === l.id)
                    return inLevel.length ? <optgroup key={l.id as string} label={l.name as string}>{inLevel.map(c => <option key={c.id as string} value={c.id as string}>{c.name as string}</option>)}</optgroup> : null
                  })}
                </Select>
              </Field>
              <Field label="Asignatura" hint={vacancies.length ? `Hay ${vacancies.length} asignaturas sin docente en los planes de curso.` : undefined}>
                <Select name="subject_id" required defaultValue=""><option value="" disabled>Selecciona…</option>{snap.subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
              </Field>
            </FormDialog>
          )}
        </div>
      </Reveal>

      <StatStrip items={[
        { label: 'Grados', value: gradesTaught.length, icon: <GraduationCap size={15} /> },
        { label: 'Secciones', value: courseIds.length, icon: <Users size={15} /> },
        { label: 'Asignaturas', value: new Set(load.map(l => l.subjectId)).size, hint: `${load.length} grupos`, icon: <BookOpen size={15} /> },
        { label: 'Estudiantes', value: students, icon: <Users size={15} />, tone: 'success' },
        { label: 'Entregas por revisar', value: load.reduce((n, l) => n + l.pending, 0), icon: <ClipboardCheck size={15} />, tone: 'warning' },
      ]} />

      <div className="grid gap-4 xl:grid-cols-[1.7fr_1fr]">
        {/* Carga académica */}
        <Card index={2}>
          <CardHeader icon={<GraduationCap size={15} />} title="Grados, secciones y asignaturas a su cargo" description="Agrupado por nivel y grado" />
          {load.length === 0 ? <EmptyState aria={8} title="Sin cursos asignados" description="Usa «Asignar curso» para darle su primera asignatura." /> : (
            <Table>
              <thead><tr><Th className="whitespace-nowrap">Grado y sección</Th><Th>Asignatura</Th><Th>Estudiantes</Th><Th>Tareas</Th><Th className="whitespace-nowrap">Por revisar</Th><Th>Promedio</Th><Th /></tr></thead>
              <tbody>
                {Object.entries(STAGE).flatMap(([stage, label]) => {
                  const grades = gradesTaught.filter(g => g.stage === stage)
                  if (!grades.length) return []
                  return [
                    <tr key={stage}><td colSpan={7} className="bg-v-fill/50 px-5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-v-subtle">{label}</td></tr>,
                    ...grades.flatMap(g => load.filter(x => x.levelId === g.id).sort((a, b) => a.section.localeCompare(b.section) || a.subject.localeCompare(b.subject, 'es')).map(x => (
                      <tr key={x.id} className="hover:bg-v-fill/50">
                        <Td>
                          <Link href={`/direccion/cursos/${x.courseId}`} className="flex items-center gap-2.5 hover:text-v-accent">
                            <span className="v-brand v-display grid size-7 shrink-0 place-items-center rounded-[30%] text-[12px] font-bold">{x.section}</span>
                            <span className="whitespace-nowrap font-semibold">{x.course}</span>
                          </Link>
                        </Td>
                        <Td>{x.subject}</Td>
                        <Td className="text-v-muted">{x.students}</Td>
                        <Td className="text-v-muted">{x.tasks}</Td>
                        <Td>{x.pending ? <Badge tone="warning">{x.pending}</Badge> : <span className="text-v-subtle">0</span>}</Td>
                        <Td><Badge tone={scoreTone(x.avg)}>{fmtScore(x.avg)}</Badge></Td>
                        <Td className="text-right">
                          <ConfirmAction action={deleteAcademic.bind(null, 'teacher_assignment', x.id)} title="Quitar asignación" danger confirmLabel="Quitar" ariaLabel={`Quitar ${x.subject} en ${x.course}`}
                            message={`${teacher.fullName} dejará de impartir ${x.subject} en ${x.course}. Las tareas y notas ya registradas se conservan.`}><Trash2 size={14} /></ConfirmAction>
                        </Td>
                      </tr>
                    ))),
                  ]
                })}
              </tbody>
            </Table>
          )}
          <p className="border-t border-v-border px-5 py-3 text-xs text-v-subtle">Promedio y pendientes describen la marcha de sus cursos para orientar apoyos. No son una evaluación de desempeño.</p>
        </Card>

        <div className="space-y-4">
          <Card index={3}>
            <CardHeader icon={<Star size={15} />} title="Jefaturas de curso" />
            <CardBody>
              {headOf.length === 0 ? <p className="text-[13.5px] text-v-muted">No es profesor jefe de ningún curso.</p> : (
                <ul className="space-y-2">
                  {headOf.map(c => (
                    <li key={c.id as string}>
                      <Link href={`/direccion/cursos/${c.id}`} className="flex items-center justify-between rounded-v-sm bg-v-fill px-3.5 py-2.5 text-[13.5px] font-semibold hover:bg-v-accent-soft hover:text-v-accent">
                        {c.name as string}<span className="text-xs font-medium text-v-muted">{snap.enrollments.filter(e => e.course_id === c.id).length} estudiantes</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card index={4}>
            <CardHeader icon={<ClipboardList size={15} />} title="Últimas tareas publicadas" />
            {(tasks ?? []).length === 0 ? <CardBody><p className="text-[13.5px] text-v-muted">Aún no ha creado tareas.</p></CardBody> : (
              <ul className="divide-y divide-v-border">
                {(tasks ?? []).map(t => (
                  <li key={t.id as string} className="px-5 py-2.5">
                    <p className="truncate text-[13.5px] font-semibold">{t.title as string}</p>
                    <p className="text-xs text-v-subtle">{(courseOf.get(t.course_id as string)?.name as string) ?? ''} · {subjectName.get(t.subject_id as string)} · creada el {fmtDate(t.created_at as string)}{t.status === 'draft' && ' · borrador'}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <TeacherFeedback db={db} institutionId={inst} teacherId={id} basePath={`/direccion/docentes/${id}`} selectedMonth={(await searchParams).mes}
        groups={load.map(l => ({ courseId: l.courseId, subjectId: l.subjectId, label: l.subject + " · " + l.course }))}
        expected={load.reduce((n, l) => n + l.students, 0)} />
    </>
  )
}
