import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  AlertTriangle, ArrowLeft, BookOpen, CalendarCheck, CalendarDays, ClipboardCheck, ClipboardList, GraduationCap, HeartPulse, Home, IdCard, Link2, LogOut,
  Mail, Phone, Plus, ShieldCheck, Trash2, TrendingUp, UserCheck, UserMinus, UserX, Users,
} from 'lucide-react'
import { requireSession } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { listMembers, STATUS_LABEL } from '@/lib/data/people'
import { assignmentStats, loadSnapshot } from '@/lib/data/academic'
import { changeRole, linkGuardian, requestDeletion, revokeSessions, setMemberStatus, unlinkGuardian, updateUser } from '@/lib/actions/admin'
import { addIncident, deleteIncident, savePersonRecord } from '@/lib/actions/people'
import { ROLE_LABEL, ROLES } from '@/lib/roles'
import { ATTENDANCE_LABEL, attendanceRate, average, fmtDate, fmtPct, fmtScore, scoreTone, todayISO } from '@/lib/format'
import { Avatar, Badge, Card, CardBody, CardHeader, EmptyState, Field, Input, Notice, Select, StatStrip, Table, Td, Textarea, Th, type Tone } from '@/components/ui/primitives'
import { ConfirmAction, FormDialog, InlineForm, SubmitButton } from '@/components/ui/dialog'
import { Tabs } from '@/components/ui/filters'
import { Bar, Reveal, Stacked } from '@/components/ui/motion'

type Record_ = {
  national_id: string | null; gender: string | null; nationality: string | null; address: string | null; commune: string | null
  emergency_name: string | null; emergency_phone: string | null; emergency_relation: string | null; admission_date: string | null
  job_title: string | null; specialty: string | null; notes: string | null; updated_at: string | null
}
const GENDER: Record<string, string> = { femenino: 'Femenino', masculino: 'Masculino', otro: 'Otro', no_informa: 'No informa' }
const INCIDENT: Record<string, { label: string; tone: Tone }> = { positiva: { label: 'Positiva', tone: 'success' }, negativa: { label: 'Negativa', tone: 'danger' }, informativa: { label: 'Informativa', tone: 'accent' } }
const CATEGORY: Record<string, string> = { conducta: 'Conducta', responsabilidad: 'Responsabilidad', convivencia: 'Convivencia', academico: 'Académico', otro: 'Otro' }
const barTone = (v: number | null) => (v == null ? 'neutral' : v < 4 ? 'danger' : v < 5 ? 'warning' : v < 6 ? 'brand' : 'success')
const age = (birth: string | null) => {
  if (!birth) return null
  const [y, m, d] = birth.split('-').map(Number), [ty, tm, td] = todayISO().split('-').map(Number)
  return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0)
}

/** Dato de la ficha: etiqueta pequeña y valor; lo que falta se marca en vez de dejarse en blanco. */
function Fact({ icon, label, value }: { icon?: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      {icon && <span className="grid size-8 shrink-0 place-items-center rounded-[30%] bg-v-accent-soft text-v-accent">{icon}</span>}
      <div className="min-w-0">
        <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-v-subtle">{label}</dt>
        <dd className="mt-0.5 break-words text-[13.5px] text-v-text">{value || <span className="text-v-subtle">Sin registrar</span>}</dd>
      </div>
    </div>
  )
}

export default async function UserDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const session = await requireSession('admin')
  const { id } = await params
  const sp = await searchParams
  const db = await createClient()
  const inst = session.institutionId
  const members = await listMembers(db, inst)
  const user = members.find(m => m.userId === id)
  if (!user) notFound()

  const isSelf = user.userId === session.userId
  const isStudent = user.role === 'estudiante', isTeacher = user.role === 'docente', isGuardian = user.role === 'apoderado'
  const [snap, { data: recordRow }, { data: linkRows }, { data: teachingRows }, { data: headRows }, { data: incidentRows }] = await Promise.all([
    loadSnapshot(db, inst),
    db.from('person_records').select('*').eq('institution_id', inst).eq('user_id', id).maybeSingle(),
    db.from('guardian_student_links').select('id, guardian_id, student_id, relationship').eq('institution_id', inst).or(`guardian_id.eq.${id},student_id.eq.${id}`),
    isTeacher ? db.from('teacher_assignments').select('course_id, subject_id').eq('institution_id', inst).eq('teacher_id', id) : Promise.resolve({ data: [] as { course_id: string; subject_id: string }[] }),
    isTeacher ? db.from('courses').select('id, name').eq('is_archived', false).eq('institution_id', inst).eq('head_teacher_id', id) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    isStudent ? db.from('student_incidents').select('id, kind, category, description, occurred_on, recorded_by').eq('institution_id', inst).eq('student_id', id).order('occurred_on', { ascending: false })
      : Promise.resolve({ data: [] as { id: string; kind: string; category: string; description: string; occurred_on: string; recorded_by: string }[] }),
  ])
  const record = (recordRow ?? {}) as Partial<Record_>
  const links = linkRows ?? [], teaching = teachingRows ?? [], incidents = incidentRows ?? []
  const byId = new Map(members.map(m => [m.userId, m]))
  const courseName = new Map(snap.courses.map(c => [c.id, c.name])), subjectName = new Map(snap.subjects.map(s => [s.id, s.name]))
  const linkable = members.filter(m => m.status === 'active' && m.role === (isGuardian ? 'estudiante' : 'apoderado'))
  const now = Date.now()

  // ── Situación académica de un estudiante (también se usa para los pupilos de un apoderado) ──
  const studentFile = (studentId: string) => {
    const courseId = snap.enrollments.find(e => e.student_id === studentId)?.course_id ?? null
    const grades = snap.grades.filter(g => g.student_id === studentId)
    const attendance = snap.attendance.filter(a => a.student_id === studentId)
    const due = snap.assignments.filter(a => a.course_id === courseId && new Date(a.due_at).getTime() < now)
    const missing = due.filter(a => !snap.submissions.some(s => s.assignment_id === a.id && s.student_id === studentId))
    const subjects = [...new Set(grades.map(g => g.subject_id))].map(sid => {
      const scores = grades.filter(g => g.subject_id === sid).map(g => g.score)
      return { id: sid, name: subjectName.get(sid) ?? 'Asignatura', average: average(scores)!, count: scores.length, min: Math.min(...scores), max: Math.max(...scores) }
    }).sort((a, b) => a.average - b.average)
    return { courseId, course: courseId ? courseName.get(courseId) ?? null : null, grades, attendance, due, missing, subjects, average: average(grades.map(g => g.score)), rate: attendanceRate(attendance) }
  }
  const file = isStudent ? studentFile(id) : null
  const evaluations = file ? file.grades.map(g => ({ score: g.score, subject: subjectName.get(g.subject_id) ?? '', assignment: snap.assignments.find(a => a.id === g.assignment_id) }))
    .sort((a, b) => (b.assignment?.due_at ?? '').localeCompare(a.assignment?.due_at ?? '')) : []
  const attendanceCount = (status: string) => file?.attendance.filter(a => a.status === status).length ?? 0

  // ── Docencia ──
  const groups = teaching.map(t => {
    const stats = assignmentStats(snap, t.course_id, t.subject_id)
    const scores = snap.grades.filter(g => g.course_id === t.course_id && g.subject_id === t.subject_id).map(g => g.score)
    return { courseId: t.course_id, course: courseName.get(t.course_id) ?? '', subject: subjectName.get(t.subject_id) ?? '', students: snap.enrollments.filter(e => e.course_id === t.course_id).length,
      tasks: stats.length, pending: stats.reduce((n, a) => n + a.pendingReview, 0), average: average(scores) }
  }).sort((a, b) => a.course.localeCompare(b.course, 'es') || a.subject.localeCompare(b.subject, 'es'))
  const teacherStudents = new Set(snap.enrollments.filter(e => teaching.some(t => t.course_id === e.course_id)).map(e => e.student_id)).size

  // ── Ficha: qué falta ──
  const expected: [string, unknown][] = [['RUN', record.national_id], ['fecha de nacimiento', user.birthDate], ['teléfono', user.phone], ['domicilio', record.address],
    ...(isStudent ? [['contacto de emergencia', record.emergency_phone], ['apoderado vinculado', links.length || null]] as [string, unknown][] : []),
    ...(isTeacher ? [['título o cargo', record.job_title]] as [string, unknown][] : [])]
  const missingFacts = expected.filter(([, v]) => !v).map(([k]) => k)

  const tabs = [
    { id: 'resumen', label: 'Resumen' },
    { id: 'datos', label: 'Datos personales' },
    ...(isStudent ? [{ id: 'academico', label: 'Notas y asistencia' }, { id: 'incidencias', label: 'Incidencias', count: incidents.length }] : []),
    ...(isTeacher ? [{ id: 'docencia', label: 'Cursos y asignaturas', count: groups.length }] : []),
    ...(isStudent || isGuardian ? [{ id: 'familia', label: isGuardian ? 'Estudiantes a cargo' : 'Apoderados', count: links.length }] : []),
    { id: 'cuenta', label: 'Cuenta y acceso' },
  ]
  const tab = tabs.some(t => t.id === sp.tab) ? sp.tab! : 'resumen'
  const years = age(user.birthDate)

  const personal = (
    <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
      <Fact icon={<IdCard size={15} />} label="RUN" value={record.national_id} />
      <Fact icon={<CalendarDays size={15} />} label="Fecha de nacimiento" value={user.birthDate ? `${fmtDate(user.birthDate)}${years != null ? ` · ${years} años` : ''}` : null} />
      <Fact icon={<Mail size={15} />} label="Correo de acceso" value={user.email} />
      <Fact icon={<Phone size={15} />} label="Teléfono" value={user.phone} />
      <Fact icon={<Home size={15} />} label="Domicilio" value={[record.address, record.commune].filter(Boolean).join(', ')} />
      <Fact icon={<Users size={15} />} label="Género y nacionalidad" value={[record.gender ? GENDER[record.gender] : null, record.nationality].filter(Boolean).join(' · ')} />
      {isStudent && <Fact icon={<HeartPulse size={15} />} label="Contacto de emergencia" value={record.emergency_name ? `${record.emergency_name}${record.emergency_relation ? ` (${record.emergency_relation})` : ''}${record.emergency_phone ? ` · ${record.emergency_phone}` : ''}` : null} />}
      {!isStudent && !isGuardian && <Fact icon={<BookOpen size={15} />} label="Cargo o título" value={[record.job_title, record.specialty].filter(Boolean).join(' · ')} />}
      <Fact icon={<CalendarCheck size={15} />} label="Ingreso al colegio" value={record.admission_date ? fmtDate(record.admission_date) : `Cuenta creada el ${fmtDate(user.createdAt)}`} />
    </dl>
  )

  const subjectBars = file && (file.subjects.length === 0 ? <EmptyState title="Aún no tiene notas registradas" /> : (
    <ul className="space-y-3.5">
      {file.subjects.map((s, i) => (
        <li key={s.id}>
          <div className="mb-1.5 flex items-center justify-between gap-2 text-[13px]">
            <span className="min-w-0 truncate"><span className="font-semibold">{s.name}</span><span className="ml-1.5 text-[11px] text-v-subtle">{s.count} {s.count === 1 ? 'nota' : 'notas'} · entre {fmtScore(s.min)} y {fmtScore(s.max)}</span></span>
            <span className={`v-display shrink-0 font-bold tabular-nums ${s.average < 4 ? 'text-v-danger' : ''}`}>{fmtScore(s.average)}</span>
          </div>
          <Bar value={((s.average - 1) / 6) * 100} tone={barTone(s.average)} delay={0.25 + i * 0.06} />
        </li>
      ))}
    </ul>
  ))

  const incidentList = (rows: typeof incidents) => (
    <ul className="divide-y divide-v-border">
      {rows.map(x => (
        <li key={x.id} className="flex items-start gap-3 px-5 py-3.5">
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-1.5"><Badge tone={INCIDENT[x.kind].tone}>{INCIDENT[x.kind].label}</Badge><Badge>{CATEGORY[x.category]}</Badge><span className="text-xs text-v-subtle">{fmtDate(x.occurred_on)} · registró {byId.get(x.recorded_by)?.fullName ?? 'el colegio'}</span></p>
            <p className="mt-1.5 whitespace-pre-wrap text-[13.5px] leading-relaxed text-v-text">{x.description}</p>
          </div>
          <ConfirmAction action={deleteIncident.bind(null, x.id)} title="Eliminar incidencia" danger confirmLabel="Eliminar" ariaLabel="Eliminar incidencia"
            message="La anotación se quitará de la hoja de vida del estudiante. La eliminación queda en la auditoría."><Trash2 size={14} /></ConfirmAction>
        </li>
      ))}
    </ul>
  )
  const addIncidentDialog = (
    <FormDialog trigger={<><Plus size={14} />Registrar incidencia</>} size="sm" title="Registrar incidencia" description={`Hoja de vida de ${user.fullName}`} action={addIncident.bind(null, id)} submitLabel="Registrar">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Tipo"><Select name="kind" defaultValue="informativa">{Object.entries(INCIDENT).map(([v, k]) => <option key={v} value={v}>{k.label}</option>)}</Select></Field>
        <Field label="Ámbito"><Select name="category" defaultValue="conducta">{Object.entries(CATEGORY).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
        <Field label="Fecha"><Input name="occurred_on" type="date" required defaultValue={todayISO()} max={todayISO()} /></Field>
      </div>
      <Field label="Qué ocurrió" hint="Describe hechos observables. No incluyas diagnósticos ni información de salud."><Textarea name="description" required minLength={3} maxLength={2000} rows={4} /></Field>
    </FormDialog>
  )

  return (
    <>
      <Link href="/admin/usuarios" className="mb-3 inline-flex items-center gap-1 text-[12.5px] font-medium text-v-muted hover:text-v-accent"><ArrowLeft size={14} />Volver a usuarios</Link>

      <Reveal className="relative mb-4 overflow-hidden rounded-v border border-v-border bg-v-elevated shadow-v">
        <span aria-hidden className="v-brand block h-20 opacity-95" />
        <div className="flex flex-wrap items-end gap-x-5 gap-y-3 px-5 pb-5 sm:px-6">
          <span className="-mt-10 rounded-full shadow-v-brand ring-4 ring-white"><Avatar name={user.fullName} size={88} id={user.userId} /></span>
          <div className="min-w-0 flex-1 basis-56 pt-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone="accent">{ROLE_LABEL[user.role]}</Badge>
              <Badge tone={user.status === 'active' ? 'success' : user.status === 'suspended' ? 'warning' : 'neutral'}>{STATUS_LABEL[user.status]}</Badge>
              {file?.course && <Badge><GraduationCap size={11} />{file.course}</Badge>}
              {isSelf && <Badge>Tu cuenta</Badge>}
            </div>
            <h1 className="v-headline mt-1.5 break-words text-[1.6rem] leading-tight sm:text-[1.75rem]">{user.fullName}</h1>
            <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-v-muted">
              <span className="inline-flex min-w-0 items-center gap-1.5 break-all"><Mail size={13} className="shrink-0 text-v-subtle" />{user.email ?? 'Sin correo'}</span>
              {user.phone && <span className="inline-flex items-center gap-1.5"><Phone size={13} className="text-v-subtle" />{user.phone}</span>}
              {record.national_id && <span className="inline-flex items-center gap-1.5"><IdCard size={13} className="text-v-subtle" />{record.national_id}</span>}
            </p>
          </div>
          {missingFacts.length > 0
            ? <Link href="?tab=datos" scroll={false} className="inline-flex items-center gap-1.5 rounded-full bg-v-warning/15 px-3 py-1.5 text-xs font-semibold text-[#a16207]"><AlertTriangle size={13} />Faltan {missingFacts.length} {missingFacts.length === 1 ? 'dato' : 'datos'} en la ficha</Link>
            : <span className="inline-flex items-center gap-1.5 rounded-full bg-v-success/15 px-3 py-1.5 text-xs font-semibold text-[#157a4b]"><ShieldCheck size={13} />Ficha completa</span>}
        </div>
      </Reveal>

      <Tabs tabs={tabs} />

      {/* ── Resumen ── */}
      {tab === 'resumen' && (
        <>
          {file && (
            <StatStrip items={[
              { label: 'Promedio general', value: fmtScore(file.average), hint: `${file.grades.length} notas`, icon: <TrendingUp size={15} />, href: '?tab=academico' },
              { label: 'Asistencia', value: fmtPct(file.rate), hint: `${attendanceCount('absent')} ausencias`, icon: <CalendarCheck size={15} />, tone: file.rate != null && file.rate < 85 ? 'danger' : 'success', href: '?tab=academico' },
              { label: 'Entregas pendientes', value: file.missing.length, hint: `de ${file.due.length} vencidas`, icon: <ClipboardCheck size={15} />, tone: file.missing.length >= 3 ? 'warning' : 'accent', href: '?tab=academico' },
              { label: 'Incidencias', value: incidents.length, hint: `${incidents.filter(x => x.kind === 'negativa').length} negativas`, icon: <ClipboardList size={15} />, tone: 'warning', href: '?tab=incidencias' },
            ]} />
          )}
          {isTeacher && (
            <StatStrip items={[
              { label: 'Asignaturas a cargo', value: groups.length, icon: <BookOpen size={15} />, href: '?tab=docencia' },
              { label: 'Cursos', value: new Set(groups.map(g => g.courseId)).size, hint: (headRows ?? []).length ? `jefatura de ${(headRows ?? []).map(c => c.name).join(', ')}` : 'sin jefatura', icon: <GraduationCap size={15} /> },
              { label: 'Estudiantes', value: teacherStudents, icon: <Users size={15} />, tone: 'success' },
              { label: 'Entregas por corregir', value: groups.reduce((n, g) => n + g.pending, 0), icon: <ClipboardCheck size={15} />, tone: 'warning' },
            ]} />
          )}
          <div className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-2">
            <Card index={2} className="flex flex-col">
              <CardHeader icon={<IdCard size={15} />} title="Datos personales" actions={<Link href="?tab=datos" scroll={false} className="text-xs font-semibold text-v-accent hover:underline">Editar ficha</Link>} />
              <CardBody className="flex-1">{personal}</CardBody>
            </Card>
            {file ? (
              <Card index={3} className="flex flex-col">
                <CardHeader icon={<TrendingUp size={15} />} title="Notas por asignatura" description={file.course ?? 'Sin curso asignado'} actions={<Link href="?tab=academico" scroll={false} className="text-xs font-semibold text-v-accent hover:underline">Ver detalle</Link>} />
                <CardBody className="flex-1">{subjectBars}</CardBody>
              </Card>
            ) : isTeacher ? (
              <Card index={3} className="flex flex-col">
                <CardHeader icon={<BookOpen size={15} />} title="Cursos y asignaturas" actions={<Link href="?tab=docencia" scroll={false} className="text-xs font-semibold text-v-accent hover:underline">Ver detalle</Link>} />
                {groups.length === 0 ? <EmptyState title="Sin asignaturas asignadas" /> : (
                  <ul className="divide-y divide-v-border">
                    {groups.map(g => <li key={g.courseId + g.subject} className="flex items-center justify-between gap-3 px-5 py-2.5 text-[13.5px]"><span><span className="font-semibold">{g.subject}</span><span className="ml-2 text-v-muted">{g.course}</span></span><span className="text-xs text-v-subtle">{g.students} estudiantes</span></li>)}
                  </ul>
                )}
              </Card>
            ) : (
              <Card index={3} className="flex flex-col">
                <CardHeader icon={<Users size={15} />} title={isGuardian ? 'Estudiantes a su cargo' : 'En el colegio'} />
                <CardBody className="flex-1">
                  {isGuardian ? (links.length === 0 ? <Notice tone="warning">Sin estudiantes vinculados: este apoderado no ve información de nadie.</Notice> : (
                    <ul className="space-y-3">
                      {links.map(l => {
                        const pupil = byId.get(l.student_id), f = studentFile(l.student_id)
                        return (
                          <li key={l.id}><Link href={`/admin/usuarios/${l.student_id}`} className="flex items-center gap-3 rounded-v-sm border border-v-border p-3 hover:border-v-accent">
                            <Avatar name={pupil?.fullName ?? '?'} id={l.student_id} size={38} />
                            <span className="min-w-0 flex-1"><span className="block truncate text-[13.5px] font-semibold">{pupil?.fullName ?? 'Estudiante'}</span><span className="block text-xs text-v-muted">{f.course ?? 'Sin curso'} · {l.relationship}</span></span>
                            <span className="text-right text-xs text-v-muted"><span className="v-display block text-base font-bold text-v-text">{fmtScore(f.average)}</span>asist. {fmtPct(f.rate)}</span>
                          </Link></li>
                        )
                      })}
                    </ul>
                  )) : <p className="text-[13.5px] text-v-muted">{record.job_title ?? ROLE_LABEL[user.role]}. Cuenta creada el {fmtDate(user.createdAt)}.</p>}
                </CardBody>
              </Card>
            )}
          </div>
          {file && incidents.length > 0 && (
            <Card index={4} className="mt-4">
              <CardHeader icon={<ClipboardList size={15} />} tone="warning" title="Últimas incidencias" actions={<Link href="?tab=incidencias" scroll={false} className="text-xs font-semibold text-v-accent hover:underline">Ver todas</Link>} />
              {incidentList(incidents.slice(0, 2))}
            </Card>
          )}
        </>
      )}

      {/* ── Datos personales ── */}
      {tab === 'datos' && (
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
          <Card index={2}>
            <CardHeader icon={<IdCard size={15} />} title="Identificación y contacto" />
            <CardBody>
              <InlineForm action={updateUser.bind(null, id)} resetOnSuccess={false}>
                <div className="space-y-4">
                  <Field label="Nombre completo"><Input name="full_name" defaultValue={user.fullName} required minLength={3} /></Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Teléfono"><Input name="phone" defaultValue={user.phone ?? ''} placeholder="+56 9 …" /></Field>
                    <Field label="Fecha de nacimiento"><Input name="birth_date" type="date" defaultValue={user.birthDate ?? ''} /></Field>
                  </div>
                  <Field label="Correo de acceso" hint="Identifica la cuenta y no se edita desde aquí."><Input value={user.email ?? ''} disabled readOnly /></Field>
                  <div className="flex justify-end"><SubmitButton>Guardar</SubmitButton></div>
                </div>
              </InlineForm>
            </CardBody>
          </Card>
          <Card index={3}>
            <CardHeader icon={<ShieldCheck size={15} />} title="Ficha reservada" description="Solo la ven secretaría, dirección y la propia persona" />
            <CardBody>
              {missingFacts.length > 0 && <div className="mb-4"><Notice tone="warning">Falta registrar: {missingFacts.join(', ')}.</Notice></div>}
              <InlineForm action={savePersonRecord.bind(null, id)} resetOnSuccess={false}>
                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="RUN"><Input name="national_id" defaultValue={record.national_id ?? ''} maxLength={20} placeholder="12.345.678-9" /></Field>
                    <Field label="Género"><Select name="gender" defaultValue={record.gender ?? ''}><option value="">Sin registrar</option>{Object.entries(GENDER).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
                    <Field label="Nacionalidad"><Input name="nationality" defaultValue={record.nationality ?? ''} maxLength={60} /></Field>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
                    <Field label="Domicilio"><Input name="address" defaultValue={record.address ?? ''} maxLength={200} /></Field>
                    <Field label="Comuna"><Input name="commune" defaultValue={record.commune ?? ''} maxLength={80} /></Field>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="Contacto de emergencia"><Input name="emergency_name" defaultValue={record.emergency_name ?? ''} maxLength={160} /></Field>
                    <Field label="Parentesco"><Input name="emergency_relation" defaultValue={record.emergency_relation ?? ''} maxLength={40} /></Field>
                    <Field label="Teléfono de emergencia"><Input name="emergency_phone" defaultValue={record.emergency_phone ?? ''} maxLength={30} /></Field>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="Ingreso al colegio"><Input name="admission_date" type="date" defaultValue={record.admission_date ?? ''} /></Field>
                    {!isStudent && !isGuardian && <Field label="Cargo o título"><Input name="job_title" defaultValue={record.job_title ?? ''} maxLength={120} /></Field>}
                    {isTeacher && <Field label="Especialidad"><Input name="specialty" defaultValue={record.specialty ?? ''} maxLength={120} /></Field>}
                  </div>
                  <Field label="Observaciones administrativas" hint="No registres aquí información de salud ni de bienestar: tiene su propio espacio confidencial."><Textarea name="notes" rows={3} maxLength={2000} defaultValue={record.notes ?? ''} /></Field>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-v-subtle">{record.updated_at ? `Última actualización: ${fmtDate(record.updated_at)}` : 'Ficha sin registrar'}</span>
                    <SubmitButton>Guardar ficha</SubmitButton>
                  </div>
                </div>
              </InlineForm>
            </CardBody>
          </Card>
        </div>
      )}

      {/* ── Estudiante: notas y asistencia ── */}
      {tab === 'academico' && file && (
        <>
          <div className="mb-4 grid grid-cols-1 items-stretch gap-4 xl:grid-cols-2">
            <Card index={2} className="flex flex-col">
              <CardHeader icon={<TrendingUp size={15} />} title="Notas por asignatura" description={`${file.course ?? 'Sin curso asignado'} · promedio general ${fmtScore(file.average)}`}
                actions={<Link href="/admin/matriculas" className="text-xs font-semibold text-v-accent hover:underline">Gestionar matrícula</Link>} />
              <CardBody className="flex-1">{subjectBars}</CardBody>
            </Card>
            <Card index={3} className="flex flex-col">
              <CardHeader icon={<CalendarCheck size={15} />} tone="success" title="Asistencia" description={`${file.attendance.length} días registrados · ${fmtPct(file.rate)} de asistencia`} />
              <CardBody className="flex-1">
                {file.attendance.length === 0 ? <EmptyState title="Sin registros de asistencia" /> : (
                  <>
                    <Stacked height={12} segments={[{ label: 'Presente', value: attendanceCount('present'), className: 'bg-v-success' }, { label: 'Atraso', value: attendanceCount('late'), className: 'bg-v-warning' },
                      { label: 'Ausente', value: attendanceCount('absent'), className: 'bg-v-danger' }, { label: 'Justificado', value: attendanceCount('justified'), className: 'bg-v-subtle' }]} />
                    <dl className="mt-4 grid grid-cols-4 gap-2 text-center">
                      {(['present', 'late', 'absent', 'justified'] as const).map(k => (
                        <div key={k} className="rounded-v-sm bg-v-fill px-1 py-2.5"><dt className="truncate text-[10.5px] font-medium text-v-subtle">{ATTENDANCE_LABEL[k]}</dt><dd className={`v-display mt-0.5 text-xl font-bold tabular-nums ${k === 'absent' && attendanceCount(k) ? 'text-v-danger' : ''}`}>{attendanceCount(k)}</dd></div>
                      ))}
                    </dl>
                    <p className="mb-1.5 mt-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-v-subtle">Ausencias y atrasos recientes</p>
                    <ul className="space-y-1 text-[13px]">
                      {file.attendance.filter(a => a.status !== 'present').sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5).map(a => (
                        <li key={a.date + a.status} className="flex items-center justify-between"><span>{fmtDate(a.date)}</span><Badge tone={a.status === 'absent' ? 'danger' : a.status === 'late' ? 'warning' : 'neutral'}>{ATTENDANCE_LABEL[a.status]}</Badge></li>
                      ))}
                      {file.attendance.every(a => a.status === 'present') && <li className="text-v-muted">Sin ausencias ni atrasos.</li>}
                    </ul>
                  </>
                )}
              </CardBody>
            </Card>
          </div>
          <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[1.6fr_1fr]">
            <Card index={4}>
              <CardHeader icon={<ClipboardList size={15} />} title="Evaluaciones rendidas" description={`${evaluations.length} calificaciones`} />
              {evaluations.length === 0 ? <EmptyState title="Aún no tiene calificaciones" /> : (
                <Table>
                  <thead><tr><Th>Evaluación</Th><Th>Asignatura</Th><Th>Fecha</Th><Th>Nota</Th></tr></thead>
                  <tbody>
                    {evaluations.map((e, i) => (
                      <tr key={i} className="hover:bg-v-fill/50">
                        <Td><span className="block font-semibold">{e.assignment?.title ?? 'Calificación directa'}</span><span className="text-xs text-v-subtle">{e.assignment?.topic ?? 'Sin contenido indicado'}</span></Td>
                        <Td className="text-v-muted">{e.subject}</Td>
                        <Td className="whitespace-nowrap text-v-muted">{e.assignment ? fmtDate(e.assignment.due_at) : '—'}</Td>
                        <Td><Badge tone={scoreTone(e.score)}>{fmtScore(e.score)}</Badge></Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>
            <Card index={5}>
              <CardHeader icon={<ClipboardCheck size={15} />} tone="warning" title="Entregas pendientes" description={`${file.missing.length} de ${file.due.length} tareas vencidas`} />
              {file.missing.length === 0 ? <EmptyState title="Está al día con sus entregas" /> : (
                <ul className="divide-y divide-v-border">
                  {file.missing.map(a => <li key={a.id} className="px-5 py-3"><p className="text-[13.5px] font-semibold">{a.title}</p><p className="text-xs text-v-subtle">{subjectName.get(a.subject_id)} · venció el {fmtDate(a.due_at)}</p></li>)}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}

      {/* ── Estudiante: incidencias ── */}
      {tab === 'incidencias' && isStudent && (
        <Card index={2}>
          <CardHeader icon={<ClipboardList size={15} />} tone="warning" title="Hoja de vida" description={`${incidents.length} anotaciones · ${incidents.filter(x => x.kind === 'positiva').length} positivas, ${incidents.filter(x => x.kind === 'negativa').length} negativas`} actions={addIncidentDialog} />
          {incidents.length === 0 ? <EmptyState aria={2} title="Sin incidencias registradas" description="Las anotaciones positivas, negativas o informativas aparecerán aquí." /> : incidentList(incidents)}
          <p className="border-t border-v-border px-5 py-3 text-xs text-v-subtle">Las ven secretaría, dirección y los docentes del estudiante. No se muestran a estudiantes ni apoderados, y no incluyen información de bienestar, que es confidencial.</p>
        </Card>
      )}

      {/* ── Docente ── */}
      {tab === 'docencia' && isTeacher && (
        <Card index={2}>
          <CardHeader icon={<BookOpen size={15} />} title="Cursos y asignaturas a cargo" description={`${groups.length} asignaturas · ${teacherStudents} estudiantes${(headRows ?? []).length ? ` · profesor(a) jefe de ${(headRows ?? []).map(c => c.name).join(', ')}` : ''}`}
            actions={<Link href="/admin/academico" className="text-xs font-semibold text-v-accent hover:underline">Gestionar asignaciones</Link>} />
          {groups.length === 0 ? <EmptyState aria={4} title="Sin asignaturas asignadas" description="Asigna cursos y asignaturas desde la estructura académica." /> : (
            <Table>
              <thead><tr><Th>Curso</Th><Th>Asignatura</Th><Th>Estudiantes</Th><Th>Tareas publicadas</Th><Th>Por corregir</Th><Th>Promedio del curso</Th></tr></thead>
              <tbody>
                {groups.map(g => (
                  <tr key={g.courseId + g.subject} className="hover:bg-v-fill/50">
                    <Td className="font-semibold">{g.course}</Td><Td>{g.subject}</Td><Td>{g.students}</Td><Td>{g.tasks}</Td>
                    <Td>{g.pending ? <Badge tone="warning">{g.pending}</Badge> : <span className="text-v-subtle">0</span>}</Td>
                    <Td><span className="v-display font-bold">{fmtScore(g.average)}</span></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          <p className="border-t border-v-border px-5 py-3 text-xs text-v-subtle">Describe la carga de trabajo. No es una evaluación de desempeño.</p>
        </Card>
      )}

      {/* ── Familia ── */}
      {tab === 'familia' && (isStudent || isGuardian) && (
        <Card index={2}>
          <CardHeader icon={<Users size={15} />} title={isGuardian ? 'Estudiantes a su cargo' : 'Apoderados'} description="Un apoderado solo puede ver la información de los estudiantes vinculados aquí."
            actions={
              <FormDialog trigger={<><Link2 size={14} />Vincular</>} size="sm" variant="secondary" action={linkGuardian} submitLabel="Vincular" title={isGuardian ? 'Vincular estudiante' : 'Vincular apoderado'}>
                <input type="hidden" name={isGuardian ? 'guardian_id' : 'student_id'} value={id} />
                <Field label={isGuardian ? 'Estudiante' : 'Apoderado'}>
                  <Select name={isGuardian ? 'student_id' : 'guardian_id'} required defaultValue=""><option value="" disabled>Selecciona…</option>{linkable.map(m => <option key={m.userId} value={m.userId}>{m.fullName}</option>)}</Select>
                </Field>
                <Field label="Parentesco"><Input name="relationship" defaultValue="apoderado" maxLength={40} required /></Field>
              </FormDialog>
            } />
          {links.length === 0 ? <CardBody><Notice tone="warning">Sin vínculos registrados.{isGuardian && ' Este apoderado no verá información de ningún estudiante.'}</Notice></CardBody> : (
            <ul className="divide-y divide-v-border">
              {links.map(l => {
                const other = byId.get(isGuardian ? l.student_id : l.guardian_id)
                return (
                  <li key={l.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <Link href={`/admin/usuarios/${other?.userId}`} className="flex min-w-0 items-center gap-3 hover:text-v-accent">
                      <Avatar name={other?.fullName ?? '?'} size={36} id={other?.userId} />
                      <span className="min-w-0"><span className="block truncate text-[13.5px] font-semibold">{other?.fullName ?? 'Usuario'}</span>
                        <span className="block truncate text-xs text-v-muted">{l.relationship}{other?.phone ? ` · ${other.phone}` : ''}{other?.email ? ` · ${other.email}` : ''}</span></span>
                    </Link>
                    <ConfirmAction action={unlinkGuardian.bind(null, l.id)} title="Quitar vínculo" danger confirmLabel="Quitar" message="El apoderado dejará de ver la información de este estudiante.">Quitar</ConfirmAction>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      )}

      {/* ── Cuenta y acceso ── */}
      {tab === 'cuenta' && (
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
          <Card index={2}>
            <CardHeader icon={<ShieldCheck size={15} />} title="Rol en el colegio" description={isSelf ? 'No puedes modificar tu propio rol ni tu acceso.' : 'El rol define qué puede ver y hacer esta persona.'} />
            <CardBody>
              <InlineForm action={changeRole.bind(null, id)} resetOnSuccess={false} className="flex items-end gap-2">
                <Field label="Rol" className="flex-1"><Select name="role" defaultValue={user.role} disabled={isSelf}>{ROLES.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</Select></Field>
                {!isSelf && <SubmitButton variant="secondary">Cambiar rol</SubmitButton>}
              </InlineForm>
              <dl className="mt-5 grid gap-4 border-t border-v-border pt-4 sm:grid-cols-2">
                <Fact label="Estado de la cuenta" value={STATUS_LABEL[user.status]} />
                <Fact label="Cuenta creada" value={fmtDate(user.createdAt)} />
                <Fact label="Tipo de cuenta" value={user.isManaged ? 'Gestionada por el colegio' : 'Con acceso propio'} />
              </dl>
            </CardBody>
          </Card>
          <Card index={3}>
            <CardHeader icon={<UserX size={15} />} tone="danger" title="Acceso" description="Ninguna de estas acciones borra notas, entregas ni asistencia." />
            <CardBody>
              {isSelf ? <p className="text-[13.5px] text-v-muted">Otra persona con rol de secretaría debe gestionar tu acceso.</p> : (
                <div className="flex flex-wrap gap-2">
                  {user.status === 'active' ? (
                    <ConfirmAction action={setMemberStatus.bind(null, id, 'suspended')} variant="secondary" size="md" danger title="Desactivar cuenta" confirmLabel="Desactivar"
                      message={`${user.fullName} perderá el acceso de inmediato y se cerrarán sus sesiones. Sus datos y registros no se modifican; puedes reactivar la cuenta cuando quieras.`}><UserX size={14} />Desactivar</ConfirmAction>
                  ) : (
                    <ConfirmAction action={setMemberStatus.bind(null, id, 'active')} variant="secondary" size="md" title="Reactivar cuenta" confirmLabel="Reactivar"
                      message={`${user.fullName} recuperará el acceso con su rol de ${ROLE_LABEL[user.role]}.`}><UserCheck size={14} />Reactivar</ConfirmAction>
                  )}
                  <ConfirmAction action={revokeSessions.bind(null, id)} variant="secondary" size="md" title="Revocar sesiones" confirmLabel="Cerrar sesiones"
                    message="Se cerrarán todas las sesiones abiertas de esta persona. Podrá volver a entrar con su contraseña."><LogOut size={14} />Revocar sesiones</ConfirmAction>
                  {user.status !== 'removed' && (
                    <ConfirmAction action={setMemberStatus.bind(null, id, 'removed')} variant="secondary" size="md" danger title="Retirar de la institución" confirmLabel="Retirar"
                      message="La persona deja de pertenecer al colegio y pierde el acceso. Notas, entregas y asistencia se conservan como registro histórico."><UserMinus size={14} />Retirar del colegio</ConfirmAction>
                  )}
                  <FormDialog trigger={<><Trash2 size={14} />Solicitar eliminación</>} variant="danger" title="Solicitar eliminación de la cuenta"
                    description="La solicitud queda pendiente de revisión; no borra nada por sí sola." action={requestDeletion.bind(null, id)} submitLabel="Registrar solicitud">
                    <Field label="Motivo"><Textarea name="reason" required minLength={5} maxLength={1000} placeholder="Por ejemplo: solicitud del apoderado tras el retiro del estudiante." /></Field>
                  </FormDialog>
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      )}
    </>
  )
}
