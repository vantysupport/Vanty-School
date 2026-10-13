import 'server-only'
import type { DB } from '@/lib/supabase/server'
import type { Session } from '@/lib/auth/session'
import type { AriaMode } from '@/lib/aria/modes'
import { redact } from '@/lib/aria/guard'
import { assignmentStats, attendanceByCourse, groupStats, loadSnapshot } from '@/lib/data/academic'
import { attendanceRate, average, fmtDate, fmtPct, fmtScore } from '@/lib/format'
import { FEEDBACK_DIMENSIONS, monthLabel, type FeedbackKey } from '@/lib/feedback'

// Construcción del contexto que recibe el modelo.
// 1) El servidor decide qué datos entran según el rol y la relación de quien pregunta (nunca lo que pida el texto).
// 2) Las lecturas usan el cliente RLS del usuario: un dato no autorizado simplemente no existe.
// 3) A los proveedores solo salen agregados o texto seudonimizado.

export type BuiltContext =
  | { ok: true; text: string; scope: Record<string, unknown> }
  | { ok: false; error: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const denied = (error: string): BuiltContext => ({ ok: false, error })

async function pedagogica(db: DB, session: Session, scope: string | null): Promise<BuiltContext> {
  const [courseId, subjectId] = (scope ?? '').split(':')
  if (!UUID.test(courseId ?? '') || !UUID.test(subjectId ?? '')) return denied('Elige un curso y una asignatura para consultar a ARIA.')
  const { data: assignment } = await db.from('teacher_assignments')
    .select('courses(name), subjects(name)')
    .eq('institution_id', session.institutionId).eq('teacher_id', session.userId)
    .eq('course_id', courseId).eq('subject_id', subjectId).maybeSingle()
  if (!assignment) return denied('Solo puedes consultar sobre cursos y asignaturas que tienes a tu cargo.')

  const snap = await loadSnapshot(db, session.institutionId, { courseId, subjectId })
  const stats = assignmentStats(snap, courseId, subjectId)
  const enrolled = snap.enrollments.length
  const all = snap.grades.map(g => g.score)
  const names = assignment as unknown as { courses: { name: string }; subjects: { name: string } }

  const lines = [
    `Curso: ${names.courses.name} · Asignatura: ${names.subjects.name}`,
    `Estudiantes matriculados: ${enrolled}${enrolled < 8 ? ' (grupo pequeño: interpretar con cautela)' : ''}`,
    `Promedio general de la asignatura: ${fmtScore(average(all))} (${all.length} calificaciones; ${all.filter(v => v < 4).length} bajo 4,0)`,
    `Asistencia del curso (últimas semanas): ${fmtPct(attendanceRate(snap.attendance))}`,
    '',
    'Actividades (de la más antigua a la más reciente):',
    ...stats.map(a =>
      `- "${a.title}" · contenido: ${a.topic ?? 'sin especificar'} · ${a.isDue ? 'vencida' : 'vigente'} (${fmtDate(a.dueAt)}) · ` +
      `entregas ${a.submitted}/${a.enrolled} · calificadas ${a.graded} · promedio ${fmtScore(a.average)} · ` +
      `distribución: bajo 4,0=${a.buckets[0]}, 4,0–4,9=${a.buckets[1]}, 5,0–5,9=${a.buckets[2]}, 6,0–7,0=${a.buckets[3]}`),
  ]
  return { ok: true, text: lines.join('\n'), scope: { courseId, subjectId, assignments: stats.length } }
}

/** Sobre este número de grupos (curso × asignatura) el contexto de gestión se resume en vez de listarlos todos. */
const BIG_SCHOOL = 60

async function gestion(db: DB, session: Session): Promise<BuiltContext> {
  const snap = await loadSnapshot(db, session.institutionId)
  const groups = groupStats(snap).sort((a, b) => (a.average ?? 9) - (b.average ?? 9))
  const { data: fbData } = await db.rpc('teacher_feedback_overview', { p_inst: session.institutionId, p_months: 2 })

  // Evaluación mensual de clases: solo promedios de grupos con 3 o más respuestas, por curso y asignatura.
  // No se envían nombres de docentes, respuestas individuales ni comentarios.
  type Fb = { course_id: string; subject_id: string; month: string; responses: number; score: number; dims: Record<FeedbackKey, number> }
  const fb = ((fbData ?? []) as Fb[]).map(r => ({ ...r, month: String(r.month).slice(0, 10), responses: Number(r.responses), score: Number(r.score) }))
  const months = [...new Set(fb.map(r => r.month))].sort()
  const last = months[months.length - 1], prev = months[months.length - 2]
  const mean = (rows: Fb[], pick: (r: Fb) => number) => { const n = rows.reduce((t, r) => t + r.responses, 0); return n ? rows.reduce((t, r) => t + pick(r) * r.responses, 0) / n : null }
  const five = (v: number | null) => (v == null ? 'sin datos' : v.toFixed(1).replace('.', ','))
  const courseName = new Map(snap.courses.map(c => [c.id, c.name])), subjectName = new Map(snap.subjects.map(s => [s.id, s.name]))
  const fbLines = [...new Set(fb.filter(r => r.month === last).map(r => `${r.course_id}:${r.subject_id}`))].map(key => {
    const [courseId, subjectId] = key.split(':')
    const mine = fb.filter(r => r.course_id === courseId && r.subject_id === subjectId)
    const now = mine.filter(r => r.month === last), before = mine.filter(r => r.month === prev)
    const dims = FEEDBACK_DIMENSIONS.map(d => ({ label: d.label, value: mean(now, r => Number(r.dims[d.key])) ?? 0 })).sort((a, b) => a.value - b.value)
    return { score: mean(now, r => r.score) ?? 0, text: `- ${courseName.get(courseId) ?? 'Curso'} · ${subjectName.get(subjectId) ?? 'Asignatura'}: ${five(mean(now, r => r.score))} de 5 (${now.reduce((n, r) => n + r.responses, 0)} respuestas` +
      `${before.length ? `; mes anterior ${five(mean(before, r => r.score))}` : ''}) · aspectos más bajos: ${dims.slice(0, 2).map(d => `${d.label.toLowerCase()} ${five(d.value)}`).join(', ')}` }
  }).sort((a, b) => a.score - b.score).map(x => x.text)

  // Un colegio completo tiene cientos de grupos (curso × asignatura): enviarlos todos no cabe en una consulta al modelo.
  // Se resume por nivel y asignatura, y se detallan solo los grupos más bajos y los más altos.
  const groupLine = (g: (typeof groups)[number]) =>
    `- ${g.courseName} · ${g.subjectName}: promedio ${fmtScore(g.average)} · ${fmtPct(g.belowPassPct)} de notas bajo 4,0 · ` +
    `${g.graded} calificaciones · ${g.enrolled} estudiantes · entregas a tiempo ${fmtPct(g.submissionRate)}`
  let performance: string[]
  if (groups.length <= BIG_SCHOOL) {
    performance = ['Rendimiento por curso y asignatura (de menor a mayor promedio):', ...groups.map(groupLine)]
  } else {
    const byLevel = new Map<string, { level: string; subject: string; sum: number; graded: number; below: number; sections: number }>()
    for (const g of groups) {
      if (g.average == null) continue
      const levelName = g.courseName.replace(/\s+[A-Z]$/, '')
      const key = `${levelName}|${g.subjectName}`
      const row = byLevel.get(key) ?? { level: levelName, subject: g.subjectName, sum: 0, graded: 0, below: 0, sections: 0 }
      row.sum += g.average * g.graded; row.graded += g.graded; row.below += g.belowPass; row.sections += 1
      byLevel.set(key, row)
    }
    const levels = [...byLevel.values()].filter(r => r.graded > 0).sort((a, b) => a.sum / a.graded - b.sum / b.graded)
    const withGrades = groups.filter(g => g.average != null)
    performance = [
      'Rendimiento por nivel y asignatura (suma todas las secciones del nivel; de menor a mayor promedio):',
      ...levels.map(r => `- ${r.level} · ${r.subject}: promedio ${fmtScore(r.sum / r.graded)} · ${fmtPct((r.below / r.graded) * 100)} de notas bajo 4,0 · ${r.sections} secciones · ${r.graded} calificaciones`),
      '',
      `De ${withGrades.length} grupos (curso y asignatura), los 15 con menor promedio:`,
      ...withGrades.slice(0, 15).map(groupLine),
      '',
      'Los 5 grupos con mayor promedio:',
      ...withGrades.slice(-5).reverse().map(groupLine),
    ]
  }

  const lines = [
    `Establecimiento: ${session.institutionName}`,
    `Cursos: ${snap.courses.length} · Estudiantes matriculados: ${new Set(snap.enrollments.map(e => e.student_id)).size}`,
    '',
    ...performance,
    '',
    'Asistencia por curso (últimas semanas):',
    ...attendanceByCourse(snap).map(a => `- ${a.courseName}: ${fmtPct(a.rate)}`),
    '',
    `Evaluación mensual de clases respondida por estudiantes${last ? ` (${monthLabel(last)})` : ''}, escala 1 a 5, de menor a mayor:`,
    ...(fbLines.length === 0 ? ['- Sin respuestas suficientes (se requieren al menos 3 por grupo)']
      : fbLines.length > BIG_SCHOOL ? [`Promedio del colegio: ${five(mean(fb.filter(r => r.month === last), r => r.score))} de 5 en ${fbLines.length} grupos. Los 15 grupos con evaluación más baja:`, ...fbLines.slice(0, 15)]
      : fbLines),
  ]
  return { ok: true, text: lines.join('\n'), scope: { groups: groups.length, classFeedbackGroups: fbLines.length } }
}

async function familias(db: DB, session: Session, scope: string | null): Promise<BuiltContext> {
  if (!UUID.test(scope ?? '')) return denied('Elige sobre cuál de tus pupilos quieres consultar.')
  const studentId = scope as string
  const { data: link } = await db.from('guardian_student_links').select('id')
    .eq('institution_id', session.institutionId).eq('guardian_id', session.userId).eq('student_id', studentId).maybeSingle()
  if (!link) return denied('Solo puedes consultar sobre estudiantes vinculados a tu cuenta.')

  const { data: enrollment } = await db.from('course_enrollments').select('course_id, courses(name)')
    .eq('student_id', studentId).eq('status', 'active').eq('institution_id', session.institutionId).maybeSingle()
  const courseId = enrollment?.course_id as string | undefined
  const [grades, assignments, submissions, attendance] = await Promise.all([
    db.from('grades').select('score, subjects(name)').eq('student_id', studentId).eq('institution_id', session.institutionId),
    courseId
      ? db.from('assignments').select('id, title, due_at, subjects(name)').eq('course_id', courseId).eq('status', 'published').gte('due_at', new Date().toISOString()).order('due_at')
      : Promise.resolve({ data: [] as { id: string; title: string; due_at: string; subjects: unknown }[] }),
    db.from('assignment_submissions').select('assignment_id').eq('student_id', studentId),
    db.from('attendance_records').select('status').eq('student_id', studentId).eq('institution_id', session.institutionId),
  ])

  const bySubject = new Map<string, number[]>()
  for (const g of (grades.data ?? []) as unknown as { score: number; subjects: { name: string } }[]) {
    bySubject.set(g.subjects.name, [...(bySubject.get(g.subjects.name) ?? []), Number(g.score)])
  }
  const done = new Set((submissions.data ?? []).map(s => s.assignment_id))
  const pending = ((assignments.data ?? []) as unknown as { id: string; title: string; due_at: string; subjects: { name: string } }[]).filter(a => !done.has(a.id))

  const lines = [
    `Tu pupilo cursa: ${(enrollment as unknown as { courses?: { name: string } } | null)?.courses?.name ?? 'sin curso asignado'}`,
    `Asistencia (últimas semanas): ${fmtPct(attendanceRate(attendance.data ?? []))}`,
    '',
    'Promedios por asignatura:',
    ...(bySubject.size ? [...bySubject].map(([name, v]) => `- ${name}: ${fmtScore(average(v))} (${v.length} notas)`) : ['- Aún no hay notas registradas']),
    '',
    'Tareas pendientes de entrega:',
    ...(pending.length ? pending.map(a => `- ${a.subjects.name}: "${a.title}", vence el ${fmtDate(a.due_at)}`) : ['- No tiene tareas pendientes']),
  ]
  return { ok: true, text: lines.join('\n'), scope: { studentId } }
}

async function bienestar(db: DB, session: Session, scope: string | null): Promise<BuiltContext> {
  const { data: settings } = await db.from('institution_settings').select('urgent_protocol').eq('institution_id', session.institutionId).maybeSingle()
  const protocol = `Protocolo del colegio ante urgencias: ${settings?.urgent_protocol ?? 'no registrado; indica acudir a la dirección y a los servicios de urgencia.'}`
  if (!scope) {
    return { ok: true, text: `No se seleccionó ningún caso: responde de forma general, sin referirte a estudiantes.\n${protocol}`, scope: {} }
  }
  if (!UUID.test(scope)) return denied('Caso inválido.')

  // RLS: solo el equipo de bienestar del colegio puede leer estas tablas.
  const { data: kase } = await db.from('wellbeing_cases')
    .select('id, student_id, status, summary, follow_up_on, created_at, wellbeing_requests(category, source, description)')
    .eq('id', scope).eq('institution_id', session.institutionId).maybeSingle()
  if (!kase) return denied('No tienes acceso a ese caso.')

  const studentId = kase.student_id as string
  const [student, guardians, interventions, enrollment, attendance, grades, applied] = await Promise.all([
    db.from('profiles').select('full_name').eq('id', studentId).maybeSingle(),
    db.from('guardian_student_links').select('profiles!guardian_student_links_guardian_id_fkey(full_name)').eq('student_id', studentId),
    db.from('wellbeing_interventions').select('kind, notes, occurred_on, next_follow_up_on').eq('case_id', scope).order('occurred_on'),
    db.from('course_enrollments').select('courses(name)').eq('student_id', studentId).eq('status', 'active').maybeSingle(),
    db.from('attendance_records').select('status').eq('student_id', studentId).eq('institution_id', session.institutionId),
    db.from('grades').select('score, subjects(name)').eq('student_id', studentId).eq('institution_id', session.institutionId),
    db.from('assessment_responses').select('answers, respondent_id, professional_review, created_at, assessment_templates(title, questions, reading_guide)').eq('case_id', scope).order('created_at', { ascending: false }).limit(3),
  ])

  const names = [
    { value: student.data?.full_name ?? '', label: '[estudiante]' },
    ...((guardians.data ?? []) as unknown as { profiles: { full_name: string } | null }[]).map(g => ({ value: g.profiles?.full_name ?? '', label: '[apoderado]' })),
  ].filter(n => n.value)
  const clean = (t: string) => redact(t, names)

  const bySubject = new Map<string, number[]>()
  for (const g of (grades.data ?? []) as unknown as { score: number; subjects: { name: string } }[]) {
    bySubject.set(g.subjects.name, [...(bySubject.get(g.subjects.name) ?? []), Number(g.score)])
  }
  const request = (kase as unknown as { wellbeing_requests: { category: string; source: string; description: string } | null }).wellbeing_requests
  const KIND: Record<string, string> = {
    entrevista: 'Entrevista', observacion: 'Observación', reunion_apoderado: 'Reunión con apoderado',
    coordinacion_docente: 'Coordinación con docente', derivacion: 'Derivación', seguimiento: 'Seguimiento',
  }

  type Applied = { answers: Record<string, string | number>; respondent_id: string | null; professional_review: string | null; created_at: string
    assessment_templates: { title: string; questions: { id: string; text: string; type: string; max?: number; minLabel?: string; maxLabel?: string }[]; reading_guide: string } | null }
  const questionnaires = ((applied.data ?? []) as unknown as Applied[]).filter(a => a.assessment_templates).flatMap(a => {
    const t = a.assessment_templates!
    return [
      `- «${t.title}» · ${fmtDate(a.created_at)} · respondió: ${a.respondent_id ? 'la familia ([apoderado])' : 'lo aplicó la persona profesional'}`,
      ...(t.reading_guide ? [`  Guía de lectura del instrumento: ${t.reading_guide}`] : []),
      ...t.questions.map(q => {
        const v = a.answers[q.id]
        if (v == null || v === '') return `  · ${q.text}: sin respuesta`
        return q.type === 'scale' ? `  · ${q.text}: ${v} de ${q.max ?? 5}${q.minLabel ? ` (1 = ${q.minLabel}, ${q.max ?? 5} = ${q.maxLabel})` : ''}` : `  · ${q.text}: ${clean(String(v)).slice(0, 500)}`
      }),
      ...(a.professional_review ? [`  Revisión profesional registrada: ${clean(a.professional_review).slice(0, 600)}`] : []),
    ]
  })

  const lines = [
    `Caso de acompañamiento de [estudiante] · curso ${(enrollment.data as unknown as { courses?: { name: string } } | null)?.courses?.name ?? 'sin curso'}`,
    `Estado: ${kase.status} · abierto el ${fmtDate(kase.created_at as string)} · próximo seguimiento: ${fmtDate(kase.follow_up_on as string | null)}`,
    `Resumen del caso: ${clean(kase.summary as string)}`,
    request ? `Solicitud de origen (${request.source}, categoría ${request.category}): ${clean(request.description)}` : 'Sin solicitud de origen registrada.',
    '',
    'Intervenciones registradas:',
    ...((interventions.data ?? []).length
      ? (interventions.data ?? []).map(i => `- ${fmtDate(i.occurred_on)} · ${KIND[i.kind] ?? i.kind}: ${clean(i.notes)}`)
      : ['- Ninguna']),
    '',
    'Cuestionarios aplicados (son descriptivos; no tienen puntajes ni puntos de corte):',
    ...(questionnaires.length ? questionnaires : ['- Ninguno']),
    '',
    `Antecedentes académicos autorizados: asistencia ${fmtPct(attendanceRate(attendance.data ?? []))}; ` +
      (bySubject.size ? [...bySubject].map(([n, v]) => `${n} ${fmtScore(average(v))}`).join(', ') : 'sin notas registradas'),
    '',
    protocol,
  ]
  return { ok: true, text: lines.join('\n'), scope: { caseId: scope } }
}

export async function buildContext(db: DB, session: Session, mode: AriaMode, scope: string | null): Promise<BuiltContext> {
  switch (mode) {
    case 'pedagogica': return pedagogica(db, session, scope)
    case 'gestion': return gestion(db, session)
    case 'familias': return familias(db, session, scope)
    case 'bienestar': return bienestar(db, session, scope)
  }
}
