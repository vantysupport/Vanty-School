import Link from 'next/link'
import { AlertCircle, ArrowRight, CalendarCheck, CalendarClock, CheckCircle2, ClipboardList, HeartHandshake, Megaphone, MessageSquare, Sparkles, Star, TrendingUp, Users } from 'lucide-react'
import { requireSession } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { activePupil } from '@/lib/data/guardian'
import { loadStudentAcademics } from '@/lib/data/student'
import { plainSummary } from '@/lib/guardian-summary'
import { KIND_LABEL } from '@/lib/assessments'
import { firstName, fmtDate, fmtPct, fmtScore, scoreTone } from '@/lib/format'
import { REQUEST_STATUS } from '@/components/shared/wellbeing-request'
import { Badge, Card, CardHeader, EmptyState } from '@/components/ui/primitives'
import { Chip, Hero, Kpi } from '@/components/ui/motion'
import { TaskList } from '@/components/shared/academics'

const SCORE_TEXT: Record<string, string> = { success: 'text-v-success', warning: 'text-[#a16207]', danger: 'text-v-danger', neutral: 'text-v-text' }

export default async function GuardianHome() {
  const session = await requireSession('apoderado')
  const db = await createClient()
  const { pupils, pupil } = await activePupil(db, session)
  if (!pupil) {
    return (
      <>
        <Hero name={firstName(session.fullName)} subtitle="Novedades del colegio." />
        <Card><EmptyState aria={4} title="Aún no tienes estudiantes vinculados" description="La secretaría del colegio debe vincular tu cuenta con tus pupilos." /></Card>
      </>
    )
  }
  const inst = session.institutionId
  const name = firstName(pupil.name)
  // Todo el inicio es sobre el estudiante elegido en la barra superior.
  const [data, { data: inbox }, { data: forms }, { data: requests }] = await Promise.all([
    loadStudentAcademics(db, inst, pupil.id),
    db.from('conversation_participants').select('last_read_at, conversations(student_id, last_message_at)').eq('user_id', session.userId),
    db.from('assessment_requests').select('id, title').eq('institution_id', inst).eq('guardian_id', session.userId).eq('student_id', pupil.id).eq('status', 'pending').order('created_at'),
    db.from('wellbeing_requests').select('id, category, status, created_at').eq('institution_id', inst).eq('requested_by', session.userId).eq('student_id', pupil.id).neq('status', 'closed').order('created_at', { ascending: false }),
  ])
  const { data: announcements } = await db.from('announcements').select('id, title, published_at, course_id, courses(name)').eq('institution_id', inst).order('published_at', { ascending: false }).limit(12)
  // Comunicados del colegio y del curso de este estudiante (no los de cursos de sus hermanos).
  const news = ((announcements ?? []) as unknown as { id: string; title: string; published_at: string; course_id: string | null; courses: { name: string } | null }[])
    .filter(a => !a.course_id || a.course_id === data.course?.id).slice(0, 4)
  const unread = ((inbox ?? []) as unknown as { last_read_at: string | null; conversations: { student_id: string | null; last_message_at: string } | null }[])
    .filter(u => u.conversations && u.conversations.student_id === pupil.id && (!u.last_read_at || new Date(u.last_read_at) < new Date(u.conversations.last_message_at))).length

  const pending = data.tasks.filter(t => t.state === 'pending' || t.state === 'late')
  const late = pending.filter(t => t.state === 'late').length
  const absences = data.attendance.filter(a => a.status === 'absent').length
  const upcoming = data.tasks.filter(t => t.state === 'pending' || t.state === 'upcoming').sort((a, b) => a.dueAt.localeCompare(b.dueAt))
  const recent = data.tasks.filter(t => t.grade).sort((a, b) => b.grade!.gradedAt.localeCompare(a.grade!.gradedAt)).slice(0, 4)
  const plain = plainSummary(data)
  const R = requests ?? []

  return (
    <>
      <Hero name={firstName(session.fullName)} subtitle={`Así va ${name} hoy.`} chips={<>
        <Chip icon={<Users size={12} />}>{pupil.name} · {data.course?.name ?? 'sin curso'}</Chip>
        {upcoming[0] && <Chip tone="success" icon={<CalendarClock size={12} />}>Próxima fecha: {fmtDate(upcoming[0].dueAt)}</Chip>}
        {pupils.length > 1 && <Chip tone="accent" icon={<ArrowRight size={12} />}>Cambia de estudiante en la barra de arriba</Chip>}
      </>} />

      {(forms ?? []).map(x => (
        <div key={x.id as string} className="v-brand mb-4 flex flex-wrap items-center gap-4 rounded-v-lg p-5 shadow-v-brand">
          <span className="grid size-12 shrink-0 place-items-center rounded-[30%] bg-white/20"><ClipboardList size={22} /></span>
          <div className="min-w-0 flex-1 basis-64">
            <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-white/85">Tienes un cuestionario por responder</p>
            <p className="mt-0.5 text-[17px] font-semibold tracking-tight">{x.title}</p>
            <p className="mt-0.5 text-[13px] text-white/90">Te lo envió el equipo de bienestar sobre {name}. Toma unos minutos.</p>
          </div>
          <Link href={`/apoderado/cuestionarios/${x.id}`} className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-6 text-[14px] font-semibold text-[#0b3b8f] shadow-v hover:bg-white/90">Responder ahora<ArrowRight size={15} /></Link>
        </div>
      ))}

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Kpi index={0} href="/apoderado/hijos?tab=notas" label="Promedio general" icon={<TrendingUp size={18} />} tone={scoreTone(data.overall) === 'danger' ? 'danger' : 'accent'}
          value={fmtScore(data.overall)} hint="De 1,0 a 7,0 · se aprueba con 4,0" />
        <Kpi index={1} href="/apoderado/hijos?tab=asistencia" label="Asistencia" icon={<CalendarCheck size={18} />} tone={(data.attendanceRate ?? 100) < 85 ? 'warning' : 'success'} urgent={(data.attendanceRate ?? 100) < 85}
          value={fmtPct(data.attendanceRate)} hint={absences ? `${absences} ${absences === 1 ? 'inasistencia' : 'inasistencias'}` : 'Sin inasistencias'} />
        <Kpi index={2} href="/apoderado/hijos?tab=tareas" label="Tareas pendientes" icon={<ClipboardList size={18} />} tone={late ? 'danger' : 'accent'} urgent={late > 0}
          value={pending.length} hint={late ? `${late} con plazo vencido` : pending.length ? 'todas dentro de plazo' : 'nada por entregar'} />
        <Kpi index={3} href="/apoderado/mensajes" label="Mensajes sin leer" icon={<MessageSquare size={18} />} tone={unread ? 'warning' : 'success'} urgent={unread > 0}
          value={unread} hint={unread ? `sobre ${name}` : 'nada pendiente'} />
      </div>

      {/* En simple */}
      <section aria-label="Resumen en palabras simples" className="mt-4 rounded-v-lg border border-v-border bg-v-elevated p-5 shadow-v-xs">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[15.5px] font-semibold tracking-tight">¿Cómo va {name}?</h2>
          <Link href="/apoderado/hijos" className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-v-accent hover:underline">Ver seguimiento escolar <ArrowRight size={13} /></Link>
        </div>
        <ul className="grid gap-2.5 lg:grid-cols-3">
          {plain.map((p, n) => (
            <li key={n} className={`flex items-start gap-2.5 rounded-v-sm px-3.5 py-3 text-[13.5px] leading-relaxed text-v-text ${p.tone === 'ok' ? 'bg-v-success/10' : 'bg-v-warning/15'}`}>
              {p.tone === 'ok' ? <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-[#157a4b]" /> : <AlertCircle size={17} className="mt-0.5 shrink-0 text-[#b45309]" />}{p.text}
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-4 grid items-stretch gap-4 lg:grid-cols-2">
        <Card className="flex flex-col">
          <CardHeader icon={<CalendarClock size={15} />} title="Lo que viene" description="Tareas por entregar y pruebas agendadas"
            actions={<Link href="/apoderado/hijos?tab=tareas" className="flex items-center gap-1 text-[12.5px] font-semibold text-v-accent hover:underline">Ver todas <ArrowRight size={13} /></Link>} />
          <TaskList data={data} onlyOpen limit={4} />
        </Card>
        <Card className="flex flex-col" index={2}>
          <CardHeader icon={<Star size={15} />} title="Últimas notas" description="Las más recientes"
            actions={recent.length > 0 && <Link href="/apoderado/hijos?tab=notas" className="flex items-center gap-1 text-[12.5px] font-semibold text-v-accent hover:underline">Ver todas <ArrowRight size={13} /></Link>} />
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
      </div>

      <div className="mt-4 grid items-stretch gap-4 lg:grid-cols-3">
        <Card className="flex flex-col" index={3}>
          <CardHeader icon={<Megaphone size={15} />} title="Novedades del colegio" description={data.course ? `Del colegio y de ${data.course.name}` : 'Del colegio'}
            actions={<Link href="/apoderado/comunicados" className="flex items-center gap-1 text-[12.5px] font-semibold text-v-accent hover:underline">Comunidad <ArrowRight size={13} /></Link>} />
          {news.length === 0 ? <p className="px-5 pb-5 text-[13.5px] text-v-muted">Sin publicaciones recientes.</p> : (
            <ul className="divide-y divide-v-border">
              {news.map(a => (
                <li key={a.id}><Link href="/apoderado/comunicados" className="block px-5 py-3 hover:bg-v-fill/60">
                  <span className="block truncate text-[14px] font-semibold text-v-text">{a.title}</span>
                  <span className="block truncate text-xs text-v-subtle">{a.courses?.name ?? 'Todo el colegio'} · {fmtDate(a.published_at)}</span>
                </Link></li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="flex flex-col" index={4}>
          <CardHeader icon={<HeartHandshake size={15} />} title="Acompañamiento" description={`Tus solicitudes en curso sobre ${name}`} actions={R.length > 0 && <Badge tone="accent">{R.length}</Badge>} />
          {R.length === 0 ? <p className="px-5 pb-5 text-[13.5px] text-v-muted">No tienes solicitudes en curso. Si algo te preocupa, puedes <Link href="/apoderado/acompanamiento" className="font-semibold text-v-accent hover:underline">pedir apoyo al equipo de bienestar</Link>.</p> : (
            <ul className="divide-y divide-v-border">
              {R.slice(0, 3).map(r => (
                <li key={r.id as string}><Link href="/apoderado/acompanamiento" className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-v-fill/60">
                  <span className="min-w-0"><span className="block truncate text-[14px] font-semibold text-v-text">Solicitud de apoyo</span><span className="block text-xs text-v-subtle">Enviada el {fmtDate(r.created_at)}</span></span>
                  <Badge tone={REQUEST_STATUS[r.status as string].tone}>{REQUEST_STATUS[r.status as string].label}</Badge>
                </Link></li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="flex flex-col" index={5}>
          <CardHeader icon={<Sparkles size={15} />} title="¿Qué necesitas?" description={`Sobre ${name}`} />
          <div className="grid flex-1 content-start gap-2 px-5 pb-5">
            {[
              { href: '/apoderado/mensajes', icon: <MessageSquare size={17} />, label: 'Escribir a un profesor', hint: unread ? `${unread} con mensajes nuevos` : 'O solicitar una reunión' },
              { href: '/apoderado/acompanamiento', icon: <HeartHandshake size={17} />, label: 'Pedir apoyo a bienestar', hint: 'Confidencial' },
              { href: '/apoderado/aria', icon: <Sparkles size={17} />, label: 'Preguntar a ARIA', hint: 'Ideas para acompañar desde casa' },
            ].map(a => (
              <Link key={a.label} href={a.href} className="group flex items-center gap-3 rounded-v-sm border border-v-border px-3.5 py-2.5 hover:border-v-accent/50 hover:bg-v-accent-soft/40">
                <span className="grid size-9 shrink-0 place-items-center rounded-[30%] bg-v-accent-soft text-v-accent">{a.icon}</span>
                <span className="min-w-0 flex-1"><span className="block truncate text-[13.5px] font-semibold text-v-text">{a.label}</span><span className="block truncate text-xs text-v-muted">{a.hint}</span></span>
                <ArrowRight size={15} className="shrink-0 text-v-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-v-accent" />
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </>
  )
}
