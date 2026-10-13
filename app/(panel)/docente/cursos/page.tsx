import Link from 'next/link'
import { ArrowRight, Star, Users } from 'lucide-react'
import { requireSession } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { teachingOf, uniqueCourses } from '@/lib/data/teaching'
import { assignmentStats, loadSnapshot } from '@/lib/data/academic'
import { Card, EmptyState, PageHeader } from '@/components/ui/primitives'
import { Reveal } from '@/components/ui/motion'

// Portadas: un color por nivel de enseñanza, con variaciones para que cursos vecinos no se vean iguales.
const COVERS: Record<string, string[]> = {
  parvularia: ['linear-gradient(135deg,#f59e0b,#f97316)', 'linear-gradient(135deg,#fb923c,#ef4444)'],
  basica: ['linear-gradient(135deg,#01abfc,#0063d8)', 'linear-gradient(135deg,#22c1dc,#0b7fd9)', 'linear-gradient(135deg,#3b82f6,#4338ca)'],
  media: ['linear-gradient(135deg,#6366f1,#7c3aed)', 'linear-gradient(135deg,#0ea5a4,#0369a1)', 'linear-gradient(135deg,#8b5cf6,#c026d3)'],
}
const STAGE: Record<string, string> = { parvularia: 'Educación parvularia', basica: 'Enseñanza básica', media: 'Enseñanza media' }

export default async function TeacherCourses() {
  const session = await requireSession('docente')
  const db = await createClient()
  const teaching = await teachingOf(db, session)
  const ids = uniqueCourses(teaching).map(c => c.id)
  const snap = await loadSnapshot(db, session.institutionId)
  const work = teaching.flatMap(t => assignmentStats(snap, t.courseId, t.subjectId).map(a => ({ ...a, courseId: t.courseId })))
  const [{ data: rows }, { data: enrollments }] = ids.length ? await Promise.all([
    db.from('courses').select('id, name, section, head_teacher_id, grade_levels(name, stage, sort_order)').in('id', ids),
    db.from('course_enrollments').select('course_id').in('course_id', ids).eq('status', 'active'),
  ]) : [{ data: [] }, { data: [] }]
  type Row = { id: string; name: string; section: string; head_teacher_id: string | null; grade_levels: { name: string; stage: string; sort_order: number } | null }
  const courses = ((rows ?? []) as unknown as Row[])
    .sort((a, b) => (a.grade_levels?.sort_order ?? 99) - (b.grade_levels?.sort_order ?? 99) || a.section.localeCompare(b.section, 'es'))

  return (
    <>
      <PageHeader title="Mis cursos" description="Elige un curso para ver sus tareas, estudiantes y notas." />
      {courses.length === 0 ? (
        <Card><EmptyState aria={4} title="Aún no tienes cursos asignados" description="La secretaría del colegio asigna los cursos y asignaturas de cada docente." /></Card>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {courses.map((c, i) => {
            const stage = c.grade_levels?.stage ?? 'basica'
            const palette = COVERS[stage] ?? COVERS.basica
            const subjects = teaching.filter(t => t.courseId === c.id)
            const students = (enrollments ?? []).filter(e => e.course_id === c.id).length
            const tasks = work.filter(a => a.courseId === c.id)
            const pending = tasks.reduce((n, a) => n + a.pendingReview, 0)
            const open = tasks.filter(a => !a.isDue).length
            return (
              <Reveal key={c.id} index={Math.min(i, 8)}>
                <Link href={`/docente/cursos/${c.id}`} className="group block overflow-hidden rounded-v-lg border border-v-border bg-v-elevated shadow-v transition-all duration-300 hover:-translate-y-1 hover:shadow-v-lg">
                  <div className="relative h-36 overflow-hidden p-5 text-white" style={{ background: palette[i % palette.length] }}>
                    <span aria-hidden className="pointer-events-none absolute -right-10 -top-14 size-48 rounded-full bg-white/15" />
                    <span aria-hidden className="pointer-events-none absolute -bottom-16 right-16 size-40 rounded-full bg-white/10" />
                    <span aria-hidden className="v-display pointer-events-none absolute -bottom-7 right-4 text-[7.5rem] font-extrabold leading-none text-white/20">{c.section}</span>
                    <p className="relative text-[11px] font-semibold uppercase tracking-[0.12em] text-white/85">{STAGE[stage]}</p>
                    <h2 className="v-display relative mt-1 text-[1.75rem] font-bold leading-tight tracking-tight">{c.name}</h2>
                    {c.head_teacher_id === session.userId && <span className="relative mt-2 inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-0.5 text-[11px] font-semibold"><Star size={11} className="fill-current" />Profesor(a) jefe</span>}
                    {pending > 0 && <span className="relative ml-1.5 mt-2 inline-flex items-center rounded-full bg-white px-3 py-0.5 text-[11.5px] font-bold text-[#a16207] shadow-v">{pending} por corregir</span>}
                  </div>
                  <div className="flex items-center gap-3 p-5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14.5px] font-semibold text-v-text">{subjects.map(s => s.subjectName).join(' · ')}</p>
                      <p className="mt-1 inline-flex items-center gap-1.5 text-[13px] text-v-muted"><Users size={14} className="text-v-subtle" />{students} {students === 1 ? 'estudiante' : 'estudiantes'} · {open} {open === 1 ? 'tarea vigente' : 'tareas vigentes'}</p>
                    </div>
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-v-fill text-v-muted transition-all duration-300 group-hover:bg-v-accent group-hover:text-white"><ArrowRight size={17} /></span>
                  </div>
                </Link>
              </Reveal>
            )
          })}
        </div>
      )}
    </>
  )
}
