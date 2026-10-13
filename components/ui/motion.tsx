'use client'
// Piezas animadas del panel, con los mismos resortes y curvas que el dashboard de VANTY ABA:
// entradas escalonadas, cifras que cuentan, tarjetas que se elevan, barras y anillos que se dibujan.
import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { animate, motion, useReducedMotion } from 'motion/react'
import { ArrowUpRight } from 'lucide-react'

const EASE = [0.22, 1, 0.36, 1] as const
export const CARD = 'rounded-v border border-v-border bg-v-elevated shadow-v'

/** Entrada con resorte; `index` escalona las piezas de una misma pantalla. */
export function Reveal({ index = 0, className, children }: { index?: number; className?: string; children: ReactNode }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 10) * 0.06, type: 'spring', stiffness: 180, damping: 24 }}>
      {children}
    </motion.div>
  )
}

/** Cifra que cuenta hasta su valor. Acepta "92%", "5,4" o "37"; cualquier otro texto se muestra tal cual. */
export function CountUp({ value }: { value: string | number }) {
  const text = String(value)
  const match = text.match(/^(\d+)(?:([.,])(\d+))?(\s?%)?$/)
  const reduce = useReducedMotion()
  const target = match ? Number(`${match[1]}.${match[3] ?? '0'}`) : 0
  const decimals = match?.[3]?.length ?? 0
  const [shown, setShown] = useState(0)

  useEffect(() => {
    if (!match || reduce) return
    const controls = animate(0, target, { duration: 1.1, ease: EASE, onUpdate: setShown })
    return () => controls.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, reduce])

  if (!match) return <>{text}</>
  return <>{(reduce ? target : shown).toFixed(decimals).replace('.', match[2] ?? ',')}{match[4] ?? ''}</>
}

export type KpiTone = 'accent' | 'success' | 'warning' | 'danger'
const TONE: Record<KpiTone, string> = {
  accent: 'bg-v-accent-soft text-v-accent',
  success: 'bg-v-success/15 text-v-success',
  warning: 'bg-v-warning/15 text-v-warning',
  danger: 'bg-v-danger/10 text-v-danger',
}

/** Tarjeta de indicador: cifra grande animada, icono en ficha redondeada y halo de luz al pasar el cursor. */
export function Kpi({ label, value, hint, icon, tone = 'accent', index = 0, href, urgent }: {
  label: string; value: ReactNode; hint?: string; icon?: ReactNode; tone?: KpiTone; index?: number; href?: string; urgent?: boolean
}) {
  const body = (
    <>
      <span aria-hidden className="pointer-events-none absolute -right-10 -top-12 size-36 rounded-full opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100"
        style={{ background: 'var(--v-glow-1)' }} />
      <div className="relative flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-v-muted">{label}</p>
        {icon && (
          <span className={`grid size-10 shrink-0 place-items-center rounded-[30%] transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110 ${TONE[tone]}`}>{icon}</span>
        )}
      </div>
      <p className={`v-display relative mt-3 text-[2.25rem] font-bold leading-none tracking-tight tabular-nums ${urgent ? 'text-v-warning' : 'text-v-text'}`}>
        {typeof value === 'string' || typeof value === 'number' ? <CountUp value={value} /> : value}
      </p>
      <div className="relative mt-2 flex min-h-4 items-center justify-between gap-2">
        <p className="truncate text-xs text-v-subtle">{hint}</p>
        {href && <ArrowUpRight size={14} className="shrink-0 text-v-subtle opacity-0 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-v-accent group-hover:opacity-100" />}
      </div>
    </>
  )
  const className = `group relative block overflow-hidden p-5 text-left ${CARD} ${urgent ? 'ring-1 ring-v-warning/40' : ''}`
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} whileHover={{ y: -4 }} whileTap={href ? { scale: 0.98 } : undefined}
      transition={{ delay: 0.08 + index * 0.06, type: 'spring', stiffness: 200, damping: 22 }}>
      {href ? <Link href={href} className={className}>{body}</Link> : <div className={className}>{body}</div>}
    </motion.div>
  )
}

/** Barra de progreso que se llena al aparecer. */
export function Bar({ value, tone = 'brand', delay = 0.3 }: { value: number; tone?: 'brand' | 'success' | 'warning' | 'danger' | 'neutral'; delay?: number }) {
  const color = { brand: 'v-brand', success: 'bg-v-success', warning: 'bg-v-warning', danger: 'bg-v-danger', neutral: 'bg-v-subtle' }[tone]
  return (
    <div className="h-2 overflow-hidden rounded-full bg-v-fill" role="presentation">
      <motion.div className={`h-full rounded-full ${color}`} initial={{ width: 0 }} animate={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        transition={{ delay, duration: 0.9, ease: EASE }} />
    </div>
  )
}

/** Gráfico de barras verticales; la última (o `highlight`) va resaltada. */
export function BarChart({ data, highlight, height = 144, tone = 'accent' }: {
  data: { label: string; value: number | null; display?: string }[]; highlight?: number; height?: number; tone?: 'accent' | 'success'
}) {
  const max = Math.max(...data.map(d => d.value ?? 0), 1)
  const on = highlight ?? data.length - 1
  const solid = tone === 'success' ? 'bg-v-success' : 'v-brand'
  const soft = tone === 'success' ? 'bg-v-success/20 group-hover:bg-v-success/40' : 'bg-v-accent/20 group-hover:bg-v-accent/40'
  return (
    <div className="flex items-end gap-2 sm:gap-3" style={{ height }} role="img" aria-label={data.map(d => `${d.label}: ${d.display ?? d.value ?? 'sin datos'}`).join(', ')}>
      {data.map((d, i) => (
        <div key={d.label} className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2">
          <span className={`text-[11px] font-semibold tabular-nums group-hover:text-v-text ${d.value ? 'text-v-muted' : 'text-v-subtle'}`}>{d.display ?? d.value ?? '—'}</span>
          <motion.div className={`w-full max-w-11 rounded-b-sm rounded-t-lg ${i === on ? solid : soft}`}
            initial={{ height: 4 }} animate={{ height: Math.max(4, ((d.value ?? 0) / max) * (height - 56)) }}
            transition={{ delay: 0.2 + i * 0.05, type: 'spring', stiffness: 140, damping: 18 }} />
          <span className={`w-full truncate text-center text-[11px] ${i === on ? 'font-semibold text-v-accent' : 'font-medium text-v-subtle'}`}>{d.label}</span>
        </div>
      ))}
    </div>
  )
}

/** Anillo de porcentaje con el gradiente de marca. */
export function Ring({ value, size = 72, label }: { value: number | null; size?: number; label?: string }) {
  const pct = Math.max(0, Math.min(100, value ?? 0)) / 100
  const r = size / 2 - 6
  const circ = 2 * Math.PI * r
  const id = `ring-${size}-${Math.round(pct * 1000)}`
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={label ?? `${Math.round(pct * 100)}%`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--v-brand-from)" /><stop offset="100%" stopColor="var(--v-brand-to)" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--v-fill)" strokeWidth="6" />
        <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`url(#${id})`} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={circ} initial={{ strokeDashoffset: circ }} animate={{ strokeDashoffset: circ * (1 - pct) }}
          transition={{ delay: 0.3, duration: 1.2, ease: EASE }} />
      </svg>
      <span className="v-display absolute inset-0 grid place-items-center text-[13px] font-bold tabular-nums text-v-text">{value == null ? '—' : `${Math.round(pct * 100)}%`}</span>
    </div>
  )
}

/** Fila de lista que entra con un leve retardo según su posición. */
export function Row({ index = 0, className, children }: { index?: number; className?: string; children: ReactNode }) {
  return (
    <motion.li className={className} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 + Math.min(index, 8) * 0.04 }}>
      {children}
    </motion.li>
  )
}

/** Saludo de la portada de cada panel: titular con el nombre en gradiente, fecha, reloj y fichas de resumen. */
export function Hero({ greeting, name, subtitle, chips, aside }: { greeting?: string; name: string; subtitle?: string; chips?: ReactNode; aside?: ReactNode }) {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    const tick = () => setNow(new Date())
    const first = setTimeout(tick, 0)
    const t = setInterval(tick, 30_000)
    return () => { clearTimeout(first); clearInterval(t) }
  }, [])
  const hour = now ? Number(new Intl.DateTimeFormat('es-CL', { hour: 'numeric', hour12: false, timeZone: 'America/Santiago' }).format(now)) : 12
  const hello = greeting ?? (hour < 12 ? 'Buenos días' : hour < 20 ? 'Buenas tardes' : 'Buenas noches')
  const day = now?.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Santiago' }) ?? ' '
  const time = now?.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Santiago' }) ?? '--:--'

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 160, damping: 22 }}
      className={`relative mb-5 overflow-hidden ${CARD}`}>
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(40rem 14rem at 0% 0%, var(--v-glow-1), transparent 70%)' }} />
      <div aria-hidden className="v-brand absolute inset-x-0 top-0 h-[3px]" />
      <div className="relative flex items-center justify-between gap-5 p-5 sm:p-6">
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="min-w-0 truncate text-sm text-v-muted first-letter:uppercase">{day}</p>
            <p className="v-brand-text v-display shrink-0 text-lg font-extrabold tabular-nums tracking-tight sm:hidden">{time}</p>
          </div>
          <h1 className="v-headline mt-1 text-[1.6rem] leading-tight text-v-text sm:text-[1.9rem]">
            {hello}, <span className="v-brand-text">{name}</span>
          </h1>
          {subtitle && <p className="mt-1.5 max-w-2xl text-sm text-v-muted">{subtitle}</p>}
          {chips && <div className="mt-3 flex flex-wrap items-center gap-2">{chips}</div>}
        </div>
        {aside ?? <p className="v-brand-text v-display hidden shrink-0 text-5xl font-extrabold tabular-nums tracking-tight sm:block">{time}</p>}
      </div>
    </motion.div>
  )
}

export function Chip({ tone = 'accent', icon, children }: { tone?: KpiTone; icon?: ReactNode; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${TONE[tone]}`}>{icon}{children}</span>
}

/** Transición de entrada del contenido de cada página. */
export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: EASE }}>
      {children}
    </motion.div>
  )
}

/** Barra apilada (p. ej. distribución de notas por tramo). Cada tramo crece desde cero. */
export function Stacked({ segments, height = 10 }: { segments: { value: number; className: string; label: string }[]; height?: number }) {
  const total = segments.reduce((n, s) => n + s.value, 0)
  if (total === 0) return <div className="rounded-full bg-v-fill" style={{ height }} />
  return (
    <div className="flex overflow-hidden rounded-full bg-v-fill" style={{ height }} role="img"
      aria-label={segments.map(s => `${s.label}: ${s.value}`).join(', ')}>
      {segments.map((s, i) => (
        <motion.div key={s.label} className={s.className} title={`${s.label}: ${s.value}`}
          initial={{ width: 0 }} animate={{ width: `${(s.value / total) * 100}%` }} transition={{ delay: 0.3 + i * 0.08, duration: 0.8, ease: EASE }} />
      ))}
    </div>
  )
}

/** Celda que aparece con un leve escalado (mapas de calor). */
export function Pop({ index = 0, className, style, title, children }: { index?: number; className?: string; style?: React.CSSProperties; title?: string; children: ReactNode }) {
  return (
    <motion.div className={className} style={style} title={title} initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: 1.04 }} transition={{ delay: 0.15 + Math.min(index, 16) * 0.03, type: 'spring', stiffness: 260, damping: 22 }}>
      {children}
    </motion.div>
  )
}
