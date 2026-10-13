// Primitivas de interfaz. Se pueden usar desde Server Components; las piezas animadas viven en ./motion.
import { Children, cloneElement, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from 'react'
import Link from 'next/link'
import { Bar, Kpi, Reveal, type KpiTone } from '@/components/ui/motion'

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ')

// ── Botones ───────────────────────────────────────────────────────────────────
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md'

export function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', extra = '') {
  return cx(
    'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full font-semibold transition-all duration-200 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50',
    size === 'sm' ? 'h-8 px-3.5 text-xs' : 'h-10 px-5 text-[13px]',
    variant === 'primary' && 'v-brand shadow-v-brand hover:-translate-y-0.5 hover:brightness-105',
    variant === 'secondary' && 'border border-v-border-strong bg-v-elevated text-v-text hover:border-v-accent hover:text-v-accent',
    variant === 'ghost' && 'text-v-muted hover:bg-v-fill hover:text-v-text',
    variant === 'danger' && 'bg-v-danger/10 text-v-danger hover:bg-v-danger/15',
    extra,
  )
}

type ButtonProps = ComponentProps<'button'> & { variant?: ButtonVariant; size?: ButtonSize }
export function Button({ variant, size, className, type = 'button', ...rest }: ButtonProps) {
  return <button type={type} className={buttonClass(variant, size, className)} {...rest} />
}

type LinkButtonProps = ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize }
export function LinkButton({ variant = 'secondary', size, className, ...rest }: LinkButtonProps) {
  return <Link className={buttonClass(variant, size, className)} {...rest} />
}

// ── Estructura ────────────────────────────────────────────────────────────────
export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="v-headline text-[1.6rem] text-v-text sm:text-[1.75rem]">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm text-v-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/** Tarjeta. Entra con un resorte; `index` escalona varias tarjetas de la misma pantalla. */
export function Card({ className, children, index = 1 }: { className?: string; children: ReactNode; index?: number }) {
  return (
    <Reveal index={index} className={cx('min-w-0 overflow-hidden rounded-v border border-v-border bg-v-elevated shadow-v', className)}>
      {children}
    </Reveal>
  )
}

export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger'

const TONE: Record<Tone, string> = {
  neutral: 'bg-v-fill text-v-muted',
  accent: 'bg-v-accent-soft text-v-accent',
  success: 'bg-v-success/15 text-[#157a4b]',
  warning: 'bg-v-warning/15 text-[#a16207]',
  danger: 'bg-v-danger/10 text-[#c0343a]',
}

export function CardHeader({ title, description, actions, icon, tone = 'accent' }: { title: string; description?: string; actions?: ReactNode; icon?: ReactNode; tone?: Tone }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-3 pt-5">
      <div className="flex min-w-0 items-center gap-2.5">
        {icon && <span className={cx('grid size-8 shrink-0 place-items-center rounded-[30%]', TONE[tone])}>{icon}</span>}
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-semibold tracking-tight text-v-text">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-v-subtle">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('px-5 pb-5 pt-2', className)}>{children}</div>
}

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold', TONE[tone])}>{children}</span>
}

/** Indicador con cifra animada. Mantiene la firma anterior y delega en la tarjeta KPI. */
export function Stat({ label, value, hint, icon, tone = 'accent', index = 0, href }: {
  label: string; value: ReactNode; hint?: string; icon?: ReactNode; tone?: Tone; index?: number; href?: string
}) {
  const kpiTone: KpiTone = tone === 'neutral' ? 'accent' : tone
  return <Kpi label={label} value={value} hint={hint} icon={icon} tone={kpiTone} index={index} href={href} />
}

export function StatGrid({ children }: { children: ReactNode }) {
  // Cada indicador entra un instante después del anterior.
  const items = Children.map(children, (child, i) => (isValidElement(child) ? cloneElement(child as ReactElement<{ index?: number }>, { index: i }) : child))
  return <div className="mb-5 grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">{items}</div>
}

/** Estado vacío. Con `aria` muestra a la mascota (pose 1–8 o 10). */
export function EmptyState({ title, description, action, aria, icon }: { title: string; description?: string; action?: ReactNode; aria?: number; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      {aria ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/aria/pose-${aria}.webp`} alt="" className="v-float mb-4 h-28 w-auto drop-shadow-[0_10px_18px_rgba(0,60,160,0.2)]" />
      ) : icon ? (
        <span className="v-float mb-4 grid size-12 place-items-center rounded-full bg-v-fill text-v-subtle">{icon}</span>
      ) : null}
      <p className="text-[15px] font-semibold text-v-text">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-v-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Notice({ tone = 'accent', title, children }: { tone?: Tone; title?: string; children: ReactNode }) {
  return (
    <div className={cx('rounded-v-sm px-4 py-3 text-[13px] leading-relaxed', TONE[tone])}>
      {title && <p className="font-semibold">{title}</p>}
      <div className={title ? 'mt-0.5 opacity-90' : ''}>{children}</div>
    </div>
  )
}

// ── Tablas ────────────────────────────────────────────────────────────────────
export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-left text-[13.5px] tabular-nums">{children}</table>
    </div>
  )
}
export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return <th className={cx('border-y border-v-border bg-v-fill/60 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-v-subtle', className)}>{children}</th>
}
export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cx('border-b border-v-border px-5 py-3.5 align-middle text-v-text', className)}>{children}</td>
}

// ── Formularios ───────────────────────────────────────────────────────────────
export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1.5 block text-[13px] font-medium text-v-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-v-subtle">{hint}</span>}
    </label>
  )
}

export function Input(props: ComponentProps<'input'>) {
  return <input {...props} className={cx('v-input', props.className)} />
}
export function Textarea(props: ComponentProps<'textarea'>) {
  return <textarea rows={4} {...props} className={cx('v-input resize-y', props.className)} />
}
export function Select({ children, ...props }: ComponentProps<'select'>) {
  return <select {...props} className={cx('v-input', props.className)}>{children}</select>
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('v-skeleton', className)} aria-hidden />
}

/** Iniciales sobre el degradado de marca. Con `id`, la foto de perfil de esa persona se superpone si existe y se puede ver. */
export function Avatar({ name, size = 32, id, v }: { name: string; size?: number; id?: string | null; v?: string | null }) {
  const parts = name.trim().split(/\s+/)
  const text = ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
  return (
    <span className="v-brand v-display relative grid shrink-0 place-items-center overflow-hidden rounded-full font-semibold"
      style={{ width: size, height: size, fontSize: size * 0.36 }} aria-hidden>
      {text}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {id && <img src={`/api/avatar/${id}${v ? `?v=${encodeURIComponent(v)}` : ''}`} loading="lazy" alt="" className="absolute inset-0 size-full rounded-full object-cover" />}
    </span>
  )
}

/** Barra horizontal animada para indicadores (0–100). */
export function Meter({ value, tone = 'accent' }: { value: number; tone?: Tone }) {
  return <Bar value={value} tone={tone === 'accent' ? 'brand' : tone} />
}

/** Franja compacta de indicadores: una sola fila para cifras que no ameritan una tarjeta cada una. */
export function StatStrip({ items }: { items: { label: string; value: ReactNode; hint?: string; icon?: ReactNode; tone?: Tone; href?: string }[] }) {
  return (
    <Reveal index={1} className="mb-4 overflow-hidden rounded-v border border-v-border bg-v-elevated shadow-v">
      <dl className="grid grid-cols-2 divide-v-border sm:flex sm:divide-x">
        {items.map(item => {
          const body = (
            <>
              {item.icon && <span className={cx('grid size-11 shrink-0 place-items-center rounded-[30%] [&>svg]:size-5', TONE[item.tone ?? 'accent'])}>{item.icon}</span>}
              <span className="min-w-0">
                <dt className="truncate text-xs font-medium text-v-muted">{item.label}</dt>
                <dd className="mt-0.5 flex items-baseline gap-2">
                  <span className="v-display text-[1.7rem] font-bold leading-none tabular-nums text-v-text">{item.value}</span>
                  {item.hint && <span className="truncate text-xs text-v-subtle">{item.hint}</span>}
                </dd>
              </span>
            </>
          )
          const className = 'flex min-w-0 flex-1 items-center gap-3.5 px-5 py-4'
          return item.href
            ? <Link key={item.label} href={item.href} scroll={false} className={cx(className, 'hover:bg-v-fill')}>{body}</Link>
            : <div key={item.label} className={className}>{body}</div>
        })}
      </dl>
    </Reveal>
  )
}
