import Link from 'next/link'
import {
  Activity, AlertTriangle, ArrowRight, BookOpen, CalendarCheck, CheckCircle2, ChevronRight, ClipboardList, GraduationCap, HeartHandshake, IdCard, Layers,
  MailPlus, School, ShieldCheck, Trash2, UserRound, Users,
} from 'lucide-react'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { requireSession } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { listMembers } from '@/lib/data/people'
import { firstName, fmtDateTime, fmtPct } from '@/lib/format'
import { AUDIT_LABEL } from '@/lib/audit'
import { Card, CardBody, CardHeader, EmptyState, Stat, StatGrid } from '@/components/ui/primitives'
import { Bar, Chip, Hero, Ring, Row, Stacked } from '@/components/ui/motion'

type Task = { tone: 'danger' | 'warning' | 'accent'; icon: React.ReactNode; count: number; title: string; detail: string; href: string }
const STAGES = [['parvularia', 'Parvularia'], ['basica', 'Básica'], ['media', 'Media']] as const
const TONE = { danger: 'bg-v-danger/10 text-v-danger', warning: 'bg-v-warning/15 text-v-warning', accent: 'bg-v-accent-soft text-v-accent' }

export default async function AdminHome() {
  const session = await requireSession('admin')
  const db = await createClient()
  const inst = session.institutionId
  const now = new Date().toISOString()
  const [members, { data: levels }, { data: courseRows }, { data: plan }, { data: teaching }, { data: enrollmentRows }, { data: links }, { data: records },
    invitations, deletions, alumni, { data: periods }, { data: audit }] = await Promise.all([
    listMembers(db, inst),
    db.from('grade_levels').select('id, name, stage, sort_order').eq('institution_id', inst).order('sort_order'),
    db.from('courses').select('id, name, section, capacity, grade_level_id, head_teacher_id').eq('is_archived', false).eq('institution_id', inst),
    db.from('course_subjects').select('course_id, subject_id').eq('institution_id', inst),
    db.from('teacher_assignments').select('course_id, subject_id, teacher_id').eq('institution_id', inst),
    fetchAll((a, b) => db.from('course_enrollments').select('course_id, student_id, continuity').eq('institution_id', inst).eq('status', 'active').order('id').range(a, b)),
    fetchAll((a, b) => db.from('guardian_student_links').select('guardian_id, student_id').eq('institution_id', inst).order('id').range(a, b)),
    fetchAll((a, b) => db.from('person_records').select('user_id, national_id, address, emergency_phone').eq('institution_id', inst).order('user_id').range(a, b)),
    db.from('invitations').select('id', { count: 'exact', head: true }).eq('institution_id', inst).is('accepted_at', null).is('revoked_at', null).gt('expires_at', now),
    db.from('deletion_requests').select('id', { count: 'exact', head: true }).eq('institution_id', inst).eq('status', 'pending'),
    db.from('alumni').select('student_id').eq('institution_id', inst),
    db.from('academic_periods').select('name, year, is_current').eq('institution_id', inst),
    db.from('audit_logs').select('id, action, created_at, actor_id').eq('institution_id', inst).eq('sensitive', false).order('created_at', { ascending: false }).limit(6),
  ])

  const L = levels ?? [], C = courseRows ?? []
  const liveCourses = new Set(C.map(c => c.id as string))
  const E = (enrollmentRows ?? []).filter(e => liveCourses.has(e.course_id as string))
  const active = members.filter(m => m.status === 'active')
  const byRole = (role: string) => active.filter(m => m.role === role)
  const names = new Map(members.map(m => [m.userId, m.fullName]))
  const current = (periods ?? []).find(p => p.is_current)
  const alumniIds = new Set((alumni.data ?? []).map(a => a.student_id as string))

  // ── Personas ──
  const students = byRole('estudiante').filter(s => !alumniIds.has(s.userId))
  const enrolledIds = new Set(E.map(e => e.student_id as string))
  const unenrolled = students.filter(s => !enrolledIds.has(s.userId))
  const linkedStudents = new Set((links ?? []).map(l => l.student_id as string)), linkedGuardians = new Set((links ?? []).map(l => l.guardian_id as string))
  const withoutGuardian = students.filter(s => !linkedStudents.has(s.userId))
  const guardiansAlone = byRole('apoderado').filter(g => !linkedGuardians.has(g.userId))
  const recordOf = new Map((records ?? []).map(r => [r.user_id as string, r]))
  const complete = (m: (typeof members)[number]) => {
    const r = recordOf.get(m.userId)
    return !!(r?.national_id && r.address && m.birthDate && m.phone && (m.role !== 'estudiante' || r.emergency_phone))
  }
  const files: { label: string; total: number; done: number }[] = ([['estudiante', 'Estudiantes'], ['docente', 'Docentes'], ['apoderado', 'Apoderados']] as const).map(([role, label]) => {
    const own = byRole(role)
    return { label, total: own.length, done: own.filter(complete).length }
  })
  const team = active.filter(m => ['admin', 'directivo', 'bienestar'].includes(m.role))
  files.push({ label: 'Equipo del colegio', total: team.length, done: team.filter(complete).length })
  const incomplete = active.filter(m => !complete(m)).length

  // ── Estructura académica ──
  const sections = C.map(c => {
    const own = (plan ?? []).filter(p => p.course_id === c.id)
    return {
      id: c.id as string, name: c.name as string, levelId: c.grade_level_id as string, capacity: c.capacity as number, head: c.head_teacher_id as string | null,
      students: E.filter(e => e.course_id === c.id).length, plan: own.length,
      covered: own.filter(p => (teaching ?? []).some(t => t.course_id === c.id && t.subject_id === p.subject_id)).length,
    }
  })
  const planned = sections.reduce((n, s) => n + s.plan, 0), covered = sections.reduce((n, s) => n + s.covered, 0)
  const withoutPlan = sections.filter(s => s.plan === 0)
  const withoutHead = sections.filter(s => !s.head)
  const over = sections.filter(s => s.students > s.capacity)
  const capacity = sections.reduce((n, s) => n + s.capacity, 0)
  const grades = L.map(l => {
    const own = sections.filter(s => s.levelId === l.id)
    return { id: l.id as string, name: l.name as string, stage: l.stage as string, sections: own.length, students: own.reduce((n, s) => n + s.students, 0), capacity: own.reduce((n, s) => n + s.capacity, 0) }
  })

  // ── Continuidad para el año siguiente ──
  const lastLevel = L[L.length - 1]?.id
  const levelOf = new Map(sections.map(s => [s.id, s.levelId]))
  const cont = (v: string) => E.filter(e => e.continuity === v)
  const graduating = cont('promote').filter(e => levelOf.get(e.course_id as string) === lastLevel).length
  const continuity = [
    { label: 'Continúan', value: cont('promote').length - graduating, className: 'bg-v-success' },
    { label: 'Egresan', value: graduating, className: 'bg-v-accent' },
    { label: 'Repiten', value: cont('repeat').length, className: 'bg-v-warning' },
    { label: 'No continúan', value: cont('leave').length, className: 'bg-v-subtle' },
    { label: 'Sin decidir', value: cont('pending').length, className: 'bg-v-danger/60' },
  ]

  // ── Lo que secretaría tiene pendiente ──
  const one = (n: number, singular: string, plural: string) => (n === 1 ? singular : plural)
  const tasks = ([
    unenrolled.length && { tone: 'danger', icon: <GraduationCap size={16} />, count: unenrolled.length, title: one(unenrolled.length, 'Estudiante sin matrícula', 'Estudiantes sin matrícula'), detail: 'Tienen cuenta pero no curso: no ven tareas, notas ni asistencia.', href: '/admin/matriculas' },
    withoutPlan.length && { tone: 'danger', icon: <Layers size={16} />, count: withoutPlan.length, title: one(withoutPlan.length, 'Sección sin plan de asignaturas', 'Secciones sin plan de asignaturas'), detail: withoutPlan.slice(0, 4).map(s => s.name).join(' · '), href: '/admin/academico' },
    (planned - covered) && { tone: 'warning', icon: <BookOpen size={16} />, count: planned - covered, title: one(planned - covered, 'Asignatura sin docente', 'Asignaturas sin docente'), detail: 'Asignaturas del plan de una sección que nadie imparte todavía.', href: '/admin/academico' },
    over.length && { tone: 'warning', icon: <Users size={16} />, count: over.length, title: one(over.length, 'Sección sobre su capacidad', 'Secciones sobre su capacidad'), detail: over.slice(0, 4).map(s => `${s.name} (${s.students}/${s.capacity})`).join(' · '), href: '/admin/matriculas' },
    withoutGuardian.length && { tone: 'warning', icon: <HeartHandshake size={16} />, count: withoutGuardian.length, title: one(withoutGuardian.length, 'Estudiante sin apoderado vinculado', 'Estudiantes sin apoderado vinculado'), detail: 'Nadie de su familia puede ver su información.', href: '/admin/usuarios?rol=estudiante' },
    incomplete && { tone: 'warning', icon: <IdCard size={16} />, count: incomplete, title: one(incomplete, 'Ficha incompleta', 'Fichas incompletas'), detail: 'Falta RUN, nacimiento, teléfono, domicilio o contacto de emergencia.', href: '/admin/usuarios?ficha=incompleta' },
    cont('pending').length && { tone: 'accent', icon: <CalendarCheck size={16} />, count: cont('pending').length, title: 'Decisiones de continuidad pendientes', detail: 'Estudiantes sin confirmar para el próximo año.', href: '/admin/matriculas?tab=cierre' },
    withoutHead.length && { tone: 'accent', icon: <UserRound size={16} />, count: withoutHead.length, title: one(withoutHead.length, 'Sección sin profesor jefe', 'Secciones sin profesor jefe'), detail: withoutHead.slice(0, 4).map(s => s.name).join(' · '), href: '/admin/academico' },
    guardiansAlone.length && { tone: 'accent', icon: <HeartHandshake size={16} />, count: guardiansAlone.length, title: one(guardiansAlone.length, 'Apoderado sin estudiantes', 'Apoderados sin estudiantes'), detail: 'Su cuenta no muestra información de nadie.', href: '/admin/usuarios?rol=apoderado' },
    (invitations.count ?? 0) && { tone: 'accent', icon: <MailPlus size={16} />, count: invitations.count ?? 0, title: one(invitations.count ?? 0, 'Invitación sin aceptar', 'Invitaciones sin aceptar'), detail: 'Personas invitadas que aún no activan su cuenta.', href: '/admin/usuarios?tab=invitaciones' },
    (deletions.count ?? 0) && { tone: 'accent', icon: <Trash2 size={16} />, count: deletions.count ?? 0, title: one(deletions.count ?? 0, 'Solicitud de eliminación por resolver', 'Solicitudes de eliminación por resolver'), detail: 'Esperan que se anonimice o se rechace.', href: '/admin/usuarios?tab=eliminaciones' },
  ] as (Task | 0 | false)[]).filter((t): t is Task => !!t)

  return (
    <>
      <Hero name={firstName(session.fullName)} subtitle={`Lo que secretaría mantiene al día en ${session.institutionName}: personas, cursos y matrículas.`}
        chips={<>
          {current && <Chip icon={<CalendarCheck size={12} />}>{current.name} {current.year}</Chip>}
          {tasks.length > 0
            ? <Chip tone={tasks.some(t => t.tone === 'danger') ? 'danger' : 'warning'} icon={<AlertTriangle size={12} />}>{tasks.length} {tasks.length === 1 ? 'tarea pendiente' : 'tareas pendientes'}</Chip>
            : <Chip tone="success" icon={<CheckCircle2 size={12} />}>Todo al día</Chip>}
        </>} />

      <StatGrid>
        <Stat href="/admin/matriculas" label="Estudiantes matriculados" value={enrolledIds.size} hint={unenrolled.length ? `${unenrolled.length} sin matrícula` : `de ${capacity} cupos`} icon={<GraduationCap size={18} />} tone={unenrolled.length ? 'warning' : 'accent'} />
        <Stat href="/admin/usuarios?rol=docente" label="Docentes" value={byRole('docente').length} hint={`${covered} de ${planned} asignaturas con docente`} icon={<Users size={18} />} tone={covered < planned ? 'warning' : 'accent'} />
        <Stat href="/admin/usuarios?rol=apoderado" label="Apoderados" value={byRole('apoderado').length} hint={withoutGuardian.length ? `${withoutGuardian.length} estudiantes sin apoderado` : 'Todos los estudiantes vinculados'} icon={<HeartHandshake size={18} />} tone="success" />
        <Stat href="/admin/academico" label="Secciones" value={sections.length} hint={`en ${grades.filter(g => g.sections > 0).length} grados · ${fmtPct(capacity ? (enrolledIds.size / capacity) * 100 : null)} de ocupación`} icon={<School size={18} />} />
      </StatGrid>

      <div className="mb-4 grid grid-cols-1 items-stretch gap-4 xl:grid-cols-[1.35fr_1fr]">
        <Card index={4} className="flex flex-col">
          <CardHeader icon={<ClipboardList size={15} />} tone="warning" title="Pendientes de secretaría" description={tasks.length ? 'De lo más urgente a lo menos urgente. Cada fila lleva a donde se resuelve.' : 'No hay nada por ordenar'} />
          {tasks.length === 0 ? <EmptyState aria={2} title="Todo al día" description="Personas, cursos y matrículas están completos." /> : (
            <ul className="max-h-[430px] space-y-0.5 overflow-y-auto px-3 pb-4">
              {tasks.map((t, i) => (
                <Row key={t.title} index={i} className="rounded-v-sm hover:bg-v-fill">
                  <Link href={t.href} className="flex items-center gap-3.5 px-2 py-2.5">
                    <span className={`grid size-10 shrink-0 place-items-center rounded-[30%] ${TONE[t.tone]}`}>{t.icon}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-[14px] font-semibold">{t.title}</span><span className="block truncate text-xs text-v-muted">{t.detail}</span></span>
                    <span className={`v-display shrink-0 text-2xl font-bold tabular-nums ${t.tone === 'danger' ? 'text-v-danger' : t.tone === 'warning' ? 'text-v-warning' : 'text-v-text'}`}>{t.count}</span>
                    <ChevronRight size={16} className="shrink-0 text-v-subtle" />
                  </Link>
                </Row>
              ))}
            </ul>
          )}
        </Card>

        <Card index={5} className="flex flex-col">
          <CardHeader icon={<School size={15} />} title="Matrícula por grado" description={`${enrolledIds.size} estudiantes en ${sections.length} secciones`}
            actions={<Link href="/admin/matriculas" className="inline-flex items-center gap-1 text-xs font-semibold text-v-accent hover:underline">Matrículas <ArrowRight size={12} /></Link>} />
          {sections.length === 0 ? <EmptyState aria={4} title="Aún no hay secciones" description="Créalas en Gestión académica." /> : (
            <div className="max-h-[430px] overflow-y-auto pb-3">
              {STAGES.filter(([stage]) => grades.some(g => g.stage === stage && g.sections > 0)).map(([stage, label]) => {
                const own = grades.filter(g => g.stage === stage && g.sections > 0)
                return (
                  <div key={stage}>
                    <p className="flex justify-between bg-v-fill/60 px-5 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-v-subtle"><span>{label}</span><span>{own.reduce((n, g) => n + g.students, 0)} estudiantes</span></p>
                    <ul className="space-y-3 px-5 py-3">
                      {own.map(g => (
                        <li key={g.id}>
                          <div className="mb-1.5 flex items-center justify-between gap-2 text-[13px]">
                            <span className="min-w-0 truncate"><span className="font-semibold">{g.name}</span><span className="ml-1.5 text-[11px] text-v-subtle">{g.sections} {g.sections === 1 ? 'sección' : 'secciones'}</span></span>
                            <span className="shrink-0 tabular-nums text-v-muted"><span className="font-semibold text-v-text">{g.students}</span> / {g.capacity}</span>
                          </div>
                          <Bar value={g.capacity ? (g.students / g.capacity) * 100 : 0} tone={g.students > g.capacity ? 'danger' : g.students / g.capacity > 0.9 ? 'warning' : 'brand'} />
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
              {grades.some(g => g.sections === 0) && <p className="px-5 pt-1 text-xs text-v-subtle">{grades.filter(g => g.sections === 0).length} grados aún no tienen secciones.</p>}
            </div>
          )}
        </Card>
      </div>

      <div className="mb-4 grid grid-cols-1 items-stretch gap-4 lg:grid-cols-3">
        <Card index={6} className="flex flex-col">
          <CardHeader icon={<IdCard size={15} />} title="Fichas personales" description="Con RUN, nacimiento, teléfono y domicilio"
            actions={<Link href="/admin/usuarios?ficha=incompleta" className="inline-flex items-center gap-1 text-xs font-semibold text-v-accent hover:underline">Completar <ArrowRight size={12} /></Link>} />
          <CardBody className="flex flex-1 flex-col justify-between gap-3.5">
            {files.map((f, i) => (
              <div key={f.label}>
                <div className="mb-1.5 flex items-center justify-between text-[13px]"><span className="font-medium">{f.label}</span><span className="tabular-nums text-v-muted"><span className="font-semibold text-v-text">{f.done}</span> de {f.total} completas</span></div>
                <Bar value={f.total ? (f.done / f.total) * 100 : 0} tone={f.total && f.done === f.total ? 'success' : f.done === 0 ? 'warning' : 'brand'} delay={0.3 + i * 0.07} />
              </div>
            ))}
          </CardBody>
        </Card>

        <Card index={7} className="flex flex-col">
          <CardHeader icon={<BookOpen size={15} />} title="Cobertura docente" description="Asignaturas de los planes con docente asignado"
            actions={<Link href="/admin/academico" className="inline-flex items-center gap-1 text-xs font-semibold text-v-accent hover:underline">Asignar <ArrowRight size={12} /></Link>} />
          <CardBody className="flex flex-1 flex-col justify-center">
            <div className="flex items-center gap-4">
              <Ring value={planned ? (covered / planned) * 100 : null} size={88} />
              <div className="min-w-0">
                <p className="v-display text-2xl font-bold leading-none tabular-nums">{covered}<span className="ml-1.5 text-sm font-medium text-v-subtle">de {planned}</span></p>
                <p className="mt-1 text-xs text-v-muted">asignaturas con docente</p>
              </div>
            </div>
            <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
              {[['Sin docente', planned - covered], ['Sin plan', withoutPlan.length], ['Sin jefatura', withoutHead.length]].map(([label, value]) => (
                <div key={label as string} className="rounded-v-sm bg-v-fill px-1 py-2.5"><dt className="truncate text-[10.5px] font-medium text-v-subtle">{label}</dt><dd className={`v-display mt-0.5 text-xl font-bold tabular-nums ${value ? 'text-v-warning' : ''}`}>{value}</dd></div>
              ))}
            </dl>
          </CardBody>
        </Card>

        <Card index={8} className="flex flex-col">
          <CardHeader icon={<CalendarCheck size={15} />} tone="success" title={`Continuidad ${current ? (current.year as number) + 1 : ''}`} description={`${E.length} matrículas vigentes · ${alumniIds.size} exalumnos`}
            actions={<Link href="/admin/matriculas?tab=cierre" className="inline-flex items-center gap-1 text-xs font-semibold text-v-accent hover:underline">Revisar <ArrowRight size={12} /></Link>} />
          <CardBody className="flex flex-1 flex-col justify-center">
            {E.length === 0 ? <p className="text-[13px] text-v-muted">Aún no hay matrículas en el periodo vigente.</p> : (
              <>
                <Stacked height={12} segments={continuity} />
                <ul className="mt-4 space-y-2">
                  {continuity.map(c => (
                    <li key={c.label} className="flex items-center justify-between text-[13px]">
                      <span className="inline-flex items-center gap-2 font-medium"><span className={`size-2.5 rounded-sm ${c.className}`} />{c.label}</span>
                      <span className="tabular-nums text-v-muted"><span className="font-semibold text-v-text">{c.value}</span> · {fmtPct((c.value / E.length) * 100)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </CardBody>
        </Card>
      </div>

      <Card index={9}>
        <CardHeader icon={<Activity size={15} />} title="Últimos movimientos" description="Lo más reciente que se registró en usuarios, cursos y matrículas" />
        {(audit ?? []).length === 0 ? <EmptyState title="Sin movimientos registrados" /> : (
          <ul className="grid gap-x-4 gap-y-0.5 px-3 pb-4 lg:grid-cols-2">
            {(audit ?? []).map((a, i) => (
              <Row key={a.id} index={i} className="flex items-center gap-3 rounded-v-sm px-2 py-2 text-[13px] hover:bg-v-fill">
                <span className="grid size-8 shrink-0 place-items-center rounded-[30%] bg-v-accent-soft text-v-accent"><ShieldCheck size={14} /></span>
                <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{AUDIT_LABEL[a.action] ?? a.action}</span><span className="block truncate text-[11px] text-v-subtle">{names.get(a.actor_id) ?? 'Sistema'}</span></span>
                <span className="shrink-0 text-xs text-v-subtle">{fmtDateTime(a.created_at)}</span>
              </Row>
            ))}
          </ul>
        )}
      </Card>
    </>
  )
}
