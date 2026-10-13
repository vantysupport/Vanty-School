import 'server-only'
import { adminClient, hasServiceRole } from '@/lib/supabase/admin'
import { appBaseUrl, mailConfigured, sendBulk, sendEmail } from '@/lib/email/send'
import { bulkLimit, NO_MAIL, type MailReport } from '@/lib/email/bulk'
import { announcementEmail, assignmentEmail, gradeEmail, wellbeingForGuardianEmail, wellbeingRequestEmail } from '@/lib/email/templates'
import { ROLE_HOME, type Role } from '@/lib/roles'
import { isEvaluation, KIND_LABEL } from '@/lib/assessments'
import { fmtDate } from '@/lib/format'

// Avisos por correo del día a día: comunicados, tareas, notas y bienestar.
//
// Reglas comunes:
//  · Se llaman DESPUÉS de que la base aceptó la acción con la sesión de quien la hizo (RLS ya validó el permiso).
//    La clave de servicio se usa solo para leer los correos de quienes deben enterarse.
//  · Nunca se escribe a estudiantes: quien recibe el aviso es su apoderado.
//  · Ningún correo lleva notas, textos ni motivos: avisa que hay algo y enlaza a la plataforma.
//  · Un fallo de correo nunca interrumpe la acción principal.

type School = { institutionId: string; institutionName: string }
type Person = { id: string; email: string | null; name: string }

const ready = () => (mailConfigured() && hasServiceRole() ? appBaseUrl() : null)

async function safely(run: () => Promise<MailReport>): Promise<MailReport> {
  try { return await run() } catch (e) { console.error('[email] aviso:', e instanceof Error ? e.message : e); return NO_MAIL }
}

async function people(ids: string[]): Promise<Person[]> {
  const unique = [...new Set(ids)]
  const out: Person[] = []
  for (let i = 0; i < unique.length; i += 200) {
    const { data } = await adminClient().from('profiles').select('id, full_name, email').in('id', unique.slice(i, i + 200))
    for (const p of data ?? []) out.push({ id: p.id as string, email: p.email as string | null, name: (p.full_name as string) || '' })
  }
  return out
}

/** Cuentas activas del colegio con alguno de esos roles (sin estudiantes), opcionalmente acotadas a ciertas personas. */
async function members(inst: string, roles: string[], only?: string[]): Promise<{ userId: string; role: string }[]> {
  const wanted = roles.filter(r => r !== 'estudiante')
  if (!wanted.length || (only && !only.length)) return []
  const out: { userId: string; role: string }[] = []
  for (let from = 0; ; from += 1000) {
    let q = adminClient().from('institution_memberships').select('user_id, role').eq('institution_id', inst).eq('status', 'active').in('role', wanted).range(from, from + 999)
    if (only) q = q.in('user_id', only)
    const { data } = await q
    for (const m of data ?? []) out.push({ userId: m.user_id as string, role: m.role as string })
    if (!data || data.length < 1000) break
  }
  return out
}

/** Apoderados de los estudiantes matriculados en un curso (o de ciertos estudiantes). */
async function guardianLinks(inst: string, studentIds: string[]): Promise<{ guardianId: string; studentId: string }[]> {
  if (!studentIds.length) return []
  const { data } = await adminClient().from('guardian_student_links').select('guardian_id, student_id').eq('institution_id', inst).in('student_id', studentIds)
  return (data ?? []).map(l => ({ guardianId: l.guardian_id as string, studentId: l.student_id as string }))
}
async function courseStudents(inst: string, courseId: string): Promise<string[]> {
  const { data } = await adminClient().from('course_enrollments').select('student_id').eq('institution_id', inst).eq('course_id', courseId).eq('status', 'active')
  return (data ?? []).map(e => e.student_id as string)
}

/** Comunicado publicado → quienes pueden verlo (por rol y, si es de un curso, por curso), menos su autor. */
export function notifyAnnouncement(o: School & { authorId: string; authorName: string; title: string; courseId: string | null; audience: string[] }): Promise<MailReport> {
  return safely(async () => {
    const site = ready()
    if (!site) return NO_MAIL
    let list = await members(o.institutionId, o.audience)
    let courseName: string | null = null
    if (o.courseId) {
      const [{ data: course }, students, { data: teachers }] = await Promise.all([
        adminClient().from('courses').select('name').eq('id', o.courseId).maybeSingle(),
        courseStudents(o.institutionId, o.courseId),
        adminClient().from('teacher_assignments').select('teacher_id').eq('institution_id', o.institutionId).eq('course_id', o.courseId),
      ])
      courseName = (course?.name as string | undefined) ?? null
      const guardians = new Set((await guardianLinks(o.institutionId, students)).map(l => l.guardianId))
      const staff = new Set((teachers ?? []).map(t => t.teacher_id as string))
      // En un comunicado de curso, apoderados y docentes son solo los de ese curso.
      list = list.filter(m => (m.role === 'apoderado' ? guardians.has(m.userId) : m.role === 'docente' ? staff.has(m.userId) : true))
    }
    list = list.filter(m => m.userId !== o.authorId)
    if (list.length > bulkLimit()) return { sent: 0, skipped: list.length }
    const emails = new Map((await people(list.map(m => m.userId))).map(p => [p.id, p.email]))
    let sent = 0
    for (const role of [...new Set(list.map(m => m.role))]) {
      const to = list.filter(m => m.role === role).map(m => emails.get(m.userId)).filter((e): e is string => !!e)
      sent += await sendBulk(to, announcementEmail({ school: o.institutionName, author: o.authorName, title: o.title, course: courseName, link: `${site}${ROLE_HOME[role as Role]}/comunicados`, siteUrl: site }), o.institutionName)
    }
    return { sent, skipped: 0 }
  })
}

/** Tarea o evaluación publicada → apoderados de los estudiantes del curso. */
export function notifyAssignment(o: School & { courseId: string; subjectId: string; title: string; kind: string; dueAt: string }): Promise<MailReport> {
  return safely(async () => {
    const site = ready()
    if (!site) return NO_MAIL
    const [students, { data: course }, { data: subject }] = await Promise.all([
      courseStudents(o.institutionId, o.courseId),
      adminClient().from('courses').select('name').eq('id', o.courseId).maybeSingle(),
      adminClient().from('subjects').select('name').eq('id', o.subjectId).maybeSingle(),
    ])
    const guardians = [...new Set((await guardianLinks(o.institutionId, students)).map(l => l.guardianId))]
    const active = await members(o.institutionId, ['apoderado'], guardians)
    if (active.length > bulkLimit()) return { sent: 0, skipped: active.length }
    const to = (await people(active.map(m => m.userId))).map(p => p.email).filter((e): e is string => !!e)
    const kind = KIND_LABEL[o.kind as keyof typeof KIND_LABEL] ?? 'Tarea'
    const mail = assignmentEmail({ school: o.institutionName, kind, isTest: isEvaluation(o.kind as never), title: o.title, subject: (subject?.name as string) ?? 'una asignatura',
      course: (course?.name as string) ?? 'su curso', due: fmtDate(o.dueAt), link: `${site}/apoderado/hijos?tab=tareas`, siteUrl: site })
    return { sent: await sendBulk(to, mail, o.institutionName), skipped: 0 }
  })
}

/** Notas nuevas → apoderados de cada estudiante, uno por uno (el correo nombra a su pupilo). */
export function notifyGrades(o: School & { studentIds: string[]; subjectId: string }): Promise<MailReport> {
  return safely(async () => {
    const site = ready()
    if (!site || !o.studentIds.length) return NO_MAIL
    const links = await guardianLinks(o.institutionId, o.studentIds)
    const active = new Set((await members(o.institutionId, ['apoderado'], [...new Set(links.map(l => l.guardianId))])).map(m => m.userId))
    const pairs = links.filter(l => active.has(l.guardianId))
    if (pairs.length > bulkLimit()) return { sent: 0, skipped: pairs.length }
    const [who, { data: subject }] = await Promise.all([
      people([...pairs.map(l => l.guardianId), ...pairs.map(l => l.studentId)]),
      adminClient().from('subjects').select('name').eq('id', o.subjectId).maybeSingle(),
    ])
    const byId = new Map(who.map(p => [p.id, p]))
    const results = await Promise.all(pairs.map(l => {
      const guardian = byId.get(l.guardianId), student = byId.get(l.studentId)
      if (!guardian?.email || !student) return false
      return sendEmail(guardian.email, gradeEmail({ name: guardian.name, school: o.institutionName, student: student.name, subject: (subject?.name as string) ?? 'una asignatura', link: `${site}/apoderado/hijos?tab=notas`, siteUrl: site }), o.institutionName)
    }))
    return { sent: results.filter(Boolean).length, skipped: 0 }
  })
}

/** Solicitud de apoyo nueva → equipo de bienestar del colegio. */
export function notifyWellbeingRequest(o: School & { senderId: string }): Promise<MailReport> {
  return safely(async () => {
    const site = ready()
    if (!site) return NO_MAIL
    const team = (await members(o.institutionId, ['bienestar'])).filter(m => m.userId !== o.senderId)
    const to = (await people(team.map(m => m.userId))).map(p => p.email).filter((e): e is string => !!e)
    return { sent: await sendBulk(to, wellbeingRequestEmail({ school: o.institutionName, link: `${site}/bienestar/solicitudes`, siteUrl: site }), o.institutionName), skipped: 0 }
  })
}

/** Respuesta de bienestar o cuestionario → el apoderado. Si quien pidió la ayuda es un estudiante, no se envía nada. */
export function notifyGuardianFromWellbeing(o: School & { guardianId: string; what: 'reply' | 'questionnaire' }): Promise<MailReport> {
  return safely(async () => {
    const site = ready()
    if (!site) return NO_MAIL
    const [member] = await members(o.institutionId, ['apoderado'], [o.guardianId])
    if (!member) return NO_MAIL
    const [guardian] = await people([o.guardianId])
    if (!guardian?.email) return NO_MAIL
    const sent = await sendEmail(guardian.email, wellbeingForGuardianEmail({ name: guardian.name, school: o.institutionName, what: o.what, link: `${site}/apoderado/acompanamiento`, siteUrl: site }), o.institutionName)
    return { sent: sent ? 1 : 0, skipped: 0 }
  })
}
