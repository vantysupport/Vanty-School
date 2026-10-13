// Tipos de actividad calificada. La «tarea» se entrega en la plataforma;
// el resto son evaluaciones que se rinden en clases y solo llevan nota.
export const ASSESSMENT_KINDS = ['tarea', 'prueba', 'examen', 'control', 'exposicion', 'otra'] as const
export type AssessmentKind = (typeof ASSESSMENT_KINDS)[number]

export const KIND_LABEL: Record<string, string> = {
  tarea: 'Tarea', prueba: 'Prueba', examen: 'Examen', control: 'Control', exposicion: 'Exposición', otra: 'Evaluación',
}

export const isEvaluation = (kind: string | null | undefined) => !!kind && kind !== 'tarea'

/** Promedio de una asignatura con ponderaciones opcionales.
 *  Las actividades con porcentaje pesan ese porcentaje; el tramo que queda sin asignar (100 − total) se reparte
 *  en partes iguales entre las que no tienen. Si al estudiante le falta alguna nota, se promedia sobre lo que sí tiene.
 *  `totalWeight` es la suma de porcentajes de todas las actividades de la asignatura, tengan nota o no. */
export function weightedAverage(entries: { score: number; weight: number | null | undefined }[], totalWeight: number): number | null {
  if (entries.length === 0) return null
  const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length
  const plain = entries.filter(e => !e.weight).map(e => e.score)
  const weighted = entries.filter(e => e.weight)
  const rest = Math.max(0, 100 - totalWeight)
  let sum = weighted.reduce((n, e) => n + Number(e.weight) * e.score, 0)
  let total = weighted.reduce((n, e) => n + Number(e.weight), 0)
  if (plain.length && rest > 0) { sum += rest * mean(plain); total += rest }
  return total > 0 ? sum / total : mean(plain)
}

export const fmtWeight = (weight: number | string) => `${Number(weight).toLocaleString('es-CL')} %`
