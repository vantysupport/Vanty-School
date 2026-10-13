import type { ReactNode } from 'react'
import Image from 'next/image'
import { BookOpenCheck, HeartHandshake, Sparkles, type LucideIcon } from 'lucide-react'

const FEATURES: { icon: LucideIcon; text: string }[] = [
  { icon: BookOpenCheck, text: 'Tareas, notas y asistencia en un solo lugar' },
  { icon: Sparkles, text: 'ARIA, inteligencia que acompaña y no reemplaza' },
  { icon: HeartHandshake, text: 'Bienestar escolar con resguardo de la privacidad' },
]

const BRAND_TITLE = 'Toda la comunidad educativa, conectada.'
const BRAND_BODY = 'Gestión académica, comunicación con las familias y bienestar escolar en un ecosistema inteligente para colegios de Chile.'

function Logo({ size }: { size: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <Image src="/brand/vanty-school-mark.webp" alt="" width={size} height={size} priority
        className="rounded-[26%] ring-1 ring-white/30 drop-shadow-[0_4px_14px_rgba(0,40,120,0.35)]" style={{ width: size, height: size }} />
      <span className={`font-semibold tracking-tight ${size >= 40 ? 'text-2xl' : 'text-[17px]'}`}>
        Vanty <span className="font-medium tracking-[0.06em] opacity-85">School</span>
      </span>
    </span>
  )
}

// Orbes de luz detrás del contenido de marca.
function Ambient() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div className="v-orb-a absolute -right-40 -top-40 size-[32rem] rounded-full bg-white/12 blur-3xl" />
      <div className="v-orb-b absolute -bottom-48 -left-32 size-[28rem] rounded-full bg-[#01abfc]/45 blur-3xl" />
      <div className="v-orb-c absolute left-1/2 top-1/3 size-64 rounded-full bg-[#7fd6ff]/25 blur-3xl" />
    </div>
  )
}

/** Marco de las pantallas de acceso, con la misma estructura que el AuthShell de VANTY ABA:
 *  panel de marca a la izquierda (banda superior en celular) y formulario a la derecha. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="v-root min-h-dvh lg:grid lg:grid-cols-[1fr_1.05fr]">
      <section className="v-brand v-sweep v-sweep-auto relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-12">
        <Ambient />
        <div className="relative z-10 w-fit"><Logo size={40} /></div>

        <div className="v-rise relative z-10 max-w-xl">
          <h2 className="v-headline v-shine-text text-4xl">{BRAND_TITLE}</h2>
          <p className="mt-4 max-w-md text-lg text-white/85">{BRAND_BODY}</p>
          <ul className="mt-8 space-y-3">
            {FEATURES.map(({ icon: Icon, text }, i) => (
              <li key={text} style={{ animationDelay: `${0.25 + i * 0.1}s`, ['--v-sweep-delay' as string]: `${1.2 + i * 0.6}s`, ['--v-sweep-duration' as string]: '5.5s' }}
                className="v-sweep v-sweep-auto v-rise flex w-fit items-center gap-3 rounded-full bg-white/10 py-2 pl-2 pr-5 text-white/95 ring-1 ring-white/20 backdrop-blur-sm transition-transform hover:translate-x-1">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/20"><Icon className="size-4" /></span>
                {text}
              </li>
            ))}
          </ul>
        </div>

        {/* ARIA va en posición absoluta: su tamaño no empuja el titular hacia arriba. */}
        <div className="relative z-10 flex items-end justify-between">
          <p className="text-sm text-white/70">© {new Date().getFullYear()} Vanty School</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/aria/pose-1.webp" alt="ARIA, la asistente de Vanty School" className="v-float absolute bottom-0 right-0 -mb-3 h-44 w-auto drop-shadow-[0_14px_24px_rgba(0,30,90,0.35)] min-[1400px]:right-6 min-[1400px]:h-56" />
        </div>
      </section>

      <section className="flex min-h-dvh flex-col">
        {/* En celular, una banda de marca reemplaza al panel lateral */}
        <div className="v-brand v-sweep v-sweep-auto relative overflow-hidden rounded-b-[2rem] px-5 pb-8 pt-[max(1rem,env(safe-area-inset-top))] lg:hidden">
          <Ambient />
          <div className="relative z-10 flex items-center justify-between">
            <Logo size={30} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/aria/pose-1.webp" alt="" className="-mb-8 h-20 w-auto" />
          </div>
          <div className="v-rise relative z-10 mt-6">
            <p className="v-shine-text text-2xl font-semibold tracking-tight">{BRAND_TITLE}</p>
            <p className="mt-1.5 text-sm text-white/85">{BRAND_BODY}</p>
          </div>
        </div>

        <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pb-6 pt-7 sm:px-8 lg:justify-center lg:pt-0">
          {children}
        </div>

        <footer className="flex justify-center gap-4 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-xs text-v-subtle">
          <span>Jump Chile 2026</span>
          <a href="https://vanty.xyz/es" target="_blank" rel="noreferrer" className="hover:text-v-text">Ecosistema Vanty</a>
        </footer>
      </section>
    </main>
  )
}
