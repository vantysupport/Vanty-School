import 'server-only'
import type { DB } from '@/lib/supabase/server'
import { attendanceRate, average } from '@/lib/format'
import { isEvaluation, weightedAverage } from '@/lib/assessments'

export type StudentTask = {
  id: string; title: string; description: string; topic: string | null; dueAt: string; status: string; kind: string; weight: number | null
  subjectId: string; subjectName: string; attachmentPath: string | null; attachmentName: string | null
  submission: { content: string; filePath: string | null; fileName: string | null; submittedAt: string } | null
  grade: { score: number; feedback: string; gradedAt: string } | null
  state: 'graded' | 'submitted' | 'pending' | 'late' | 'closed' | 'upcoming' | 'awaiting'   // los dos últimos: evaluaciones sin entrega
}

export type StudentAcademics = {
  course: { id: string; name: string } | null
  tasks: StudentTask[]
  subjects: { subjectId: string; subjectName: string; average: number | null; count: number }[]
  overall: number | null
  attendance: { date: string; status: string }[]
  attendanceRate: number | null
}

/** Situación académica de un estudiante: la usan su propio panel y el de sus apoderados.
 *  RLS garantiza que solo responde para el estudiante mismo, sus apoderados vinculados y sus docentes. */
export async function loadStudentAcademics(db: DB, institutionId: string, studentId: string): Promise<StudentAcademics> {
  const { data: enrollment } = await db.from('course_enrollments').select('course_id, courses(name)')
    .eq('institution_id', institutionId).eq('student_id', studentId).eq('status', 'active').maybeSingle()
  const course = enrollment ? { id: enrollment.course_id as string, name: (enrollment as unknown as { courses: { name: string } }).courses.name } : null

  const [assignments, submissions, grades, attendance] = await Promise.all([
    course
      ? db.from('assignments').select('id, title, description, topic, due_at, status, kind, weight, subject_id, attachment_path, attachment_name, subjects(name)')
        .eq('course_id', course.id).neq('status', 'draft').order('due_at', { ascending: false })
      : Promise.resolve({ data: [] }),
    db.from('assignment_submissions').select('assignment_id, content, file_path, file_name, submitted_at').eq('student_id', studentId).eq('institution_id', institutionId),
    course ? db.from('grades').select('assignment_id, subject_id, score, feedback, graded_at, subjects(name)').eq('student_id', studentId).eq('course_id', course.id) : Promise.resolve({ data: [] }),
    course ? db.from('attendance_records').select('date, status').eq('student_id', studentId).eq('course_id', course.id).order('date', { ascending: false }) : Promise.resolve({ data: [] }),
  ])

  type G = { assignment_id: string | null; subject_id: string; score: number; feedback: string; graded_at: string; subjects: { name: string } }
  const G = (grades.data ?? []) as unknown as G[]
  const subOf = new Map((submissions.data ?? []).map(s => [s.assignment_id as string, s]))
  const gradeOf = new Map(G.filter(g => g.assignment_id).map(g => [g.assignment_id as string, g]))
  const now = Date.now()

  type A = { id: string; title: string; description: string; topic: string | null; due_at: string; status: string; kind: string; weight: number | null; subject_id: string; attachment_path: string | null; attachment_name: string | null; subjects: { name: string } }
  const tasks: StudentTask[] = ((assignments.data ?? []) as unknown as A[]).map(a => {
    const s = subOf.get(a.id), g = gradeOf.get(a.id)
    return {
      id: a.id, title: a.title, description: a.description, topic: a.topic, dueAt: a.due_at, status: a.status, kind: a.kind, weight: a.weight == null ? null : Number(a.weight),
      subjectId: a.subject_id, subjectName: a.subjects.name, attachmentPath: a.attachment_path, attachmentName: a.attachment_name,
      submission: s ? { content: s.content as string, filePath: s.file_path as string | null, fileName: s.file_name as string | null, submittedAt: s.submitted_at as string } : null,
      grade: g ? { score: Number(g.score), feedback: g.feedback, gradedAt: g.graded_at } : null,
      state: g ? 'graded' : isEvaluation(a.kind) ? (new Date(a.due_at).getTime() < now ? 'awaiting' : 'upcoming') : s ? 'submitted' : a.status === 'closed' ? 'closed' : new Date(a.due_at).getTime() < now ? 'late' : 'pending',
    }
  })

  // El promedio de cada asignatura respeta las ponderaciones que haya definido el docente.
  const weightOf = new Map(tasks.map(t => [t.id, t.weight]))
  const totalWeight = new Map<string, number>()
  for (const t of tasks) if (t.weight) totalWeight.set(t.subjectId, (totalWeight.get(t.subjectId) ?? 0) + t.weight)
  const bySubject = new Map<string, { name: string; scores: { score: number; weight: number | null | undefined }[] }>()
  for (const g of G) {
    const entry = bySubject.get(g.subject_id) ?? { name: g.subjects.name, scores: [] }
    entry.scores.push({ score: Number(g.score), weight: g.assignment_id ? weightOf.get(g.assignment_id) : null })
    bySubject.set(g.subject_id, entry)
  }
  const subjects = [...bySubject].map(([subjectId, v]) => ({ subjectId, subjectName: v.name, average: weightedAverage(v.scores, totalWeight.get(subjectId) ?? 0), count: v.scores.length }))
    .sort((a, b) => a.subjectName.localeCompare(b.subjectName, 'es'))

  const A = (attendance.data ?? []) as { date: string; status: string }[]
  return { course, tasks, subjects, overall: average(G.map(g => Number(g.score))), attendance: A, attendanceRate: attendanceRate(A) }
}

export const TASK_STATE: Record<StudentTask['state'], { label: string; tone: 'success' | 'accent' | 'warning' | 'danger' | 'neutral' }> = {
  graded: { label: 'Calificada', tone: 'success' },
  submitted: { label: 'Entregada', tone: 'accent' },
  pending: { label: 'Pendiente', tone: 'warning' },
  late: { label: 'Atrasada', tone: 'danger' },
  closed: { label: 'Cerrada sin entrega', tone: 'neutral' },
  upcoming: { label: 'Próxima', tone: 'accent' },
  awaiting: { label: 'Esperando nota', tone: 'neutral' },
}
