import Link from 'next/link'
import { ArrowRight, CalendarCheck, CalendarClock, ClipboardList, FileCheck2, GraduationCap, HeartHandshake, Megaphone, MessageSquare, PartyPopper, Sparkles, Star, TrendingUp } from 'lucide-react'
import { requireSession } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { loadStudentAcademics } from '@/lib/data/student'
import { fmtWeight, KIND_LABEL } from '@/lib/assessments'
import { dueText } from '@/lib/due'
import { subjectCover } from '@/lib/subject-colors'
import { firstName, fmtDate, fmtPct, fmtScore, scoreTone, todayISO } from '@/lib/format'
import { Card, CardHeader, EmptyState, Notice } from '@/components/ui/primitives'
import { Bar, Chip, Hero, Kpi, Reveal } from '@/components/ui/motion'
import { usesSimpleMode } from '@/lib/student-mode'
import { SimpleHome } from '@/components/student/simple'

const SCORE_TEXT: Record<string, string> = { success: 'text-v-success', warning: 'text-[#a16207]', danger: 'text-v-danger', neutral: 'text-v-text' }
const BAR_TONE = { success: 'success', warning: 'warning', danger: 'danger', neutral: 'neutral' } as const

export default async function StudentHome() {
  const session = await requireSession('estudiante')
  const db = await createClient()
  const data = await loadStudentAcademics(db, session.institutionId, session.userId)
  if (await usesSimpleMode(db, session)) return <SimpleHome data={data} name={firstName(session.fullName)} today={todayISO()} />
  // ¿Está en el último grado del colegio, o ya egresó?
  const [{ data: course }, { data: last }, { data: alumnus }, { data: inbox }] = await Promise.all([
    data.course ? db.from('courses').select('grade_level_id, academic_periods(year)').eq('id', data.course.id).maybeSingle() : Promise.resolve({ data: null }),
    db.from('grade_levels').select('id').eq('institution_id', session.institutionId).order('sort_order', { ascending: false }).limit(1).maybeSingle(),
    db.from('alumni').select('graduation_year, last_course').eq('institution_id', session.institutionId).eq('student_id', session.userId).maybeSingle(),
    db.from('conversation_participants').select('last_read_at, conversations(last_message_at)').eq('user_id', session.userId),
  ])
  const finalYear = !!course && course.grade_level_id === last?.id
  const year = (course as unknown as { academic_periods?: { year: number } } | null)?.academic_periods?.year
  const celebration = alumnus
    ? { title: `¡Felicitaciones, ${firstName(session.fullName)}! Eres parte de la Promoción ${alumnus.graduation_year}`, text: `Terminaste tu etapa escolar en ${alumnus.last_course}. ${session.institutionName} te felicita por todo el camino recorrido y te desea lo mejor en lo que viene. Este siempre será tu colegio.` }
    : finalYear ? { title: `¡Felicitaciones, ${firstName(session.fullName)}! Estás en tu último año`, text: `Estás por terminar tu etapa escolar${year ? ` como parte de la Promoción ${year}` : ''}. Todo tu colegio te felicita por haber llegado hasta aquí. ¡Disfruta este cierre y termina con todo!` }
    : null

  const today = todayISO()
  const todo = data.tasks.filter(t => t.state === 'pending' || t.state === 'late').sort((a, b) => a.dueAt.localeCompare(b.dueAt))
  const late = todo.filter(t => t.state === 'late')
  const exams = data.tasks.filter(t => t.state === 'upcoming').sort((a, b) => a.dueAt.localeCompare(b.dueAt))
  const coming = [...todo, ...exams].sort((a, b) => a.dueAt.localeCompare(b.dueAt))
  const urgent = coming[0]
  const recent = data.tasks.filter(t => t.grade).sort((a, b) => b.grade!.gradedAt.localeCompare(a.grade!.gradedAt)).slice(0, 3)
  const unread = ((inbox ?? []) as unknown as { last_read_at: string | null; conversations: { last_message_at: string } | null }[])
    .filter(u => u.conversations && (!u.last_read_at || new Date(u.last_read_at) < new Date(u.conversations.last_message_at))).length

  return (
    <>
      <Hero name={firstName(session.fullName)} subtitle={coming.length ? 'Esto es lo que tienes por delante.' : '¡Estás al día! No tienes nada pendiente.'} chips={<>
        {data.course && <Chip icon={<GraduationCap size={12} />}>{data.course.name}</Chip>}
        {late.length > 0 && <Chip tone="danger" icon={<ClipboardList size={12} />}>{late.length} {late.length === 1 ? 'tarea atrasada' : 'tareas atrasadas'}</Chip>}
        {unread > 0 && <Chip tone="accent" icon={<MessageSquare size={12} />}>{unread} {unread === 1 ? 'mensaje nuevo' : 'mensajes nuevos'} de tus profesores</Chip>}
      </>} />

      {celebration && (
        <Reveal className="relative mb-4 overflow-hidden rounded-v border border-v-success/30 bg-v-elevated shadow-v">
          <span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(36rem 12rem at 0% 0%, rgba(31,174,107,0.16), transparent 70%), radial-gradient(28rem 12rem at 100% 100%, var(--v-glow-1), transparent 70%)' }} />
          <div className="relative flex flex-wrap items-center gap-4 p-5 sm:p-6">
            <span className="v-float grid size-14 shrink-0 place-items-center rounded-[30%] bg-v-success/15 text-v-success"><PartyPopper size={26} /></span>
            <div className="min-w-0 flex-1">
              <p className="v-headline text-[1.25rem] leading-tight">{celebration.title}</p>
              <p className="mt-1.5 max-w-3xl text-[14px] leading-relaxed text-v-muted">{celebration.text}</p>
            </div>
          </div>
        </Reveal>
      )}
      {!data.course && !alumnus && <div className="mb-4"><Notice tone="warning">Aún no tienes un curso asignado. Avisa en la secretaría de tu colegio.</Notice></div>}

      {/* Lo primero que hay que hacer */}
      {urgent && (
        <Reveal className="relative mb-4 overflow-hidden rounded-v-lg text-white shadow-v">
          <Link href={`/estudiante/tareas/${urgent.id}`} className="relative flex flex-wrap items-center gap-4 p-5 sm:p-6" style={{ background: subjectCover(urgent.subjectId) }}>
            <span aria-hidden className="pointer-events-none absolute -right-10 -top-16 size-56 rounded-full bg-white/15" />
            <span className="relative grid size-14 shrink-0 place-items-center rounded-2xl bg-white/20">{urgent.kind !== 'tarea' ? <FileCheck2 size={26} /> : <ClipboardList size={26} />}</span>
            <div className="relative min-w-0 flex-1 basis-64">
              <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-white/85">{urgent.state === 'late' ? 'Lo más atrasado' : 'Lo que viene primero'} · {urgent.subjectName}</p>
              <p className="v-display mt-0.5 text-[1.5rem] font-bold leading-tight tracking-tight">{urgent.title}</p>
              <p className="mt-1 inline-flex flex-wrap items-center gap-x-2 text-[14px] text-white/90"><CalendarClock size={15} />{dueText(urgent, today).text}{urgent.kind !== 'tarea' ? ` · ${KIND_LABEL[urgent.kind]}` : ''}{urgent.weight != null ? ` · vale ${fmtWeight(urgent.weight)}` : ''}</p>
            </div>
            <span className="relative inline-flex h-11 items-center gap-2 rounded-full bg-white px-6 text-[14px] font-semibold text-[#0b3b8f] shadow-v">{urgent.kind !== 'tarea' ? 'Ver la prueba' : 'Entregar'}<ArrowRight size={15} /></span>
          </Link>
        </Reveal>
      )}

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Kpi index={0} href="/estudiante/tareas" label="Por entregar" icon={<ClipboardList size={18} />} tone={late.length ? 'danger' : 'accent'} urgent={late.length > 0}
          value={todo.length} hint={late.length ? `${late.length} con el plazo vencido` : todo.length ? 'todas dentro de plazo' : '¡al día!'} />
        <Kpi index={1} href="/estudiante/tareas" label="Pruebas que vienen" icon={<FileCheck2 size={18} />} tone="warning" value={exams.length} hint={exams[0] ? `la próxima ${dueText(exams[0], today).text.toLowerCase()}` : 'ninguna agendada'} />
        <Kpi index={2} href="/estudiante/notas" label="Mi promedio" icon={<TrendingUp size={18} />} tone={scoreTone(data.overall) === 'danger' ? 'danger' : 'success'} value={fmtScore(data.overall)} hint="se aprueba con 4,0" />
        <Kpi index={3} href="/estudiante/asistencia" label="Mi asistencia" icon={<CalendarCheck size={18} />} tone={(data.attendanceRate ?? 100) < 85 ? 'warning' : 'success'} urgent={(data.attendanceRate ?? 100) < 85}
          value={fmtPct(data.attendanceRate)} hint={(data.attendanceRate ?? 100) < 85 ? 'bajo el 85 %' : 'sobre el 85 %'} />
      </div>

      <div className="mt-4 grid items-stretch gap-4 lg:grid-cols-2">
        <Card className="flex flex-col">
          <CardHeader icon={<CalendarClock size={15} />} title="Lo que viene" description="Tareas por entregar y pruebas agendadas"
            actions={<Link href="/estudiante/tareas" className="flex items-center gap-1 text-[12.5px] font-semibold text-v-accent hover:underline">Ver todas <ArrowRight size={13} /></Link>} />
          {coming.length === 0 ? <EmptyState aria={2} title="¡Nada pendiente!" description="No tienes tareas por entregar ni pruebas agendadas." /> : (
            <ul className="divide-y divide-v-border">
              {coming.slice(0, 5).map(t => {
                const d = dueText(t, today)
                return (
                  <li key={t.id}>
                    <Link href={`/estudiante/tareas/${t.id}`} className="group flex items-center gap-3 px-5 py-3.5 hover:bg-v-fill/60">
                      <span className="grid size-10 shrink-0 place-items-center rounded-2xl text-white" style={{ background: subjectCover(t.subjectId) }}>{t.kind !== 'tarea' ? <FileCheck2 size={18} /> : <ClipboardList size={18} />}</span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-[14.5px] font-semibold text-v-text group-hover:text-v-accent">{t.title}</span>
                        <span className="block truncate text-[12.5px] text-v-muted">{t.subjectName}{t.kind !== 'tarea' ? ` · ${KIND_LABEL[t.kind]}` : ''}</span></span>
                      <span className={`shrink-0 text-[12.5px] ${d.urgent ? 'font-semibold text-v-danger' : 'text-v-muted'}`}>{d.text}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        <Card className="flex flex-col" index={2}>
          <CardHeader icon={<TrendingUp size={15} />} title="Mis asignaturas" description="Tu promedio en cada una"
            actions={<Link href="/estudiante/notas" className="flex items-center gap-1 text-[12.5px] font-semibold text-v-accent hover:underline">Mis notas <ArrowRight size={13} /></Link>} />
          {data.subjects.length === 0 ? <EmptyState aria={8} title="Aún no tienes notas" description="Aparecerán aquí cuando tus profesores califiquen." /> : (
            <ul className="space-y-4 px-5 pb-5 pt-1">
              {data.subjects.map((s, i) => {
                const tone = scoreTone(s.average)
                return (
                  <li key={s.subjectId}>
                    <Link href={`/estudiante/notas?asignatura=${s.subjectId}`} className="group block">
                      <span className="mb-1.5 flex items-center justify-between gap-3 text-[13.5px]">
                        <span className="inline-flex min-w-0 items-center gap-2 font-medium text-v-text group-hover:text-v-accent"><span className="size-2.5 shrink-0 rounded-full" style={{ background: subjectCover(s.subjectId) }} /><span className="truncate">{s.subjectName}</span></span>
                        <span className={`v-display text-[16px] font-bold ${SCORE_TEXT[tone]}`}>{fmtScore(s.average)}</span>
                      </span>
                      <Bar value={(((s.average ?? 1) - 1) / 6) * 100} tone={BAR_TONE[tone]} delay={0.2 + i * 0.05} />
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-4 grid items-stretch gap-4 lg:grid-cols-3">
        <Card className="flex flex-col" index={3}>
          <CardHeader icon={<Star size={15} />} title="Últimas notas" description="Y lo que te dijeron" />
          {recent.length === 0 ? <p className="px-5 pb-5 text-[13.5px] text-v-muted">Todavía no tienes notas.</p> : (
            <ul className="divide-y divide-v-border">
              {recent.map(t => (
                <li key={t.id}><Link href={`/estudiante/tareas/${t.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-v-fill/60">
                  <span className={`v-display grid size-11 shrink-0 place-items-center rounded-2xl bg-v-fill text-[15px] font-bold ${SCORE_TEXT[scoreTone(t.grade!.score)]}`}>{fmtScore(t.grade!.score)}</span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-[14px] font-semibold text-v-text">{t.title}</span>
                    <span className="block truncate text-[12.5px] text-v-muted">{t.grade!.feedback || `${t.subjectName} · ${fmtDate(t.grade!.gradedAt)}`}</span></span>
                </Link></li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="flex flex-col" index={4}>
          <CardHeader icon={<MessageSquare size={15} />} title="Mensajes" description="De tus profesores" />
          <div className="flex flex-1 flex-col px-5 pb-5">
            <p className="v-display text-[2.2rem] font-bold leading-none">{unread}</p>
            <p className="mt-1.5 text-[13.5px] text-v-muted">{unread ? `${unread === 1 ? 'conversación' : 'conversaciones'} con mensajes nuevos` : 'No tienes mensajes sin leer.'}</p>
            <p className="mt-2 text-xs text-v-subtle">Tu apoderado también ve estas conversaciones.</p>
            <Link href="/estudiante/mensajes" className="mt-auto inline-flex items-center gap-1.5 pt-4 text-[13px] font-semibold text-v-accent hover:underline">Abrir mensajes <ArrowRight size={14} /></Link>
          </div>
        </Card>

        <Card className="flex flex-col" index={5}>
          <CardHeader icon={<Sparkles size={15} />} title="¿Qué necesitas?" description="Accesos directos" />
          <div className="grid flex-1 content-start gap-2 px-5 pb-5">
            {[
              { href: '/estudiante/bienestar', icon: <HeartHandshake size={17} />, label: 'Pedir apoyo', hint: 'Conversar con el equipo de bienestar' },
              { href: '/estudiante/evaluacion', icon: <Star size={17} />, label: 'Evaluar mis clases', hint: 'Tu opinión es anónima' },
              { href: '/estudiante/comunicados', icon: <Megaphone size={17} />, label: 'Comunidad', hint: 'Novedades del colegio y tu curso' },
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
