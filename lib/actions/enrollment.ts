'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { actionContext } from '@/lib/auth/session'
import { audit } from '@/lib/audit'
import { dbError, fail, NOT_ALLOWED, ok, parseForm, type ActionResult } from '@/lib/actions/result'

// Continuidad y cierre de año escolar. Solo administración.
// El cierre lo ejecuta una función de base de datos en una sola transacción: o se aplica completo o no se aplica.

const uuid = z.string().uuid('Identificador inválido.')
const decision = z.enum(['promote', 'repeat', 'leave', 'pending'])
const refresh = () => revalidatePath('/', 'layout')

/** Decisión de continuidad de un estudiante para el año siguiente. */
export async function setContinuity(enrollmentId: string, form: FormData): Promise<ActionResult> {
  const ctx = await actionContext('admin')
  if (!ctx) return NOT_ALLOWED
  const parsed = parseForm(z.object({ continuity: decision }), form)
  if ('error' in parsed) return parsed.error
  const { error, count } = await ctx.db.from('course_enrollments').update({ continuity: parsed.data.continuity }, { count: 'exact' })
    .eq('id', enrollmentId).eq('institution_id', ctx.session.institutionId).eq('status', 'active')
  if (error) return dbError(error)
  if (!count) return fail('La matrícula ya no está activa.')
  refresh()
  return ok('Decisión guardada.')
}

/** Marca como «continúa» a quienes aún no tienen decisión, en un curso o en todo el colegio. */
export async function confirmPending(courseId: string | null): Promise<ActionResult> {
  const ctx = await actionContext('admin')
  if (!ctx) return NOT_ALLOWED
  let query = ctx.db.from('course_enrollments').update({ continuity: 'promote' }, { count: 'exact' })
    .eq('institution_id', ctx.session.institutionId).eq('status', 'active').eq('continuity', 'pending')
  if (courseId) query = query.eq('course_id', courseId)
  const { error, count } = await query
  if (error) return dbError(error)
  refresh()
  return ok(count ? `${count} ${count === 1 ? 'estudiante confirmado' : 'estudiantes confirmados'} para el año siguiente.` : 'No había estudiantes pendientes.')
}

/** Crea el periodo del año siguiente si aún no existe (1 de marzo al 20 de diciembre; las fechas se pueden ajustar después). */
export async function createNextYear(): Promise<ActionResult> {
  const ctx = await actionContext('admin')
  if (!ctx) return NOT_ALLOWED
  const { session, db } = ctx
  const { data: current } = await db.from('academic_periods').select('year').eq('institution_id', session.institutionId).eq('is_current', true).maybeSingle()
  if (!current) return fail('Define primero el periodo vigente en Gestión académica.')
  const year = (current.year as number) + 1
  const { error } = await db.from('academic_periods').insert({ institution_id: session.institutionId, name: 'Año escolar', year, starts_on: `${year}-03-01`, ends_on: `${year}-12-20` })
  if (error) return dbError(error)
  refresh()
  return ok(`Se creó el Año escolar ${year}.`)
}

export async function closeSchoolYear(form: FormData): Promise<ActionResult> {
  const ctx = await actionContext('admin')
  if (!ctx) return NOT_ALLOWED
  const parsed = parseForm(z.object({ target_period_id: uuid, confirm: z.enum(['on'], { errorMap: () => ({ message: 'Confirma que revisaste las decisiones.' }) }) }), form)
  if ('error' in parsed) return parsed.error
  const { data, error } = await ctx.db.rpc('close_school_year', { p_inst: ctx.session.institutionId, p_target: parsed.data.target_period_id })
  if (error) return fail(/decisión|periodo|vigente/i.test(error.message) ? error.message : 'No se pudo cerrar el año. No se aplicó ningún cambio.')
  const r = data as { year: number; next_year: number; promoted: number; retained: number; left: number; graduated: number; courses_created: number }
  refresh()
  return ok(`Año ${r.year} cerrado. ${r.promoted} pasan de grado, ${r.retained} repiten, ${r.left} se retiran y ${r.graduated} egresan como Promoción ${r.year}. ` +
    `Se ${r.courses_created === 1 ? 'creó 1 sección' : `crearon ${r.courses_created} secciones`} para ${r.next_year}; falta asignar sus docentes.`)
}

/** Publica en Comunidad una felicitación para el curso que egresa (la ven sus estudiantes, apoderados y docentes). */
export async function congratulateGraduates(courseId: string): Promise<ActionResult> {
  const ctx = await actionContext('admin')
  if (!ctx) return NOT_ALLOWED
  const { session, db } = ctx
  const { data: course } = await db.from('courses').select('name, academic_periods(year)').eq('id', courseId).eq('institution_id', session.institutionId).maybeSingle()
  if (!course) return fail('Curso no encontrado.')
  const year = (course as unknown as { academic_periods: { year: number } }).academic_periods.year
  const { error } = await db.from('announcements').insert({
    institution_id: session.institutionId, author_id: session.userId, course_id: courseId,
    title: `¡Felicitaciones, Promoción ${year}!`,
    body: `Queridas y queridos estudiantes de ${course.name}:\n\nEstán por terminar su etapa escolar. Toda la comunidad de ${session.institutionName} los felicita por el camino recorrido, por el esfuerzo de cada año y por lo que han aportado a su curso y a su colegio.\n\nLes deseamos lo mejor en lo que viene. Este siempre será su colegio.`,
    audience: ['estudiante', 'apoderado', 'docente'], comment_roles: ['estudiante', 'apoderado', 'docente'], allow_reactions: true,
  })
  if (error) return dbError(error)
  await audit(db, session, { action: 'year.congratulate', entity: 'course', entityId: courseId })
  refresh()
  return ok('Felicitación publicada en Comunidad para el curso.')
}
