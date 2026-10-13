import Link from 'next/link'
import { AlertTriangle, BookOpen, ChevronRight, GraduationCap, LayoutGrid, Layers, List, Plus, School, Users, Wand2 } from 'lucide-react'
import { requireSession } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { listMembers } from '@/lib/data/people'
import { CROWDED, loadPlan, loadSnapshot, occupancy, indexSnapshot, studentStanding } from '@/lib/data/academic'
import { createCourse, createGradeLevel, createSubject } from '@/lib/actions/admin'
import { addSection, createStandardGrades } from '@/lib/actions/structure'
import { attendanceRate, average, fmtPct, fmtScore } from '@/lib/format'
import { Badge, Card, CardHeader, EmptyState, Field, Input, PageHeader, Select, StatStrip, Table, Td, Th } from '@/components/ui/primitives'
import { ConfirmAction, FormDialog } from '@/components/ui/dialog'
import { SearchBox } from '@/components/ui/filters'
import { Bar, Pop, Reveal } from '@/components/ui/motion'

type Search = { nivel?: string; vista?: string; q?: string; filtro?: string }

const STAGE: Record<string, { label: string; short: string }> = {
  parvularia: { label: 'Educación parvularia', short: 'Parvularia' },
  basica: { label: 'Enseñanza básica', short: 'Básica' },
  media: { label: 'Enseñanza media', short: 'Media' },
}
const STANDARD_GRADES = 14

export default async function DirectionCourses({ searchParams }: { searchParams: Promise<Search> }) {
  const session = await requireSession('directivo')
  const sp = await searchParams
  const db = await createClient()
  const inst = session.institutionId
  const [snap, plan, teachers, { data: courses }, { data: levels }, { data: periods }, { data: teaching }] = await Promise.all([
    loadSnapshot(db, inst),
    loadPlan(db, inst),
    listMembers(db, inst, ['docente']),
    db.from('courses').select('id, name, section, capacity, head_teacher_id, grade_level_id').eq('is_archived', false).eq('institution_id', inst).order('section'),
    db.from('grade_levels').select('id, name, stage, sort_order').eq('institution_id', inst).order('sort_order'),
    db.from('academic_periods').select('id, name, year, is_current').eq('institution_id', inst).order('starts_on', { ascending: false }),
    db.from('teacher_assignments').select('course_id, subject_id').eq('institution_id', inst),
  ])
  const L = levels ?? []
  const teacherName = new Map(teachers.map(t => [t.userId, t.fullName]))
  const activeTeachers = teachers.filter(t => t.status === 'active')
  const current = (periods ?? []).find(p => p.is_current)
  const now = Date.now()
  const ix = indexSnapshot(snap)
  const covered = new Set((teaching ?? []).map(t => `${t.course_id}:${t.subject_id}`))
  const planOf = new Map<string, typeof plan>()
  for (const p of plan) { const list = planOf.get(p.course_id); if (list) list.push(p); else planOf.set(p.course_id, [p]) }

  // Situación de cada curso (sección).
  const all = (courses ?? []).map(c => {
    const enrolled = ix.enrolledIn.get(c.id as string) ?? []
    const scores = (ix.gradesByCourse.get(c.id as string) ?? []).map(g => g.score)
    const alerts = enrolled.filter(studentId => {
      const { avg, attendance: att, missing } = studentStanding(snap, studentId, c.id as string, now)
      return (avg != null && avg < 4) || (att != null && att < 85) || missing >= 3
    }).length
    const subjects = planOf.get(c.id as string) ?? []
    return {
      id: c.id as string, name: c.name as string, section: c.section as string, levelId: c.grade_level_id as string, capacity: c.capacity as number,
      head: teacherName.get(c.head_teacher_id as string) ?? null, students: enrolled.length, alerts,
      attendance: attendanceRate(ix.attendanceByCourse.get(c.id as string) ?? []), avg: average(scores),
      subjects: subjects.length, uncovered: subjects.filter(p => !covered.has(`${c.id}:${p.subject_id}`)).length,
      occ: occupancy(enrolled.length, c.capacity as number),
    }
  })

  const q = (sp.q ?? '').toLowerCase()
  const visibleLevels = L.filter(l => !sp.nivel || l.stage === sp.nivel)
  const matches = (c: (typeof all)[number]) =>
    (!q || c.name.toLowerCase().includes(q) || (c.head ?? '').toLowerCase().includes(q))
    && (!sp.filtro || (sp.filtro === 'sobrecupo' ? c.occ !== 'ok' : sp.filtro === 'alertas' ? c.alerts > 0 : sp.filtro === 'sindocente' ? c.uncovered > 0 || c.subjects === 0 || !c.head : true))
  const shown = all.filter(c => visibleLevels.some(l => l.id === c.levelId) && matches(c))

  const totalStudents = new Set(snap.enrollments.map(e => e.student_id)).size
  const view = sp.vista === 'lista' ? 'lista' : 'mapa'
  const href = (patch: Partial<Search>) => {
    const next = new URLSearchParams()
    for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v) next.set(k, v)
    const s = next.toString()
    return s ? `/direccion/cursos?${s}` : '/direccion/cursos'
  }
  const pill = (on: boolean) => `inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-semibold ${on ? 'v-brand shadow-v-brand' : 'text-v-muted hover:bg-v-fill hover:text-v-text'}`
  const occColor = { ok: 'brand', high: 'warning', over: 'danger' } as const

  return (
    <>
      <PageHeader title="Cursos y estudiantes" description="La estructura completa del colegio: niveles, grados y secciones, con la ocupación de cada aula y lo que requiere atención."
        actions={<>
          <FormDialog trigger={<><Layers size={14} />Nuevo grado</>} variant="secondary" title="Nuevo grado" action={createGradeLevel} submitLabel="Crear grado">
            <Field label="Nombre"><Input name="name" required placeholder="8.º básico" /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nivel de enseñanza"><Select name="stage" defaultValue="basica">{Object.entries(STAGE).map(([v, s]) => <option key={v} value={v}>{s.label}</option>)}</Select></Field>
              <Field label="Orden"><Input name="sort_order" type="number" min={0} max={20} defaultValue={L.length + 1} /></Field>
            </div>
          </FormDialog>
          <FormDialog trigger={<><BookOpen size={14} />Nueva asignatura</>} variant="secondary" title="Nueva asignatura" action={createSubject} submitLabel="Crear asignatura"
            description="Queda disponible para incluirla en el plan de los cursos que corresponda.">
            <Field label="Nombre"><Input name="name" required minLength={2} maxLength={80} placeholder="Inglés" /></Field>
            <Field label="Código" hint="Opcional."><Input name="code" maxLength={10} placeholder="ING" /></Field>
          </FormDialog>
          <FormDialog trigger={<><Plus size={15} />Nuevo curso</>} title="Nuevo curso" action={createCourse} submitLabel="Crear curso">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Grado"><Select name="grade_level_id" required defaultValue=""><option value="" disabled>Selecciona…</option>{L.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</Select></Field>
              <Field label="Sección"><Input name="section" required maxLength={10} placeholder="A" /></Field>
            </div>
            <Field label="Periodo"><Select name="period_id" required defaultValue={current?.id ?? ''}>{(periods ?? []).map(p => <option key={p.id} value={p.id}>{p.name} {p.year}{p.is_current ? ' (vigente)' : ''}</option>)}</Select></Field>
            <Field label="Profesor jefe" hint="Opcional."><Select name="head_teacher_id" defaultValue=""><option value="">Sin asignar</option>{activeTeachers.map(t => <option key={t.userId} value={t.userId}>{t.fullName}</option>)}</Select></Field>
          </FormDialog>
        </>} />

      <StatStrip items={[
        { label: 'Estudiantes matriculados', value: totalStudents, icon: <GraduationCap size={15} /> },
        { label: 'Cursos', value: all.length, hint: `en ${L.length} grados`, icon: <School size={15} /> },
        { label: 'Estudiantes por aula', value: all.length ? Math.round(totalStudents / all.length) : 0, hint: `máx. ${Math.max(0, ...all.map(c => c.students))}`, icon: <Users size={15} />, tone: 'success' },
        { label: 'Estudiantes en alerta', value: all.reduce((n, c) => n + c.alerts, 0), icon: <AlertTriangle size={15} />, tone: 'warning', href: href({ filtro: 'alertas' }) },
      ]} />

      {L.length < STANDARD_GRADES && (
        <Reveal index={4} className="mb-4 flex flex-wrap items-center gap-4 rounded-v border border-v-accent/25 bg-v-accent-soft p-5">
          <span className="v-brand grid size-11 shrink-0 place-items-center rounded-[30%] shadow-v-brand"><Wand2 size={19} /></span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold tracking-tight">Completa la estructura del colegio en un paso</p>
            <p className="mt-0.5 text-sm text-v-muted">Tienes {L.length} de los {STANDARD_GRADES} grados habituales: Pre-kínder y Kínder, 1.º a 8.º básico y 1.º a 4.º medio. Los que ya existen se conservan.</p>
          </div>
          <ConfirmAction action={createStandardGrades} variant="primary" size="md" title="Crear los grados que faltan" confirmLabel="Crear grados"
            message={`Se crearán los ${STANDARD_GRADES - L.length} grados que faltan, sin secciones. Después podrás agregar las secciones (A, B, C…) de cada grado con un clic.`}>
            <Wand2 size={14} />Crear grados faltantes
          </ConfirmAction>
        </Reveal>
      )}

      {/* Filtros */}
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-v border border-v-border bg-v-elevated p-2 shadow-v-xs">
        <nav aria-label="Nivel" className="flex items-center gap-1 overflow-x-auto">
          <Link href={href({ nivel: undefined })} scroll={false} className={pill(!sp.nivel)}>Todos <span className="opacity-70">{all.length}</span></Link>
          {Object.entries(STAGE).map(([v, s]) => {
            const n = all.filter(c => L.some(l => l.id === c.levelId && l.stage === v)).length
            return <Link key={v} href={href({ nivel: v })} scroll={false} className={pill(sp.nivel === v)}>{s.short} <span className="opacity-70">{n}</span></Link>
          })}
        </nav>
        <span className="hidden h-6 w-px bg-v-border lg:block" />
        <nav aria-label="Filtro" className="flex items-center gap-1 overflow-x-auto">
          {([['', 'Todo'], ['alertas', 'Con estudiantes en alerta'], ['sindocente', 'Con vacantes docentes']] as const).map(([v, l]) =>
            <Link key={v} href={href({ filtro: v || undefined })} scroll={false} className={pill((sp.filtro ?? '') === v)}>{l}</Link>)}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <SearchBox placeholder="Buscar curso o profesor jefe" />
          <div className="flex rounded-full bg-v-fill p-1">
            <Link href={href({ vista: undefined })} scroll={false} className={pill(view === 'mapa')} aria-label="Vista de mapa"><LayoutGrid size={13} />Mapa</Link>
            <Link href={href({ vista: 'lista' })} scroll={false} className={pill(view === 'lista')} aria-label="Vista de lista"><List size={13} />Lista</Link>
          </div>
        </div>
      </div>

      {L.length === 0 ? <Card><EmptyState aria={4} title="Aún no hay grados" description="Crea la estructura estándar o agrega el primer grado." /></Card> : view === 'mapa' ? (
        <div className="space-y-4">
          {Object.entries(STAGE).filter(([v]) => visibleLevels.some(l => l.stage === v)).map(([stage, info], si) => {
            const grades = visibleLevels.filter(l => l.stage === stage)
            const inStage = all.filter(c => grades.some(g => g.id === c.levelId))
            return (
              <Card key={stage} index={5 + si}>
                <CardHeader icon={<School size={15} />} title={info.label}
                  description={`${grades.length} grados · ${inStage.length} secciones · ${inStage.reduce((n, c) => n + c.students, 0)} estudiantes`} />
                <ul className="divide-y divide-v-border border-t border-v-border">
                  {grades.map((g, gi) => {
                    const sections = all.filter(c => c.levelId === g.id)
                    const visible = sections.filter(matches)
                    if ((q || sp.filtro) && visible.length === 0) return null
                    return (
                      <li key={g.id as string} className="flex flex-col gap-3 px-5 py-3.5 lg:flex-row lg:items-center">
                        <div className="w-full shrink-0 lg:w-44">
                          <p className="text-[14.5px] font-semibold tracking-tight">{g.name}</p>
                          <p className="text-xs text-v-subtle">{sections.length ? `${sections.length} ${sections.length === 1 ? 'sección' : 'secciones'} · ${sections.reduce((n, c) => n + c.students, 0)} estudiantes` : 'Sin secciones'}</p>
                        </div>
                        <div className="flex min-w-0 flex-1 flex-wrap items-stretch gap-2">
                          {visible.map((c, ci) => (
                            <Link key={c.id} href={`/direccion/cursos/${c.id}`} aria-label={`${c.name}: ${c.students} estudiantes`}>
                              <Pop index={gi * 3 + ci} title={`${c.name} · profesor jefe: ${c.head ?? 'sin asignar'}`}
                                className={`w-[132px] rounded-v-sm border bg-v-elevated p-2.5 shadow-v-xs hover:border-v-accent ${c.occ === 'over' ? 'border-v-danger/40' : c.occ === 'high' ? 'border-v-warning/50' : 'border-v-border'}`}>
                                <div className="flex items-center justify-between">
                                  <span className="v-brand v-display grid size-7 place-items-center rounded-[30%] text-[13px] font-bold">{c.section}</span>
                                  {c.alerts > 0 && <span className="rounded-full bg-v-warning/15 px-1.5 py-0.5 text-[10px] font-bold text-v-warning" title="Estudiantes que requieren atención">{c.alerts} en alerta</span>}
                                </div>
                                <p className="mt-2 flex items-baseline gap-1">
                                  <span className={`v-display text-xl font-bold leading-none tabular-nums ${c.occ === 'over' ? 'text-v-danger' : c.occ === 'high' ? 'text-v-warning' : ''}`}>{c.students}</span>
                                  <span className="text-[11px] text-v-subtle">/ {c.capacity} est.</span>
                                </p>
                                <div className="mt-1.5"><Bar value={(c.students / c.capacity) * 100} tone={occColor[c.occ]} delay={0.2} /></div>
                                <p className="mt-2 flex items-center justify-between text-[11px] text-v-muted">
                                  <span>Asist. <span className={`font-semibold ${c.attendance != null && c.attendance < 88 ? 'text-v-danger' : 'text-v-text'}`}>{fmtPct(c.attendance)}</span></span>
                                  {(c.uncovered > 0 || c.subjects === 0) && <span className="font-semibold text-v-danger" title="Asignaturas sin docente o sin plan">{c.subjects === 0 ? 'Sin plan' : `${c.uncovered} vac.`}</span>}
                                </p>
                              </Pop>
                            </Link>
                          ))}
                          <ConfirmAction action={addSection.bind(null, g.id as string)} variant="ghost" size="sm" title={`Agregar sección a ${g.name}`} confirmLabel="Crear sección"
                            message={sections.length ? `Se creará la siguiente sección de ${g.name} con el mismo plan de asignaturas que la sección ${sections[0].section}.` : `Se creará ${g.name} A en el periodo vigente.`}>
                            <Plus size={13} />Sección
                          </ConfirmAction>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </Card>
            )
          })}
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11px] text-v-muted">
            <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-v-accent" />Hasta {CROWDED} estudiantes</span>
            <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-v-warning" />Sobre {CROWDED}</span>
            <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-v-danger" />Sobre la capacidad del aula</span>
            <span>«vac.» = asignaturas del plan sin docente</span>
          </p>
        </div>
      ) : (
        <Card index={5}>
          <CardHeader icon={<List size={15} />} title="Todos los cursos" description={`${shown.length} de ${all.length}`} />
          {shown.length === 0 ? <EmptyState aria={8} title="Ningún curso coincide" description="Ajusta la búsqueda o los filtros." /> : (
            <Table>
              <thead><tr><Th>Curso</Th><Th>Nivel</Th><Th>Profesor jefe</Th><Th>Estudiantes</Th><Th>Asistencia</Th><Th>En alerta</Th><Th>Asignaturas</Th><Th>Sin docente</Th><Th>Promedio</Th><Th /></tr></thead>
              <tbody>
                {visibleLevels.flatMap(l => shown.filter(c => c.levelId === l.id).map(c => (
                  <tr key={c.id} className="hover:bg-v-fill/50">
                    <Td><Link href={`/direccion/cursos/${c.id}`} className="font-semibold hover:text-v-accent">{c.name}</Link></Td>
                    <Td className="text-v-muted">{STAGE[l.stage as string].short}</Td>
                    <Td className="text-v-muted">{c.head ?? <span className="font-semibold text-v-warning">Sin asignar</span>}</Td>
                    <Td>
                      <span className="flex items-center gap-2.5">
                        <span className={`w-14 font-semibold ${c.occ === 'over' ? 'text-v-danger' : c.occ === 'high' ? 'text-v-warning' : ''}`}>{c.students}<span className="font-normal text-v-subtle"> / {c.capacity}</span></span>
                        <span className="hidden w-16 lg:block"><Bar value={(c.students / c.capacity) * 100} tone={occColor[c.occ]} /></span>
                      </span>
                    </Td>
                    <Td><span className={`font-semibold ${c.attendance != null && c.attendance < 88 ? 'text-v-danger' : ''}`}>{fmtPct(c.attendance)}</span></Td>
                    <Td>{c.alerts ? <Badge tone="warning">{c.alerts}</Badge> : <span className="text-v-subtle">0</span>}</Td>
                    <Td>{c.subjects || <Badge tone="danger">Sin plan</Badge>}</Td>
                    <Td>{c.uncovered ? <Badge tone="danger">{c.uncovered}</Badge> : <span className="text-v-subtle">0</span>}</Td>
                    <Td><span className="v-display font-bold">{fmtScore(c.avg)}</span></Td>
                    <Td className="text-right"><Link href={`/direccion/cursos/${c.id}`} aria-label={`Abrir ${c.name}`} className="inline-flex text-v-subtle hover:text-v-accent"><ChevronRight size={16} /></Link></Td>
                  </tr>
                )))}
              </tbody>
            </Table>
          )}
        </Card>
      )}
    </>
  )
}
