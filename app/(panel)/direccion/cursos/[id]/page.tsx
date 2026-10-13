import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AlertTriangle, ArrowLeft, BookOpen, CalendarCheck, ChevronRight, ClipboardCheck, Settings2, TrendingUp, Users } from 'lucide-react'
import { requireSession } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { listMembers, nameMap } from '@/lib/data/people'
import { assignmentStats, CROWDED, loadSnapshot, occupancy } from '@/lib/data/academic'
import { assignTeacher } from '@/lib/actions/admin'
import { saveCoursePlan } from '@/lib/actions/structure'
import { attendanceRate, average, fmtDate, fmtPct, fmtScore, scoreTone } from '@/lib/format'
import { Avatar, Badge, Card, CardHeader, EmptyState, Field, Input, Notice, Select, Stat, StatGrid, Table, Td, Th } from '@/components/ui/primitives'
import { FormDialog, InlineForm } from '@/components/ui/dialog'
import { AutoSelect } from '@/components/ui/auto-select'
import { SearchBox } from '@/components/ui/filters'
import { Bar } from '@/components/ui/motion'

type Search = { tab?: string; q?: string; ver?: string; orden?: string }

export default async function DirectionCourse({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Search> }) {
  const session = await requireSession('directivo')
  const { id } = await params
  const sp = await searchParams
  const tab = sp.tab ?? 'estudiantes'
  const db = await createClient()
  const inst = session.institutionId
  const { data: course } = await db.from('courses').select('id, name, capacity, head_teacher_id, grade_level_id, period_id').eq('id', id).eq('institution_id', inst).maybeSingle()
  if (!course) notFound()

  const [snap, { data: allSubjects }, { data: planRows }, { data: teaching }, teachers, { data: siblings }] = await Promise.all([
    loadSnapshot(db, inst, { courseId: id }),
    db.from('subjects').select('id, name').eq('institution_id', inst).order('name'),
    db.from('course_subjects').select('subject_id').eq('course_id', id),
    db.from('teacher_assignments').select('subject_id, teacher_id').eq('course_id', id),
    listMembers(db, inst, ['docente']),
    db.from('courses').select('id, name').eq('grade_level_id', course.grade_level_id).eq('period_id', course.period_id).order('section'),
  ])
  const names = await nameMap(db, snap.enrollments.map(e => e.student_id))
  const now = Date.now()
  const due = snap.assignments.filter(a => new Date(a.due_at).getTime() < now)
  const inPlan = new Set((planRows ?? []).map(p => p.subject_id as string))
  const subjects = (allSubjects ?? []).filter(s => inPlan.has(s.id as string))

  const roster = snap.enrollments.map(e => {
    const scores = snap.grades.filter(g => g.student_id === e.student_id).map(g => g.score)
    const submitted = snap.submissions.filter(s => s.student_id === e.student_id && due.some(a => a.id === s.assignment_id)).length
    const avg = average(scores)
    const attendance = attendanceRate(snap.attendance.filter(a => a.student_id === e.student_id))
    const missing = Math.max(0, due.length - submitted)
    return {
      id: e.student_id, name: names.get(e.student_id) ?? 'Estudiante', avg, graded: scores.length, below: scores.filter(v => v < 4).length,
      attendance, absences: snap.attendance.filter(a => a.student_id === e.student_id && a.status === 'absent').length, submitted, missing,
      alert: (avg != null && avg < 4) || (attendance != null && attendance < 85) || missing >= 3,
    }
  })
  const q = (sp.q ?? '').toLowerCase()
  const students = roster.filter(s => (!q || s.name.toLowerCase().includes(q)) && (sp.ver !== 'alertas' || s.alert))
    .sort((a, b) => sp.orden === 'nombre' ? a.name.localeCompare(b.name, 'es') : sp.orden === 'asistencia' ? (a.attendance ?? 101) - (b.attendance ?? 101) : (a.avg ?? 9) - (b.avg ?? 9))

  const scores = snap.grades.map(g => g.score)
  const alerts = roster.filter(s => s.alert).length
  const teacherOf = new Map((teaching ?? []).map(t => [t.subject_id as string, t.teacher_id as string]))
  const activeTeachers = teachers.filter(t => t.status === 'active')
  const headTeacher = teachers.find(t => t.userId === course.head_teacher_id)?.fullName
  const capacity = course.capacity as number
  const occ = occupancy(roster.length, capacity)
  const uncovered = subjects.filter(s => !teacherOf.has(s.id as string)).length

  const href = (patch: Partial<Search>) => {
    const next = new URLSearchParams()
    for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v) next.set(k, v)
    const s = next.toString()
    return s ? `/direccion/cursos/${id}?${s}` : `/direccion/cursos/${id}`
  }
  const pill = (on: boolean) => `whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-semibold ${on ? 'v-brand shadow-v-brand' : 'text-v-muted hover:bg-v-fill hover:text-v-text'}`
  const tabs = [['estudiantes', `Estudiantes · ${roster.length}`], ['asignaturas', `Asignaturas y docentes · ${subjects.length}`], ['actividades', `Actividades · ${snap.assignments.length}`]] as const

  return (
    <>
      <Link href="/direccion/cursos" className="mb-4 inline-flex items-center gap-1 text-[12.5px] text-v-muted hover:text-v-text"><ArrowLeft size={14} />Cursos y estudiantes</Link>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-v-accent">Supervisión de curso</p>
          <h1 className="v-headline mt-1 text-[1.75rem]">{course.name}</h1>
          <p className="mt-1.5 text-sm text-v-muted">Profesor jefe: {headTeacher ?? 'sin asignar'} · {roster.length} de {capacity} cupos · {subjects.length} asignaturas</p>
          {(siblings ?? []).length > 1 && (
            <nav aria-label="Otras secciones" className="mt-3 flex flex-wrap items-center gap-1">
              <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-v-subtle">Secciones</span>
              {(siblings ?? []).map(s => <Link key={s.id as string} href={`/direccion/cursos/${s.id}`} className={pill(s.id === id)}>{s.name as string}</Link>)}
            </nav>
          )}
        </div>
        <FormDialog trigger={<><Settings2 size={14} />Configurar curso</>} variant="secondary" title={`Configurar ${course.name}`} action={saveCoursePlan.bind(null, id)} wide
          description="Capacidad del aula, profesor jefe y plan de asignaturas.">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Capacidad del aula" hint="Cupos disponibles. El máximo habitual es 45."><Input name="capacity" type="number" min={1} max={60} required defaultValue={capacity} /></Field>
            <Field label="Profesor jefe">
              <Select name="head_teacher_id" defaultValue={(course.head_teacher_id as string) ?? ''}><option value="">Sin asignar</option>{activeTeachers.map(t => <option key={t.userId} value={t.userId}>{t.fullName}</option>)}</Select>
            </Field>
          </div>
          <fieldset>
            <legend className="mb-2 text-[13px] font-medium text-v-muted">Asignaturas que lleva este curso</legend>
            <div className="grid max-h-56 gap-x-4 gap-y-2 overflow-y-auto rounded-v-sm border border-v-border p-3 sm:grid-cols-2">
              {(allSubjects ?? []).map(s => (
                <label key={s.id as string} className="flex items-center gap-2.5 text-[13.5px]">
                  <input type="checkbox" name="subject_ids[]" value={s.id as string} defaultChecked={inPlan.has(s.id as string)} className="size-4 accent-[var(--v-accent)]" />
                  {s.name}{teacherOf.has(s.id as string) && <span className="text-[11px] text-v-subtle">· con docente</span>}
                </label>
              ))}
              {(allSubjects ?? []).length === 0 && <p className="text-[13px] text-v-muted">Aún no hay asignaturas creadas en el colegio.</p>}
            </div>
          </fieldset>
          {(siblings ?? []).length > 1 && (
            <label className="flex items-center gap-2.5 text-[13.5px]">
              <input type="checkbox" name="whole_grade" className="size-4 accent-[var(--v-accent)]" />Aplicar este plan a las {(siblings ?? []).length} secciones del grado
            </label>
          )}
        </FormDialog>
      </div>

      <StatGrid>
        <Stat label="Estudiantes" value={roster.length} hint={occ === 'over' ? `Sobrecupo: capacidad ${capacity}` : occ === 'high' ? `Sobre ${CROWDED}: aula numerosa` : `${capacity - roster.length} cupos disponibles`} icon={<Users size={18} />} tone={occ === 'over' ? 'danger' : occ === 'high' ? 'warning' : 'accent'} />
        <Stat label="Asistencia" value={fmtPct(attendanceRate(snap.attendance))} hint="Últimas semanas" icon={<CalendarCheck size={18} />} tone="success" />
        <Stat label="Requieren atención" value={alerts} hint="Promedio bajo 4,0, asistencia bajo 85% o 3+ tareas sin entregar" icon={<AlertTriangle size={18} />} tone={alerts ? 'warning' : 'success'} href={href({ tab: undefined, ver: 'alertas' })} />
        <Stat label="Promedio del curso" value={fmtScore(average(scores))} hint={`${scores.length} calificaciones`} icon={<TrendingUp size={18} />} />
      </StatGrid>

      {subjects.length === 0 && <div className="mb-4"><Notice tone="warning" title="Este curso no tiene plan de asignaturas">Usa «Configurar curso» para definir qué asignaturas lleva. Sin plan no se le pueden asignar docentes.</Notice></div>}

      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-v-border" role="tablist">
        {tabs.map(([key, label]) => (
          <Link key={key} href={`/direccion/cursos/${id}?tab=${key}`} role="tab" aria-selected={tab === key} scroll={false}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-[13px] ${tab === key ? 'border-v-accent font-semibold text-v-accent' : 'border-transparent text-v-muted hover:text-v-text'}`}>{label}</Link>
        ))}
      </div>

      {tab === 'estudiantes' && (
        <Card>
          <CardHeader icon={<Users size={15} />} title="Estudiantes del curso" description={`${students.length} de ${roster.length}`} actions={<>
            <SearchBox placeholder="Buscar estudiante" />
            <div className="flex rounded-full bg-v-fill p-1">
              <Link href={href({ ver: undefined })} scroll={false} className={pill(sp.ver !== 'alertas')}>Todos</Link>
              <Link href={href({ ver: 'alertas' })} scroll={false} className={pill(sp.ver === 'alertas')}>En alerta · {alerts}</Link>
            </div>
            <div className="flex rounded-full bg-v-fill p-1">
              {([['', 'Menor promedio'], ['asistencia', 'Menor asistencia'], ['nombre', 'A–Z']] as const).map(([v, l]) =>
                <Link key={v} href={href({ orden: v || undefined })} scroll={false} className={pill((sp.orden ?? '') === v)}>{l}</Link>)}
            </div>
          </>} />
          {roster.length === 0 ? <EmptyState aria={4} title="El curso no tiene estudiantes matriculados" description="Las matrículas las registra la secretaría." />
            : students.length === 0 ? <EmptyState title="Ningún estudiante coincide" description="Ajusta la búsqueda o el filtro." /> : (
              <Table>
                <thead><tr><Th>N.º</Th><Th>Estudiante</Th><Th>Promedio</Th><Th>Notas bajo 4,0</Th><Th>Asistencia</Th><Th>Inasistencias</Th><Th>Entregas</Th><Th /></tr></thead>
                <tbody>
                  {students.map((s, i) => (
                    <tr key={s.id} className="hover:bg-v-fill/50">
                      <Td className="w-12 text-v-subtle">{i + 1}</Td>
                      <Td>
                        <Link href={`/direccion/estudiantes/${s.id}`} className="flex items-center gap-3">
                          <Avatar name={s.name} size={30} id={s.id} />
                          <span><span className="block font-semibold">{s.name}</span>{s.alert && <span className="text-[11px] font-semibold text-v-warning">Requiere atención</span>}</span>
                        </Link>
                      </Td>
                      <Td>
                        <span className="flex items-center gap-2.5">
                          <span className={`v-display w-9 text-base font-bold ${s.avg != null && s.avg < 4 ? 'text-v-danger' : ''}`}>{fmtScore(s.avg)}</span>
                          <span className="hidden w-20 lg:block"><Bar value={(((s.avg ?? 1) - 1) / 6) * 100} tone={s.avg == null ? 'neutral' : s.avg < 4 ? 'danger' : s.avg < 5 ? 'warning' : s.avg < 6 ? 'brand' : 'success'} delay={0.1} /></span>
                        </span>
                      </Td>
                      <Td><span className={s.below ? 'font-semibold text-v-danger' : 'text-v-muted'}>{s.below}</span><span className="ml-1 text-xs text-v-subtle">de {s.graded}</span></Td>
                      <Td><span className={`font-semibold ${s.attendance != null && s.attendance < 85 ? 'text-v-danger' : ''}`}>{fmtPct(s.attendance)}</span></Td>
                      <Td className="text-v-muted">{s.absences}</Td>
                      <Td><span className="font-semibold">{s.submitted}</span><span className="ml-1 text-xs text-v-subtle">de {due.length}</span>{s.missing >= 3 && <span className="ml-2"><Badge tone="warning">{s.missing} sin entregar</Badge></span>}</Td>
                      <Td className="text-right"><Link href={`/direccion/estudiantes/${s.id}`} className="inline-flex items-center text-xs font-semibold text-v-accent hover:underline">Ver ficha<ChevronRight size={13} /></Link></Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
        </Card>
      )}

      {tab === 'asignaturas' && (
        <Card>
          <CardHeader icon={<BookOpen size={15} />} title="Asignaturas y docentes" description={uncovered ? `${uncovered} sin docente. El cambio se guarda al seleccionar.` : 'Todas con docente. El cambio se guarda al seleccionar.'} />
          {subjects.length === 0 ? <EmptyState aria={8} title="Sin plan de asignaturas" description="Defínelo en «Configurar curso»." /> : (
            <Table>
              <thead><tr><Th>Asignatura</Th><Th>Docente</Th><Th>Promedio</Th><Th>Bajo 4,0</Th><Th>Actividades</Th><Th>Por revisar</Th></tr></thead>
              <tbody>
                {subjects.map(s => {
                  const subjectScores = snap.grades.filter(g => g.subject_id === s.id).map(g => g.score)
                  const stats = assignmentStats(snap, id, s.id as string)
                  return (
                    <tr key={s.id as string}>
                      <Td className="font-semibold">{s.name}{!teacherOf.has(s.id as string) && <span className="ml-2"><Badge tone="danger">Sin docente</Badge></span>}</Td>
                      <Td>
                        <InlineForm action={assignTeacher} resetOnSuccess={false}>
                          <input type="hidden" name="course_id" value={id} /><input type="hidden" name="subject_id" value={s.id as string} />
                          <AutoSelect name="teacher_id" value={teacherOf.get(s.id as string) ?? ''} label={`Docente de ${s.name}`} options={activeTeachers.map(t => ({ value: t.userId, label: t.fullName }))} />
                        </InlineForm>
                      </Td>
                      <Td><Badge tone={scoreTone(average(subjectScores))}>{fmtScore(average(subjectScores))}</Badge></Td>
                      <Td className="text-v-muted">{fmtPct(subjectScores.length ? (subjectScores.filter(v => v < 4).length / subjectScores.length) * 100 : null)}</Td>
                      <Td className="text-v-muted">{stats.length}</Td>
                      <Td>{stats.reduce((n, a) => n + a.pendingReview, 0) || <span className="text-v-subtle">0</span>}</Td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          )}
        </Card>
      )}

      {tab === 'actividades' && (
        <Card>
          <CardHeader icon={<ClipboardCheck size={15} />} title="Actividades del curso" description="Tareas publicadas por los docentes, con su nivel de entrega y resultado" />
          {snap.assignments.length === 0 ? <EmptyState aria={8} title="Aún no hay actividades publicadas" /> : (
            <Table>
              <thead><tr><Th>Actividad</Th><Th>Asignatura</Th><Th>Fecha límite</Th><Th>Entregas</Th><Th>Calificadas</Th><Th>Promedio</Th></tr></thead>
              <tbody>
                {[...snap.assignments].reverse().map(a => {
                  const stat = assignmentStats(snap, id, a.subject_id).find(x => x.id === a.id)!
                  return (
                    <tr key={a.id}>
                      <Td><span className="block font-semibold">{a.title}</span><span className="text-xs text-v-subtle">{a.topic ?? 'Sin contenido'}</span></Td>
                      <Td className="text-v-muted">{(allSubjects ?? []).find(s => s.id === a.subject_id)?.name}</Td>
                      <Td className="whitespace-nowrap text-v-muted">{fmtDate(a.due_at)}{!stat.isDue && <span className="ml-2"><Badge tone="accent">Vigente</Badge></span>}</Td>
                      <Td><span className="flex items-center gap-2.5"><span className="w-12 font-semibold">{stat.submitted}/{stat.enrolled}</span><span className="hidden w-16 lg:block"><Bar value={stat.enrolled ? (stat.submitted / stat.enrolled) * 100 : 0} /></span></span></Td>
                      <Td className="text-v-muted">{stat.graded}{stat.pendingReview > 0 && <span className="ml-2"><Badge tone="warning">{stat.pendingReview} por revisar</Badge></span>}</Td>
                      <Td><Badge tone={scoreTone(stat.average)}>{fmtScore(stat.average)}</Badge></Td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          )}
        </Card>
      )}
    </>
  )
}
