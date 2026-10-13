'use server'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getSession, INSTITUTION_COOKIE } from '@/lib/auth/session'
import { getPlatformUser } from '@/lib/auth/platform'
import { adminClient, hasServiceRole } from '@/lib/supabase/admin'
import { appBaseUrl, isDeliverable, mailConfigured, sendEmail } from '@/lib/email/send'
import { recoveryEmail } from '@/lib/email/templates'
import { fail, ok, parseForm, type ActionResult } from '@/lib/actions/result'
import { ROLE_HOME } from '@/lib/roles'

const DEMO_ACCOUNTS: Record<string, string> = {
  admin: 'admin@futuroandino.example',
  directivo: 'direccion@futuroandino.example',
  docente: 'mrojas@futuroandino.example',
  bienestar: 'bienestar@futuroandino.example',
  apoderado: 'ap05@futuroandino.example',
  estudiante: 'est06@futuroandino.example',
}

const credentials = z.object({
  email: z.string({ required_error: 'Ingresa tu correo.' }).trim().toLowerCase().email('Correo inválido.'),
  password: z.string({ required_error: 'Ingresa tu contraseña.' }).min(1),
})

async function finishSignIn(email: string, password: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  // Mismo mensaje para correo inexistente y contraseña errónea: no revela qué cuentas existen.
  if (error) return fail(error.status === 429 ? 'Demasiados intentos. Espera unos minutos.' : 'Correo o contraseña incorrectos.')
  const session = await getSession()
  if (!session) {
    // El equipo Vanty no pertenece a un colegio: entra a su propio panel.
    if (await getPlatformUser()) redirect('/plataforma')
    await supabase.auth.signOut()
    return fail('Tu cuenta no tiene un acceso vigente a ningún colegio. Contacta a la secretaría de tu establecimiento.')
  }
  redirect(ROLE_HOME[session.role])
}

export async function signIn(form: FormData): Promise<ActionResult> {
  const parsed = parseForm(credentials, form)
  if ('error' in parsed) return parsed.error
  return finishSignIn(parsed.data.email, parsed.data.password)
}

/** Acceso rápido del entorno de demostración. La contraseña vive solo en el servidor (DEMO_PASSWORD). */
export async function demoSignIn(form: FormData): Promise<ActionResult> {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== 'true' || !process.env.DEMO_PASSWORD) return fail('El acceso de demostración no está habilitado.')
  const email = DEMO_ACCOUNTS[String(form.get('role'))]
  if (!email) return fail('Perfil de demostración desconocido.')
  return finishSignIn(email, process.env.DEMO_PASSWORD)
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}

export async function switchInstitution(form: FormData) {
  const id = String(form.get('institution_id') ?? '')
  const session = await getSession()
  const target = session?.memberships.find(m => m.institutionId === id)
  if (!target) redirect('/login')
  ;(await cookies()).set(INSTITUTION_COOKIE, id, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * 180 })
  redirect(ROLE_HOME[target.role])
}

export async function requestPasswordReset(form: FormData): Promise<ActionResult> {
  const parsed = parseForm(credentials.pick({ email: true }), form)
  if ('error' in parsed) return parsed.error
  const origin = process.env.NEXT_PUBLIC_SITE_URL || (await headers()).get('origin') || ''
  const site = appBaseUrl()
  if (mailConfigured() && hasServiceRole() && site && isDeliverable(parsed.data.email)) {
    // Correo propio, con la marca: Supabase solo genera el token de un solo uso. Si el correo no existe no se envía
    // nada, y la respuesta es la misma.
    const { data } = await adminClient().auth.admin.generateLink({ type: 'recovery', email: parsed.data.email })
    const tokenHash = data?.properties?.hashed_token
    if (tokenHash) await sendEmail(parsed.data.email, recoveryEmail({ link: `${site}/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=recovery`, siteUrl: site }))
  } else {
    // Sin correo propio configurado, lo envía Supabase.
    const supabase = await createClient()
    await supabase.auth.resetPasswordForEmail(parsed.data.email, { redirectTo: `${origin}/auth/callback?next=/restablecer` })
  }
  // Respuesta idéntica exista o no la cuenta.
  return ok('Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.')
}

const newPassword = z.object({
  password: z.string({ required_error: 'Ingresa una contraseña.' }).min(10, 'La contraseña debe tener al menos 10 caracteres.').max(72),
  confirm: z.string({ required_error: 'Repite la contraseña.' }),
}).refine(v => v.password === v.confirm, { path: ['confirm'], message: 'Las contraseñas no coinciden.' })

export async function updatePassword(form: FormData): Promise<ActionResult> {
  const parsed = parseForm(newPassword, form)
  if ('error' in parsed) return parsed.error
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) return fail('El enlace venció. Solicita uno nuevo.')
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) return fail('No se pudo actualizar la contraseña. Prueba con una distinta.')
  redirect('/')
}
