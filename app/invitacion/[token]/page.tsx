import type { Metadata } from 'next'
import Link from 'next/link'
import { adminClient, hasServiceRole } from '@/lib/supabase/admin'
import { hashToken, isTokenShaped } from '@/lib/tokens'
import { acceptInvitation } from '@/lib/actions/invitations'
import { ROLE_LABEL, type Role } from '@/lib/roles'
import { fmtDate } from '@/lib/format'
import { AuthShell } from '@/components/auth/auth-shell'
import { AuthForm, AuthHeading, AuthInput } from '@/components/auth/auth-form'

export const metadata: Metadata = { title: 'Invitación' }

function Unavailable({ title, body }: { title: string; body: string }) {
  return (
    <AuthShell>
      <AuthHeading title={title} subtitle={body} />
      <Link href="/login" className="mt-6 text-sm font-medium text-v-accent hover:underline">Ir a iniciar sesión</Link>
    </AuthShell>
  )
}

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!hasServiceRole()) {
    return <Unavailable title="Activación no disponible" body="Este entorno aún no tiene configurada la clave de servicio de Supabase, necesaria para crear cuentas. Avisa a la secretaría de la plataforma." />
  }
  const { data: inv } = isTokenShaped(token)
    ? await adminClient().from('invitations')
      .select('email, full_name, role, is_managed, expires_at, accepted_at, revoked_at, institutions(name, status)')
      .eq('token_hash', hashToken(token)).maybeSingle()
    : { data: null }

  // Invitación al equipo Vanty: no pertenece a un colegio.
  if (!inv && isTokenShaped(token)) {
    const { data: staff } = await adminClient().from('platform_invitations')
      .select('email, full_name, expires_at, accepted_at, revoked_at').eq('token_hash', hashToken(token)).maybeSingle()
    if (staff && !staff.accepted_at && !staff.revoked_at && new Date(staff.expires_at).getTime() > Date.now()) {
      return (
        <AuthShell>
          <AuthHeading title={`Hola, ${staff.full_name.split(' ')[0]}`} subtitle="Te invitaron al equipo de Vanty School." />
          <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-v-sm border border-v-border bg-v-elevated p-4 text-sm">
            <dt className="text-v-subtle">Perfil</dt><dd className="font-medium">Equipo Vanty</dd>
            <dt className="text-v-subtle">Correo</dt><dd className="break-all">{staff.email}</dd>
            <dt className="text-v-subtle">Válida hasta</dt><dd>{fmtDate(staff.expires_at)}</dd>
          </dl>
          <p className="mt-3 rounded-v-sm bg-v-accent-soft px-3 py-2.5 text-sm text-v-accent">Con esta cuenta podrás crear colegios y acompañar su puesta en marcha. No da acceso a los datos de ningún colegio.</p>
          <div className="mt-6">
            <AuthForm action={acceptInvitation.bind(null, token)} submitLabel="Crear mi cuenta">
              <AuthInput label="Crea tu contraseña" icon="lock" name="password" type="password" autoComplete="new-password" minLength={10} required />
              <AuthInput label="Repite la contraseña" icon="lock" name="confirm" type="password" autoComplete="new-password" minLength={10} required />
              <label className="flex items-start gap-2.5 text-sm text-v-muted">
                <input type="checkbox" name="accept" required className="mt-0.5 size-4 accent-[var(--v-accent)]" />
                <span>Acepto las condiciones de uso de la plataforma y me comprometo a resguardar la información de los colegios.</span>
              </label>
            </AuthForm>
          </div>
        </AuthShell>
      )
    }
  }

  const institution = inv?.institutions as unknown as { name: string; status: string } | null
  const valid = inv && !inv.accepted_at && !inv.revoked_at && new Date(inv.expires_at).getTime() > Date.now() && institution?.status === 'active'
  if (!valid) {
    return <Unavailable title="Invitación no disponible" body="El enlace no es válido, ya fue usado o venció. Solicita una nueva invitación a la secretaría de tu colegio." />
  }

  return (
    <AuthShell>
      <AuthHeading title={`Hola, ${inv.full_name.split(' ')[0]}`} subtitle={`${institution!.name} te invitó a Vanty School.`} />
      <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-v-sm border border-v-border bg-v-elevated p-4 text-sm">
        <dt className="text-v-subtle">Perfil</dt><dd className="font-medium">{ROLE_LABEL[inv.role as Role]}</dd>
        <dt className="text-v-subtle">Correo</dt><dd className="break-all">{inv.email}</dd>
        <dt className="text-v-subtle">Válida hasta</dt><dd>{fmtDate(inv.expires_at)}</dd>
      </dl>
      {inv.is_managed && (
        <p className="mt-3 rounded-v-sm bg-v-accent-soft px-3 py-2.5 text-sm text-v-accent">
          Esta es una cuenta de estudiante gestionada por el colegio. Si eres menor de edad, actívala junto a tu apoderado.
        </p>
      )}
      <div className="mt-6">
        <AuthForm action={acceptInvitation.bind(null, token)} submitLabel="Crear mi cuenta">
          <AuthInput label="Crea tu contraseña" icon="lock" name="password" type="password" autoComplete="new-password" minLength={10} required />
          <AuthInput label="Repite la contraseña" icon="lock" name="confirm" type="password" autoComplete="new-password" minLength={10} required />
          <label className="flex items-start gap-2.5 text-sm text-v-muted">
            <input type="checkbox" name="accept" required className="mt-0.5 size-4 accent-[var(--v-accent)]" />
            <span>Acepto las condiciones de uso de la plataforma y el tratamiento de mis datos para fines educativos por parte de mi colegio.</span>
          </label>
        </AuthForm>
      </div>
    </AuthShell>
  )
}
