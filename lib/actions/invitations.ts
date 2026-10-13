'use server'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { adminClient, hasServiceRole, SERVICE_ROLE_MISSING } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { fail, parseForm, type ActionResult } from '@/lib/actions/result'
import { hashToken, isTokenShaped } from '@/lib/tokens'
import { ROLE_HOME, type Role } from '@/lib/roles'

const schema = z.object({
  password: z.string({ required_error: 'Crea una contraseña.' }).min(10, 'La contraseña debe tener al menos 10 caracteres.').max(72),
  confirm: z.string({ required_error: 'Repite la contraseña.' }),
  accept: z.literal('on', { errorMap: () => ({ message: 'Debes aceptar las condiciones de uso para continuar.' }) }),
}).refine(v => v.password === v.confirm, { path: ['confirm'], message: 'Las contraseñas no coinciden.' })

const INVALID = 'La invitación no es válida, ya fue usada o venció. Solicita una nueva a tu colegio.'

/** Invitación al equipo Vanty: crea la cuenta y la suma al equipo. Mismo consumo atómico que las de un colegio. */
async function acceptPlatformInvitation(token: string, password: string): Promise<ActionResult> {
  const admin = adminClient()
  const now = new Date().toISOString()
  const { data: inv } = await admin.from('platform_invitations').update({ accepted_at: now })
    .eq('token_hash', hashToken(token)).is('accepted_at', null).is('revoked_at', null).gt('expires_at', now)
    .select('id, email, full_name, created_by').maybeSingle()
  if (!inv) return fail(INVALID)
  const release = () => admin.from('platform_invitations').update({ accepted_at: null }).eq('id', inv.id)

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: inv.email, password, email_confirm: true, user_metadata: { full_name: inv.full_name },
  })
  if (createError || !created.user) {
    await release()
    return fail(/already|registered|exists/i.test(createError?.message ?? '')
      ? 'Ya existe una cuenta con ese correo. Pide que te sumen al equipo desde esa cuenta o usa otro correo.'
      : 'No se pudo crear la cuenta. Prueba con otra contraseña o inténtalo más tarde.')
  }
  const userId = created.user.id
  await admin.from('profiles').update({ full_name: inv.full_name }).eq('id', userId)
  const { error } = await admin.from('platform_staff').insert({ user_id: userId, created_by: inv.created_by })
  if (error) {
    await admin.auth.admin.deleteUser(userId)
    await release()
    return fail('No se pudo completar el alta. Inténtalo de nuevo.')
  }
  await admin.from('platform_invitations').update({ accepted_by: userId }).eq('id', inv.id)

  const supabase = await createClient()
  const { error: signInError } = await supabase.auth.signInWithPassword({ email: inv.email, password })
  redirect(signInError ? '/login' : '/plataforma')
}

/** Acepta una invitación: crea la cuenta dentro del colegio que invitó, con el rol y los vínculos definidos
 *  por la administración. Es la única vía de alta: no existe registro público. */
export async function acceptInvitation(token: string, form: FormData): Promise<ActionResult> {
  if (!isTokenShaped(token)) return fail(INVALID)
  if (!hasServiceRole()) return fail(SERVICE_ROLE_MISSING)
  const parsed = parseForm(schema, form)
  if ('error' in parsed) return parsed.error

  const admin = adminClient()
  const now = new Date().toISOString()

  // Consumo atómico: solo una petición puede marcar la invitación como aceptada.
  const { data: inv } = await admin.from('invitations').update({ accepted_at: now })
    .eq('token_hash', hashToken(token)).is('accepted_at', null).is('revoked_at', null).gt('expires_at', now)
    .select('id, institution_id, email, full_name, role, is_managed, birth_date, course_id, student_ids, relationship, institutions(status)')
    .maybeSingle()
  if (!inv) return acceptPlatformInvitation(token, parsed.data.password)

  const release = () => admin.from('invitations').update({ accepted_at: null }).eq('id', inv.id)
  if ((inv.institutions as unknown as { status: string } | null)?.status !== 'active') { await release(); return fail(INVALID) }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: inv.email, password: parsed.data.password, email_confirm: true, user_metadata: { full_name: inv.full_name },
  })
  if (createError || !created.user) {
    await release()
    return fail(/already|registered|exists/i.test(createError?.message ?? '')
      ? 'Ya existe una cuenta con ese correo. Inicia sesión con ella o pide al colegio una invitación con otro correo.'
      : 'No se pudo crear la cuenta. Prueba con otra contraseña o inténtalo más tarde.')
  }
  const userId = created.user.id
  const inst = inv.institution_id as string

  const steps = [
    admin.from('profiles').update({ full_name: inv.full_name, birth_date: inv.birth_date }).eq('id', userId),
    admin.from('institution_memberships').insert({ institution_id: inst, user_id: userId, role: inv.role, is_managed: inv.is_managed }),
    admin.from('invitations').update({ accepted_by: userId }).eq('id', inv.id),
    admin.from('audit_logs').insert({ institution_id: inst, actor_id: userId, action: 'user.invite.accept', entity: 'invitation', entity_id: inv.id, metadata: { role: inv.role } }),
  ]
  const results = await Promise.all(steps)
  if (results[1].error) {
    // Sin pertenencia la cuenta no sirve: se deshace todo.
    await admin.auth.admin.deleteUser(userId)
    await release()
    return fail('No se pudo completar el alta. Inténtalo de nuevo.')
  }

  if (inv.role === 'estudiante' && inv.course_id) {
    await admin.from('course_enrollments').insert({ institution_id: inst, course_id: inv.course_id, student_id: userId })
  }
  if (inv.role === 'apoderado' && (inv.student_ids as string[]).length) {
    // Solo se vinculan estudiantes que pertenecen al mismo colegio de la invitación.
    const { data: valid } = await admin.from('institution_memberships').select('user_id')
      .eq('institution_id', inst).eq('role', 'estudiante').in('user_id', inv.student_ids as string[])
    if (valid?.length) {
      await admin.from('guardian_student_links').insert(valid.map(s => ({
        institution_id: inst, guardian_id: userId, student_id: s.user_id, relationship: inv.relationship || 'apoderado',
      })))
    }
  }

  const supabase = await createClient()
  const { error: signInError } = await supabase.auth.signInWithPassword({ email: inv.email, password: parsed.data.password })
  redirect(signInError ? '/login' : ROLE_HOME[inv.role as Role])
}
