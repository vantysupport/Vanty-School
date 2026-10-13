import Link from 'next/link'
import { AlarmClock, CalendarClock, CheckCircle2, ClipboardList, FileCheck2, Paperclip, Star } from 'lucide-react'
import { requireSession } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { loadStudentAcademics, TASK_STATE, type StudentTask } from '@/lib/data/student'
import { fmtWeight, KIND_LABEL } from '@/lib/assessments'
import { subjectCover } from '@/lib/subject-colors'
import { daysBetween } from '@/lib/wellbeing'
import { fmtDateTime, fmtScore, scoreTone, todayISO } from '@/lib/format'
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui/primitives'
import { Kpi, Reveal } from '@/components/ui/motion'
import { Pagination } from '@/components/ui/filters'
import { usesSimpleMode } from '@/lib/student-mode'
import { SimpleTasks } from '@/components/student/simple'

type Search = { ver?: string; asignatura?: string; p?: string }
const PAGE_SIZE = 6   // tarjetas por página
const SCORE_TEXT: Record<string, string> = { success: 'text-v-success', warning: 'text-[#a16207]', danger: 'text-v-danger', neutral: 'text-v-text' }
const TODO = new Set(['pending', 'late'])

/** Cuándo vence, dicho como se habla: «Vence mañana», «Venció hace 3 días», «Es en 5 días». */
function due(t: StudentTask, today: string): { text: string; urgent: boolean } {
  const days = daysBetween(today, t.dueAt)
  const exam = t.kind !== 'tarea'
  if (t.state === 'graded' || t.state === 'submitted' || t.state === 'awaiting') return { text: `${exam ? 'Fue el' : 'Vencía el'} ${fmtDateTime(t.dueAt)}`, urgent: false }
  if (days < 0) return { text: `Venció hace ${-days} ${days === -1 ? 'día' : 'días'}`, urgent: true }
  const when = days === 0 ? 'hoy' : days === 1 ? 'mañana' : `en ${days} días`
  return { text: `${exam ? 'Es' : 'Vence'} ${when}`, urgent: days <= 1 }
}

export default async function StudentTasks({ searchParams }: { searchParams: Promise<Search> }) {
  const session = await requireSession('estudiante')
  const sp = await searchParams
  const db = await createClient()
  const data = await loadStudentAcademics(db, session.institutionId, session.userId)
  const today = todayISO()
  if (await usesSimpleMode(db, session)) return <SimpleTasks data={data} today={today} />
  const all = data.tasks
  const todo = all.filter(t => TODO.has(t.state))
  const late = all.filter(t => t.state === 'late')
  const exams = all.filter(t => t.state === 'upcoming')
  const waiting = all.filter(t => t.state === 'submitted' || t.state === 'awaiting')
  const graded = all.filter(t => t.state === 'graded')

  const view = ['hechas', 'notas', 'todas'].includes(sp.ver ?? '') ? sp.ver! : 'porhacer'
  const inView = (t: StudentTask) => view === 'todas' ? true : view === 'porhacer' ? TODO.has(t.state) || t.state === 'upcoming' : view === 'hechas' ? t.state === 'submitted' || t.state === 'awaiting' : t.state === 'graded'
  const subjects = [...new Map(all.map(t => [t.subjectId, t.subjectName])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'))
  const shown = all.filter(t => inView(t) && (!sp.asignatura || t.subjectId === sp.asignatura))
    .sort((a, b) => view === 'porhacer' ? a.dueAt.localeCompare(b.dueAt) : b.dueAt.localeCompare(a.dueAt))
  const href = (patch: Search) => {
    const next = new URLSearchParams()
    for (const [k, v] of Object.entries({ ver: sp.ver, asignatura: sp.asignatura, ...patch })) if (v && !(k === 'ver' && v === 'porhacer')) next.set(k, v)   // al cambiar de vista se vuelve a la página 1
    const q = next.toString()
    return q ? `/estudiante/tareas?${q}` : '/estudiante/tareas'
  }
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE))
  const page = Math.min(pages, Math.max(1, Number(sp.p) || 1))
  const visible = shown.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const views = [['porhacer', 'Por hacer', todo.length + exams.length], ['hechas', 'Entregadas', waiting.length], ['notas', 'Con nota', graded.length], ['todas', 'Todas', all.length]] as const

  return (
    <>
      <PageHeader title="Tareas y pruebas" description={data.course ? `Lo que te han dejado tus profesores en ${data.course.name}.` : 'Lo que te han dejado tus profesores.'} />

      <div className="mb-4 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Kpi index={0} href={href({ ver: 'porhacer', asignatura: undefined })} label="Por entregar" icon={<ClipboardList size={18} />} tone={late.length ? 'danger' : 'accent'} urgent={late.length > 0}
          value={todo.length} hint={late.length ? `${late.length} con el plazo vencido` : todo.length ? 'todas dentro de plazo' : '¡estás al día!'} />
        <Kpi index={1} href={href({ ver: 'porhacer', asignatura: undefined })} label="Pruebas que vienen" icon={<FileCheck2 size={18} />} tone="warning"
          value={exams.length} hint={exams[0] ? `la próxima ${due([...exams].sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0], today).text.toLowerCase()}` : 'ninguna agendada'} />
        <Kpi index={2} href={href({ ver: 'hechas', asignatura: undefined })} label="Esperando nota" icon={<AlarmClock size={18} />} value={waiting.length} hint="entregadas o rendidas" />
        <Kpi index={3} href={href({ ver: 'notas', asignatura: undefined })} label="Mi promedio" icon={<Star size={18} />} tone="success" value={fmtScore(data.overall)} hint={`${graded.length} ${graded.length === 1 ? 'nota' : 'notas'} · se aprueba con 4,0`} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <nav aria-label="Vistas" className="flex min-w-0 flex-1 basis-80 overflow-x-auto rounded-full bg-v-fill p-1">
          {views.map(([id, label, count]) => (
            <Link key={id} href={href({ ver: id })} scroll={false}
              className={`flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full px-3 py-2.5 text-[13.5px] font-semibold transition-colors ${view === id ? 'bg-v-elevated text-v-accent shadow-v' : 'text-v-muted hover:text-v-text'}`}>
              {label}<span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${view === id ? 'bg-v-accent-soft text-v-accent' : 'bg-v-border text-v-subtle'}`}>{count}</span>
            </Link>
          ))}
        </nav>
      </div>
      {subjects.length > 1 && (
        <nav aria-label="Asignatura" className="mb-4 flex flex-wrap gap-2">
          <Link href={href({ asignatura: undefined })} scroll={false} className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold ${!sp.asignatura ? 'border-v-accent/40 bg-v-accent-soft text-v-accent' : 'border-v-border bg-v-elevated text-v-muted hover:text-v-text'}`}>Todas las asignaturas</Link>
          {subjects.map(([id, name]) => (
            <Link key={id} href={href({ asignatura: id })} scroll={false} className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold ${sp.asignatura === id ? 'border-v-accent/40 bg-v-accent-soft text-v-accent' : 'border-v-border bg-v-elevated text-v-muted hover:text-v-text'}`}>
              <span className="size-2.5 rounded-full" style={{ background: subjectCover(id) }} />{name}
            </Link>
          ))}
        </nav>
      )}

      {shown.length === 0 ? (
        <Card><EmptyState aria={2} title={view === 'porhacer' ? '¡Nada pendiente!' : 'No hay nada en esta vista'} description={view === 'porhacer' ? 'No tienes tareas por entregar ni pruebas agendadas.' : 'Prueba con otra vista o asignatura.'} /></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((t, i) => {
            const exam = t.kind !== 'tarea'
            const d = due(t, today)
            return (
              <Reveal key={t.id} index={Math.min(i, 8)}>
                <Link href={`/estudiante/tareas/${t.id}`} className="group flex h-full flex-col overflow-hidden rounded-v-lg border border-v-border bg-v-elevated shadow-v transition-all duration-300 hover:-translate-y-1 hover:shadow-v-lg">
                  <div className="relative flex items-center gap-3 overflow-hidden px-5 py-4 text-white" style={{ background: subjectCover(t.subjectId) }}>
                    <span aria-hidden className="pointer-events-none absolute -right-8 -top-10 size-32 rounded-full bg-white/15" />
                    <span className="relative grid size-10 shrink-0 place-items-center rounded-2xl bg-white/20">{exam ? <FileCheck2 size={19} /> : <ClipboardList size={19} />}</span>
                    <div className="relative min-w-0 flex-1">
                      <p className="truncate text-[12px] font-semibold uppercase tracking-[0.08em] text-white/85">{t.subjectName}</p>
                      <p className="text-[13px] font-semibold">{exam ? KIND_LABEL[t.kind] : 'Tarea'}{t.weight != null ? ` · vale ${fmtWeight(t.weight)}` : ''}</p>
                    </div>
                    {t.grade && <span className="v-display relative grid size-12 shrink-0 place-items-center rounded-2xl bg-white text-[17px] font-bold"><span className={SCORE_TEXT[scoreTone(t.grade.score)]}>{fmtScore(t.grade.score)}</span></span>}
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    <h2 className="text-[16px] font-semibold leading-snug tracking-tight text-v-text group-hover:text-v-accent">{t.title}</h2>
                    {t.topic && <p className="mt-1 text-[12.5px] text-v-muted">{t.topic}</p>}
                    <p className={`mt-3 inline-flex items-center gap-1.5 text-[13px] ${d.urgent ? 'font-semibold text-v-danger' : 'text-v-muted'}`}><CalendarClock size={14} />{d.text}</p>
                    <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4">
                      <Badge tone={TASK_STATE[t.state].tone}>{t.state === 'graded' || t.state === 'submitted' ? <CheckCircle2 size={12} /> : null}{TASK_STATE[t.state].label}</Badge>
                      <span className="inline-flex items-center gap-2 text-[12.5px] font-semibold text-v-accent">{t.attachmentPath && <Paperclip size={13} className="text-v-subtle" />}{TODO.has(t.state) ? 'Entregar' : 'Abrir'} →</span>
                    </div>
                  </div>
                </Link>
              </Reveal>
            )
          })}
        </div>
      )}
      {pages > 1 && <div className="mt-4 rounded-v-lg border border-v-border bg-v-elevated shadow-v-xs"><Pagination page={page} pageSize={PAGE_SIZE} total={shown.length} /></div>}
    </>
  )
}
