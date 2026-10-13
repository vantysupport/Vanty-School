import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { configured } from './helpers'

// Comprueba, contra los datos de demostración, A QUIÉN se le avisaría por correo en cada caso.
// El envío está simulado: ningún correo sale de aquí.

vi.mock('server-only', () => ({}))
const outbox: { to: string[]; subject: string; html: string }[] = []
vi.mock('@/lib/email/send', () => ({
  mailConfigured: () => true,
  appBaseUrl: () => 'https://school.prueba.cl',
  isDeliverable: () => true,
  sendEmail: async (to: string, mail: { subject: string; html: string }) => { outbox.push({ to: [to], ...mail }); return true },
  sendBulk: async (to: string[], mail: { subject: string; html: string }) => { const list = [...new Set(to)]; if (list.length) outbox.push({ to: list, ...mail }); return list.length },
}))

import { adminClient, hasServiceRole } from '@/lib/supabase/admin'
import { notifyAnnouncement, notifyAssignment, notifyGrades, notifyGuardianFromWellbeing, notifyWellbeingRequest } from '@/lib/email/notices'
import { bulkLimit, chunk, mailSummary } from '@/lib/email/bulk'

const run = configured && hasServiceRole()
const school = { institutionId: '', institutionName: 'Colegio Futuro Andino' }
let courseId = '', subjectId = '', studentId = '', guardianId = '', teacherId = ''
let studentEmails = new Set<string>()
const recipients = () => outbox.flatMap(m => m.to)

describe.skipIf(!run)('a quién se le avisa por correo', () => {
  beforeAll(async () => {
    const db = adminClient()
    const { data: inst } = await db.from('institutions').select('id').eq('name', school.institutionName).single()
    school.institutionId = inst!.id
    const { data: link } = await db.from('guardian_student_links').select('guardian_id, student_id').eq('institution_id', inst!.id).limit(1).single()
    guardianId = link!.guardian_id; studentId = link!.student_id
    const { data: enrollment } = await db.from('course_enrollments').select('course_id').eq('student_id', studentId).eq('status', 'active').limit(1).single()
    courseId = enrollment!.course_id
    const { data: assignment } = await db.from('teacher_assignments').select('subject_id, teacher_id').eq('course_id', courseId).limit(1).single()
    subjectId = assignment!.subject_id; teacherId = assignment!.teacher_id
    const { data: students } = await db.from('course_enrollments').select('profiles:student_id(email)').eq('course_id', courseId)
    studentEmails = new Set((students ?? []).map(s => (s.profiles as unknown as { email: string } | null)?.email).filter((e): e is string => !!e))
  })
  beforeEach(() => { outbox.length = 0; vi.unstubAllEnvs() })

  it('una tarea avisa a los apoderados del curso y a ningún estudiante', async () => {
    const report = await notifyAssignment({ ...school, courseId, subjectId, title: 'Guía de prueba', kind: 'tarea', dueAt: '2026-11-02T15:00:00Z' })
    expect(report.sent).toBeGreaterThan(0)
    expect(report.sent).toBeLessThanOrEqual(40)   // un curso de 20 estudiantes
    expect(recipients().some(e => studentEmails.has(e))).toBe(false)
    expect(outbox[0].html).toContain('Guía de prueba')
    expect(outbox[0].html).toContain('/apoderado/hijos?tab=tareas')
  })

  it('una nota avisa solo al apoderado de ese estudiante y no dice cuánto se sacó', async () => {
    const report = await notifyGrades({ ...school, studentIds: [studentId], subjectId })
    const { data: guardian } = await adminClient().from('profiles').select('email').eq('id', guardianId).single()
    expect(report.sent).toBeGreaterThanOrEqual(1)
    expect(recipients()).toContain(guardian!.email)
    expect(recipients().length).toBeLessThanOrEqual(3)
    for (const mail of outbox) expect(mail.html).toContain('solo se muestran dentro de la plataforma')   // la nota no va en el correo
    expect((await notifyGrades({ ...school, studentIds: [], subjectId })).sent).toBe(0)
  })

  it('un comunicado de curso llega a los apoderados y docentes de ese curso, no a todo el colegio', async () => {
    const report = await notifyAnnouncement({ ...school, authorId: teacherId, authorName: 'Docente', title: 'Reunión de apoderados', courseId, audience: ['apoderado', 'docente', 'estudiante'] })
    expect(report.sent).toBeGreaterThan(0)
    expect(report.sent).toBeLessThan(60)
    expect(recipients().some(e => studentEmails.has(e))).toBe(false)
    const { data: author } = await adminClient().from('profiles').select('email').eq('id', teacherId).single()
    expect(recipients()).not.toContain(author!.email)   // quien publica no se avisa a sí mismo
  })

  it('un comunicado a todo el colegio supera el máximo y no se envía', async () => {
    const report = await notifyAnnouncement({ ...school, authorId: teacherId, authorName: 'Dirección', title: 'Aviso general', courseId: null, audience: ['apoderado'] })
    expect(report.sent).toBe(0)
    expect(report.skipped).toBeGreaterThan(bulkLimit())
    expect(outbox).toEqual([])
    expect(mailSummary(report)).toMatch(/No se avisó por correo/)
  })

  it('una solicitud de apoyo avisa solo al equipo de bienestar, sin nombres ni motivo', async () => {
    const report = await notifyWellbeingRequest({ ...school, senderId: guardianId })
    const { data: team } = await adminClient().from('institution_memberships').select('user_id').eq('institution_id', school.institutionId).eq('role', 'bienestar').eq('status', 'active')
    expect(report.sent).toBe(team!.length)
    expect(outbox[0].html).toContain('no indica quién la envió')
    expect(outbox[0].html).toContain('/bienestar/solicitudes')
  })

  it('bienestar le avisa al apoderado, pero nunca a un estudiante', async () => {
    expect((await notifyGuardianFromWellbeing({ ...school, guardianId, what: 'reply' })).sent).toBe(1)
    expect((await notifyGuardianFromWellbeing({ ...school, guardianId, what: 'questionnaire' })).sent).toBe(1)
    outbox.length = 0
    expect((await notifyGuardianFromWellbeing({ ...school, guardianId: studentId, what: 'reply' })).sent).toBe(0)
    expect(outbox).toEqual([])
  })
})

describe('avisos masivos', () => {
  it('parte los destinatarios en tandas', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(chunk([], 40)).toEqual([])
  })

  it('el máximo por aviso se puede ajustar y tiene un valor por defecto', () => {
    vi.stubEnv('MAIL_BULK_LIMIT', '')
    expect(bulkLimit()).toBe(150)
    vi.stubEnv('MAIL_BULK_LIMIT', '30')
    expect(bulkLimit()).toBe(30)
    vi.unstubAllEnvs()
  })

  it('el resumen dice qué pasó con los correos, o nada si no se envió ninguno', () => {
    expect(mailSummary({ sent: 0, skipped: 0 })).toBe('')
    expect(mailSummary({ sent: 1, skipped: 0 })).toBe(' Se avisó por correo a 1 persona.')
    expect(mailSummary({ sent: 18, skipped: 0 })).toBe(' Se avisó por correo a 18 personas.')
  })
})
