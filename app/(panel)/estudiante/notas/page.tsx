import Link from 'next/link'
import { ArrowRight, Award, MessageSquareText, Star, Target, TrendingUp } from 'lucide-react'
import { requireSession } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { loadStudentAcademics } from '@/lib/data/student'
import { fmtWeight, KIND_LABEL } from '@/lib/assessments'
import { subjectCover } from '@/lib/subject-colors'
import { fmtDate, fmtScore, scoreTone } from '@/lib/format'
import { Card, CardHeader, EmptyState, PageHeader } from '@/components/ui/primitives'
import { Bar, Kpi, Reveal } from '@/components/ui/motion'
import { Pagination } from '@/components/ui/filters'
import { usesSimpleMode } from '@/lib/student-mode'
import { SimpleGrades } from '@/components/student/simple'

const SCORE_TEXT: Record<string, string> = { success: 'text-v-success', warning: 'text-[#a16207]', danger: 'text-v-danger', neutral: 'text-v-text' }
const PAGE_SIZE = 5   // notas por página: la lista no debe alargar la pantalla sin fin
const BAR_TONE = { success: 'success', warning: 'warning', danger: 'danger', neutral: 'neutral' } as const

export default async function StudentGrades({ searchParams }: { searchParams: Promise<{ asignatura?: string; p?: string }> }) {
  const session = await requireSession('estudiante')
  const sp = await searchParams
  const db = await createClient()
  const data = await loadStudentAcademics(db, session.institutionId, session.userId)
  if (await usesSimpleMode(db, session)) return <SimpleGrades data={data} />
  const graded = data.tasks.filter(t => t.grade).sort((a, b) => b.grade!.gradedAt.localeCompare(a.grade!.gradedAt))
  const subjects = data.subjects.map(s => ({ ...s, notes: graded.filter(t => t.subjectId === s.subjectId) }))
  const ranked = subjects.filter(s => s.average != null).sort((a, b) => b.average! - a.average!)
  const best = ranked[0], weakest = ranked.length > 1 ? ranked[ranked.length - 1] : null
  const below = subjects.filter(s => s.average != null && s.average < 4)
  const selected = subjects.find(s => s.subjectId === sp.asignatura)
  const shown = selected ? selected.notes : graded
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE))
  const page = Math.min(pages, Math.max(1, Number(sp.p) || 1))
  const visible = shown.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const weighted = graded.some(t => t.weight != null)

  return (
    <>
      <PageHeader title="Mis notas" description="Tu promedio en cada asignatura, cada nota y lo que te dijeron tus profesores." />

      {graded.length === 0 ? (
        <Card><EmptyState aria={8} title="Aún no tienes notas" description="Aparecerán aquí cuando tus profesores califiquen tus tareas y pruebas." /></Card>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-4 xl:grid-cols-4">
            <Kpi index={0} label="Mi promedio general" icon={<TrendingUp size={18} />} tone={scoreTone(data.overall) === 'danger' ? 'danger' : 'accent'} value={fmtScore(data.overall)} hint="De 1,0 a 7,0 · se aprueba con 4,0" />
            <Kpi index={1} label="Donde mejor me va" icon={<Award size={18} />} tone="success" value={best ? fmtScore(best.average) : '—'} hint={best?.subjectName ?? 'Sin notas'} href={best ? `/estudiante/notas?asignatura=${best.subjectId}` : undefined} />
            <Kpi index={2} label={below.length ? 'Bajo 4,0' : 'Para reforzar'} icon={<Target size={18} />} tone={below.length ? 'danger' : 'warning'} urgent={below.length > 0}
              value={weakest ? fmtScore(weakest.average) : '—'} hint={below.length ? below.map(s => s.subjectName).join(' · ') : weakest?.subjectName ?? 'Todo parejo'} href={weakest ? `/estudiante/notas?asignatura=${weakest.subjectId}` : undefined} />
            <Kpi index={3} label="Notas registradas" icon={<Star size={18} />} value={graded.length} hint={`en ${subjects.length} ${subjects.length === 1 ? 'asignatura' : 'asignaturas'}`} />
          </div>

          {/* Una tarjeta por asignatura: se toca para ver solo sus notas */}
          <div className={`mb-4 grid gap-4 sm:grid-cols-2 ${subjects.length > 2 ? 'xl:grid-cols-4' : ''}`}>
            {subjects.map((s, i) => {
              const tone = scoreTone(s.average)
              const on = selected?.subjectId === s.subjectId
              return (
                <Reveal key={s.subjectId} index={Math.min(i, 8)}>
                  <Link href={on ? '/estudiante/notas' : `/estudiante/notas?asignatura=${s.subjectId}`} scroll={false} aria-pressed={on}
                    className={`group flex h-full flex-col overflow-hidden rounded-v-lg border bg-v-elevated transition-all duration-300 hover:-translate-y-1 hover:shadow-v-lg ${on ? 'border-v-accent/60 shadow-v ring-4 ring-v-accent-soft' : 'border-v-border shadow-v'}`}>
                    <div className="relative overflow-hidden px-5 py-3.5 text-white" style={{ background: subjectCover(s.subjectId) }}>
                      <span aria-hidden className="pointer-events-none absolute -right-8 -top-10 size-28 rounded-full bg-white/15" />
                      <p className="relative truncate text-[14px] font-semibold tracking-tight">{s.subjectName}</p>
                    </div>
                    <div className="flex flex-1 flex-col p-5">
                      <div className="flex items-end justify-between gap-3">
                        <p className={`v-display text-[2.4rem] font-bold leading-none ${SCORE_TEXT[tone]}`}>{fmtScore(s.average)}</p>
                        <p className="text-right text-xs text-v-muted">{s.count} {s.count === 1 ? 'nota' : 'notas'}<br />{s.average != null && s.average < 4 ? <span className="font-semibold text-v-danger">bajo 4,0</span> : 'promedio'}</p>
                      </div>
                      <div className="mt-3"><Bar value={(((s.average ?? 1) - 1) / 6) * 100} tone={BAR_TONE[tone]} delay={0.2 + i * 0.05} /></div>
                      <p className="mt-3 flex flex-wrap gap-1.5">
                        {s.notes.slice(0, 5).reverse().map(t => <span key={t.id} title={t.title} className={`rounded-full bg-v-fill px-2 py-0.5 text-[11.5px] font-semibold tabular-nums ${SCORE_TEXT[scoreTone(t.grade!.score)]}`}>{fmtScore(t.grade!.score)}</span>)}
                      </p>
                      <p className="mt-auto pt-3 text-[12.5px] font-semibold text-v-accent">{on ? 'Quitar filtro' : 'Ver sus notas'} →</p>
                    </div>
                  </Link>
                </Reveal>
              )
            })}
          </div>

          <Card index={2}>
            <CardHeader icon={<Star size={15} />} title={selected ? `Notas de ${selected.subjectName}` : 'Todas mis notas'} description={`${shown.length} ${shown.length === 1 ? 'nota' : 'notas'} · la más reciente arriba`}
              actions={selected && <Link href="/estudiante/notas" scroll={false} className="text-[12.5px] font-semibold text-v-accent hover:underline">Ver todas las asignaturas</Link>} />
            <ul className="divide-y divide-v-border">
              {visible.map(t => (
                <li key={t.id}>
                  <Link href={`/estudiante/tareas/${t.id}`} className="group flex flex-wrap items-start gap-x-4 gap-y-3 px-5 py-4 hover:bg-v-fill/50">
                    <span className={`v-display grid size-14 shrink-0 place-items-center rounded-2xl bg-v-fill text-[1.25rem] font-bold ${SCORE_TEXT[scoreTone(t.grade!.score)]}`}>{fmtScore(t.grade!.score)}</span>
                    <div className="min-w-0 flex-1 basis-64">
                      <p className="text-[15px] font-semibold tracking-tight text-v-text group-hover:text-v-accent">{t.title}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-v-muted">
                        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: subjectCover(t.subjectId) }} />{t.subjectName}</span>
                        <span>· {t.kind !== 'tarea' ? KIND_LABEL[t.kind] : 'Tarea'}</span>
                        {t.weight != null && <span className="rounded-full bg-v-accent-soft px-2 py-px text-[11px] font-semibold text-v-accent">vale {fmtWeight(t.weight)}</span>}
                        <span>· {fmtDate(t.grade!.gradedAt)}</span>
                      </p>
                      {t.grade!.feedback && (
                        <p className="mt-2.5 flex items-start gap-2 rounded-v-sm border-l-[3px] border-v-accent bg-v-accent-soft/60 px-3.5 py-2 text-[13.5px] leading-relaxed text-v-text">
                          <MessageSquareText size={15} className="mt-0.5 shrink-0 text-v-accent" />{t.grade!.feedback}
                        </p>
                      )}
                    </div>
                    <ArrowRight size={16} className="mt-4 shrink-0 text-v-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-v-accent" />
                  </Link>
                </li>
              ))}
            </ul>
            {pages > 1 && <div className="border-t border-v-border"><Pagination page={page} pageSize={PAGE_SIZE} total={shown.length} /></div>}
            <p className="border-t border-v-border px-5 py-3 text-xs text-v-subtle">Escala de 1,0 a 7,0; se aprueba con 4,0.{weighted ? ' Algunas notas valen un porcentaje fijo de tu promedio: por eso el promedio de la asignatura puede no ser el promedio simple de sus notas.' : ''}</p>
          </Card>
        </>
      )}
    </>
  )
}
