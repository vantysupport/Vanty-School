import Link from 'next/link'
import { ArrowRight, Building2, GraduationCap, MailQuestion, Plus, ShieldCheck, Users } from 'lucide-react'
import { requirePlatform } from '@/lib/auth/platform'
import { createClient } from '@/lib/supabase/server'
import { coverStyle, DEPENDENCIES, logoUrl, type Branding, type SchoolRow } from '@/lib/platform'
import { Badge, EmptyState, LinkButton, Notice, PageHeader, Stat, StatGrid } from '@/components/ui/primitives'
import { Reveal } from '@/components/ui/motion'

const fmt = (n: number) => n.toLocaleString('es-CL')

export default async function PlatformSchools() {
  await requirePlatform()
  const db = await createClient()
  const [{ data }, { data: brand }] = await Promise.all([db.rpc('platform_overview'), db.rpc('platform_branding')])
  const schools = (data ?? []) as SchoolRow[]
  const branding = (brand ?? {}) as Record<string, Branding>
  const active = schools.filter(s => s.status === 'active')
  const sum = (key: 'students' | 'teachers' | 'pending_invites') => schools.reduce((a, s) => a + s[key], 0)

  const create = <LinkButton href="/plataforma/colegios/nuevo" variant="primary"><Plus size={15} />Crear colegio</LinkButton>

  return (
    <>
      <PageHeader title="Colegios" description="Los establecimientos que usan Vanty School y en qué va la puesta en marcha de cada uno." actions={create} />

      <StatGrid>
        <Stat index={0} label="Colegios activos" value={active.length} hint={schools.length - active.length ? `${schools.length - active.length} suspendido${schools.length - active.length === 1 ? '' : 's'}` : 'ninguno suspendido'} icon={<Building2 size={16} />} />
        <Stat index={1} label="Estudiantes" value={fmt(sum('students'))} hint="con cuenta activa" icon={<GraduationCap size={16} />} tone="success" />
        <Stat index={2} label="Docentes" value={fmt(sum('teachers'))} hint="con cuenta activa" icon={<Users size={16} />} />
        <Stat index={3} label="Invitaciones por aceptar" value={sum('pending_invites')} hint="de secretaría o dirección" icon={<MailQuestion size={16} />} tone={sum('pending_invites') ? 'warning' : 'accent'} />
      </StatGrid>

      <div className="mt-4">
        <Notice tone="accent" title="El equipo Vanty ve cifras, no personas">
          Desde aquí se crean y acompañan los colegios, pero no se accede a notas, fichas, mensajes ni casos de bienestar. Esos datos solo los ve cada colegio, según el rol de cada persona.
        </Notice>
      </div>

      {schools.length === 0 ? (
        <div className="mt-4 rounded-v border border-v-border bg-v-elevated shadow-v"><EmptyState aria={2} title="Aún no hay colegios" description="Crea el primero con «Crear colegio»." /></div>
      ) : (
        <ul className="mt-4 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {schools.map((s, i) => {
            const missing = s.admins === 0
            const logo = logoUrl(branding[s.id]?.logo_path)
            return (
              <li key={s.id}>
                <Reveal index={i} className="flex h-full flex-col overflow-hidden rounded-v border border-v-border bg-v-elevated shadow-v">
                  <Link href={`/plataforma/colegios/${s.id}`} style={coverStyle(branding[s.id]?.brand_color)} className={`relative block overflow-hidden px-5 pb-5 pt-4 text-white ${s.status === 'suspended' ? 'grayscale' : ''}`}>
                    <span aria-hidden className="absolute -right-10 -top-12 size-40 rounded-full bg-white/12" />
                    <span className="relative flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
                      <span className="rounded-full bg-white/20 px-2.5 py-0.5">{s.status === 'active' ? 'Activo' : 'Suspendido'}</span>
                      {s.is_demo && <span className="rounded-full bg-white/20 px-2.5 py-0.5">Demostración</span>}
                    </span>
                    <span className="relative mt-2.5 flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {logo && <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-[26%] bg-white shadow-v"><img src={logo} alt="" className="size-full object-contain p-0.5" /></span>}
                      <span className="min-w-0">
                        <span className="v-display block text-[1.35rem] font-bold leading-tight tracking-tight">{s.name}</span>
                        <span className="mt-1 block text-[12.5px] text-white/85">{[s.commune, DEPENDENCIES[s.dependency]].filter(Boolean).join(' · ')}</span>
                      </span>
                    </span>
                  </Link>
                  <dl className="grid grid-cols-4 divide-x divide-v-border border-b border-v-border text-center">
                    {[['Estudiantes', s.students], ['Docentes', s.teachers], ['Apoderados', s.guardians], ['Cursos', s.courses]].map(([label, n]) => (
                      <div key={label as string} className="px-1 py-3">
                        <dd className="v-display text-[1.25rem] font-bold tabular-nums text-v-text">{fmt(n as number)}</dd>
                        <dt className="text-[11px] text-v-subtle">{label}</dt>
                      </div>
                    ))}
                  </dl>
                  <div className="mt-auto flex items-center justify-between gap-3 px-5 py-3.5">
                    {missing
                      ? <Badge tone="warning">{s.pending_invites ? 'Secretaría: invitación sin aceptar' : 'Falta invitar a secretaría'}</Badge>
                      : <Badge tone="success"><ShieldCheck size={11} />Secretaría activa</Badge>}
                    <Link href={`/plataforma/colegios/${s.id}`} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-v-accent hover:gap-2.5">Ver ficha<ArrowRight size={14} /></Link>
                  </div>
                </Reveal>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
