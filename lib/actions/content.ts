'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { actionContext } from '@/lib/auth/session'
import { dbError, fail, NOT_ALLOWED, ok, parseForm, type ActionResult } from '@/lib/actions/result'
import { ROLES } from '@/lib/roles'
import { notifyNewMessage } from '@/lib/email/notify'

// Comunicados, material y mensajería. Las políticas RLS deciden quién puede publicar en qué curso
// y qué conversaciones existen para cada persona.

const uuid = z.string().uuid('Identificador inválido.')
const refresh = () => revalidatePath('/', 'layout')

// ── Material y documentos ───────────────────────────────────────────────────
const resource = z.object({
  title: z.string({ required_error: 'Ingresa un título.' }).trim().min(3).max(160),
  description: z.string().trim().max(1000).optional(),
  kind: z.enum(['material', 'documento', 'institucional']).default('material'),
  course_id: uuid.optional(),
  subject_id: uuid.optional(),
  audience: z.array(z.enum(ROLES)).min(1, 'Elige quién puede ver el archivo.'),
  file_path: z.string({ required_error: 'Adjunta un archivo.' }).min(10, 'Adjunta un archivo.'),
  file_name: z.string({ required_error: 'Adjunta un archivo.' }).min(1).max(200),
})

export async function createResource(form: FormData): Promise<ActionResult> {
  const ctx = await actionContext('admin', 'directivo', 'docente')
  if (!ctx) return NOT_ALLOWED
  const parsed = parseForm(resource, form)
  if ('error' in parsed) return parsed.error
  const { session, db } = ctx
  // La ruta la propone el navegador: solo se acepta dentro de la carpeta del colegio activo.
  if (!parsed.data.file_path.startsWith(`${session.institutionId}/`) || parsed.data.file_path.includes('..')) return fail('Archivo inválido.')
  if (session.role === 'docente' && !parsed.data.course_id) return fail('Como docente debes elegir uno de tus cursos.')
  const { error } = await db.from('resources').insert({
    institution_id: session.institutionId, uploaded_by: session.userId, title: parsed.data.title, description: parsed.data.description ?? '',
    kind: parsed.data.kind, course_id: parsed.data.course_id ?? null, subject_id: parsed.data.subject_id ?? null,
    audience: parsed.data.audience, file_path: parsed.data.file_path, file_name: parsed.data.file_name,
  })
  if (error) return dbError(error)
  refresh()
  return ok('Archivo publicado.')
}

export async function deleteResource(id: string): Promise<ActionResult> {
  const ctx = await actionContext('admin', 'directivo', 'docente')
  if (!ctx) return NOT_ALLOWED
  const { data, error } = await ctx.db.from('resources').delete().eq('id', id).eq('institution_id', ctx.session.institutionId).select('file_path')
  if (error) return dbError(error)
  if (!data?.length) return fail('Solo puedes eliminar los archivos que subiste.')
  await ctx.db.storage.from('materials').remove(data.map(r => r.file_path))
  refresh()
  return ok('Archivo eliminado.')
}

// ── Mensajería ──────────────────────────────────────────────────────────────
const conversation = z.object({
  recipient_id: uuid, student_id: uuid,
  subject: z.string({ required_error: 'Ingresa un asunto.' }).trim().min(3, 'El asunto es muy corto.').max(160),
  body: z.string({ required_error: 'Escribe tu mensaje.' }).trim().min(1).max(4000),
  kind: z.enum(['message', 'meeting_request']).default('message'),
})

export async function startConversation(form: FormData): Promise<ActionResult> {
  const ctx = await actionContext('apoderado', 'docente', 'bienestar')
  if (!ctx) return NOT_ALLOWED
  const parsed = parseForm(conversation, form)
  if ('error' in parsed) return parsed.error
  const v = parsed.data
  // La función verifica en la base de datos que exista una relación educativa real entre ambas personas.
  const { data: conversationId, error } = await ctx.db.rpc('start_conversation', {
    p_inst: ctx.session.institutionId, p_recipient: v.recipient_id, p_student: v.student_id, p_subject: v.subject, p_body: v.body, p_kind: v.kind,
  })
  if (!error && conversationId) {
    await notifyNewMessage({ conversationId: conversationId as string, institutionId: ctx.session.institutionId, institutionName: ctx.session.institutionName,
      senderId: ctx.session.userId, senderName: ctx.session.fullName, previousLastMessageAt: null, meeting: v.kind === 'meeting_request' })
  }
  if (error && /no_guardian/.test(error.message)) return fail('Ese estudiante no tiene un apoderado registrado, y los mensajes a estudiantes siempre van con copia al apoderado.')
  if (error) return fail(/not_authorized|invalid_recipient/.test(error.message) ? 'No puedes escribirle a esa persona sobre ese estudiante.' : 'No se pudo enviar el mensaje.')
  refresh()
  return ok(v.kind === 'meeting_request' ? 'Solicitud de reunión enviada.' : 'Mensaje enviado.')
}

export async function sendMessage(conversationId: string, form: FormData): Promise<ActionResult> {
  const ctx = await actionContext('apoderado', 'docente', 'bienestar', 'estudiante')
  if (!ctx) return NOT_ALLOWED
  const parsed = parseForm(z.object({ body: z.string({ required_error: 'Escribe tu mensaje.' }).trim().min(1).max(4000) }), form)
  if ('error' in parsed) return parsed.error
  // Hasta cuándo estaba al día cada participante antes de este mensaje: decide a quién se avisa por correo.
  const { data: before } = await ctx.db.from('conversations').select('last_message_at').eq('id', conversationId).maybeSingle()
  const { error } = await ctx.db.from('messages').insert({
    institution_id: ctx.session.institutionId, conversation_id: conversationId, sender_id: ctx.session.userId, body: parsed.data.body,
  })
  if (error) return dbError(error, 'No se pudo enviar el mensaje.')
  if (before) {
    await notifyNewMessage({ conversationId, institutionId: ctx.session.institutionId, institutionName: ctx.session.institutionName,
      senderId: ctx.session.userId, senderName: ctx.session.fullName, previousLastMessageAt: before.last_message_at as string })
  }
  await ctx.db.from('conversation_participants').update({ last_read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId).eq('user_id', ctx.session.userId)
  refresh()
  return ok('Mensaje enviado.')
}
