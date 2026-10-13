import Link from 'next/link'
import { ArrowLeft, CalendarClock, MessagesSquare, PenSquare, Users } from 'lucide-react'
import type { Session } from '@/lib/auth/session'
import { createClient, type DB } from '@/lib/supabase/server'
import { nameMap } from '@/lib/data/people'
import { sendMessage, startConversation } from '@/lib/actions/content'
import { fmtDate, todayISO } from '@/lib/format'
import { Avatar, Badge, Card, EmptyState, PageHeader } from '@/components/ui/primitives'
import { FormDialog } from '@/components/ui/dialog'
import { NewMessageFields, type MessageTarget } from '@/components/shared/new-message-fields'
import { ChatComposer, ScrollToEnd } from '@/components/shared/chat-client'
import { fetchAll } from '@/lib/supabase/fetch-all'

/** A quién puede escribir cada perfil y sobre qué estudiante. La base de datos vuelve a validarlo al enviar. */
async function loadTargets(db: DB, session: Session): Promise<MessageTarget[]> {
  const inst = session.institutionId
  if (session.role === 'estudiante') return []   // responde en las conversaciones que le abren; no inicia nuevas
  if (session.role === 'apoderado') {
    const { data: links } = await db.from('guardian_student_links').select('student_id').eq('guardian_id', session.userId).eq('institution_id', inst)
    const studentIds = (links ?? []).map(l => l.student_id as string)
    if (!studentIds.length) return []
    const [{ data: enrollments }, { data: wellbeing }] = await Promise.all([
      db.from('course_enrollments').select('student_id, course_id').in('student_id', studentIds).eq('status', 'active'),
      db.from('institution_memberships').select('user_id').eq('institution_id', inst).eq('role', 'bienestar').eq('status', 'active'),
    ])
    const courseIds = (enrollments ?? []).map(e => e.course_id as string)
    const { data: teaching } = courseIds.length
      ? await db.from('teacher_assignments').select('course_id, teacher_id, subjects(name)').in('course_id', courseIds)
      : { data: [] }
    const T = (teaching ?? []) as unknown as { course_id: string; teacher_id: string; subjects: { name: string } }[]
    const names = await nameMap(db, [...studentIds, ...T.map(t => t.teacher_id), ...(wellbeing ?? []).map(w => w.user_id as string)])
    return studentIds.map(id => {
      const course = (enrollments ?? []).find(e => e.student_id === id)?.course_id
      const byTeacher = new Map<string, string[]>()
      for (const t of T.filter(t => t.course_id === course)) byTeacher.set(t.teacher_id, [...(byTeacher.get(t.teacher_id) ?? []), t.subjects.name])
      return {
        studentId: id, studentName: names.get(id) ?? 'Estudiante',
        recipients: [
          ...[...byTeacher].map(([tid, subjects]) => ({ id: tid, label: `${names.get(tid) ?? 'Docente'} · ${subjects.join(', ')}` })),
          ...(wellbeing ?? []).map(w => ({ id: w.user_id as string, label: `${names.get(w.user_id as string) ?? 'Profesional'} · Bienestar escolar` })),
        ],
      }
    })
  }

  // Docente: sus estudiantes (con copia al apoderado) y los apoderados. Bienestar: apoderados de cualquier estudiante del colegio.
  const { data: links } = await fetchAll((a, b) => db.from('guardian_student_links').select('student_id, guardian_id, relationship').eq('institution_id', inst).order('id').range(a, b))
  const L = (links ?? []) as { student_id: string; guardian_id: string; relationship: string }[]
  const names = await nameMap(db, L.flatMap(l => [l.student_id, l.guardian_id]))
  const byStudent = new Map<string, MessageTarget>()
  for (const l of L) {
    const target = byStudent.get(l.student_id) ?? { studentId: l.student_id, studentName: names.get(l.student_id) ?? 'Estudiante',
      recipients: session.role === 'docente' ? [{ id: l.student_id, label: `${names.get(l.student_id) ?? 'Estudiante'} · estudiante (con copia a su apoderado)` }] : [] }
    target.recipients.push({ id: l.guardian_id, label: `${names.get(l.guardian_id) ?? 'Apoderado'} · ${l.relationship}` })
    byStudent.set(l.student_id, target)
  }
  return [...byStudent.values()].sort((a, b) => a.studentName.localeCompare(b.studentName, 'es'))
}

const DESCRIPTION: Partial<Record<Session['role'], string>> = {
  apoderado: 'Escribe a los profesores de tus pupilos o al equipo de bienestar, o solicita una reunión.',
  docente: 'Conversaciones con tus estudiantes y sus apoderados. Lo que le escribes a un estudiante también lo ve su apoderado.',
  bienestar: 'Conversaciones con los apoderados de los estudiantes.',
  estudiante: 'Mensajes de tus profesores. Tu apoderado también ve estas conversaciones.',
}

const TZ = 'America/Santiago'
const dayKey = (iso: string) => new Intl.DateTimeFormat('sv-SE', { timeZone: TZ }).format(new Date(iso))
const clock = (iso: string) => new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ })
/** Hora si es de hoy, «Ayer», o la fecha corta: como en cualquier mensajería. */
function when(iso: string, today: string) {
  const day = dayKey(iso)
  if (day === today) return clock(iso)
  const yesterday = new Date(`${today}T12:00:00Z`); yesterday.setUTCDate(yesterday.getUTCDate() - 1)
  return day === yesterday.toISOString().slice(0, 10) ? 'Ayer' : new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', timeZone: TZ })
}

export async function MessagesView({ session, basePath, conversationId, preferredStudent }: { session: Session; basePath: string; conversationId?: string; preferredStudent?: string }) {
  const db = await createClient()
  const [{ data: mine }, targets] = await Promise.all([
    db.from('conversation_participants').select('conversation_id, last_read_at').eq('user_id', session.userId),
    loadTargets(db, session),
  ])
  // «Nuevo mensaje» del apoderado es sobre el estudiante que está viendo (lo elige en la barra superior).
  const newTargets = preferredStudent && targets.some(t => t.studentId === preferredStudent) ? targets.filter(t => t.studentId === preferredStudent) : targets
  const ids = (mine ?? []).map(m => m.conversation_id as string)
  const { data: conversations } = ids.length
    ? await db.from('conversations').select('id, subject, kind, student_id, last_message_at').in('id', ids).eq('institution_id', session.institutionId).order('last_message_at', { ascending: false })
    : { data: [] }
  // El apoderado ve las conversaciones del estudiante que eligió en la barra superior; las del otro tienen aviso en esa barra.
  const C = (conversations ?? []).filter(c => !preferredStudent || c.student_id === preferredStudent)
  const active = C.find(c => c.id === conversationId) ?? C[0]
  const opened = !!conversationId && active?.id === conversationId   // en el celular se muestra una cosa a la vez

  const [{ data: participants }, { data: recent }, { data: messages }] = await Promise.all([
    C.length ? db.from('conversation_participants').select('conversation_id, user_id').in('conversation_id', C.map(c => c.id)) : Promise.resolve({ data: [] }),
    C.length ? db.from('messages').select('conversation_id, sender_id, body, created_at').in('conversation_id', C.map(c => c.id)).order('created_at', { ascending: false }).limit(400) : Promise.resolve({ data: [] }),
    active ? db.from('messages').select('id, sender_id, body, created_at').eq('conversation_id', active.id).order('created_at') : Promise.resolve({ data: [] }),
  ])
  const names = await nameMap(db, [...(participants ?? []).map(p => p.user_id as string), ...C.map(c => c.student_id as string)])
  const others = (cid: string) => (participants ?? []).filter(p => p.conversation_id === cid && p.user_id !== session.userId).map(p => ({ id: p.user_id as string, name: names.get(p.user_id as string) ?? 'Usuario' }))
  const lastRead = new Map((mine ?? []).map(m => [m.conversation_id as string, m.last_read_at as string | null]))
  const R = (recent ?? []) as { conversation_id: string; sender_id: string; body: string; created_at: string }[]
  const today = todayISO()
  const rows = C.map(c => {
    const people = others(c.id as string)
    const last = R.find(m => m.conversation_id === c.id)
    const read = lastRead.get(c.id as string)
    const unread = c.id === active?.id ? 0 : R.filter(m => m.conversation_id === c.id && m.sender_id !== session.userId && (!read || new Date(m.created_at) > new Date(read))).length
    return { id: c.id as string, subject: c.subject as string, kind: c.kind as string, student: c.student_id ? names.get(c.student_id as string) ?? null : null,
      withStudent: !!c.student_id && (participants ?? []).some(p => p.conversation_id === c.id && p.user_id === c.student_id),
      person: people[0] ?? { id: '', name: 'Conversación' }, title: people.map(p => p.name).join(', ') || 'Conversación', last, unread, at: c.last_message_at as string }
  })
  const current = rows.find(r => r.id === active?.id)

  // Abrir una conversación la marca como leída.
  if (active) {
    const read = lastRead.get(active.id as string)
    if (!read || new Date(read) < new Date(active.last_message_at as string)) {
      await db.from('conversation_participants').update({ last_read_at: new Date().toISOString() }).eq('conversation_id', active.id).eq('user_id', session.userId)
    }
  }
  const M = (messages ?? []) as { id: string; sender_id: string; body: string; created_at: string }[]
  const pendingTotal = rows.reduce((n, r) => n + r.unread, 0)

  return (
    <>
      <PageHeader title="Mensajes"
        description={DESCRIPTION[session.role] ?? DESCRIPTION.docente}
        actions={targets.length > 0 && (
          <FormDialog trigger={<><PenSquare size={15} />Nuevo mensaje</>} title="Nuevo mensaje" action={startConversation} submitLabel="Enviar" wide>
            <NewMessageFields targets={newTargets} studentLabel={session.role === 'apoderado' ? 'Sobre' : 'Estudiante'} allowMeeting={session.role === 'apoderado'} />
          </FormDialog>
        )} />

      {C.length === 0 ? (
        <Card><EmptyState aria={10} title={preferredStudent && newTargets[0] ? `Aún no tienes conversaciones sobre ${newTargets[0].studentName.split(' ')[0]}` : 'Aún no tienes conversaciones'} description={session.role === 'estudiante' ? 'Cuando un profesor te escriba, lo verás aquí y podrás responderle.' : 'Inicia una con «Nuevo mensaje».'} /></Card>
      ) : (
        <Card className="flex h-[calc(100dvh-16.5rem)] min-h-[480px]">
          {/* Lista de conversaciones */}
          <aside className={`${opened ? 'hidden lg:flex' : 'flex'} w-full shrink-0 flex-col border-v-border lg:w-[340px] lg:border-r`}>
            <div className="flex items-center justify-between gap-2 border-b border-v-border px-5 py-4">
              <p className="text-[15px] font-semibold tracking-tight">Conversaciones</p>
              {pendingTotal > 0 ? <Badge tone="accent">{pendingTotal} sin leer</Badge> : <span className="text-xs text-v-subtle">{rows.length}</span>}
            </div>
            <ul className="flex-1 overflow-y-auto">
              {rows.map(r => {
                const on = r.id === active?.id
                return (
                  <li key={r.id}>
                    <Link href={`${basePath}?c=${r.id}`} scroll={false} aria-current={on ? 'true' : undefined}
                      className={`flex items-start gap-3 border-l-[3px] px-4 py-3.5 ${on ? 'border-v-accent bg-v-accent-soft' : 'border-transparent hover:bg-v-fill/60'}`}>
                      <Avatar name={r.person.name} id={r.person.id || undefined} size={44} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className={`truncate text-[14px] ${r.unread ? 'font-bold' : 'font-semibold'} text-v-text`}>{r.title}</span>
                          <span className={`shrink-0 text-[11px] ${r.unread ? 'font-semibold text-v-accent' : 'text-v-subtle'}`}>{when(r.at, today)}</span>
                        </span>
                        <span className="block truncate text-[12.5px] font-medium text-v-muted">{r.subject}</span>
                        <span className="mt-0.5 flex items-center justify-between gap-2">
                          <span className={`truncate text-[12.5px] ${r.unread ? 'font-semibold text-v-text' : 'text-v-subtle'}`}>{r.last ? `${r.last.sender_id === session.userId ? 'Tú: ' : ''}${r.last.body}` : 'Sin mensajes'}</span>
                          {r.unread > 0 && <span className="v-brand grid h-5 min-w-5 shrink-0 place-items-center rounded-full px-1.5 text-[11px] font-bold">{r.unread}</span>}
                        </span>
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </aside>

          {/* Conversación abierta */}
          {current && (
            <section className={`${opened ? 'flex' : 'hidden lg:flex'} min-w-0 flex-1 flex-col`}>
              <header className="flex items-center gap-3 border-b border-v-border px-4 py-3 sm:px-5">
                <Link href={basePath} scroll={false} aria-label="Volver a las conversaciones" className="grid size-9 shrink-0 place-items-center rounded-full text-v-muted hover:bg-v-fill lg:hidden"><ArrowLeft size={17} /></Link>
                <Avatar name={current.person.name} id={current.person.id || undefined} size={44} />
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-[15.5px] font-semibold tracking-tight">{current.title}</h2>
                  <p className="truncate text-[12.5px] text-v-muted">{current.subject}{current.student && !current.withStudent ? ` · sobre ${current.student}` : ''}</p>
                </div>
                {current.withStudent && <Badge tone="accent"><Users size={12} />{session.role === 'apoderado' ? 'Estás en copia' : 'Con copia al apoderado'}</Badge>}
                {current.kind === 'meeting_request' && <Badge tone="warning"><CalendarClock size={12} />Solicitud de reunión</Badge>}
              </header>

              <div className="flex-1 overflow-y-auto bg-v-fill/40 px-4 py-4 sm:px-6" aria-live="polite">
                {M.length === 0 && <p className="mt-10 flex flex-col items-center gap-2 text-center text-sm text-v-subtle"><MessagesSquare size={22} />Aún no hay mensajes en esta conversación.</p>}
                {M.map((m, i) => {
                  const own = m.sender_id === session.userId
                  const previous = M[i - 1]
                  const newDay = !previous || dayKey(previous.created_at) !== dayKey(m.created_at)
                  const sameSender = !newDay && previous?.sender_id === m.sender_id
                  const day = dayKey(m.created_at)
                  return (
                    <div key={m.id}>
                      {newDay && <p className="my-4 flex justify-center"><span className="rounded-full bg-v-elevated px-3 py-1 text-[11px] font-semibold text-v-muted shadow-v-xs">{day === today ? 'Hoy' : fmtDate(day)}</span></p>}
                      <div className={`flex items-end gap-2 ${own ? 'justify-end' : ''} ${sameSender ? 'mt-1' : 'mt-3'}`}>
                        {!own && (sameSender ? <span className="w-8 shrink-0" /> : <Avatar name={names.get(m.sender_id) ?? '?'} id={m.sender_id} size={32} />)}
                        <div className={`max-w-[78%] px-4 py-2.5 text-[14px] shadow-v-xs ${own ? 'v-brand rounded-[20px_20px_6px_20px]' : 'rounded-[20px_20px_20px_6px] border border-v-border bg-v-elevated text-v-text'}`}>
                          {!own && !sameSender && <p className="mb-0.5 text-[11.5px] font-semibold text-v-accent">{names.get(m.sender_id) ?? 'Usuario'}</p>}
                          <p className="whitespace-pre-wrap break-words leading-relaxed">{m.body}</p>
                          <p className={`mt-1 text-right text-[10.5px] ${own ? 'text-white/75' : 'text-v-subtle'}`}>{clock(m.created_at)}</p>
                        </div>
                      </div>
                    </div>
                  )
                })}
                <ScrollToEnd signal={`${current.id}:${M.length}`} />
              </div>

              <ChatComposer action={sendMessage.bind(null, current.id)} placeholder={`Escribe a ${current.person.name.split(' ')[0]}…`} />
            </section>
          )}
        </Card>
      )}
    </>
  )
}
