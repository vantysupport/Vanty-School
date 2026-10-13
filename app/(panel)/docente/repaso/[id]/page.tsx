import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Check, CheckCircle2, EyeOff, HelpCircle, PlayCircle, Plus, Send, Star, Trash2, Users } from 'lucide-react'
import { requireSession } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { nameMap } from '@/lib/data/people'
import { addQuestionItem, addVideoItem, deleteItem, deleteMission, setMissionStatus } from '@/lib/actions/review'
import { subjectCover } from '@/lib/subject-colors'
import { youtubeThumb } from '@/lib/youtube'
import { Avatar, Badge, Card, CardHeader, EmptyState, Field, Textarea } from '@/components/ui/primitives'
import { ConfirmAction, FormDialog } from '@/components/ui/dialog'
import { Reveal } from '@/components/ui/motion'
import { VideoPicker } from '@/components/review/video-picker'

export default async function MissionEditor({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession('docente')
  const { id } = await params
  const db = await createClient()
  // RLS: la misión solo existe para el docente que imparte ese curso y asignatura.
  const { data: m } = await db.from('review_missions').select('id, title, description, topic, status, course_id, subject_id, courses(name), subjects(name)').eq('id', id).eq('institution_id', session.institutionId).is('student_id', null).maybeSingle()
  if (!m) notFound()
  const meta = m as unknown as typeof m & { courses: { name: string }; subjects: { name: string } }
  const [{ data: items }, { data: keys }, { data: enrollments }, { data: progress }] = await Promise.all([
    db.from('review_items').select('id, kind, prompt, youtube_id, options').eq('mission_id', id).order('position').order('created_at'),
    db.from('review_item_keys').select('item_id, correct_index, explanation').eq('institution_id', session.institutionId),
    db.from('course_enrollments').select('student_id').eq('course_id', m.course_id).eq('status', 'active'),
    db.from('review_progress').select('item_id, student_id, done, first_try').eq('mission_id', id),
  ])
  const I = items ?? []
  const keyOf = new Map((keys ?? []).map(k => [k.item_id as string, k]))
  const names = await nameMap(db, (enrollments ?? []).map(e => e.student_id as string))
  const questions = I.filter(i => i.kind === 'question').length
  const students = (enrollments ?? []).map(e => {
    const own = (progress ?? []).filter(p => p.student_id === e.student_id)
    return { id: e.student_id as string, name: names.get(e.student_id as string) ?? 'Estudiante', done: own.filter(p => p.done).length, stars: own.filter(p => p.first_try).length }
  }).sort((a, b) => b.done - a.done || a.name.localeCompare(b.name, 'es'))
  const finished = students.filter(s => I.length > 0 && s.done >= I.length).length
  const published = m.status === 'published'
  const back = `/docente/cursos/${m.course_id}?tab=${m.subject_id}&vista=repaso`

  return (
    <>
      <Link href={back} className="mb-3 inline-flex items-center gap-1 text-[12.5px] font-medium text-v-muted hover:text-v-accent"><ArrowLeft size={14} />Repaso de {meta.courses.name}</Link>

      <Reveal className="relative mb-4 overflow-hidden rounded-v-lg text-white shadow-v">
        <div className="relative p-6 sm:p-7" style={{ background: published ? subjectCover(m.subject_id as string) : 'linear-gradient(135deg,#94a3b8,#475569)' }}>
          <span aria-hidden className="pointer-events-none absolute -right-12 -top-20 size-64 rounded-full bg-white/15" />
          <div className="relative flex flex-wrap items-end justify-between gap-5">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-[12px] font-semibold text-white/90">
                <span>Misión de repaso · {meta.courses.name} · {meta.subjects.name}</span>
                <span className="rounded-full bg-white/20 px-2.5 py-0.5">{published ? 'Publicada' : 'Borrador'}</span>
                {m.topic && <span className="rounded-full bg-white/20 px-2.5 py-0.5">{m.topic as string}</span>}
              </p>
              <h1 className="v-display mt-2 text-[1.8rem] font-bold leading-tight tracking-tight sm:text-[2.1rem]">{m.title as string}</h1>
              {m.description && <p className="mt-1.5 max-w-2xl text-[14px] text-white/90">{m.description as string}</p>}
            </div>
            <dl className="flex divide-x divide-white/25 text-center">
              {[['Pasos', I.length], ['La terminaron', `${finished}/${students.length}`]].map(([label, value]) => (
                <div key={label as string} className="px-5"><dd className="v-display text-4xl font-bold leading-none tabular-nums">{value}</dd><dt className="mt-1.5 text-[12px] text-white/85">{label}</dt></div>
              ))}
            </dl>
          </div>
        </div>
      </Reveal>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <FormDialog trigger={<><PlayCircle size={15} />Agregar video</>} title="Agregar un video" description="Los estudiantes lo ven dentro de la plataforma, sin salir a YouTube." action={addVideoItem.bind(null, id)} submitLabel="Agregar video" wide>
            <VideoPicker />
          </FormDialog>
          <FormDialog trigger={<><HelpCircle size={15} />Agregar pregunta</>} variant="secondary" title="Agregar una pregunta" description="De alternativas. El estudiante puede intentar hasta acertar." action={addQuestionItem.bind(null, id)} submitLabel="Agregar pregunta" wide>
            <Field label="Pregunta o problema"><Textarea name="prompt" required minLength={3} maxLength={500} rows={3} placeholder="Ej.: ¿Cuál de estas fracciones es equivalente a 1/2?" /></Field>
            <fieldset>
              <legend className="mb-1 text-[12.5px] font-medium text-v-text">Alternativas <span className="font-normal text-v-subtle">· marca la correcta</span></legend>
              <div className="space-y-2">
                {[0, 1, 2, 3].map(n => (
                  <label key={n} className="flex items-center gap-2.5">
                    <input type="radio" name="correct" value={n} required defaultChecked={n === 0} className="size-4 shrink-0 accent-[var(--v-accent)]" aria-label={`La alternativa ${String.fromCharCode(65 + n)} es la correcta`} />
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-v-fill text-[12px] font-bold text-v-muted">{String.fromCharCode(65 + n)}</span>
                    <input name="option[]" maxLength={200} required={n < 2} placeholder={n < 2 ? 'Alternativa' : 'Alternativa (opcional)'} className="v-input flex-1" />
                  </label>
                ))}
              </div>
            </fieldset>
            <Field label="Explicación" hint="Opcional. El estudiante la ve cuando acierta."><Textarea name="explanation" rows={2} maxLength={600} placeholder="Ej.: 2/4 y 1/2 representan la misma cantidad." /></Field>
          </FormDialog>
        </div>
        <div className="flex flex-wrap gap-2">
          {published
            ? <ConfirmAction action={setMissionStatus.bind(null, id, 'draft')} variant="secondary" size="md" title="Volver a borrador" confirmLabel="Volver a borrador" message="Los estudiantes dejarán de ver esta misión. Su avance se conserva."><EyeOff size={14} />Ocultar</ConfirmAction>
            : <ConfirmAction action={setMissionStatus.bind(null, id, 'published')} variant="primary" size="md" title="Publicar misión" confirmLabel="Publicar" message={`La verán los estudiantes de ${meta.courses.name} en «Repasemos».`}><Send size={14} />Publicar</ConfirmAction>}
          <ConfirmAction action={deleteMission.bind(null, id)} redirectTo={back} variant="danger" size="md" danger title="Eliminar misión" confirmLabel="Eliminar" message="Se eliminará la misión con sus pasos y el avance de los estudiantes. No se puede deshacer."><Trash2 size={14} />Eliminar</ConfirmAction>
        </div>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Card index={2}>
          <CardHeader icon={<Plus size={15} />} title="Pasos de la misión" description="En el orden en que los verá el estudiante" />
          {I.length === 0 ? <EmptyState aria={7} title="La misión aún no tiene pasos" description="Agrega un video para explicar y una o más preguntas para practicar." /> : (
            <ol className="divide-y divide-v-border">
              {I.map((it, n) => {
                const key = keyOf.get(it.id as string)
                return (
                  <li key={it.id as string} className="flex items-start gap-4 px-5 py-4">
                    <span className="v-brand mt-0.5 grid size-8 shrink-0 place-items-center rounded-full text-[13px] font-bold">{n + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.07em] text-v-subtle">{it.kind === 'video' ? <><PlayCircle size={13} />Video</> : <><HelpCircle size={13} />Pregunta</>}</p>
                      <p className="mt-0.5 text-[15px] font-semibold text-v-text">{it.prompt as string}</p>
                      {it.kind === 'video' ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <a href={`https://youtu.be/${it.youtube_id}`} target="_blank" rel="noreferrer" className="mt-2 inline-block"><img src={youtubeThumb(it.youtube_id as string)} alt="Miniatura del video" className="h-24 w-40 rounded-md object-cover shadow-v-xs" /></a>
                      ) : (
                        <>
                          <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
                            {((it.options as string[] | null) ?? []).map((o, k) => (
                              <li key={k} className={`flex items-center gap-2 rounded-v-sm border px-3 py-1.5 text-[13.5px] ${key?.correct_index === k ? 'border-v-success/50 bg-v-success/10 font-semibold text-[#157a4b]' : 'border-v-border text-v-muted'}`}>
                                <span className="text-[11.5px] font-bold">{String.fromCharCode(65 + k)}</span><span className="min-w-0 flex-1">{o}</span>{key?.correct_index === k && <Check size={14} />}
                              </li>
                            ))}
                          </ul>
                          {key?.explanation && <p className="mt-2 text-[12.5px] text-v-muted"><span className="font-semibold text-v-text">Explicación:</span> {key.explanation as string}</p>}
                        </>
                      )}
                    </div>
                    <ConfirmAction action={deleteItem.bind(null, it.id as string)} variant="ghost" size="sm" danger ariaLabel="Eliminar paso" title="Eliminar paso" confirmLabel="Eliminar" message="Se quitará este paso de la misión, junto con el avance de los estudiantes en él."><Trash2 size={14} /></ConfirmAction>
                  </li>
                )
              })}
            </ol>
          )}
        </Card>

        <Card index={3}>
          <CardHeader icon={<Users size={15} />} title="Avance del curso" description={published ? `${finished} de ${students.length} la terminaron` : 'Se verá cuando publiques la misión'} />
          {students.length === 0 ? <EmptyState title="El curso no tiene estudiantes matriculados" /> : (
            <ul className="divide-y divide-v-border">
              {students.map(s => {
                const complete = I.length > 0 && s.done >= I.length
                return (
                  <li key={s.id} className="flex items-center gap-3 px-5 py-3">
                    <Avatar name={s.name} id={s.id} size={34} />
                    <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-v-text">{s.name}</span>
                    {questions > 0 && s.stars > 0 && <span className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-[#a16207]"><Star size={13} className="fill-current" />{s.stars}/{questions}</span>}
                    {complete ? <Badge tone="success"><CheckCircle2 size={12} />Terminada</Badge> : <Badge tone={s.done ? 'accent' : 'neutral'}>{s.done ? `${s.done} de ${I.length}` : 'Sin empezar'}</Badge>}
                  </li>
                )
              })}
            </ul>
          )}
          <p className="border-t border-v-border px-5 py-3 text-xs leading-relaxed text-v-subtle">La estrella indica las preguntas respondidas bien al primer intento. El repaso es práctica: no pone nota ni entra al promedio.</p>
        </Card>
      </div>
    </>
  )
}
