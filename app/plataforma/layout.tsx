import type { Metadata } from 'next'
import { requirePlatform } from '@/lib/auth/platform'
import { getSession } from '@/lib/auth/session'
import { ROLE_HOME, type NavItem } from '@/lib/roles'
import { Shell } from '@/components/shell/shell'

export const metadata: Metadata = { title: 'Plataforma' }

/** Panel del equipo Vanty: crea colegios y acompaña su puesta en marcha. No pertenece a ningún colegio. */
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePlatform()
  const session = await getSession()
  const nav: NavItem[] = [
    { href: '/plataforma', label: 'Colegios', icon: 'building' },
    { href: '/plataforma/equipo', label: 'Equipo Vanty', icon: 'users' },
    ...(session ? [{ href: ROLE_HOME[session.role], label: 'Volver a mi colegio', icon: 'home' }] : []),
  ]
  return (
    <Shell nav={nav} profileHref={null} institutions={[]}
      user={{ id: user.userId, avatarVersion: user.avatarPath, name: user.fullName, email: user.email, roleLabel: 'Equipo Vanty' }}
      institution={{ id: 'plataforma', name: 'Plataforma', isDemo: false }}>
      {children}
    </Shell>
  )
}
