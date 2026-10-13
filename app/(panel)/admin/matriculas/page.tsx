import Link from 'next/link'
import { AlertTriangle, ArrowRight, CalendarPlus, CheckCheck, CheckCircle2, GraduationCap, PartyPopper, School, UserPlus, Users } from 'lucide-react'
import { requireSession } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { listMembers } from '@/lib/data/people'
import { enrollStudent, withdrawEnrollment } from '@/lib/actions/admin'
import { closeSchoolYear, confirmPending, congratulateGraduates, createNextYear, setContinuity } from '@/lib/actions/enrollment'
import { fmtDate } from '@/lib/format'
import { Avatar, Badge, Card, CardBody, CardHeader, EmptyState, Field, LinkButton, Notice, PageHeader, Select, StatStrip, Table, Td, Th, type Tone } from '@/components/ui/primitives'
import { ConfirmAction, FormDialog, InlineForm } from '@/components/ui/dialog'
import { FilterSelect, SearchBox, Tabs, Pagination } from '@/components/ui/filters'
import { AutoSelect } from '@/components/ui/auto-select'
import { Bar } from '@/components/ui/motion'
import { fetchAll } from '@/lib/supabase/fetch-all'

type Search = { tab?: string; curso?: string; q?: string; p?: string }
const PAGE_SIZE = 20   // filas por página: con un colegio completo la lista entera no se puede dibujar de una vez
const DECISIONS = [{ value: 'promote', label: 'Continúa' }, { value: 'repeat', label: 'Repite el grado' }, { value: 'leave', label: 'No continúa' }]

export default async function EnrollmentsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const session = await requireSession('admin')
  const sp = await searchParams
  const tab = sp.tab ?? 'matriculas'
  const db = await createClient()
  const inst = session.institutionId
  const [students, courses, levels, periods, enrollments, alumniRows] = await Promise.all([
    listMembers(db, inst, ['estudiante']),
    db.from('courses').select('id, name, section, capacity, grade_level_id').eq('is_archived', false).eq('institution_id', inst).order('section'),
    db.from('grade_levels').select('id, name, sort_order').eq('institution_id', inst).order('sort_order'),
    db.from('academic_periods').select('id, name, year, is_current').eq('institution_id', inst).order('year'),
    fetchAll((a, b) => db.from('course_enrollments').select('id, course_id, student_id, enrolled_on, continuity').eq('institution_id', inst).eq('status', 'active').order('id').range(a, b)),
    db.from('alumni').select('student_id, graduation_year, last_course, graduated_at').eq('institution_id', inst).order('graduation_year', { ascending: false }),
  ])
  const L = levels.data ?? [], P = periods.data ?? [], alumni = alumniRows.data ?? []
  const levelIndex = new Map(L.map((l, i) => [l.id as string, i]))
  const C = (courses.data ?? []).map(c => ({ id: c.id as string, name: c.name as string, section: c.section as string, capacity: c.capacity as number, levelId: c.grade_level_id as string }))
    .sort((a, b) => (levelIndex.get(a.levelId) ?? 99) - (levelIndex.get(b.levelId) ?? 99) || a.section.localeCompare(b.section, 'es'))
  const courseById = new Map(C.map(c => [c.id, c]))
  const E = (enrollments.data ?? []).filter(e => courseById.has(e.course_id as string))
  const nameOf = new Map(students.map(s => [s.userId, s.fullName]))
  const alumniIds = new Set(alumni.map(a => a.student_id as string))
  const activeStudents = students.filter(s => s.status === 'active')
  const byStudent = new Map(E.map(e => [e.student_id as string, e]))
  const unenrolled = activeStudents.filter(s => !byStudent.has(s.userId) && !alumniIds.has(s.userId))

  const current = P.find(p => p.is_current)
  const future = P.filter(p => current && (p.year as number) > (current.year as number))
  const lastLevelId = L[L.length - 1]?.id as string | undefined
  /** A dónde va cada estudiante según su decisión: grado siguiente, mismo grado, retiro o egreso. */
  const destination = (courseId: string, continuity: string): { text: string; tone: Tone } => {
    const c = courseById.get(courseId)!
    if (continuity === 'pending') return { text: 'Sin decidir', tone: 'warning' }
    if (continuity === 'leave') return { text: 'Se retira del colegio', tone: 'neutral' }
    if (continuity === 'repeat') return { text: `${c.name} · repite`, tone: 'accent' }
    if (c.levelId === lastLevelId) return { text: `Egresa · Promoción ${current?.year ?? ''}`, tone: 'success' }
    const next = L[(levelIndex.get(c.levelId) ?? 0) + 1]
    return { text: next ? `${next.name} ${c.section}` : c.name, tone: 'success' }
  }
  const count = (v: string) => E.filter(e => e.continuity === v).length
  const pending = count('pending')
  const graduating = E.filter(e => courseById.get(e.course_id as string)!.levelId === lastLevelId)
  const graduatingCourses = C.filter(c => c.levelId === lastLevelId && E.some(e => e.course_id === c.id))

  const q = (sp.q ?? '').toLowerCase()
  const rows = E.filter(e => (!sp.curso || e.course_id === sp.curso) && (!q || (nameOf.get(e.student_id as string) ?? '').toLowerCase().includes(q)))
    .sort((a, b) => C.findIndex(c => c.id === a.course_id) - C.findIndex(c => c.id === b.course_id) || (nameOf.get(a.student_id as string) ?? '').localeCompare(nameOf.get(b.student_id as string) ?? '', 'es'))
  const page = Math.max(1, Number(sp.p) || 1)
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  // Continuidad: un curso a la vez. Con un colegio completo, dibujar a todos los estudiantes con su selector tarda demasiado.
  const closeCourse = (sp.curso && courseById.has(sp.curso) ? sp.curso : (C.find(c => E.some(e => e.course_id === c.id && e.continuity === 'pending')) ?? C.find(c => E.some(e => e.course_id === c.id)))?.id) ?? null
  const promotions = [...new Set(alumni.map(a => a.graduation_year as number))]

  return (
    <>
      <PageHeader title="Matrículas" description={`Quién está en cada curso${current ? ` en ${current.name} ${current.year}` : ''}, quién continúa el próximo año y quiénes ya egresaron.`}
        actions={<>
          <LinkButton href="/admin/usuarios"><UserPlus size={15} />Estudiante nuevo</LinkButton>
          <FormDialog trigger={<><ArrowRight size={15} />Asignar o cambiar curso</>} title="Asignar o cambiar curso" action={enrollStudent} submitLabel="Guardar"
            description="Para estudiantes que ya tienen cuenta: darle curso a quien no tiene, o moverlo a otra sección.">
            <Notice>¿Es un estudiante nuevo en el colegio? Créalo con «Estudiante nuevo»: en la invitación eliges su curso y queda matriculado al activar su cuenta.</Notice>
            <Field label="Estudiante" hint={unenrolled.length ? undefined : 'Todos los estudiantes con cuenta ya tienen curso; aquí puedes cambiarlos de sección.'}>
              <Select name="student_id" required defaultValue="">
                <option value="" disabled>Selecciona…</option>
                {unenrolled.length > 0 && <optgroup label="Sin curso todavía">{unenrolled.map(s => <option key={s.userId} value={s.userId}>{s.fullName}</option>)}</optgroup>}
                <optgroup label="Ya matriculados (cambiar de curso)">
                  {activeStudents.filter(s => byStudent.has(s.userId)).map(s => <option key={s.userId} value={s.userId}>{s.fullName} · {courseById.get(byStudent.get(s.userId)!.course_id as string)?.name}</option>)}
                </optgroup>
              </Select>
            </Field>
            <Field label="Curso de destino" hint="Si ya estaba en otro curso, esa matrícula se retira; sus notas y asistencia anteriores se conservan.">
              <Select name="course_id" required defaultValue=""><option value="" disabled>Selecciona…</option>{C.map(c => <option key={c.id} value={c.id}>{c.name} · {E.filter(e => e.course_id === c.id).length} de {c.capacity}</option>)}</Select>
            </Field>
          </FormDialog>
        </>} />

      <Tabs tabs={[
        { id: 'matriculas', label: 'Matrículas vigentes', count: E.length },
        { id: 'cierre', label: 'Continuidad y cierre de año', count: pending || undefined },
        { id: 'exalumnos', label: 'Exalumnos', count: alumni.length },
      ]} />

      {/* ── Matrículas vigentes ── */}
      {tab === 'matriculas' && (
        <>
          <StatStrip items={[
            { label: 'Matriculados', value: E.length, hint: `en ${C.filter(c => E.some(e => e.course_id === c.id)).length} cursos`, icon: <GraduationCap size={15} /> },
            { label: 'Sin matrícula', value: unenrolled.length, hint: 'cuentas sin curso', icon: <AlertTriangle size={15} />, tone: unenrolled.length ? 'warning' : 'success' },
            { label: 'Cursos', value: C.length, hint: `${C.filter(c => !E.some(e => e.course_id === c.id)).length} sin estudiantes`, icon: <School size={15} /> },
            { label: 'Exalumnos', value: alumni.length, hint: promotions.length ? `${promotions.length} ${promotions.length === 1 ? 'promoción' : 'promociones'}` : 'aún ninguno', icon: <Users size={15} />, tone: 'success', href: '?tab=exalumnos' },
          ]} />
          {unenrolled.length > 0 && (
            <div className="mb-4"><Notice tone="warning" title={`${unenrolled.length} estudiante${unenrolled.length > 1 ? 's' : ''} sin matrícula`}>
              {unenrolled.map(s => s.fullName).join(', ')}. Hasta que tengan curso no verán tareas, notas ni asistencia.
            </Notice></div>
          )}
          <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[1fr_340px]">
            <Card index={2}>
              <CardHeader icon={<GraduationCap size={15} />} title="Estudiantes matriculados" description={`${rows.length} de ${E.length}`} actions={<>
                <SearchBox placeholder="Buscar estudiante" />
                <FilterSelect param="curso" label="Todos los cursos" options={C.map(c => ({ value: c.id, label: c.name }))} />
              </>} />
              {rows.length === 0 ? <EmptyState aria={4} title="Sin matrículas que mostrar" description="Matricula a un estudiante o ajusta los filtros." /> : (
                <Table>
                  <thead><tr><Th>Estudiante</Th><Th>Curso</Th><Th>Matriculado</Th><Th>Próximo año</Th><Th /></tr></thead>
                  <tbody>
                    {pageRows.map(e => {
                      const name = nameOf.get(e.student_id as string) ?? 'Estudiante', course = courseById.get(e.course_id as string)!, d = destination(course.id, e.continuity as string)
                      return (
                        <tr key={e.id as string} className="hover:bg-v-fill/50">
                          <Td><Link href={`/admin/usuarios/${e.student_id}`} className="flex items-center gap-2.5 hover:text-v-accent"><Avatar name={name} size={30} id={e.student_id as string} /><span className="font-semibold">{name}</span></Link></Td>
                          <Td><Badge tone="accent">{course.name}</Badge></Td>
                          <Td className="whitespace-nowrap text-v-muted">{fmtDate(e.enrolled_on)}</Td>
                          <Td><Badge tone={d.tone}>{d.text}</Badge></Td>
                          <Td className="text-right">
                            <ConfirmAction action={withdrawEnrollment.bind(null, e.id as string)} title="Retirar matrícula" danger confirmLabel="Retirar"
                              message={`${name} dejará de pertenecer a ${course.name}. Sus notas y asistencia anteriores se conservan.`}>Retirar</ConfirmAction>
                          </Td>
                        </tr>
                      )
                    })}
                  </tbody>
                </Table>
              )}
              <Pagination page={page} pageSize={PAGE_SIZE} total={rows.length} />
            </Card>
            <Card index={3}>
              <CardHeader icon={<School size={15} />} title="Ocupación por curso" description="Matriculados sobre la capacidad" />
              <ul className="max-h-[480px] space-y-3.5 overflow-y-auto px-5 pb-5">
                {C.map(c => {
                  const n = E.filter(e => e.course_id === c.id).length
                  return (
                    <li key={c.id}>
                      <Link href={`?curso=${c.id}`} scroll={false} className="mb-1.5 flex items-center justify-between text-[13px] hover:text-v-accent"><span className="font-semibold">{c.name}</span><span className="tabular-nums text-v-muted">{n} / {c.capacity}</span></Link>
                      <Bar value={(n / c.capacity) * 100} tone={n > c.capacity ? 'danger' : n > 40 ? 'warning' : n === 0 ? 'neutral' : 'brand'} />
                    </li>
                  )
                })}
                {C.length === 0 && <li className="text-[13px] text-v-muted">Aún no hay cursos en el periodo vigente.</li>}
              </ul>
            </Card>
          </div>
        </>
      )}

      {/* ── Continuidad y cierre de año ── */}
      {tab === 'cierre' && (
        <>
          <StatStrip items={[
            { label: 'Sin decidir', value: pending, icon: <AlertTriangle size={15} />, tone: pending ? 'warning' : 'success' },
            { label: 'Continúan', value: count('promote') - graduating.filter(e => e.continuity === 'promote').length, hint: 'pasan de grado', icon: <ArrowRight size={15} /> },
            { label: 'Repiten', value: count('repeat'), icon: <School size={15} />, tone: 'accent' },
            { label: 'No continúan', value: count('leave'), icon: <Users size={15} />, tone: 'neutral' },
            { label: 'Egresan', value: graduating.filter(e => e.continuity === 'promote').length, hint: `de ${graduating.length} en último grado`, icon: <GraduationCap size={15} />, tone: 'success' },
          ]} />

          <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[1fr_360px]">
            <Card index={2}>
              <CardHeader icon={<CheckCheck size={15} />} title="Continuidad para el próximo año" description="Confirma con cada familia y registra la decisión. Se guarda al elegirla. Se muestra un curso a la vez."
                actions={<>
                  <FilterSelect param="curso" label="Siguiente curso con pendientes" options={C.filter(c => E.some(e => e.course_id === c.id)).map(c => { const n = E.filter(e => e.course_id === c.id && e.continuity === 'pending').length; return { value: c.id, label: n ? `${c.name} · ${n} pendientes` : c.name } })} />
                  {pending > 0 && (
                  <ConfirmAction action={confirmPending.bind(null, null)} variant="secondary" size="sm" title="Confirmar a todos los pendientes" confirmLabel="Confirmar"
                    message={`Se marcará «Continúa» a los ${pending} estudiantes que aún no tienen decisión. Podrás cambiar cada caso después.`}><CheckCheck size={14} />Confirmar a los {pending} pendientes</ConfirmAction>
                  )}
                </>} />
              {E.length === 0 ? <EmptyState aria={4} title="No hay matrículas en el periodo vigente" /> : (
                <Table>
                  <thead><tr><Th>Estudiante</Th><Th>Curso actual</Th><Th>Decisión</Th><Th>Destino</Th></tr></thead>
                  <tbody>
                    {C.filter(c => c.id === closeCourse).flatMap(c => {
                      const own = E.filter(e => e.course_id === c.id).sort((a, b) => (nameOf.get(a.student_id as string) ?? '').localeCompare(nameOf.get(b.student_id as string) ?? '', 'es'))
                      const open = own.filter(e => e.continuity === 'pending').length
                      return [
                        <tr key={c.id}><td colSpan={4} className="bg-v-fill/60 px-5 py-2">
                          <span className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-v-subtle">{c.name} · {own.length} estudiantes{c.levelId === lastLevelId ? ' · último grado' : ''}</span>
                            {open > 0 && <ConfirmAction action={confirmPending.bind(null, c.id)} title={`Confirmar a ${c.name}`} confirmLabel="Confirmar" message={`Se marcará «Continúa» a los ${open} pendientes de ${c.name}.`}>Confirmar a los {open} pendientes</ConfirmAction>}
                          </span>
                        </td></tr>,
                        ...own.map(e => {
                          const name = nameOf.get(e.student_id as string) ?? 'Estudiante', d = destination(c.id, e.continuity as string)
                          return (
                            <tr key={e.id as string} className="hover:bg-v-fill/50">
                              <Td><span className="flex items-center gap-2.5"><Avatar name={name} size={30} id={e.student_id as string} /><span className="font-semibold">{name}</span></span></Td>
                              <Td className="text-v-muted">{c.name}</Td>
                              <Td>
                                <InlineForm action={setContinuity.bind(null, e.id as string)} resetOnSuccess={false}>
                                  <AutoSelect name="continuity" value={e.continuity === 'pending' ? '' : e.continuity as string} label={`Continuidad de ${name}`} placeholder="Sin decidir" options={DECISIONS} />
                                </InlineForm>
                              </Td>
                              <Td><span className="inline-flex items-center gap-1.5">{e.continuity !== 'pending' && <ArrowRight size={13} className="text-v-subtle" />}<Badge tone={d.tone}>{d.text}</Badge></span></Td>
                            </tr>
                          )
                        }),
                      ]
                    })}
                  </tbody>
                </Table>
              )}
            </Card>

            <div className="space-y-4 xl:sticky xl:top-4">
              <Card index={3}>
                <CardHeader icon={<CalendarPlus size={15} />} title="Cerrar el año" description={current ? `${current.name} ${current.year}` : 'Sin periodo vigente'} />
                <CardBody>
                  <ol className="space-y-3 text-[13px] leading-relaxed">
                    {[
                      { done: pending === 0 && E.length > 0, text: pending ? `Faltan ${pending} decisiones de continuidad.` : 'Todas las decisiones están registradas.' },
                      { done: future.length > 0, text: future.length ? `Año de destino: ${future.map(p => `${p.name} ${p.year}`).join(', ')}.` : 'Falta crear el periodo del año siguiente.' },
                    ].map((s, i) => (
                      <li key={i} className="flex gap-2.5">
                        <span className={`grid size-5 shrink-0 place-items-center rounded-full ${s.done ? 'bg-v-success text-white' : 'bg-v-warning/20 text-[#a16207]'}`}>{s.done ? <CheckCircle2 size={12} /> : <span className="text-[10.5px] font-bold">{i + 1}</span>}</span>
                        <span className={s.done ? 'text-v-muted' : 'font-medium text-v-text'}>{s.text}</span>
                      </li>
                    ))}
                  </ol>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {current && future.length === 0 && (
                      <ConfirmAction action={createNextYear} variant="secondary" size="md" title={`Crear el Año escolar ${(current.year as number) + 1}`} confirmLabel="Crear periodo"
                        message={`Se creará el periodo «Año escolar ${(current.year as number) + 1}» (1 de marzo al 20 de diciembre). Puedes ajustar las fechas en Gestión académica.`}><CalendarPlus size={14} />Crear año {(current.year as number) + 1}</ConfirmAction>
                    )}
                    {future.length > 0 && pending === 0 && E.length > 0 && (
                      <FormDialog trigger={<><CheckCheck size={15} />Cerrar el año y promover</>} title={`Cerrar ${current?.name} ${current?.year}`} action={closeSchoolYear} submitLabel="Cerrar el año"
                        description="Se aplica todo junto: si algo falla, no cambia nada.">
                        <Field label="Año de destino"><Select name="target_period_id" required defaultValue={future[0].id as string}>{future.map(p => <option key={p.id as string} value={p.id as string}>{p.name} {p.year}</option>)}</Select></Field>
                        <ul className="space-y-1.5 rounded-v-sm bg-v-fill p-3.5 text-[13px] text-v-muted">
                          <li><span className="font-semibold text-v-text">{count('promote') - graduating.filter(e => e.continuity === 'promote').length}</span> pasan al grado siguiente, en la misma sección.</li>
                          <li><span className="font-semibold text-v-text">{count('repeat')}</span> repiten su grado.</li>
                          <li><span className="font-semibold text-v-text">{count('leave')}</span> se retiran del colegio.</li>
                          <li><span className="font-semibold text-v-text">{graduating.filter(e => e.continuity === 'promote').length}</span> egresan como Promoción {current?.year}.</li>
                        </ul>
                        <p className="text-xs leading-relaxed text-v-subtle">Las secciones del año nuevo que falten se crean con el plan de asignaturas de este año; sus docentes se asignan después en Gestión académica. Los cursos, notas y asistencia de {current?.year} se conservan como historial y dejan de aparecer en los listados.</p>
                        <label className="flex items-start gap-2.5 text-[13px]"><input type="checkbox" name="confirm" required className="mt-0.5 size-4 accent-[var(--v-accent)]" />Revisé las decisiones y entiendo que el cierre de año no se puede deshacer desde la plataforma.</label>
                      </FormDialog>
                    )}
                  </div>
                </CardBody>
              </Card>

              <Card index={4}>
                <CardHeader icon={<PartyPopper size={15} />} tone="success" title="Estudiantes por egresar" description={L.length ? `Último grado: ${L[L.length - 1].name}` : undefined} />
                <CardBody>
                  {graduating.length === 0 ? <p className="text-[13px] text-v-muted">No hay estudiantes matriculados en el último grado este año.</p> : (
                    <>
                      <ul className="space-y-2">
                        {graduating.map(e => <li key={e.id as string} className="flex items-center gap-2.5 text-[13.5px]"><Avatar name={nameOf.get(e.student_id as string) ?? '?'} size={28} id={e.student_id as string} /><span className="min-w-0 flex-1 truncate font-medium">{nameOf.get(e.student_id as string)}</span><span className="text-xs text-v-subtle">{courseById.get(e.course_id as string)?.name}</span></li>)}
                      </ul>
                      <div className="mt-4 flex flex-wrap gap-2 border-t border-v-border pt-4">
                        {graduatingCourses.map(c => (
                          <ConfirmAction key={c.id} action={congratulateGraduates.bind(null, c.id)} variant="secondary" size="md" title={`Felicitar a ${c.name}`} confirmLabel="Publicar"
                            message={`Se publicará en Comunidad un mensaje de felicitación para ${c.name}. Lo verán sus estudiantes, apoderados y docentes, y podrán reaccionar y comentar.`}><PartyPopper size={14} />Felicitar a {c.name}</ConfirmAction>
                        ))}
                      </div>
                      <p className="mt-3 text-xs text-v-subtle">Además, cada estudiante del último grado ve un saludo de felicitación en su inicio.</p>
                    </>
                  )}
                </CardBody>
              </Card>
            </div>
          </div>
        </>
      )}

      {/* ── Exalumnos ── */}
      {tab === 'exalumnos' && (
        alumni.length === 0 ? <Card><EmptyState aria={7} title="Aún no hay exalumnos" description="Cuando cierres un año, quienes terminan el último grado quedan aquí agrupados por promoción." /></Card> : (
          <div className="space-y-4">
            {promotions.map((year, i) => {
              const own = alumni.filter(a => a.graduation_year === year)
              return (
                <Card key={year} index={Math.min(i + 2, 8)}>
                  <CardHeader icon={<GraduationCap size={15} />} tone="success" title={`Promoción ${year}`} description={`${own.length} ${own.length === 1 ? 'egresado' : 'egresados'}`} />
                  <ul className="grid gap-x-4 gap-y-1 px-3 pb-4 sm:grid-cols-2 xl:grid-cols-3">
                    {own.map(a => {
                      const name = nameOf.get(a.student_id as string) ?? 'Exalumno'
                      return (
                        <li key={a.student_id as string}><Link href={`/admin/usuarios/${a.student_id}`} className="flex items-center gap-3 rounded-v-sm px-2 py-2 hover:bg-v-fill">
                          <Avatar name={name} size={36} id={a.student_id as string} />
                          <span className="min-w-0"><span className="block truncate text-[13.5px] font-semibold">{name}</span><span className="block truncate text-xs text-v-muted">{a.last_course} · egresó el {fmtDate(a.graduated_at)}</span></span>
                        </Link></li>
                      )
                    })}
                  </ul>
                </Card>
              )
            })}
            <p className="px-1 text-xs text-v-subtle">Los exalumnos conservan su historial académico. Su cuenta sigue activa hasta que la desactives desde su ficha de usuario.</p>
          </div>
        )
      )}
    </>
  )
}
