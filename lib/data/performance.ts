import 'server-only'
import type { DB } from '@/lib/supabase/server'
import { indexSnapshot, loadSnapshot } from '@/lib/data/academic'
import { listMembers, nameMap } from '@/lib/data/people'
import { attendanceRate, average, PASS_SCORE } from '@/lib/format'
import { FEEDBACK_DIMENSIONS, type FeedbackKey } from '@/lib/feedback'

// Análisis de rendimiento para dirección. Un «alcance» (colegio → nivel → grado → sección, más asignatura)
// determina qué cursos entran; todo lo demás se calcula sobre ese conjunto. RLS ya limitó las filas al colegio.

export type PerfSearch = {
  vista?: string; nivel?: string; grado?: string; curso?: string; asignatura?: string
  q?: string; estado?: string; orden?: string; p?: string
}
export type PerfView = 'general' | 'asignaturas' | 'evaluaciones' | 'alumnado' | 'docentes'
export const PERF_VIEWS: PerfView[] = ['general', 'asignaturas', 'evaluaciones', 'alumnado', 'docentes']

export const STAGES: Record<string, { label: string; short: string }> = {
  parvularia: { label: 'Educación parvularia', short: 'Parvularia' },
  basica: { label: 'Enseñanza básica', short: 'Básica' },
  media: { label: 'Enseñanza media', short: 'Media' },
}

const BASE = '/direccion/rendimiento'
/** Enlace a la misma pantalla cambiando parte de los parámetros. Cualquier cambio vuelve a la primera página. */
export function perfHref(sp: PerfSearch, patch: Partial<PerfSearch>) {
  const next = new URLSearchParams()
  for (const [k, v] of Object.entries({ ...sp, p: undefined, ...patch })) if (v) next.set(k, v)
  const q = next.toString()
  return q ? `${BASE}?${q}` : BASE
}

export type Agg = {
  average: number | null; graded: number; belowPct: number | null; attendance: number | null
  submissionRate: number | null; delivered: number; expected: number
  students: number; alerts: number; feedback: number | null
}
export type Unit = Agg & { id: string; label: string; sub: string; patch: Partial<PerfSearch> }
export type HeatRow = { id: string; label: string; patch: Partial<PerfSearch>; selected: boolean; cells: { subjectId: string; average: number | null; graded: number; belowPct: number | null }[] }

export type EvalRow = {
  id: string; title: string; topic: string | null; courseId: string; courseName: string; subjectName: string; teacher: string | null
  dueAt: string; isDue: boolean; enrolled: number; submitted: number; graded: number; pendingReview: number
  average: number | null; belowPass: number; buckets: number[]
}
export type StudentRow = {
  id: string; name: string; courseId: string; courseName: string
  average: number | null; graded: number; attendance: number | null; missing: number; belowSubjects: number
  reasons: string[]; outstanding: boolean
}
export type TeacherRow = {
  id: string; name: string; active: boolean; groups: { courseName: string; subjectName: string }[]
  students: number; evaluations: number; pendingReview: number
  average: number | null; belowPct: number | null; submissionRate: number | null
  feedback: number | null; feedbackPrev: number | null; responses: number
}
type FbRow = { teacher_id: string; course_id: string; subject_id: string; month: string; responses: number; score: number; dims: Record<FeedbackKey, number> }

const PAGE = 25
const weighted = (rows: { responses: number; value: number }[]) => {
  const n = rows.reduce((t, r) => t + r.responses, 0)
  return n ? rows.reduce((t, r) => t + r.value * r.responses, 0) / n : null
}
const pushTo = <K, V>(map: Map<K, V[]>, key: K, value: V) => { const list = map.get(key); if (list) list.push(value); else map.set(key, [value]) }
const NONE: never[] = []
const buckets = (scores: number[]) => [scores.filter(v => v < 4).length, scores.filter(v => v >= 4 && v < 5).length, scores.filter(v => v >= 5 && v < 6).length, scores.filter(v => v >= 6).length]
const weekStart = (d: Date) => { const out = new Date(d); out.setUTCHours(12, 0, 0, 0); out.setUTCDate(out.getUTCDate() - ((out.getUTCDay() + 6) % 7)); return out }

export async function loadPerformance(db: DB, institutionId: string, sp: PerfSearch) {
  const [snap, teachers, { data: courseRows }, { data: levelRows }, { data: teachingRows }, { data: fbData }] = await Promise.all([
    loadSnapshot(db, institutionId),
    listMembers(db, institutionId, ['docente']),
    db.from('courses').select('id, name, section, grade_level_id').eq('is_archived', false).eq('institution_id', institutionId),
    db.from('grade_levels').select('id, name, stage, sort_order').eq('institution_id', institutionId).order('sort_order'),
    db.from('teacher_assignments').select('course_id, subject_id, teacher_id').eq('institution_id', institutionId),
    db.rpc('teacher_feedback_overview', { p_inst: institutionId, p_months: 4 }),
  ])
  const now = Date.now()
  const levels = ((levelRows ?? []) as { id: string; name: string; stage: string; sort_order: number }[])
  const levelIndex = new Map(levels.map((l, i) => [l.id, i]))
  const courses = ((courseRows ?? []) as { id: string; name: string; section: string; grade_level_id: string }[])
    .map(c => ({ id: c.id, name: c.name, section: c.section, levelId: c.grade_level_id }))
    .sort((a, b) => (levelIndex.get(a.levelId) ?? 99) - (levelIndex.get(b.levelId) ?? 99) || a.section.localeCompare(b.section, 'es'))
  const teaching = (teachingRows ?? []) as { course_id: string; subject_id: string; teacher_id: string }[]
  const feedback = ((fbData ?? []) as FbRow[]).map(r => ({ ...r, month: String(r.month).slice(0, 10), score: Number(r.score), responses: Number(r.responses) }))
  const subjectName = new Map(snap.subjects.map(s => [s.id, s.name]))
  const courseName = new Map(courses.map(c => [c.id, c.name]))
  const teacherName = new Map(teachers.map(t => [t.userId, t.fullName]))

  // ── Alcance ──
  const course = courses.find(c => c.id === sp.curso)
  const grade = levels.find(l => l.id === (course?.levelId ?? sp.grado))
  const stage = grade?.stage ?? (sp.nivel && STAGES[sp.nivel] ? sp.nivel : undefined)
  const subject = snap.subjects.find(s => s.id === sp.asignatura)
  const scopeLevels = levels.filter(l => (grade ? l.id === grade.id : !stage || l.stage === stage))
  const scopeCourses = courses.filter(c => (course ? c.id === course.id : scopeLevels.some(l => l.id === c.levelId)))
  const scopeIds = new Set(scopeCourses.map(c => c.id))
  const allIds = new Set(courses.map(c => c.id))
  const label = [course?.name ?? grade?.name ?? (stage ? STAGES[stage].label : null), subject?.name].filter(Boolean).join(' · ') || 'Todo el colegio'
  const filtered = !!(course || grade || stage || subject)

  // ── Índices ──
  // Todo se busca en los índices de la fotografía; nada recorre la lista completa por cada curso, estudiante o tarea.
  const ix = indexSnapshot(snap)
  const bySubject = <T extends { subject_id: string }>(rows: T[], id = subject?.id) => (id ? rows.filter(r => r.subject_id === id) : rows)
  const gradesOf = (courseId: string, subjectId = subject?.id) => (subjectId ? ix.gradesByGroup.get(`${courseId}:${subjectId}`) : ix.gradesByCourse.get(courseId)) ?? NONE
  const assignmentsOf = (courseId: string, subjectId = subject?.id) => (subjectId ? ix.assignmentsByGroup.get(`${courseId}:${subjectId}`) : ix.assignmentsByCourse.get(courseId)) ?? NONE
  const scoresOf = (assignmentId: string) => (ix.gradesByAssignment.get(assignmentId) ?? NONE).map(g => g.score)
  const enrolledIn = (courseId: string) => ix.enrolledIn.get(courseId) ?? NONE
  const dueIds = new Set(snap.assignments.filter(a => new Date(a.due_at).getTime() < now).map(a => a.id))
  const isDue = (a: { id: string }) => dueIds.has(a.id)
  const teacherOfGroup = new Map(teaching.map(t => [`${t.course_id}:${t.subject_id}`, t.teacher_id]))
  const teacherById = new Map(teachers.map(t => [t.userId, t]))
  const sectionsByLevel = new Map<string, typeof courses>()
  for (const c of courses) pushTo(sectionsByLevel, c.levelId, c)
  const months = [...new Set(feedback.map(f => f.month))].sort()
  const lastMonth = months[months.length - 1] ?? null
  const prevMonth = months[months.length - 2] ?? null
  const fbScore = (rows: FbRow[], month: string | null) => (month ? weighted(rows.filter(r => r.month === month).map(r => ({ responses: r.responses, value: r.score }))) : null)

  // ── Alumnado: una fila por matrícula, con la asignatura del alcance si se eligió ──
  const studentBase = snap.enrollments.filter(e => allIds.has(e.course_id)).map(e => {
    const own = bySubject((ix.gradesByStudent.get(e.student_id) ?? NONE).filter(g => g.course_id === e.course_id))
    const perSubject = new Map<string, number[]>()
    for (const g of own) pushTo(perSubject, g.subject_id, g.score)
    const avg = average(own.map(g => g.score))
    const att = attendanceRate((ix.attendanceByStudent.get(e.student_id) ?? NONE).filter(a => a.course_id === e.course_id))
    const handed = ix.submittedBy.get(e.student_id)
    const missing = assignmentsOf(e.course_id).filter(a => isDue(a) && !handed?.has(a.id)).length
    const reasons = [
      avg != null && avg < PASS_SCORE ? 'Promedio bajo 4,0' : null,
      att != null && att < 85 ? 'Asistencia bajo 85%' : null,
      missing >= 3 ? `${missing} entregas pendientes` : null,
    ].filter((r): r is string => !!r)
    return {
      id: e.student_id, courseId: e.course_id, courseName: courseName.get(e.course_id) ?? '', average: avg, graded: own.length, attendance: att, missing,
      belowSubjects: [...perSubject.values()].filter(v => average(v)! < PASS_SCORE).length, reasons,
      outstanding: avg != null && avg >= 6 && (att == null || att >= 90) && missing === 0,
    }
  })
  const alertsByCourse = new Map<string, number>()
  for (const s of studentBase) if (s.reasons.length > 0) alertsByCourse.set(s.courseId, (alertsByCourse.get(s.courseId) ?? 0) + 1)

  // ── Agregado de un conjunto de cursos ──
  const aggregate = (ids: Set<string>, subjectId = subject?.id): Agg => {
    const scores: number[] = []
    const attendance: { status: string }[] = []
    let expected = 0, delivered = 0, students = 0, alerts = 0
    for (const id of ids) {
      for (const g of gradesOf(id, subjectId)) scores.push(g.score)
      for (const a of ix.attendanceByCourse.get(id) ?? NONE) attendance.push(a)
      const enrolled = enrolledIn(id).length
      students += enrolled
      alerts += alertsByCourse.get(id) ?? 0
      for (const a of assignmentsOf(id, subjectId)) if (isDue(a) && a.kind === 'tarea') { expected += enrolled; delivered += ix.submissionsOf.get(a.id) ?? 0 }
    }
    const below = scores.filter(v => v < PASS_SCORE).length
    return {
      average: average(scores), graded: scores.length, belowPct: scores.length ? (below / scores.length) * 100 : null,
      attendance: attendanceRate(attendance), submissionRate: expected ? (delivered / expected) * 100 : null, delivered, expected,
      students, alerts,
      feedback: fbScore(bySubject(feedback.filter(f => ids.has(f.course_id)), subjectId), lastMonth),
    }
  }
  const scope = aggregate(scopeIds)
  const school = aggregate(allIds, undefined)

  // ── Comparación: por grado, por sección o por asignatura según el alcance ──
  const sectionsOf = (levelId: string) => sectionsByLevel.get(levelId) ?? NONE
  let unitKind: 'grado' | 'sección' | 'asignatura'
  let units: Unit[]
  if (course) {
    unitKind = 'asignatura'
    const ids = new Set([course.id])
    const withData = new Set([...(ix.assignmentsByCourse.get(course.id) ?? NONE).map(a => a.subject_id), ...teaching.filter(t => t.course_id === course.id).map(t => t.subject_id)])
    units = snap.subjects.filter(s => withData.has(s.id)).map(s => ({
      ...aggregate(ids, s.id), id: s.id, label: s.name, patch: { asignatura: s.id },
      sub: teacherName.get(teacherOfGroup.get(`${course.id}:${s.id}`) ?? '') ?? 'Sin docente asignado',
    }))
  } else if (grade) {
    unitKind = 'sección'
    units = sectionsOf(grade.id).map(c => ({ ...aggregate(new Set([c.id])), id: c.id, label: c.name, sub: `${enrolledIn(c.id).length} estudiantes`, patch: { curso: c.id } }))
  } else {
    unitKind = 'grado'
    units = scopeLevels.map(l => ({ l, sections: sectionsOf(l.id) })).filter(x => x.sections.length > 0).map(({ l, sections }) => ({
      ...aggregate(new Set(sections.map(c => c.id))), id: l.id, label: l.name, patch: { grado: l.id, nivel: undefined },
      sub: `${sections.length} ${sections.length === 1 ? 'sección' : 'secciones'}`,
    }))
  }

  // ── Mapa de calor: filas = secciones del grado elegido, o grados del alcance ──
  const heatSource = grade
    ? sectionsOf(grade.id).map(c => ({ id: c.id, label: c.name, ids: [c.id], patch: { curso: c.id } as Partial<PerfSearch>, selected: course?.id === c.id }))
    : scopeLevels.map(l => ({ id: l.id, label: l.name, ids: sectionsOf(l.id).map(c => c.id), patch: { grado: l.id, nivel: undefined } as Partial<PerfSearch>, selected: false })).filter(r => r.ids.length > 0)
  const heatSubjectIds = new Set<string>()
  for (const r of heatSource) for (const id of r.ids) for (const g of ix.gradesByCourse.get(id) ?? NONE) heatSubjectIds.add(g.subject_id)
  const heatSubjects = snap.subjects.filter(s => heatSubjectIds.has(s.id))
  const heat: HeatRow[] = heatSource.map(r => ({
    id: r.id, label: r.label, patch: r.patch, selected: r.selected,
    cells: heatSubjects.map(s => {
      const scores = r.ids.flatMap(id => gradesOf(id, s.id).map(g => g.score))
      return { subjectId: s.id, average: average(scores), graded: scores.length, belowPct: scores.length ? (scores.filter(v => v < PASS_SCORE).length / scores.length) * 100 : null }
    }),
  }))

  // ── Notas del alcance, evolución semanal y contenidos ──
  const scopeAssignments = scopeCourses.flatMap(c => assignmentsOf(c.id))
  const scopeScores = scopeCourses.flatMap(c => gradesOf(c.id)).map(g => g.score)
  const thisWeek = weekStart(new Date(now))
  const weeks = Array.from({ length: 8 }, (_, i) => new Date(thisWeek.getTime() - (7 - i) * 7 * 86_400_000))
  const scoresByWeek = new Map<number, number[]>()
  for (const a of scopeAssignments) { const t = weekStart(new Date(a.due_at)).getTime(); const list = scoresByWeek.get(t); if (list) list.push(...scoresOf(a.id)); else scoresByWeek.set(t, scoresOf(a.id)) }
  const weekly = weeks.map(start => {
    const scores = scoresByWeek.get(start.getTime()) ?? NONE
    return { start: start.toISOString().slice(0, 10), average: average(scores), count: scores.length }
  })
  const topicMap = new Map<string, { topic: string; subject: string; scores: number[] }>()
  for (const a of scopeAssignments) {
    const key = `${a.subject_id}:${a.topic ?? ''}`
    const entry = topicMap.get(key) ?? { topic: a.topic ?? 'Sin contenido indicado', subject: subjectName.get(a.subject_id) ?? '', scores: [] }
    entry.scores.push(...scoresOf(a.id))
    topicMap.set(key, entry)
  }
  const topics = [...topicMap.values()].filter(t => t.scores.length > 0)
    .map(t => ({ topic: t.topic, subject: t.subject, average: average(t.scores)!, n: t.scores.length, below: t.scores.filter(v => v < PASS_SCORE).length }))
    .sort((a, b) => a.average - b.average)

  // ── Curso × asignatura del alcance (focos y fortalezas) ──
  const pairs = scopeCourses.flatMap(c => {
    const subjectIds = [...new Set(assignmentsOf(c.id).map(a => a.subject_id))]
    return subjectIds.map(sid => ({ ...aggregate(new Set([c.id]), sid), courseId: c.id, courseName: c.name, subjectId: sid, subjectName: subjectName.get(sid) ?? '' }))
  }).filter(p => p.average != null).sort((a, b) => a.average! - b.average!)

  // ── Evaluación de clases en el alcance ──
  const scopeFeedback = bySubject(feedback.filter(f => scopeIds.has(f.course_id)))
  const lastRows = scopeFeedback.filter(f => f.month === lastMonth)
  const classFeedback = {
    month: lastMonth, responses: lastRows.reduce((n, r) => n + r.responses, 0), score: fbScore(scopeFeedback, lastMonth), previous: fbScore(scopeFeedback, prevMonth),
    dims: FEEDBACK_DIMENSIONS.map(d => ({
      key: d.key, label: d.label, question: d.question,
      value: weighted(lastRows.map(r => ({ responses: r.responses, value: Number(r.dims[d.key]) }))),
      previous: weighted(scopeFeedback.filter(f => f.month === prevMonth).map(r => ({ responses: r.responses, value: Number(r.dims[d.key]) }))),
    })),
    monthly: months.map(m => ({ month: m, score: fbScore(scopeFeedback, m), responses: scopeFeedback.filter(f => f.month === m).reduce((n, r) => n + r.responses, 0) })),
  }

  // ── Evaluaciones ──
  const q = (sp.q ?? '').trim().toLowerCase()
  const has = (...texts: (string | null | undefined)[]) => !q || texts.some(t => (t ?? '').toLowerCase().includes(q))
  const evalAll: EvalRow[] = scopeAssignments.map(a => {
    const scores = scoresOf(a.id)
    const sub = ix.submissionsOf.get(a.id) ?? 0
    return {
      id: a.id, title: a.title, topic: a.topic, courseId: a.course_id, courseName: courseName.get(a.course_id) ?? '', subjectName: subjectName.get(a.subject_id) ?? '',
      teacher: teacherName.get(teacherOfGroup.get(`${a.course_id}:${a.subject_id}`) ?? '') ?? null, dueAt: a.due_at, isDue: isDue(a),
      enrolled: enrolledIn(a.course_id).length, submitted: sub, graded: scores.length, pendingReview: Math.max(0, sub - scores.length),
      average: average(scores), belowPass: scores.filter(v => v < PASS_SCORE).length, buckets: buckets(scores),
    }
  }).sort((a, b) => b.dueAt.localeCompare(a.dueAt))
  const lowResult = (e: EvalRow) => e.graded > 0 && (e.average! < PASS_SCORE || e.belowPass / e.graded >= 0.3)
  const evalCounts = { total: evalAll.length, graded: evalAll.filter(e => e.graded > 0).length, pending: evalAll.filter(e => e.pendingReview > 0).length, low: evalAll.filter(lowResult).length, upcoming: evalAll.filter(e => !e.isDue).length }

  // ── Docentes del alcance ──
  const scopeTeaching = bySubject(teaching.filter(t => scopeIds.has(t.course_id)))
  const groupsByTeacher = new Map<string, typeof scopeTeaching>()
  for (const t of scopeTeaching) pushTo(groupsByTeacher, t.teacher_id, t)
  const feedbackByTeacher = new Map<string, typeof feedback>()
  for (const f of feedback) pushTo(feedbackByTeacher, f.teacher_id, f)
  const teacherAll: TeacherRow[] = [...groupsByTeacher].map(([id, mine]) => {
    const scores: number[] = []
    const students = new Set<string>()
    let expected = 0, delivered = 0, evaluations = 0, pendingReview = 0
    for (const g of mine) {
      const enrolled = enrolledIn(g.course_id)
      enrolled.forEach(s => students.add(s))
      for (const a of assignmentsOf(g.course_id, g.subject_id)) {
        const own = scoresOf(a.id)
        const sub = ix.submissionsOf.get(a.id) ?? 0
        scores.push(...own); evaluations++; pendingReview += Math.max(0, sub - own.length)
        if (isDue(a)) { expected += enrolled.length; delivered += sub }
      }
    }
    const groupKeys = new Set(mine.map(g => `${g.course_id}:${g.subject_id}`))
    const fb = (feedbackByTeacher.get(id) ?? NONE).filter(f => groupKeys.has(`${f.course_id}:${f.subject_id}`))
    const member = teacherById.get(id)
    return {
      id, name: member?.fullName ?? 'Docente', active: member?.status === 'active',
      groups: mine.map(g => ({ courseName: courseName.get(g.course_id) ?? '', subjectName: subjectName.get(g.subject_id) ?? '' })),
      students: students.size, evaluations, pendingReview, average: average(scores),
      belowPct: scores.length ? (scores.filter(v => v < PASS_SCORE).length / scores.length) * 100 : null,
      submissionRate: expected ? (delivered / expected) * 100 : null,
      feedback: fbScore(fb, lastMonth), feedbackPrev: fbScore(fb, prevMonth), responses: fb.filter(f => f.month === lastMonth).reduce((n, r) => n + r.responses, 0),
    }
  }).sort((a, b) => a.name.localeCompare(b.name, 'es'))

  // ── Listas de la vista activa: búsqueda, filtro, orden y página ──
  const view: PerfView = PERF_VIEWS.includes(sp.vista as PerfView) ? (sp.vista as PerfView) : 'general'
  const page = Math.max(1, Number(sp.p) || 1)
  const paged = <T,>(rows: T[]) => ({ rows: rows.slice((page - 1) * PAGE, page * PAGE), total: rows.length, page, pageSize: PAGE })

  const evalFiltered = evalAll.filter(e => has(e.title, e.topic, e.courseName, e.subjectName, e.teacher)
    && (sp.estado === 'porcorregir' ? e.pendingReview > 0 : sp.estado === 'bajas' ? lowResult(e) : sp.estado === 'proximas' ? !e.isDue : true))

  const scopeStudents = studentBase.filter(s => scopeIds.has(s.courseId))
  const names = view === 'alumnado' ? await nameMap(db, scopeStudents.map(s => s.id)) : new Map<string, string>()
  const withNames: StudentRow[] = scopeStudents.map(s => ({ ...s, name: names.get(s.id) ?? 'Estudiante' }))
  const order = sp.orden ?? 'atencion'
  const studentFiltered = withNames.filter(s => has(s.name, s.courseName)
    && (sp.estado === 'alerta' ? s.reasons.length > 0 : sp.estado === 'destacados' ? s.outstanding : sp.estado === 'sinnotas' ? s.graded === 0 : true))
    .sort((a, b) => order === 'nombre' ? a.name.localeCompare(b.name, 'es')
      : order === 'asistencia' ? (a.attendance ?? 101) - (b.attendance ?? 101)
      : order === 'mejor' ? (b.average ?? 0) - (a.average ?? 0)
      : order === 'promedio' ? (a.average ?? 8) - (b.average ?? 8)
      : b.reasons.length - a.reasons.length || (a.average ?? 8) - (b.average ?? 8) || a.name.localeCompare(b.name, 'es'))
  const studentAverages = scopeStudents.map(s => s.average).filter((v): v is number => v != null)
  const studentCounts = {
    total: scopeStudents.length, alerts: scopeStudents.filter(s => s.reasons.length > 0).length, outstanding: scopeStudents.filter(s => s.outstanding).length,
    ungraded: scopeStudents.filter(s => s.graded === 0).length, buckets: buckets(studentAverages), average: average(studentAverages),
    reasons: [
      { label: 'Promedio bajo 4,0', value: scopeStudents.filter(s => s.average != null && s.average < PASS_SCORE).length },
      { label: 'Asistencia bajo 85%', value: scopeStudents.filter(s => s.attendance != null && s.attendance < 85).length },
      { label: '3 o más entregas pendientes', value: scopeStudents.filter(s => s.missing >= 3).length },
    ],
  }

  return {
    view, filtered, label,
    structure: {
      levels: levels.map(l => ({ id: l.id, name: l.name, stage: l.stage, sections: sectionsOf(l.id).length })),
      courses, subjects: snap.subjects,
    },
    selection: { stage, grade, course, subject },
    scope, school, unitKind, units, heat, heatSubjects,
    scores: scopeScores, distribution: buckets(scopeScores), weekly, topics,
    weakest: pairs.slice(0, 4), strongest: [...pairs].reverse().slice(0, 4),
    classFeedback,
    evaluations: { ...paged(evalFiltered), counts: evalCounts },
    students: { ...paged(studentFiltered), counts: studentCounts },
    teachers: { rows: teacherAll.filter(t => has(t.name, ...t.groups.flatMap(g => [g.courseName, g.subjectName]))), total: teacherAll.length },
  }
}

export type Performance = Awaited<ReturnType<typeof loadPerformance>>
