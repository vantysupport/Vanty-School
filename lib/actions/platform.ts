'use server'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { platformContext } from '@/lib/auth/platform'
import { fail, NOT_ALLOWED, ok, parseForm, type ActionResult } from '@/lib/actions/result'
import { hashToken, newToken } from '@/lib/tokens'
import { DEPENDENCIES } from '@/lib/platform'
import { ROLE_LABEL } from '@/lib/roles'
import { appBaseUrl, sendEmail } from '@/lib/email/send'
import { invitationEmail, staffInvitationEmail } from '@/lib/email/templates'

// Acciones del equipo Vanty. Cada una: 1) exige ser del equipo, 2) llama a una función platform_* de la base,
// que vuelve a comprobarlo y deja registro en la auditoría del colegio. Ninguna usa la clave service_role.

const uuid = z.string().uuid('Identificador inválido.')
const text = (max: number) => z.string().trim().max(max).optional()
const dependency = z.enum(Object.keys(DEPENDENCIES) as [string, ...string[]], { errorMap: () => ({ message: 'Selecciona la dependencia.' }) })
const person = {
  full_name: z.string({ required_error: 'Ingresa el nombre completo.' }).trim().min(3, 'Ingresa el nombre completo.').max(160),
  email: z.string({ required_error: 'Ingresa el correo.' }).trim().toLowerCase().email('Correo inválido.'),
}

const refresh = () => revalidatePath('/plataforma', 'layout')
const origin = async () => process.env.NEXT_PUBLIC_SITE_URL || (await headers()).get('origin') || ''

/** Los mensajes de las funciones platform_* ya están escritos para la persona; el resto se generaliza. */
function rpcError(error: { code?: string; message?: string }): ActionResult {
  if (error.code === '42501') return NOT_ALLOWED
  if (['23505', '23514', 'P0002'].includes(error.code ?? '') && error.message) return fail(error.message)
  console.error('[platform]', error.code, error.message)
  return fail('No se pudo completar. Inténtalo de nuevo.')
}

const schoolName = z.string({ required_error: 'Ingresa el nombre del colegio.' }).trim().min(2, 'Ingresa el nombre del colegio.').max(160)
const branding = {
  brand_color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color inválido.').optional(),
  address: text(160), phone: text(40),
}
const school = z.object({
  name: schoolName,
  rbd: text(20), dependency, commune: text(80), region: text(80), ...branding,
  year: z.coerce.number({ invalid_type_error: 'Ingresa el año escolar.' }).int().min(2000, 'Año inválido.').max(2100, 'Año inválido.'),
  stages: z.array(z.enum(['parvularia', 'basica', 'media'])).min(1, 'Elige al menos un nivel de enseñanza.'),
  subjects: z.literal('on').optional(),
  admin_name: text(160),
  admin_email: z.string().trim().toLowerCase().email('Correo inválido.').optional(),
}).refine(v => !v.admin_email || (v.admin_name?.length ?? 0) >= 3, { path: ['admin_name'], message: 'Ingresa el nombre de quien administrará el colegio.' })
  .refine(v => !v.admin_name || !!v.admin_email, { path: ['admin_email'], message: 'Ingresa su correo.' })

export type CreateSchoolResult =
  | { ok: true; id: string; name: string; invite: { name: string; email: string; link: string; days: number; sent: boolean } | null; inviteFailed: boolean }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }

/** Crea el colegio con su base lista y, si se indicó, invita a su secretaría. Devuelve el id para subir el logo después. */
export async function createSchool(form: FormData): Promise<CreateSchoolResult> {
  const ctx = await platformContext()
  if (!ctx) return { ok: false, error: 'No tienes permiso para realizar esta acción.' }
  if (!form.getAll('stages[]').length) return { ok: false, error: 'Revisa los campos marcados.', fieldErrors: { stages: 'Elige al menos un nivel de enseñanza.' } }
  const parsed = parseForm(school, form)
  if ('error' in parsed) return parsed.error as CreateSchoolResult
  const v = parsed.data

  const { data: id, error } = await ctx.db.rpc('platform_create_institution', {
    p_name: v.name, p_rbd: v.rbd ?? '', p_dependency: v.dependency, p_commune: v.commune ?? '', p_region: v.region ?? '',
    p_year: v.year, p_stages: v.stages, p_subjects: v.subjects === 'on',
  })
  if (error) return rpcError(error) as CreateSchoolResult
  if (v.brand_color || v.address || v.phone) await ctx.db.rpc('platform_set_branding', { p_inst: id, p_color: v.brand_color ?? '', p_address: v.address ?? '', p_phone: v.phone ?? '' })
  refresh()

  const created = { ok: true as const, id: id as string, name: v.name }
  if (!v.admin_email) return { ...created, invite: null, inviteFailed: false }
  const token = newToken()
  const { data: days, error: inviteError } = await ctx.db.rpc('platform_invite', { p_inst: id, p_email: v.admin_email, p_full_name: v.admin_name, p_role: 'admin', p_token_hash: hashToken(token) })
  if (inviteError) return { ...created, invite: null, inviteFailed: true }
  const link = `${await origin()}/invitacion/${token}`
  const sent = await sendEmail(v.admin_email, invitationEmail({ name: v.admin_name!, school: v.name, roleLabel: ROLE_LABEL.admin, link, days, siteUrl: appBaseUrl() }))
  return { ...created, invite: { name: v.admin_name!, email: v.admin_email, link, days: days as number, sent }, inviteFailed: false }
}

const delivery = (sent: boolean, email: string) => sent ? `Ya se envió por correo a ${email}.` : 'No se envió por correo: entrégalo tú por un canal seguro.'

const schoolData = z.object({ name: schoolName, rbd: text(20), dependency, commune: text(80), region: text(80), ...branding })

export async function updateSchool(id: string, form: FormData): Promise<ActionResult> {
  const ctx = await platformContext()
  if (!ctx || !uuid.safeParse(id).success) return NOT_ALLOWED
  const parsed = parseForm(schoolData, form)
  if ('error' in parsed) return parsed.error
  const v = parsed.data
  const { error } = await ctx.db.rpc('platform_update_institution', { p_inst: id, p_name: v.name, p_rbd: v.rbd ?? '', p_dependency: v.dependency, p_commune: v.commune ?? '', p_region: v.region ?? '' })
  if (error) return rpcError(error)
  const { error: brandError } = await ctx.db.rpc('platform_set_branding', { p_inst: id, p_color: v.brand_color ?? '', p_address: v.address ?? '', p_phone: v.phone ?? '' })
  if (brandError) return rpcError(brandError)
  refresh()
  return ok('Datos del colegio actualizados.')
}

/** Registra el logo que el navegador ya subió a la carpeta del colegio (o lo quita con null) y borra el anterior. */
export async function setSchoolLogo(id: string, path: string | null): Promise<ActionResult> {
  const ctx = await platformContext()
  if (!ctx || !uuid.safeParse(id).success) return NOT_ALLOWED
  if (path && (!path.startsWith(`${id}/`) || path.includes('..') || !/\.(png|jpg|webp)$/.test(path))) return fail('Archivo de logo inválido.')
  const { data: old, error } = await ctx.db.rpc('platform_set_logo', { p_inst: id, p_path: path ?? '' })
  if (error) return rpcError(error)
  if (old && old !== path) await ctx.db.storage.from('school-logos').remove([old as string])
  refresh()
  revalidatePath('/', 'layout')
  return ok(path ? 'Logo actualizado.' : 'Logo eliminado.')
}

export async function setSchoolStatus(id: string, status: 'active' | 'suspended'): Promise<ActionResult> {
  const ctx = await platformContext()
  if (!ctx || !uuid.safeParse(id).success) return NOT_ALLOWED
  const { error } = await ctx.db.rpc('platform_set_status', { p_inst: id, p_status: status })
  if (error) return rpcError(error)
  refresh()
  return ok(status === 'suspended' ? 'Colegio suspendido: sus cuentas no pueden entrar hasta que se reactive.' : 'Colegio reactivado.')
}

const invite = z.object({ ...person, role: z.enum(['admin', 'directivo'], { errorMap: () => ({ message: 'Elige secretaría o dirección.' }) }) })

export async function inviteSchoolAdmin(id: string, form: FormData): Promise<ActionResult> {
  const ctx = await platformContext()
  if (!ctx || !uuid.safeParse(id).success) return NOT_ALLOWED
  const parsed = parseForm(invite, form)
  if ('error' in parsed) return parsed.error
  const v = parsed.data
  const token = newToken()
  const { data: days, error } = await ctx.db.rpc('platform_invite', { p_inst: id, p_email: v.email, p_full_name: v.full_name, p_role: v.role, p_token_hash: hashToken(token) })
  if (error) return rpcError(error)
  refresh()
  const { data: info } = await ctx.db.rpc('platform_institution', { p_inst: id })
  const schoolLabel = (info as { name?: string } | null)?.name ?? 'Tu colegio'
  const link = `${await origin()}/invitacion/${token}`
  const sent = await sendEmail(v.email, invitationEmail({ name: v.full_name, school: schoolLabel, roleLabel: ROLE_LABEL[v.role], link, days, siteUrl: appBaseUrl() }))
  return ok(`Invitación creada para ${v.full_name}.`, {
    label: 'Enlace de invitación (se muestra una sola vez)',
    value: link,
    note: `${delivery(sent, v.email)} Vence en ${days} días y sirve para una sola cuenta.`,
  })
}

export async function revokeSchoolInvitation(invitationId: string): Promise<ActionResult> {
  const ctx = await platformContext()
  if (!ctx || !uuid.safeParse(invitationId).success) return NOT_ALLOWED
  const { error } = await ctx.db.rpc('platform_revoke_invitation', { p_id: invitationId })
  if (error) return rpcError(error)
  refresh()
  return ok('Invitación revocada.')
}

// ── Equipo Vanty ────────────────────────────────────────────────────────────
export async function inviteStaff(form: FormData): Promise<ActionResult> {
  const ctx = await platformContext()
  if (!ctx) return NOT_ALLOWED
  const parsed = parseForm(z.object(person), form)
  if ('error' in parsed) return parsed.error
  const v = parsed.data
  const token = newToken()
  const { error } = await ctx.db.rpc('platform_invite_staff', { p_email: v.email, p_full_name: v.full_name, p_token_hash: hashToken(token) })
  if (error) return rpcError(error)
  refresh()
  const link = `${await origin()}/invitacion/${token}`
  const sent = await sendEmail(v.email, staffInvitationEmail({ name: v.full_name, link, siteUrl: appBaseUrl() }))
  return ok(`Invitación creada para ${v.full_name}.`, {
    label: 'Enlace de invitación al equipo Vanty (se muestra una sola vez)',
    value: link,
    note: `${delivery(sent, v.email)} Vence en 7 días. Quien lo use podrá crear y suspender colegios: entrégalo solo a esa persona.`,
  })
}

export async function revokeStaffInvitation(id: string): Promise<ActionResult> {
  const ctx = await platformContext()
  if (!ctx || !uuid.safeParse(id).success) return NOT_ALLOWED
  const { error } = await ctx.db.rpc('platform_revoke_staff_invitation', { p_id: id })
  if (error) return rpcError(error)
  refresh()
  return ok('Invitación revocada.')
}

export async function removeStaff(userId: string): Promise<ActionResult> {
  const ctx = await platformContext()
  if (!ctx || !uuid.safeParse(userId).success) return NOT_ALLOWED
  const { error } = await ctx.db.rpc('platform_remove_staff', { p_user: userId })
  if (error) return rpcError(error)
  refresh()
  return ok('Ya no es parte del equipo Vanty.')
}
