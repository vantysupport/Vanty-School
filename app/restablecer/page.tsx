import type { Metadata } from 'next'
import { updatePassword } from '@/lib/actions/auth'
import { AuthShell } from '@/components/auth/auth-shell'
import { AuthForm, AuthHeading, AuthInput } from '@/components/auth/auth-form'

export const metadata: Metadata = { title: 'Nueva contraseña' }

export default function ResetPage() {
  return (
    <AuthShell>
      <AuthHeading title="Crea tu nueva contraseña" subtitle="Usa al menos 10 caracteres y evita contraseñas que uses en otros sitios." />
      <div className="mt-7">
        <AuthForm action={updatePassword} submitLabel="Guardar contraseña">
          <AuthInput label="Nueva contraseña" icon="lock" name="password" type="password" autoComplete="new-password" minLength={10} required />
          <AuthInput label="Repite la contraseña" icon="lock" name="confirm" type="password" autoComplete="new-password" minLength={10} required />
        </AuthForm>
      </div>
    </AuthShell>
  )
}
