import Link from 'next/link'
import { AlertCircle, CalendarCheck, CalendarX2, CheckCircle2, ChevronLeft, ChevronRight, Clock, FileCheck } from 'lucide-react'
import { requireSession } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { loadStudentAcademics } from '@/lib/data/student'
import { ATTENDANCE_LABEL, fmtPct, todayISO } from '@/lib/format'
import { Card, CardHeader, EmptyState, PageHeader } from '@/components/ui/primitives'
import { Kpi, Ring } from '@/components/ui/motion'

const DAY: Record<string, string> = {
  present: 'bg-v-success/15 text-[#157a4b] ring-v-success/30', late: 'bg-v-warning/20 text-[#a16207] ring-v-warning/40',
  absent: 'bg-v-danger/15 text-v-danger ring-v-danger/30', justified: 'bg-v-fill text-v-muted ring-v-border-strong',
}
const DOT: Record<string, string> = { present: 'bg-v-success', late: 'bg-v-warning', absent: 'bg-v-danger', justified: 'bg-v-border-strong' }
const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie']
const monthName = (ym: string) => new Date(`${ym}-15T12:00:00Z`).toLocaleDateString('es-CL', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const longDay = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
const shift = (ym: string, by: number) => { const d = new Date(`${ym}-15T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + by); return d.toISOString().slice(0, 7) }

export default async function StudentAttendance({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const session = await requireSession('estudiante')
  const sp = await searchParams
  const data = await loadStudentAcademics(await createClient(), session.institutionId, session.userId)
  const A = data.attendance
  const today = todayISO()
  const count = (s: string) => A.filter(a => a.status === s).length
  const statusOf = new Map(A.map(a => [a.date, a.status]))
  const months = [...new Set(A.map(a => a.date.slice(0, 7)))].sort()
  const latest = months[months.length - 1] ?? today.slice(0, 7)
  const month = /^\d{4}-\d{2}$/.test(sp.mes ?? '') ? sp.mes! : latest
  const rate = data.attendanceRate

  // Semanas del mes, de lunes a viernes.
  const first = new Date(`${month}-01T12:00:00Z`)
  const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
  const weeks: (string | null)[][] = []
  let row: (string | null)[] = Array(5).fill(null)
  for (let d = 1; d <= days; d++) {
    const date = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), d, 12))
    const wd = date.getUTCDay()
    if (wd === 0 || wd === 6) continue
    row[wd - 1] = date.toISOString().slice(0, 10)
    if (wd === 5) { weeks.push(row); row = Array(5).fill(null) }
  }
  if (row.some(Boolean)) weeks.push(row)
  const inMonth = A.filter(a => a.date.startsWith(month))
  const missed = A.filter(a => a.status === 'absent' || a.status === 'late' || a.status === 'justified').slice(0, 6)

  return (
    <>
      <PageHeader title="Mi asistencia" description="Los días que viniste, los que faltaste y cómo va tu porcentaje." />

      {A.length === 0 ? <Card><EmptyState aria={4} title="Aún no hay registros de asistencia" description="Aparecerán aquí cuando tus profesores pasen lista." /></Card> : (
        <>
          <div className="mb-4 grid gap-4 lg:grid-cols-[1.25fr_2fr]">
            <div className="flex items-center gap-5 rounded-v-lg border border-v-border bg-v-elevated p-5 shadow-v">
              <Ring value={rate} size={104} label={`Asistencia ${fmtPct(rate)}`} />
              <div className="min-w-0">
                <p className="text-xs font-medium text-v-muted">Mi asistencia</p>
                <p className="v-display text-[2.4rem] font-bold leading-none tracking-tight">{fmtPct(rate)}</p>
                <p className={`mt-2 flex items-start gap-1.5 text-[13px] leading-snug ${(rate ?? 100) < 85 ? 'font-semibold text-[#a16207]' : 'text-[#157a4b]'}`}>
                  {(rate ?? 100) < 85 ? <AlertCircle size={15} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={15} className="mt-0.5 shrink-0" />}
                  {(rate ?? 100) < 85 ? 'Estás bajo el 85 % que en general se pide para pasar de curso.' : 'Vas sobre el 85 % que en general se pide para pasar de curso.'}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Kpi index={0} label="Presente" value={count('present')} hint="días" icon={<CalendarCheck size={18} />} tone="success" />
              <Kpi index={1} label="Atrasos" value={count('late')} hint="cuentan como asistencia" icon={<Clock size={18} />} tone="warning" />
              <Kpi index={2} label="Ausente" value={count('absent')} hint="sin justificar" icon={<CalendarX2 size={18} />} tone="danger" urgent={count('absent') > 0} />
              <Kpi index={3} label="Justificadas" value={count('justified')} hint="no bajan tu porcentaje" icon={<FileCheck size={18} />} />
            </div>
          </div>

          <div className="grid items-start gap-4 lg:grid-cols-[1.7fr_1fr]">
            {/* Calendario del mes */}
            <Card index={2}>
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div>
                  <p className="text-[16px] font-semibold tracking-tight first-letter:uppercase">{monthName(month)}</p>
                  <p className="mt-0.5 text-[12.5px] text-v-muted">{inMonth.length ? `${inMonth.length} ${inMonth.length === 1 ? 'día registrado' : 'días registrados'}` : 'Sin registros este mes'}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Link href={`/estudiante/asistencia?mes=${shift(month, -1)}`} scroll={false} aria-label="Mes anterior" className="grid size-9 place-items-center rounded-full border border-v-border-strong text-v-muted hover:bg-v-fill"><ChevronLeft size={16} /></Link>
                  {month !== latest && <Link href="/estudiante/asistencia" scroll={false} className="rounded-full border border-v-border-strong px-3.5 py-1.5 text-[12.5px] font-semibold text-v-muted hover:bg-v-fill">Último mes</Link>}
                  <Link href={`/estudiante/asistencia?mes=${shift(month, 1)}`} scroll={false} aria-label="Mes siguiente" aria-disabled={month >= today.slice(0, 7)} className="grid size-9 place-items-center rounded-full border border-v-border-strong text-v-muted hover:bg-v-fill aria-disabled:pointer-events-none aria-disabled:opacity-40"><ChevronRight size={16} /></Link>
                </div>
              </div>
              <div className="border-t border-v-border p-5">
                <div className="grid grid-cols-5 gap-2 text-center">
                  {WEEKDAYS.map(d => <p key={d} className="pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-v-subtle">{d}</p>)}
                  {weeks.flatMap((w, i) => w.map((date, j) => {
                    if (!date) return <span key={`${i}-${j}`} />
                    const status = statusOf.get(date)
                    return (
                      <div key={date} title={status ? `${longDay(date)}: ${ATTENDANCE_LABEL[status]}` : longDay(date)}
                        className={`flex h-[68px] flex-col items-center justify-center rounded-v-sm ring-1 ${status ? DAY[status] : 'bg-transparent text-v-subtle ring-v-border'} ${date === today ? 'outline outline-2 outline-offset-2 outline-v-accent' : ''}`}>
                        <span className="v-display text-[17px] font-bold leading-none">{Number(date.slice(8))}</span>
                        <span className="mt-1 text-[10.5px] font-semibold">{status ? ATTENDANCE_LABEL[status] : date > today ? '' : '—'}</span>
                      </div>
                    )
                  }))}
                </div>
                <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-v-muted">
                  {(['present', 'late', 'absent', 'justified'] as const).map(s => <span key={s} className="inline-flex items-center gap-1.5"><span className={`size-2.5 rounded-full ${DOT[s]}`} />{ATTENDANCE_LABEL[s]}</span>)}
                  <span className="text-v-subtle">«—»: ese día no se pasó lista</span>
                </p>
              </div>
            </Card>

            {/* Lo que conviene mirar */}
            <Card index={3} className="flex flex-col">
              <CardHeader icon={<CalendarX2 size={15} />} tone="warning" title="Faltas y atrasos" description="Los más recientes" />
              {missed.length === 0 ? <EmptyState aria={2} title="¡Asistencia completa!" description="No tienes faltas ni atrasos registrados." /> : (
                <ul className="divide-y divide-v-border">
                  {missed.map(a => (
                    <li key={a.date} className="flex items-center gap-3 px-5 py-3">
                      <span className={`size-2.5 shrink-0 rounded-full ${DOT[a.status]}`} />
                      <span className="min-w-0 flex-1 text-[13.5px] text-v-text first-letter:uppercase">{longDay(a.date)}</span>
                      <span className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ring-1 ${DAY[a.status]}`}>{ATTENDANCE_LABEL[a.status]}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-auto border-t border-v-border px-5 py-3 text-xs leading-relaxed text-v-subtle">Presentes y atrasos cuentan como asistencia; los días justificados no entran al cálculo. Si una falta tiene justificación, tu apoderado puede avisar al colegio.</p>
            </Card>
          </div>
        </>
      )}
    </>
  )
}
