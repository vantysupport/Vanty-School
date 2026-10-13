import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Ban, CalendarDays, Check, Circle, ImagePlus, ListChecks, MailPlus, Pencil, Power, ShieldCheck, Users, X } from 'lucide-react'
import { requirePlatform } from '@/lib/auth/platform'
import { createClient } from '@/lib/supabase/server'
import { inviteSchoolAdmin, revokeSchoolInvitation, setSchoolLogo, setSchoolStatus, updateSchool } from '@/lib/actions/platform'
import { coverStyle, DEPENDENCIES, logoUrl, setupSteps, type Branding, type SchoolDetail } from '@/lib/platform'
import { LogoUploader } from '@/components/platform/logo-uploader'
import { ROLE_LABEL, ROLES } from '@/lib/roles'
import { fmtDate } from '@/lib/format'
import { Badge, Card, CardBody, CardHeader, EmptyState, Field, Input, Notice, Select } from '@/components/ui/primitives'
import { ConfirmAction, FormDialog } from '@/components/ui/dialog'
import { Bar } from '@/components/ui/motion'
import { SchoolFields } from '@/components/platform/school-form'

const STATE: Record<string, { label: string; tone: 'warning' | 'success' | 'neutral' }> = {
  pending: { label: 'Por aceptar', tone: 'warning' }, accepted: { label: 'Aceptada', tone: 'success' },
  revoked: { label: 'Revocada', tone: 'neutral' }, expired: { label: 'Vencida', tone: 'neutral' },
}

export default async function PlatformSchool({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatform()
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const db = await createClient()
  const [{ data }, { data: brand }] = await Promise.all([db.rpc('platform_institution', { p_inst: id }), db.rpc('platform_branding')])
  const school = data as SchoolDetail | null
  if (!school) notFound()
  const branding = ((brand ?? {}) as Record<string, Branding>)[id] ?? { logo_path: null, brand_color: null, address: null, phone: null }
  const logo = logoUrl(branding.logo_path)

  const steps = setupSteps(school)
  const done = steps.filter(s => s.done).length
  const next = steps.find(s => !s.done)
  const suspended = school.status === 'suspended'
  const invitations = school.invitations.filter(i => i.state !== 'revoked').slice(0, 8)

  return (
    <>
      <Link href="/plataforma" className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-v-muted hover:text-v-text"><ArrowLeft size={14} />Colegios</Link>

      <section style={coverStyle(branding.brand_color)} className={`relative overflow-hidden rounded-v-lg px-5 py-6 text-white shadow-v sm:px-7 ${suspended ? 'grayscale' : ''}`}>
        <span aria-hidden className="absolute -right-16 -top-20 size-64 rounded-full bg-white/10" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {logo && <span className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-[26%] bg-white shadow-v"><img src={logo} alt="" className="size-full object-contain p-1" /></span>}
            <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-1.5 text-[11.5px] font-semibold">
              <span className="rounded-full bg-white/20 px-2.5 py-0.5">{suspended ? 'Suspendido' : 'Activo'}</span>
              {school.is_demo && <span className="rounded-full bg-white/20 px-2.5 py-0.5">Demostración</span>}
              <span className="rounded-full bg-white/20 px-2.5 py-0.5">Desde {fmtDate(school.created_at)}</span>
            </p>
            <h1 className="v-display mt-2.5 text-[clamp(1.6rem,3.4vw,2.4rem)] font-bold leading-tight tracking-tight">{school.name}</h1>
            <p className="mt-1.5 text-[14px] text-white/85">{[school.commune, school.region, DEPENDENCIES[school.dependency], school.rbd ? `RBD ${school.rbd}` : null].filter(Boolean).join(' · ')}</p>
            {(branding.address || branding.phone) && <p className="mt-0.5 text-[13px] text-white/75">{[branding.address, branding.phone].filter(Boolean).join(' · ')}</p>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <FormDialog trigger={<><Pencil size={14} />Editar datos</>} variant="secondary" size="sm" title="Datos del colegio" wide action={updateSchool.bind(null, school.id)}>
              <SchoolFields school={{ ...school, ...branding }} />
            </FormDialog>
            {!school.is_demo && (suspended ? (
              <ConfirmAction action={setSchoolStatus.bind(null, school.id, 'active')} variant="secondary" size="sm" title="Reactivar colegio" confirmLabel="Reactivar"
                message={`Las cuentas de ${school.name} volverán a entrar con sus datos tal como quedaron.`}><Power size={14} />Reactivar</ConfirmAction>
            ) : (
              <ConfirmAction action={setSchoolStatus.bind(null, school.id, 'suspended')} variant="secondary" size="sm" danger title="Suspender colegio" confirmLabel="Suspender"
                message={`Ninguna cuenta de ${school.name} podrá entrar mientras esté suspendido. No se borra nada: al reactivarlo todo sigue igual.`}><Ban size={14} />Suspender</ConfirmAction>
            ))}
          </div>
        </div>
      </section>

      {suspended && <div className="mt-4"><Notice tone="warning" title="Colegio suspendido">Sus cuentas no pueden iniciar sesión ni aceptar invitaciones. Los datos se conservan.</Notice></div>}

      <div className="mt-4 grid items-stretch gap-4 xl:grid-cols-[1.25fr_1fr]">
        <Card index={1} className="flex flex-col">
          <CardHeader icon={<ListChecks size={15} />} title="Puesta en marcha" description="Lo que necesita la aplicación para que el colegio funcione, en orden" actions={<Badge tone={done === steps.length ? 'success' : 'accent'}>{done} de {steps.length}</Badge>} />
          <CardBody className="flex flex-1 flex-col">
            <Bar value={(done / steps.length) * 100} tone={done === steps.length ? 'success' : 'brand'} />
            <ol className="mt-4 space-y-1.5">
              {steps.map(step => (
                <li key={step.title} className={`flex items-start gap-3 rounded-v-sm px-3 py-2.5 ${step === next ? 'bg-v-accent-soft' : ''}`}>
                  <span className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full ${step.done ? 'bg-v-success text-white' : 'border-2 border-v-border-strong text-v-subtle'}`}>{step.done ? <Check size={14} /> : <Circle size={7} />}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 text-[14px] font-semibold text-v-text">{step.title}<span className="text-[11.5px] font-medium text-v-subtle">{step.owner}</span></span>
                    <span className="block text-[13px] text-v-muted">{step.detail}</span>
                  </span>
                </li>
              ))}
            </ol>
            {next && <p className="mt-auto pt-4 text-[13px] text-v-muted"><span className="font-semibold text-v-text">Siguiente paso:</span> {next.title.toLowerCase()}, {next.owner === 'Secretaría' ? 'a cargo de la secretaría del colegio' : 'a cargo del equipo Vanty'}.</p>}
          </CardBody>
        </Card>

        <div className="flex min-w-0 flex-col gap-4">
          <Card index={2}>
            <CardHeader icon={<Users size={15} />} tone="success" title="Comunidad" description="Cuentas activas por rol" />
            <CardBody>
              <dl className="grid grid-cols-3 gap-2.5">
                {ROLES.map(r => (
                  <div key={r} className="rounded-v-sm bg-v-fill px-3 py-2.5">
                    <dd className="v-display text-[1.35rem] font-bold tabular-nums text-v-text">{(school.members[r] ?? 0).toLocaleString('es-CL')}</dd>
                    <dt className="text-[11.5px] text-v-muted">{ROLE_LABEL[r]}</dt>
                  </div>
                ))}
              </dl>
            </CardBody>
          </Card>
          <Card index={3} className="flex-1">
            <CardHeader icon={<CalendarDays size={15} />} title="Año escolar" description="Lo define el colegio en Gestión académica" />
            <CardBody>
              {school.period
                ? <p className="text-[14px] text-v-text"><span className="font-semibold">{school.period.name} {school.period.year}</span><span className="text-v-muted"> · del {fmtDate(school.period.starts_on)} al {fmtDate(school.period.ends_on)}</span></p>
                : <p className="text-[14px] text-v-muted">Sin periodo vigente.</p>}
              <p className="mt-2 text-[13px] text-v-muted">{school.grade_levels} grados · {school.subjects} asignaturas · {school.courses} cursos en el periodo vigente</p>
            </CardBody>
          </Card>
        </div>
      </div>

      <Card index={4} className="mt-4">
        <CardHeader icon={<ImagePlus size={15} />} title="Identidad" description="El logo que ve la comunidad del colegio. El color y los datos se cambian en «Editar datos»." />
        <CardBody><LogoUploader institutionId={school.id} name={school.name} url={logo} save={setSchoolLogo.bind(null, school.id)} /></CardBody>
      </Card>

      <Card index={5} className="mt-4">
        <CardHeader icon={<ShieldCheck size={15} />} title="Quién administra el colegio" description="Secretaría y dirección. El resto de las cuentas las crea el propio colegio."
          actions={!suspended ? (
            <FormDialog trigger={<><MailPlus size={14} />Invitar</>} size="sm" title="Invitar a secretaría o dirección" submitLabel="Crear invitación" action={inviteSchoolAdmin.bind(null, school.id)}
              description="Recibe un enlace de un solo uso para crear su contraseña. No se envían contraseñas por ningún medio.">
              <Field label="Perfil">
                <Select name="role" defaultValue="admin"><option value="admin">Secretaría: administra cuentas, cursos y matrículas</option><option value="directivo">Director(a): ve el colegio completo</option></Select>
              </Field>
              <Field label="Nombre completo"><Input name="full_name" required minLength={3} maxLength={160} autoComplete="off" /></Field>
              <Field label="Correo"><Input name="email" type="email" required autoComplete="off" /></Field>
            </FormDialog>
          ) : undefined} />
        {school.contacts.length === 0 && invitations.length === 0 ? (
          <EmptyState aria={3} title="Nadie administra este colegio todavía" description="Invita a su secretaría: con esa cuenta el colegio crea sus cursos e invita a docentes, estudiantes y apoderados." />
        ) : (
          <div className="grid gap-x-8 gap-y-5 p-5 lg:grid-cols-2">
            <div>
              <p className="mb-2 text-[12.5px] font-semibold text-v-muted">Con cuenta</p>
              {school.contacts.length === 0 ? <p className="text-[13.5px] text-v-muted">Aún nadie aceptó su invitación.</p> : (
                <ul className="space-y-2">
                  {school.contacts.map(c => (
                    <li key={`${c.email}-${c.role}`} className="flex items-center justify-between gap-3 rounded-v-sm border border-v-border px-3.5 py-2.5">
                      <span className="min-w-0"><span className="block truncate text-[14px] font-semibold text-v-text">{c.name}</span><span className="block truncate text-[12.5px] text-v-muted">{c.email}</span></span>
                      <span className="flex shrink-0 items-center gap-1.5"><Badge tone="accent">{ROLE_LABEL[c.role]}</Badge>{c.status !== 'active' && <Badge tone="neutral">Desactivada</Badge>}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="mb-2 text-[12.5px] font-semibold text-v-muted">Invitaciones</p>
              {invitations.length === 0 ? <p className="text-[13.5px] text-v-muted">Sin invitaciones.</p> : (
                <ul className="space-y-2">
                  {invitations.map(i => (
                    <li key={i.id} className="flex items-center justify-between gap-3 rounded-v-sm border border-v-border px-3.5 py-2.5">
                      <span className="min-w-0"><span className="block truncate text-[14px] font-semibold text-v-text">{i.name} <span className="font-normal text-v-muted">· {ROLE_LABEL[i.role]}</span></span>
                        <span className="block truncate text-[12.5px] text-v-muted">{i.email}{i.state === 'pending' ? ` · vence el ${fmtDate(i.expires_at)}` : ''}</span></span>
                      <span className="flex shrink-0 items-center gap-1">
                        <Badge tone={STATE[i.state].tone}>{STATE[i.state].label}</Badge>
                        {i.state === 'pending' && <ConfirmAction action={revokeSchoolInvitation.bind(null, i.id)} danger ariaLabel={`Revocar la invitación de ${i.name}`} title="Revocar invitación" confirmLabel="Revocar" message={`El enlace de ${i.name} dejará de funcionar.`}><X size={15} /></ConfirmAction>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-[12.5px] text-v-subtle">El enlace se muestra una sola vez, al crear la invitación. Si se perdió, revócala y crea otra.</p>
            </div>
          </div>
        )}
      </Card>
    </>
  )
}
