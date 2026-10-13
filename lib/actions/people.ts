'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { actionContext } from '@/lib/auth/session'
import { audit } from '@/lib/audit'
import { dbError, NOT_ALLOWED, ok, parseForm, type ActionResult } from '@/lib/actions/result'

// Ficha de la persona (datos personales reservados) e incidencias del estudiante.
// La ficha la edita solo la administración. Las incidencias las registran administración, dirección y los
// docentes del estudiante. RLS vuelve a comprobar todo.

const text = (max: number) => z.string().trim().max(max).optional()
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida.').optional()
const refresh = () => revalidatePath('/', 'layout')

const record = z.object({
  national_id: text(20), gender: z.enum(['femenino', 'masculino', 'otro', 'no_informa']).optional(), nationality: text(60),
  address: text(200), commune: text(80), emergency_name: text(160), emergency_phone: text(30), emergency_relation: text(40),
  admission_date: date, job_title: text(120), specialty: text(120), notes: text(2000),
})

export async function savePersonRecord(userId: string, form: FormData): Promise<ActionResult> {
  const ctx = await actionContext('admin')
  if (!ctx) return NOT_ALLOWED
  const parsed = parseForm(record, form)
  if ('error' in parsed) return parsed.error
  const { session, db } = ctx
  const values = Object.fromEntries(Object.keys(record.shape).map(k => [k, (parsed.data as Record<string, string | undefined>)[k] ?? null]))
  const { error } = await db.from('person_records')
    .upsert({ institution_id: session.institutionId, user_id: userId, ...values, updated_by: session.userId }, { onConflict: 'institution_id,user_id' })
  if (error) return dbError(error)
  await audit(db, session, { action: 'user.record.update', entity: 'profile', entityId: userId, sensitive: true })
  refresh()
  return ok('Ficha actualizada.')
}

const incident = z.object({
  kind: z.enum(['positiva', 'negativa', 'informativa']),
  category: z.enum(['conducta', 'responsabilidad', 'convivencia', 'academico', 'otro']),
  description: z.string({ required_error: 'Describe lo ocurrido.' }).trim().min(3, 'Describe lo ocurrido.').max(2000),
  occurred_on: z.string({ required_error: 'Indica la fecha.' }).regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida.'),
})

export async function addIncident(studentId: string, form: FormData): Promise<ActionResult> {
  const ctx = await actionContext('admin', 'directivo', 'docente')
  if (!ctx) return NOT_ALLOWED
  const parsed = parseForm(incident, form)
  if ('error' in parsed) return parsed.error
  const { session, db } = ctx
  const { data: enrollment } = await db.from('course_enrollments').select('course_id').eq('student_id', studentId).eq('institution_id', session.institutionId).eq('status', 'active').maybeSingle()
  const { error } = await db.from('student_incidents').insert({
    institution_id: session.institutionId, student_id: studentId, course_id: enrollment?.course_id ?? null, recorded_by: session.userId, ...parsed.data,
  })
  if (error) return dbError(error)
  await audit(db, session, { action: 'student.incident.add', entity: 'profile', entityId: studentId, sensitive: true, metadata: { kind: parsed.data.kind } })
  refresh()
  return ok('Incidencia registrada en la hoja de vida.')
}

export async function deleteIncident(id: string): Promise<ActionResult> {
  const ctx = await actionContext('admin', 'directivo', 'docente')
  if (!ctx) return NOT_ALLOWED
  const { error, count } = await ctx.db.from('student_incidents').delete({ count: 'exact' }).eq('id', id).eq('institution_id', ctx.session.institutionId)
  if (error) return dbError(error)
  if (!count) return NOT_ALLOWED
  await audit(ctx.db, ctx.session, { action: 'student.incident.delete', entity: 'incident', entityId: id, sensitive: true })
  refresh()
  return ok('Incidencia eliminada.')
}
