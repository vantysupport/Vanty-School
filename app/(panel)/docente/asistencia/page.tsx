import Link from 'next/link'
import { ArrowLeft, ArrowRight, CalendarCheck, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, ClipboardCheck, History, Pencil, Users } from 'lucide-react'
import { requireSession } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { teachingOf, uniqueCourses } from '@/lib/data/teaching'
import { nameMap } from '@/lib/data/people'
import { saveAttendance } from '@/lib/actions/teaching'
import { ATTENDANCE_LABEL, attendanceRate, fmtDate, fmtDateShort, fmtPct, todayISO } from '@/lib/format'
import { Avatar, Badge, Button, Card, EmptyState, Input, PageHeader } from '@/components/ui/primitives'
import { InlineForm, SubmitButton } from '@/components/ui/dialog'
import { Reveal, Stacked } from '@/components/ui/motion'
import { fetchAll } from '@/lib/supabase/fetch-all'

type Search = { curso?: string; fecha?: string; vista?: string }
const OPTIONS = ['present', 'late', 'absent', 'justified'] as const
// Color de cada estado: en los botones para pasar lista y en las casillas del registro.
const CHECKED: Record<string, string> = {
  present: 'has-[:checked]:border-v-success has-[:checked]:bg-v-success has-[:checked]:text-white',
  late: 'has-[:checked]:border-v-warning has-[:checked]:bg-v-warning has-[:checked]:text-white',
  absent: 'has-[:checked]:border-v-danger has-[:checked]:bg-v-danger has-[:checked]:text-white',
  justified: 'has-[:checked]:border-v-muted has-[:checked]:bg-v-muted has-[:checked]:text-white',
}
const CELL: Record<string, { className: string; letter: string }> = {
  present: { className: 'bg-v-success/15 text-[#157a4b]', letter: 'P' }, late: { className: 'bg-v-warning/20 text-[#a16207]', letter: 'A' },
  absent: { className: 'bg-v-danger/15 text-v-danger', letter: 'F' }, justified: { className: 'bg-v-fill text-v-muted', letter: 'J' },
}
const BAR: Record<string, string> = { present: 'bg-v-success', late: 'bg-v-warning', absent: 'bg-v-danger', justified: 'bg-v-subtle' }
const COVERS: Record<string, string[]> = {
  parvularia: ['linear-gradient(135deg,#f59e0b,#f97316)', 'linear-gradient(135deg,#fb923c,#ef4444)'],
  basica: ['linear-gradient(135deg,#01abfc,#0063d8)', 'linear-gradient(135deg,#22c1dc,#0b7fd9)', 'linear-gradient(135deg,#3b82f6,#4338ca)'],
  media: ['linear-gradient(135deg,#6366f1,#7c3aed)', 'linear-gradient(135deg,#0ea5a4,#0369a1)', 'linear-gradient(135deg,#8b5cf6,#c026d3)'],
}
const STAGE: Record<string, string> = { parvularia: 'Educación parvularia', basica: 'Enseñanza básica', media: 'Enseñanza media' }
const shift = (iso: string, days: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10) }
const MAX_DAYS = 14   // columnas del libro de asistencia

export default async function AttendancePage({ searchParams }: { searchParams: Promise<Search> }) {
  const session = await requireSession('docente')
  const sp = await searchParams
  const db = await createClient()
  const ids = uniqueCourses(await teachingOf(db, session)).map(c => c.id)
  const today = todayISO()
  const [{ data: courseRows }, { data: enrollmentRows }, { data: records }] = ids.length ? await Promise.all([
    db.from('courses').select('id, name, section, grade_levels(stage, sort_order)').in('id', ids),
    db.from('course_enrollments').select('course_id, student_id').in('course_id', ids).eq('status', 'active'),
    // Con un curso elegido se trae su año completo; al elegir curso bastan las últimas cinco semanas de todos.
    ids.includes(sp.curso ?? '')
      ? fetchAll((a, b) => db.from('attendance_records').select('course_id, student_id, status, date').eq('course_id', sp.curso!).order('date').order('student_id').range(a, b))
      : fetchAll((a, b) => db.from('attendance_records').select('course_id, student_id, status, date').in('course_id', ids).gte('date', shift(today, -35)).order('date').order('student_id').order('course_id').range(a, b)),
  ]) : [{ data: [] }, { data: [] }, { data: [] }]
  type CourseRow = { id: string; name: string; section: string; grade_levels: { stage: string; sort_order: number } | null }
  const courses = ((courseRows ?? []) as unknown as CourseRow[])
    .sort((a, b) => (a.grade_levels?.sort_order ?? 99) - (b.grade_levels?.sort_order ?? 99) || a.section.localeCompare(b.section, 'es'))
  const cover = (c: CourseRow) => { const p = COVERS[c.grade_levels?.stage ?? 'basica'] ?? COVERS.basica; return p[courses.indexOf(c) % p.length] }
  const R = (records ?? []) as { course_id: string; student_id: string; status: string; date: string }[]
  const course = courses.find(c => c.id === sp.curso)

  // ── Primer paso: elegir el curso ───────────────────────────────────────────
  if (!course) {
    return (
      <>
        <PageHeader title="Asistencia" description="Elige un curso para pasar lista o revisar su registro de asistencia." />
        {courses.length === 0 ? <Card><EmptyState aria={4} title="Aún no tienes cursos asignados" /></Card> : (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {courses.map((c, i) => {
              const own = R.filter(r => r.course_id === c.id)
              const done = own.some(r => r.date === today)
              const students = (enrollmentRows ?? []).filter(e => e.course_id === c.id).length
              return (
                <Reveal key={c.id} index={Math.min(i, 8)}>
                  <Link href={`/docente/asistencia?curso=${c.id}`} className="group block overflow-hidden rounded-v-lg border border-v-border bg-v-elevated shadow-v transition-all duration-300 hover:-translate-y-1 hover:shadow-v-lg">
                    <div className="relative h-36 overflow-hidden p-5 text-white" style={{ background: cover(c) }}>
                      <span aria-hidden className="pointer-events-none absolute -right-10 -top-14 size-48 rounded-full bg-white/15" />
                      <span aria-hidden className="v-display pointer-events-none absolute -bottom-7 right-4 text-[7.5rem] font-extrabold leading-none text-white/20">{c.section}</span>
                      <p className="relative text-[11px] font-semibold uppercase tracking-[0.12em] text-white/85">{STAGE[c.grade_levels?.stage ?? 'basica']}</p>
                      <h2 className="v-display relative mt-1 text-[1.75rem] font-bold leading-tight tracking-tight">{c.name}</h2>
                      <span className={`relative mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-bold shadow-v ${done ? 'bg-white/20 text-white' : 'bg-white text-[#a16207]'}`}>
                        {done ? <><CheckCircle2 size={13} />Lista de hoy pasada</> : 'Falta pasar lista hoy'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 p-5">
                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-semibold text-v-text">Asistencia {fmtPct(attendanceRate(own))}<span className="font-normal text-v-muted"> · {new Set(own.map(r => r.date)).size} días registrados</span></p>
                        <p className="mt-1 inline-flex items-center gap-1.5 text-[13px] text-v-muted"><Users size={14} className="text-v-subtle" />{students} {students === 1 ? 'estudiante' : 'estudiantes'}</p>
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

  // ── Segundo paso: el curso elegido ─────────────────────────────────────────
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.fecha ?? '') && sp.fecha! <= today ? sp.fecha! : today
  const view = sp.vista === 'registros' ? 'registros' : 'lista'
  const own = R.filter(r => r.course_id === course.id)
  const names = await nameMap(db, (enrollmentRows ?? []).filter(e => e.course_id === course.id).map(e => e.student_id as string))
  const students = (enrollmentRows ?? []).filter(e => e.course_id === course.id)
    .map(e => ({ id: e.student_id as string, name: names.get(e.student_id as string) ?? 'Estudiante' })).sort((a, b) => a.name.localeCompare(b.name, 'es'))
  const statusOf = new Map(own.filter(r => r.date === date).map(r => [r.student_id, r.status]))
  const recorded = statusOf.size > 0
  const dates = [...new Set(own.map(r => r.date))].sort()
  const days = [...dates].reverse().map(d => {
    const rows = own.filter(r => r.date === d)
    return { date: d, rows, rate: attendanceRate(rows), counts: Object.fromEntries(OPTIONS.map(o => [o, rows.filter(r => r.status === o).length])) as Record<string, number> }
  })
  const columns = dates.slice(-MAX_DAYS)
  const cell = new Map(own.map(r => [`${r.student_id}:${r.date}`, r.status]))
  const href = (patch: Search) => {
    const next = new URLSearchParams()
    for (const [k, v] of Object.entries({ curso: course.id, vista: sp.vista, fecha: sp.fecha, ...patch })) if (v) next.set(k, v)
    return `/docente/asistencia?${next.toString()}`
  }
  const tab = (on: boolean) => `inline-flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-[13px] font-semibold ${on ? 'v-brand shadow-v-brand' : 'text-v-muted hover:bg-v-fill hover:text-v-text'}`

  return (
    <>
      <Link href="/docente/asistencia" className="mb-3 inline-flex items-center gap-1 text-[12.5px] font-medium text-v-muted hover:text-v-accent"><ArrowLeft size={14} />Todos mis cursos</Link>

      <Reveal className="relative mb-4 overflow-hidden rounded-v-lg text-white shadow-v">
        <div className="relative p-6 sm:p-7" style={{ background: cover(course) }}>
          <span aria-hidden className="pointer-events-none absolute -right-12 -top-20 size-64 rounded-full bg-white/15" />
          <span aria-hidden className="v-display pointer-events-none absolute -bottom-10 right-6 text-[10rem] font-extrabold leading-none text-white/15">{course.section}</span>
          <div className="relative flex flex-wrap items-end justify-between gap-5">
            <div className="min-w-0">
              <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-white/85">Asistencia</p>
              <h1 className="v-display mt-1 text-[2rem] font-bold leading-tight tracking-tight sm:text-[2.3rem]">{course.name}</h1>
              <p className="mt-1 text-[14px] text-white/85">{students.length} estudiantes · {dates.length} {dates.length === 1 ? 'día registrado' : 'días registrados'}</p>
            </div>
            <dl className="flex divide-x divide-white/25 text-center">
              <div className="px-5"><dd className="v-display text-4xl font-bold leading-none tabular-nums">{fmtPct(attendanceRate(own))}</dd><dt className="mt-1.5 text-[12px] text-white/85">Asistencia</dt></div>
              <div className="px-5"><dd className="v-display text-4xl font-bold leading-none tabular-nums">{own.filter(r => r.status === 'absent').length}</dd><dt className="mt-1.5 text-[12px] text-white/85">Ausencias</dt></div>
              <div className="px-5"><dd className="v-display text-4xl font-bold leading-none tabular-nums">{own.filter(r => r.status === 'late').length}</dd><dt className="mt-1.5 text-[12px] text-white/85">Atrasos</dt></div>
            </dl>
          </div>
        </div>
      </Reveal>

      <nav aria-label="Vistas de asistencia" className="mb-4 inline-flex gap-1 rounded-full border border-v-border bg-v-elevated p-1 shadow-v-xs">
        <Link href={href({ vista: undefined })} scroll={false} className={tab(view === 'lista')}><ClipboardCheck size={15} />Pasar lista</Link>
        <Link href={href({ vista: 'registros', fecha: undefined })} scroll={false} className={tab(view === 'registros')}><History size={15} />Registros<span className={`rounded-full px-1.5 text-[11px] ${view === 'registros' ? 'bg-white/25' : 'bg-v-fill text-v-subtle'}`}>{dates.length}</span></Link>
      </nav>

      {/* ── Pasar lista ── */}
      {view === 'lista' && (
        <Card index={2}>
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div className="flex items-center gap-2">
              <Link href={href({ fecha: shift(date, -1) })} scroll={false} aria-label="Día anterior" className="grid size-9 place-items-center rounded-full border border-v-border-strong text-v-muted hover:border-v-accent hover:text-v-accent"><ChevronLeft size={16} /></Link>
              <div className="min-w-[200px] text-center">
                <p className="v-display text-[17px] font-bold capitalize leading-tight">{new Date(`${date}T12:00:00`).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                <p className="text-xs text-v-subtle">{date === today ? 'Hoy' : fmtDate(date)}</p>
              </div>
              {date < today
                ? <Link href={href({ fecha: shift(date, 1) })} scroll={false} aria-label="Día siguiente" className="grid size-9 place-items-center rounded-full border border-v-border-strong text-v-muted hover:border-v-accent hover:text-v-accent"><ChevronRight size={16} /></Link>
                : <span className="size-9" />}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {recorded ? <Badge tone="success"><CheckCircle2 size={11} />Lista ya pasada · puedes corregirla</Badge> : <Badge tone="warning">Sin registro: todos parten presentes</Badge>}
              <form method="get" className="flex items-center gap-2">
                <input type="hidden" name="curso" value={course.id} />
                <Input name="fecha" type="date" defaultValue={date} max={today} aria-label="Ir a una fecha" className="!h-9 !w-auto !py-0" />
                <Button type="submit" variant="secondary" size="sm"><CalendarDays size={13} />Ir</Button>
              </form>
            </div>
          </div>
          {students.length === 0 ? <EmptyState aria={4} title="El curso no tiene estudiantes matriculados" /> : (
            <InlineForm action={saveAttendance} resetOnSuccess={false}>
              <input type="hidden" name="course_id" value={course.id} />
              <input type="hidden" name="date" value={date} />
              <ul className="divide-y divide-v-border border-t border-v-border">
                {students.map((s, i) => (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 px-5 py-3">
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="w-6 shrink-0 text-right text-xs tabular-nums text-v-subtle">{i + 1}</span>
                      <Avatar name={s.name} size={38} id={s.id} />
                      <span className="min-w-0"><span className="block truncate text-[14.5px] font-semibold">{s.name}</span>
                        <span className="text-xs text-v-subtle">Asistencia acumulada {fmtPct(attendanceRate(own.filter(h => h.student_id === s.id)))}</span></span>
                    </span>
                    <fieldset className="flex gap-1.5">
                      <legend className="sr-only">Asistencia de {s.name}</legend>
                      {OPTIONS.map(o => (
                        <label key={o} className={`cursor-pointer rounded-full border border-v-border-strong px-3.5 py-2 text-[13px] font-semibold text-v-muted transition-colors hover:border-v-accent has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-v-accent ${CHECKED[o]}`}>
                          <input type="radio" name={`status:${s.id}`} value={o} defaultChecked={(statusOf.get(s.id) ?? 'present') === o} className="sr-only" />
                          {ATTENDANCE_LABEL[o]}
                        </label>
                      ))}
                    </fieldset>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-v-border px-5 py-4">
                <p className="text-xs text-v-subtle">Presentes y atrasos cuentan como asistencia; los justificados no entran al cálculo.</p>
                <SubmitButton><CalendarCheck size={15} />{recorded ? 'Guardar correcciones' : 'Guardar asistencia'}</SubmitButton>
              </div>
            </InlineForm>
          )}
        </Card>
      )}

      {/* ── Registros ── */}
      {view === 'registros' && (dates.length === 0 ? <Card index={2}><EmptyState aria={8} title="Aún no hay asistencia registrada" description="Cuando pases lista, cada día quedará guardado aquí." /></Card> : (
        <>
          <Card index={2} className="mb-4">
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <p className="text-[15px] font-semibold tracking-tight">Libro de asistencia <span className="font-normal text-v-subtle">· {columns.length === dates.length ? `${dates.length} días` : `últimos ${columns.length} de ${dates.length} días`}</span></p>
              <p className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-v-muted">
                {OPTIONS.map(o => <span key={o} className="inline-flex items-center gap-1.5"><span className={`grid size-5 place-items-center rounded-md text-[10px] font-bold ${CELL[o].className}`}>{CELL[o].letter}</span>{ATTENDANCE_LABEL[o]}</span>)}
              </p>
            </div>
            <div className="overflow-x-auto border-t border-v-border">
              <table className="w-full border-collapse text-left text-[13.5px]">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 border-b border-v-border bg-v-elevated px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-v-subtle">Estudiante</th>
                    {columns.map(d => <th key={d} className="border-b border-v-border bg-v-fill/60 px-1.5 py-2 text-center text-[11px] font-semibold text-v-muted"><Link href={href({ vista: undefined, fecha: d })} className="hover:text-v-accent" title={`Corregir el ${fmtDate(d)}`}>{fmtDateShort(d)}</Link></th>)}
                    <th className="border-b border-v-border bg-v-fill/60 px-4 py-2.5 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-v-subtle">Asistencia</th>
                    <th className="border-b border-v-border bg-v-fill/60 px-4 py-2.5 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-v-subtle">Ausencias</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map(s => {
                    const mine = own.filter(r => r.student_id === s.id)
                    const rate = attendanceRate(mine)
                    return (
                      <tr key={s.id} className="hover:bg-v-fill/50">
                        <td className="sticky left-0 z-10 border-b border-v-border bg-v-elevated px-5 py-2"><span className="flex items-center gap-2.5"><Avatar name={s.name} size={28} id={s.id} /><span className="whitespace-nowrap font-semibold">{s.name}</span></span></td>
                        {columns.map(d => {
                          const status = cell.get(`${s.id}:${d}`)
                          return <td key={d} className="border-b border-v-border px-1.5 py-2 text-center">{status ? <span title={`${fmtDate(d)}: ${ATTENDANCE_LABEL[status]}`} className={`mx-auto grid size-7 place-items-center rounded-lg text-[11px] font-bold ${CELL[status].className}`}>{CELL[status].letter}</span> : <span className="text-v-subtle">·</span>}</td>
                        })}
                        <td className="border-b border-v-border px-4 py-2 text-center"><span className={`v-display font-bold tabular-nums ${rate != null && rate < 85 ? 'text-v-danger' : ''}`}>{fmtPct(rate)}</span></td>
                        <td className="border-b border-v-border px-4 py-2 text-center tabular-nums text-v-muted">{mine.filter(r => r.status === 'absent').length}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <Card index={3}>
            <p className="px-5 py-4 text-[15px] font-semibold tracking-tight">Días registrados <span className="font-normal text-v-subtle">· del más reciente al más antiguo</span></p>
            <ul className="divide-y divide-v-border border-t border-v-border">
              {days.map(d => (
                <li key={d.date}>
                  <Link href={href({ vista: undefined, fecha: d.date })} className="group flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3.5 hover:bg-v-fill/50">
                    <span className="w-44 shrink-0"><span className="block text-[14px] font-semibold capitalize group-hover:text-v-accent">{new Date(`${d.date}T12:00:00`).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'short' })}</span><span className="text-xs text-v-subtle">{d.rows.length} estudiantes</span></span>
                    <span className="min-w-[160px] flex-1"><Stacked height={10} segments={OPTIONS.map(o => ({ label: ATTENDANCE_LABEL[o], value: d.counts[o], className: BAR[o] }))} /></span>
                    <span className="flex shrink-0 gap-4 text-[13px] text-v-muted">
                      <span><span className="font-semibold text-v-text">{d.counts.present}</span> presentes</span>
                      <span className={d.counts.late ? 'font-semibold text-[#a16207]' : ''}>{d.counts.late} atrasos</span>
                      <span className={d.counts.absent ? 'font-semibold text-v-danger' : ''}>{d.counts.absent} ausentes</span>
                      <span>{d.counts.justified} justif.</span>
                    </span>
                    <span className="v-display w-14 shrink-0 text-right text-lg font-bold tabular-nums">{fmtPct(d.rate)}</span>
                    <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-v-accent"><Pencil size={12} />Corregir</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </>
      ))}
    </>
  )
}
