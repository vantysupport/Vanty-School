// Evaluación mensual de las clases. Las preguntas describen cómo se desarrolla la clase,
// no a la persona: sirven para orientar apoyos y mejoras, no para calificar al docente.

export const FEEDBACK_DIMENSIONS = [
  { key: 'claridad', label: 'Claridad', question: 'Explica de una forma que entiendo' },
  { key: 'ritmo', label: 'Ritmo', question: 'El ritmo de la clase me permite seguirla' },
  { key: 'participacion', label: 'Participación', question: 'Puedo preguntar y participar' },
  { key: 'retroalimentacion', label: 'Retroalimentación', question: 'Me dice cómo mejorar mis trabajos' },
  { key: 'organizacion', label: 'Organización', question: 'La clase es ordenada y aprovecha el tiempo' },
  { key: 'trato', label: 'Trato', question: 'Me siento tratado con respeto' },
] as const

export type FeedbackKey = (typeof FEEDBACK_DIMENSIONS)[number]['key']

export const SCALE = ['Nunca', 'Pocas veces', 'A veces', 'Casi siempre', 'Siempre'] as const

/** Mínimo de respuestas para mostrar promedios: protege el anonimato de quienes responden. Lo aplica la base de datos. */
export const MIN_RESPONSES = 5
/** Los comentarios escritos exigen más: con pocos estudiantes, la forma de escribir puede delatar a quien respondió. */
export const MIN_COMMENT_RESPONSES = 10

/** Aspecto al que apunta una estrategia registrada por el docente. */
export const COMMITMENT_FOCUS = [...FEEDBACK_DIMENSIONS.map(d => ({ key: d.key as string, label: d.label })), { key: 'general', label: 'General' }]
export const COMMITMENT_STATUS: Record<string, { label: string; tone: 'neutral' | 'accent' | 'success' }> = {
  planned: { label: 'Por empezar', tone: 'neutral' }, in_progress: { label: 'En marcha', tone: 'accent' }, done: { label: 'Aplicada', tone: 'success' },
}

export type FeedbackMonth = {
  month: string
  responses: number
  score: number
  dims: Record<FeedbackKey, number>
  comments: string[]
  comments_locked?: boolean   // hay respuestas, pero no las suficientes para mostrar comentarios
  groups: { course_id: string; subject_id: string; responses: number; score: number }[]
}

/** Primer día del mes en curso en hora de Chile (AAAA-MM-01). */
export const currentMonth = () => `${new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Santiago' }).format(new Date()).slice(0, 7)}-01`

export const monthLabel = (iso: string) => {
  const text = new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })
  return text.charAt(0).toUpperCase() + text.slice(1)
}

// ── Alerta para dirección: clases que podrían necesitar apoyo ──
/** Bajo esta evaluación mensual (escala 1 a 5) la clase aparece entre los pendientes de dirección. */
export const FEEDBACK_LOW = 3.5
/** También aparece si bajó esto o más respecto del mes anterior. */
export const FEEDBACK_DROP = 0.5
/** Respuestas mínimas en el mes para avisar: con menos, una o dos opiniones mueven demasiado el promedio. */
export const FEEDBACK_MIN_SAMPLE = 5

export type FeedbackGroupRow = { teacher_id: string; month: string; responses: number; score: number }
export type FeedbackWatch = { teacherId: string; month: string; score: number; previous: number | null; responses: number; low: boolean; dropped: boolean }

/** Docentes cuyas clases quedaron con evaluación baja o cayeron frente al mes anterior. Es una señal para ofrecer
 *  apoyo, no una calificación de la persona: por eso exige una muestra mínima y nunca dispara nada automático. */
export function feedbackWatchlist(rows: FeedbackGroupRow[]): FeedbackWatch[] {
  const months = [...new Set(rows.map(r => r.month.slice(0, 10)))].sort()
  const last = months[months.length - 1], prev = months[months.length - 2]
  if (!last) return []
  const total = (teacher: string, month: string | undefined) => {
    const own = rows.filter(r => r.teacher_id === teacher && r.month.slice(0, 10) === month)
    const n = own.reduce((t, r) => t + r.responses, 0)
    return { n, score: n ? own.reduce((t, r) => t + r.score * r.responses, 0) / n : null }
  }
  return [...new Set(rows.map(r => r.teacher_id))].flatMap(teacherId => {
    const now = total(teacherId, last), before = total(teacherId, prev)
    if (now.score == null || now.n < FEEDBACK_MIN_SAMPLE) return []
    const previous = before.score != null && before.n >= FEEDBACK_MIN_SAMPLE ? before.score : null
    const low = now.score < FEEDBACK_LOW
    const dropped = previous != null && previous - now.score >= FEEDBACK_DROP
    return low || dropped ? [{ teacherId, month: last, score: now.score, previous, responses: now.n, low, dropped }] : []
  }).sort((a, b) => a.score - b.score)
}
