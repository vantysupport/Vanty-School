import 'server-only'
import type { DB } from '@/lib/supabase/server'
import type { Session } from '@/lib/auth/session'

export type Teaching = { courseId: string; courseName: string; subjectId: string; subjectName: string }

/** Cursos y asignaturas que el docente tiene a su cargo. */
export async function teachingOf(db: DB, session: Session): Promise<Teaching[]> {
  const { data } = await db.from('teacher_assignments').select('course_id, subject_id, courses(name), subjects(name)')
    .eq('institution_id', session.institutionId).eq('teacher_id', session.userId)
  return ((data ?? []) as unknown as { course_id: string; subject_id: string; courses: { name: string }; subjects: { name: string } }[])
    .map(r => ({ courseId: r.course_id, courseName: r.courses.name, subjectId: r.subject_id, subjectName: r.subjects.name }))
    .sort((a, b) => a.courseName.localeCompare(b.courseName, 'es') || a.subjectName.localeCompare(b.subjectName, 'es'))
}

export const uniqueCourses = (teaching: Teaching[]) =>
  [...new Map(teaching.map(t => [t.courseId, { id: t.courseId, name: t.courseName }])).values()]
