'use server'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { actionContext } from '@/lib/auth/session'
import { dbError, fail, NOT_ALLOWED, ok, parseForm, type ActionResult } from '@/lib/actions/result'
import { notifyWellbeingRequest } from '@/lib/email/notices'

// Acciones de estudiantes, apoderados y docentes: entregar tareas y pedir apoyo al equipo de bienestar.

const uuid = z.string().uuid('Identificador inválido.')

const submission = z.object({
  content: z.string().trim().max(10000).optional(),
  file_path: z.string().optional(),
  file_name: z.string().max(200).optional(),
})

export async function submitAssignment(assignmentId: string, form: FormData): Promise<ActionResult> {
  const ctx = await actionContext('estudiante')
  if (!ctx) return NOT_ALLOWED
  const parsed = parseForm(submission, form)
  if ('error' in parsed) return parsed.error
  const { session, db } = ctx
  const v = parsed.data
  if (!v.content && !v.file_path) return fail('Escribe tu respuesta o adjunta un archivo antes de entregar.')
  // El archivo debe estar en la carpeta propia del estudiante para esta tarea.
  if (v.file_path && !v.file_path.startsWith(`${session.institutionId}/${assignmentId}/${session.userId}/`)) return fail('Archivo adjunto inválido.')

  const { data: a } = await db.from('assignments').select('id, status, kind').eq('id', assignmentId).eq('institution_id', session.institutionId).maybeSingle()
  if (!a) return NOT_ALLOWED
  if (a.kind !== 'tarea') return fail('Esta evaluación se rinde en clases y no recibe entregas.')
  if (a.status !== 'published') return fail('Esta tarea está cerrada y ya no recibe entregas.')
  const { data: graded } = await db.from('grades').select('id').eq('assignment_id', assignmentId).eq('student_id', session.userId).maybeSingle()
  if (graded) return fail('Tu entrega ya fue calificada y no se puede modificar.')

  const { error } = await db.from('assignment_submissions').upsert({
    institution_id: session.institutionId, assignment_id: assignmentId, student_id: session.userId,
    content: v.content ?? '', file_path: v.file_path ?? null, file_name: v.file_path ? v.file_name ?? 'Adjunto' : null,
    submitted_at: new Date().toISOString(),
  }, { onConflict: 'assignment_id,student_id' })
  if (error) return dbError(error, 'No se pudo registrar la entrega.')
  revalidatePath('/estudiante', 'layout')
  return ok('Entrega registrada. Tu profesor ya puede revisarla.')
}

/** El apoderado responde un cuestionario que le envió el equipo de bienestar. La base de datos valida cada respuesta. */
export async function answerQuestionnaire(requestId: string, form: FormData): Promise<ActionResult> {
  const ctx = await actionContext('apoderado')
  if (!ctx) return NOT_ALLOWED
  const answers: Record<string, string> = {}
  for (const [key, value] of form.entries()) if (key.startsWith('q:') && typeof value === 'string') answers[key.slice(2)] = value
  const { error } = await ctx.db.rpc('answer_assessment_request', { p_request: requestId, p_answers: answers })
  if (error) {
    return fail(/already_answered/.test(error.message) ? 'Este cuestionario ya fue respondido.'
      : /missing_answer/.test(error.message) ? 'Falta responder alguna pregunta de número.'
      : /not_authorized/.test(error.message) ? 'No tienes acceso a este cuestionario.' : 'No se pudo enviar tu respuesta. Inténtalo de nuevo.')
  }
  revalidatePath('/apoderado', 'layout')
  revalidatePath('/bienestar', 'layout')
  return ok('Respuestas enviadas. Gracias: el equipo de bienestar las revisará.')
}

/** El apoderado elige a cuál de sus estudiantes quiere ver. Todo su panel queda enfocado en esa persona. */
export async function selectPupil(studentId: string): Promise<void> {
  const ctx = await actionContext('apoderado')
  if (!ctx || !uuid.safeParse(studentId).success) return
  const { data } = await ctx.db.from('guardian_student_links').select('student_id').eq('institution_id', ctx.session.institutionId).eq('guardian_id', ctx.session.userId).eq('student_id', studentId).maybeSingle()
  if (!data) return   // solo estudiantes que el colegio le vinculó
  ;(await cookies()).set('vs_pupil', studentId, { path: '/', sameSite: 'lax', httpOnly: true, maxAge: 60 * 60 * 24 * 180 })
  revalidatePath('/apoderado', 'layout')
}

const request = z.object({
  student_id: uuid.optional(),
  source: z.enum(['estudiante', 'apoderado', 'docente']),
  category: z.enum(['academico', 'convivencia', 'emocional', 'familiar', 'otro']).default('otro'),
  description: z.string({ required_error: 'Cuéntanos qué necesitas.' }).trim().min(5, 'Describe un poco más tu solicitud.').max(4000),
})

/** Crea una solicitud de acompañamiento. Solo la ve el equipo de bienestar; la prioridad la define una persona. */
export async function createWellbeingRequest(form: FormData): Promise<ActionResult> {
  const ctx = await actionContext('estudiante', 'apoderado', 'docente')
  if (!ctx) return NOT_ALLOWED
  const parsed = parseForm(request, form)
  if ('error' in parsed) return parsed.error
  const { session, db } = ctx
  if (parsed.data.source !== session.role) return NOT_ALLOWED
  const studentId = session.role === 'estudiante' ? session.userId : parsed.data.student_id
  if (!studentId) return fail('Indica sobre qué estudiante es la solicitud.')

  const { error } = await db.from('wellbeing_requests').insert({
    institution_id: session.institutionId, student_id: studentId, requested_by: session.userId,
    source: parsed.data.source, category: parsed.data.category, description: parsed.data.description,
  })
  if (error) return dbError(error, 'No se pudo enviar la solicitud.')
  revalidatePath('/', 'layout')
  await notifyWellbeingRequest({ institutionId: session.institutionId, institutionName: session.institutionName, senderId: session.userId })
  return ok('Solicitud enviada. El equipo de bienestar la revisará y se pondrá en contacto.')
}
