import type { Metadata } from 'next'
import Link from 'next/link'
import { requestPasswordReset } from '@/lib/actions/auth'
import { AuthShell } from '@/components/auth/auth-shell'
import { AuthForm, AuthHeading, AuthInput } from '@/components/auth/auth-form'

export const metadata: Metadata = { title: 'Recuperar acceso' }

export default function RecoverPage() {
  return (
    <AuthShell>
      <AuthHeading title="Recupera tu acceso" subtitle="Te enviaremos un enlace seguro para crear una nueva contraseña." />
      <div className="mt-7">
        <AuthForm action={requestPasswordReset} submitLabel="Enviar enlace">
          <AuthInput label="Correo electrónico" icon="mail" name="email" type="email" required autoComplete="email" placeholder="tu@correo.com" />
        </AuthForm>
      </div>
      <Link href="/login" className="mt-6 text-center text-sm font-medium text-v-accent hover:underline">Volver a iniciar sesión</Link>
    </AuthShell>
  )
}
