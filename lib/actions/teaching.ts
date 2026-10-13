'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { actionContext } from '@/lib/auth/session'
import { audit } from '@/lib/audit'
import { dbError, fail, NOT_ALLOWED, ok, parseForm, type ActionResult } from '@/lib/actions/result'
import { fromLocalInput } from '@/lib/format'
import { ASSESSMENT_KINDS, isEvaluation, KIND_LABEL } from '@/lib/assessments'
import { notifyAssignment, notifyGrades } from '@/lib/email/notices'
import { mailSummary } from '@/lib/email/bulk'

// Acciones del docente. RLS solo deja escribir en los cursos y asignaturas que tiene asignados,
// así que un identificador ajeno termina en "sin permiso" aunque alguien manipule el formulario.

const uuid = z.string().uuid('Identificador inválido.')

const assignment = z.object({
  target: z.string({ required_error: 'Elige curso y asignatura.' }).regex(/^[0-9a-f-]{36}:[0-9a-f-]{36}$/i, 'Elige curso y asignatura.'),
  title: z.string({ required_error: 'Ingresa un título.' }).trim().min(3, 'El título es muy corto.').max(160),
  description: z.string().trim().max(5000).optional(),
  topic: z.string().trim().max(80).optional(),
  due_at: z.string({ required_error: 'Indica la fecha límite.' }),
  status: z.enum(['draft', 'published']).default('published'),
  kind: z.enum(ASSESSMENT_KINDS).default('tarea'),
  weight: z.string().trim().max(6).optional(),
  file_path: z.string().optional(),
  file_name: z.string().max(200).optional(),
})

type Ctx = NonNullable<Awaited<ReturnType<typeof actionContext>>>

/** Lee el porcentaje opcional y comprueba que, con los demás de ese curso y asignatura, no pase de 100. */
async function readWeight(ctx: Ctx, raw: string | undefined, courseId: string, subjectId: string, exceptId?: string): Promise<{ weight: number | null } | { error: ActionResult }> {
  if (!raw) return { weight: null }
  const weight = Math.round(Number(raw.replace('%', '').replace(',', '.')) * 100) / 100
  if (!Number.isFinite(weight) || weight <= 0 || weight > 100) return { error: fail('Revisa los campos marcados.', { weight: 'El porcentaje debe estar entre 1 y 100.' }) }
  const { data } = await ctx.db.from('assignments').select('id, weight').eq('institution_id', ctx.session.institutionId).eq('course_id', courseId).eq('subject_id', subjectId).not('weight', 'is', null)
  const others = (data ?? []).filter(a => a.id !== exceptId).reduce((n, a) => n + Number(a.weight), 0)
  if (others + weight > 100) return { error: fail('Revisa los campos marcados.', { weight: `Las demás actividades de esta asignatura ya suman ${others} %: quedan ${Math.max(0, 100 - others)} % disponibles.` }) }
  return { weight }
}

export async function createAssignment(form: FormData): Promise<ActionResult> {
  const ctx = await actionContext('docente')
  if (!ctx) return NOT_ALLOWED
  const parsed = parseForm(assignment, form)
  if ('error' in parsed) return parsed.error
  const { session, db } = ctx
  const v = parsed.data
  const dueAt = fromLocalInput(v.due_at)
  if (!dueAt) return fail('Revisa los campos marcados.', { due_at: 'Fecha límite inválida.' })
  // Una prueba ya rendida se puede registrar después para poner sus notas; una tarea necesita plazo futuro.
  if (!isEvaluation(v.kind) && v.status === 'published' && new Date(dueAt).getTime() < Date.now()) return fail('Revisa los campos marcados.', { due_at: 'La fecha límite debe ser futura.' })
  if (v.file_path && (!v.file_path.startsWith(`${session.institutionId}/`) || v.file_path.includes('..'))) return fail('Archivo adjunto inválido.')
  const [courseId, subjectId] = v.target.split(':')
  const w = await readWeight(ctx, v.weight, courseId, subjectId)
  if ('error' in w) return w.error

  const { error } = await db.from('assignments').insert({
    institution_id: session.institutionId, course_id: courseId, subject_id: subjectId, teacher_id: session.userId,
    title: v.title, description: v.description ?? '', topic: v.topic ?? null, due_at: dueAt, status: v.status, kind: v.kind, weight: w.weight,
    attachment_path: v.file_path ?? null, attachment_name: v.file_path ? v.file_name ?? 'Adjunto' : null,
  })
  if (error) return dbError(error)
  revalidatePath('/docente', 'layout')
  const what = KIND_LABEL[v.kind]
  if (v.status !== 'published') return ok(`${what} guardada como borrador.`)
  const mail = await notifyAssignment({ institutionId: session.institutionId, institutionName: session.institutionName, courseId, subjectId, title: v.title, kind: v.kind, dueAt })
  return ok(`${what} publicada. Ya es visible para el curso.` + mailSummary(mail))
}

export async function setAssignmentStatus(id: string, status: 'draft' | 'published' | 'closed'): Promise<ActionResult> {
  const ctx = await actionContext('docente')
  if (!ctx) return NOT_ALLOWED
  const { data: before } = await ctx.db.from('assignments').select('status').eq('id', id).eq('institution_id', ctx.session.institutionId).maybeSingle()
  const { data, error } = await ctx.db.from('assignments').update({ status }).eq('id', id).eq('institution_id', ctx.session.institutionId).select('course_id, subject_id, title, kind, due_at')
  if (error) return dbError(error)
  if (!data?.length) return NOT_ALLOWED
  revalidatePath('/docente', 'layout')
  // Solo se avisa a los apoderados la primera vez que se publica, no al reabrir una tarea cerrada.
  const a = data[0]
  const mail = status === 'published' && before?.status === 'draft'
    ? await notifyAssignment({ institutionId: ctx.session.institutionId, institutionName: ctx.session.institutionName, courseId: a.course_id as string, subjectId: a.subject_id as string, title: a.title as string, kind: a.kind as string, dueAt: a.due_at as string })
    : { sent: 0, skipped: 0 }
  return ok({ draft: 'La tarea volvió a borrador.', published: 'Tarea publicada.', closed: 'Tarea cerrada: ya no recibe entregas.' }[status] + mailSummary(mail))
}

export async function deleteAssignment(id: string): Promise<ActionResult> {
  const ctx = await actionContext('docente')
  if (!ctx) return NOT_ALLOWED
  const { data, error } = await ctx.db.from('assignments').delete().eq('id', id).eq('institution_id', ctx.session.institutionId).select('attachment_path')
  if (error) return error.code === '23503' ? fail('La tarea ya tiene entregas o notas y no se puede eliminar. Puedes cerrarla.') : dbError(error)
  if (!data?.length) return NOT_ALLOWED
  // El archivo adjunto se va con la tarea: no deben quedar documentos sin dueño en el almacenamiento.
  const paths = data.map(r => r.attachment_path as string | null).filter((p): p is string => !!p)
  if (paths.length) await ctx.db.storage.from('materials').remove(paths)
  revalidatePath('/docente', 'layout')
  return ok('Tarea eliminada.')
}

const grade = z.object({
  student_id: uuid,
  score: z.string({ required_error: 'Ingresa la nota.' }).trim()
    .transform(s => Number(s.replace(',', '.')))
    .refine(n => Number.isFinite(n) && n >= 1 && n <= 7, 'La nota debe estar entre 1,0 y 7,0.')
    .transform(n => Math.round(n * 10) / 10),
  feedback: z.string().trim().max(2000).optional(),
})

/** Registra o corrige la nota de un estudiante en una tarea (escala 1,0 a 7,0). */
export async function saveGrade(assignmentId: string, form: FormData): Promise<ActionResult> {
  const ctx = await actionContext('docente')
  if (!ctx) return NOT_ALLOWED
  const parsed = parseForm(grade, form)
  if ('error' in parsed) return parsed.error
  const { session, db } = ctx
  // RLS solo muestra la tarea si el docente la imparte.
  const { data: a } = await db.from('assignments').select('id, course_id, subject_id').eq('id', assignmentId).eq('institution_id', session.institutionId).maybeSingle()
  if (!a) return NOT_ALLOWED
  // Corregir una nota no vuelve a avisar: solo la primera vez que se registra.
  const { data: had } = await db.from('grades').select('id').eq('assignment_id', a.id).eq('student_id', parsed.data.student_id).maybeSingle()

  const { error } = await db.from('grades').upsert({
    institution_id: session.institutionId, assignment_id: a.id, course_id: a.course_id, subject_id: a.subject_id,
    student_id: parsed.data.student_id, score: parsed.data.score, feedback: parsed.data.feedback ?? '',
    graded_by: session.userId, graded_at: new Date().toISOString(),
  }, { onConflict: 'assignment_id,student_id' })
  if (error) return dbError(error)
  await audit(db, session, { action: 'grade.save', entity: 'assignment', entityId: a.id, metadata: { student: parsed.data.student_id } })
  revalidatePath('/docente', 'layout')
  const mail = had ? { sent: 0, skipped: 0 } : await notifyGrades({ institutionId: session.institutionId, institutionName: session.institutionName, studentIds: [parsed.data.student_id], subjectId: a.subject_id as string })
  return ok(`Nota ${parsed.data.score.toFixed(1).replace('.', ',')} guardada.` + mailSummary(mail))
}

/** Planilla de notas: guarda de una vez las notas de varios estudiantes. Los campos llegan como score:<id> y feedback:<id>. */
export async function saveGrades(assignmentId: string, form: FormData): Promise<ActionResult> {
  const ctx = await actionContext('docente')
  if (!ctx) return NOT_ALLOWED
  const { session, db } = ctx
  const { data: a } = await db.from('assignments').select('id, course_id, subject_id').eq('id', assignmentId).eq('institution_id', session.institutionId).maybeSingle()
  if (!a) return NOT_ALLOWED

  const rows: Record<string, unknown>[] = []
  const errors: Record<string, string> = {}
  for (const [key, value] of form.entries()) {
    if (!key.startsWith('score:') || typeof value !== 'string' || !value.trim()) continue   // en blanco: se deja como está
    const studentId = key.slice(6)
    if (!uuid.safeParse(studentId).success) continue
    const score = Number(value.trim().replace(',', '.'))
    if (!Number.isFinite(score) || score < 1 || score > 7) { errors[key] = `«${value.trim()}» no es una nota válida (1,0 a 7,0).`; continue }
    const feedback = form.get(`feedback:${studentId}`)
    rows.push({
      institution_id: session.institutionId, assignment_id: a.id, course_id: a.course_id, subject_id: a.subject_id, student_id: studentId,
      score: Math.round(score * 10) / 10, feedback: typeof feedback === 'string' ? feedback.trim().slice(0, 2000) : '',
      graded_by: session.userId, graded_at: new Date().toISOString(),
    })
  }
  if (Object.keys(errors).length) return fail('Hay notas fuera de la escala. No se guardó ninguna.', errors)
  if (rows.length === 0) return fail('Escribe al menos una nota.')
  const { data: had } = await db.from('grades').select('student_id').eq('assignment_id', a.id)
  const already = new Set((had ?? []).map(g => g.student_id as string))

  const { error } = await db.from('grades').upsert(rows, { onConflict: 'assignment_id,student_id' })
  if (error) return dbError(error)
  await audit(db, session, { action: 'grade.save', entity: 'assignment', entityId: a.id, metadata: { students: rows.length } })
  revalidatePath('/docente', 'layout')
  const fresh = rows.map(r => r.student_id as string).filter(id => !already.has(id))
  const mail = await notifyGrades({ institutionId: session.institutionId, institutionName: session.institutionName, studentIds: fresh, subjectId: a.subject_id as string })
  return ok((rows.length === 1 ? 'Nota guardada.' : `${rows.length} notas guardadas.`) + mailSummary(mail))
}

const ATTENDANCE = ['present', 'absent', 'late', 'justified'] as const

/** Guarda la asistencia de un curso para un día. Los campos llegan como status:<student_id>. */
export async function saveAttendance(form: FormData): Promise<ActionResult> {
  const ctx = await actionContext('docente')
  if (!ctx) return NOT_ALLOWED
  const parsed = parseForm(z.object({ course_id: uuid, date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida.') }), form)
  if ('error' in parsed) return parsed.error
  const { session, db } = ctx
  if (parsed.data.date > new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)) return fail('No se puede registrar asistencia de fechas futuras.')

  const rows: Record<string, unknown>[] = []
  for (const [key, value] of form.entries()) {
    if (!key.startsWith('status:') || typeof value !== 'string') continue
    const studentId = key.slice(7)
    if (!uuid.safeParse(studentId).success || !(ATTENDANCE as readonly string[]).includes(value)) continue
    rows.push({ institution_id: session.institutionId, course_id: parsed.data.course_id, student_id: studentId, date: parsed.data.date, status: value, recorded_by: session.userId })
  }
  if (rows.length === 0) return fail('No hay estudiantes para registrar.')

  const { error } = await db.from('attendance_records').upsert(rows, { onConflict: 'course_id,student_id,date' })
  if (error) return dbError(error)
  revalidatePath('/docente', 'layout')
  return ok(`Asistencia guardada para ${rows.length} estudiantes.`)
}

/** Corrige una tarea ya creada: título, instrucciones, contenido, fecha límite y, si se sube uno nuevo, el archivo adjunto. */
export async function updateAssignment(id: string, form: FormData): Promise<ActionResult> {
  const ctx = await actionContext('docente')
  if (!ctx) return NOT_ALLOWED
  const parsed = parseForm(assignment.omit({ target: true, status: true }).extend({ remove_file: z.enum(['on']).optional() }), form)
  if ('error' in parsed) return parsed.error
  const { session, db } = ctx
  const v = parsed.data
  const dueAt = fromLocalInput(v.due_at)
  if (!dueAt) return fail('Revisa los campos marcados.', { due_at: 'Fecha límite inválida.' })
  if (v.file_path && (!v.file_path.startsWith(`${session.institutionId}/`) || v.file_path.includes('..'))) return fail('Archivo adjunto inválido.')
  const { data: current } = await db.from('assignments').select('course_id, subject_id').eq('id', id).eq('institution_id', session.institutionId).maybeSingle()
  if (!current) return NOT_ALLOWED
  const w = await readWeight(ctx, v.weight, current.course_id as string, current.subject_id as string, id)
  if ('error' in w) return w.error
  const file = v.file_path ? { attachment_path: v.file_path, attachment_name: v.file_name ?? 'Adjunto' } : v.remove_file ? { attachment_path: null, attachment_name: null } : {}
  const { error, count } = await db.from('assignments')
    .update({ title: v.title, description: v.description ?? '', topic: v.topic ?? null, due_at: dueAt, weight: w.weight, ...file }, { count: 'exact' })
    .eq('id', id).eq('institution_id', session.institutionId)
  if (error) return dbError(error)
  if (!count) return NOT_ALLOWED
  revalidatePath('/docente', 'layout')
  return ok('Tarea actualizada.')
}
