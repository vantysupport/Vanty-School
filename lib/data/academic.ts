import 'server-only'
import type { DB } from '@/lib/supabase/server'
import { attendanceRate, average, PASS_SCORE } from '@/lib/format'
import { isEvaluation } from '@/lib/assessments'

// Lectura y agregación de datos académicos. Todas las consultas usan el cliente con la sesión del usuario:
// RLS determina qué filas existen para quien pregunta; aquí solo se resume lo que ya está autorizado.

export type Snapshot = {
  courses: { id: string; name: string }[]
  subjects: { id: string; name: string }[]
  assignments: { id: string; course_id: string; subject_id: string; title: string; topic: string | null; due_at: string; status: string; kind: string; weight: number | null }[]
  grades: { assignment_id: string | null; course_id: string; subject_id: string; student_id: string; score: number }[]
  submissions: { assignment_id: string; student_id: string }[]
  enrollments: { course_id: string; student_id: string }[]
  attendance: { course_id: string; student_id: string; status: string; date: string }[]
}

type Packed = {
  students: string[]
  assignments: [string, string, string, string, string | null, string, string, string, number | null][]
  grades: [number, number, number][]
  loose: [string | null, string, string, number, number][]
  submissions: [number, number][]
  enrollments: [string, number][]
  attendance: [string, number, string, string][]
}

/** Fotografía académica del colegio (o de un curso y asignatura). Un colegio completo tiene decenas de miles de notas,
 *  así que todo llega en una sola respuesta compacta de la función academic_snapshot, que aplica las mismas reglas de
 *  lectura que RLS: administración y dirección ven el colegio; un docente, lo suyo. La asistencia son las últimas cinco semanas. */
export async function loadSnapshot(db: DB, institutionId: string, filter: { courseId?: string; subjectId?: string } = {}): Promise<Snapshot> {
  const [courses, subjects, packed] = await Promise.all([
    filter.courseId
      ? db.from('courses').select('id, name').eq('institution_id', institutionId).eq('is_archived', false).eq('id', filter.courseId).order('name')
      : db.from('courses').select('id, name').eq('institution_id', institutionId).eq('is_archived', false).order('name'),
    filter.subjectId
      ? db.from('subjects').select('id, name').eq('institution_id', institutionId).eq('id', filter.subjectId).order('name')
      : db.from('subjects').select('id, name').eq('institution_id', institutionId).order('name'),
    db.rpc('academic_snapshot', { p_inst: institutionId, p_course: filter.courseId ?? null, p_subject: filter.subjectId ?? null }),
  ])
  const p = (packed.data ?? { students: [], assignments: [], grades: [], loose: [], submissions: [], enrollments: [], attendance: [] }) as Packed
  const assignments: Snapshot['assignments'] = p.assignments.map(([id, course_id, subject_id, title, topic, due_at, status, kind, weight]) =>
    ({ id, course_id, subject_id, title, topic, due_at, status, kind, weight: weight == null ? null : Number(weight) }))
  const enrollments = p.enrollments.map(([course_id, si]) => ({ course_id, student_id: p.students[si] }))

  // Una evaluación (prueba, examen…) se rinde en clases y no tiene entrega en la plataforma. Una vez pasada su fecha
  // se cuenta como rendida por todo el curso: así no aparece como «entrega pendiente» del estudiante y lo que queda
  // por hacer es la nota que debe registrar el docente.
  const byCourse = new Map<string, string[]>()
  for (const e of enrollments) byCourse.set(e.course_id, [...(byCourse.get(e.course_id) ?? []), e.student_id])
  const nowMs = Date.now()
  const sat = assignments.filter(x => isEvaluation(x.kind) && new Date(x.due_at).getTime() < nowMs)
    .flatMap(x => (byCourse.get(x.course_id) ?? []).map(student_id => ({ assignment_id: x.id, student_id })))

  return {
    courses: courses.data ?? [],
    subjects: subjects.data ?? [],
    assignments,
    grades: [
      ...p.grades.map(([ai, si, score]) => ({ assignment_id: assignments[ai].id, course_id: assignments[ai].course_id, subject_id: assignments[ai].subject_id, student_id: p.students[si], score: Number(score) })),
      ...p.loose.map(([assignment_id, course_id, subject_id, si, score]) => ({ assignment_id, course_id, subject_id, student_id: p.students[si], score: Number(score) })),
    ],
    submissions: [...p.submissions.map(([ai, si]) => ({ assignment_id: assignments[ai].id, student_id: p.students[si] })), ...sat],
    enrollments,
    attendance: p.attendance.map(([course_id, si, status, date]) => ({ course_id, student_id: p.students[si], status, date })),
  }
}

type Rows<K extends keyof Snapshot> = Snapshot[K]
type Index = {
  gradesByStudent: Map<string, Rows<'grades'>>; gradesByCourse: Map<string, Rows<'grades'>>; gradesByGroup: Map<string, Rows<'grades'>>
  gradesBySubject: Map<string, Rows<'grades'>>; gradesByAssignment: Map<string, Rows<'grades'>>
  submittedBy: Map<string, Set<string>>          // estudiante → tareas que entregó
  submissionsOf: Map<string, number>             // tarea → cuántas entregas tiene
  attendanceByStudent: Map<string, Rows<'attendance'>>; attendanceByCourse: Map<string, Rows<'attendance'>>
  enrolledIn: Map<string, string[]>              // curso → estudiantes
  assignmentsByCourse: Map<string, Rows<'assignments'>>; assignmentsByGroup: Map<string, Rows<'assignments'>>
}
const indexes = new WeakMap<Snapshot, Index>()
const push = <K, V>(map: Map<K, V[]>, key: K, value: V) => { const list = map.get(key); if (list) list.push(value); else map.set(key, [value]) }
const EMPTY: never[] = []

/** Índices de una fotografía académica. Con un colegio completo son decenas de miles de filas: buscar recorriendo la
 *  lista entera por cada estudiante o cada tarea tarda segundos, así que se agrupa una sola vez y se reutiliza. */
export function indexSnapshot(s: Snapshot): Index {
  const cached = indexes.get(s)
  if (cached) return cached
  const ix: Index = {
    gradesByStudent: new Map(), gradesByCourse: new Map(), gradesByGroup: new Map(), gradesBySubject: new Map(), gradesByAssignment: new Map(),
    submittedBy: new Map(), submissionsOf: new Map(), attendanceByStudent: new Map(), attendanceByCourse: new Map(),
    enrolledIn: new Map(), assignmentsByCourse: new Map(), assignmentsByGroup: new Map(),
  }
  for (const g of s.grades) {
    push(ix.gradesByStudent, g.student_id, g); push(ix.gradesByCourse, g.course_id, g); push(ix.gradesBySubject, g.subject_id, g)
    push(ix.gradesByGroup, `${g.course_id}:${g.subject_id}`, g)
    if (g.assignment_id) push(ix.gradesByAssignment, g.assignment_id, g)
  }
  for (const x of s.submissions) {
    const set = ix.submittedBy.get(x.student_id); if (set) set.add(x.assignment_id); else ix.submittedBy.set(x.student_id, new Set([x.assignment_id]))
    ix.submissionsOf.set(x.assignment_id, (ix.submissionsOf.get(x.assignment_id) ?? 0) + 1)
  }
  for (const r of s.attendance) { push(ix.attendanceByStudent, r.student_id, r); push(ix.attendanceByCourse, r.course_id, r) }
  for (const e of s.enrollments) push(ix.enrolledIn, e.course_id, e.student_id)
  for (const x of s.assignments) { push(ix.assignmentsByCourse, x.course_id, x); push(ix.assignmentsByGroup, `${x.course_id}:${x.subject_id}`, x) }
  indexes.set(s, ix)
  return ix
}

export type GroupStat = {
  courseId: string; courseName: string; subjectId: string; subjectName: string
  average: number | null; graded: number; belowPass: number; belowPassPct: number | null
  enrolled: number; dueAssignments: number; submissionRate: number | null
}

/** Indicadores por curso × asignatura. */
export function groupStats(s: Snapshot): GroupStat[] {
  const now = Date.now(), ix = indexSnapshot(s)
  const out: GroupStat[] = []
  for (const course of s.courses) {
    const enrolled = (ix.enrolledIn.get(course.id) ?? EMPTY).length
    for (const subject of s.subjects) {
      const key = `${course.id}:${subject.id}`
      const assignments = ix.assignmentsByGroup.get(key) ?? EMPTY
      if (assignments.length === 0) continue
      const scores = (ix.gradesByGroup.get(key) ?? EMPTY).map(g => g.score)
      const due = assignments.filter(x => new Date(x.due_at).getTime() < now && !isEvaluation(x.kind))   // la tasa de entrega solo mira tareas
      const submitted = due.reduce((n, x) => n + (ix.submissionsOf.get(x.id) ?? 0), 0)
      const expected = due.length * enrolled
      const below = scores.filter(v => v < PASS_SCORE).length
      out.push({
        courseId: course.id, courseName: course.name, subjectId: subject.id, subjectName: subject.name,
        average: average(scores), graded: scores.length, belowPass: below,
        belowPassPct: scores.length ? (below / scores.length) * 100 : null,
        enrolled, dueAssignments: due.length, submissionRate: expected ? (submitted / expected) * 100 : null,
      })
    }
  }
  return out
}

export type AssignmentStat = {
  id: string; title: string; topic: string | null; dueAt: string; isDue: boolean; kind: string; weight: number | null
  enrolled: number; submitted: number; graded: number; pendingReview: number
  average: number | null; belowPass: number; buckets: [number, number, number, number]   // <4,0 | 4,0–4,9 | 5,0–5,9 | 6,0–7,0
}

/** Indicadores por tarea para un curso y asignatura. */
export function assignmentStats(s: Snapshot, courseId: string, subjectId: string): AssignmentStat[] {
  const ix = indexSnapshot(s)
  const enrolled = (ix.enrolledIn.get(courseId) ?? EMPTY).length
  return (ix.assignmentsByGroup.get(`${courseId}:${subjectId}`) ?? EMPTY).map(x => {
    const scores = (ix.gradesByAssignment.get(x.id) ?? EMPTY).map(g => g.score)
    const submitted = ix.submissionsOf.get(x.id) ?? 0
    return {
      id: x.id, title: x.title, topic: x.topic, dueAt: x.due_at, kind: x.kind, weight: x.weight, isDue: new Date(x.due_at).getTime() < Date.now(),
      enrolled, submitted, graded: scores.length, pendingReview: Math.max(0, submitted - scores.length),
      average: average(scores), belowPass: scores.filter(v => v < PASS_SCORE).length,
      buckets: [scores.filter(v => v < 4).length, scores.filter(v => v >= 4 && v < 5).length,
        scores.filter(v => v >= 5 && v < 6).length, scores.filter(v => v >= 6).length],
    }
  })
}

export function attendanceByCourse(s: Snapshot) {
  const ix = indexSnapshot(s)
  return s.courses.map(c => {
    const rows = ix.attendanceByCourse.get(c.id) ?? EMPTY
    return { courseId: c.id, courseName: c.name, rate: attendanceRate(rows), records: rows.length }
  })
}

export function subjectAverages(s: Snapshot) {
  const ix = indexSnapshot(s)
  return s.subjects.map(sub => {
    const scores = (ix.gradesBySubject.get(sub.id) ?? EMPTY).map(g => g.score)
    return { subjectId: sub.id, subjectName: sub.name, average: average(scores), graded: scores.length,
      belowPassPct: scores.length ? (scores.filter(v => v < PASS_SCORE).length / scores.length) * 100 : null }
  }).filter(x => x.graded > 0)
}

/** Situación de un estudiante en su curso: promedio, asistencia reciente y tareas vencidas sin entregar. */
export function studentStanding(s: Snapshot, studentId: string, courseId: string, now = Date.now()) {
  const ix = indexSnapshot(s)
  const handed = ix.submittedBy.get(studentId)
  const due = (ix.assignmentsByCourse.get(courseId) ?? EMPTY).filter(x => new Date(x.due_at).getTime() < now)
  return {
    avg: average((ix.gradesByStudent.get(studentId) ?? EMPTY).map(g => g.score)),
    attendance: attendanceRate(ix.attendanceByStudent.get(studentId) ?? EMPTY),
    missing: due.length - due.filter(x => handed?.has(x.id)).length,
  }
}

/** Promedio semanal de notas de las últimas semanas (comparación temporal). */
export async function weeklyAverages(db: DB, institutionId: string, weeks = 6) {
  const { data } = await db.rpc('weekly_grade_averages', { p_inst: institutionId, p_weeks: weeks })
  const rows = new Map(((data ?? []) as { age: number; average: number; n: number }[]).map(r => [r.age, r]))
  return Array.from({ length: weeks }, (_, i) => weeks - 1 - i).map(age => ({
    label: age === 0 ? 'Esta semana' : `Hace ${age} sem.`,
    average: rows.has(age) ? Number(rows.get(age)!.average) : null,
    count: rows.get(age)?.n ?? 0,
  }))
}

/** Plan de asignaturas: qué asignaturas lleva cada curso, tengan o no docente. */
export async function loadPlan(db: DB, institutionId: string) {
  const { data } = await db.from('course_subjects').select('course_id, subject_id').eq('institution_id', institutionId)
  return (data ?? []) as { course_id: string; subject_id: string }[]
}

/** Umbrales de ocupación de aula: aviso sobre 40 estudiantes; sobre la capacidad, sobrecupo. */
export const CROWDED = 40
export function occupancy(students: number, capacity: number): 'ok' | 'high' | 'over' {
  return students > capacity ? 'over' : students > CROWDED ? 'high' : 'ok'
}
