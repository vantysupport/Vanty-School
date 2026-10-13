'use client'
// Portada pública de Vanty School. Todo gira en torno a una idea: la comunidad escolar completa, conectada.

import { useEffect, useState, type ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, Backpack, ChevronDown, GraduationCap, HeartHandshake, LineChart, Menu, Play, ShieldCheck, Users, X, type LucideIcon } from 'lucide-react'

// Video de demostración en YouTube: pega aquí el identificador (lo que va después de «v=» o de «youtu.be/»).
// Mientras esté vacío se muestra el archivo local.
const DEMO_YOUTUBE_ID = 'ZjC6LqrcROI'

/** El reproductor de YouTube se carga recién al pulsar: la portada no descarga nada de terceros antes. */
function DemoVideo() {
  const [playing, setPlaying] = useState(false)
  const frame = 'relative aspect-video w-full overflow-hidden rounded-[24px] border border-v-border bg-[#0b1b3a] shadow-v-lg'
  if (!DEMO_YOUTUBE_ID) {
    return (
      <video controls preload="none" poster="/landing/demo-poster.webp" className={frame}>
        <source src="/landing/demo.mp4" type="video/mp4" />
      </video>
    )
  }
  if (playing) {
    return (
      <div className={frame}>
        <iframe src={`https://www.youtube-nocookie.com/embed/${DEMO_YOUTUBE_ID}?autoplay=1&rel=0`} title="Demostración de Vanty School" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen className="absolute inset-0 size-full border-0" />
      </div>
    )
  }
  return (
    <button type="button" onClick={() => setPlaying(true)} aria-label="Reproducir la demostración de Vanty School" className={`${frame} group block`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/landing/demo-poster.webp" alt="" className="absolute inset-0 size-full object-cover" />
      <span aria-hidden className="absolute inset-0 bg-[#0b1b3a]/25 transition-colors group-hover:bg-[#0b1b3a]/10" />
      <span aria-hidden className="v-brand absolute left-1/2 top-1/2 grid size-24 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full shadow-v-brand transition-transform group-hover:scale-110"><Play size={38} className="ml-1.5" fill="currentColor" /></span>
    </button>
  )
}

const LINKS = [
  { id: 'roles', label: 'Un panel por rol' },
  { id: 'dimensiones', label: 'Qué nos distingue' },
  { id: 'aria', label: 'ARIA' },
  { id: 'preguntas', label: 'Preguntas' },
]

type Role = { key: string; label: string; icon: LucideIcon; color: string; img: string; title: string; points: string[] }
const ROLES: Role[] = [
  { key: 'estudiante', label: 'Estudiante', icon: Backpack, color: '#0ea5e9', img: '/landing/estudiante.webp', title: 'Sabe qué tiene que hacer y cómo va',
    points: ['Tareas y pruebas con su plazo', 'Notas por asignatura', 'Repaso con ARIA y petición de apoyo'] },
  { key: 'docente', label: 'Docente', icon: GraduationCap, color: '#10b981', img: '/landing/docente.webp', title: 'Su curso completo, sin planillas sueltas',
    points: ['Tareas, entregas y libro de notas', 'Asistencia diaria', 'ARIA Pedagógica para planificar y reforzar'] },
  { key: 'apoderado', label: 'Apoderado', icon: Users, color: '#8b5cf6', img: '/landing/apoderado.webp', title: 'Acompaña a su hijo sin esperar la reunión',
    points: ['Notas, asistencia y tareas al día', 'Mensajes con los profesores', 'Orientación de ARIA Familias'] },
  { key: 'bienestar', label: 'Bienestar', icon: HeartHandshake, color: '#ec4899', img: '/landing/bienestar.webp', title: 'Lo urgente primero, nada se pierde',
    points: ['Solicitudes de ayuda priorizadas', 'Casos con bitácora y seguimiento', 'Alertas cuando algo queda sin responsable'] },
  { key: 'direccion', label: 'Dirección', icon: LineChart, color: '#f59e0b', img: '/landing/direccion.webp', title: 'El colegio entero en una pantalla',
    points: ['Rendimiento y asistencia por curso', 'Estudiantes que necesitan apoyo', 'Evaluación de clases para acompañar docentes'] },
]

const DIMENSIONS = [
  { n: '1', tag: 'Aprendizaje activo', title: 'Aprender haciendo, con ARIA', img: '/landing/aprender.webp', color: '#0ea5e9',
    body: 'El estudiante escribe el tema que quiere repasar y ARIA le arma una misión con resumen, video y preguntas. Al responder, le explica por qué.',
    points: ['Repaso propio desde 3.º básico', 'El docente también crea repasos para su curso'], care: 'ARIA avisa que puede equivocarse y sugiere consultar al profesor.' },
  { n: '2', tag: 'Participación estudiantil', title: 'Los estudiantes ayudan a mejorar las clases', img: '/landing/participar.webp', color: '#f59e0b',
    body: 'Cada mes evalúan sus clases. Dirección ve promedios y una lectura de ARIA con hipótesis y formas de apoyo, y cada docente registra las estrategias que va a probar.',
    points: ['Ciclo de mejora compartido', 'El docente ve sus propios resultados'], care: 'Es anónima: promedios desde 5 respuestas y comentarios desde 10. ARIA no sugiere sanciones.' },
  { n: '3', tag: 'Acompañamiento', title: 'Acompañar más allá de la pantalla', img: '/landing/acompanar.webp', color: '#ec4899',
    body: 'Estudiantes y apoderados piden apoyo cuando lo necesitan. El equipo de bienestar da seguimiento con bitácora, intervenciones y próximos pasos.',
    points: ['Casos con responsable y fecha de seguimiento', 'En desarrollo: red de profesionales especializados'], care: 'ARIA nunca emite diagnósticos y, ante una urgencia, la plataforma indica a quién llamar.' },
]

const ARIAS = [
  { name: 'Repaso de clases', who: 'Estudiantes', text: 'Misiones para practicar lo visto en clases.' },
  { name: 'ARIA Pedagógica', who: 'Docentes', text: 'Ideas para planificar y reforzar, a partir de sus cursos.' },
  { name: 'ARIA Familias', who: 'Apoderados', text: 'Orientación para acompañar desde la casa.' },
  { name: 'ARIA Bienestar', who: 'Equipo de bienestar', text: 'Apoyo para ordenar casos y seguimientos.' },
  { name: 'ARIA Gestión', who: 'Dirección', text: 'Lectura del colegio completo para decidir.' },
]

const FAQ = [
  { q: '¿Qué es Vanty School?', a: 'Una plataforma para colegios que reúne en un solo lugar las tareas, las notas, la asistencia, la comunicación con las familias y el bienestar escolar, con ARIA como asistente de inteligencia educativa.' },
  { q: '¿Qué hace ARIA y qué no hace?', a: 'ARIA arma repasos, sugiere actividades y ayuda a leer los datos del colegio. No emite diagnósticos, no sugiere sanciones y avisa cuando puede equivocarse. Las decisiones siempre las toman las personas.' },
  { q: '¿Quién puede ver los datos de un estudiante?', a: 'Solo quienes corresponde: el propio estudiante, su apoderado, sus docentes y los equipos del colegio según su rol. Ningún otro colegio tiene acceso.' },
  { q: '¿La evaluación de clases es realmente anónima?', a: 'Sí. Dirección y docentes ven promedios, y solo cuando un grupo reúne 5 o más respuestas. Los comentarios escritos aparecen desde 10 respuestas y únicamente para dirección.' },
  { q: '¿Puedo probarla?', a: 'Sí. La demostración permite entrar como estudiante, apoderado, docente, bienestar, dirección o secretaría, con datos ficticios de un colegio de ejemplo.' },
  { q: '¿En qué etapa está?', a: 'Es un MVP en funcionamiento, presentado en Jump Chile 2026. La red de profesionales especializados para el acompañamiento está en desarrollo.' },
]

function Reveal({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 22 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }} className={className}>
      {children}
    </motion.div>
  )
}

function Heading({ title, body }: { title: string; body?: string }) {
  return (
    <Reveal className="mx-auto max-w-3xl text-center">
      <h2 className="v-display text-[clamp(2rem,4.6vw,3.4rem)] font-extrabold leading-[1.04] tracking-tight text-v-text">{title}</h2>
      {body && <p className="mt-4 text-[17px] leading-relaxed text-v-muted">{body}</p>}
    </Reveal>
  )
}

function Logo() {
  return (
    <span className="inline-flex items-center gap-2.5">
      <Image src="/brand/vanty-school-mark.webp" alt="" width={36} height={36} priority className="size-9 rounded-[26%] shadow-v-xs" />
      <span className="whitespace-nowrap text-[17px] font-semibold tracking-tight text-v-text">Vanty <span className="font-medium text-v-accent">School</span></span>
    </span>
  )
}

/** Ventana con la aplicación real: un rol por pestaña. Avanza sola hasta que alguien elige una. */
function RoleShowcase() {
  const [index, setIndex] = useState(0)
  const [auto, setAuto] = useState(true)
  useEffect(() => {
    if (!auto) return
    const id = setInterval(() => setIndex(i => (i + 1) % ROLES.length), 4800)
    return () => clearInterval(id)
  }, [auto])
  const role = ROLES[index]
  return (
    <div className="rounded-[28px] border border-v-border bg-v-elevated/80 p-2.5 shadow-v-lg backdrop-blur sm:p-3.5">
      <div role="tablist" aria-label="Panel de cada rol" className="flex gap-1.5 overflow-x-auto pb-2.5 sm:justify-center">
        {ROLES.map((r, i) => (
          <button key={r.key} type="button" role="tab" aria-selected={i === index} onClick={() => { setIndex(i); setAuto(false) }}
            className={`inline-flex shrink-0 items-center gap-2 rounded-full px-5 py-3 text-[15.5px] font-semibold transition-colors ${i === index ? 'text-white shadow-v' : 'text-v-muted hover:bg-v-fill hover:text-v-text'}`}
            style={i === index ? { background: r.color } : undefined}>
            <r.icon size={16} />{r.label}
          </button>
        ))}
      </div>
      <div className="relative aspect-[16/9] overflow-hidden rounded-[20px] border border-v-border bg-v-fill">
        <AnimatePresence initial={false}>
          <motion.div key={role.key} initial={{ opacity: 0, scale: 1.02 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} className="absolute inset-0">
            <Image src={role.img} alt={`Panel de ${role.label} en Vanty School`} width={2880} height={1620} priority={index === 0} unoptimized className="size-full object-cover object-top" />
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="flex flex-col gap-3 px-2 pb-1.5 pt-4 sm:flex-row sm:items-center sm:justify-between sm:px-3">
        <p className="v-display text-[1.45rem] font-bold tracking-tight text-v-text">{role.title}</p>
        <p className="text-[15.5px] text-v-muted">{role.points.join(' · ')}</p>
      </div>
    </div>
  )
}

export function Landing() {
  const [menu, setMenu] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [faq, setFaq] = useState<number | null>(0)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  const goTo = (id: string) => { setMenu(false); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }

  return (
    <div className="v-root min-h-dvh overflow-x-clip bg-v-bg text-v-text">
      <header className={`sticky top-0 z-40 transition-[background,box-shadow] ${scrolled ? 'bg-v-elevated/85 shadow-v-xs backdrop-blur-lg' : ''}`}>
        <div className="mx-auto flex h-[68px] max-w-[1240px] items-center justify-between gap-4 px-4 sm:px-6">
          <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="Vanty School, inicio"><Logo /></button>
          <nav aria-label="Secciones" className="hidden items-center gap-1 lg:flex">
            {LINKS.map(l => <button key={l.id} type="button" onClick={() => goTo(l.id)} className="rounded-full px-3.5 py-2 text-[14px] font-medium text-v-muted transition-colors hover:bg-v-fill hover:text-v-text">{l.label}</button>)}
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className="hidden rounded-full px-4 py-2 text-[14px] font-semibold text-v-text hover:bg-v-fill sm:block">Ingresar</Link>
            <Link href="/login" className="v-brand hidden h-11 items-center gap-2 whitespace-nowrap rounded-full px-5 text-[14px] font-bold shadow-v-brand transition-transform hover:-translate-y-0.5 sm:inline-flex">Ver la demostración<ArrowRight size={16} /></Link>
            <button type="button" onClick={() => setMenu(m => !m)} aria-label={menu ? 'Cerrar menú' : 'Abrir menú'} aria-expanded={menu} className="grid size-11 place-items-center rounded-full text-v-text hover:bg-v-fill lg:hidden">{menu ? <X size={20} /> : <Menu size={20} />}</button>
          </div>
        </div>
        <AnimatePresence>
          {menu && (
            <motion.nav initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} aria-label="Secciones" className="border-t border-v-border bg-v-elevated px-4 pb-4 pt-2 shadow-v lg:hidden">
              {LINKS.map(l => <button key={l.id} type="button" onClick={() => goTo(l.id)} className="block w-full rounded-v-sm px-3 py-3 text-left text-[15px] font-medium text-v-text hover:bg-v-fill">{l.label}</button>)}
              <Link href="/login" className="mt-1 block rounded-v-sm px-3 py-3 text-[15px] font-semibold text-v-accent hover:bg-v-fill">Ingresar</Link>
            </motion.nav>
          )}
        </AnimatePresence>
      </header>

      <main>
        {/* Portada */}
        <section className="relative px-4 pb-10 pt-10 sm:px-6 sm:pt-16">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-24 h-[720px] overflow-hidden">
            <div className="v-orb-a absolute -left-40 top-0 size-[34rem] rounded-full bg-[#01abfc]/30 blur-3xl" />
            <div className="v-orb-b absolute -right-32 top-24 size-[30rem] rounded-full bg-[#0069db]/22 blur-3xl" />
            <div className="v-orb-c absolute left-1/2 top-64 size-72 -translate-x-1/2 rounded-full bg-[#8b5cf6]/14 blur-3xl" />
          </div>
          <div className="relative mx-auto max-w-[1240px] text-center">
            <motion.h1 initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
              className="v-display text-[clamp(3.4rem,11vw,8.5rem)] font-extrabold leading-[0.92] tracking-[-0.045em]">
              Vanty <span className="bg-gradient-to-r from-[#01abfc] to-[#0069db] bg-clip-text text-transparent">School</span>
            </motion.h1>
            <motion.p initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.15 }} className="mx-auto mt-6 max-w-2xl text-[clamp(1.1rem,2.2vw,1.45rem)] leading-snug text-v-muted">
              Estudiantes, familias, docentes, bienestar y dirección, conectados en cada avance.
            </motion.p>
            <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.25 }} className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link href="/login" className="v-brand v-sweep v-sweep-auto inline-flex h-14 items-center gap-2.5 rounded-full px-8 text-[16px] font-bold shadow-v-brand transition-transform hover:-translate-y-0.5">Recorrer la demostración<ArrowRight size={18} /></Link>
              <button type="button" onClick={() => goTo('demo')} className="inline-flex h-14 items-center gap-2.5 rounded-full border border-v-border-strong bg-v-elevated px-7 text-[16px] font-semibold text-v-text shadow-v-xs transition-colors hover:border-v-accent hover:text-v-accent"><Play size={17} />Ver el video</button>
            </motion.div>
            <p className="mt-4 text-[13px] text-v-subtle">Demostración con datos ficticios · sin registro</p>
          </div>

          <motion.div id="roles" initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.35, ease: [0.22, 1, 0.36, 1] }} className="relative mx-auto mt-12 max-w-[1640px] scroll-mt-24">
            <RoleShowcase />
          </motion.div>
        </section>

        {/* Tres dimensiones */}
        <section id="dimensiones" className="scroll-mt-24 px-4 py-16 sm:px-6 sm:py-24">
          <Heading title="Sobre la gestión de siempre, tres dimensiones más" body="Tareas, notas, asistencia y comunicación son la base. Lo que suma Vanty School es cómo conecta el aprendizaje, la voz de los estudiantes y el acompañamiento." />
          <div className="mx-auto mt-14 max-w-[1440px] space-y-16 sm:space-y-24">
            {DIMENSIONS.map((d, i) => (
              <Reveal key={d.n} className={`grid items-center gap-8 lg:gap-14 ${i % 2 ? 'lg:grid-cols-[1.45fr_1fr] lg:[&>*:first-child]:order-2' : 'lg:grid-cols-[1fr_1.45fr]'}`}>
                <div>
                  <h3 className="v-display text-[clamp(1.7rem,3.4vw,2.5rem)] font-extrabold leading-[1.06] tracking-tight">{d.title}</h3>
                  <p className="mt-4 text-[17px] leading-relaxed text-v-muted">{d.body}</p>
                  <ul className="mt-5 space-y-2.5">
                    {d.points.map(p => <li key={p} className="flex items-start gap-3 text-[15.5px] text-v-text"><span className="mt-2 size-2 shrink-0 rounded-full" style={{ background: d.color }} />{p}</li>)}
                  </ul>
                  <p className="mt-6 flex items-start gap-3 rounded-v-lg bg-[#0b1b3a] px-5 py-4 text-[14.5px] leading-relaxed text-white"><ShieldCheck size={19} className="mt-0.5 shrink-0 text-[#38bdf8]" />{d.care}</p>
                </div>
                <div className="relative">
                  <div aria-hidden className="absolute -inset-6 rounded-[40px] opacity-25 blur-3xl" style={{ background: d.color }} />
                  <div className="relative overflow-hidden rounded-[24px] border border-v-border bg-v-elevated shadow-v-lg">
                    <video autoPlay muted loop playsInline preload="metadata" poster={d.img} aria-label={`${d.tag} en Vanty School, en uso`} className="block aspect-video w-full">
                      <source src={d.img.replace('.webp', '.mp4')} type="video/mp4" />
                    </video>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ARIA */}
        <section id="aria" className="scroll-mt-24 px-4 py-6 sm:px-6">
          <Reveal className="v-brand v-sweep v-sweep-auto relative mx-auto max-w-[1440px] overflow-hidden rounded-[32px] px-6 py-12 text-white sm:px-14 sm:py-16">
            <div aria-hidden className="v-orb-a pointer-events-none absolute -right-32 -top-32 size-[30rem] rounded-full bg-white/12 blur-3xl" />
            <div aria-hidden className="v-orb-b pointer-events-none absolute -bottom-40 -left-24 size-[26rem] rounded-full bg-[#7fd6ff]/20 blur-3xl" />
            <div className="relative flex flex-col items-center gap-8 lg:flex-row lg:justify-between">
              <div className="max-w-2xl">
                <h2 className="v-display text-[clamp(2.2rem,5vw,4rem)] font-extrabold leading-[1.02] tracking-tight">ARIA trabaja dentro del flujo de cada persona</h2>
                <p className="mt-5 text-[18px] leading-relaxed text-white/85">No es un chat aparte. Aparece donde hace falta, con lo que ese rol puede ver, y siempre deja la decisión en manos de las personas.</p>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/aria/pose-2.webp" alt="ARIA, la asistente de Vanty School" className="v-float h-64 w-auto shrink-0 drop-shadow-[0_24px_40px_rgba(0,30,90,0.45)] sm:h-80 lg:mr-10" />
            </div>
            <ul className="relative mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {ARIAS.map((a, i) => (
                <motion.li key={a.name} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: 0.08 * i }}
                  className="flex flex-col rounded-[22px] bg-white/12 p-5 ring-1 ring-white/20 backdrop-blur-sm transition-colors hover:bg-white/18">
                  <p className="text-[14px] text-white/75">Para {a.who.toLowerCase()}</p>
                  <p className="v-display mt-1 text-[1.25rem] font-bold leading-tight">{a.name}</p>
                  <p className="mt-2 text-[14.5px] leading-snug text-white/85">{a.text}</p>
                </motion.li>
              ))}
            </ul>
          </Reveal>
        </section>

        {/* Video */}
        <section id="demo" className="scroll-mt-24 px-4 py-16 sm:px-6 sm:py-24">
          <Heading title="Mírala funcionando" body="Dos minutos de uso real: ingreso, estudiante, ARIA armando un repaso, docente y dirección." />
          <Reveal className="relative mx-auto mt-10 max-w-[1560px]">
            <div aria-hidden className="absolute -inset-8 rounded-[48px] bg-[#0069db]/18 blur-3xl" />
            <DemoVideo />
          </Reveal>
        </section>

        {/* En el celular */}
        <section className="px-4 pb-16 sm:px-6 sm:pb-24">
          <div className="mx-auto grid max-w-[1240px] items-center gap-10 lg:grid-cols-[1fr_1.15fr]">
            <Reveal>
              <h2 className="v-display text-[clamp(2rem,4.6vw,3.2rem)] font-extrabold leading-[1.04] tracking-tight">Pensada para la pantalla que todos tienen</h2>
              <p className="mt-4 text-[17px] leading-relaxed text-v-muted">Cada panel se adapta al teléfono, sin instalar nada. Y los más chicos, de 1.º a 6.º básico, ven un modo simple con letra grande y menos cosas por pantalla.</p>
            </Reveal>
            <Reveal delay={0.1} className="flex items-end justify-center gap-3 sm:gap-5">
              {[['/landing/movil-estudiante.webp', 'Notas del estudiante en el celular', 'sm:translate-y-6'], ['/landing/movil-docente.webp', 'Curso del docente en el celular', ''], ['/landing/movil-apoderado.webp', 'Seguimiento del apoderado en el celular', 'sm:translate-y-6']].map(([src, alt, shift]) => (
                <div key={src} className={`w-[31%] max-w-[230px] overflow-hidden rounded-[26px] border-[5px] border-[#0b1b3a] bg-[#0b1b3a] shadow-v-lg ${shift}`}>
                  <Image src={src} alt={alt} width={1170} height={2532} unoptimized className="h-auto w-full rounded-[20px]" />
                </div>
              ))}
            </Reveal>
          </div>
        </section>

        {/* Preguntas */}
        <section id="preguntas" className="scroll-mt-24 px-4 py-16 sm:px-6 sm:py-24">
          <div className="mx-auto grid max-w-[1240px] gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
            <Reveal className="lg:sticky lg:top-28 lg:self-start">
              <h2 className="v-display text-[clamp(2.2rem,4.8vw,3.6rem)] font-extrabold leading-[1.02] tracking-tight">Lo que suelen preguntarnos</h2>
              <p className="mt-4 text-[17px] leading-relaxed text-v-muted">Si te queda otra duda, la demostración responde casi todo: entra y recórrela como cada rol.</p>
              <Link href="/login" className="mt-6 inline-flex items-center gap-2 text-[16px] font-bold text-v-accent hover:gap-3">Recorrer la demostración<ArrowRight size={18} /></Link>
            </Reveal>
            <Reveal delay={0.08} className="overflow-hidden rounded-[28px] border border-v-border bg-v-elevated shadow-v">
              {FAQ.map((f, i) => (
                <div key={f.q} className={`border-b border-v-border last:border-b-0 ${faq === i ? 'bg-v-accent-soft/40' : ''}`}>
                  <button type="button" onClick={() => setFaq(faq === i ? null : i)} aria-expanded={faq === i} className="flex w-full items-center gap-5 px-6 py-6 text-left sm:px-8">
                    <span className="v-display w-9 shrink-0 text-[1.1rem] font-bold tabular-nums text-v-accent">{String(i + 1).padStart(2, '0')}</span>
                    <span className="flex-1 text-[18.5px] font-semibold leading-snug text-v-text">{f.q}</span>
                    <span className={`grid size-10 shrink-0 place-items-center rounded-full transition-all ${faq === i ? 'rotate-180 bg-v-accent text-white' : 'bg-v-fill text-v-muted'}`}><ChevronDown size={20} /></span>
                  </button>
                  <AnimatePresence initial={false}>
                    {faq === i && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.28 }}>
                        <p className="pb-7 pl-[4.75rem] pr-6 text-[16.5px] leading-relaxed text-v-muted sm:pl-[5.25rem] sm:pr-16">{f.a}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </Reveal>
          </div>
        </section>

        {/* Cierre */}
        <section className="px-4 pb-16 sm:px-6">
          <Reveal className="relative mx-auto max-w-[1240px] overflow-hidden rounded-[32px] bg-[#0b1b3a] px-6 py-14 text-center text-white sm:py-20">
            <div aria-hidden className="v-orb-b pointer-events-none absolute -left-24 -top-24 size-[26rem] rounded-full bg-[#01abfc]/30 blur-3xl" />
            <div aria-hidden className="v-orb-a pointer-events-none absolute -bottom-32 -right-20 size-[26rem] rounded-full bg-[#0069db]/40 blur-3xl" />
            <div className="relative">
              <h2 className="v-display mx-auto max-w-3xl text-[clamp(2.1rem,5vw,3.8rem)] font-extrabold leading-[1.02] tracking-tight">Entra y recórrela como cada rol</h2>
              <p className="mx-auto mt-4 max-w-xl text-[17px] leading-relaxed text-white/80">Un colegio de ejemplo completo, con datos ficticios, listo para probar.</p>
              <Link href="/login" className="v-brand v-sweep v-sweep-auto mt-8 inline-flex h-14 items-center gap-2.5 rounded-full px-9 text-[16px] font-bold shadow-v-brand transition-transform hover:-translate-y-0.5">Recorrer la demostración<ArrowRight size={18} /></Link>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-v-border px-4 py-8 sm:px-6">
        <div className="mx-auto flex max-w-[1240px] flex-col items-center justify-between gap-4 text-[13.5px] text-v-subtle sm:flex-row">
          <Logo />
          <p>© {new Date().getFullYear()} Vanty School · Jump Chile 2026</p>
          <a href="https://vanty.xyz/es" target="_blank" rel="noreferrer" className="font-medium hover:text-v-text">Ecosistema Vanty</a>
        </div>
      </footer>
    </div>
  )
}
