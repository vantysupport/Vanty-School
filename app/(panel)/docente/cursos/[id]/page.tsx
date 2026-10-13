import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ArrowRight, Award, CalendarClock, ClipboardList, FileCheck2, HeartHandshake, HelpCircle, NotebookPen, Paperclip, PlayCircle, Plus, Rocket, Sparkles, Table2, Trash2, Users } from 'lucide-react'
import { requireSession } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { teachingOf } from '@/lib/data/teaching'
import { nameMap } from '@/lib/data/people'
import { assignmentStats, loadSnapshot } from '@/lib/data/academic'
import { createWellbeingRequest } from '@/lib/actions/support'
import { addIncident } from '@/lib/actions/people'
import { createAssignment } from '@/lib/actions/teaching'
import { createMission, deleteMission } from '@/lib/actions/review'
import { subjectCover } from '@/lib/subject-colors'
import { AssignmentFields } from '@/components/teaching/assignment-fields'
import { fmtWeight, isEvaluation, KIND_LABEL, weightedAverage } from '@/lib/assessments'
import { attendanceRate, average, fmtDate, fmtDateShort, fmtDateTime, fmtPct, fmtScore, scoreTone, toLocalInput, todayISO } from '@/lib/format'
import { Avatar, Badge, Card, CardHeader, EmptyState, Field, Input, LinkButton, Notice, Select, Textarea } from '@/components/ui/primitives'
import { ConfirmAction, FormDialog } from '@/components/ui/dialog'
import { SearchBox } from '@/components/ui/filters'
import { Reveal } from '@/components/ui/motion'

type Search = { tab?: string; vista?: string; q?: string; estado?: string }
const CATEGORIES = { academico: 'Académico', convivencia: 'Convivencia escolar', emocional: 'Bienestar emocional', familiar: 'Situación familiar', otro: 'Otro' }
const COVER: Record<string, string> = { parvularia: 'linear-gradient(135deg,#f59e0b,#f97316)', basica: 'linear-gradient(135deg,#01abfc,#0063d8)', media: 'linear-gradient(135deg,#6366f1,#7c3aed)' }
const MAX_COLUMNS = 8   // el libro de notas muestra las evaluaciones más recientes

export default async function TeacherCourse({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Search> }) {
  const session = await requireSession('docente')
  const { id } = await params
  const sp = await searchParams
  const db = await createClient()
  const teaching = (await teachingOf(db, session)).filter(t => t.courseId === id)
  if (teaching.length === 0) notFound()

  const subject = teaching.find(t => t.subjectId === sp.tab) ?? teaching[0]
  const [snap, { data: course }, { data: own }] = await Promise.all([
    loadSnapshot(db, session.institutionId, { courseId: id }),
    db.from('courses').select('section, grade_levels(stage)').eq('id', id).maybeSingle(),
    db.from('assignments').select('id, title, topic, due_at, status, kind, weight, attachment_path').eq('institution_id', session.institutionId).eq('teacher_id', session.userId).eq('course_id', id).eq('subject_id', subject.subjectId),
  ])
  const stage = (course as unknown as { grade_levels?: { stage: string } } | null)?.grade_levels?.stage ?? 'basica'
  const names = await nameMap(db, snap.enrollments.map(e => e.student_id))
  const assignments = assignmentStats(snap, id, subject.subjectId).sort((a, b) => a.dueAt.localeCompare(b.dueAt))
  const due = assignments.filter(a => a.isDue)
  const subjectGrades = snap.grades.filter(g => g.subject_id === subject.subjectId)
  const weightOf = new Map(assignments.map(a => [a.id, a.weight]))
  const totalWeight = assignments.reduce((n, a) => n + (a.weight ?? 0), 0)

  const students = snap.enrollments.map(e => {
    const own = subjectGrades.filter(g => g.student_id === e.student_id)
    const avg = weightedAverage(own.map(g => ({ score: g.score, weight: g.assignment_id ? weightOf.get(g.assignment_id) : null })), totalWeight)
    const missing = due.filter(a => !snap.submissions.some(s => s.assignment_id === a.id && s.student_id === e.student_id)).length
    const alert = avg != null && avg < 4 ? 'Promedio bajo 4,0' : missing >= 3 ? `${missing} entregas pendientes` : null
    return { id: e.student_id, name: names.get(e.student_id) ?? 'Estudiante', average: avg, missing, alert, outstanding: avg != null && avg >= 6 && missing === 0,
      scores: new Map(own.map(g => [g.assignment_id as string, g.score])) }
  }).sort((a, b) => a.name.localeCompare(b.name, 'es'))
  const q = (sp.q ?? '').trim().toLowerCase()
  const shown = students.filter(s => !q || s.name.toLowerCase().includes(q))
  const scores = subjectGrades.map(g => g.score)
  // Con ponderaciones, el promedio del curso es el de los promedios de sus estudiantes.
  const courseAvg = totalWeight ? average(students.map(s => s.average).filter((v): v is number => v != null)) : average(scores)
  const pending = assignments.reduce((n, a) => n + a.pendingReview, 0)
  const view = sp.vista === 'libro' || sp.vista === 'estudiantes' || sp.vista === 'repaso' ? sp.vista : 'tareas'

  // Misiones de repaso de esta asignatura, con sus pasos y cuántos estudiantes las terminaron.
  const { data: missionRows } = await db.from('review_missions').select('id, title, description, topic, status').eq('course_id', id).eq('subject_id', subject.subjectId).is('student_id', null).order('created_at', { ascending: false })
  // Repasos que los estudiantes crearon por su cuenta con ARIA: el docente los ve para saber qué les cuesta y puede eliminarlos.
  const { data: personalRows } = await db.from('review_missions').select('id, title, topic, student_id, created_at').eq('course_id', id).eq('subject_id', subject.subjectId).not('student_id', 'is', null).order('created_at', { ascending: false }).limit(30)
  const personalIds = (personalRows ?? []).map(m => m.id as string)
  const [{ data: personalItems }, { data: personalKeys }] = personalIds.length ? await Promise.all([
    db.from('review_items').select('id, mission_id, kind, prompt, options, body, youtube_id').in('mission_id', personalIds).order('position'),
    db.from('review_item_keys').select('item_id, correct_index').eq('institution_id', session.institutionId),
  ]) : [{ data: [] }, { data: [] }]
  const personalKey = new Map((personalKeys ?? []).map(k => [k.item_id as string, k.correct_index as number]))
  const missionIds = (missionRows ?? []).map(m => m.id as string)
  const [{ data: missionItems }, { data: missionProgress }] = missionIds.length ? await Promise.all([
    db.from('review_items').select('id, mission_id, kind').in('mission_id', missionIds),
    db.from('review_progress').select('mission_id, student_id, done').in('mission_id', missionIds).eq('done', true),
  ]) : [{ data: [] }, { data: [] }]
  const missions = (missionRows ?? []).map(m => {
    const own = (missionItems ?? []).filter(i => i.mission_id === m.id)
    const byStudent = new Map<string, number>()
    for (const p of (missionProgress ?? []).filter(p => p.mission_id === m.id)) byStudent.set(p.student_id as string, (byStudent.get(p.student_id as string) ?? 0) + 1)
    return { id: m.id as string, title: m.title as string, description: m.description as string, topic: m.topic as string | null, published: m.status === 'published',
      videos: own.filter(i => i.kind === 'video').length, questions: own.filter(i => i.kind === 'question').length,
      finished: own.length ? [...byStudent.values()].filter(n => n >= own.length).length : 0 }
  })

  // Tareas de la asignatura, incluidos los borradores (que solo ve quien los creó).
  const now = Date.now()
  const byId = new Map(assignments.map(a => [a.id, a]))
  const tasks = (own ?? []).map(a => {
    const st = byId.get(a.id as string)
    const open = a.status === 'published' && new Date(a.due_at as string).getTime() > now
    return { weight: a.weight as number | null, kind: a.kind as string, evaluation: isEvaluation(a.kind as string), id: a.id as string, title: a.title as string, topic: a.topic as string | null, dueAt: a.due_at as string, status: a.status as string, attachment: !!a.attachment_path, open,
      state: a.status === 'draft' ? 'borradores' : (st?.pendingReview ?? 0) > 0 ? 'porcorregir' : open ? 'vigentes' : 'finalizadas',
      enrolled: st?.enrolled ?? 0, submitted: st?.submitted ?? 0, graded: st?.graded ?? 0, pending: st?.pendingReview ?? 0, average: st?.average ?? null }
  }).sort((a, b) => b.dueAt.localeCompare(a.dueAt))
  const state = sp.estado ?? 'todas'
  const shownTasks = tasks.filter(a => state === 'todas' || a.state === state)
  const countOf = (v: string) => tasks.filter(a => a.state === v).length
  const states = [['todas', 'Todas', tasks.length], ['porcorregir', 'Por corregir', countOf('porcorregir')], ['vigentes', 'Vigentes', countOf('vigentes')], ['borradores', 'Borradores', countOf('borradores')], ['finalizadas', 'Finalizadas', countOf('finalizadas')]] as const
  const defaultDue = toLocalInput(new Date(now + 7 * 86_400_000)).slice(0, 11) + '23:59'
  const columns = assignments.slice(-MAX_COLUMNS)
  const href = (patch: Partial<Search>) => {
    const next = new URLSearchParams()
    for (const [k, v] of Object.entries({ tab: subject.subjectId, vista: sp.vista, estado: sp.estado, ...patch })) if (v) next.set(k, v)
    return `/docente/cursos/${id}?${next.toString()}`
  }
  const studentSelect = (
    <Field label="Estudiante">
      <Select name="student_id" required defaultValue=""><option value="" disabled>Selecciona…</option>{students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
    </Field>
  )
  const views = [
    { id: 'tareas', label: 'Tareas y evaluaciones', icon: <ClipboardList size={15} />, count: tasks.length },
    { id: 'estudiantes', label: 'Estudiantes', icon: <Users size={15} />, count: students.length },
    { id: 'libro', label: 'Libro de notas', icon: <Table2 size={15} /> },
    { id: 'repaso', label: 'Repaso', icon: <Rocket size={15} />, count: missions.length },
  ]

  return (
    <>
      <Link href="/docente/cursos" className="mb-3 inline-flex items-center gap-1 text-[12.5px] font-medium text-v-muted hover:text-v-accent"><ArrowLeft size={14} />Mis cursos</Link>

      {/* Portada del curso */}
      <Reveal className="relative mb-4 overflow-hidden rounded-v-lg text-white shadow-v">
        <div className="relative p-6 sm:p-7" style={{ background: COVER[stage] ?? COVER.basica }}>
          <span aria-hidden className="pointer-events-none absolute -right-12 -top-20 size-64 rounded-full bg-white/15" />
          <span aria-hidden className="v-display pointer-events-none absolute -bottom-10 right-6 text-[10rem] font-extrabold leading-none text-white/15">{(course?.section as string | undefined) ?? ''}</span>
          <div className="relative flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <h1 className="v-display text-[2rem] font-bold leading-tight tracking-tight sm:text-[2.3rem]">{teaching[0].courseName}</h1>
              <p className="mt-1 text-[14px] text-white/85">{students.length} estudiantes · asistencia {fmtPct(attendanceRate(snap.attendance))}</p>
              <nav aria-label="Asignatura" className="mt-4 flex flex-wrap gap-2">
                {teaching.map(t => (
                  <Link key={t.subjectId} href={`/docente/cursos/${id}?tab=${t.subjectId}${sp.vista ? `&vista=${sp.vista}` : ''}`} scroll={false}
                    className={`rounded-full px-4 py-1.5 text-[13px] font-semibold ${t.subjectId === subject.subjectId ? 'bg-white text-[#0b3b8f] shadow-v' : 'bg-white/15 text-white hover:bg-white/25'}`}>{t.subjectName}</Link>
                ))}
              </nav>
            </div>
            <dl className="flex gap-6 text-right">
              <div><dt className="text-[11px] font-medium text-white/80">Promedio</dt><dd className="v-display text-3xl font-bold leading-none tabular-nums">{fmtScore(courseAvg)}</dd></div>
              <div><dt className="text-[11px] font-medium text-white/80">Por corregir</dt><dd className="v-display text-3xl font-bold leading-none tabular-nums">{pending}</dd></div>
            </dl>
          </div>
        </div>
      </Reveal>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Vistas del curso" className="flex max-w-full gap-1 overflow-x-auto rounded-full border border-v-border bg-v-elevated p-1 shadow-v-xs">
          {views.map(v => (
            <Link key={v.id} href={href({ vista: v.id === 'tareas' ? undefined : v.id, estado: undefined })} scroll={false}
              className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-[13px] font-semibold ${view === v.id ? 'v-brand shadow-v-brand' : 'text-v-muted hover:bg-v-fill hover:text-v-text'}`}>
              {v.icon}{v.label}{v.count != null && <span className={`rounded-full px-1.5 text-[11px] ${view === v.id ? 'bg-white/25' : 'bg-v-fill text-v-subtle'}`}>{v.count}</span>}
            </Link>
          ))}
        </nav>
        <div className="flex flex-wrap gap-2">
          <LinkButton href={`/docente/aria?s=${id}:${subject.subjectId}`}><Sparkles size={14} />ARIA</LinkButton>
          <FormDialog trigger={<><NotebookPen size={14} />Incidencia</>} variant="secondary" title="Registrar incidencia" description="Queda en la hoja de vida del estudiante. La ven secretaría, dirección y sus docentes." action={async form => { 'use server'; return addIncident(String(form.get('student_id') ?? ''), form) }} submitLabel="Registrar">
            {studentSelect}
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Tipo"><Select name="kind" defaultValue="informativa"><option value="positiva">Positiva</option><option value="negativa">Negativa</option><option value="informativa">Informativa</option></Select></Field>
              <Field label="Ámbito"><Select name="category" defaultValue="conducta"><option value="conducta">Conducta</option><option value="responsabilidad">Responsabilidad</option><option value="convivencia">Convivencia</option><option value="academico">Académico</option><option value="otro">Otro</option></Select></Field>
              <Field label="Fecha"><Input name="occurred_on" type="date" required defaultValue={todayISO()} max={todayISO()} /></Field>
            </div>
            <Field label="Qué ocurrió" hint="Describe hechos observables. No incluyas diagnósticos ni información de salud."><Textarea name="description" required minLength={3} maxLength={2000} rows={4} /></Field>
          </FormDialog>
          <FormDialog trigger={<><HeartHandshake size={14} />Bienestar</>} variant="secondary" title="Derivar a bienestar escolar" action={createWellbeingRequest} submitLabel="Enviar derivación"
            description="Tu observación llega solo al equipo de bienestar. No la ven otros docentes, la dirección ni la secretaría.">
            <input type="hidden" name="source" value="docente" />
            {studentSelect}
            <Field label="Ámbito"><Select name="category" defaultValue="academico">{Object.entries(CATEGORIES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
            <Field label="Observación pedagógica" hint="Describe lo que has observado en clases, sin interpretaciones ni diagnósticos."><Textarea name="description" required minLength={5} maxLength={4000} rows={5} /></Field>
            <Notice tone="warning">Si la situación es urgente o hay riesgo para alguien, no uses este formulario: activa de inmediato el protocolo del colegio.</Notice>
          </FormDialog>
        </div>
      </div>

      {/* ── Estudiantes ── */}
      {view === 'estudiantes' && (
        <Card index={2}>
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <p className="text-[15px] font-semibold tracking-tight">Estudiantes <span className="font-normal text-v-subtle">· {subject.subjectName}</span></p>
            <SearchBox placeholder="Buscar estudiante" />
          </div>
          {students.length === 0 ? <EmptyState aria={4} title="Este curso aún no tiene estudiantes matriculados" /> : shown.length === 0 ? <EmptyState title="Ningún estudiante coincide" /> : (
            <ul className="grid border-t border-v-border sm:grid-cols-2 2xl:grid-cols-3">
              {shown.map(s => (
                <li key={s.id} className="flex items-center gap-3 border-b border-r border-v-border px-5 py-3.5">
                  <Avatar name={s.name} size={40} id={s.id} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-semibold">{s.name}</p>
                    <p className="mt-0.5 text-xs">
                      {s.alert ? <span className="font-semibold text-[#a16207]">{s.alert}</span>
                        : s.outstanding ? <span className="inline-flex items-center gap-1 font-semibold text-[#157a4b]"><Award size={11} />Destacado</span>
                        : <span className="text-v-subtle">{s.missing ? `${s.missing} ${s.missing === 1 ? 'entrega pendiente' : 'entregas pendientes'}` : 'Al día'}</span>}
                    </p>
                  </div>
                  <span className="text-right"><span className={`v-display block text-xl font-bold leading-none tabular-nums ${s.average != null && s.average < 4 ? 'text-v-danger' : ''}`}>{fmtScore(s.average)}</span><span className="text-[10px] text-v-subtle">promedio</span></span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {/* ── Libro de notas ── */}
      {view === 'libro' && (
        <Card index={2}>
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <p className="text-[15px] font-semibold tracking-tight">Libro de notas <span className="font-normal text-v-subtle">· {subject.subjectName}</span></p>
            <SearchBox placeholder="Buscar estudiante" />
          </div>
          {assignments.length === 0 ? <EmptyState aria={8} title="Aún no hay tareas en esta asignatura" action={<LinkButton href={href({ vista: undefined })} variant="primary">Ir a tareas</LinkButton>} /> : (
            <div className="overflow-x-auto border-t border-v-border">
              <table className="w-full min-w-[640px] border-collapse text-left text-[13.5px] tabular-nums">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 border-b border-v-border bg-v-elevated px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-v-subtle">Estudiante</th>
                    {columns.map(a => (
                      <th key={a.id} className="border-b border-v-border bg-v-fill/60 px-3 py-2 text-center align-bottom">
                        <Link href={`/docente/tareas/${a.id}`} title={`${a.title} · ${fmtDate(a.dueAt)}`} className="block hover:text-v-accent">
                          <span className="mx-auto block max-w-[120px] truncate text-[11.5px] font-semibold text-v-text">{a.title}</span>
                          <span className="block text-[10.5px] font-normal text-v-subtle">{fmtDateShort(a.dueAt)}{a.weight != null && <span className="ml-1 font-semibold text-v-accent">· {fmtWeight(a.weight)}</span>}</span>
                        </Link>
                      </th>
                    ))}
                    <th className="border-b border-v-border bg-v-fill/60 px-4 py-2.5 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-v-subtle">Promedio</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map(s => (
                    <tr key={s.id} className="hover:bg-v-fill/50">
                      <td className="sticky left-0 z-10 border-b border-v-border bg-v-elevated px-5 py-2.5"><span className="flex items-center gap-2.5"><Avatar name={s.name} size={26} id={s.id} /><span className="whitespace-nowrap font-semibold">{s.name}</span></span></td>
                      {columns.map(a => {
                        const v = s.scores.get(a.id)
                        const handed = snap.submissions.some(x => x.assignment_id === a.id && x.student_id === s.id)
                        return (
                          <td key={a.id} className="border-b border-v-border px-3 py-2.5 text-center">
                            {v != null ? <span className={`font-semibold ${v < 4 ? 'text-v-danger' : ''}`}>{fmtScore(v)}</span>
                              : handed ? <span title="Entregó; falta corregir" className="rounded-full bg-v-warning/15 px-2 py-0.5 text-[10.5px] font-semibold text-[#a16207]">Por corregir</span>
                              : a.isDue ? <span title="No entregó" className="text-v-danger">—</span> : <span className="text-v-subtle">·</span>}
                          </td>
                        )
                      })}
                      <td className="border-b border-v-border px-4 py-2.5 text-center"><Badge tone={scoreTone(s.average)}>{fmtScore(s.average)}</Badge></td>
                    </tr>
                  ))}
                  <tr className="bg-v-fill/60">
                    <td className="sticky left-0 z-10 bg-v-fill px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.08em] text-v-subtle">Promedio del curso</td>
                    {columns.map(a => <td key={a.id} className="px-3 py-2.5 text-center font-semibold">{fmtScore(a.average)}</td>)}
                    <td className="px-4 py-2.5 text-center font-semibold">{fmtScore(courseAvg)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          <p className="px-5 py-3 text-xs text-v-subtle">{assignments.length > MAX_COLUMNS ? `Se muestran las ${MAX_COLUMNS} evaluaciones más recientes de ${assignments.length}. ` : ''}«—» en rojo: no entregó. Para calificar, abre la evaluación desde su título.{totalWeight > 0 ? ` El promedio es ponderado: ${fmtWeight(totalWeight)} tiene porcentaje asignado${totalWeight < 100 ? ` y el ${fmtWeight(100 - totalWeight)} restante se reparte entre las demás notas` : ''}.` : ''}</p>
        </Card>
      )}

      {/* ── Repaso: misiones con videos y preguntas ── */}
      {view === 'repaso' && (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="min-w-0 flex-1 basis-72 text-[13.5px] text-v-muted">Misiones cortas para que el curso repase <span className="font-semibold text-v-text">{subject.subjectName}</span>: videos de YouTube que se ven dentro de la plataforma y preguntas para practicar. No llevan nota.</p>
            <FormDialog trigger={<><Plus size={16} />Crear misión</>} title={`Nueva misión de repaso · ${teaching[0].courseName}`} description="Queda como borrador. Después le agregas videos y preguntas, y la publicas." action={createMission} submitLabel="Crear misión" wide>
              <Field label="Asignatura">
                <Select name="target" required defaultValue={`${id}:${subject.subjectId}`}>{teaching.map(t => <option key={t.subjectId} value={`${t.courseId}:${t.subjectId}`}>{t.subjectName}</option>)}</Select>
              </Field>
              <Field label="Nombre de la misión"><Input name="title" required minLength={3} maxLength={120} placeholder="Ej.: Fracciones equivalentes" /></Field>
              <Field label="De qué se trata" hint="Opcional. Una frase para motivar."><Textarea name="description" rows={2} maxLength={600} placeholder="Ej.: Repasa cómo reconocer fracciones que valen lo mismo." /></Field>
              <Field label="Contenido o unidad" hint="Opcional."><Input name="topic" maxLength={80} placeholder="Fracciones" /></Field>
            </FormDialog>
          </div>
          {missions.length === 0 ? (
            <Card><EmptyState aria={7} title={`Aún no hay misiones de ${subject.subjectName}`} description="Crea la primera con «Crear misión»: un video que explique y un par de preguntas para practicar." /></Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {missions.map((m, n) => (
                <Reveal key={m.id} index={Math.min(n, 8)}>
                  <Link href={`/docente/repaso/${m.id}`} className="group flex h-full flex-col overflow-hidden rounded-v-lg border border-v-border bg-v-elevated shadow-v transition-all duration-300 hover:-translate-y-1 hover:shadow-v-lg">
                    <div className="relative overflow-hidden px-5 py-4 text-white" style={{ background: m.published ? subjectCover(subject.subjectId) : 'linear-gradient(135deg,#94a3b8,#64748b)' }}>
                      <span aria-hidden className="pointer-events-none absolute -right-8 -top-10 size-32 rounded-full bg-white/15" />
                      <p className="relative text-[12px] font-semibold uppercase tracking-[0.08em] text-white/85">{m.published ? 'Publicada' : 'Borrador'}{m.topic ? ` · ${m.topic}` : ''}</p>
                      <p className="v-display relative mt-0.5 text-[1.2rem] font-bold leading-tight tracking-tight">{m.title}</p>
                    </div>
                    <div className="flex flex-1 flex-col p-5">
                      {m.description && <p className="line-clamp-2 text-[13.5px] leading-relaxed text-v-muted">{m.description}</p>}
                      <p className="mt-3 flex flex-wrap gap-2 text-[12.5px] font-semibold text-v-muted">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-v-fill px-2.5 py-1"><PlayCircle size={13} />{m.videos} {m.videos === 1 ? 'video' : 'videos'}</span>
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-v-fill px-2.5 py-1"><HelpCircle size={13} />{m.questions} {m.questions === 1 ? 'pregunta' : 'preguntas'}</span>
                      </p>
                      <div className="mt-auto flex items-center justify-between gap-2 pt-4">
                        <span className="text-[13px] text-v-muted">{m.published ? <><span className="font-semibold text-v-text">{m.finished}</span> de {students.length} la terminaron</> : 'Aún no la ven los estudiantes'}</span>
                        <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-v-accent">{m.videos + m.questions === 0 ? 'Agregar pasos' : 'Abrir'}<ArrowRight size={14} className="transition-transform group-hover:translate-x-1" /></span>
                      </div>
                    </div>
                  </Link>
                </Reveal>
              ))}
            </div>
          )}

          {(personalRows ?? []).length > 0 && (
            <Card className="mt-4">
              <CardHeader icon={<Sparkles size={15} />} title="Lo que tus estudiantes repasaron con ARIA" description="Repasos que crearon por su cuenta. Los prepara una inteligencia artificial: revísalos y elimina el que tenga errores." />
              <ul className="divide-y divide-v-border">
                {(personalRows ?? []).map(m => {
                  const own = (personalItems ?? []).filter(i => i.mission_id === m.id)
                  return (
                    <li key={m.id as string} className="px-5 py-3.5">
                      <details className="group">
                        <summary className="flex cursor-pointer list-none items-center gap-3">
                          <Avatar name={names.get(m.student_id as string) ?? 'Estudiante'} id={m.student_id as string} size={34} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[14px] font-semibold text-v-text">{m.title as string}</span>
                            <span className="block truncate text-[12.5px] text-v-muted">{names.get(m.student_id as string) ?? 'Estudiante'} pidió: «{m.topic as string}»</span>
                          </span>
                          <span className="shrink-0 text-[12.5px] font-semibold text-v-accent group-open:hidden">Ver contenido</span>
                          <span className="hidden shrink-0 text-[12.5px] font-semibold text-v-accent group-open:inline">Ocultar</span>
                          <ConfirmAction action={deleteMission.bind(null, m.id as string)} variant="ghost" size="sm" danger ariaLabel="Eliminar repaso" title="Eliminar repaso" confirmLabel="Eliminar" message="Se eliminará este repaso del estudiante, junto con su avance."><Trash2 size={14} /></ConfirmAction>
                        </summary>
                        <ol className="mt-3 space-y-3 pl-[46px]">
                          {own.map(it => (
                            <li key={it.id as string} className="text-[13.5px]">
                              {it.kind === 'video' ? <a href={`https://youtu.be/${it.youtube_id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-v-accent hover:underline"><PlayCircle size={14} />Video que eligió ARIA en YouTube: revísalo</a> : it.kind === 'note' ? <p className="rounded-v-sm bg-v-fill px-3 py-2 leading-relaxed text-v-muted"><span className="font-semibold text-v-text">Recuerda: </span>{it.body as string}</p> : (
                                <>
                                  <p className="font-semibold text-v-text">{it.prompt as string}</p>
                                  <ul className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
                                    {((it.options as string[] | null) ?? []).map((o, k) => (
                                      <li key={k} className={`rounded-v-sm border px-3 py-1.5 ${personalKey.get(it.id as string) === k ? 'border-v-success/50 bg-v-success/10 font-semibold text-[#157a4b]' : 'border-v-border text-v-muted'}`}>{String.fromCharCode(65 + k)}. {o}</li>
                                    ))}
                                  </ul>
                                </>
                              )}
                            </li>
                          ))}
                        </ol>
                      </details>
                    </li>
                  )
                })}
              </ul>
            </Card>
          )}
        </>
      )}

      {/* ── Tareas ── */}
      {view === 'tareas' && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <nav aria-label="Estado" className="flex min-w-0 flex-1 gap-1 overflow-x-auto rounded-full border border-v-border bg-v-elevated p-1 shadow-v-xs">
              {states.map(([v, l, n]) => (
                <Link key={v} href={href({ estado: v === 'todas' ? undefined : v })} scroll={false}
                  className={`inline-flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-[13px] font-semibold ${state === v ? 'bg-v-accent-soft text-v-accent' : 'text-v-muted hover:bg-v-fill hover:text-v-text'}`}>
                  {l}<span className={`rounded-full px-1.5 text-[11px] ${v === 'porcorregir' && n > 0 ? 'bg-v-warning/20 text-[#a16207]' : state === v ? 'bg-white text-v-accent' : 'bg-v-fill text-v-subtle'}`}>{n}</span>
                </Link>
              ))}
            </nav>
            <FormDialog trigger={<><Plus size={16} />Crear</>} title={`Nueva tarea o evaluación · ${teaching[0].courseName}`} description="Elige si es una tarea con entrega o una evaluación en clases (prueba, examen…)." action={createAssignment} submitLabel="Guardar" wide>
              <AssignmentFields institutionId={session.institutionId} dueDefault={defaultDue}
                targets={teaching.map(t => ({ value: `${t.courseId}:${t.subjectId}`, label: t.subjectName }))} target={`${id}:${subject.subjectId}`} />
            </FormDialog>
          </div>

          {shownTasks.length === 0 ? (
            <Card><EmptyState aria={8} title={tasks.length ? 'No hay nada en esta vista' : `Aún no hay tareas ni evaluaciones de ${subject.subjectName}`} description={tasks.length ? 'Prueba con otro estado.' : 'Usa «Crear» para asignar una tarea o registrar una prueba.'} /></Card>
          ) : (
            <ul className="space-y-3">
              {shownTasks.map((a, n) => (
                <li key={a.id}>
                  <Reveal index={Math.min(n, 8)}>
                    <Link href={`/docente/tareas/${a.id}`} className="group flex flex-wrap items-center gap-x-6 gap-y-4 rounded-v border border-v-border bg-v-elevated p-5 shadow-v transition-all duration-300 hover:-translate-y-0.5 hover:border-v-accent sm:p-6">
                      <span className="grid size-14 shrink-0 place-items-center rounded-[30%] text-white shadow-v" style={{ background: a.status === 'draft' ? 'linear-gradient(135deg,#94a3b8,#64748b)' : a.evaluation ? 'linear-gradient(135deg,#8b5cf6,#6d28d9)' : COVER[stage] ?? COVER.basica }}>{a.evaluation ? <FileCheck2 size={25} /> : <ClipboardList size={25} />}</span>
                      <div className="min-w-0 flex-1 basis-64">
                        <p className="flex items-center gap-2 text-[17px] font-semibold tracking-tight group-hover:text-v-accent"><span className="truncate">{a.title}</span>{a.attachment && <Paperclip size={14} className="shrink-0 text-v-subtle" />}</p>
                        <p className="mt-0.5 truncate text-[13.5px] text-v-muted">{subject.subjectName}{a.topic ? ` · ${a.topic}` : ''}</p>
                        <p className="mt-2.5 flex flex-wrap items-center gap-2">
                          {a.evaluation && <Badge tone="accent">{KIND_LABEL[a.kind]}</Badge>}
                          {a.weight != null && <Badge tone="accent">{fmtWeight(a.weight)} del promedio</Badge>}
                          {a.status === 'draft' ? <Badge>Borrador</Badge> : a.evaluation ? (a.open ? <Badge tone="success">Próxima</Badge> : <Badge>Rendida</Badge>) : a.status === 'closed' ? <Badge>Cerrada</Badge> : a.open ? <Badge tone="success">Vigente</Badge> : <Badge>Venció</Badge>}
                          <span className="inline-flex items-center gap-1 text-[12.5px] text-v-subtle"><CalendarClock size={13} />{a.evaluation ? 'Fecha:' : a.open ? 'Entrega hasta el' : 'Fecha límite:'} {fmtDateTime(a.dueAt)}</span>
                          {a.pending > 0 && <Badge tone="warning">{a.pending} {a.evaluation ? 'sin nota' : 'por corregir'}</Badge>}
                        </p>
                      </div>
                      <dl className="flex shrink-0 divide-x divide-v-border text-center">
                        {(a.evaluation ? [['Con nota', a.graded], ['Sin nota', Math.max(0, a.enrolled - a.graded)]] : [['Entregadas', a.submitted], ['Sin entregar', Math.max(0, a.enrolled - a.submitted)], ['Calificadas', a.graded]]).map(([label, value]) => (
                          <div key={label as string} className="px-5"><dd className="v-display text-[1.75rem] font-bold leading-none tabular-nums">{value}</dd><dt className="mt-1.5 text-[11.5px] text-v-subtle">{label}</dt></div>
                        ))}
                        <div className="px-5"><dd className={`v-display text-[1.75rem] font-bold leading-none tabular-nums ${a.average != null && a.average < 4 ? 'text-v-danger' : ''}`}>{fmtScore(a.average)}</dd><dt className="mt-1.5 text-[11.5px] text-v-subtle">Promedio</dt></div>
                      </dl>
                    </Link>
                  </Reveal>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  )
}
