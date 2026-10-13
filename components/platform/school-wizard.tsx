'use client'
import { useRef, useState, useTransition, type ReactNode } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { ArrowRight, BookOpen, Building2, CalendarDays, Check, CheckCircle2, ImagePlus, Layers, Loader2, MapPin, Palette, Trash2, UserRoundCog } from 'lucide-react'
import { createSchool, setSchoolLogo, type CreateSchoolResult } from '@/lib/actions/platform'
import { baseFor, BRAND_COLORS, coverStyle, DEFAULT_COLOR, DEPENDENCIES, REGIONS, STAGES } from '@/lib/platform'
import { LOGO_MAX_BYTES, LOGO_TYPES, uploadLogo } from '@/components/platform/logo-uploader'
import { Button, Field, Input, LinkButton, Select } from '@/components/ui/primitives'
import { CopyBox } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'

type Created = Extract<CreateSchoolResult, { ok: true }>

function Section({ n, icon, title, description, children }: { n: number; icon: ReactNode; title: string; description: string; children: ReactNode }) {
  return (
    <section className="rounded-v border border-v-border bg-v-elevated p-5 shadow-v sm:p-6">
      <header className="mb-5 flex items-start gap-3.5">
        <span className="v-brand grid size-10 shrink-0 place-items-center rounded-2xl shadow-v-brand">{icon}</span>
        <div className="min-w-0">
          <p className="text-[11.5px] font-semibold text-v-subtle">Paso {n} de 4</p>
          <h2 className="v-display text-[1.15rem] font-bold leading-tight tracking-tight text-v-text">{title}</h2>
          <p className="mt-0.5 text-[13px] text-v-muted">{description}</p>
        </div>
      </header>
      {children}
    </section>
  )
}

/** Alta de un colegio en una sola página: se llena por pasos y a la derecha se ve cómo va quedando. */
export function SchoolWizard({ year }: { year: number }) {
  const [name, setName] = useState('')
  const [commune, setCommune] = useState('')
  const [dependency, setDependency] = useState('particular_subvencionado')
  const [color, setColor] = useState(DEFAULT_COLOR)
  const [schoolYear, setSchoolYear] = useState(String(year))
  const [stages, setStages] = useState<string[]>(STAGES.map(s => s.key))
  const [subjects, setSubjects] = useState(true)
  const [adminName, setAdminName] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [logo, setLogo] = useState<{ file: File; url: string } | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<(Created & { logoFailed: boolean }) | null>(null)
  const [pending, start] = useTransition()
  const file = useRef<HTMLInputElement>(null)
  const toast = useToast()
  const router = useRouter()
  const base = baseFor(stages, subjects)
  const shown = name.trim() || 'Nombre del colegio'
  const place = [commune.trim(), DEPENDENCIES[dependency]].filter(Boolean).join(' · ')

  const pickLogo = (f: File | undefined) => {
    if (!f) return
    if (!LOGO_TYPES[f.type]) { toast.error('Usa una imagen PNG, JPG o WebP.'); return }
    if (f.size > LOGO_MAX_BYTES) { toast.error('El logo supera 1 MB. Prueba con uno más liviano.'); return }
    setLogo({ file: f, url: URL.createObjectURL(f) })
  }

  const submit = (form: FormData) => start(async () => {
    setError(null); setErrors({})
    let res: CreateSchoolResult
    try { res = await createSchool(form) } catch { res = { ok: false, error: 'No se pudo crear el colegio. Revisa tu conexión e inténtalo de nuevo.' } }
    if (!res.ok) { setError(res.error); setErrors(res.fieldErrors ?? {}); window.scrollTo({ top: 0, behavior: 'smooth' }); return }
    // El logo se sube después: su carpeta en Storage lleva el identificador del colegio recién creado.
    let logoFailed = false
    if (logo) {
      const up = await uploadLogo(res.id, logo.file)
      logoFailed = 'error' in up || !(await setSchoolLogo(res.id, up.path)).ok
    }
    setCreated({ ...res, logoFailed })
    router.refresh()
  })

  if (created) {
    return (
      <div className="mx-auto max-w-2xl rounded-v-lg border border-v-border bg-v-elevated p-6 shadow-v sm:p-9">
        <span className="grid size-14 place-items-center rounded-full bg-v-success-soft text-v-success"><CheckCircle2 size={30} /></span>
        <h2 className="v-display mt-4 text-[1.9rem] font-bold leading-tight tracking-tight text-v-text">{created.name} quedó creado</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-v-muted">Ya tiene su año escolar, sus grados y sus asignaturas. Lo que sigue lo hace su secretaría: crear los cursos e invitar a su comunidad.</p>
        {created.logoFailed && <p className="mt-4 rounded-v-sm bg-v-warning-soft px-4 py-3 text-[13.5px] text-v-text">El logo no se pudo subir. Agrégalo desde la ficha del colegio.</p>}
        {created.invite ? (
          <div className="mt-6 space-y-3 rounded-v border border-v-border bg-v-fill p-5">
            <p className="text-[14px] font-semibold text-v-text">Invitación para {created.invite.name}</p>
            <CopyBox label="Enlace de un solo uso (se muestra solo ahora)" value={created.invite.link} />
            <p className="text-[13px] leading-relaxed text-v-muted">
              {created.invite.sent ? `Ya se envió por correo a ${created.invite.email}.` : 'No se envió por correo: entrégaselo tú por un canal seguro.'} Vence en {created.invite.days} días.
            </p>
          </div>
        ) : (
          <p className="mt-6 rounded-v-sm bg-v-warning-soft px-4 py-3 text-[13.5px] text-v-text">
            {created.inviteFailed ? 'No se pudo generar la invitación para secretaría. Créala desde la ficha del colegio.' : 'Aún no tiene secretaría. Invítala desde la ficha del colegio para que pueda empezar.'}
          </p>
        )}
        <div className="mt-7 flex flex-wrap gap-2.5">
          <LinkButton href={`/plataforma/colegios/${created.id}`} variant="primary">Ver la ficha del colegio<ArrowRight size={15} /></LinkButton>
          <LinkButton href="/plataforma">Volver a Colegios</LinkButton>
        </div>
      </div>
    )
  }

  const err = (key: string) => errors[key] ? <p className="mt-1.5 text-[12.5px] font-medium text-[#c0343a]">{errors[key]}</p> : null

  return (
    <form action={submit} className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="space-y-5">
        {error && <div role="alert" className="rounded-v-sm bg-v-danger-soft px-4 py-3 text-[13.5px] font-medium text-[#c0343a]">{error}</div>}

        <Section n={1} icon={<Palette size={18} />} title="Identidad" description="Cómo reconocerá su comunidad al colegio dentro de la plataforma.">
          <div className="flex flex-wrap items-start gap-5">
            <div>
              <button type="button" onClick={() => file.current?.click()} aria-label="Elegir el logo del colegio"
                className="group relative grid size-28 place-items-center overflow-hidden rounded-[26%] border-2 border-dashed border-v-border-strong bg-v-fill transition-colors hover:border-v-accent">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {logo ? <img src={logo.url} alt="" className="size-full object-contain p-2" /> : <span className="flex flex-col items-center gap-1 text-[11.5px] font-semibold text-v-muted"><ImagePlus size={24} />Subir logo</span>}
              </button>
              {logo && <button type="button" onClick={() => setLogo(null)} className="mt-2 flex items-center gap-1 text-[12px] font-medium text-v-muted hover:text-v-danger"><Trash2 size={12} />Quitar</button>}
              <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={e => { pickLogo(e.target.files?.[0]); e.target.value = '' }} />
            </div>
            <div className="min-w-[16rem] flex-1 space-y-4">
              <div>
                <Field label="Nombre del colegio"><Input name="name" required minLength={2} maxLength={160} value={name} onChange={e => setName(e.target.value)} placeholder="Ej.: Colegio Los Aromos" autoFocus /></Field>
                {err('name')}
              </div>
              <fieldset>
                <legend className="mb-2 text-[12.5px] font-medium text-v-text">Color del colegio</legend>
                <div className="flex flex-wrap items-center gap-2">
                  {BRAND_COLORS.map(c => (
                    <button key={c.value} type="button" onClick={() => setColor(c.value)} title={c.label} aria-label={c.label} aria-pressed={color === c.value}
                      className={`grid size-9 place-items-center rounded-full text-white ring-offset-2 ring-offset-v-elevated transition-transform hover:scale-110 ${color === c.value ? 'ring-2 ring-v-text' : ''}`} style={{ background: c.value }}>
                      {color === c.value && <Check size={16} />}
                    </button>
                  ))}
                  <label className="ml-1 flex cursor-pointer items-center gap-2 rounded-full border border-v-border px-3 py-1.5 text-[12.5px] font-medium text-v-muted hover:text-v-text">
                    <input type="color" value={color} onChange={e => setColor(e.target.value)} className="size-5 cursor-pointer rounded-full border-0 bg-transparent p-0" aria-label="Otro color" />Otro
                  </label>
                </div>
                <input type="hidden" name="brand_color" value={color} />
              </fieldset>
            </div>
          </div>
          <p className="mt-4 text-[12.5px] text-v-subtle">El logo es opcional (PNG, JPG o WebP, hasta 1 MB). La secretaría puede cambiarlo después desde Configuración.</p>
        </Section>

        <Section n={2} icon={<MapPin size={18} />} title="Datos del establecimiento" description="Lo que identifica al colegio. Solo el nombre es obligatorio.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="RBD" hint="Rol Base de Datos del Mineduc."><Input name="rbd" maxLength={20} placeholder="Ej.: 12345-6" /></Field>
            <Field label="Dependencia">
              <Select name="dependency" required value={dependency} onChange={e => setDependency(e.target.value)}>
                {Object.entries(DEPENDENCIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
            <Field label="Comuna"><Input name="commune" maxLength={80} value={commune} onChange={e => setCommune(e.target.value)} placeholder="Ej.: Maipú" /></Field>
            <Field label="Región">
              <Select name="region" defaultValue=""><option value="">Sin indicar</option>{REGIONS.map(r => <option key={r} value={r}>{r}</option>)}</Select>
            </Field>
            <Field label="Dirección"><Input name="address" maxLength={160} placeholder="Ej.: Av. Los Pajaritos 1234" /></Field>
            <Field label="Teléfono"><Input name="phone" type="tel" maxLength={40} placeholder="Ej.: +56 2 2345 6789" /></Field>
          </div>
        </Section>

        <Section n={3} icon={<Layers size={18} />} title="Año escolar y niveles" description="Con esto se crean los semestres, los grados y las asignaturas.">
          <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
            <div>
              <Field label="Año escolar"><Input name="year" type="number" required min={2000} max={2100} value={schoolYear} onChange={e => setSchoolYear(e.target.value)} /></Field>
              {err('year')}
            </div>
            <fieldset>
              <legend className="mb-1.5 text-[12.5px] font-medium text-v-text">Niveles de enseñanza</legend>
              <div className="grid gap-2.5 sm:grid-cols-3">
                {STAGES.map(s => {
                  const on = stages.includes(s.key)
                  return (
                    <label key={s.key} className={`flex cursor-pointer flex-col gap-0.5 rounded-v-sm border-2 p-3.5 transition-colors ${on ? 'border-v-accent bg-v-accent-soft' : 'border-v-border bg-v-elevated hover:border-v-border-strong'}`}>
                      <span className="flex items-center justify-between gap-2 text-[13.5px] font-bold text-v-text">{s.label}
                        <span className={`grid size-5 shrink-0 place-items-center rounded-full ${on ? 'bg-v-accent text-white' : 'border-2 border-v-border-strong'}`}>{on && <Check size={12} />}</span>
                      </span>
                      <span className="text-[12.5px] text-v-muted">{s.hint}</span>
                      <input type="checkbox" name="stages[]" value={s.key} checked={on} onChange={() => setStages(on ? stages.filter(k => k !== s.key) : [...stages, s.key])} className="sr-only" />
                    </label>
                  )
                })}
              </div>
              {err('stages')}
            </fieldset>
          </div>
          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-v-sm bg-v-fill p-3.5">
            <input type="checkbox" name="subjects" checked={subjects} onChange={e => setSubjects(e.target.checked)} className="mt-0.5 size-4 accent-[var(--v-accent)]" />
            <span className="text-[13.5px] text-v-muted"><span className="font-semibold text-v-text">Cargar las asignaturas del currículum nacional.</span> La secretaría puede agregar o quitar después.</span>
          </label>
        </Section>

        <Section n={4} icon={<UserRoundCog size={18} />} title="Secretaría del colegio" description="La primera cuenta: con ella el colegio se administra solo.">
          <div className="grid gap-4 sm:grid-cols-2">
            <div><Field label="Nombre completo"><Input name="admin_name" maxLength={160} autoComplete="off" value={adminName} onChange={e => setAdminName(e.target.value)} /></Field>{err('admin_name')}</div>
            <div><Field label="Correo"><Input name="admin_email" type="email" autoComplete="off" value={adminEmail} onChange={e => setAdminEmail(e.target.value)} /></Field>{err('admin_email')}</div>
          </div>
          <p className="mt-3 text-[12.5px] text-v-subtle">Recibe un enlace de un solo uso para crear su contraseña. Si aún no sabes quién será, déjalo en blanco e invítala después desde la ficha del colegio.</p>
        </Section>

        <div className="flex flex-wrap items-center justify-end gap-2.5">
          <LinkButton href="/plataforma" variant="ghost">Cancelar</LinkButton>
          <Button type="submit" disabled={pending}>{pending ? <Loader2 size={15} className="animate-spin" /> : <Building2 size={15} />}{pending ? 'Creando…' : 'Crear colegio'}</Button>
        </div>
      </div>

      {/* Vista previa: se actualiza mientras se escribe */}
      <aside className="space-y-4 xl:sticky xl:top-2">
        <p className="text-[12.5px] font-semibold text-v-muted">Así va quedando</p>
        <div className="overflow-hidden rounded-v border border-v-border bg-v-elevated shadow-v">
          <div className="relative overflow-hidden px-5 pb-6 pt-5 text-white" style={coverStyle(color)}>
            <span aria-hidden className="absolute -right-10 -top-12 size-40 rounded-full bg-white/12" />
            <div className="relative flex items-center gap-3.5">
              <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-[26%] bg-white shadow-v">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {logo ? <img src={logo.url} alt="" className="size-full object-contain p-1" /> : <Image src="/brand/vanty-school-mark.webp" alt="" width={64} height={64} className="size-full object-cover" />}
              </span>
              <div className="min-w-0">
                <p className={`v-display text-[1.3rem] font-bold leading-tight tracking-tight ${name.trim() ? '' : 'opacity-60'}`}>{shown}</p>
                <p className="mt-0.5 text-[12.5px] text-white/85">{place}</p>
              </div>
            </div>
          </div>
          <ul className="divide-y divide-v-border text-[13.5px]">
            <li className="flex items-center gap-3 px-5 py-3"><CalendarDays size={16} className="shrink-0 text-v-accent" /><span className="text-v-text">Año escolar <strong>{schoolYear || '—'}</strong>, con sus dos semestres</span></li>
            <li className="flex items-center gap-3 px-5 py-3"><Layers size={16} className="shrink-0 text-v-accent" /><span className="text-v-text"><strong>{base.grades}</strong> grado{base.grades === 1 ? '' : 's'}, listos para agregar secciones</span></li>
            <li className="flex items-center gap-3 px-5 py-3"><BookOpen size={16} className="shrink-0 text-v-accent" /><span className="text-v-text">{base.subjects ? <><strong>{base.subjects}</strong> asignaturas del currículum</> : 'Sin asignaturas: las cargará secretaría'}</span></li>
            <li className="flex items-center gap-3 px-5 py-3"><UserRoundCog size={16} className="shrink-0 text-v-accent" /><span className="text-v-text">{adminEmail.trim() ? <>Invitación para <strong>{adminName.trim() || adminEmail.trim()}</strong></> : 'Secretaría: se invita después'}</span></li>
          </ul>
        </div>

        <div className="rounded-v border border-v-border bg-v-elevated p-4 shadow-v-xs">
          <p className="mb-3 text-[12.5px] font-semibold text-v-muted">En el menú de su comunidad</p>
          <div className="flex items-center gap-3 rounded-v-sm bg-v-fill p-3">
            <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-[30%] bg-white shadow-v-xs ring-1 ring-v-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {logo ? <img src={logo.url} alt="" className="size-full object-contain p-0.5" /> : <Image src="/brand/vanty-school-mark.webp" alt="" width={48} height={48} className="size-full object-cover" />}
            </span>
            <div className="min-w-0">
              <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-v-text">{shown}</p>
              <span className="mt-1 inline-flex rounded-full bg-v-accent-soft px-2 py-0.5 text-[10px] font-semibold text-v-accent">Secretaría</span>
            </div>
          </div>
        </div>

        <p className="text-[12.5px] leading-relaxed text-v-subtle">Después de crearlo, la secretaría agrega las secciones de cada grado e invita a docentes, estudiantes y apoderados desde su propio panel.</p>
      </aside>
    </form>
  )
}
