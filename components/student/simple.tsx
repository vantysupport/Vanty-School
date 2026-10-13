import Link from 'next/link'
import { ArrowRight, CheckCircle2, ClipboardList, FileCheck2, HeartHandshake, MessageSquareText, Star } from 'lucide-react'
import type { StudentAcademics, StudentTask } from '@/lib/data/student'
import { subjectCover } from '@/lib/subject-colors'
import { daysBetween } from '@/lib/wellbeing'
import { fmtScore } from '@/lib/format'
import { EmptyState } from '@/components/ui/primitives'
import { Bar, Reveal } from '@/components/ui/motion'

// Panel del estudiante en «modo simple» (cursos chicos): letra grande, pocas cosas por pantalla,
// palabras de niño y tono positivo. No muestra porcentajes, promedios ponderados ni avisos en rojo.

const dayName = (iso: string) => new Date(iso).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', timeZone: 'America/Santiago' })

/** Para cuándo es, como se lo diría un adulto a un niño. Una tarea atrasada no se reta: se invita a entregarla. */
export function kidDue(t: StudentTask, today: string): { text: string; soon: boolean } {
  const exam = t.kind !== 'tarea'
  const days = daysBetween(today, t.dueAt)
  if (days < 0) return { text: exam ? 'Ya se hizo en clases' : 'Todavía puedes entregarla', soon: !exam }
  if (days === 0) return { text: exam ? 'La prueba es hoy' : 'Es para hoy', soon: true }
  if (days === 1) return { text: exam ? 'La prueba es mañana' : 'Es para mañana', soon: true }
  return { text: `${exam ? 'La prueba es el' : 'Es para el'} ${dayName(t.dueAt)}`, soon: false }
}

const TODO = (t: StudentTask) => t.state === 'pending' || t.state === 'late' || t.state === 'upcoming'

/** Tarjeta grande de una tarea o prueba. */
function BigTask({ t, today, index = 0 }: { t: StudentTask; today: string; index?: number }) {
  const exam = t.kind !== 'tarea'
  const d = kidDue(t, today)
  const done = t.state === 'submitted' || t.state === 'awaiting' || t.state === 'graded'
  return (
    <Reveal index={Math.min(index, 6)}>
      <Link href={`/estudiante/tareas/${t.id}`} className="group flex h-full items-center gap-4 rounded-v-lg border border-v-border bg-v-elevated p-5 shadow-v transition-all duration-300 hover:-translate-y-1 hover:shadow-v-lg">
        <span className="grid size-16 shrink-0 place-items-center rounded-3xl text-white shadow-v" style={{ background: subjectCover(t.subjectId) }}>{exam ? <FileCheck2 size={30} /> : <ClipboardList size={30} />}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold text-v-muted">{t.subjectName}{exam ? ' · Prueba' : ''}</p>
          <p className="text-[19px] font-bold leading-snug tracking-tight text-v-text group-hover:text-v-accent">{t.title}</p>
          <p className={`mt-1 inline-flex items-center gap-1.5 text-[15px] font-semibold ${t.grade ? 'text-[#157a4b]' : done ? 'text-v-accent' : d.soon ? 'text-[#b45309]' : 'text-v-muted'}`}>
            {t.grade ? <><Star size={16} className="fill-current" />Mi nota: {fmtScore(t.grade.score)}</> : done ? <><CheckCircle2 size={16} />{exam ? 'Ya la hice' : 'Ya la entregué'}</> : d.text}
          </p>
        </div>
        <span className={`hidden h-12 shrink-0 items-center gap-2 rounded-full px-5 text-[15px] font-bold sm:inline-flex ${done ? 'border border-v-border-strong text-v-text' : 'v-brand shadow-v-brand'}`}>{done || exam ? 'Ver' : 'Hacer'}<ArrowRight size={17} /></span>
      </Link>
    </Reveal>
  )
}

const Title = ({ children }: { children: React.ReactNode }) => <h2 className="v-display mb-3 mt-6 text-[1.45rem] font-bold tracking-tight text-v-text">{children}</h2>

export function SimpleHome({ data, name, today }: { data: StudentAcademics; name: string; today: string }) {
  const todo = data.tasks.filter(TODO).sort((a, b) => a.dueAt.localeCompare(b.dueAt))
  const recent = data.tasks.filter(t => t.grade).sort((a, b) => b.grade!.gradedAt.localeCompare(a.grade!.gradedAt)).slice(0, 2)
  return (
    <div>
      <div className="v-brand relative overflow-hidden rounded-v-lg p-7 shadow-v-brand">
        <span aria-hidden className="pointer-events-none absolute -right-10 -top-16 size-56 rounded-full bg-white/15" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/aria/pose-1.webp" alt="" className="v-float pointer-events-none absolute -bottom-2 right-4 hidden h-32 w-auto drop-shadow-[0_10px_18px_rgba(0,40,120,0.3)] sm:block" />
        <p className="v-display relative text-[2.1rem] font-bold leading-tight tracking-tight">¡Hola, {name}!</p>
        <p className="relative mt-1 max-w-md text-[17px] text-white/95">{todo.length ? `Tienes ${todo.length} ${todo.length === 1 ? 'cosa' : 'cosas'} por hacer.` : '¡No tienes nada pendiente! Muy bien.'}</p>
      </div>

      <Title>¿Qué tengo que hacer?</Title>
      {todo.length === 0 ? (
        <div className="rounded-v-lg border border-v-border bg-v-elevated shadow-v"><EmptyState aria={2} title="¡Estás al día!" description="No tienes tareas ni pruebas por ahora." /></div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">{todo.slice(0, 4).map((t, i) => <BigTask key={t.id} t={t} today={today} index={i} />)}</div>
      )}
      {todo.length > 4 && <Link href="/estudiante/tareas" className="mt-3 inline-flex items-center gap-2 text-[16px] font-bold text-v-accent hover:underline">Ver todas mis tareas<ArrowRight size={18} /></Link>}

      {recent.length > 0 && (
        <>
          <Title>Mis últimas notas</Title>
          <div className="grid gap-4 lg:grid-cols-2">{recent.map((t, i) => <BigTask key={t.id} t={t} today={today} index={i} />)}</div>
        </>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Link href="/estudiante/notas" className="group flex items-center gap-4 rounded-v-lg border border-v-border bg-v-elevated p-5 shadow-v transition-all hover:-translate-y-1 hover:shadow-v-lg">
          <span className="grid size-14 shrink-0 place-items-center rounded-3xl bg-v-accent-soft text-v-accent"><Star size={26} /></span>
          <span className="min-w-0 flex-1"><span className="block text-[18px] font-bold text-v-text">Mis notas</span><span className="block text-[14.5px] text-v-muted">Mira cómo te ha ido</span></span>
          <ArrowRight size={20} className="text-v-subtle group-hover:text-v-accent" />
        </Link>
        <Link href="/estudiante/bienestar" className="group flex items-center gap-4 rounded-v-lg border border-v-border bg-v-elevated p-5 shadow-v transition-all hover:-translate-y-1 hover:shadow-v-lg">
          <span className="grid size-14 shrink-0 place-items-center rounded-3xl bg-[#fce7f3] text-[#be185d]"><HeartHandshake size={26} /></span>
          <span className="min-w-0 flex-1"><span className="block text-[18px] font-bold text-v-text">Pedir ayuda</span><span className="block text-[14.5px] text-v-muted">Si algo te preocupa, cuéntanos</span></span>
          <ArrowRight size={20} className="text-v-subtle group-hover:text-v-accent" />
        </Link>
      </div>
    </div>
  )
}

export function SimpleTasks({ data, today }: { data: StudentAcademics; today: string }) {
  const todo = data.tasks.filter(TODO).sort((a, b) => a.dueAt.localeCompare(b.dueAt))
  const done = data.tasks.filter(t => !TODO(t)).sort((a, b) => b.dueAt.localeCompare(a.dueAt)).slice(0, 6)
  return (
    <div>
      <h1 className="v-display text-[2rem] font-bold tracking-tight text-v-text">Mis tareas</h1>
      <p className="mt-1 text-[16px] text-v-muted">Toca una tarea para ver qué hay que hacer.</p>

      <Title>Para entregar</Title>
      {todo.length === 0 ? (
        <div className="rounded-v-lg border border-v-border bg-v-elevated shadow-v"><EmptyState aria={2} title="¡Estás al día!" description="No tienes tareas ni pruebas por ahora." /></div>
      ) : <div className="grid gap-4 lg:grid-cols-2">{todo.map((t, i) => <BigTask key={t.id} t={t} today={today} index={i} />)}</div>}

      {done.length > 0 && (
        <>
          <Title>Ya las hice</Title>
          <div className="grid gap-4 lg:grid-cols-2">{done.map((t, i) => <BigTask key={t.id} t={t} today={today} index={i} />)}</div>
        </>
      )}
    </div>
  )
}

export function SimpleGrades({ data }: { data: StudentAcademics }) {
  const graded = data.tasks.filter(t => t.grade).sort((a, b) => b.grade!.gradedAt.localeCompare(a.grade!.gradedAt)).slice(0, 8)
  return (
    <div>
      <h1 className="v-display text-[2rem] font-bold tracking-tight text-v-text">Mis notas</h1>
      <p className="mt-1 text-[16px] text-v-muted">Las notas van del 1 al 7.</p>

      {graded.length === 0 ? (
        <div className="mt-6 rounded-v-lg border border-v-border bg-v-elevated shadow-v"><EmptyState aria={8} title="Todavía no tienes notas" description="Cuando tus profesores revisen tus trabajos, las verás aquí." /></div>
      ) : (
        <>
          <Title>Mis asignaturas</Title>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {data.subjects.map((s, i) => (
              <Reveal key={s.subjectId} index={Math.min(i, 6)} className="flex min-w-0 items-center gap-4 rounded-v-lg border border-v-border bg-v-elevated p-5 shadow-v">
                <span className="v-display grid size-16 shrink-0 place-items-center rounded-3xl text-[1.5rem] font-bold text-white shadow-v" style={{ background: subjectCover(s.subjectId) }}>{fmtScore(s.average)}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[18px] font-bold text-v-text">{s.subjectName}</p>
                  <p className="mb-2 text-[14px] text-v-muted">{s.count} {s.count === 1 ? 'nota' : 'notas'}</p>
                  <Bar value={(((s.average ?? 1) - 1) / 6) * 100} tone="brand" delay={0.2 + i * 0.05} />
                </div>
              </Reveal>
            ))}
          </div>

          <Title>Lo que me dijeron mis profesores</Title>
          <ul className="grid gap-4 lg:grid-cols-2">
            {graded.map(t => (
              <li key={t.id}>
                <Link href={`/estudiante/tareas/${t.id}`} className="group flex items-start gap-4 rounded-v-lg border border-v-border bg-v-elevated p-5 shadow-v transition-all hover:-translate-y-0.5 hover:shadow-v-lg">
                  <span className="v-display grid size-16 shrink-0 place-items-center rounded-3xl bg-v-accent-soft text-[1.5rem] font-bold text-v-accent">{fmtScore(t.grade!.score)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-semibold text-v-muted">{t.subjectName}</p>
                    <p className="text-[18px] font-bold leading-snug text-v-text group-hover:text-v-accent">{t.title}</p>
                    {t.grade!.feedback && <p className="mt-2 flex items-start gap-2 rounded-v-sm bg-v-fill/70 px-3.5 py-2.5 text-[15px] leading-relaxed text-v-text"><MessageSquareText size={17} className="mt-0.5 shrink-0 text-v-accent" />{t.grade!.feedback}</p>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
