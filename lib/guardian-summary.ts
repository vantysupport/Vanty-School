import type { StudentAcademics } from '@/lib/data/student'
import { fmtPct, fmtScore } from '@/lib/format'

export type PlainLine = { tone: 'ok' | 'look'; text: string }

/** «¿Cómo va?» en tres frases para la familia. Son reglas fijas sobre notas, tareas y asistencia:
 *  no las redacta una IA ni opinan sobre el estudiante. */
export function plainSummary(data: StudentAcademics): PlainLine[] {
  const pending = data.tasks.filter(t => t.state === 'pending' || t.state === 'late')
  const late = pending.filter(t => t.state === 'late').length
  const absences = data.attendance.filter(a => a.status === 'absent').length
  const low = data.subjects.filter(x => x.average != null && x.average < 4).map(x => x.subjectName)
  return [
    data.overall == null ? { tone: 'ok', text: 'Todavía no tiene notas registradas.' }
      : low.length ? { tone: 'look', text: `Tiene promedio bajo 4,0 en ${low.join(' y ')}. Con 4,0 se aprueba.` }
      : { tone: 'ok', text: `Tiene todas sus asignaturas sobre 4,0, la nota con que se aprueba. Su promedio general es ${fmtScore(data.overall)}.` },
    late ? { tone: 'look', text: `Tiene ${late} ${late === 1 ? 'tarea con el plazo vencido' : 'tareas con el plazo vencido'}.` }
      : pending.length ? { tone: 'ok', text: `Tiene ${pending.length} ${pending.length === 1 ? 'tarea por entregar' : 'tareas por entregar'}, todas dentro de plazo.` }
      : { tone: 'ok', text: 'No tiene tareas pendientes.' },
    data.attendanceRate == null ? { tone: 'ok', text: 'Aún no hay registros de asistencia.' }
      : data.attendanceRate < 85 ? { tone: 'look', text: `Ha faltado ${absences} ${absences === 1 ? 'vez' : 'veces'}: su asistencia es de ${fmtPct(data.attendanceRate)}. En general, para pasar de curso se pide al menos 85 %.` }
      : { tone: 'ok', text: `Su asistencia es de ${fmtPct(data.attendanceRate)}${absences ? `, con ${absences} ${absences === 1 ? 'inasistencia' : 'inasistencias'}` : ', sin inasistencias'}.` },
  ]
}
