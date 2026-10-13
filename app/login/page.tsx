import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { ROLE_HOME } from '@/lib/roles'
import { demoSignIn, signIn } from '@/lib/actions/auth'
import { AuthShell } from '@/components/auth/auth-shell'
import { LoginPanel } from '@/components/auth/auth-form'

export const metadata: Metadata = { title: 'Iniciar sesión' }

export default async function LoginPage() {
  const session = await getSession()
  if (session) redirect(ROLE_HOME[session.role])
  const demo = process.env.NEXT_PUBLIC_DEMO_MODE === 'true' && !!process.env.DEMO_PASSWORD

  return (
    <AuthShell>
      <LoginPanel signIn={signIn} demoSignIn={demo ? demoSignIn : undefined} />
    </AuthShell>
  )
}
