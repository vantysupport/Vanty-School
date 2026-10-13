import type { StudentTask } from '@/lib/data/student'
import { fmtDateTime } from '@/lib/format'
import { daysBetween } from '@/lib/wellbeing'

/** Cuándo vence una tarea o cuándo es una prueba, dicho como se habla: «Vence mañana», «Venció hace 3 días», «Es en 5 días». */
export function dueText(t: StudentTask, today: string): { text: string; urgent: boolean } {
  const days = daysBetween(today, t.dueAt)
  const exam = t.kind !== 'tarea'
  if (t.state === 'graded' || t.state === 'submitted' || t.state === 'awaiting') return { text: `${exam ? 'Fue el' : 'Vencía el'} ${fmtDateTime(t.dueAt)}`, urgent: false }
  if (days < 0) return { text: `Venció hace ${-days} ${days === -1 ? 'día' : 'días'}`, urgent: true }
  const when = days === 0 ? 'hoy' : days === 1 ? 'mañana' : `en ${days} días`
  return { text: `${exam ? 'Es' : 'Vence'} ${when}`, urgent: days <= 1 }
}
