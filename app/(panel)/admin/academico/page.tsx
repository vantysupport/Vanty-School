import Link from 'next/link'
import { AlertTriangle, BookOpen, CheckCircle2, Copy, GraduationCap, Layers, Plus, School, Settings2, Trash2, UserRound, Users, Wand2, X } from 'lucide-react'
import { requireSession } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { listMembers } from '@/lib/data/people'
import { assignTeacher, createGradeLevel, createPeriod, createSubject, deleteAcademic, setCurrentPeriod } from '@/lib/actions/admin'
import { addCourseSubjects, addSection, copyCoursePlan, createStandardGrades, removeCourseSubject, updateCourseSettings } from '@/lib/actions/structure'
import { fmtDate } from '@/lib/format'
import { Badge, Card, CardBody, CardHeader, EmptyState, Field, Input, Notice, PageHeader, Select, StatStrip, Table, Td, Th } from '@/components/ui/primitives'
import { ConfirmAction, FormDialog, InlineForm } from '@/components/ui/dialog'
import { Tabs } from '@/components/ui/filters'
import { AutoSelect } from '@/components/ui/auto-select'
import { fetchAll } from '@/lib/supabase/fetch-all'

const STAGES = [['parvularia', 'Educación parvularia'], ['basica', 'Enseñanza básica'], ['media', 'Enseñanza media']] as const
const STAGE: Record<string, string> = Object.fromEntries(STAGES)
const CHECK = 'size-4 accent-[var(--v-accent)]'

function Remove({ kind, id, label }: { kind: Parameters<typeof deleteAcademic>[0]; id: string; label: string }) {
  return (
    <ConfirmAction action={deleteAcademic.bind(null, kind, id)} title={`Eliminar ${label}`} danger confirmLabel="Eliminar" ariaLabel={`Eliminar ${label}`}
      message={`Se eliminará ${label}. Si tiene matrículas, tareas o notas asociadas, la eliminación se bloquea para conservar esos registros.`}>
      <Trash2 size={14} />
    </ConfirmAction>
  )
}

export default async function AcademicPage({ searchParams }: { searchParams: Promise<{ tab?: string; curso?: string }> }) {
  const session = await requireSession('admin')
  const sp = await searchParams
  const tab = sp.tab ?? 'cursos'
  const db = await createClient()
  const inst = session.institutionId
  const [periods, levels, courses, subjects, assignments, plan, enrollments, teachers] = await Promise.all([
    db.from('academic_periods').select('id, name, year, starts_on, ends_on, is_current').eq('institution_id', inst).order('starts_on', { ascending: false }),
    db.from('grade_levels').select('id, name, stage, sort_order').eq('institution_id', inst).order('sort_order'),
    db.from('courses').select('id, name, section, grade_level_id, period_id, head_teacher_id, capacity').eq('is_archived', false).eq('institution_id', inst).order('section'),
    db.from('subjects').select('id, name, code').eq('institution_id', inst).order('name'),
    db.from('teacher_assignments').select('id, course_id, subject_id, teacher_id').eq('institution_id', inst),
    db.from('course_subjects').select('course_id, subject_id').eq('institution_id', inst),
    fetchAll((a, b) => db.from('course_enrollments').select('course_id').eq('institution_id', inst).eq('status', 'active').order('id').range(a, b)),
    listMembers(db, inst, ['docente']),
  ])
  const P = periods.data ?? [], L = levels.data ?? [], C = courses.data ?? [], S = subjects.data ?? [], A = assignments.data ?? [], PLAN = plan.data ?? []
  const activeTeachers = teachers.filter(t => t.status === 'active')
  const teacherName = new Map(teachers.map(t => [t.userId, t.fullName]))
  const subjectName = new Map(S.map(s => [s.id as string, s.name as string]))
  const current = P.find(p => p.is_current)

  // Situación de cada sección: su plan de asignaturas y cuántas tienen docente.
  const planOf = (courseId: string) => PLAN.filter(p => p.course_id === courseId).map(p => p.subject_id as string)
  const sections = C.map(c => {
    const own = planOf(c.id as string)
    const covered = own.filter(s => A.some(a => a.course_id === c.id && a.subject_id === s)).length
    return { id: c.id as string, name: c.name as string, section: c.section as string, levelId: c.grade_level_id as string, capacity: c.capacity as number,
      head: c.head_teacher_id as string | null, plan: own, covered, students: (enrollments.data ?? []).filter(e => e.course_id === c.id).length }
  })
  const selected = sections.find(s => s.id === sp.curso) ?? sections[0]
  const siblings = selected ? sections.filter(s => s.levelId === selected.levelId && s.id !== selected.id) : []
  const level = selected ? L.find(l => l.id === selected.levelId) : null
  const rows = selected ? selected.plan.map(sid => ({ id: sid, name: subjectName.get(sid) ?? 'Asignatura', assignment: A.find(a => a.course_id === selected.id && a.subject_id === sid) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es')) : []
  const available = selected ? S.filter(s => !selected.plan.includes(s.id as string)) : []
  // Diferencias con las demás secciones del grado: lo que ellas llevan y esta no.
  const onlyElsewhere = selected ? [...new Set(siblings.flatMap(s => s.plan))].filter(sid => !selected.plan.includes(sid)) : []
  const onlyHere = selected ? selected.plan.filter(sid => siblings.length > 0 && siblings.every(s => !s.plan.includes(sid))) : []
  const uncoveredTotal = sections.reduce((n, s) => n + (s.plan.length - s.covered), 0)

  return (
    <>
      <PageHeader title="Gestión académica" description="Qué asignaturas lleva cada sección y quién las imparte. Cada sección tiene su propio plan: dos secciones del mismo grado pueden diferir." />
      <Tabs tabs={[
        { id: 'cursos', label: 'Secciones y docentes', count: C.length },
        { id: 'asignaturas', label: 'Catálogo de asignaturas', count: S.length },
        { id: 'periodos', label: 'Periodos y grados' },
      ]} />

      {tab === 'cursos' && (
        <>
          <StatStrip items={[
            { label: 'Secciones', value: sections.length, hint: `en ${new Set(sections.map(s => s.levelId)).size} grados`, icon: <School size={15} /> },
            { label: 'Asignaturas en planes', value: PLAN.length, hint: `${S.length} en el catálogo`, icon: <BookOpen size={15} /> },
            { label: 'Sin docente', value: uncoveredTotal, hint: 'asignaturas por cubrir', icon: <AlertTriangle size={15} />, tone: uncoveredTotal ? 'warning' : 'success' },
            { label: 'Secciones sin plan', value: sections.filter(s => s.plan.length === 0).length, icon: <Layers size={15} />, tone: sections.some(s => s.plan.length === 0) ? 'danger' : 'success' },
          ]} />

          {!current && <div className="mb-4"><Notice tone="warning" title="Falta un periodo vigente">Define el periodo académico vigente en «Periodos y grados» antes de crear secciones.</Notice></div>}

          <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[340px_1fr]">
            {/* Navegador: nivel → grado → secciones */}
            <Card index={2} className="xl:sticky xl:top-4">
              <CardHeader icon={<Layers size={15} />} title="Grados y secciones" description="Elige una sección para ver su plan" />
              {L.length === 0 ? (
                <CardBody>
                  <p className="mb-3 text-[13px] text-v-muted">Aún no hay grados. Puedes crear de una vez la estructura habitual: Pre-kínder y Kínder, 1.º a 8.º básico y 1.º a 4.º medio.</p>
                  <ConfirmAction action={createStandardGrades} variant="primary" size="md" title="Crear los grados estándar" confirmLabel="Crear grados" message="Se crearán los 14 grados habituales, sin secciones."><Wand2 size={14} />Crear estructura estándar</ConfirmAction>
                </CardBody>
              ) : (
                <div className="max-h-[70vh] overflow-y-auto pb-2">
                  {STAGES.filter(([stage]) => L.some(l => l.stage === stage)).map(([stage, label]) => (
                    <div key={stage}>
                      <p className="bg-v-fill/60 px-5 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-v-subtle">{label}</p>
                      <ul>
                        {L.filter(l => l.stage === stage).map(l => {
                          const own = sections.filter(s => s.levelId === l.id)
                          return (
                            <li key={l.id as string} className="flex items-center gap-2 border-b border-v-border px-5 py-2.5 last:border-b-0">
                              <span className="w-[92px] shrink-0 text-[13px] font-semibold">{l.name}</span>
                              <span className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                                {own.map(s => {
                                  const on = selected?.id === s.id
                                  const status = s.plan.length === 0 ? 'bg-v-danger' : s.covered < s.plan.length ? 'bg-v-warning' : 'bg-v-success'
                                  return (
                                    <Link key={s.id} href={`?curso=${s.id}`} scroll={false} aria-current={on ? 'true' : undefined} title={`${s.name}: ${s.covered} de ${s.plan.length} asignaturas con docente`}
                                      className={`relative grid h-8 min-w-8 place-items-center rounded-[10px] border px-2 text-[13px] font-bold ${on ? 'v-brand border-transparent shadow-v-brand' : 'border-v-border-strong bg-v-elevated text-v-text hover:border-v-accent'}`}>
                                      {s.section}<span className={`absolute -right-1 -top-1 size-2.5 rounded-full ring-2 ring-white ${status}`} />
                                    </Link>
                                  )
                                })}
                                {own.length === 0 && <span className="self-center text-xs text-v-subtle">Sin secciones</span>}
                              </span>
                              <ConfirmAction action={addSection.bind(null, l.id as string)} title={`Agregar sección a ${l.name}`} confirmLabel="Crear sección" ariaLabel={`Agregar sección a ${l.name}`}
                                message={own.length ? `Se creará la siguiente sección de ${l.name} con el mismo plan de asignaturas de la sección ${own[0].section}. Después puedes ajustarlo.` : `Se creará ${l.name} A en el periodo vigente.`}><Plus size={14} /></ConfirmAction>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
              <p className="flex flex-wrap gap-x-3 gap-y-1 border-t border-v-border px-5 py-3 text-[11px] text-v-muted">
                <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-v-success" />Completa</span>
                <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-v-warning" />Falta docente</span>
                <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-v-danger" />Sin plan</span>
              </p>
            </Card>

            {/* Detalle de la sección elegida */}
            {!selected ? <Card index={3}><EmptyState aria={4} title="Aún no hay secciones" description="Agrega la primera sección a un grado con el botón + de la lista." /></Card> : (
              <div className="min-w-0 space-y-4">
                <Card index={3}>
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-3 p-5">
                    <span className="v-brand v-display grid size-14 shrink-0 place-items-center rounded-[30%] text-2xl font-bold shadow-v-brand">{selected.section}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-v-accent">{level ? STAGE[level.stage as string] : ''}</p>
                      <h2 className="v-headline text-[1.4rem] leading-tight">{selected.name}</h2>
                      <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-v-muted">
                        <span className="inline-flex items-center gap-1.5"><UserRound size={13} className="text-v-subtle" />Profesor jefe: {selected.head ? <span className="font-semibold text-v-text">{teacherName.get(selected.head) ?? '—'}</span> : <span className="font-semibold text-[#a16207]">sin asignar</span>}</span>
                        <span className="inline-flex items-center gap-1.5"><Users size={13} className="text-v-subtle" />{selected.students} de {selected.capacity} estudiantes</span>
                        <span className="inline-flex items-center gap-1.5"><GraduationCap size={13} className="text-v-subtle" />{siblings.length ? `${siblings.length + 1} secciones en el grado` : 'Única sección del grado'}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <FormDialog trigger={<><Settings2 size={14} />Editar sección</>} variant="secondary" size="sm" title={`Editar ${selected.name}`} action={updateCourseSettings.bind(null, selected.id)} submitLabel="Guardar">
                        <Field label="Profesor jefe"><Select name="head_teacher_id" defaultValue={selected.head ?? ''}><option value="">Sin asignar</option>{activeTeachers.map(t => <option key={t.userId} value={t.userId}>{t.fullName}</option>)}</Select></Field>
                        <Field label="Capacidad del aula" hint="Estudiantes que caben en la sección (máximo 60)."><Input name="capacity" type="number" min={1} max={60} required defaultValue={selected.capacity} /></Field>
                      </FormDialog>
                      <Remove kind="course" id={selected.id} label={`la sección ${selected.name}`} />
                    </div>
                  </div>
                </Card>

                <Card index={4}>
                  <CardHeader icon={<BookOpen size={15} />} title={`Asignaturas de ${selected.name}`}
                    description={rows.length ? `${rows.length} asignaturas · ${selected.covered} con docente${rows.length - selected.covered ? ` · ${rows.length - selected.covered} sin docente` : ''}` : 'Esta sección aún no tiene asignaturas'}
                    actions={<>
                      {siblings.some(s => s.plan.length > 0) && (
                        <FormDialog trigger={<><Copy size={14} />Copiar de otra sección</>} variant="ghost" size="sm" title="Copiar plan de asignaturas" description={`Agrega a ${selected.name} las asignaturas que le falten. No copia docentes.`} action={copyCoursePlan.bind(null, selected.id)} submitLabel="Copiar">
                          <Field label="Sección de origen"><Select name="from_course_id" required defaultValue={siblings.find(s => s.plan.length > 0)?.id}>{siblings.filter(s => s.plan.length > 0).map(s => <option key={s.id} value={s.id}>{s.name} · {s.plan.length} asignaturas</option>)}</Select></Field>
                        </FormDialog>
                      )}
                      <FormDialog trigger={<><Plus size={14} />Agregar asignatura</>} size="sm" title={`Agregar asignaturas a ${selected.name}`} action={addCourseSubjects.bind(null, selected.id)} submitLabel="Agregar">
                        {available.length === 0 ? <p className="text-[13.5px] text-v-muted">Esta sección ya lleva todas las asignaturas del catálogo. Crea una nueva en «Catálogo de asignaturas».</p> : (
                          <>
                            <fieldset>
                              <legend className="mb-2 text-[13px] font-medium text-v-muted">Asignaturas del catálogo que aún no lleva</legend>
                              <div className="grid gap-2 sm:grid-cols-2">
                                {available.map(s => <label key={s.id as string} className="flex cursor-pointer items-center gap-2.5 rounded-v-sm border border-v-border px-3 py-2 text-[13.5px] hover:border-v-accent"><input type="checkbox" name="subject_ids[]" value={s.id as string} className={CHECK} />{s.name}</label>)}
                              </div>
                            </fieldset>
                            {siblings.length > 0 && <label className="flex items-center gap-2.5 text-[13px] text-v-muted"><input type="checkbox" name="whole_grade" className={CHECK} />Agregar también a {siblings.length === 1 ? 'la otra sección' : `las otras ${siblings.length} secciones`} de {level?.name}</label>}
                          </>
                        )}
                      </FormDialog>
                    </>} />
                  {rows.length === 0 ? <EmptyState aria={8} title="Sin plan de asignaturas" description="Agrega las asignaturas que lleva esta sección o copia el plan de otra sección del grado." /> : (
                    <Table>
                      <thead><tr><Th>Asignatura</Th><Th>Docente</Th><Th>Estado</Th><Th /></tr></thead>
                      <tbody>
                        {rows.map(r => (
                          <tr key={r.id} className="hover:bg-v-fill/50">
                            <Td><span className="font-semibold">{r.name}</span>{onlyHere.includes(r.id) && <span className="ml-2"><Badge tone="accent">Solo en esta sección</Badge></span>}</Td>
                            <Td>
                              <InlineForm action={assignTeacher} resetOnSuccess={false}>
                                <input type="hidden" name="course_id" value={selected.id} />
                                <input type="hidden" name="subject_id" value={r.id} />
                                <AutoSelect name="teacher_id" value={r.assignment?.teacher_id ?? ''} label={`Docente de ${r.name} en ${selected.name}`} placeholder="Elegir docente…"
                                  options={activeTeachers.map(t => ({ value: t.userId, label: t.fullName }))} />
                              </InlineForm>
                            </Td>
                            <Td>{r.assignment ? <Badge tone="success"><CheckCircle2 size={11} />Con docente</Badge> : <Badge tone="warning"><AlertTriangle size={11} />Sin docente</Badge>}</Td>
                            <Td className="whitespace-nowrap text-right">
                              {r.assignment
                                ? <ConfirmAction action={deleteAcademic.bind(null, 'teacher_assignment', r.assignment.id as string)} title="Quitar docente" danger confirmLabel="Quitar"
                                    message={`${teacherName.get(r.assignment.teacher_id as string) ?? 'El docente'} dejará de impartir ${r.name} en ${selected.name}. Las tareas y notas ya registradas se conservan.`}><X size={13} />Quitar docente</ConfirmAction>
                                : <ConfirmAction action={removeCourseSubject.bind(null, selected.id, r.id)} title="Quitar asignatura" danger confirmLabel="Quitar"
                                    message={`${r.name} dejará de formar parte del plan de ${selected.name}. Las demás secciones no cambian.`}><Trash2 size={13} />Quitar del plan</ConfirmAction>}
                            </Td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  )}
                  <p className="border-t border-v-border px-5 py-3 text-xs text-v-subtle">El docente se guarda al elegirlo. Un mismo docente puede tener asignaturas en varias secciones.</p>
                </Card>

                {siblings.length > 0 && (
                  <Card index={5}>
                    <CardHeader icon={<Layers size={15} />} title={`Comparación con las otras secciones de ${level?.name}`} description="Lo que cambia entre secciones del mismo grado" />
                    <CardBody>
                      {onlyElsewhere.length === 0 && onlyHere.length === 0 ? <p className="text-[13.5px] text-v-muted">Todas las secciones de {level?.name} llevan las mismas asignaturas.</p> : (
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div>
                            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-v-subtle">Solo en {selected.name}</p>
                            <div className="flex flex-wrap gap-1.5">{onlyHere.length ? onlyHere.map(sid => <Badge key={sid} tone="accent">{subjectName.get(sid)}</Badge>) : <span className="text-[13px] text-v-subtle">Ninguna</span>}</div>
                          </div>
                          <div>
                            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-v-subtle">Las llevan otras secciones y esta no</p>
                            <div className="flex flex-wrap gap-1.5">{onlyElsewhere.length ? onlyElsewhere.map(sid => <Badge key={sid} tone="warning">{subjectName.get(sid)} · {siblings.filter(s => s.plan.includes(sid)).map(s => s.section).join(', ')}</Badge>) : <span className="text-[13px] text-v-subtle">Ninguna</span>}</div>
                          </div>
                        </div>
                      )}
                      <ul className="mt-4 flex flex-wrap gap-2 border-t border-v-border pt-4">
                        {siblings.map(s => <li key={s.id}><Link href={`?curso=${s.id}`} scroll={false} className="inline-flex items-center gap-2 rounded-full border border-v-border-strong px-3 py-1.5 text-xs font-semibold text-v-muted hover:border-v-accent hover:text-v-accent">{s.name}<span className="font-normal text-v-subtle">{s.covered}/{s.plan.length} con docente</span></Link></li>)}
                      </ul>
                    </CardBody>
                  </Card>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {tab === 'asignaturas' && (
        <Card>
          <CardHeader icon={<BookOpen size={15} />} title="Catálogo de asignaturas" description="Todas las asignaturas que el colegio puede impartir. Cada sección elige cuáles lleva." actions={
            <FormDialog trigger={<><Plus size={15} />Nueva asignatura</>} size="sm" title="Nueva asignatura" action={createSubject} submitLabel="Crear asignatura" description="Queda disponible para agregarla al plan de las secciones que corresponda.">
              <Field label="Nombre"><Input name="name" required minLength={2} maxLength={80} placeholder="Educación Física y Salud" /></Field>
              <Field label="Código" hint="Opcional, hasta 10 caracteres."><Input name="code" maxLength={10} placeholder="EFI" /></Field>
            </FormDialog>
          } />
          {S.length === 0 ? <EmptyState title="Aún no hay asignaturas" /> : (
            <Table>
              <thead><tr><Th>Asignatura</Th><Th>Código</Th><Th>Secciones que la llevan</Th><Th>Con docente</Th><Th>Docentes</Th><Th /></tr></thead>
              <tbody>
                {S.map(s => {
                  const inPlan = PLAN.filter(p => p.subject_id === s.id)
                  const own = A.filter(a => a.subject_id === s.id)
                  return (
                    <tr key={s.id as string} className="hover:bg-v-fill/50">
                      <Td className="font-semibold">{s.name}</Td>
                      <Td className="text-v-muted">{s.code ?? '—'}</Td>
                      <Td>{inPlan.length ? <span title={inPlan.map(p => sections.find(c => c.id === p.course_id)?.name).join(', ')}>{inPlan.length} de {sections.length}</span> : <Badge tone="warning">Ninguna</Badge>}</Td>
                      <Td>{inPlan.length ? <span className={own.length < inPlan.length ? 'font-semibold text-[#a16207]' : ''}>{own.length} de {inPlan.length}</span> : <span className="text-v-subtle">—</span>}</Td>
                      <Td className="max-w-[280px] truncate text-v-muted">{[...new Set(own.map(a => teacherName.get(a.teacher_id as string)))].filter(Boolean).join(', ') || '—'}</Td>
                      <Td className="text-right"><Remove kind="subject" id={s.id as string} label={`la asignatura ${s.name}`} /></Td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          )}
        </Card>
      )}

      {tab === 'periodos' && (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Periodos académicos" actions={
              <FormDialog trigger={<><Plus size={15} />Nuevo periodo</>} size="sm" title="Nuevo periodo académico" action={createPeriod} submitLabel="Crear periodo">
                <div className="grid gap-3 sm:grid-cols-[1fr_110px]">
                  <Field label="Nombre"><Input name="name" required placeholder="Primer semestre" /></Field>
                  <Field label="Año"><Input name="year" type="number" required defaultValue={new Date().getFullYear()} min={2000} max={2100} /></Field>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Inicio"><Input name="starts_on" type="date" required /></Field>
                  <Field label="Término"><Input name="ends_on" type="date" required /></Field>
                </div>
              </FormDialog>
            } />
            {P.length === 0 ? <EmptyState title="Aún no hay periodos" /> : (
              <ul className="divide-y divide-v-border">
                {P.map(p => (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3 text-[13.5px]">
                    <span><span className="font-medium">{p.name} {p.year}</span><span className="block text-[12px] text-v-subtle">{fmtDate(p.starts_on)} – {fmtDate(p.ends_on)}</span></span>
                    <span className="flex items-center gap-1">
                      {p.is_current ? <Badge tone="success">Vigente</Badge> : (
                        <ConfirmAction action={setCurrentPeriod.bind(null, p.id)} title="Cambiar periodo vigente" message={`${p.name} ${p.year} pasará a ser el periodo vigente del colegio.`}>Marcar vigente</ConfirmAction>
                      )}
                      <Remove kind="period" id={p.id} label={`el periodo ${p.name} ${p.year}`} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader title="Niveles y grados" description={`${L.length} grados`} actions={<>
              {L.length < 14 && <ConfirmAction action={createStandardGrades} variant="ghost" size="sm" title="Completar la estructura estándar" confirmLabel="Crear grados" message="Se crearán los grados que falten de la estructura habitual (Pre-kínder a 4.º medio). Los existentes se conservan."><Wand2 size={14} />Completar estándar</ConfirmAction>}
              <FormDialog trigger={<><Plus size={15} />Nuevo grado</>} size="sm" title="Nuevo grado" action={createGradeLevel} submitLabel="Crear grado">
                <Field label="Nombre"><Input name="name" required placeholder="8.º básico" /></Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Nivel de enseñanza"><Select name="stage" defaultValue="basica">{STAGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
                  <Field label="Orden" hint="Para ordenar la lista."><Input name="sort_order" type="number" min={0} max={20} defaultValue={L.length + 1} /></Field>
                </div>
              </FormDialog>
            </>} />
            {L.length === 0 ? <EmptyState title="Aún no hay grados" /> : (
              <ul className="divide-y divide-v-border">
                {L.map(l => (
                  <li key={l.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-[13.5px]">
                    <span><span className="font-medium">{l.name}</span><span className="ml-2 text-v-subtle">{STAGE[l.stage]} · {sections.filter(s => s.levelId === l.id).length} secciones</span></span>
                    <Remove kind="grade_level" id={l.id} label={`el grado ${l.name}`} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </>
  )
}
