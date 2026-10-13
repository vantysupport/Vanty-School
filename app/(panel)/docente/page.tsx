import Link from 'next/link'
import { ArrowRight, CalendarCheck, CalendarClock, Check, ClipboardCheck, ClipboardList, GraduationCap, MessageSquare, Star, Users } from 'lucide-react'
import { requireSession } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { teachingOf, uniqueCourses } from '@/lib/data/teaching'
import { assignmentStats, groupStats, loadSnapshot } from '@/lib/data/academic'
import { attendanceRate, average, firstName, fmtDate, fmtPct, fmtScore, scoreTone, todayISO } from '@/lib/format'
import { Badge, Card, CardHeader, EmptyState } from '@/components/ui/primitives'
import { Chip, Hero, Kpi, Reveal } from '@/components/ui/motion'

// Mismas portadas que «Mis cursos»: un color por nivel de enseñanza.
const COVERS: Record<string, string[]> = {
  parvularia: ['linear-gradient(135deg,#f59e0b,#f97316)', 'linear-gradient(135deg,#fb923c,#ef4444)'],
  basica: ['linear-gradient(135deg,#01abfc,#0063d8)', 'linear-gradient(135deg,#22c1dc,#0b7fd9)', 'linear-gradient(135deg,#3b82f6,#4338ca)'],
  media: ['linear-gradient(135deg,#6366f1,#7c3aed)', 'linear-gradient(135deg,#0ea5a4,#0369a1)', 'linear-gradient(135deg,#8b5cf6,#c026d3)'],
}
const SCORE_TEXT: Record<string, string> = { success: 'text-v-success', warning: 'text-v-warning', danger: 'text-v-danger', neutral: 'text-v-text' }
const SHOWN = 6

export default async function TeacherHome() {
  const session = await requireSession('docente')
  const db = await createClient()
  const [teaching, snap, { data: inbox }] = await Promise.all([
    teachingOf(db, session), loadSnapshot(db, session.institutionId),
    db.from('conversation_participants').select('last_read_at, conversations(last_message_at)').eq('user_id', session.userId),
  ])
  const ids = uniqueCourses(teaching).map(c => c.id)
  const { data: rows } = ids.length
    ? await db.from('courses').select('id, name, section, head_teacher_id, grade_levels(stage, sort_order)').in('id', ids)
    : { data: [] }
  type Row = { id: string; name: string; section: string; head_teacher_id: string | null; grade_levels: { stage: string; sort_order: number } | null }

  const today = todayISO()
  const weekend = [0, 6].includes(new Date(`${today}T12:00:00Z`).getUTCDay())
  const mine = teaching.flatMap(t => assignmentStats(snap, t.courseId, t.subjectId).map(a => ({ ...a, ...t })))
  const upcoming = mine.filter(a => !a.isDue).sort((a, b) => a.dueAt.localeCompare(b.dueAt))
  const toReview = mine.filter(a => a.pendingReview > 0).sort((a, b) => b.pendingReview - a.pendingReview)
  const reviewTotal = toReview.reduce((n, a) => n + a.pendingReview, 0)
  const stats = groupStats(snap)
  const unread = ((inbox ?? []) as unknown as { last_read_at: string | null; conversations: { last_message_at: string } | null }[])
    .filter(p => p.conversations && (!p.last_read_at || new Date(p.last_read_at) < new Date(p.conversations.last_message_at))).length

  const courses = ((rows ?? []) as unknown as Row[])
    .sort((a, b) => (a.grade_levels?.sort_order ?? 99) - (b.grade_levels?.sort_order ?? 99) || a.section.localeCompare(b.section, 'es'))
    .map(c => {
      const attendance = snap.attendance.filter(a => a.course_id === c.id)
      const scores = stats.filter(g => g.courseId === c.id && teaching.some(t => t.courseId === c.id && t.subjectId === g.subjectId)).map(g => g.average).filter((v): v is number => v != null)
      return {
        ...c, stage: c.grade_levels?.stage ?? 'basica',
        subjects: teaching.filter(t => t.courseId === c.id).map(t => t.subjectName),
        students: new Set(snap.enrollments.filter(e => e.course_id === c.id).map(e => e.student_id)).size,
        average: average(scores), attendance: attendance.length ? attendanceRate(attendance) : null,
        review: toReview.filter(a => a.courseId === c.id).reduce((n, a) => n + a.pendingReview, 0),
        listed: attendance.some(a => a.date === today),
      }
    })
  const students = courses.reduce((n, c) => n + c.students, 0)
  const unlisted = courses.filter(c => !c.listed).length

  return (
    <>
      <Hero name={firstName(session.fullName)} subtitle="Esto es lo que tienes hoy." chips={<>
        <Chip icon={<GraduationCap size={12} />}>{courses.length} cursos · {students} estudiantes</Chip>
        {upcoming[0] && <Chip tone="success" icon={<CalendarCheck size={12} />}>Próxima entrega: {fmtDate(upcoming[0].dueAt)}</Chip>}
      </>} />

      {/* Lo que pide atención hoy */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Kpi index={0} href="/docente/asistencia" label="Lista de hoy" icon={<CalendarCheck size={18} />} tone={weekend || !unlisted ? 'success' : 'warning'} urgent={!weekend && unlisted > 0}
          value={weekend ? '—' : unlisted} hint={weekend ? 'Hoy no hay clases' : unlisted ? `${unlisted === 1 ? 'curso' : 'cursos'} sin pasar lista` : 'Todos tus cursos al día'} />
        <Kpi index={1} href="/docente/cursos" label="Entregas por revisar" icon={<ClipboardCheck size={18} />} tone={reviewTotal ? 'warning' : 'success'} urgent={reviewTotal > 0}
          value={reviewTotal} hint={reviewTotal ? `En ${toReview.length} ${toReview.length === 1 ? 'tarea' : 'tareas'}` : 'Estás al día'} />
        <Kpi index={2} href="/docente/mensajes" label="Mensajes sin leer" icon={<MessageSquare size={18} />} tone={unread ? 'accent' : 'success'}
          value={unread} hint={unread ? 'Conversaciones con novedades' : 'Nada pendiente'} />
        <Kpi index={3} href="/docente/cursos" label="Tareas vigentes" icon={<ClipboardList size={18} />}
          value={upcoming.length} hint={upcoming[0] ? `Siguiente: ${fmtDate(upcoming[0].dueAt)}` : 'Sin tareas abiertas'} />
      </div>

      {/* Cursos */}
      <div className="mb-3 mt-7 flex items-end justify-between gap-3">
        <h2 className="v-display text-[1.25rem] font-bold tracking-tight text-v-text">Mis cursos</h2>
        <Link href="/docente/cursos" className="flex items-center gap-1 text-[13px] font-semibold text-v-accent hover:underline">{courses.length > SHOWN ? `Ver los ${courses.length}` : 'Ver todos'}<ArrowRight size={14} /></Link>
      </div>
      {courses.length === 0 ? (
        <Card><EmptyState aria={4} title="Aún no tienes cursos asignados" description="La secretaría del colegio asigna los cursos y asignaturas de cada docente." /></Card>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {courses.slice(0, SHOWN).map((c, i) => {
            const palette = COVERS[c.stage] ?? COVERS.basica
            return (
              <Reveal key={c.id} index={i}>
                <article className="flex h-full flex-col overflow-hidden rounded-v-lg border border-v-border bg-v-elevated shadow-v transition-all duration-300 hover:-translate-y-1 hover:shadow-v-lg">
                  <Link href={`/docente/cursos/${c.id}`} className="relative block h-28 overflow-hidden p-5 text-white" style={{ background: palette[i % palette.length] }}>
                    <span aria-hidden className="pointer-events-none absolute -right-10 -top-14 size-44 rounded-full bg-white/15" />
                    <span aria-hidden className="v-display pointer-events-none absolute -bottom-6 right-4 text-[6rem] font-extrabold leading-none text-white/20">{c.section}</span>
                    <h3 className="v-display relative text-[1.5rem] font-bold leading-tight tracking-tight">{c.name}</h3>
                    <p className="relative mt-1 truncate text-[12.5px] font-medium text-white/90">{c.subjects.join(' · ')}</p>
                    {c.head_teacher_id === session.userId && <span className="relative mt-1.5 inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-0.5 text-[11px] font-semibold"><Star size={11} className="fill-current" />Profesor(a) jefe</span>}
                  </Link>
                  <dl className="grid grid-cols-3 divide-x divide-v-border border-b border-v-border text-center">
                    <div className="px-2 py-3.5"><dd className="v-display text-[1.25rem] font-bold leading-none text-v-text">{c.students}</dd><dt className="mt-1.5 flex items-center justify-center gap-1 text-[11.5px] text-v-muted"><Users size={12} />Estudiantes</dt></div>
                    <div className="px-2 py-3.5"><dd className={`v-display text-[1.25rem] font-bold leading-none ${SCORE_TEXT[scoreTone(c.average)]}`}>{fmtScore(c.average)}</dd><dt className="mt-1.5 text-[11.5px] text-v-muted">Promedio</dt></div>
                    <div className="px-2 py-3.5"><dd className="v-display text-[1.25rem] font-bold leading-none text-v-text">{fmtPct(c.attendance)}</dd><dt className="mt-1.5 text-[11.5px] text-v-muted">Asistencia</dt></div>
                  </dl>
                  <div className="mt-auto grid grid-cols-2 gap-2.5 p-4">
                    {weekend
                      ? <Link href={`/docente/asistencia?curso=${c.id}`} className="flex items-center justify-center gap-1.5 rounded-full border border-v-border-strong px-3 py-2.5 text-[13px] font-semibold text-v-text hover:border-v-accent hover:text-v-accent"><CalendarCheck size={15} />Asistencia</Link>
                      : c.listed
                      ? <Link href={`/docente/asistencia?curso=${c.id}`} className="flex items-center justify-center gap-1.5 rounded-full bg-v-success/15 px-3 py-2.5 text-[13px] font-semibold text-[#157a4b] hover:bg-v-success/25"><Check size={15} />Lista pasada</Link>
                      : <Link href={`/docente/asistencia?curso=${c.id}`} className="v-brand flex items-center justify-center gap-1.5 rounded-full px-3 py-2.5 text-[13px] font-semibold shadow-v-brand"><CalendarCheck size={15} />Pasar lista</Link>}
                    <Link href={`/docente/cursos/${c.id}`} className="flex items-center justify-center gap-1.5 rounded-full border border-v-border-strong px-3 py-2.5 text-[13px] font-semibold text-v-text hover:border-v-accent hover:text-v-accent">
                      <ClipboardList size={15} />Tareas{c.review > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-v-warning px-1.5 text-[11px] font-bold text-white">{c.review}</span>}
                    </Link>
                  </div>
                </article>
              </Reveal>
            )
          })}
        </div>
      )}

      {/* Trabajo pendiente */}
      <div className="mt-7 grid items-stretch gap-4 lg:grid-cols-2">
        <Card className="flex flex-col">
          <CardHeader icon={<ClipboardCheck size={15} />} tone="warning" title="Por revisar" description="Entregas que esperan tu calificación"
            actions={reviewTotal > 0 && <Badge tone="warning">{reviewTotal}</Badge>} />
          {toReview.length === 0 ? <EmptyState aria={2} title="Estás al día" description="No tienes entregas pendientes de revisión." /> : (
            <ul className="divide-y divide-v-border">
              {toReview.slice(0, 4).map(a => (
                <li key={a.id}>
                  <Link href={`/docente/tareas/${a.id}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-v-fill/60">
                    <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-v-warning/15 text-[15px] font-bold text-[#b45309]">{a.pendingReview}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-[14.5px] font-semibold text-v-text">{a.title}</span><span className="block truncate text-[12.5px] text-v-muted">{a.courseName} · {a.subjectName}</span></span>
                    <ArrowRight size={16} className="shrink-0 text-v-subtle" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {toReview.length > 4 && <Link href="/docente/cursos" className="mt-auto block border-t border-v-border px-5 py-3 text-center text-[13px] font-semibold text-v-accent hover:bg-v-fill/60">Ver las {toReview.length} tareas con entregas</Link>}
        </Card>

        <Card className="flex flex-col" index={2}>
          <CardHeader icon={<CalendarClock size={15} />} title="Próximas entregas" description="Tareas que aún reciben trabajos" />
          {upcoming.length === 0 ? <EmptyState aria={5} title="Sin tareas abiertas" description="Crea una desde Tareas, eligiendo el curso." /> : (
            <ul className="divide-y divide-v-border">
              {upcoming.slice(0, 4).map(a => (
                <li key={a.id}>
                  <Link href={`/docente/tareas/${a.id}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-v-fill/60">
                    <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-v-accent-soft text-v-accent"><ClipboardList size={19} /></span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-[14.5px] font-semibold text-v-text">{a.title}</span><span className="block truncate text-[12.5px] text-v-muted">{a.courseName} · {a.subjectName}</span></span>
                    <span className="shrink-0 text-right"><span className="block text-[12.5px] font-semibold text-v-text">{fmtDate(a.dueAt)}</span><span className="block text-[11.5px] text-v-subtle">{a.submitted} de {a.enrolled} entregaron</span></span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {upcoming.length > 4 && <Link href="/docente/cursos" className="mt-auto block border-t border-v-border px-5 py-3 text-center text-[13px] font-semibold text-v-accent hover:bg-v-fill/60">Ver las {upcoming.length} tareas vigentes</Link>}
        </Card>
      </div>
    </>
  )
}
