import { MailPlus, ShieldCheck, UserMinus, X } from 'lucide-react'
import { requirePlatform } from '@/lib/auth/platform'
import { createClient } from '@/lib/supabase/server'
import { inviteStaff, removeStaff, revokeStaffInvitation } from '@/lib/actions/platform'
import { fmtDate } from '@/lib/format'
import { Avatar, Badge, Card, CardHeader, EmptyState, Field, Input, Notice, PageHeader } from '@/components/ui/primitives'
import { ConfirmAction, FormDialog } from '@/components/ui/dialog'

type Team = {
  staff: { id: string; name: string; email: string | null; since: string; me: boolean }[]
  invitations: { id: string; name: string; email: string; expires_at: string }[]
}

export default async function PlatformTeam() {
  await requirePlatform()
  const db = await createClient()
  const { data } = await db.rpc('platform_team')
  const team = (data ?? { staff: [], invitations: [] }) as Team

  const invite = (
    <FormDialog trigger={<><MailPlus size={15} />Invitar al equipo</>} title="Invitar al equipo Vanty" submitLabel="Crear invitación" action={inviteStaff}
      description="Recibe un enlace de un solo uso para crear su contraseña. Podrá crear, editar y suspender colegios.">
      <Field label="Nombre completo"><Input name="full_name" required minLength={3} maxLength={160} autoComplete="off" /></Field>
      <Field label="Correo"><Input name="email" type="email" required autoComplete="off" /></Field>
    </FormDialog>
  )

  return (
    <>
      <PageHeader title="Equipo Vanty" description="Las personas que pueden crear y acompañar colegios." actions={invite} />
      <Notice tone="accent" title="Un acceso aparte de los colegios">
        Ser del equipo Vanty no da acceso a los datos de ningún colegio. Para entrar al panel de un colegio hace falta, además, una cuenta dentro de él.
      </Notice>

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-2">
        <Card index={1}>
          <CardHeader icon={<ShieldCheck size={15} />} title="Integrantes" description={`${team.staff.length} con acceso`} />
          <ul className="divide-y divide-v-border">
            {team.staff.map(p => (
              <li key={p.id} className="flex items-center gap-3 px-5 py-3.5">
                <Avatar name={p.name || p.email || '?'} size={38} />
                <span className="min-w-0 flex-1"><span className="block truncate text-[14px] font-semibold text-v-text">{p.name || 'Sin nombre'}{p.me && <span className="ml-2 font-normal text-v-subtle">(tú)</span>}</span>
                  <span className="block truncate text-[12.5px] text-v-muted">{p.email} · desde {fmtDate(p.since)}</span></span>
                {!p.me && <ConfirmAction action={removeStaff.bind(null, p.id)} danger ariaLabel={`Quitar a ${p.name} del equipo`} title="Quitar del equipo" confirmLabel="Quitar"
                  message={`${p.name} dejará de poder crear y administrar colegios. Su cuenta no se elimina.`}><UserMinus size={15} /></ConfirmAction>}
              </li>
            ))}
          </ul>
        </Card>

        <Card index={2}>
          <CardHeader icon={<MailPlus size={15} />} tone="warning" title="Invitaciones por aceptar" description="Vencen a los 7 días" />
          {team.invitations.length === 0 ? <EmptyState title="Sin invitaciones pendientes" description="Invita a alguien con «Invitar al equipo»." /> : (
            <ul className="divide-y divide-v-border">
              {team.invitations.map(i => (
                <li key={i.id} className="flex items-center gap-3 px-5 py-3.5">
                  <span className="min-w-0 flex-1"><span className="block truncate text-[14px] font-semibold text-v-text">{i.name}</span>
                    <span className="block truncate text-[12.5px] text-v-muted">{i.email} · vence el {fmtDate(i.expires_at)}</span></span>
                  <Badge tone="warning">Por aceptar</Badge>
                  <ConfirmAction action={revokeStaffInvitation.bind(null, i.id)} danger ariaLabel={`Revocar la invitación de ${i.name}`} title="Revocar invitación" confirmLabel="Revocar" message={`El enlace de ${i.name} dejará de funcionar.`}><X size={15} /></ConfirmAction>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}
