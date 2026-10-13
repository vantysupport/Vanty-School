'use client'
import { useState, type ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion } from 'motion/react'
import {
  BarChart3, Building2, CalendarCheck, ClipboardList, Flag, FolderOpen, GraduationCap, HeartHandshake, Home, Inbox, LogOut,
  Megaphone, Menu, MessageSquare, Settings, ShieldCheck, Sparkles, Star, Target, Users, X, type LucideIcon,
} from 'lucide-react'
import type { NavItem } from '@/lib/roles'
import { Avatar } from '@/components/ui/primitives'
import { signOut, switchInstitution } from '@/lib/actions/auth'

const ICONS: Record<string, LucideIcon> = {
  home: Home, users: Users, school: GraduationCap, clipboard: ClipboardList, folder: FolderOpen, megaphone: Megaphone,
  shield: ShieldCheck, settings: Settings, chart: BarChart3, target: Target, sparkles: Sparkles, calendar: CalendarCheck,
  message: MessageSquare, inbox: Inbox, heart: HeartHandshake, flag: Flag, star: Star, building: Building2,
}

type Props = {
  nav: NavItem[]
  user: { id: string; avatarVersion: string | null; name: string; email: string; roleLabel: string }
  institution: { id: string; name: string; isDemo: boolean; logoUrl?: string | null }
  institutions: { id: string; name: string }[]
  switcher?: ReactNode   // selector propio de un rol (el apoderado elige a qué estudiante está viendo)
  profileHref?: string | null   // null: sin perfil propio (el panel del equipo Vanty)
  children: ReactNode
}

/** Estructura del panel, con el mismo lenguaje que el de VANTY ABA: menú lateral translúcido con halo de marca,
 *  entrada escalonada de los enlaces y una píldora en gradiente que se desliza hasta la sección activa. */
export function Shell({ nav, user, institution, institutions, switcher, profileHref = '/perfil', children }: Props) {
  // Las tareas del docente viven dentro de «Mis cursos», aunque conserven su propia ruta.
  const pathname = usePathname().replace(/^\/docente\/(tareas|repaso)(?=\/|$)/, '/docente/cursos')
  const [open, setOpen] = useState(false)

  // La entrada activa es la de ruta más larga que coincide (Inicio no "gana" a las subsecciones).
  const active = [...nav].sort((a, b) => b.href.length - a.href.length)
    .find(i => pathname === i.href || pathname.startsWith(`${i.href}/`))

  return (
    <div className="v-root flex h-dvh overflow-hidden">
      <aside className={`fixed z-50 flex h-full w-[248px] flex-col border-r border-v-border bg-v-elevated/90 backdrop-blur-xl transition-transform duration-300 md:static md:translate-x-0 ${open ? 'translate-x-0 shadow-v-lg' : '-translate-x-full'}`}>
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-44 opacity-80"
          style={{ background: 'radial-gradient(16rem 9rem at 20% 0%, var(--v-glow-1), transparent 70%)' }} />

        <div className="relative shrink-0 px-4 pb-4 pt-6">
          <div className="flex items-center gap-3">
            <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 20 }}
              className={`relative size-12 shrink-0 overflow-hidden rounded-[30%] ring-1 ring-v-border ${institution.logoUrl ? 'bg-white shadow-v-xs' : 'shadow-v-brand'}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {institution.logoUrl ? <img src={institution.logoUrl} alt="" className="size-full object-contain p-0.5" /> : <Image src="/brand/vanty-school-mark.webp" alt="" width={48} height={48} className="size-full object-cover" priority />}
            </motion.div>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-[13px] font-semibold leading-snug tracking-tight text-v-text" title={institution.name}>{institution.name}</p>
              <span className="mt-1 inline-flex max-w-full items-center rounded-full bg-v-accent-soft px-2 py-0.5 text-[10px] font-semibold text-v-accent">
                <span className="truncate">{user.roleLabel}</span>
              </span>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Cerrar menú" className="grid size-8 shrink-0 place-items-center rounded-full text-v-subtle hover:bg-v-fill hover:text-v-text md:hidden">
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="mx-4 h-px bg-v-border" />

        <nav className="relative flex-1 space-y-1 overflow-y-auto px-3 py-3" aria-label="Navegación principal">
          {nav.map((item, i) => {
            const Icon = ICONS[item.icon] ?? Home
            const on = active?.href === item.href
            return (
              <motion.div key={item.href} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.03 * i, duration: 0.3, ease: [0.22, 1, 0.36, 1] }} whileTap={{ scale: 0.97 }}>
                <Link href={item.href} onClick={() => setOpen(false)} aria-current={on ? 'page' : undefined}
                  className={`group relative flex items-center gap-3 rounded-v-sm px-3 py-2.5 text-sm ${on ? 'text-white' : 'text-v-muted hover:bg-v-fill hover:text-v-text'}`}>
                  {on && (
                    <motion.span layoutId="nav-active" transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                      className="v-brand absolute inset-0 overflow-hidden rounded-v-sm shadow-v-brand" />
                  )}
                  <Icon size={18} strokeWidth={on ? 2.2 : 1.8}
                    className={`relative z-[2] shrink-0 transition-transform duration-200 group-hover:scale-110 ${on ? 'text-white' : 'text-v-subtle group-hover:text-v-accent'}`} />
                  <span className="relative z-[2] flex-1 truncate font-medium">{item.label}</span>
                </Link>
              </motion.div>
            )
          })}
        </nav>

        <div className="relative shrink-0 border-t border-v-border p-3">
          {institutions.length > 1 && (
            <form action={switchInstitution} className="mb-2">
              <select name="institution_id" defaultValue={institution.id} onChange={e => e.currentTarget.form?.requestSubmit()}
                aria-label="Cambiar de colegio" className="v-input !py-1.5 !text-[12.5px]">
                {institutions.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </form>
          )}
          <div className="flex items-center gap-1 rounded-v-sm p-1">
            {(() => {
              const who = (
                <>
                  <Avatar name={user.name} size={34} id={user.id} v={user.avatarVersion} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-v-text">{user.name}</span>
                    <span className="block truncate text-[10px] text-v-subtle">{user.email}</span>
                  </span>
                </>
              )
              return profileHref
                ? <Link href={profileHref} title="Mi perfil" onClick={() => setOpen(false)} className="flex min-w-0 flex-1 items-center gap-3 rounded-v-sm p-1 hover:bg-v-fill">{who}</Link>
                : <div className="flex min-w-0 flex-1 items-center gap-3 p-1">{who}</div>
            })()}
            <form action={signOut}>
              <button type="submit" aria-label="Cerrar sesión" title="Cerrar sesión" className="grid size-8 place-items-center rounded-full text-v-subtle hover:bg-v-danger/10 hover:text-v-danger">
                <LogOut size={15} />
              </button>
            </form>
          </div>
          <div className="mt-1.5 flex items-center justify-center gap-1.5 text-[10px] text-v-subtle">
            <span>powered by</span><span className="v-brand-text font-bold tracking-tight">Vanty School</span>
          </div>
        </div>
      </aside>

      {open && <div className="fixed inset-0 z-40 bg-[#081426]/40 backdrop-blur-sm md:hidden" onClick={() => setOpen(false)} />}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="relative z-30 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-v-border bg-v-elevated/80 px-3 backdrop-blur-xl md:h-16 md:px-6">
          <div className="flex min-w-0 items-center gap-2 md:gap-3">
            <button onClick={() => setOpen(true)} aria-label="Abrir menú" className="grid size-9 place-items-center rounded-v-sm text-v-muted hover:bg-v-fill md:hidden">
              <Menu size={18} />
            </button>
            <div className="min-w-0">
              <motion.p key={active?.href} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                className="truncate text-sm font-bold tracking-tight text-v-text md:text-lg">{active?.label ?? 'Panel'}</motion.p>
              <p className="hidden truncate text-[11px] text-v-subtle sm:block">{institution.name} · Vanty School</p>
            </div>
          </div>
          {switcher && <div className="flex min-w-0 flex-1 justify-end">{switcher}</div>}
          {institution.isDemo && (
            <span className={`${switcher ? 'hidden md:flex' : 'flex'} shrink-0 items-center gap-1.5 rounded-full bg-v-warning/15 px-3 py-1 text-[11px] font-semibold text-[#a16207]`} title="Todos los datos de este colegio son ficticios">
              <span className="size-1.5 animate-pulse rounded-full bg-v-warning" />Datos de demostración
            </span>
          )}
        </header>
        {/* relative: los controles ocultos (sr-only, en posición absoluta) deben desplazarse con el contenido y no alargar la página entera. */}
        <main className="relative flex-1 overflow-y-auto overflow-x-hidden">
          <div className="w-full px-4 pb-24 pt-5 md:px-6 md:pt-6">{children}</div>
        </main>
      </div>
    </div>
  )
}
