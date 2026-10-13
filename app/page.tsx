import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { getPlatformUser } from '@/lib/auth/platform'
import { ROLE_HOME } from '@/lib/roles'
import { Landing } from '@/components/landing/landing'

export const metadata: Metadata = {
  title: 'Vanty School · Toda la comunidad educativa, conectada',
  description: 'Tareas, notas, asistencia, comunicación con las familias y bienestar escolar en una sola plataforma, con ARIA como asistente de inteligencia educativa.',
}

/** Con sesión, cada persona va directo a su panel. Sin sesión, se muestra la portada pública. */
export default async function Root() {
  const session = await getSession()
  if (session) redirect(ROLE_HOME[session.role])
  if (await getPlatformUser()) redirect('/plataforma')
  return <Landing />
}
