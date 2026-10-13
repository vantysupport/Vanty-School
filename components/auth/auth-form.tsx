'use client'
import { useState, useTransition, type ReactNode } from 'react'
import Link from 'next/link'
import { ArrowRight, Backpack, Building2, Eye, EyeOff, GraduationCap, HeartHandshake, LineChart, Loader2, Lock, Mail, MailOpen, School, Users, type LucideIcon } from 'lucide-react'
import type { ActionResult } from '@/lib/actions/result'

type Action = (form: FormData) => Promise<ActionResult>

// Mismos campos que el login de VANTY ABA: 48 px de alto, icono a la izquierda, anillo de foco suave.
const inputClass =
  'h-12 w-full rounded-v-sm border border-v-border bg-v-elevated pl-11 pr-4 text-[16px] outline-none transition-shadow placeholder:text-v-subtle focus:border-v-accent focus:ring-4 focus:ring-v-accent-soft'

// El icono llega por nombre: las páginas (Server Components) no pueden pasar componentes a uno de cliente.
const ICONS = { mail: Mail, lock: Lock }

export function AuthInput({ label, icon, aside, type = 'text', ...props }: {
  label: string; icon: keyof typeof ICONS; aside?: ReactNode
} & React.ComponentProps<'input'>) {
  const Icon = ICONS[icon]
  const [show, setShow] = useState(false)
  const password = type === 'password'
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between text-sm font-medium text-v-muted">{label}{aside}</span>
      <span className="relative block">
        <Icon className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-v-subtle" />
        <input {...props} type={password && show ? 'text' : type} className={inputClass} />
        {password && (
          <button type="button" onClick={() => setShow(s => !s)} aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            className="absolute right-3 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-v-subtle hover:text-v-text">
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        )}
      </span>
    </label>
  )
}

export function AuthHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <>
      <h1 className="v-headline v-rise text-[2.1rem] sm:text-4xl">{title}</h1>
      <p className="mt-2 text-[15px] text-v-muted">{subtitle}</p>
    </>
  )
}

/** Formulario de acceso: ejecuta una Server Action y muestra su resultado en línea.
 *  Si la acción redirige, Next navega y aquí no llega ningún resultado. */
export function AuthForm({ action, submitLabel, children }: { action: Action; submitLabel: string; children: ReactNode }) {
  const [pending, start] = useTransition()
  const [result, setResult] = useState<ActionResult | null>(null)

  const submit = (form: FormData) => start(async () => {
    const res = await action(form)
    if (res) setResult(res)
  })

  return (
    <form action={submit} className="flex flex-col gap-4">
      {children}
      {result && !result.ok && (
        <div role="alert" className="rounded-v-sm bg-v-danger/10 px-3 py-2.5 text-sm text-v-danger">
          {result.error}
          {result.fieldErrors && <ul className="mt-1 list-disc pl-4">{Object.values(result.fieldErrors).map((m, i) => <li key={i}>{m}</li>)}</ul>}
        </div>
      )}
      {result?.ok && <div role="status" className="rounded-v-sm bg-v-success-soft px-3 py-2.5 text-sm text-[#157a4b]">{result.message}</div>}
      <button type="submit" disabled={pending}
        className="v-brand mt-1 flex h-12 items-center justify-center gap-2 rounded-full text-[15px] font-semibold shadow-v-brand transition-transform active:scale-[0.98] disabled:opacity-70">
        {pending ? <Loader2 className="size-5 animate-spin" /> : <>{submitLabel}<ArrowRight className="size-4" /></>}
      </button>
    </form>
  )
}

// Cada integrante de la comunidad escolar, con su icono y color.
const DEMO_ROLES: [string, string, LucideIcon, string][] = [
  ['estudiante', 'Estudiante', Backpack, '#0ea5e9'], ['apoderado', 'Apoderado', Users, '#8b5cf6'], ['docente', 'Docente', GraduationCap, '#10b981'],
  ['bienestar', 'Bienestar', HeartHandshake, '#ec4899'], ['directivo', 'Director(a)', LineChart, '#f59e0b'], ['admin', 'Secretaría', Building2, '#64748b'],
]

/** Accesos rápidos del entorno de demostración. La contraseña nunca llega al navegador. */
function DemoAccess({ action }: { action: Action }) {
  const [pending, start] = useTransition()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const enter = (role: string) => start(async () => {
    setBusy(role); setError(null)
    const form = new FormData()
    form.set('role', role)
    const res = await action(form)
    if (res && !res.ok) { setError(res.error); setBusy(null) }
  })

  return (
    <>
      <div className="my-6 flex items-center gap-3 text-xs text-v-subtle">
        <span className="h-px flex-1 bg-v-border" />o recorre la demostración como<span className="h-px flex-1 bg-v-border" />
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        {DEMO_ROLES.map(([role, label, Icon, color]) => (
          <button key={role} type="button" disabled={pending} onClick={() => enter(role)}
            className="group flex flex-col items-center gap-2 rounded-v-sm border border-v-border bg-v-elevated px-2 py-3.5 text-[13px] font-semibold text-v-text shadow-v-xs transition-all hover:-translate-y-0.5 hover:border-v-accent/50 hover:shadow-v disabled:opacity-60">
            <span className="grid size-10 place-items-center rounded-full transition-transform group-hover:scale-110" style={{ background: `${color}1f`, color }}>
              {busy === role ? <Loader2 className="size-[18px] animate-spin" /> : <Icon className="size-[18px]" />}
            </span>
            {label}
          </button>
        ))}
      </div>
      <p className="mt-3 text-center text-xs text-v-subtle">Colegio Futuro Andino · todos los datos son ficticios</p>
      {error && <p role="alert" className="mt-2 text-center text-xs text-v-danger">{error}</p>}
    </>
  )
}

/** Pantalla de inicio de sesión con la estructura del login de VANTY ABA: titular, pestañas en píldora,
 *  formulario y accesos alternativos. No hay registro público: "Soy nuevo" explica cómo se obtiene una cuenta. */
export function LoginPanel({ signIn, demoSignIn }: { signIn: Action; demoSignIn?: Action }) {
  const [tab, setTab] = useState<'signin' | 'new'>('signin')
  return (
    <>
      <AuthHeading key={tab}
        title={tab === 'signin' ? 'Te damos la bienvenida' : 'Primera vez en Vanty School'}
        subtitle={tab === 'signin' ? 'Ingresa con la cuenta que te entregó tu colegio.' : 'Las cuentas las crea cada establecimiento.'} />

      <div role="tablist" className="mt-7 grid grid-cols-2 rounded-full bg-v-fill p-1">
        {([['signin', 'Iniciar sesión'], ['new', 'Soy nuevo']] as const).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={`h-10 rounded-full text-sm font-semibold transition-all ${tab === id ? 'bg-v-elevated text-v-text shadow-v' : 'text-v-muted'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'signin' ? (
        <div className="v-rise mt-6">
          <AuthForm action={signIn} submitLabel="Ingresar">
            <AuthInput label="Correo electrónico" icon="mail" name="email" type="email" required autoComplete="email" placeholder="tu@correo.com" />
            <AuthInput label="Contraseña" icon="lock" name="password" type="password" required autoComplete="current-password"
              aside={<Link href="/recuperar" className="text-v-accent hover:underline">¿Olvidaste tu contraseña?</Link>} />
          </AuthForm>
          {demoSignIn && <DemoAccess action={demoSignIn} />}
        </div>
      ) : (
        <div className="v-rise mt-6 flex flex-col gap-3">
          <div className="rounded-v-lg border border-v-border bg-v-elevated p-5 shadow-v">
            <span className="v-brand grid size-11 place-items-center rounded-[28%]"><MailOpen className="size-5" /></span>
            <p className="mt-4 font-semibold">¿Tu colegio te invitó?</p>
            <p className="mt-1 text-sm text-v-muted">
              Abre el enlace de invitación que te entregó la secretaría de tu establecimiento. Ahí crearás tu contraseña y entrarás directo a tu panel.
            </p>
          </div>
          <div className="rounded-v-lg border border-v-border bg-v-elevated p-5">
            <span className="grid size-11 place-items-center rounded-[28%] bg-v-accent-soft text-v-accent"><School className="size-5" /></span>
            <p className="mt-4 font-semibold">¿Aún no tienes invitación?</p>
            <p className="mt-1 text-sm text-v-muted">
              Estudiantes, apoderados y funcionarios reciben su acceso desde el colegio. Solicítalo en la secretaría o a tu profesor jefe.
            </p>
          </div>
        </div>
      )}
    </>
  )
}
