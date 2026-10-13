'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { actionContext } from '@/lib/auth/session'
import { audit } from '@/lib/audit'
import { dbError, fail, NOT_ALLOWED, ok, parseForm, type ActionResult } from '@/lib/actions/result'

// Estructura del colegio a escala: grados estándar, secciones y plan de asignaturas por curso.
// La gestionan administración y dirección; RLS vuelve a comprobarlo en la base de datos.

const uuid = z.string().uuid('Identificador inválido.')
const refresh = () => revalidatePath('/', 'layout')

/** Estructura habitual de un colegio chileno: 2 niveles de parvularia, 8 de básica y 4 de media. */
const STANDARD = [
  ['Pre-kínder', 'parvularia'], ['Kínder', 'parvularia'],
  ...Array.from({ length: 8 }, (_, i) => [`${i + 1}.º básico`, 'basica']),
  ...Array.from({ length: 4 }, (_, i) => [`${i + 1}.º medio`, 'media']),
].map(([name, stage], i) => ({ name, stage, sort_order: i + 1 }))

export async function createStandardGrades(): Promise<ActionResult> {
  const ctx = await actionContext('admin', 'directivo')
  if (!ctx) return NOT_ALLOWED
  const { session, db } = ctx
  const { data: existing } = await db.from('grade_levels').select('name').eq('institution_id', session.institutionId)
  const have = new Set((existing ?? []).map(g => g.name as string))
  // Los grados que ya existen se reordenan para que la lista completa quede en secuencia.
  const { error } = await db.from('grade_levels')
    .upsert(STANDARD.map(g => ({ institution_id: session.institutionId, ...g })), { onConflict: 'institution_id,name' })
  if (error) return dbError(error)
  const created = STANDARD.filter(g => !have.has(g.name)).length
  await audit(db, session, { action: 'academic.create', entity: 'grade_levels', metadata: { created } })
  refresh()
  return ok(created ? `Se crearon ${created} grados. Ahora agrega las secciones de cada uno.` : 'La estructura estándar ya estaba completa.')
}

/** Crea la siguiente sección de un grado (A, B, C…) en el periodo vigente y hereda el plan de asignaturas de la anterior. */
export async function addSection(gradeLevelId: string): Promise<ActionResult> {
  const ctx = await actionContext('admin', 'directivo')
  if (!ctx) return NOT_ALLOWED
  const { session, db } = ctx
  const inst = session.institutionId
  const [{ data: level }, { data: period }] = await Promise.all([
    db.from('grade_levels').select('id, name').eq('id', gradeLevelId).eq('institution_id', inst).maybeSingle(),
    db.from('academic_periods').select('id').eq('institution_id', inst).eq('is_current', true).maybeSingle(),
  ])
  if (!level) return fail('Grado no encontrado.')
  if (!period) return fail('Define primero un periodo académico vigente.')

  const { data: siblings } = await db.from('courses').select('id, section').eq('grade_level_id', gradeLevelId).eq('period_id', period.id).order('section')
  const used = new Set((siblings ?? []).map(s => String(s.section).toUpperCase()))
  const letter = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').find(l => !used.has(l))
  if (!letter) return fail('Este grado ya tiene todas las secciones posibles.')

  const { data: course, error } = await db.from('courses')
    .insert({ institution_id: inst, grade_level_id: gradeLevelId, period_id: period.id, section: letter, name: `${level.name} ${letter}` })
    .select('id').single()
  if (error) return dbError(error)

  const template = siblings?.[0]?.id
  if (template) {
    const { data: plan } = await db.from('course_subjects').select('subject_id').eq('course_id', template)
    if (plan?.length) await db.from('course_subjects').insert(plan.map(p => ({ institution_id: inst, course_id: course.id, subject_id: p.subject_id })))
  }
  await audit(db, session, { action: 'academic.create', entity: 'course', entityId: course.id, metadata: { name: `${level.name} ${letter}` } })
  refresh()
  return ok(`Se creó ${level.name} ${letter}${template ? ' con el mismo plan de asignaturas de la sección anterior' : ''}.`)
}

/** Define qué asignaturas lleva un curso y su capacidad. Puede aplicarse a todas las secciones del grado. */
export async function saveCoursePlan(courseId: string, form: FormData): Promise<ActionResult> {
  const ctx = await actionContext('admin', 'directivo')
  if (!ctx) return NOT_ALLOWED
  const parsed = parseForm(z.object({
    subject_ids: z.array(uuid).default([]),
    capacity: z.coerce.number({ invalid_type_error: 'Capacidad inválida.' }).int().min(1, 'La capacidad debe ser al menos 1.').max(60, 'La capacidad máxima es 60.'),
    head_teacher_id: uuid.optional(),
    whole_grade: z.enum(['on']).optional(),
  }), form)
  if ('error' in parsed) return parsed.error
  const { session, db } = ctx
  const inst = session.institutionId
  const { data: course } = await db.from('courses').select('id, grade_level_id, period_id').eq('id', courseId).eq('institution_id', inst).maybeSingle()
  if (!course) return fail('Curso no encontrado.')

  const { error: courseError } = await db.from('courses').update({ capacity: parsed.data.capacity, head_teacher_id: parsed.data.head_teacher_id ?? null }).eq('id', courseId)
  if (courseError) return dbError(courseError)

  let targets = [courseId]
  if (parsed.data.whole_grade) {
    const { data } = await db.from('courses').select('id').eq('grade_level_id', course.grade_level_id).eq('period_id', course.period_id)
    targets = (data ?? []).map(c => c.id as string)
  }
  const wanted = new Set(parsed.data.subject_ids)
  const { data: current } = await db.from('course_subjects').select('course_id, subject_id').in('course_id', targets)
  const { data: assigned } = await db.from('teacher_assignments').select('course_id, subject_id').in('course_id', targets)

  // No se quita del plan una asignatura que ya tiene docente: primero hay que retirar la asignación.
  const blocked = (current ?? []).filter(c => !wanted.has(c.subject_id as string) && (assigned ?? []).some(a => a.course_id === c.course_id && a.subject_id === c.subject_id))
  const toRemove = (current ?? []).filter(c => !wanted.has(c.subject_id as string) && !blocked.includes(c))
  const toAdd = targets.flatMap(t => [...wanted].filter(s => !(current ?? []).some(c => c.course_id === t && c.subject_id === s)).map(s => ({ institution_id: inst, course_id: t, subject_id: s })))

  for (const r of toRemove) await db.from('course_subjects').delete().eq('course_id', r.course_id).eq('subject_id', r.subject_id)
  if (toAdd.length) {
    const { error } = await db.from('course_subjects').insert(toAdd)
    if (error) return dbError(error)
  }
  refresh()
  const scope = parsed.data.whole_grade ? `en las ${targets.length} secciones del grado` : 'en el curso'
  return ok(blocked.length
    ? `Plan actualizado ${scope}. ${blocked.length} asignatura(s) no se quitaron porque tienen docente asignado.`
    : `Plan de asignaturas actualizado ${scope}.`)
}

/** Agrega asignaturas al plan de una sección (o de todas las secciones de su grado). */
export async function addCourseSubjects(courseId: string, form: FormData): Promise<ActionResult> {
  const ctx = await actionContext('admin', 'directivo')
  if (!ctx) return NOT_ALLOWED
  const parsed = parseForm(z.object({ subject_ids: z.array(uuid).min(1, 'Elige al menos una asignatura.'), whole_grade: z.enum(['on']).optional() }), form)
  if ('error' in parsed) return parsed.error
  const { session, db } = ctx
  const inst = session.institutionId
  const { data: course } = await db.from('courses').select('id, grade_level_id, period_id').eq('id', courseId).eq('institution_id', inst).maybeSingle()
  if (!course) return fail('Curso no encontrado.')
  let targets = [courseId]
  if (parsed.data.whole_grade) {
    const { data } = await db.from('courses').select('id').eq('grade_level_id', course.grade_level_id).eq('period_id', course.period_id)
    targets = (data ?? []).map(c => c.id as string)
  }
  const { error } = await db.from('course_subjects')
    .upsert(targets.flatMap(t => parsed.data.subject_ids.map(s => ({ institution_id: inst, course_id: t, subject_id: s }))), { onConflict: 'course_id,subject_id', ignoreDuplicates: true })
  if (error) return dbError(error)
  refresh()
  return ok(parsed.data.whole_grade ? `Asignaturas agregadas a las ${targets.length} secciones del grado.` : 'Asignaturas agregadas a la sección.')
}

/** Quita una asignatura del plan de una sección. Si ya tiene docente, primero hay que retirarlo. */
export async function removeCourseSubject(courseId: string, subjectId: string): Promise<ActionResult> {
  const ctx = await actionContext('admin', 'directivo')
  if (!ctx) return NOT_ALLOWED
  const { session, db } = ctx
  const { data: assigned } = await db.from('teacher_assignments').select('id').eq('course_id', courseId).eq('subject_id', subjectId).eq('institution_id', session.institutionId).maybeSingle()
  if (assigned) return fail('Esta asignatura tiene docente en la sección. Quita primero al docente.')
  const { error } = await db.from('course_subjects').delete().eq('course_id', courseId).eq('subject_id', subjectId).eq('institution_id', session.institutionId)
  if (error) return dbError(error)
  refresh()
  return ok('Asignatura quitada del plan de la sección.')
}

/** Copia a esta sección las asignaturas del plan de otra que aún no tenga. No copia docentes. */
export async function copyCoursePlan(courseId: string, form: FormData): Promise<ActionResult> {
  const ctx = await actionContext('admin', 'directivo')
  if (!ctx) return NOT_ALLOWED
  const parsed = parseForm(z.object({ from_course_id: uuid }), form)
  if ('error' in parsed) return parsed.error
  const { session, db } = ctx
  const inst = session.institutionId
  const { data: plan } = await db.from('course_subjects').select('subject_id').eq('course_id', parsed.data.from_course_id).eq('institution_id', inst)
  if (!plan?.length) return fail('La sección de origen no tiene asignaturas en su plan.')
  const { error } = await db.from('course_subjects')
    .upsert(plan.map(p => ({ institution_id: inst, course_id: courseId, subject_id: p.subject_id })), { onConflict: 'course_id,subject_id', ignoreDuplicates: true })
  if (error) return dbError(error)
  refresh()
  return ok('Plan copiado. Ahora asigna los docentes de esta sección.')
}

/** Profesor jefe y capacidad de una sección. */
export async function updateCourseSettings(courseId: string, form: FormData): Promise<ActionResult> {
  const ctx = await actionContext('admin', 'directivo')
  if (!ctx) return NOT_ALLOWED
  const parsed = parseForm(z.object({
    head_teacher_id: uuid.optional(),
    capacity: z.coerce.number({ invalid_type_error: 'Capacidad inválida.' }).int().min(1, 'La capacidad debe ser al menos 1.').max(60, 'La capacidad máxima es 60.'),
  }), form)
  if ('error' in parsed) return parsed.error
  const { error, count } = await ctx.db.from('courses').update({ head_teacher_id: parsed.data.head_teacher_id ?? null, capacity: parsed.data.capacity }, { count: 'exact' })
    .eq('id', courseId).eq('institution_id', ctx.session.institutionId)
  if (error) return dbError(error)
  if (!count) return NOT_ALLOWED
  refresh()
  return ok('Sección actualizada.')
}
