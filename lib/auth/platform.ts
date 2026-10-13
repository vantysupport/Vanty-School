import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient, type DB } from '@/lib/supabase/server'

export type PlatformUser = { userId: string; email: string; fullName: string; avatarPath: string | null }

/** ¿Quien inició sesión es parte del equipo Vanty? No es un rol dentro de un colegio: es un nivel aparte,
 *  que crea y acompaña colegios sin acceso a sus datos. Se resuelve una vez por petición. */
export const getPlatformUser = cache(async (): Promise<PlatformUser | null> => {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  const user = auth?.user
  if (!user) return null
  const [{ data: staff }, { data: profile }] = await Promise.all([
    supabase.from('platform_staff').select('user_id').eq('user_id', user.id).maybeSingle(),
    supabase.from('profiles').select('full_name, avatar_path').eq('id', user.id).maybeSingle(),
  ])
  if (!staff) return null
  return { userId: user.id, email: user.email ?? '', fullName: profile?.full_name || user.email || '', avatarPath: (profile?.avatar_path as string | null) ?? null }
})

export async function requirePlatform(): Promise<PlatformUser> {
  const user = await getPlatformUser()
  if (!user) redirect('/login')
  return user
}

/** Para Server Actions: usuario del equipo + cliente con su sesión. La base vuelve a comprobarlo en cada función. */
export async function platformContext(): Promise<{ user: PlatformUser; db: DB } | null> {
  const user = await getPlatformUser()
  if (!user) return null
  return { user, db: await createClient() }
}
