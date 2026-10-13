import Link from 'next/link'
import { ArrowRight, Building2, GraduationCap, MailQuestion, Plus, ShieldCheck, Users } from 'lucide-react'
import { requirePlatform } from '@/lib/auth/platform'
import { createClient } from '@/lib/supabase/server'
import { createSchool } from '@/lib/actions/platform'
import { DEPENDENCIES, STAGES, type SchoolRow } from '@/lib/platform'
import { Badge, EmptyState, Field, Input, Notice, PageHeader, Stat, StatGrid } from '@/components/ui/primitives'
import { FormDialog } from '@/components/ui/dialog'
import { Reveal } from '@/components/ui/motion'
import { SchoolFields } from '@/components/platform/school-form'

const COVERS = ['from-[#01abfc] to-[#0069db]', 'from-[#10b981] to-[#047857]', 'from-[#8b5cf6] to-[#6d28d9]', 'from-[#f59e0b] to-[#d97706]', 'from-[#ec4899] to-[#be185d]', 'from-[#0ea5e9] to-[#0e7490]']
const fmt = (n: number) => n.toLocaleString('es-CL')

export default async function PlatformSchools() {
  await requirePlatform()
  const db = await createClient()
  const { data } = await db.rpc('platform_overview')
  const schools = (data ?? []) as SchoolRow[]
  const active = schools.filter(s => s.status === 'active')
  const sum = (key: 'students' | 'teachers' | 'pending_invites') => schools.reduce((a, s) => a + s[key], 0)
  const year = new Date().getFullYear()

  const create = (
    <FormDialog trigger={<><Plus size={15} />Crear colegio</>} title="Crear colegio" wide submitLabel="Crear colegio"
      description="Queda con su año escolar, grados y asignaturas listos. La secretaría del colegio continúa desde ahí: crea los cursos e invita a su comunidad." action={createSchool}>
      <SchoolFields />
      <div className="grid gap-3.5 sm:grid-cols-[9rem_1fr]">
        <Field label="Año escolar"><Input name="year" type="number" required min={2000} max={2100} defaultValue={year} /></Field>
        <fieldset>
          <legend className="mb-1.5 text-[12.5px] font-medium text-v-text">Niveles de enseñanza</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {STAGES.map(s => (
              <label key={s.key} className="flex cursor-pointer items-start gap-2.5 rounded-v-sm border border-v-border bg-v-elevated p-3 text-[13px] has-[:checked]:border-v-accent has-[:checked]:bg-v-accent-soft">
                <input type="checkbox" name="stages[]" value={s.key} defaultChecked className="mt-0.5 size-4 accent-[var(--v-accent)]" />
                <span><span className="block font-semibold text-v-text">{s.label}</span><span className="text-v-muted">{s.hint}</span></span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <label className="flex items-start gap-2.5 text-[13px] text-v-muted">
        <input type="checkbox" name="subjects" defaultChecked className="mt-0.5 size-4 accent-[var(--v-accent)]" />
        <span><span className="font-semibold text-v-text">Cargar las asignaturas del currículum nacional.</span> La secretaría puede agregar o quitar después.</span>
      </label>
      <fieldset className="rounded-v-sm border border-v-border bg-v-fill p-3.5">
        <legend className="px-1 text-[12.5px] font-semibold text-v-text">Secretaría del colegio</legend>
        <p className="mb-3 text-[12.5px] text-v-muted">Es la primera cuenta: con ella el colegio se administra solo. Si aún no sabes quién será, déjalo en blanco e invítala después.</p>
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field label="Nombre completo"><Input name="admin_name" maxLength={160} autoComplete="off" /></Field>
          <Field label="Correo"><Input name="admin_email" type="email" autoComplete="off" /></Field>
        </div>
      </fieldset>
    </FormDialog>
  )

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
            return (
              <li key={s.id}>
                <Reveal index={i} className="flex h-full flex-col overflow-hidden rounded-v border border-v-border bg-v-elevated shadow-v">
                  <Link href={`/plataforma/colegios/${s.id}`} className={`relative block overflow-hidden bg-gradient-to-br ${COVERS[i % COVERS.length]} px-5 pb-5 pt-4 text-white ${s.status === 'suspended' ? 'grayscale' : ''}`}>
                    <span aria-hidden className="absolute -right-10 -top-12 size-40 rounded-full bg-white/12" />
                    <span className="relative flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
                      <span className="rounded-full bg-white/20 px-2.5 py-0.5">{s.status === 'active' ? 'Activo' : 'Suspendido'}</span>
                      {s.is_demo && <span className="rounded-full bg-white/20 px-2.5 py-0.5">Demostración</span>}
                    </span>
                    <span className="v-display relative mt-2.5 block text-[1.35rem] font-bold leading-tight tracking-tight">{s.name}</span>
                    <span className="relative mt-1 block text-[12.5px] text-white/85">{[s.commune, DEPENDENCIES[s.dependency]].filter(Boolean).join(' · ')}</span>
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
