'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { actionContext } from '@/lib/auth/session'
import { dbError, fail, NOT_ALLOWED, ok, parseForm, type ActionResult } from '@/lib/actions/result'

// Perfil propio: foto y teléfono. Cada persona edita solo el suyo; la base de datos lo vuelve a comprobar.

const PATH = /^[0-9a-f-]{36}\/[\w.-]{1,120}\.(png|jpe?g|webp)$/i

/** Guarda la foto recién subida a Storage. La ruta la propone el navegador: solo se acepta en la carpeta propia. */
export async function saveAvatar(path: string): Promise<ActionResult> {
  const ctx = await actionContext()
  if (!ctx) return NOT_ALLOWED
  const { session, db } = ctx
  if (!PATH.test(path) || !path.startsWith(`${session.userId}/`)) return fail('Archivo de foto inválido.')

  const { data: before } = await db.from('profiles').select('avatar_path').eq('id', session.userId).maybeSingle()
  const { error } = await db.from('profiles').update({ avatar_path: path }).eq('id', session.userId)
  if (error) return dbError(error, 'No se pudo guardar la foto.')
  const old = before?.avatar_path as string | null | undefined
  if (old && old !== path) await db.storage.from('avatars').remove([old])
  revalidatePath('/', 'layout')
  return ok('Foto de perfil actualizada.')
}

export async function removeAvatar(): Promise<ActionResult> {
  const ctx = await actionContext()
  if (!ctx) return NOT_ALLOWED
  const { session, db } = ctx
  const { data: before } = await db.from('profiles').select('avatar_path').eq('id', session.userId).maybeSingle()
  const { error } = await db.from('profiles').update({ avatar_path: null }).eq('id', session.userId)
  if (error) return dbError(error)
  if (before?.avatar_path) await db.storage.from('avatars').remove([before.avatar_path as string])
  revalidatePath('/', 'layout')
  return ok('Foto eliminada. Se mostrarán tus iniciales.')
}

export async function updateMyProfile(form: FormData): Promise<ActionResult> {
  const ctx = await actionContext()
  if (!ctx) return NOT_ALLOWED
  const parsed = parseForm(z.object({ phone: z.string().trim().max(30, 'El teléfono es demasiado largo.').optional() }), form)
  if ('error' in parsed) return parsed.error
  const { error } = await ctx.db.from('profiles').update({ phone: parsed.data.phone ?? null }).eq('id', ctx.session.userId)
  if (error) return dbError(error)
  revalidatePath('/perfil')
  return ok('Datos actualizados.')
}

/** El estudiante elige cómo ver su panel: automático según su curso, simple o completo. Solo cambia la presentación. */
export async function setDisplayMode(mode: 'auto' | 'simple' | 'completo'): Promise<ActionResult> {
  const ctx = await actionContext('estudiante')
  if (!ctx) return NOT_ALLOWED
  if (!['auto', 'simple', 'completo'].includes(mode)) return fail('Modo inválido.')
  const { error } = await ctx.db.from('profiles').update({ display_mode: mode }).eq('id', ctx.session.userId)
  if (error) return dbError(error)
  revalidatePath('/', 'layout')
  return ok('Listo: cambiamos cómo ves tu panel.')
}
