const TZ = 'America/Santiago'

const asDate = (v: string | Date) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T12:00:00`) : new Date(v))

export const fmtDate = (v: string | Date | null | undefined) =>
  v ? asDate(v).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ }) : '—'

export const fmtDateShort = (v: string | Date | null | undefined) =>
  v ? asDate(v).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', timeZone: TZ }) : '—'

export const fmtDateTime = (v: string | Date | null | undefined) =>
  v ? asDate(v).toLocaleString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: TZ }) : '—'

/** Nota en escala chilena (1,0 a 7,0) con coma decimal. */
export const fmtScore = (v: number | string | null | undefined) =>
  v == null || v === '' || Number.isNaN(Number(v)) ? '—' : Number(v).toFixed(1).replace('.', ',')

export const fmtPct = (v: number | null | undefined) => (v == null || Number.isNaN(v) ? '—' : `${Math.round(v)}%`)

export const average = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null)

export const PASS_SCORE = 4.0

export const scoreTone = (v: number | null | undefined): 'success' | 'warning' | 'danger' | 'neutral' =>
  v == null ? 'neutral' : v < PASS_SCORE ? 'danger' : v < 5 ? 'warning' : 'success'

/** Valor para <input type="datetime-local"> en hora de Chile. */
export function toLocalInput(v: string | Date) {
  const p = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' }).format(new Date(v))
  return p.replace(' ', 'T')
}

/** Interpreta un datetime-local escrito en hora de Chile y lo devuelve en ISO (UTC). */
export function fromLocalInput(v: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) return null
  const naive = new Date(`${v.slice(0, 16)}:00Z`)
  if (Number.isNaN(naive.getTime())) return null
  const shown = new Date(`${toLocalInput(naive)}:00Z`)
  return new Date(naive.getTime() - (shown.getTime() - naive.getTime())).toISOString()
}

export const todayISO = () => new Intl.DateTimeFormat('sv-SE', { timeZone: TZ }).format(new Date())

export const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('') || '?'

export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? ''

export const ATTENDANCE_LABEL: Record<string, string> = {
  present: 'Presente', absent: 'Ausente', late: 'Atraso', justified: 'Justificado',
}

/** % de asistencia: presentes y atrasos cuentan como asistencia; los justificados no entran al cálculo. */
export function attendanceRate(rows: { status: string }[]) {
  const counted = rows.filter(r => r.status !== 'justified')
  if (counted.length === 0) return null
  return (counted.filter(r => r.status === 'present' || r.status === 'late').length / counted.length) * 100
}
