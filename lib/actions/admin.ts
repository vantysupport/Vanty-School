'use server'
import { randomBytes } from 'crypto'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { actionContext } from '@/lib/auth/session'
import { adminClient, hasServiceRole, SERVICE_ROLE_MISSING } from '@/lib/supabase/admin'
import { audit } from '@/lib/audit'
import { dbError, fail, NOT_ALLOWED, ok, parseForm, type ActionResult } from '@/lib/actions/result'
import { ROLE_LABEL, ROLES, type Role } from '@/lib/roles'
import { hashToken, newToken } from '@/lib/tokens'
import { appBaseUrl, sendEmail } from '@/lib/email/send'
import { invitationEmail } from '@/lib/email/templates'

// Administración institucional. Cada acción: 1) exige rol admin, 2) opera con el cliente RLS del usuario,
// de modo que la base de datos vuelve a comprobar rol e institución, 3) deja registro de auditoría.
// La clave service_role solo se usa para anonimizar cuentas en Supabase Auth.

const uuid = z.string().uuid('Identificador inválido.')
const roleEnum = z.enum(ROLES, { errorMap: () => ({ message: 'Selecciona un rol válido.' }) })
const optionalDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida.').optional()
// Varias acciones se usan desde más de un panel: se refresca toda la aplicación.
const done = (_path: string, message: string, reveal?: Parameters<typeof ok>[1]) => { revalidatePath('/', 'layout'); return ok(message, reveal) }


// ── Invitaciones ────────────────────────────────────────────────────────────
const invitation = z.object({
  full_name: z.string({ required_error: 'Ingresa el nombre completo.' }).trim().min(3, 'Ingresa el nombre completo.').max(160),
  email: z.string({ required_error: 'Ingresa el correo.' }).trim().toLowerCase().email('Correo inválido.'),
  role: roleEnum,
  course_id: uuid.optional(),
  birth_date: optionalDate,
  student_ids: z.array(uuid).optional(),
  relationship: z.string().trim().max(40).optional(),
})

export async function inviteUser(form: FormData): Promise<ActionResult> {
  const ctx = await actionContext('admin', 'directivo')
  if (!ctx) return NOT_ALLOWED
  const parsed = parseForm(invitation, form)
  if ('error' in parsed) return parsed.error
  const { session, db } = ctx
  const v = parsed.data
  // El equipo directivo suma docentes; el resto de las cuentas las crea administración.
  if (session.role === 'directivo' && v.role !== 'docente') return NOT_ALLOWED

  if (v.role === 'apoderado' && !(v.student_ids?.length)) return fail('Selecciona al menos un estudiante para vincular al apoderado.')

  const { data: existing } = await db.from('invitations').select('id').eq('institution_id', session.institutionId)
    .eq('email', v.email).is('accepted_at', null).is('revoked_at', null).gt('expires_at', new Date().toISOString()).maybeSingle()
  if (existing) return fail('Ya hay una invitación vigente para ese correo. Revócala antes de crear otra.')

  const { data: settings } = await db.from('institution_settings').select('invitation_ttl_days').eq('institution_id', session.institutionId).maybeSingle()
  const days = settings?.invitation_ttl_days ?? 7
  const token = newToken()

  const { data, error } = await db.from('invitations').insert({
    institution_id: session.institutionId, email: v.email, full_name: v.full_name, role: v.role,
    token_hash: hashToken(token), is_managed: v.role === 'estudiante', birth_date: v.birth_date ?? null,
    course_id: v.role === 'estudiante' ? v.course_id ?? null : null,
    student_ids: v.role === 'apoderado' ? v.student_ids ?? [] : [], relationship: v.relationship ?? null,
    expires_at: new Date(Date.now() + days * 86_400_000).toISOString(), created_by: session.userId,
  }).select('id').single()
  if (error) return dbError(error)

  await audit(db, session, { action: 'user.invite', entity: 'invitation', entityId: data.id, metadata: { role: v.role } })
  const origin = process.env.NEXT_PUBLIC_SITE_URL || (await headers()).get('origin') || ''
  const link = `${origin}/invitacion/${token}`
  const sent = await sendEmail(v.email, invitationEmail({ name: v.full_name, school: session.institutionName, roleLabel: ROLE_LABEL[v.role], link, days, managed: v.role === 'estudiante', siteUrl: appBaseUrl() }), session.institutionName)
  const minor = v.role === 'estudiante' ? ' Para estudiantes menores de edad, entrégalo a su apoderado.' : ''
  return done('/admin/usuarios', sent ? `Invitación enviada por correo a ${v.full_name} (${ROLE_LABEL[v.role]}).` : `Invitación creada para ${v.full_name} (${ROLE_LABEL[v.role]}).`, {
    label: 'Enlace de invitación (se muestra una sola vez)',
    value: link,
    note: sent
      ? `Ya se envió a ${v.email}. Vence en ${days} días y sirve para una sola cuenta. Guarda este enlace solo si necesitas entregarlo por otro medio.${minor}`
      : `No se envió por correo: entrégalo tú por un canal seguro. Vence en ${days} días y sirve para una sola cuenta.${minor}`,
  })
}

export async function revokeInvitation(id: string): Promise<ActionResult> {
  const ctx = await actionContext('admin', 'directivo')
  if (!ctx) return NOT_ALLOWED
  const { error } = await ctx.db.from('invitations').update({ revoked_at: new Date().toISOString() })
    .eq('id', id).eq('institution_id', ctx.session.institutionId).is('accepted_at', null)
  if (error) return dbError(error)
  await audit(ctx.db, ctx.session, { action: 'user.invite.revoke', entity: 'invitation', entityId: id })
  return done('/admin/usuarios', 'Invitación revocada. El enlace dejó de funcionar.')
}

// ── Cuentas ─────────────────────────────────────────────────────────────────
const userUpdate = z.object({
  full_name: z.string({ required_error: 'Ingresa el nombre.' }).trim().min(3, 'Ingresa el nombre completo.').max(160),
  phone: z.string().trim().max(30).optional(),
  birth_date: optionalDate,
})

/** Confirma que el usuario pertenece al colegio del administrador y devuelve su pertenencia. */
async function memberOf(ctx: NonNullable<Awaited<ReturnType<typeof actionContext>>>, userId: string) {
  const { data } = await ctx.db.from('institution_memberships').select('id, role, status')
    .eq('institution_id', ctx.session.institutionId).eq('user_id', userId).maybeSingle()
  return data as { id: string; role: Role; status: string } | null
}

export async function updateUser(userId: string, form: FormData): Promise<ActionResult> {
  const ctx = await actionContext('admin')
  if (!ctx) return NOT_ALLOWED
  const parsed = parseForm(userUpdate, form)
  if ('error' in parsed) return parsed.error
  if (!(await memberOf(ctx, userId))) return fail('Usuario no encontrado.')
  const { error } = await ctx.db.from('profiles').update({
    full_name: parsed.data.full_name, phone: parsed.data.phone ?? null, birth_date: parsed.data.birth_date ?? null,
  }).eq('id', userId)
  if (error) return dbError(error)
  await audit(ctx.db, ctx.session, { action: 'user.update', entity: 'profile', entityId: userId })
  return done('/admin/usuarios', 'Datos actualizados.')
}

export async function changeRole(userId: string, form: FormData): Promise<ActionResult> {
  const ctx = await actionContext('admin')
  if (!ctx) return NOT_ALLOWED
  const parsed = parseForm(z.object({ role: roleEnum }), form)
  if ('error' in parsed) return parsed.error
  if (userId === ctx.session.userId) return fail('No puedes cambiar tu propio rol.')
  const member = await memberOf(ctx, userId)
  if (!member) return fail('Usuario no encontrado.')
  if (member.role === parsed.data.role) return ok('El usuario ya tiene ese rol.')
  const { error } = await ctx.db.from('institution_memberships').update({ role: parsed.data.role }).eq('id', member.id)
  if (error) return dbError(error)
  await audit(ctx.db, ctx.session, { action: 'user.role', entity: 'membership', entityId: userId, metadata: { from: member.role, to: parsed.data.role } })
  return done('/admin/usuarios', `Rol actualizado a ${ROLE_LABEL[parsed.data.role]}.`)
}

/** Desactivar, reactivar o retirar de la institución. Ninguna de las tres borra registros académicos. */
export async function setMemberStatus(userId: string, status: 'active' | 'suspended' | 'removed'): Promise<ActionResult> {
  const ctx = await actionContext('admin')
  if (!ctx) return NOT_ALLOWED
  if (userId === ctx.session.userId) return fail('No puedes modificar tu propia cuenta.')
  const member = await memberOf(ctx, userId)
  if (!member) return fail('Usuario no encontrado.')
  const { error } = await ctx.db.from('institution_memberships').update({ status }).eq('id', member.id)
  if (error) return dbError(error)
  // Sin pertenencia activa RLS ya no entrega datos; además se cierran las sesiones abiertas.
  if (status !== 'active') await ctx.db.rpc('admin_revoke_sessions', { p_inst: ctx.session.institutionId, p_user: userId })
  const action = { active: 'user.reactivate', suspended: 'user.suspend', removed: 'user.remove' }[status]
  await audit(ctx.db, ctx.session, { action, entity: 'membership', entityId: userId })
  return done('/admin/usuarios', { active: 'Cuenta reactivada.', suspended: 'Cuenta desactivada y sesiones cerradas.', removed: 'Usuario retirado de la institución. Sus registros académicos se conservan.' }[status])
}

export async function revokeSessions(userId: string): Promise<ActionResult> {
  const ctx = await actionContext('admin')
  if (!ctx) return NOT_ALLOWED
  const { data, error } = await ctx.db.rpc('admin_revoke_sessions', { p_inst: ctx.session.institutionId, p_user: userId })
  if (error) return fail('No se pudieron revocar las sesiones.')
  await audit(ctx.db, ctx.session, { action: 'user.sessions.revoke', entity: 'profile', entityId: userId, metadata: { sessions: data } })
  return ok(`Sesiones cerradas: ${data ?? 0}. El usuario deberá iniciar sesión de nuevo.`)
}

export async function requestDeletion(userId: string, form: FormData): Promise<ActionResult> {
  const ctx = await actionContext('admin')
  if (!ctx) return NOT_ALLOWED
  const parsed = parseForm(z.object({ reason: z.string({ required_error: 'Indica el motivo.' }).trim().min(5, 'Describe el motivo de la solicitud.').max(1000) }), form)
  if ('error' in parsed) return parsed.error
  if (userId === ctx.session.userId) return fail('No puedes solicitar la eliminación de tu propia cuenta.')
  if (!(await memberOf(ctx, userId))) return fail('Usuario no encontrado.')
  const { error } = await ctx.db.from('deletion_requests').insert({
    institution_id: ctx.session.institutionId, user_id: userId, requested_by: ctx.session.userId, reason: parsed.data.reason,
  })
  if (error) return dbError(error)
  await audit(ctx.db, ctx.session, { action: 'user.deletion.request', entity: 'profile', entityId: userId })
  return done('/admin/usuarios', 'Solicitud de eliminación registrada. Queda pendiente de resolución.')
}

/** Resuelve una solicitud de eliminación anonimizando la cuenta: se borran los datos personales y el acceso,
 *  pero las notas, entregas y asistencia quedan asociadas a un perfil sin identidad. */
export async function anonymizeUser(requestId: string): Promise<ActionResult> {
  const ctx = await actionContext('admin')
  if (!ctx) return NOT_ALLOWED
  if (!hasServiceRole()) return fail(SERVICE_ROLE_MISSING)
  const { session, db } = ctx
  const { data: request } = await db.from('deletion_requests').select('id, user_id, status')
    .eq('id', requestId).eq('institution_id', session.institutionId).maybeSingle()
  if (!request || request.status !== 'pending') return fail('La solicitud no existe o ya fue resuelta.')
  if (request.user_id === session.userId) return fail('No puedes anonimizar tu propia cuenta.')

  const admin = adminClient()
  // Una cuenta que también pertenece a otro colegio no se puede anonimizar desde aquí.
  const { data: others } = await admin.from('institution_memberships').select('institution_id').eq('user_id', request.user_id)
  if ((others ?? []).some(m => m.institution_id !== session.institutionId)) {
    return fail('La cuenta pertenece también a otra institución. Retírala de este colegio en lugar de anonimizarla.')
  }

  const { error: authError } = await admin.auth.admin.updateUserById(request.user_id, {
    email: `anon-${request.user_id}@anonimo.invalid`, password: randomBytes(32).toString('base64url'),
    user_metadata: {}, ban_duration: '876000h',
  })
  if (authError) return fail('No se pudo anonimizar la cuenta en el servicio de autenticación.')
  await admin.from('profiles').update({ full_name: 'Usuario anonimizado', email: null, phone: null, birth_date: null, anonymized_at: new Date().toISOString() }).eq('id', request.user_id)
  await admin.from('person_records').delete().eq('user_id', request.user_id)   // RUN, domicilio y contacto de emergencia
  await admin.from('institution_memberships').update({ status: 'removed', status_reason: 'anonimizado' }).eq('user_id', request.user_id).eq('institution_id', session.institutionId)
  await db.from('deletion_requests').update({ status: 'anonymized', resolved_by: session.userId, resolved_at: new Date().toISOString() }).eq('id', requestId)
  await audit(db, session, { action: 'user.anonymize', entity: 'profile', entityId: request.user_id })
  return done('/admin/usuarios', 'Cuenta anonimizada. Los registros académicos se conservan sin datos personales.')
}

export async function rejectDeletion(requestId: string): Promise<ActionResult> {
  const ctx = await actionContext('admin')
  if (!ctx) return NOT_ALLOWED
  const { error } = await ctx.db.from('deletion_requests').update({ status: 'rejected', resolved_by: ctx.session.userId, resolved_at: new Date().toISOString() })
    .eq('id', requestId).eq('institution_id', ctx.session.institutionId).eq('status', 'pending')
  if (error) return dbError(error)
  return done('/admin/usuarios', 'Solicitud rechazada.')
}

// ── Apoderados ──────────────────────────────────────────────────────────────
export async function linkGuardian(form: FormData): Promise<ActionResult> {
  const ctx = await actionContext('admin')
  if (!ctx) return NOT_ALLOWED
  const parsed = parseForm(z.object({ guardian_id: uuid, student_id: uuid, relationship: z.string().trim().min(2).max(40).default('apoderado') }), form)
  if ('error' in parsed) return parsed.error
  const guardian = await memberOf(ctx, parsed.data.guardian_id)
  if (guardian?.role !== 'apoderado') return fail('La persona seleccionada no es apoderado de este colegio.')
  const { error } = await ctx.db.from('guardian_student_links').insert({ institution_id: ctx.session.institutionId, ...parsed.data })
  if (error) return dbError(error)
  await audit(ctx.db, ctx.session, { action: 'guardian.link', entity: 'profile', entityId: parsed.data.student_id, metadata: { guardian: parsed.data.guardian_id } })
  return done('/admin/usuarios', 'Apoderado vinculado al estudiante.')
}

export async function unlinkGuardian(linkId: string): Promise<ActionResult> {
  const ctx = await actionContext('admin')
  if (!ctx) return NOT_ALLOWED
  const { error } = await ctx.db.from('guardian_student_links').delete().eq('id', linkId).eq('institution_id', ctx.session.institutionId)
  if (error) return dbError(error)
  await audit(ctx.db, ctx.session, { action: 'guardian.unlink', entity: 'guardian_link', entityId: linkId })
  return done('/admin/usuarios', 'Vínculo eliminado.')
}

// ── Estructura académica ────────────────────────────────────────────────────
const period = z.object({
  name: z.string({ required_error: 'Ingresa el nombre.' }).trim().min(2).max(80),
  year: z.coerce.number({ invalid_type_error: 'Año inválido.' }).int().min(2000).max(2100),
  starts_on: z.string({ required_error: 'Indica el inicio.' }).regex(/^\d{4}-\d{2}-\d{2}$/),
  ends_on: z.string({ required_error: 'Indica el término.' }).regex(/^\d{4}-\d{2}-\d{2}$/),
}).refine(v => v.ends_on > v.starts_on, { path: ['ends_on'], message: 'El término debe ser posterior al inicio.' })

export async function createPeriod(form: FormData): Promise<ActionResult> {
  const ctx = await actionContext('admin', 'directivo')
  if (!ctx) return NOT_ALLOWED
  const parsed = parseForm(period, form)
  if ('error' in parsed) return parsed.error
  const { error } = await ctx.db.from('academic_periods').insert({ institution_id: ctx.session.institutionId, ...parsed.data })
  if (error) return dbError(error)
  await audit(ctx.db, ctx.session, { action: 'academic.create', entity: 'period', metadata: { name: parsed.data.name } })
  return done('/admin/academico', 'Periodo académico creado.')
}

export async function setCurrentPeriod(id: string): Promise<ActionResult> {
  const ctx = await actionContext('admin', 'directivo')
  if (!ctx) return NOT_ALLOWED
  const inst = ctx.session.institutionId
  await ctx.db.from('academic_periods').update({ is_current: false }).eq('institution_id', inst).eq('is_current', true)
  const { error } = await ctx.db.from('academic_periods').update({ is_current: true }).eq('id', id).eq('institution_id', inst)
  if (error) return dbError(error)
  return done('/admin/academico', 'Periodo vigente actualizado.')
}

export async function createGradeLevel(form: FormData): Promise<ActionResult> {
  const ctx = await actionContext('admin', 'directivo')
  if (!ctx) return NOT_ALLOWED
  const parsed = parseForm(z.object({
    name: z.string({ required_error: 'Ingresa el nombre.' }).trim().min(2).max(60),
    stage: z.enum(['parvularia', 'basica', 'media'], { errorMap: () => ({ message: 'Selecciona el nivel de enseñanza.' }) }),
    sort_order: z.coerce.number().int().min(0).max(20).default(0),
  }), form)
  if ('error' in parsed) return parsed.error
  const { error } = await ctx.db.from('grade_levels').insert({ institution_id: ctx.session.institutionId, ...parsed.data })
  if (error) return dbError(error)
  return done('/admin/academico', 'Grado creado.')
}

export async function createCourse(form: FormData): Promise<ActionResult> {
  const ctx = await actionContext('admin', 'directivo')
  if (!ctx) return NOT_ALLOWED
  const parsed = parseForm(z.object({
    grade_level_id: uuid, period_id: uuid,
    section: z.string({ required_error: 'Indica la letra del curso.' }).trim().min(1).max(10),
    head_teacher_id: uuid.optional(),
  }), form)
  if ('error' in parsed) return parsed.error
  const { session, db } = ctx
  const { data: level } = await db.from('grade_levels').select('name').eq('id', parsed.data.grade_level_id).eq('institution_id', session.institutionId).maybeSingle()
  if (!level) return fail('Grado no encontrado.')
  const section = parsed.data.section.toUpperCase()
  const { error } = await db.from('courses').insert({
    institution_id: session.institutionId, grade_level_id: parsed.data.grade_level_id, period_id: parsed.data.period_id,
    section, name: `${level.name} ${section}`, head_teacher_id: parsed.data.head_teacher_id ?? null,
  })
  if (error) return dbError(error)
  await audit(db, session, { action: 'academic.create', entity: 'course', metadata: { name: `${level.name} ${section}` } })
  return done('/admin/academico', `Curso ${level.name} ${section} creado.`)
}

export async function createSubject(form: FormData): Promise<ActionResult> {
  const ctx = await actionContext('admin', 'directivo')
  if (!ctx) return NOT_ALLOWED
  const parsed = parseForm(z.object({
    name: z.string({ required_error: 'Ingresa el nombre.' }).trim().min(2, 'Ingresa el nombre de la asignatura.').max(80),
    code: z.string().trim().max(10).optional(),
  }), form)
  if ('error' in parsed) return parsed.error
  const { error } = await ctx.db.from('subjects').insert({ institution_id: ctx.session.institutionId, name: parsed.data.name, code: parsed.data.code?.toUpperCase() ?? null })
  if (error) return dbError(error)
  await audit(ctx.db, ctx.session, { action: 'academic.create', entity: 'subject', metadata: { name: parsed.data.name } })
  return done('/admin/academico', `Asignatura ${parsed.data.name} creada.`)
}

export async function assignTeacher(form: FormData): Promise<ActionResult> {
  const ctx = await actionContext('admin', 'directivo')
  if (!ctx) return NOT_ALLOWED
  const parsed = parseForm(z.object({ course_id: uuid, subject_id: uuid, teacher_id: uuid }), form)
  if ('error' in parsed) return parsed.error
  const teacher = await memberOf(ctx, parsed.data.teacher_id)
  if (teacher?.role !== 'docente' || teacher.status !== 'active') return fail('Selecciona un docente activo del colegio.')
  // Una asignatura por curso tiene un solo docente: reasignar reemplaza al anterior.
  const { error } = await ctx.db.from('teacher_assignments')
    .upsert({ institution_id: ctx.session.institutionId, ...parsed.data }, { onConflict: 'course_id,subject_id' })
  if (error) return dbError(error)
  return done('/admin/academico', 'Docente asignado.')
}

export async function deleteAcademic(kind: 'course' | 'subject' | 'teacher_assignment' | 'grade_level' | 'period', id: string): Promise<ActionResult> {
  const ctx = await actionContext('admin', 'directivo')
  if (!ctx) return NOT_ALLOWED
  const table = { course: 'courses', subject: 'subjects', teacher_assignment: 'teacher_assignments', grade_level: 'grade_levels', period: 'academic_periods' }[kind]
  const { error } = await ctx.db.from(table).delete().eq('id', id).eq('institution_id', ctx.session.institutionId)
  if (error) {
    return error.code === '23503'
      ? fail('No se puede eliminar porque tiene registros asociados (matrículas, tareas o notas). Esos registros se conservan.')
      : dbError(error)
  }
  await audit(ctx.db, ctx.session, { action: 'academic.delete', entity: kind, entityId: id })
  return done('/admin/academico', 'Eliminado.')
}

// ── Matrículas ──────────────────────────────────────────────────────────────
export async function enrollStudent(form: FormData): Promise<ActionResult> {
  const ctx = await actionContext('admin')
  if (!ctx) return NOT_ALLOWED
  const parsed = parseForm(z.object({ course_id: uuid, student_id: uuid }), form)
  if ('error' in parsed) return parsed.error
  const { session, db } = ctx
  const student = await memberOf(ctx, parsed.data.student_id)
  if (student?.role !== 'estudiante') return fail('La persona seleccionada no es estudiante de este colegio.')

  // Un estudiante tiene una sola matrícula activa: matricular en otro curso retira la anterior.
  await db.from('course_enrollments').update({ status: 'withdrawn' })
    .eq('institution_id', session.institutionId).eq('student_id', parsed.data.student_id).eq('status', 'active').neq('course_id', parsed.data.course_id)
  const { error } = await db.from('course_enrollments')
    // Volver a un curso anterior reactiva esa matrícula; la decisión de continuidad parte de nuevo.
    .upsert({ institution_id: session.institutionId, ...parsed.data, status: 'active', continuity: 'pending', closed_at: null }, { onConflict: 'course_id,student_id' })
  if (error) return dbError(error)
  await audit(db, session, { action: 'enrollment.create', entity: 'profile', entityId: parsed.data.student_id, metadata: { course: parsed.data.course_id } })
  return done('/admin/matriculas', 'Estudiante matriculado.')
}

export async function withdrawEnrollment(id: string): Promise<ActionResult> {
  const ctx = await actionContext('admin')
  if (!ctx) return NOT_ALLOWED
  const { error } = await ctx.db.from('course_enrollments').update({ status: 'withdrawn' }).eq('id', id).eq('institution_id', ctx.session.institutionId)
  if (error) return dbError(error)
  await audit(ctx.db, ctx.session, { action: 'enrollment.withdraw', entity: 'enrollment', entityId: id })
  return done('/admin/matriculas', 'Matrícula retirada. El historial académico se conserva.')
}

// ── Configuración ───────────────────────────────────────────────────────────
export async function updateInstitution(form: FormData): Promise<ActionResult> {
  const ctx = await actionContext('admin')
  if (!ctx) return NOT_ALLOWED
  const parsed = parseForm(z.object({
    name: z.string({ required_error: 'Ingresa el nombre.' }).trim().min(2).max(160),
    rbd: z.string().trim().max(20).optional(),
    dependency: z.enum(['municipal', 'slep', 'particular_subvencionado', 'particular_pagado']),
    commune: z.string().trim().max(80).optional(),
    region: z.string().trim().max(80).optional(),
    ai_enabled: z.enum(['on']).optional(),
    ai_daily_limit_per_user: z.coerce.number().int().min(0, 'El límite no puede ser negativo.').max(500).optional(),
    invitation_ttl_days: z.coerce.number().int().min(1).max(30).optional(),
    urgent_protocol: z.string().trim().max(2000).optional(),
  }), form)
  if ('error' in parsed) return parsed.error
  const { session, db } = ctx
  const v = parsed.data
  const [a, b] = await Promise.all([
    db.from('institutions').update({ name: v.name, rbd: v.rbd ?? null, dependency: v.dependency, commune: v.commune ?? null, region: v.region ?? null }).eq('id', session.institutionId),
    // Los ajustes técnicos (límites de ARIA, vigencia de invitaciones) solo cambian si el formulario los envía:
    // la pantalla de secretaría no los incluye y no debe alterarlos.
    db.from('institution_settings').update({
      urgent_protocol: v.urgent_protocol ?? null,
      ...(v.ai_daily_limit_per_user != null ? { ai_enabled: v.ai_enabled === 'on', ai_daily_limit_per_user: v.ai_daily_limit_per_user } : {}),
      ...(v.invitation_ttl_days != null ? { invitation_ttl_days: v.invitation_ttl_days } : {}),
    }).eq('institution_id', session.institutionId),
  ])
  if (a.error || b.error) return dbError(a.error ?? b.error)
  await audit(db, session, { action: 'settings.update', entity: 'institution' })
  revalidatePath('/', 'layout')
  return ok('Configuración guardada.')
}
