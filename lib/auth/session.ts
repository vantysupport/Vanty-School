import 'server-only'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient, type DB } from '@/lib/supabase/server'
import { isRole, ROLE_HOME, type Role } from '@/lib/roles'

export const INSTITUTION_COOKIE = 'vs_inst'

export type Membership = { institutionId: string; institutionName: string; isDemo: boolean; role: Role; logoPath: string | null }

export type Session = Membership & {
  userId: string
  email: string
  fullName: string
  avatarPath: string | null
  memberships: Membership[]
}

/** Sesión + pertenencia activa. Se resuelve una vez por petición. Devuelve null si no hay acceso vigente. */
export const getSession = cache(async (): Promise<Session | null> => {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  const user = auth?.user
  if (!user) return null

  const [{ data: profile }, { data: rows }] = await Promise.all([
    supabase.from('profiles').select('full_name, avatar_path').eq('id', user.id).maybeSingle(),
    supabase
      .from('institution_memberships')
      .select('institution_id, role, institutions(name, is_demo, status, logo_path)')
      .eq('user_id', user.id)
      .eq('status', 'active'),
  ])

  type Row = { institution_id: string; role: string; institutions: { name: string; is_demo: boolean; status: string; logo_path: string | null } | null }
  const memberships: Membership[] = ((rows ?? []) as unknown as Row[])
    .filter(r => r.institutions?.status === 'active' && isRole(r.role))
    .map(r => ({
      institutionId: r.institution_id,
      institutionName: r.institutions!.name,
      isDemo: r.institutions!.is_demo,
      role: r.role as Role,
      logoPath: r.institutions!.logo_path,
    }))
  if (memberships.length === 0) return null

  const preferred = (await cookies()).get(INSTITUTION_COOKIE)?.value
  const active = memberships.find(m => m.institutionId === preferred) ?? memberships[0]
  return { ...active, userId: user.id, email: user.email ?? '', fullName: profile?.full_name || user.email || '', avatarPath: (profile?.avatar_path as string | null) ?? null, memberships }
})

/** Exige sesión y, opcionalmente, uno de los roles indicados. Redirige en vez de devolver null. */
export async function requireSession(...roles: Role[]): Promise<Session> {
  const session = await getSession()
  if (!session) redirect('/login')
  if (roles.length > 0 && !roles.includes(session.role)) redirect(ROLE_HOME[session.role])
  return session
}

/** Para Server Actions y Route Handlers: sesión + cliente RLS, o null si el rol no corresponde. */
export async function actionContext(...roles: Role[]): Promise<{ session: Session; db: DB } | null> {
  const session = await getSession()
  if (!session) return null
  if (roles.length > 0 && !roles.includes(session.role)) return null
  return { session, db: await createClient() }
}
