import Link from 'next/link'
import { ArrowRight, CheckCircle2, HelpCircle, ListChecks, PlayCircle, Sparkles, Star, Target, Trash2, Trophy } from 'lucide-react'
import { requireSession } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { subjectCover } from '@/lib/subject-colors'
import { Card, EmptyState } from '@/components/ui/primitives'
import { Kpi, Reveal } from '@/components/ui/motion'
import { ConfirmAction } from '@/components/ui/dialog'
import { deletePersonalMission } from '@/lib/actions/review'
import { AriaComposer } from '@/components/review/aria-composer'
import { studentDisplay } from '@/lib/student-mode'

type Mission = { id: string; title: string; description: string; topic: string | null; subject_id: string; student_id: string | null; subjects: { name: string } | null }

export default async function ReviewHome({ searchParams }: { searchParams: Promise<{ asignatura?: string }> }) {
  const session = await requireSession('estudiante')
  const sp = await searchParams
  const db = await createClient()
  // RLS: solo las misiones publicadas del curso en que el estudiante está matriculado.
  const { data: rows } = await db.from('review_missions').select('id, title, description, topic, subject_id, student_id, subjects(name)')
    .eq('institution_id', session.institutionId).eq('status', 'published').order('created_at', { ascending: false })
  const missions = (rows ?? []) as unknown as Mission[]
  // Modo simple (los más chicos): letra grande, menos cosas por pantalla y sin números que no usan.
  const { simple, ariaReview } = await studentDisplay(db, session)
  // Asignaturas de su curso, para pedirle a ARIA un repaso propio.
  const { data: enrollment } = await db.from('course_enrollments').select('course_id').eq('institution_id', session.institutionId).eq('student_id', session.userId).eq('status', 'active').maybeSingle()
  const { data: plan } = enrollment ? await db.from('course_subjects').select('subject_id, subjects(name)').eq('course_id', enrollment.course_id) : { data: [] }
  const mySubjects = ((plan ?? []) as unknown as { subject_id: string; subjects: { name: string } | null }[])
    .map(p => ({ id: p.subject_id, name: p.subjects?.name ?? 'Asignatura', color: subjectCover(p.subject_id) })).sort((a, b) => a.name.localeCompare(b.name, 'es'))
  const ids = missions.map(m => m.id)
  const [{ data: items }, { data: progress }] = ids.length ? await Promise.all([
    db.from('review_items').select('id, mission_id, kind').in('mission_id', ids),
    db.from('review_progress').select('item_id, mission_id, done, first_try').eq('student_id', session.userId).in('mission_id', ids),
  ]) : [{ data: [] }, { data: [] }]

  const list = missions.map(m => {
    const own = (items ?? []).filter(i => i.mission_id === m.id)
    const done = (progress ?? []).filter(p => p.mission_id === m.id && p.done).length
    const questions = own.filter(i => i.kind === 'question').length
    return { ...m, total: own.length, done, videos: own.filter(i => i.kind === 'video').length, questions, personal: !!m.student_id,
      stars: (progress ?? []).filter(p => p.mission_id === m.id && p.first_try).length, complete: own.length > 0 && done >= own.length }
  }).filter(m => m.total > 0)
  const subjects = [...new Map(list.map(m => [m.subject_id, m.subjects?.name ?? 'Asignatura'])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'))
  const shown = list.filter(m => !sp.asignatura || m.subject_id === sp.asignatura).sort((a, b) => Number(a.complete) - Number(b.complete))
  // La última tarjeta se estira para cerrar la fila: no quedan huecos en la grilla.
  const two = simple || shown.length === 2 || shown.length === 4
  const lastSpan = [shown.length % 2 === 1 ? 'md:col-span-2' : '', two ? '' : ['xl:col-span-1', 'xl:col-span-3', 'xl:col-span-2'][shown.length % 3]].join(' ')
  const completed = list.filter(m => m.complete).length
  const stars = list.reduce((n, m) => n + m.stars, 0)

  return (
    <>
      <div className="v-brand relative mb-4 overflow-hidden rounded-v-lg p-6 shadow-v-brand sm:p-7">
        <span aria-hidden className="pointer-events-none absolute -right-10 -top-16 size-56 rounded-full bg-white/15" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {simple && <img src="/aria/pose-7.webp" alt="" className="v-float pointer-events-none absolute -bottom-2 right-5 hidden h-32 w-auto drop-shadow-[0_10px_18px_rgba(0,40,120,0.3)] sm:block" />}
        <p className="v-display relative text-[2rem] font-bold leading-tight tracking-tight">{simple ? 'Repasemos lo de clases' : 'Repaso de clases'}</p>
        <p className={`relative mt-1 max-w-xl ${simple ? 'text-[19px]' : 'text-[16px]'} text-white/95`}>{simple ? 'Juega misiones para practicar lo que viste en clases.' : 'Sesiones cortas de práctica con videos y preguntas sobre los contenidos de tus asignaturas. No llevan nota y puedes repetirlas.'}</p>
      </div>

      {ariaReview && mySubjects.length > 0 && <AriaComposer subjects={mySubjects} simple={simple} />}

      {list.length === 0 ? (
        <Card><EmptyState aria={7} title={simple ? 'Todavía no hay misiones' : 'Aún no hay repasos'} description={ariaReview && mySubjects.length ? (simple ? 'Crea tu primer repaso con ARIA o espera el que preparen tus profesores.' : 'Genera uno con ARIA o espera los que publiquen tus profesores.') : 'Cuando tus profesores preparen un repaso, aparecerá aquí.'} /></Card>
      ) : (
        <>
          {simple ? (
            <p className="mb-4 flex flex-wrap items-center gap-3 rounded-v-lg border border-v-border bg-v-elevated px-6 py-4 text-[19px] font-bold text-v-text shadow-v">
              <Star size={30} className="fill-[#f59e0b] text-[#f59e0b]" />
              {stars === 0 ? 'Gana estrellas respondiendo bien a la primera.' : `¡Tienes ${stars} ${stars === 1 ? 'estrella' : 'estrellas'}!`}
              {completed > 0 && <span className="inline-flex items-center gap-1.5 text-[16px] font-semibold text-[#157a4b]"><Trophy size={20} />{completed} {completed === 1 ? 'misión lista' : 'misiones listas'}</span>}
            </p>
          ) : (
          <div className="mb-4 grid grid-cols-3 gap-4">
            <Kpi index={0} label="Repasos pendientes" value={list.length - completed} hint={`de ${list.length}`} icon={<ListChecks size={18} />} tone="accent" />
            <Kpi index={1} label="Repasos completados" value={completed} hint={`de ${list.length}`} icon={<CheckCircle2 size={18} />} tone="success" />
            <Kpi index={2} label="Aciertos al primer intento" value={stars} hint={`de ${list.reduce((n, m) => n + m.questions, 0)} preguntas`} icon={<Target size={18} />} tone="accent" />
          </div>
          )}

          {!simple && subjects.length > 1 && (
            <nav aria-label="Asignatura" className="mb-4 flex flex-wrap gap-2">
              <Link href="/estudiante/repaso" scroll={false} className={`rounded-full border px-4 py-2 text-[13px] font-semibold ${!sp.asignatura ? 'border-v-accent/40 bg-v-accent-soft text-v-accent' : 'border-v-border bg-v-elevated text-v-muted hover:text-v-text'}`}>Todas</Link>
              {subjects.map(([id, name]) => (
                <Link key={id} href={`/estudiante/repaso?asignatura=${id}`} scroll={false} className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[13px] font-semibold ${sp.asignatura === id ? 'border-v-accent/40 bg-v-accent-soft text-v-accent' : 'border-v-border bg-v-elevated text-v-muted hover:text-v-text'}`}>
                  <span className="size-2.5 rounded-full" style={{ background: subjectCover(id) }} />{name}
                </Link>
              ))}
            </nav>
          )}

          {/* Con una o dos misiones las tarjetas ocupan todo el ancho: no queda media pantalla vacía. */}
          <div className={`grid gap-4 ${shown.length === 1 ? '' : two ? 'md:grid-cols-2' : 'md:grid-cols-2 xl:grid-cols-3'}`}>
            {shown.map((m, i) => (
              <Reveal key={m.id} index={Math.min(i, 8)} className={i === shown.length - 1 ? lastSpan : undefined}>
                <div className="group relative flex h-full flex-col overflow-hidden rounded-v-lg border border-v-border bg-v-elevated shadow-v transition-all duration-300 hover:-translate-y-1 hover:shadow-v-lg">
                  <div className={`relative overflow-hidden px-5 text-white ${simple ? 'py-6' : 'py-4'}`} style={{ background: subjectCover(m.subject_id) }}>
                    <span aria-hidden className="pointer-events-none absolute -right-8 -top-10 size-32 rounded-full bg-white/15" />
                    <p className={`relative flex flex-wrap items-center gap-x-2 gap-y-1 ${simple ? 'text-[14px]' : 'text-[12px]'} font-semibold uppercase tracking-[0.08em] text-white/85`}><span>{m.subjects?.name}{m.topic && !m.personal && !simple ? ` · ${m.topic}` : ''}</span>{m.personal && <span className="inline-flex items-center gap-1 rounded-full bg-white/25 px-2 py-0.5 normal-case tracking-normal text-white"><Sparkles size={11} />Creado con ARIA</span>}</p>
                    <p className={`v-display relative mt-0.5 ${simple ? 'text-[1.7rem]' : 'text-[1.25rem]'} font-bold leading-tight tracking-tight`}>{m.title}</p>
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    {!simple && <>
                    {m.description && <p className="line-clamp-2 text-[13.5px] leading-relaxed text-v-muted">{m.description}</p>}
                    <p className="mt-3 flex flex-wrap gap-2 text-[12.5px] font-semibold text-v-muted">
                      {m.videos > 0 && <span className="inline-flex items-center gap-1.5 rounded-full bg-v-fill px-2.5 py-1"><PlayCircle size={13} />{m.videos} {m.videos === 1 ? 'video' : 'videos'}</span>}
                      {m.questions > 0 && <span className="inline-flex items-center gap-1.5 rounded-full bg-v-fill px-2.5 py-1"><HelpCircle size={13} />{m.questions} {m.questions === 1 ? 'pregunta' : 'preguntas'}</span>}
                      {m.stars > 0 && <span className="inline-flex items-center gap-1.5 rounded-full bg-v-fill px-2.5 py-1"><Target size={13} />{m.stars} de {m.questions} al primer intento</span>}
                    </p>
                    <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-v-fill"><div className={`h-full rounded-full ${m.complete ? 'bg-v-success' : 'v-brand'}`} style={{ width: `${(m.done / m.total) * 100}%` }} /></div>
                    </>}
                    <div className={`mt-auto flex items-center justify-between gap-2 ${simple ? '' : 'pt-4'}`}>
                      <span className={`inline-flex items-center gap-1.5 ${simple ? 'text-[17px]' : 'text-[13px]'} font-semibold ${m.complete ? 'text-[#157a4b]' : 'text-v-muted'}`}>{m.complete ? <><CheckCircle2 size={simple ? 20 : 15} />{simple ? '¡Lista!' : 'Completado'}</> : simple ? (m.done ? 'Vas en camino' : 'Nueva') : `${m.done} de ${m.total} pasos`}{simple && m.stars > 0 && <span className="ml-1 inline-flex items-center gap-1 text-[#a16207]"><Star size={18} className="fill-current" />{m.stars}</span>}</span>
                      <span className="flex items-center gap-1.5">
                        {m.personal && <span className="relative z-[2]"><ConfirmAction action={deletePersonalMission.bind(null, m.id)} variant="ghost" size="sm" danger ariaLabel={`Borrar el repaso «${m.title}»`} title="Borrar repaso" confirmLabel="Borrar" message="Se borrará este repaso que creaste con ARIA, junto con tu avance."><Trash2 size={15} /></ConfirmAction></span>}
                        {/* El enlace cubre toda la tarjeta (after:inset-0); el botón de borrar queda por encima. */}
                        <Link href={`/estudiante/repaso/${m.id}`} className={`inline-flex items-center gap-1.5 rounded-full font-bold after:absolute after:inset-0 ${simple ? 'h-14 px-7 text-[18px]' : 'h-10 px-4 text-[13.5px]'} ${m.complete ? 'border border-v-border-strong text-v-text' : simple ? 'v-brand shadow-v-brand' : 'v-brand'}`}>{m.complete ? (simple ? 'Jugar otra vez' : 'Repetir') : m.done ? (simple ? 'Seguir' : 'Continuar') : simple ? 'Empezar' : 'Comenzar'}<ArrowRight size={simple ? 20 : 15} /></Link>
                      </span>
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </>
      )}
    </>
  )
}
