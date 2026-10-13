import Link from 'next/link'
import { AlarmClock, ArrowRight, CalendarClock, ClipboardCheck, ClipboardList, FolderHeart, Hourglass, Inbox, Lock, MessageSquare, Send, Sparkles, UserCheck } from 'lucide-react'
import { requireSession } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { nameMap } from '@/lib/data/people'
import { firstName, fmtDate, todayISO } from '@/lib/format'
import { daysBetween, followUp } from '@/lib/wellbeing'
import { CATEGORY_LABEL } from '@/components/shared/wellbeing-request'
import { Avatar, Badge, Card, CardHeader, EmptyState } from '@/components/ui/primitives'
import { Chip, Hero, Kpi } from '@/components/ui/motion'

const PRIORITY_TONE = { baja: 'neutral', media: 'accent', alta: 'warning', urgente: 'danger' } as const
const PRIORITY_RANK: Record<string, number> = { urgente: 0, alta: 1, media: 3, baja: 4 }
const SOURCE: Record<string, string> = { estudiante: 'la pidió el estudiante', apoderado: 'la pidió su apoderado', docente: 'derivación de un docente', bienestar: 'la registró el equipo' }
const FOLLOW_TEXT: Record<string, string> = { danger: 'font-semibold text-v-danger', warning: 'font-semibold text-[#a16207]', accent: 'font-semibold text-v-accent', neutral: 'text-v-muted', success: 'text-v-muted' }
const ago = (days: number) => (days <= 0 ? 'hoy' : days === 1 ? 'ayer' : `hace ${days} días`)
const ROWS = 4

export default async function WellbeingHome() {
  const session = await requireSession('bienestar')
  const db = await createClient()
  const inst = session.institutionId
  const [{ data: requests }, { data: cases }, { data: responses }, { data: sent }, { data: inbox }] = await Promise.all([
    db.from('wellbeing_requests').select('id, student_id, category, source, status, priority, assigned_to, created_at').eq('institution_id', inst).in('status', ['pending', 'in_review']),
    db.from('wellbeing_cases').select('id, student_id, responsible_id, status, follow_up_on').eq('institution_id', inst).neq('status', 'closed'),
    db.from('assessment_responses').select('id, student_id, respondent_id, reviewed_at, created_at, assessment_templates(title)').eq('institution_id', inst).is('reviewed_at', null).order('created_at', { ascending: false }),
    db.from('assessment_requests').select('id, student_id, title, created_at').eq('institution_id', inst).eq('status', 'pending').order('created_at'),
    db.from('conversation_participants').select('last_read_at, conversations(last_message_at)').eq('user_id', session.userId),
  ])
  const R = requests ?? [], C = cases ?? []
  const P = (responses ?? []) as unknown as { id: string; student_id: string; respondent_id: string | null; created_at: string; assessment_templates: { title: string } | null }[]
  const S = sent ?? []
  const names = await nameMap(db, [...R.map(r => r.student_id as string), ...C.map(c => c.student_id as string), ...P.map(p => p.student_id), ...S.map(s => s.student_id as string)])
  const today = todayISO()

  // Solicitudes: lo más urgente y lo que lleva más tiempo esperando, primero.
  const queue = R.map(r => ({
    id: r.id as string, studentId: r.student_id as string, student: names.get(r.student_id as string) ?? 'Estudiante', category: r.category as string, source: r.source as string,
    status: r.status as string, priority: r.priority as keyof typeof PRIORITY_TONE | null, unassigned: !r.assigned_to, days: daysBetween(r.created_at as string, today),
  })).sort((a, b) => (a.priority ? PRIORITY_RANK[a.priority] : 2) - (b.priority ? PRIORITY_RANK[b.priority] : 2) || b.days - a.days)
  // Agenda: seguimientos de los casos activos, del más atrasado al más lejano; los sin fecha, al final.
  const agenda = C.map(c => ({ id: c.id as string, studentId: c.student_id as string, student: names.get(c.student_id as string) ?? 'Estudiante', mine: c.responsible_id === session.userId, date: c.follow_up_on as string | null, next: followUp(c.follow_up_on as string | null, today) }))
    .sort((a, b) => (a.next.days ?? 9999) - (b.next.days ?? 9999))
  const overdue = agenda.filter(a => a.next.overdue).length
  const thisWeek = agenda.filter(a => a.next.days != null && a.next.days >= 0 && a.next.days <= 7).length
  const unread = ((inbox ?? []) as unknown as { last_read_at: string | null; conversations: { last_message_at: string } | null }[])
    .filter(p => p.conversations && (!p.last_read_at || new Date(p.last_read_at) < new Date(p.conversations.last_message_at))).length
  const newRequests = queue.filter(r => r.status === 'pending').length
  const more = (n: number, href: string, label: string) => n > ROWS && <Link href={href} className="mt-auto block border-t border-v-border px-5 py-3 text-center text-[13px] font-semibold text-v-accent hover:bg-v-fill/60">{label}</Link>

  return (
    <>
      <Hero name={firstName(session.fullName)} subtitle="Esto es lo que pide tu atención hoy." chips={<>
        <Chip icon={<FolderHeart size={12} />}>{C.length} {C.length === 1 ? 'caso activo' : 'casos activos'} · {C.filter(c => c.responsible_id === session.userId).length} a tu cargo</Chip>
        {overdue > 0 && <Chip tone="danger" icon={<AlarmClock size={12} />}>{overdue} {overdue === 1 ? 'seguimiento vencido' : 'seguimientos vencidos'}</Chip>}
        {unread > 0 && <Chip tone="accent" icon={<MessageSquare size={12} />}>{unread} {unread === 1 ? 'conversación' : 'conversaciones'} con mensajes nuevos</Chip>}
      </>} />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Kpi index={0} href="/bienestar/solicitudes" label="Solicitudes por atender" icon={<Inbox size={18} />} tone={newRequests ? 'warning' : 'success'} urgent={newRequests > 0}
          value={queue.length} hint={newRequests ? `${newRequests} sin revisar` : queue.length ? 'todas en revisión' : 'bandeja al día'} />
        <Kpi index={1} href="/bienestar/casos" label="Casos activos" icon={<FolderHeart size={18} />} value={C.length} hint={`${C.filter(c => c.status === 'referred').length} derivados`} />
        <Kpi index={2} href={overdue ? '/bienestar/casos?estado=vencidos' : '/bienestar/casos?estado=semana'} label={overdue ? 'Seguimientos vencidos' : 'Seguimientos esta semana'} icon={<CalendarClock size={18} />}
          tone={overdue ? 'danger' : 'accent'} urgent={overdue > 0} value={overdue || thisWeek} hint={overdue ? `y ${thisWeek} en los próximos 7 días` : 'próximos 7 días'} />
        <Kpi index={3} href="/bienestar/evaluaciones?tab=historial&f=porrevisar" label="Evaluaciones por revisar" icon={<ClipboardCheck size={18} />} tone={P.length ? 'warning' : 'success'} urgent={P.length > 0}
          value={P.length} hint={S.length ? `${S.length} ${S.length === 1 ? 'cuestionario espera' : 'cuestionarios esperan'} a la familia` : 'sin envíos pendientes'} />
      </div>

      <div className="mt-4 grid items-stretch gap-4 lg:grid-cols-2">
        {/* Bandeja */}
        <Card className="flex flex-col">
          <CardHeader icon={<Inbox size={15} />} tone="warning" title="Solicitudes por atender" description="Lo más urgente y lo que lleva más tiempo esperando, primero"
            actions={<Link href="/bienestar/solicitudes" className="flex items-center gap-1 text-[12.5px] font-semibold text-v-accent hover:underline">Ver bandeja <ArrowRight size={13} /></Link>} />
          {queue.length === 0 ? <EmptyState aria={2} title="Bandeja al día" description="No hay solicitudes esperando revisión." /> : (
            <ul className="divide-y divide-v-border">
              {queue.slice(0, ROWS).map(r => (
                <li key={r.id}>
                  <Link href={`/bienestar/solicitudes/${r.id}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-v-fill/60">
                    <Avatar name={r.student} id={r.studentId} size={42} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] font-semibold text-v-text">{r.student}</span>
                      <span className="block truncate text-[12.5px] text-v-muted">{CATEGORY_LABEL[r.category]} · {SOURCE[r.source] ?? r.source}</span>
                      <span className={`block text-xs ${r.status === 'pending' && r.days >= 3 ? 'font-semibold text-v-danger' : 'text-v-subtle'}`}>Recibida {ago(r.days)}{r.unassigned ? ' · sin responsable' : ''}</span>
                    </span>
                    {r.priority ? <Badge tone={PRIORITY_TONE[r.priority]}><span className="capitalize">{r.priority}</span></Badge> : <Badge tone="warning">{r.status === 'pending' ? 'Nueva' : 'Sin prioridad'}</Badge>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {more(queue.length, '/bienestar/solicitudes', `Ver las ${queue.length} solicitudes`)}
        </Card>

        {/* Agenda de seguimientos */}
        <Card className="flex flex-col" index={2}>
          <CardHeader icon={<CalendarClock size={15} />} title="Agenda de seguimientos" description="Casos activos, del más atrasado al más lejano"
            actions={<Link href="/bienestar/casos" className="flex items-center gap-1 text-[12.5px] font-semibold text-v-accent hover:underline">Ver casos <ArrowRight size={13} /></Link>} />
          {agenda.length === 0 ? <EmptyState aria={3} title="Sin casos activos" description="Abre uno desde una solicitud o con «Registrar caso»." /> : (
            <ul className="divide-y divide-v-border">
              {agenda.slice(0, ROWS).map(a => (
                <li key={a.id}>
                  <Link href={`/bienestar/casos/${a.id}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-v-fill/60">
                    <Avatar name={a.student} id={a.studentId} size={42} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] font-semibold text-v-text">{a.student}</span>
                      <span className="inline-flex items-center gap-1.5 text-[12.5px] text-v-muted"><UserCheck size={13} className="text-v-subtle" />{a.mine ? 'A tu cargo' : 'De otra persona del equipo'}</span>
                    </span>
                    <span className="shrink-0 text-right"><span className={`block text-[13.5px] ${FOLLOW_TEXT[a.next.tone]}`}>{a.next.label}</span><span className="block text-xs text-v-subtle">{a.date ? fmtDate(a.date) : 'Agenda una fecha'}</span></span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {more(agenda.length, '/bienestar/casos', `Ver los ${agenda.length} casos`)}
        </Card>
      </div>

      <div className="mt-4 grid items-stretch gap-4 lg:grid-cols-3">
        {/* Evaluaciones que esperan lectura profesional */}
        <Card className="flex flex-col" index={3}>
          <CardHeader icon={<ClipboardCheck size={15} />} title="Por revisar" description="Aplicaciones sin tu lectura profesional" actions={P.length > 0 && <Badge tone="warning">{P.length}</Badge>} />
          {P.length === 0 ? <p className="px-5 pb-5 text-[13.5px] text-v-muted">Todo revisado.</p> : (
            <ul className="divide-y divide-v-border">
              {P.slice(0, 3).map(p => (
                <li key={p.id}><Link href="/bienestar/evaluaciones?tab=historial&f=porrevisar" className="block px-5 py-3 hover:bg-v-fill/60">
                  <span className="block truncate text-[14px] font-semibold text-v-text">{names.get(p.student_id) ?? 'Estudiante'}</span>
                  <span className="block truncate text-[12.5px] text-v-muted">{p.assessment_templates?.title ?? 'Instrumento'}</span>
                  <span className="block text-xs text-v-subtle">{p.respondent_id ? 'Respondió la familia' : 'Aplicada por el equipo'} · {fmtDate(p.created_at)}</span>
                </Link></li>
              ))}
            </ul>
          )}
        </Card>

        {/* Cuestionarios enviados a familias */}
        <Card className="flex flex-col" index={4}>
          <CardHeader icon={<Send size={15} />} title="Esperando a la familia" description="Cuestionarios enviados y aún sin responder" actions={S.length > 0 && <Badge tone="accent">{S.length}</Badge>} />
          {S.length === 0 ? <p className="px-5 pb-5 text-[13.5px] text-v-muted">No hay cuestionarios pendientes. Puedes enviar uno desde <Link href="/bienestar/evaluaciones?tab=plantillas" className="font-semibold text-v-accent hover:underline">Plantillas</Link>.</p> : (
            <ul className="divide-y divide-v-border">
              {S.slice(0, 3).map(x => {
                const days = daysBetween(x.created_at as string, today)
                return (
                  <li key={x.id as string}><Link href="/bienestar/evaluaciones?tab=enviados" className="block px-5 py-3 hover:bg-v-fill/60">
                    <span className="block truncate text-[14px] font-semibold text-v-text">{names.get(x.student_id as string) ?? 'Estudiante'}</span>
                    <span className="block truncate text-[12.5px] text-v-muted">{x.title}</span>
                    <span className={`inline-flex items-center gap-1 text-xs ${days >= 7 ? 'font-semibold text-[#a16207]' : 'text-v-subtle'}`}><Hourglass size={11} />Enviado {ago(days)}</span>
                  </Link></li>
                )
              })}
            </ul>
          )}
        </Card>

        {/* Accesos directos */}
        <Card className="flex flex-col" index={5}>
          <CardHeader icon={<Sparkles size={15} />} title="Accesos directos" description="Lo que más se usa" />
          <div className="grid flex-1 content-start gap-2 px-5 pb-5">
            {[
              { href: '/bienestar/casos', icon: <FolderHeart size={17} />, label: 'Registrar un caso', hint: 'Desde la lista de casos' },
              { href: '/bienestar/evaluaciones?tab=plantillas', icon: <ClipboardList size={17} />, label: 'Cuestionarios para la familia', hint: 'Plantillas listas para enviar' },
              { href: '/bienestar/mensajes', icon: <MessageSquare size={17} />, label: 'Mensajes', hint: unread ? `${unread} con novedades` : 'Escribir a un apoderado' },
              { href: '/bienestar/aria', icon: <Sparkles size={17} />, label: 'ARIA Bienestar', hint: 'Pensar un caso en conjunto' },
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

      <p className="mt-4 flex items-center gap-2 text-xs text-v-subtle"><Lock size={13} className="shrink-0" />Información confidencial: solo el equipo de bienestar accede a solicitudes, casos e intervenciones, y cada apertura de un caso queda registrada.</p>
    </>
  )
}
