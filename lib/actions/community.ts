'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { actionContext } from '@/lib/auth/session'
import { dbError, fail, NOT_ALLOWED, ok, parseForm, type ActionResult } from '@/lib/actions/result'
import { communityPrefix, IMAGE_PATH, MAX_IMAGES, REACTION_KINDS, type ReactionKind } from '@/lib/community'
import { ROLES } from '@/lib/roles'
import { notifyAnnouncement } from '@/lib/email/notices'
import { mailSummary } from '@/lib/email/bulk'

// Comunidad: publicaciones con imágenes, reacciones y comentarios.
// Publican administración, dirección y docentes (estos últimos solo en sus cursos). El resto participa según lo que
// permita cada publicación. Todas las reglas se vuelven a comprobar en la base de datos (RLS).

const uuid = z.string().uuid('Identificador inválido.')
const refresh = () => revalidatePath('/', 'layout')
const roles = z.array(z.enum(ROLES)).default([])

const post = z.object({
  title: z.string({ required_error: 'Ingresa un título.' }).trim().min(3, 'El título es muy corto.').max(160),
  body: z.string({ required_error: 'Escribe el mensaje.' }).trim().min(1).max(5000),
  course_id: uuid.optional(),
  audience: z.array(z.enum(ROLES)).min(1, 'Elige al menos un destinatario.'),
  images: z.array(z.string()).max(MAX_IMAGES, `Puedes adjuntar hasta ${MAX_IMAGES} imágenes.`).default([]),
  allow_reactions: z.enum(['on']).optional(),
  comment_roles: roles,
})

export async function createPost(form: FormData): Promise<ActionResult> {
  const ctx = await actionContext('admin', 'directivo', 'docente')
  if (!ctx) return NOT_ALLOWED
  const parsed = parseForm(post, form)
  if ('error' in parsed) return parsed.error
  const { session, db } = ctx
  const v = parsed.data
  if (session.role === 'docente' && !v.course_id) return fail('Como docente debes elegir uno de tus cursos.')
  // Las rutas las propone el navegador: solo se aceptan dentro de la carpeta de comunidad del colegio activo.
  if (v.images.some(p => !IMAGE_PATH.test(p) || !p.startsWith(communityPrefix(session.institutionId)))) return fail('Una de las imágenes no es válida.')
  const { error } = await db.from('announcements').insert({
    institution_id: session.institutionId, author_id: session.userId, title: v.title, body: v.body, course_id: v.course_id ?? null,
    audience: v.audience, image_paths: v.images, allow_reactions: v.allow_reactions === 'on',
    comment_roles: v.comment_roles.filter(r => v.audience.includes(r)),   // solo puede comentar quien además la ve
  })
  if (error) return dbError(error)
  refresh()
  const mail = await notifyAnnouncement({ institutionId: session.institutionId, institutionName: session.institutionName, authorId: session.userId, authorName: session.fullName,
    title: v.title, courseId: v.course_id ?? null, audience: v.audience })
  return ok('Publicado en la comunidad.' + mailSummary(mail))
}

export async function deletePost(id: string): Promise<ActionResult> {
  const ctx = await actionContext('admin', 'directivo', 'docente')
  if (!ctx) return NOT_ALLOWED
  const { session, db } = ctx
  const { data: row } = await db.from('announcements').select('image_paths').eq('id', id).eq('institution_id', session.institutionId).maybeSingle()
  const { error, count } = await db.from('announcements').delete({ count: 'exact' }).eq('id', id).eq('institution_id', session.institutionId)
  if (error) return dbError(error)
  if (!count) return fail('Solo puedes eliminar lo que publicaste.')
  const images = (row?.image_paths ?? []) as string[]
  if (images.length) await db.storage.from('materials').remove(images)
  refresh()
  return ok('Publicación eliminada.')
}

/** Controles de interacción: quien publicó, dirección o administración pueden cambiarlos en cualquier momento. */
export async function updatePostControls(id: string, form: FormData): Promise<ActionResult> {
  const ctx = await actionContext('admin', 'directivo', 'docente')
  if (!ctx) return NOT_ALLOWED
  const parsed = parseForm(z.object({ allow_reactions: z.enum(['on']).optional(), comment_roles: roles }), form)
  if ('error' in parsed) return parsed.error
  const { error, count } = await ctx.db.from('announcements')
    .update({ allow_reactions: parsed.data.allow_reactions === 'on', comment_roles: parsed.data.comment_roles }, { count: 'exact' })
    .eq('id', id).eq('institution_id', ctx.session.institutionId)
  if (error) return dbError(error)
  if (!count) return NOT_ALLOWED
  refresh()
  return ok('Controles de la publicación actualizados.')
}

/** Reacciona, cambia la reacción o la quita (kind = null). */
export async function reactToPost(id: string, kind: ReactionKind | null): Promise<ActionResult> {
  const ctx = await actionContext()
  if (!ctx || !uuid.safeParse(id).success) return NOT_ALLOWED
  const { session, db } = ctx
  if (kind === null) {
    const { error } = await db.from('announcement_reactions').delete().eq('announcement_id', id).eq('user_id', session.userId)
    if (error) return dbError(error)
  } else {
    if (!REACTION_KINDS.includes(kind)) return fail('Reacción inválida.')
    // Cambiar de reacción = actualizar la propia; si no existe, crearla.
    const { data: changed, error: updateError } = await db.from('announcement_reactions').update({ kind }).eq('announcement_id', id).eq('user_id', session.userId).select('kind')
    if (updateError) return dbError(updateError, 'Las reacciones están desactivadas en esta publicación.')
    if (!changed?.length) {
      const { error } = await db.from('announcement_reactions').insert({ announcement_id: id, user_id: session.userId, institution_id: session.institutionId, kind })
      if (error) return dbError(error, 'Las reacciones están desactivadas en esta publicación.')
    }
  }
  refresh()
  return ok()
}

export async function addComment(id: string, form: FormData): Promise<ActionResult> {
  const ctx = await actionContext()
  if (!ctx || !uuid.safeParse(id).success) return NOT_ALLOWED
  const parsed = parseForm(z.object({ body: z.string({ required_error: 'Escribe un comentario.' }).trim().min(1, 'Escribe un comentario.').max(1000, 'El comentario es demasiado largo.'), parent_id: uuid.optional() }), form)
  if ('error' in parsed) return parsed.error
  const { error } = await ctx.db.from('announcement_comments')
    .insert({ institution_id: ctx.session.institutionId, announcement_id: id, author_id: ctx.session.userId, body: parsed.data.body, parent_id: parsed.data.parent_id ?? null })
  if (error) return dbError(error, parsed.data.parent_id ? 'No se pudo responder: ese comentario ya no está disponible o no puedes comentar aquí.' : 'No puedes comentar en esta publicación.')
  refresh()
  return ok(parsed.data.parent_id ? 'Respuesta publicada.' : 'Comentario publicado.')
}

/** Moderación: oculta o vuelve a mostrar un comentario. Queda registrado quién lo ocultó. */
export async function setCommentHidden(commentId: string, hidden: boolean): Promise<ActionResult> {
  const ctx = await actionContext('admin', 'directivo', 'docente')
  if (!ctx) return NOT_ALLOWED
  const { error, count } = await ctx.db.from('announcement_comments')
    .update({ hidden_at: hidden ? new Date().toISOString() : null, hidden_by: hidden ? ctx.session.userId : null }, { count: 'exact' })
    .eq('id', commentId).eq('institution_id', ctx.session.institutionId)
  if (error) return dbError(error)
  if (!count) return NOT_ALLOWED
  refresh()
  return ok(hidden ? 'Comentario ocultado.' : 'Comentario visible de nuevo.')
}

export async function deleteComment(commentId: string): Promise<ActionResult> {
  const ctx = await actionContext()
  if (!ctx) return NOT_ALLOWED
  const { error, count } = await ctx.db.from('announcement_comments').delete({ count: 'exact' }).eq('id', commentId).eq('institution_id', ctx.session.institutionId)
  if (error) return dbError(error)
  if (!count) return fail('Solo puedes eliminar tus propios comentarios.')
  refresh()
  return ok('Comentario eliminado.')
}
