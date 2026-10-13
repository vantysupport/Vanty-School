import Link from 'next/link'
import { AlertCircle, CalendarCheck, CalendarClock, CheckCircle2, ClipboardList, GraduationCap, HeartHandshake, MessageSquare, Sparkles, Star, TrendingUp } from 'lucide-react'
import { requireSession } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { activePupil } from '@/lib/data/guardian'
import { loadStudentAcademics, type StudentAcademics } from '@/lib/data/student'
import { nameMap } from '@/lib/data/people'
import { KIND_LABEL } from '@/lib/assessments'
import { plainSummary } from '@/lib/guardian-summary'
import { firstName, fmtDate, fmtPct, fmtScore, scoreTone } from '@/lib/format'
import { Avatar, Badge, Card, CardHeader, EmptyState, PageHeader } from '@/components/ui/primitives'
import { Reveal } from '@/components/ui/motion'
import { AttendanceList, GradesTable, SubjectAverages, TaskList } from '@/components/shared/academics'

type Search = { tab?: string }
const COVERS = ['linear-gradient(135deg,#01abfc,#0063d8)', 'linear-gradient(135deg,#6366f1,#7c3aed)', 'linear-gradient(135deg,#0ea5a4,#0369a1)', 'linear-gradient(135deg,#f59e0b,#f97316)']
const SCORE_TEXT: Record<string, string> = { success: 'text-v-success', warning: 'text-[#a16207]', danger: 'text-v-danger', neutral: 'text-v-text' }
const pendingOf = (d: StudentAcademics) => d.tasks.filter(t => t.state === 'pending' || t.state === 'late')

export default async function Pupils({ searchParams }: { searchParams: Promise<Search> }) {
  const session = await requireSession('apoderado')
  const sp = await searchParams
  const db = await createClient()
  const { pupils, pupil: chosen } = await activePupil(db, session)
  if (pupils.length === 0) {
    return (
      <>
        <PageHeader title="Seguimiento escolar" description="Notas, asistencia y tareas de los estudiantes a tu cargo." />
        <Card><EmptyState aria={4} title="Aún no tienes estudiantes vinculados" description="La secretaría del colegio vincula a cada apoderado con sus estudiantes. Si falta alguno, comunícate con el colegio." /></Card>
      </>
    )
  }
  // RLS: el apoderado solo obtiene datos de los estudiantes que el colegio le vinculó.
  const index = Math.max(0, pupils.findIndex(p => p.id === chosen?.id))
  const pupil = pupils[index]
  const data = await loadStudentAcademics(db, session.institutionId, pupil.id)
  const tab = ['tareas', 'notas', 'asistencia'].includes(sp.tab ?? '') ? sp.tab! : 'resumen'
  const href = (patch: Search) => {
    const next = new URLSearchParams()
    for (const [k, v] of Object.entries({ tab: sp.tab, ...patch })) if (v && !(k === 'tab' && v === 'resumen')) next.set(k, v)
    const q = next.toString()
    return q ? `/apoderado/hijos?${q}` : '/apoderado/hijos'
  }

  // Profesores del curso, para saber con quién conversar.
  const { data: teaching } = data.course
    ? await db.from('teacher_assignments').select('teacher_id, subjects(name)').eq('course_id', data.course.id)
    : { data: [] }
  const T = (teaching ?? []) as unknown as { teacher_id: string; subjects: { name: string } | null }[]
  const teacherNames = await nameMap(db, T.map(t => t.teacher_id))
  const teachers = [...new Set(T.map(t => t.teacher_id))].map(id => ({ id, name: teacherNames.get(id) ?? 'Docente', subjects: T.filter(t => t.teacher_id === id).map(t => t.subjects?.name).filter(Boolean).join(' · ') }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))

  const pending = pendingOf(data)
  const late = pending.filter(t => t.state === 'late').length
  const upcoming = data.tasks.filter(t => t.state === 'pending' || t.state === 'upcoming').sort((a, b) => a.dueAt.localeCompare(b.dueAt))
  const recent = data.tasks.filter(t => t.grade).sort((a, b) => b.grade!.gradedAt.localeCompare(a.grade!.gradedAt)).slice(0, 5)
  const absences = data.attendance.filter(a => a.status === 'absent').length
  const name = firstName(pupil.name)
  const plain = plainSummary(data)
  const tabs = [['resumen', 'Lo principal', null], ['tareas', 'Tareas y pruebas', data.tasks.length], ['notas', 'Todas sus notas', data.tasks.filter(t => t.grade).length], ['asistencia', 'Asistencia día a día', null]] as const

  return (
    <>
      <PageHeader title="Seguimiento escolar" description={`Notas, asistencia y tareas de ${firstName(pupil.name)}.${pupils.length > 1 ? ' Para ver a otro estudiante, cámbialo en la barra de arriba.' : ''}`} />

      {/* Portada del estudiante elegido */}
      <Reveal key={pupil.id} className="relative mb-4 overflow-hidden rounded-v-lg text-white shadow-v">
        <div className="relative p-6 sm:p-7" style={{ background: COVERS[index % COVERS.length] }}>
          <span aria-hidden className="pointer-events-none absolute -right-12 -top-20 size-64 rounded-full bg-white/15" />
          <span aria-hidden className="pointer-events-none absolute -bottom-24 right-40 size-56 rounded-full bg-white/10" />
          <div className="relative flex flex-wrap items-center gap-5">
            <span className="rounded-full ring-4 ring-white/40"><Avatar name={pupil.name} size={76} id={pupil.id} /></span>
            <div className="min-w-0 flex-1 basis-64">
              <h2 className="v-display text-[1.9rem] font-bold leading-tight tracking-tight">{pupil.name}</h2>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-white/90">
                <span className="inline-flex items-center gap-1.5"><GraduationCap size={15} />{data.course?.name ?? 'Sin curso asignado'}</span>
                <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-[12px] font-semibold">Eres su {pupil.relationship}</span>
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={`/apoderado/aria?s=${pupil.id}`} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-white px-4 text-[13.5px] font-semibold text-[#0b3b8f] shadow-v hover:bg-white/90"><Sparkles size={15} />Preguntar a ARIA</Link>
              <Link href="/apoderado/mensajes" className="inline-flex h-10 items-center gap-1.5 rounded-full bg-white/20 px-4 text-[13.5px] font-semibold hover:bg-white/30"><MessageSquare size={15} />Escribir a un profesor</Link>
            </div>
          </div>
        </div>
        <dl className="grid grid-cols-2 divide-v-border border-x border-b border-v-border bg-v-elevated text-v-text sm:grid-cols-4 sm:divide-x">
          {[
            { icon: <TrendingUp size={17} />, label: 'Promedio general', value: fmtScore(data.overall), hint: 'De 1,0 a 7,0 · se aprueba con 4,0', tone: SCORE_TEXT[scoreTone(data.overall)] },
            { icon: <CalendarCheck size={17} />, label: 'Asistencia', value: fmtPct(data.attendanceRate), hint: absences ? `${absences} ${absences === 1 ? 'inasistencia' : 'inasistencias'}` : 'Sin inasistencias', tone: (data.attendanceRate ?? 100) < 85 ? 'text-[#a16207]' : 'text-v-text' },
            { icon: <ClipboardList size={17} />, label: 'Tareas pendientes', value: String(pending.length), hint: late ? `${late} con plazo vencido` : 'Al día con los plazos', tone: late ? 'text-v-danger' : 'text-v-text' },
            { icon: <CalendarClock size={17} />, label: 'Próxima fecha', value: upcoming[0] ? fmtDate(upcoming[0].dueAt) : '—', hint: upcoming[0] ? `${upcoming[0].kind !== 'tarea' ? `${KIND_LABEL[upcoming[0].kind]}: ` : ''}${upcoming[0].title}` : 'Nada agendado', tone: 'text-v-text' },
          ].map(f => (
            <div key={f.label} className="flex items-center gap-3 px-5 py-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-[30%] bg-v-accent-soft text-v-accent">{f.icon}</span>
              <div className="min-w-0"><dt className="text-[11px] font-semibold uppercase tracking-[0.07em] text-v-subtle">{f.label}</dt>
                <dd className={`v-display truncate text-[1.35rem] font-bold leading-tight ${f.tone}`}>{f.value}</dd><dd className="truncate text-xs text-v-subtle">{f.hint}</dd></div>
            </div>
          ))}
        </dl>
      </Reveal>

      {/* En simple: lo esencial, en frases */}
      <section aria-label="Resumen en palabras simples" className="mb-4 rounded-v-lg border border-v-border bg-v-elevated p-5 shadow-v-xs">
        <h3 className="mb-3 text-[15.5px] font-semibold tracking-tight">¿Cómo va {name}?</h3>
        <ul className="grid gap-2.5 lg:grid-cols-3">
          {plain.map((p, n) => (
            <li key={n} className={`flex items-start gap-2.5 rounded-v-sm px-3.5 py-3 text-[13.5px] leading-relaxed text-v-text ${p.tone === 'ok' ? 'bg-v-success/10' : 'bg-v-warning/15'}`}>
              {p.tone === 'ok' ? <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-[#157a4b]" /> : <AlertCircle size={17} className="mt-0.5 shrink-0 text-[#b45309]" />}{p.text}
            </li>
          ))}
        </ul>
        {plain.some(p => p.tone === 'look') && <p className="mt-3 text-[12.5px] text-v-muted">Si quieres conversar alguno de estos puntos, puedes <Link href="/apoderado/mensajes" className="font-semibold text-v-accent hover:underline">escribirle a su profesor</Link> o <Link href="/apoderado/acompanamiento" className="font-semibold text-v-accent hover:underline">pedir apoyo al equipo de bienestar</Link>.</p>}
      </section>

      <nav aria-label="Vistas" className="mb-4 flex overflow-x-auto rounded-full bg-v-fill p-1">
        {tabs.map(([id, label, count]) => (
          <Link key={id} href={href({ tab: id })} scroll={false}
            className={`flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full px-3 py-2.5 text-[13.5px] font-semibold transition-colors ${tab === id ? 'bg-v-elevated text-v-accent shadow-v' : 'text-v-muted hover:text-v-text'}`}>
            {label}{count != null && <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${tab === id ? 'bg-v-accent-soft text-v-accent' : 'bg-v-border text-v-subtle'}`}>{count}</span>}
          </Link>
        ))}
      </nav>

      {tab === 'resumen' && (
        <div className="space-y-4">
          <div className="grid items-stretch gap-4 lg:grid-cols-2">
            <SubjectAverages data={data} />
            <Card className="flex flex-col">
              <CardHeader icon={<CalendarClock size={15} />} title="Pendientes y próximas fechas" description="Tareas por entregar y evaluaciones agendadas" />
              <TaskList data={data} onlyOpen limit={5} />
            </Card>
          </div>
          <div className="grid items-stretch gap-4 lg:grid-cols-2">
            <Card className="flex flex-col">
              <CardHeader icon={<Star size={15} />} title="Últimas notas" description="Las cinco más recientes"
                actions={recent.length > 0 && <Link href={href({ tab: 'notas' })} scroll={false} className="text-[12.5px] font-semibold text-v-accent hover:underline">Ver todas</Link>} />
              {recent.length === 0 ? <EmptyState aria={8} title="Aún no hay notas" description="Aparecerán aquí cuando los profesores califiquen." /> : (
                <ul className="divide-y divide-v-border">
                  {recent.map(t => (
                    <li key={t.id} className="flex items-center gap-3 px-5 py-3">
                      <span className={`v-display grid size-11 shrink-0 place-items-center rounded-2xl bg-v-fill text-[15px] font-bold ${SCORE_TEXT[scoreTone(t.grade!.score)]}`}>{fmtScore(t.grade!.score)}</span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-[14px] font-semibold text-v-text">{t.title}</span>
                        <span className="block truncate text-[12.5px] text-v-muted">{t.kind !== 'tarea' ? `${KIND_LABEL[t.kind]} · ` : ''}{t.subjectName} · {fmtDate(t.grade!.gradedAt)}</span></span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card className="flex flex-col">
              <CardHeader icon={<GraduationCap size={15} />} title="Sus profesores" description={data.course ? `Quienes le hacen clases en ${data.course.name}` : undefined}
                actions={teachers.length > 0 && <Link href="/apoderado/mensajes" className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-v-accent hover:underline"><MessageSquare size={13} />Escribir</Link>} />
              {teachers.length === 0 ? <EmptyState title="Aún no hay profesores asignados a su curso" /> : (
                <ul className="divide-y divide-v-border">
                  {teachers.map(t => (
                    <li key={t.id} className="flex items-center gap-3 px-5 py-3">
                      <Avatar name={t.name} id={t.id} size={40} />
                      <span className="min-w-0 flex-1"><span className="block truncate text-[14px] font-semibold text-v-text">{t.name}</span><span className="block truncate text-[12.5px] text-v-muted">{t.subjects}</span></span>
                    </li>
                  ))}
                </ul>
              )}
              <Link href="/apoderado/acompanamiento" className="mt-auto flex items-center gap-2.5 border-t border-v-border px-5 py-3 text-[13px] text-v-muted hover:bg-v-fill/60"><HeartHandshake size={16} className="shrink-0 text-v-accent" /><span>¿Algo te preocupa? <span className="font-semibold text-v-accent">Pide apoyo al equipo de bienestar</span></span></Link>
            </Card>
          </div>
        </div>
      )}
      {tab === 'tareas' && <Card><CardHeader title="Tareas y evaluaciones" description={data.course?.name} /><TaskList data={data} /></Card>}
      {tab === 'notas' && <Card><CardHeader title="Calificaciones" description="Con la retroalimentación de cada profesor" /><GradesTable data={data} /></Card>}
      {tab === 'asistencia' && <Card><CardHeader title={`Asistencia: ${fmtPct(data.attendanceRate)}`} description="Últimos registros" /><AttendanceList data={data} /></Card>}

      <p className="mt-4 text-xs text-v-subtle"><Badge>Solo lectura</Badge> <span className="ml-1.5">Ves únicamente a los estudiantes que el colegio vinculó a tu cuenta.</span></p>
    </>
  )
}
