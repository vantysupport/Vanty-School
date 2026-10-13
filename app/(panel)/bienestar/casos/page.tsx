import Link from 'next/link'
import { AlarmClock, CalendarClock, ChevronRight, ClipboardList, FolderHeart, FolderPlus, Share2, UserCheck } from 'lucide-react'
import { requireSession } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { listMembers, nameMap } from '@/lib/data/people'
import { openDirectCase } from '@/lib/actions/wellbeing'
import { fmtDate, todayISO } from '@/lib/format'
import { CASE_STATUS, daysBetween, followUp, INTERVENTION_KIND } from '@/lib/wellbeing'
import { CATEGORY_LABEL } from '@/components/shared/wellbeing-request'
import { Avatar, Badge, Card, EmptyState, Field, Input, PageHeader, Select, StatStrip, Textarea } from '@/components/ui/primitives'
import { FormDialog } from '@/components/ui/dialog'
import { SearchBox } from '@/components/ui/filters'
import { Row } from '@/components/ui/motion'
import { fetchAll } from '@/lib/supabase/fetch-all'

type Search = { estado?: string; mios?: string; q?: string }

const STRIPE: Record<string, string> = { danger: 'bg-v-danger', warning: 'bg-v-warning', accent: 'bg-v-accent', neutral: 'bg-v-border-strong', success: 'bg-v-success' }
const TEXT: Record<string, string> = { danger: 'font-semibold text-v-danger', warning: 'font-semibold text-[#a16207]', accent: 'font-semibold text-v-accent', neutral: 'text-v-muted', success: 'text-v-muted' }

export default async function CasesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const session = await requireSession('bienestar')
  const sp = await searchParams
  const db = await createClient()
  // La lista no trae el resumen del caso ni el texto de las intervenciones: eso se lee al abrirlo, y queda auditado.
  const { data } = await db.from('wellbeing_cases').select('id, student_id, responsible_id, status, follow_up_on, created_at, wellbeing_requests(category)')
    .eq('institution_id', session.institutionId).order('created_at', { ascending: false })
  const base = (data ?? []) as unknown as { id: string; student_id: string; responsible_id: string; status: string; follow_up_on: string | null; created_at: string; wellbeing_requests: { category: string } | null }[]
  const studentIds = [...new Set(base.map(c => c.student_id))]
  const [names, { data: enrollments }, { data: interventions }] = await Promise.all([
    nameMap(db, base.flatMap(c => [c.student_id, c.responsible_id])),
    studentIds.length ? db.from('course_enrollments').select('student_id, courses(name)').in('student_id', studentIds).eq('status', 'active') : Promise.resolve({ data: [] }),
    base.length ? db.from('wellbeing_interventions').select('case_id, kind, occurred_on').in('case_id', base.map(c => c.id)).order('occurred_on', { ascending: false }) : Promise.resolve({ data: [] }),
  ])
  // Para registrar un caso por cuenta propia: estudiantes del colegio sin caso activo, agrupados por curso.
  const [students, { data: roster }] = await Promise.all([
    listMembers(db, session.institutionId, ['estudiante']),
    fetchAll((a, b) => db.from('course_enrollments').select('student_id, courses(name)').eq('institution_id', session.institutionId).eq('status', 'active').order('id').range(a, b)),
  ])
  const rosterCourse = new Map(((roster ?? []) as unknown as { student_id: string; courses: { name: string } | null }[]).map(e => [e.student_id, e.courses?.name ?? 'Sin curso']))
  const busy = new Set(base.filter(c => c.status !== 'closed').map(c => c.student_id))
  const groups = new Map<string, { id: string; name: string }[]>()
  for (const s of students.filter(s => s.status === 'active' && !busy.has(s.userId))) {
    const course = rosterCourse.get(s.userId) ?? 'Sin curso'
    groups.set(course, [...(groups.get(course) ?? []), { id: s.userId, name: s.fullName }])
  }
  const courseGroups = [...groups].sort((a, b) => a[0].localeCompare(b[0], 'es', { numeric: true }))

  const courseOf = new Map(((enrollments ?? []) as unknown as { student_id: string; courses: { name: string } | null }[]).map(e => [e.student_id, e.courses?.name ?? null]))
  const today = todayISO()

  const all = base.map(c => {
    const own = (interventions ?? []).filter(i => i.case_id === c.id)
    const active = c.status !== 'closed'
    return {
      id: c.id, studentId: c.student_id, student: names.get(c.student_id) ?? 'Estudiante', course: courseOf.get(c.student_id) ?? null,
      category: c.wellbeing_requests?.category ?? null, status: c.status, active, mine: c.responsible_id === session.userId,
      responsible: names.get(c.responsible_id) ?? '—', openedAt: c.created_at, daysOpen: daysBetween(c.created_at, today),
      interventions: own.length, last: own[0] as { kind: string; occurred_on: string } | undefined, next: followUp(c.follow_up_on, today, !active), followUpOn: c.follow_up_on,
    }
  })
  // Los activos primero y, entre ellos, el seguimiento más próximo o más atrasado; los que no tienen fecha, después.
  all.sort((a, b) => Number(b.active) - Number(a.active) || (a.next.days ?? 9999) - (b.next.days ?? 9999) || b.daysOpen - a.daysOpen)

  const state = sp.estado ?? 'activos'
  const q = (sp.q ?? '').trim().toLowerCase()
  const inState = (c: (typeof all)[number]) => state === 'todos' ? true : state === 'activos' ? c.active : state === 'vencidos' ? c.active && c.next.overdue
    : state === 'semana' ? c.active && c.next.days != null && c.next.days >= 0 && c.next.days <= 7 : c.status === state
  const rows = all.filter(c => inState(c) && (!sp.mios || c.mine) && (!q || [c.student, c.course, c.responsible].some(t => (t ?? '').toLowerCase().includes(q))))

  const active = all.filter(c => c.active)
  const count = (status: string) => all.filter(c => c.status === status).length
  const href = (patch: Search) => {
    const next = new URLSearchParams()
    for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v) next.set(k, v)
    const s = next.toString()
    return s ? `/bienestar/casos?${s}` : '/bienestar/casos'
  }
  const states = [['activos', 'Activos', active.length], ['open', 'Abiertos', count('open')], ['follow_up', 'En seguimiento', count('follow_up')], ['referred', 'Derivados', count('referred')], ['closed', 'Cerrados', count('closed')], ['todos', 'Todos', all.length]] as const
  const special = state === 'vencidos' || state === 'semana'

  return (
    <>
      <PageHeader title="Casos de acompañamiento" description="Los acompañamientos que lleva el equipo. Un caso nace de una solicitud revisada, o lo registras tú directamente."
        actions={
          <FormDialog trigger={<><FolderPlus size={15} />Registrar caso</>} title="Registrar un caso" description="Para un acompañamiento que no llegó como solicitud, o que ya llevabas antes de usar la plataforma. Quedará a tu cargo." action={openDirectCase} submitLabel="Registrar caso" wide>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Estudiante" hint="Solo aparecen quienes no tienen un caso activo.">
                <Select name="student_id" required defaultValue="">
                  <option value="" disabled>Selecciona…</option>
                  {courseGroups.map(([course, list]) => <optgroup key={course} label={course}>{list.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>)}
                </Select>
              </Field>
              <Field label="Ámbito"><Select name="category" defaultValue="otro">{Object.entries(CATEGORY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
            </div>
            <Field label="Resumen del caso" hint="La situación y el foco del acompañamiento, sin diagnósticos.">
              <Textarea name="summary" required minLength={5} maxLength={4000} rows={5} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Acompañamiento iniciado el" hint="Si venía de antes, pon la fecha real de inicio."><Input name="started_on" type="date" defaultValue={today} max={today} /></Field>
              <Field label="Próximo seguimiento" hint="Opcional."><Input name="follow_up_on" type="date" min={today} /></Field>
            </div>
          </FormDialog>
        } />

      <StatStrip items={[
        { label: 'Casos activos', value: active.length, hint: `${active.filter(c => c.mine).length} a tu cargo`, icon: <FolderHeart size={15} />, href: href({ estado: undefined }) },
        { label: 'Seguimiento vencido', value: active.filter(c => c.next.overdue).length, hint: 'ya pasó la fecha', icon: <AlarmClock size={15} />, tone: 'danger', href: href({ estado: 'vencidos' }) },
        { label: 'Seguimientos esta semana', value: active.filter(c => c.next.days != null && c.next.days >= 0 && c.next.days <= 7).length, hint: 'próximos 7 días', icon: <CalendarClock size={15} />, tone: 'warning', href: href({ estado: 'semana' }) },
        { label: 'Derivados', value: count('referred'), hint: 'a un especialista externo', icon: <Share2 size={15} />, tone: 'success', href: href({ estado: 'referred' }) },
      ]} />

      <Card index={2}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div>
            <p className="text-[16px] font-semibold tracking-tight">{state === 'vencidos' ? 'Casos con seguimiento vencido' : state === 'semana' ? 'Seguimientos de los próximos 7 días' : 'Casos'}</p>
            <p className="mt-0.5 text-[12.5px] text-v-muted">{rows.length} de {all.length} · ordenados por el seguimiento más próximo o más atrasado</p>
          </div>
          <SearchBox placeholder="Buscar estudiante o curso" />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-y border-v-border bg-v-fill/40 px-4 py-2.5">
          <nav aria-label="Estado" className="flex flex-wrap gap-1">
            {states.map(([v, l, n]) => (
              <Link key={v} href={href({ estado: v === 'activos' ? undefined : v })} scroll={false}
                className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold ${state === v || (v === 'activos' && special) ? 'v-brand shadow-v-brand' : 'text-v-muted hover:bg-v-fill hover:text-v-text'}`}>
                {l}<span className="opacity-70">{n}</span>
              </Link>
            ))}
          </nav>
          <span className="hidden h-5 w-px bg-v-border lg:block" />
          <Link href={href({ mios: sp.mios ? undefined : '1' })} scroll={false} className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${sp.mios ? 'bg-v-accent-soft text-v-accent' : 'text-v-muted hover:bg-v-fill'}`}><UserCheck size={13} />Solo los míos</Link>
        </div>

        {rows.length === 0 ? (
          <EmptyState aria={3} title={all.length === 0 ? 'Aún no hay casos' : 'Ningún caso coincide'}
            description={all.length === 0 ? 'Un caso se abre desde una solicitud revisada, o con «Registrar caso» si lo llevas por tu cuenta.' : 'Prueba con otro estado o búsqueda.'} />
        ) : (
          <ul className="divide-y divide-v-border">
            {rows.map((c, i) => (
              <Row key={c.id} index={Math.min(i, 10)} className="group relative hover:bg-v-fill/50">
                <span aria-hidden className={`absolute inset-y-3 left-0 w-1 rounded-r-full ${c.active ? STRIPE[c.next.tone] : 'bg-transparent'}`} />
                <Link href={`/bienestar/casos/${c.id}`} className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4">
                  <Avatar name={c.student} id={c.studentId} size={48} />
                  <div className="min-w-0 flex-1 basis-56">
                    <p className="truncate text-[16px] font-semibold tracking-tight group-hover:text-v-accent">{c.student}</p>
                    <p className="mt-0.5 truncate text-[13px] text-v-muted">{c.course ?? 'Sin curso'}{c.category ? ` · ${CATEGORY_LABEL[c.category]}` : ''}</p>
                    <p className="mt-1.5 inline-flex items-center gap-1.5 text-[12.5px] text-v-subtle"><UserCheck size={13} />{c.responsible}{c.mine && <span className="rounded-full bg-v-accent-soft px-2 py-px text-[10.5px] font-semibold text-v-accent">a tu cargo</span>}</p>
                  </div>
                  <dl className="grid shrink-0 basis-[420px] grid-cols-3 gap-4 text-[12.5px]">
                    <div><dt className="text-[11px] font-semibold uppercase tracking-[0.07em] text-v-subtle">Abierto</dt><dd className="mt-1 font-semibold text-v-text">{fmtDate(c.openedAt)}</dd><dd className="text-v-subtle">hace {c.daysOpen} {c.daysOpen === 1 ? 'día' : 'días'}</dd></div>
                    <div><dt className="text-[11px] font-semibold uppercase tracking-[0.07em] text-v-subtle">Intervenciones</dt><dd className="mt-1 inline-flex items-center gap-1.5 font-semibold text-v-text"><ClipboardList size={13} className="text-v-subtle" />{c.interventions}</dd><dd className="truncate text-v-subtle">{c.last ? `${INTERVENTION_KIND[c.last.kind]} · ${fmtDate(c.last.occurred_on)}` : 'Aún ninguna'}</dd></div>
                    <div><dt className="text-[11px] font-semibold uppercase tracking-[0.07em] text-v-subtle">Seguimiento</dt><dd className={`mt-1 ${TEXT[c.next.tone]}`}>{c.next.label}</dd><dd className="text-v-subtle">{c.active && c.followUpOn ? fmtDate(c.followUpOn) : ' '}</dd></div>
                  </dl>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge tone={CASE_STATUS[c.status].tone}>{CASE_STATUS[c.status].label}</Badge>
                    <span className="grid size-9 place-items-center rounded-full bg-v-fill text-v-muted transition-all group-hover:bg-v-accent group-hover:text-white"><ChevronRight size={16} /></span>
                  </div>
                </Link>
              </Row>
            ))}
          </ul>
        )}
        <p className="border-t border-v-border px-5 py-3 text-xs text-v-subtle">La lista no muestra el resumen ni el contenido de las intervenciones: se leen al abrir el caso, y cada apertura queda registrada.</p>
      </Card>
    </>
  )
}
