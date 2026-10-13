// Etiquetas y cálculos compartidos por las pantallas de casos de bienestar.
export type Tone = 'accent' | 'success' | 'warning' | 'danger' | 'neutral'

export const CASE_STATUS: Record<string, { label: string; tone: Tone }> = {
  open: { label: 'Abierto', tone: 'accent' },
  follow_up: { label: 'En seguimiento', tone: 'success' },
  referred: { label: 'Derivado', tone: 'warning' },
  closed: { label: 'Cerrado', tone: 'neutral' },
}

export const INTERVENTION_KIND: Record<string, string> = {
  entrevista: 'Entrevista', observacion: 'Observación', reunion_apoderado: 'Reunión con apoderado',
  coordinacion_docente: 'Coordinación con docente', derivacion: 'Derivación', seguimiento: 'Seguimiento',
}

const dayNumber = (iso: string) => Math.round(new Date(`${iso.slice(0, 10)}T12:00:00Z`).getTime() / 86_400_000)

/** Días entre dos fechas (YYYY-MM-DD o ISO): positivo si `to` es posterior a `from`. */
export const daysBetween = (from: string, to: string) => dayNumber(to) - dayNumber(from)

/** Qué tan cerca está el próximo seguimiento de un caso, respecto de hoy. */
export function followUp(date: string | null, today: string, closed = false): { label: string; tone: Tone; overdue: boolean; days: number | null } {
  if (closed) return { label: 'Caso cerrado', tone: 'neutral', overdue: false, days: null }
  if (!date) return { label: 'Sin fecha programada', tone: 'warning', overdue: false, days: null }
  const days = daysBetween(today, date)
  if (days < 0) return { label: `Vencido hace ${-days} ${days === -1 ? 'día' : 'días'}`, tone: 'danger', overdue: true, days }
  if (days === 0) return { label: 'Hoy', tone: 'warning', overdue: false, days }
  if (days === 1) return { label: 'Mañana', tone: 'warning', overdue: false, days }
  return { label: `En ${days} días`, tone: days <= 7 ? 'accent' : 'neutral', overdue: false, days }
}
