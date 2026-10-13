'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { actionContext } from '@/lib/auth/session'
import { audit } from '@/lib/audit'
import { dbError, NOT_ALLOWED, ok, parseForm, type ActionResult, fail } from '@/lib/actions/result'

// Reclamos, denuncias y sugerencias. Los presenta cualquier integrante de la comunidad y los gestiona
// únicamente el equipo directivo. La gravedad y la resolución las escribe siempre una persona.

const uuid = z.string().uuid('Identificador inválido.')
const refresh = () => revalidatePath('/', 'layout')

const report = z.object({
  kind: z.enum(['reclamo', 'denuncia', 'sugerencia']),
  category: z.enum(['convivencia', 'academico', 'trato', 'infraestructura', 'administrativo', 'otro']),
  subject: z.string({ required_error: 'Escribe un asunto.' }).trim().min(3, 'El asunto es muy corto.').max(160),
  description: z.string({ required_error: 'Describe lo ocurrido.' }).trim().min(10, 'Describe lo ocurrido con un poco más de detalle.').max(6000),
  involved: z.string().trim().max(500).optional(),
  student_id: uuid.optional(),
  evidence: z.string().max(6000).optional(),
})

export async function createReport(form: FormData): Promise<ActionResult> {
  const ctx = await actionContext('estudiante', 'apoderado', 'docente', 'bienestar')
  if (!ctx) return NOT_ALLOWED
  const parsed = parseForm(report, form)
  if ('error' in parsed) return parsed.error
  const { session, db } = ctx
  const v = parsed.data
  // Pruebas: solo se aceptan archivos que esta misma persona subió a su carpeta del bucket confidencial.
  let evidence: { path: string; name: string; type: string; size: number }[] = []
  if (v.evidence) {
    let raw: unknown
    try { raw = JSON.parse(v.evidence) } catch { return fail('Los archivos adjuntos no son válidos.') }
    const list = z.array(z.object({ path: z.string().max(400), name: z.string().max(200), type: z.string().max(120), size: z.number().nonnegative() })).max(5).safeParse(raw)
    if (!list.success) return fail('Los archivos adjuntos no son válidos.')
    const prefix = `${session.institutionId}/${session.userId}/`
    if (list.data.some(f => !f.path.startsWith(prefix) || f.path.includes('..'))) return fail('Los archivos adjuntos no son válidos.')
    evidence = list.data
  }
  const { error } = await db.from('reports').insert({
    evidence,
    institution_id: session.institutionId, reporter_id: session.userId, kind: v.kind, category: v.category,
    subject: v.subject, description: v.description, involved: v.involved ?? null,
    student_id: session.role === 'estudiante' ? null : v.student_id ?? null,
  })
  if (error) return dbError(error, 'No se pudo enviar. Inténtalo de nuevo.')
  refresh()
  return ok('Recibido. El equipo directivo lo revisará y podrás seguir su estado aquí.')
}

export async function updateReport(id: string, form: FormData): Promise<ActionResult> {
  const ctx = await actionContext('directivo')
  if (!ctx) return NOT_ALLOWED
  const parsed = parseForm(z.object({
    status: z.enum(['received', 'in_review', 'resolved', 'dismissed']),
    severity: z.enum(['baja', 'media', 'alta', 'grave']).optional(),
    assign: z.enum(['on']).optional(),
    resolution: z.string().trim().max(6000).optional(),
  }), form)
  if ('error' in parsed) return parsed.error
  const { session, db } = ctx
  const v = parsed.data
  const closing = v.status === 'resolved' || v.status === 'dismissed'
  if (closing && !v.resolution) return { ok: false, error: 'Para cerrar el caso, registra la resolución o el motivo.' }

  const { error, count } = await db.from('reports').update({
    status: v.status, severity: v.severity ?? null, resolution: v.resolution ?? null,
    resolved_at: closing ? new Date().toISOString() : null,
    ...(v.assign ? { assigned_to: session.userId } : {}),
  }, { count: 'exact' }).eq('id', id).eq('institution_id', session.institutionId)
  if (error) return dbError(error)
  if (!count) return NOT_ALLOWED
  await audit(db, session, { action: 'report.update', entity: 'report', entityId: id, sensitive: true, metadata: { status: v.status } })
  refresh()
  return ok('Caso actualizado.')
}

export async function addReportNote(id: string, form: FormData): Promise<ActionResult> {
  const ctx = await actionContext('directivo')
  if (!ctx) return NOT_ALLOWED
  const parsed = parseForm(z.object({
    body: z.string({ required_error: 'Escribe la nota.' }).trim().min(2).max(4000),
    visible: z.enum(['on']).optional(),
  }), form)
  if ('error' in parsed) return parsed.error
  const { error } = await ctx.db.from('report_notes').insert({
    institution_id: ctx.session.institutionId, report_id: id, author_id: ctx.session.userId,
    body: parsed.data.body, visible_to_reporter: parsed.data.visible === 'on',
  })
  if (error) return dbError(error)
  refresh()
  return ok(parsed.data.visible ? 'Respuesta enviada a quien reportó.' : 'Nota interna registrada.')
}
