import Link from 'next/link'
import {
  Activity, AlertTriangle, ArrowRight, BarChart3, BookOpen, CalendarCheck, CheckCircle2, ChevronRight, ClipboardCheck, ClipboardList, Flag,
  GraduationCap, Layers, MailPlus, Megaphone, School, TrendingDown, TrendingUp, UserRoundX, Users, UsersRound,
} from 'lucide-react'
import { requireSession } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { listMembers } from '@/lib/data/people'
import { assignmentStats, loadPlan, loadSnapshot, subjectAverages, indexSnapshot, studentStanding } from '@/lib/data/academic'
import { attendanceRate, average, firstName, fmtDate, fmtDateTime, fmtPct, fmtScore } from '@/lib/format'
import { Badge, Card, CardBody, CardHeader, EmptyState, Stat, StatGrid, StatStrip, Table, Td, Th } from '@/components/ui/primitives'
import { Bar, Chip, Hero, Ring, Row, Stacked } from '@/components/ui/motion'
import { feedbackWatchlist, monthLabel, type FeedbackGroupRow } from '@/lib/feedback'

type Task = { tone: 'danger' | 'warning' | 'accent'; icon: React.ReactNode; title: string; detail: string; href: string; count: number }

export default async function DirectionHome() {
  const session = await requireSession('directivo')
  const db = await createClient()
  const inst = session.institutionId
  const now = Date.now()
  const weekAgo = new Date(now - 7 * 86_400_000).toISOString()

  const [snap, members, { data: courses }, { data: levels }, { data: teaching }, { data: reports }, { data: invitations }, { data: authored }, { data: news }] = await Promise.all([
    loadSnapshot(db, inst),
    listMembers(db, inst),
    db.from('courses').select('id, name, grade_level_id, head_teacher_id').eq('is_archived', false).eq('institution_id', inst).order('name'),
    db.from('grade_levels').select('id, name, stage, sort_order').eq('institution_id', inst).order('sort_order'),
    db.from('teacher_assignments').select('course_id, subject_id, teacher_id').eq('institution_id', inst),
    db.from('reports').select('id, kind, subject, status, created_at').eq('institution_id', inst).order('created_at', { ascending: false }).limit(50),
    db.from('invitations').select('id').eq('institution_id', inst).eq('role', 'docente').is('accepted_at', null).is('revoked_at', null).gt('expires_at', new Date(now).toISOString()),
    db.from('assignments').select('id, title, teacher_id, course_id, created_at').eq('institution_id', inst).neq('status', 'draft').gte('created_at', weekAgo).order('created_at', { ascending: false }),
    db.from('announcements').select('id, title, author_id, published_at').eq('institution_id', inst).gte('published_at', weekAgo).order('published_at', { ascending: false }),
  ])
  const plan = await loadPlan(db, inst)
  // Evaluación mensual de clases (promedios por grupo con 5 o más respuestas): alimenta el aviso de clases que podrían necesitar apoyo.
  const { data: fbData } = await db.rpc('teacher_feedback_overview', { p_inst: inst, p_months: 2 })
  const classWatch = feedbackWatchlist(((fbData ?? []) as FeedbackGroupRow[]).map(r => ({ teacher_id: r.teacher_id, month: String(r.month), responses: Number(r.responses), score: Number(r.score) })))
  const C = courses ?? [], T = teaching ?? []
  const active = members.filter(m => m.status === 'active')
  const byRole = (role: string) => active.filter(m => m.role === role)
  const nameOf = new Map(members.map(m => [m.userId, m.fullName]))
  const courseName = new Map(C.map(c => [c.id as string, c.name as string]))
  const due = snap.assignments.filter(a => new Date(a.due_at).getTime() < now)

  // ── Situación de cada estudiante matriculado ────────────────────────────────
  const students = snap.enrollments.map(e => {
    const { avg, attendance, missing } = studentStanding(snap, e.student_id, e.course_id, now)
    const reasons = [
      avg != null && avg < 4 ? `promedio ${fmtScore(avg)}` : null,
      attendance != null && attendance < 85 ? `asistencia ${fmtPct(attendance)}` : null,
      missing >= 3 ? `${missing} tareas sin entregar` : null,
    ].filter((r): r is string => !!r)
    return { id: e.student_id, courseId: e.course_id, name: nameOf.get(e.student_id) ?? 'Estudiante', avg, attendance, missing, reasons }
  })
  const atRisk = students.filter(s => s.reasons.length > 0).sort((a, b) => b.reasons.length - a.reasons.length || (a.avg ?? 9) - (b.avg ?? 9))
  const enrolledIds = new Set(students.map(s => s.id))
  const unenrolled = byRole('estudiante').filter(m => !enrolledIds.has(m.userId)).length

  // ── Asistencia del último día registrado ────────────────────────────────────
  const lastDay = snap.attendance.map(a => a.date).sort().pop()
  const dayRows = snap.attendance.filter(a => a.date === lastDay)
  const rollCourses = new Set(dayRows.map(a => a.course_id))
  const coursesWithoutRoll = lastDay ? C.filter(c => !rollCourses.has(c.id as string)).length : 0

  // ── Panorama por curso ──────────────────────────────────────────────────────
  // Todo se agrupa una vez (por curso, por curso × asignatura, por docente): ningún cálculo recorre el colegio entero por cada fila.
  const ix = indexSnapshot(snap)
  const add = (map: Map<string, number>, key: string, n: number) => map.set(key, (map.get(key) ?? 0) + n)
  const pendingOfGroup = new Map<string, number>(), pendingOfCourse = new Map<string, number>()
  for (const c of C) for (const s of snap.subjects) {
    const pending = assignmentStats(snap, c.id as string, s.id).reduce((n, a) => n + a.pendingReview, 0)
    if (pending) { add(pendingOfGroup, `${c.id}:${s.id}`, pending); add(pendingOfCourse, c.id as string, pending) }
  }
  const covered = new Set(T.map(t => `${t.course_id}:${t.subject_id}`))
  const uncoveredOf = new Map<string, number>()
  for (const p of plan) if (!covered.has(`${p.course_id}:${p.subject_id}`)) add(uncoveredOf, p.course_id, 1)
  const absentOf = new Map<string, number>()
  for (const a of dayRows) if (a.status === 'absent') add(absentOf, a.course_id, 1)
  const studentsOf = new Map<string, typeof students>()
  for (const st of students) { const list = studentsOf.get(st.courseId); if (list) list.push(st); else studentsOf.set(st.courseId, [st]) }
  const overview = C.map(c => {
    const mine = studentsOf.get(c.id as string) ?? []
    const scores = (ix.gradesByCourse.get(c.id as string) ?? []).map(g => g.score)
    return {
      id: c.id as string, name: c.name as string, levelId: c.grade_level_id as string, head: nameOf.get(c.head_teacher_id as string) ?? null,
      students: mine.length, attendance: attendanceRate(ix.attendanceByCourse.get(c.id as string) ?? []), avg: average(scores),
      risk: mine.filter(s => s.reasons.length > 0).length,
      // Vacantes: asignaturas del plan del curso que aún no tienen docente.
      uncovered: uncoveredOf.get(c.id as string) ?? 0,
      pending: pendingOfCourse.get(c.id as string) ?? 0,
      absentToday: absentOf.get(c.id as string) ?? 0,
    }
  })

  // ── Carga docente ───────────────────────────────────────────────────────────
  const groupsOf = new Map<string, typeof T>()
  for (const x of T) { const list = groupsOf.get(x.teacher_id as string); if (list) list.push(x); else groupsOf.set(x.teacher_id as string, [x]) }
  const teachers = byRole('docente').map(t => {
    const mine = groupsOf.get(t.userId) ?? []
    const courseIds = [...new Set(mine.map(x => x.course_id as string))]
    return {
      id: t.userId, name: t.fullName, groups: mine.length, courses: courseIds.length,
      students: new Set(courseIds.flatMap(id => ix.enrolledIn.get(id) ?? [])).size,
      pending: mine.reduce((n, x) => n + (pendingOfGroup.get(`${x.course_id}:${x.subject_id}`) ?? 0), 0),
    }
  }).sort((a, b) => b.pending - a.pending)
  const uncoveredTotal = overview.reduce((n, c) => n + c.uncovered, 0)
  const pendingTotal = teachers.reduce((n, t) => n + t.pending, 0)

  // ── Lo que requiere una decisión ────────────────────────────────────────────
  const openReports = (reports ?? []).filter(r => r.status === 'received' || r.status === 'in_review')
  const unreviewed = openReports.filter(r => r.status === 'received')
  const openDenuncias = openReports.filter(r => r.kind === 'denuncia')
  const lowAttendance = overview.filter(c => c.attendance != null && c.attendance < 88)
  const idleTeachers = teachers.filter(t => t.groups === 0)
  const tasks: Task[] = ([
    openDenuncias.length && { tone: 'danger', icon: <Flag size={16} />, count: openDenuncias.length, title: openDenuncias.length === 1 ? 'Denuncia abierta' : 'Denuncias abiertas', detail: 'Requieren activar el protocolo de convivencia y dejar registro.', href: '/direccion/reclamos?estado=abiertos&tipo=denuncia' },
    unreviewed.length && { tone: 'warning', icon: <Flag size={16} />, count: unreviewed.length, title: 'Reclamos y sugerencias sin revisar', detail: 'Recibidos y aún sin gestión ni responsable.', href: '/direccion/reclamos?estado=received' },
    atRisk.length && { tone: 'warning', icon: <UserRoundX size={16} />, count: atRisk.length, title: 'Estudiantes que requieren atención', detail: 'Promedio bajo 4,0, asistencia bajo 85% o tres o más tareas sin entregar.', href: '/direccion/rendimiento?vista=alumnado&estado=alerta' },
    lowAttendance.length && { tone: 'warning', icon: <CalendarCheck size={16} />, count: lowAttendance.length, title: lowAttendance.length === 1 ? 'Curso con asistencia bajo 88%' : 'Cursos con asistencia bajo 88%', detail: lowAttendance.map(c => `${c.name} (${fmtPct(c.attendance)})`).join(' · '), href: '/direccion/cursos' },
    uncoveredTotal && { tone: 'danger', icon: <BookOpen size={16} />, count: uncoveredTotal, title: 'Asignaturas sin docente', detail: 'Hay cursos con asignaturas del plan sin profesor asignado.', href: '/direccion/docentes' },
    coursesWithoutRoll && { tone: 'accent', icon: <ClipboardList size={16} />, count: coursesWithoutRoll, title: 'Cursos sin lista de asistencia', detail: `No registraron asistencia el ${fmtDate(lastDay)}.`, href: '/direccion/cursos' },
    classWatch.length && { tone: 'warning', icon: <TrendingDown size={16} />, count: classWatch.length,
      title: classWatch.length === 1 ? 'Docente cuyas clases podrían necesitar apoyo' : 'Docentes cuyas clases podrían necesitar apoyo',
      detail: `Evaluación de los estudiantes en ${monthLabel(classWatch[0].month).toLowerCase()}: ${classWatch.slice(0, 3).map(w => `${(nameOf.get(w.teacherId) ?? 'Docente').split(' ').slice(0, 2).join(' ')} ${w.score.toFixed(1).replace('.', ',')}${w.dropped && w.previous != null ? ` (bajó ${(w.previous - w.score).toFixed(1).replace('.', ',')})` : ''}`).join(' · ')}. Es una señal para conversar y apoyar, no una calificación.`,
      href: classWatch.length === 1 ? `/direccion/docentes/${classWatch[0].teacherId}` : '/direccion/rendimiento?vista=docentes' },
    pendingTotal >= 10 && { tone: 'accent', icon: <ClipboardCheck size={16} />, count: pendingTotal, title: 'Entregas esperando revisión', detail: teachers.filter(t => t.pending > 0).slice(0, 3).map(t => `${t.name.split(' ')[0]} ${t.name.split(' ')[1] ?? ''}: ${t.pending}`).join(' · '), href: '/direccion/rendimiento?vista=docentes' },
    idleTeachers.length && { tone: 'accent', icon: <Users size={16} />, count: idleTeachers.length, title: 'Docentes sin asignaturas', detail: idleTeachers.map(t => t.name).join(' · '), href: '/direccion/docentes' },
    unenrolled && { tone: 'accent', icon: <GraduationCap size={16} />, count: unenrolled, title: 'Estudiantes sin matrícula', detail: 'Tienen cuenta pero no están en ningún curso. Lo resuelve secretaría.', href: '/direccion/cursos' },
    (invitations ?? []).length && { tone: 'accent', icon: <MailPlus size={16} />, count: (invitations ?? []).length, title: 'Docentes invitados sin activar', detail: 'Aún no crean su cuenta.', href: '/direccion/docentes' },
  ] as (Task | 0 | false | undefined)[]).filter((t): t is Task => !!t)
  const toneClass = { danger: 'bg-v-danger/10 text-v-danger', warning: 'bg-v-warning/15 text-v-warning', accent: 'bg-v-accent-soft text-v-accent' }

  const feed = [
    ...(reports ?? []).filter(r => (r.created_at as string) >= weekAgo).map(r => ({ at: r.created_at as string, kind: 'flag', href: `/direccion/reclamos/${r.id}`, title: `Nuevo ${r.kind}: ${r.subject}`, by: 'Canal de reclamos y denuncias' })),
    ...(authored ?? []).map(t => ({ at: t.created_at as string, kind: 'task', href: `/direccion/cursos/${t.course_id}?tab=actividades`, title: `Tarea publicada: ${t.title}`, by: `${nameOf.get(t.teacher_id as string) ?? 'Docente'} · ${courseName.get(t.course_id as string) ?? ''}` })),
    ...(news ?? []).map(n => ({ at: n.published_at as string, kind: 'news', href: '/direccion/comunicados', title: `Comunicado: ${n.title}`, by: nameOf.get(n.author_id as string) ?? 'Colegio' })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6)

  // ── Panorama general del colegio ────────────────────────────────────────────
  const allScores = snap.grades.map(g => g.score)
  const schoolAvg = average(allScores)
  const passed = allScores.filter(v => v >= 4).length
  const schoolAttendance = attendanceRate(snap.attendance)
  const dueTasks = due.filter(a => a.kind === 'tarea')   // la tasa de entrega no cuenta pruebas ni exámenes
  const expected = dueTasks.reduce((n, a) => n + (ix.enrolledIn.get(a.course_id)?.length ?? 0), 0)
  const delivered = dueTasks.reduce((n, a) => n + (ix.submissionsOf.get(a.id) ?? 0), 0)
  const distribution = [allScores.filter(v => v < 4).length, allScores.filter(v => v >= 4 && v < 5).length, allScores.filter(v => v >= 5 && v < 6).length, allScores.filter(v => v >= 6).length]
  const bySubject = subjectAverages(snap).sort((a, b) => (a.average ?? 9) - (b.average ?? 9))
  const STAGES = [['parvularia', 'Educación parvularia'], ['basica', 'Enseñanza básica'], ['media', 'Enseñanza media']] as const
  const gradeRows = (levels ?? []).map(l => {
    const mine = overview.filter(c => c.levelId === l.id)
    return {
      id: l.id as string, name: l.name as string, stage: l.stage as string, sections: mine.length, students: mine.reduce((n, c) => n + c.students, 0),
      avg: average(mine.flatMap(c => (ix.gradesByCourse.get(c.id) ?? []).map(g => g.score))), attendance: attendanceRate(mine.flatMap(c => ix.attendanceByCourse.get(c.id) ?? [])),
      risk: mine.reduce((n, c) => n + c.risk, 0),
    }
  }).filter(g => g.sections > 0)
  const barTone = (v: number | null) => (v == null ? 'neutral' : v < 4 ? 'danger' : v < 5 ? 'warning' : v < 6 ? 'brand' : 'success')
  const BUCKETS = [['Bajo 4,0', 'bg-v-danger'], ['4,0 – 4,9', 'bg-v-warning'], ['5,0 – 5,9', 'bg-v-accent'], ['6,0 – 7,0', 'bg-v-success']] as const

  return (
    <>
      <Hero name={firstName(session.fullName)} subtitle={`Así va ${session.institutionName} en el periodo vigente.`}
        chips={<>
          <Chip icon={<GraduationCap size={12} />}>{enrolledIds.size} estudiantes en {C.length} cursos</Chip>
          {tasks.length > 0
            ? <Chip tone={tasks.some(t => t.tone === 'danger') ? 'danger' : 'warning'} icon={<AlertTriangle size={12} />}>{tasks.length} {tasks.length === 1 ? 'asunto pendiente' : 'asuntos pendientes'}</Chip>
            : <Chip tone="success" icon={<CheckCircle2 size={12} />}>Sin pendientes</Chip>}
        </>} />

      {/* Cómo va el colegio */}
      <StatGrid>
        <Stat href="/direccion/rendimiento" label="Promedio general" value={fmtScore(schoolAvg)} hint={`${allScores.length} calificaciones · ${fmtPct(allScores.length ? (distribution[0] / allScores.length) * 100 : null)} bajo 4,0`} icon={<TrendingUp size={18} />} />
        <Stat href="/direccion/cursos" label="Asistencia general" value={fmtPct(schoolAttendance)} hint={lastDay ? `Último registro: ${fmtDate(lastDay)}` : 'Sin registros'} icon={<CalendarCheck size={18} />} tone="success" />
        <Stat href="/direccion/rendimiento?vista=evaluaciones" label="Entregas a tiempo" value={fmtPct(expected ? (delivered / expected) * 100 : null)} hint={`${delivered} de ${expected} esperadas`} icon={<ClipboardCheck size={18} />} />
        <Stat href="/direccion/rendimiento?vista=alumnado&estado=alerta" label="Estudiantes en alerta" value={atRisk.length} hint={`de ${students.length} matriculados`} icon={<UserRoundX size={18} />} tone={atRisk.length ? 'warning' : 'success'} />
      </StatGrid>

      {/* Quiénes forman el colegio */}
      <StatStrip items={[
        { label: 'Estudiantes', value: enrolledIds.size, hint: unenrolled ? `${unenrolled} sin matrícula` : 'matriculados', icon: <GraduationCap size={15} />, href: '/direccion/cursos' },
        { label: 'Docentes', value: byRole('docente').length, hint: uncoveredTotal ? `${uncoveredTotal} asignaturas sin docente` : `${T.length} asignaturas cubiertas`, icon: <Users size={15} />, tone: uncoveredTotal ? 'warning' : 'accent', href: '/direccion/docentes' },
        { label: 'Cursos', value: C.length, hint: `en ${gradeRows.length} grados`, icon: <Layers size={15} />, href: '/direccion/cursos' },
        { label: 'Apoderados', value: byRole('apoderado').length, hint: 'con cuenta activa', icon: <UsersRound size={15} />, tone: 'success' },
      ]} />

      <div className="mb-4 grid grid-cols-1 items-stretch gap-4 xl:grid-cols-[1.5fr_1fr]">
        {/* Por nivel y grado */}
        <Card index={4} className="flex flex-col">
          <CardHeader icon={<School size={15} />} title="El colegio por nivel y grado" description="Cada fila resume todas las secciones del grado. Ábrela para ver su análisis."
            actions={<Link href="/direccion/rendimiento" className="inline-flex items-center gap-1 text-xs font-semibold text-v-accent hover:underline">Ver rendimiento <ArrowRight size={12} /></Link>} />
          {gradeRows.length === 0 ? <EmptyState aria={4} title="Aún no hay cursos" /> : (
            <Table>
              <thead><tr><Th>Grado</Th><Th>Secciones</Th><Th>Estudiantes</Th><Th>Promedio</Th><Th>Asistencia</Th><Th>En alerta</Th><Th /></tr></thead>
              <tbody>
                {STAGES.filter(([stage]) => gradeRows.some(g => g.stage === stage)).flatMap(([stage, label]) => {
                  const rows = gradeRows.filter(g => g.stage === stage)
                  return [
                    <tr key={stage}><td colSpan={7} className="bg-v-fill/50 px-5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-v-subtle">{label} · {rows.reduce((n, g) => n + g.students, 0)} estudiantes</td></tr>,
                    ...rows.map(g => (
                      <tr key={g.id} className="group relative hover:bg-v-fill/50">
                        <Td><Link href={`/direccion/rendimiento?grado=${g.id}`} className="font-semibold after:absolute after:inset-0 group-hover:text-v-accent">{g.name}</Link></Td>
                        <Td className="text-v-muted">{g.sections}</Td>
                        <Td className="v-display font-bold">{g.students}</Td>
                        <Td>
                          <span className="flex items-center gap-2.5">
                            <span className={`v-display w-9 font-bold ${g.avg != null && g.avg < 4 ? 'text-v-danger' : ''}`}>{fmtScore(g.avg)}</span>
                            <span className="hidden w-24 sm:block"><Bar value={(((g.avg ?? 1) - 1) / 6) * 100} tone={barTone(g.avg)} /></span>
                          </span>
                        </Td>
                        <Td><span className={`font-semibold ${g.attendance != null && g.attendance < 88 ? 'text-v-danger' : ''}`}>{fmtPct(g.attendance)}</span></Td>
                        <Td>{g.risk ? <Badge tone="warning">{g.risk} de {g.students}</Badge> : <span className="text-v-subtle">Ninguno</span>}</Td>
                        <Td className="text-right"><ChevronRight size={16} className="inline text-v-subtle group-hover:text-v-accent" /></Td>
                      </tr>
                    )),
                  ]
                })}
              </tbody>
            </Table>
          )}
        </Card>

        {/* Notas del colegio */}
        <Card index={5} className="flex flex-col">
          <CardHeader icon={<BarChart3 size={15} />} title="Notas del colegio" description={`${allScores.length} calificaciones del periodo`} />
          {allScores.length === 0 ? <EmptyState title="Aún no hay calificaciones" /> : (
            <CardBody className="flex flex-1 flex-col">
              <div className="flex items-center gap-4">
                <Ring value={(passed / allScores.length) * 100} size={84} label="Notas aprobadas" />
                <div className="min-w-0">
                  <p className="text-[13.5px] font-semibold">Notas aprobadas (4,0 o más)</p>
                  <p className="mt-0.5 text-xs text-v-muted">{passed} de {allScores.length} calificaciones.</p>
                </div>
              </div>
              <div className="mt-4"><Stacked height={10} segments={BUCKETS.map(([label, className], i) => ({ label, className, value: distribution[i] }))} /></div>
              <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-v-muted">
                {BUCKETS.map(([label, className], i) => <span key={label} className="inline-flex items-center gap-1.5"><span className={`size-2 rounded-sm ${className}`} />{label}: <span className="font-semibold text-v-text">{distribution[i]}</span></span>)}
              </p>
              <p className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-[0.08em] text-v-subtle">Promedio por asignatura</p>
              <ul className="flex flex-1 flex-col justify-between gap-3">
                {bySubject.map((s, i) => (
                  <li key={s.subjectId}>
                    <div className="mb-1 flex items-center justify-between gap-2 text-[13px]"><span className="truncate font-medium">{s.subjectName}</span><span className="v-display shrink-0 font-bold tabular-nums">{fmtScore(s.average)}</span></div>
                    <Bar value={(((s.average ?? 1) - 1) / 6) * 100} tone={barTone(s.average)} delay={0.3 + i * 0.06} />
                  </li>
                ))}
              </ul>
            </CardBody>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-2">
        {/* Pendientes */}
        <Card index={6} className="flex flex-col">
          <CardHeader icon={<AlertTriangle size={15} />} tone="warning" title="Pendientes de dirección" description={tasks.length ? `${tasks.length} ${tasks.length === 1 ? 'asunto' : 'asuntos'}, del más urgente al menos urgente` : 'Nada espera una decisión'} />
          {tasks.length === 0 ? <EmptyState aria={2} title="Todo en orden" description="No hay asuntos pendientes de una decisión de dirección." /> : (
            <ul className="max-h-[330px] space-y-0.5 overflow-y-auto px-3 pb-4">
              {tasks.map((t, i) => (
                <Row key={t.title} index={i} className="rounded-v-sm hover:bg-v-fill">
                  <Link href={t.href} className="flex items-center gap-3 px-2 py-2">
                    <span className={`v-display grid h-8 min-w-9 shrink-0 place-items-center rounded-full px-2 text-[13px] font-bold tabular-nums ${toneClass[t.tone]}`}>{t.count}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-[13.5px] font-semibold">{t.title}</span><span className="block truncate text-[11.5px] text-v-muted">{t.detail}</span></span>
                    <ChevronRight size={15} className="shrink-0 text-v-subtle" />
                  </Link>
                </Row>
              ))}
            </ul>
          )}
        </Card>

        {/* Actividad */}
        <Card index={7} className="flex flex-col">
          <CardHeader icon={<Activity size={15} />} title="Actividad de la semana" description={`${(authored ?? []).length} tareas publicadas · ${(news ?? []).length} publicaciones · ${(reports ?? []).filter(r => (r.created_at as string) >= weekAgo).length} casos recibidos`} />
          {feed.length === 0 ? <EmptyState title="Sin novedades esta semana" /> : (
            <ul className="max-h-[330px] space-y-0.5 overflow-y-auto px-3 pb-4">
              {feed.map((f, i) => (
                <Row key={f.title + f.at + i} index={i} className="rounded-v-sm hover:bg-v-fill">
                  <Link href={f.href} className="flex items-center gap-3 px-2 py-2 text-[13px]">
                    <span className={`grid size-8 shrink-0 place-items-center rounded-[30%] ${f.kind === 'flag' ? 'bg-v-danger/10 text-v-danger' : f.kind === 'news' ? 'bg-v-success/15 text-v-success' : 'bg-v-accent-soft text-v-accent'}`}>
                      {f.kind === 'flag' ? <Flag size={14} /> : f.kind === 'news' ? <Megaphone size={14} /> : <ClipboardList size={14} />}
                    </span>
                    <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{f.title}</span><span className="block truncate text-[11px] text-v-subtle">{f.by}</span></span>
                    <span className="shrink-0 text-xs text-v-subtle">{fmtDateTime(f.at)}</span>
                  </Link>
                </Row>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}
