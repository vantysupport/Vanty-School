import 'server-only'
import { cache } from 'react'
import type { DB } from '@/lib/supabase/server'
import type { Session } from '@/lib/auth/session'

/** Hasta qué curso de enseñanza básica el estudiante ve el panel en «modo simple»:
 *  letra grande, menos cosas por pantalla, palabras de niño y sin porcentajes. Parvularia siempre lo usa. */
export const SIMPLE_MODE_MAX_GRADE = 6

/** Desde qué curso de enseñanza básica el estudiante puede pedirle a ARIA un repaso propio. Antes de eso
 *  solo ve las misiones que preparan sus profesores: todavía escribe poco y no distingue si la IA se equivoca. */
export const ARIA_REVIEW_MIN_GRADE = 3

export function canCreateWithAria(stage: string | null | undefined, gradeName: string | null | undefined): boolean {
  if (stage === 'media') return true
  if (stage !== 'basica') return false
  const number = Number((gradeName ?? '').match(/\d+/)?.[0])
  return Number.isFinite(number) && number >= ARIA_REVIEW_MIN_GRADE
}

export type DisplayMode = 'auto' | 'simple' | 'completo'

export function isSimpleGrade(stage: string | null | undefined, gradeName: string | null | undefined): boolean {
  if (stage === 'parvularia') return true
  if (stage !== 'basica') return false
  const number = Number((gradeName ?? '').match(/\d+/)?.[0])
  return Number.isFinite(number) && number >= 1 && number <= SIMPLE_MODE_MAX_GRADE
}

/** Cómo ve su panel este estudiante: lo que eligió en «Mi perfil» y, si dejó «Automático», lo que corresponde a su curso. */
export const studentDisplay = cache(async (db: DB, session: Session): Promise<{ choice: DisplayMode; byGrade: boolean; simple: boolean; gradeName: string | null; ariaReview: boolean }> => {
  if (session.role !== 'estudiante') return { choice: 'auto', byGrade: false, simple: false, gradeName: null, ariaReview: false }
  const [{ data: profile }, { data: enrollment }] = await Promise.all([
    db.from('profiles').select('display_mode').eq('id', session.userId).maybeSingle(),
    db.from('course_enrollments').select('courses(grade_levels(name, stage))')
      .eq('institution_id', session.institutionId).eq('student_id', session.userId).eq('status', 'active').maybeSingle(),
  ])
  const grade = (enrollment as unknown as { courses: { grade_levels: { name: string; stage: string } | null } | null } | null)?.courses?.grade_levels
  const byGrade = isSimpleGrade(grade?.stage, grade?.name)
  const choice = ((profile?.display_mode as DisplayMode | undefined) ?? 'auto')
  return { choice, byGrade, simple: choice === 'simple' || (choice === 'auto' && byGrade), gradeName: grade?.name ?? null, ariaReview: canCreateWithAria(grade?.stage, grade?.name) }
})

/** ¿Este estudiante usa el modo simple? */
export const usesSimpleMode = async (db: DB, session: Session) => (await studentDisplay(db, session)).simple
