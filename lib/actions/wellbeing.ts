'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { actionContext } from '@/lib/auth/session'
import { audit } from '@/lib/audit'
import { dbError, fail, NOT_ALLOWED, ok, parseForm, type ActionResult } from '@/lib/actions/result'
import { notifyGuardianFromWellbeing } from '@/lib/email/notices'
import { askAria } from '@/lib/aria/ask'
import { STARTER_TEMPLATES, starterQuestions, TEMPLATE_AUTHORIZATION } from '@/lib/wellbeing-templates'

// Bienestar escolar. Solo el rol "bienestar" puede ejecutar estas acciones y RLS restringe las tablas a ese equipo.
// Ninguna acción fija prioridades, estados ni interpretaciones de forma automática: siempre las escribe una persona.

const uuid = z.string().uuid('Identificador inválido.')
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida.')
const refresh = () => revalidatePath('/bienestar', 'layout')

export async function updateRequest(id: string, form: FormData): Promise<ActionResult> {
  const ctx = await actionContext('bienestar')
  if (!ctx) return NOT_ALLOWED
  const parsed = parseForm(z.object({
    status: z.enum(['pending', 'in_review', 'in_follow_up', 'closed']),
    priority: z.enum(['baja', 'media', 'alta', 'urgente']).optional(),
    assign: z.enum(['on']).optional(),
  }), form)
  if ('error' in parsed) return parsed.error
  const { session, db } = ctx
  const { error, count } = await db.from('wellbeing_requests').update({
    status: parsed.data.status,
    priority: parsed.data.priority ?? null,
    priority_set_by: parsed.data.priority ? session.userId : null,
    ...(parsed.data.assign ? { assigned_to: session.userId } : {}),
  }, { count: 'exact' }).eq('id', id).eq('institution_id', session.institutionId)
  if (error) return dbError(error)
  if (!count) return NOT_ALLOWED
  refresh()
  return ok('Solicitud actualizada.')
}

/** Deja una nota en la solicitud. Interna (solo el equipo) o, si se marca, como respuesta a quien pidió la ayuda. */
/** Reserva una solicitud enviada por un estudiante (su apoderado deja de verla) o la vuelve a mostrar. Criterio del equipo de bienestar. */
export async function setGuardianVisibility(id: string, visible: boolean): Promise<ActionResult> {
  const ctx = await actionContext('bienestar')
  if (!ctx) return NOT_ALLOWED
  const { session, db } = ctx
  const { data, error } = await db.from('wellbeing_requests').update({ guardian_visible: visible }).eq('id', id).eq('institution_id', session.institutionId).eq('source', 'estudiante').select('id')
  if (error) return dbError(error)
  if (!data?.length) return NOT_ALLOWED
  await audit(db, session, { action: 'wellbeing.request.visibility', entity: 'wellbeing_request', entityId: id, sensitive: true, metadata: { guardian_visible: visible } })
  refresh()
  revalidatePath('/', 'layout')
  return ok(visible ? 'El apoderado ahora puede ver esta solicitud.' : 'Solicitud reservada: el apoderado ya no la ve.')
}

export async function addRequestNote(id: string, form: FormData): Promise<ActionResult> {
  const ctx = await actionContext('bienestar')
  if (!ctx) return NOT_ALLOWED
  const parsed = parseForm(z.object({
    body: z.string({ required_error: 'Escribe la nota.' }).trim().min(2, 'Escribe la nota.').max(4000),
    audience: z.enum(['interna', 'respuesta']).default('interna'),
  }), form)
  if ('error' in parsed) return parsed.error
  const { session, db } = ctx
  const visible = parsed.data.audience === 'respuesta'
  let replyTo: string | null = null   // solo se avisa por correo cuando quien pidió la ayuda es un apoderado
  if (visible) {
    const { data: request } = await db.from('wellbeing_requests').select('source, requested_by').eq('id', id).eq('institution_id', session.institutionId).maybeSingle()
    if (!request) return NOT_ALLOWED
    if (request.source === 'apoderado') replyTo = request.requested_by as string
    if (request.source !== 'estudiante' && request.source !== 'apoderado') return fail('Esta solicitud no tiene a quién responderle en la plataforma. Guárdala como nota interna.')
  }
  const { error } = await db.from('wellbeing_request_notes').insert({
    institution_id: session.institutionId, request_id: id, author_id: session.userId, body: parsed.data.body, visible_to_requester: visible,
  })
  if (error) return dbError(error)
  await audit(db, session, { action: 'wellbeing.request.note', entity: 'wellbeing_request', entityId: id, sensitive: true, metadata: { visible } })
  if (replyTo) await notifyGuardianFromWellbeing({ institutionId: session.institutionId, institutionName: session.institutionName, guardianId: replyTo, what: 'reply' })
  refresh()
  revalidatePath('/', 'layout')
  return ok(visible ? 'Respuesta enviada a quien solicitó.' : 'Nota interna guardada.')
}

export async function openCase(requestId: string, form: FormData): Promise<ActionResult> {
  const ctx = await actionContext('bienestar')
  if (!ctx) return NOT_ALLOWED
  const parsed = parseForm(z.object({
    summary: z.string({ required_error: 'Escribe un resumen.' }).trim().min(5, 'El resumen es muy corto.').max(4000),
    follow_up_on: date.optional(),
  }), form)
  if ('error' in parsed) return parsed.error
  const { session, db } = ctx
  const { data: request } = await db.from('wellbeing_requests').select('id, student_id').eq('id', requestId).eq('institution_id', session.institutionId).maybeSingle()
  if (!request) return NOT_ALLOWED
  const { data: existing } = await db.from('wellbeing_cases').select('id').eq('request_id', requestId).maybeSingle()
  if (existing) return fail('Esta solicitud ya tiene un caso abierto.')

  const { data, error } = await db.from('wellbeing_cases').insert({
    institution_id: session.institutionId, student_id: request.student_id, request_id: requestId,
    opened_by: session.userId, responsible_id: session.userId, status: 'open',
    summary: parsed.data.summary, follow_up_on: parsed.data.follow_up_on ?? null,
  }).select('id').single()
  if (error) return dbError(error)
  await db.from('wellbeing_requests').update({ status: 'in_follow_up', assigned_to: session.userId }).eq('id', requestId)
  await audit(db, session, { action: 'wellbeing.case.open', entity: 'wellbeing_case', entityId: data.id, sensitive: true })
  refresh()
  return ok('Caso de acompañamiento abierto.')
}

/** El equipo registra por su cuenta un caso que no llegó como solicitud: por ejemplo, un acompañamiento que ya llevaba
 *  antes de usar la plataforma. Se deja una solicitud de origen «del equipo» para conservar el ámbito y la trazabilidad. */
export async function openDirectCase(form: FormData): Promise<ActionResult> {
  const ctx = await actionContext('bienestar')
  if (!ctx) return NOT_ALLOWED
  const parsed = parseForm(z.object({
    student_id: z.string({ required_error: 'Elige al estudiante.' }).uuid('Elige al estudiante.'),
    category: z.enum(['academico', 'convivencia', 'emocional', 'familiar', 'otro']),
    summary: z.string({ required_error: 'Escribe un resumen.' }).trim().min(5, 'El resumen es muy corto.').max(4000),
    started_on: date.optional(),
    follow_up_on: date.optional(),
  }), form)
  if ('error' in parsed) return parsed.error
  const { session, db } = ctx
  const v = parsed.data
  const today = new Date().toISOString().slice(0, 10)
  if (v.started_on && v.started_on > today) return fail('Revisa los campos marcados.', { started_on: 'La fecha de inicio no puede ser futura.' })

  const { data: active } = await db.from('wellbeing_cases').select('id').eq('institution_id', session.institutionId).eq('student_id', v.student_id).neq('status', 'closed').limit(1)
  if (active?.length) return fail('Ese estudiante ya tiene un caso activo. Ábrelo desde la lista y registra ahí lo nuevo.')

  // Mediodía UTC: la fecha se ve igual en Chile sea cual sea el horario del año.
  const startedAt = v.started_on && v.started_on < today ? `${v.started_on}T12:00:00Z` : new Date().toISOString()
  const { data: request, error: requestError } = await db.from('wellbeing_requests').insert({
    institution_id: session.institutionId, student_id: v.student_id, requested_by: session.userId,
    source: 'bienestar', category: v.category, description: v.summary, created_at: startedAt,
  }).select('id').single()
  if (requestError) return dbError(requestError, 'No se pudo registrar el caso. Verifica que la persona sea estudiante del colegio.')

  const { data: kase, error } = await db.from('wellbeing_cases').insert({
    institution_id: session.institutionId, student_id: v.student_id, request_id: request.id,
    opened_by: session.userId, responsible_id: session.userId, status: 'open',
    summary: v.summary, follow_up_on: v.follow_up_on ?? null, created_at: startedAt,
  }).select('id').single()
  if (error) return dbError(error)
  await db.from('wellbeing_requests').update({ status: 'in_follow_up', assigned_to: session.userId }).eq('id', request.id)
  await audit(db, session, { action: 'wellbeing.case.open', entity: 'wellbeing_case', entityId: kase.id, sensitive: true, metadata: { direct: true } })
  refresh()
  return ok('Caso registrado. Ya aparece en la lista, a tu cargo.')
}

export async function updateCase(id: string, form: FormData): Promise<ActionResult> {
  const ctx = await actionContext('bienestar')
  if (!ctx) return NOT_ALLOWED
  const parsed = parseForm(z.object({
    status: z.enum(['open', 'follow_up', 'referred', 'closed']),
    summary: z.string({ required_error: 'Escribe un resumen.' }).trim().min(5).max(4000),
    follow_up_on: date.optional(),
  }), form)
  if ('error' in parsed) return parsed.error
  const { session, db } = ctx
  const { data, error } = await db.from('wellbeing_cases').update({
    status: parsed.data.status, summary: parsed.data.summary, follow_up_on: parsed.data.follow_up_on ?? null,
  }).eq('id', id).eq('institution_id', session.institutionId).select('request_id')
  if (error) return dbError(error)
  if (!data?.length) return NOT_ALLOWED
  if (parsed.data.status === 'closed' && data[0].request_id) await db.from('wellbeing_requests').update({ status: 'closed' }).eq('id', data[0].request_id)
  refresh()
  return ok('Caso actualizado.')
}

export async function addIntervention(caseId: string, form: FormData): Promise<ActionResult> {
  const ctx = await actionContext('bienestar')
  if (!ctx) return NOT_ALLOWED
  const parsed = parseForm(z.object({
    kind: z.enum(['entrevista', 'observacion', 'reunion_apoderado', 'coordinacion_docente', 'derivacion', 'seguimiento']),
    notes: z.string({ required_error: 'Registra lo realizado.' }).trim().min(5, 'El registro es muy corto.').max(6000),
    occurred_on: date,
    next_follow_up_on: date.optional(),
  }), form)
  if ('error' in parsed) return parsed.error
  const { session, db } = ctx
  const { error } = await db.from('wellbeing_interventions').insert({
    institution_id: session.institutionId, case_id: caseId, professional_id: session.userId, ...parsed.data,
    next_follow_up_on: parsed.data.next_follow_up_on ?? null,
  })
  if (error) return dbError(error)
  await db.from('wellbeing_cases').update({
    ...(parsed.data.next_follow_up_on ? { follow_up_on: parsed.data.next_follow_up_on } : {}),
    ...(parsed.data.kind === 'derivacion' ? { status: 'referred' } : {}),
    updated_at: new Date().toISOString(),
  }).eq('id', caseId).eq('institution_id', session.institutionId)
  await audit(db, session, { action: 'wellbeing.intervention', entity: 'wellbeing_case', entityId: caseId, sensitive: true, metadata: { kind: parsed.data.kind } })
  refresh()
  return ok(parsed.data.next_follow_up_on ? 'Intervención registrada y seguimiento programado.' : 'Intervención registrada.')
}

// ── Análisis de ARIA guardados en el caso ───────────────────────────────────
// El formato del análisis (secciones, tono en condicional, señales de alerta) lo fijan las instrucciones del modo bienestar.

/** Le pide a ARIA un análisis del caso y lo deja guardado en su historial. ARIA recibe el caso sin nombres. */
export async function requestCaseAnalysis(caseId: string, form: FormData): Promise<ActionResult> {
  const ctx = await actionContext('bienestar')
  if (!ctx) return NOT_ALLOWED
  const parsed = parseForm(z.object({ focus: z.string().trim().max(1500).optional() }), form)
  if ('error' in parsed) return parsed.error
  const { session, db } = ctx
  const { data: kase } = await db.from('wellbeing_cases').select('id').eq('id', caseId).eq('institution_id', session.institutionId).maybeSingle()
  if (!kase) return NOT_ALLOWED
  const focus = parsed.data.focus && parsed.data.focus.length >= 2 ? parsed.data.focus : null

  const answer = await askAria(ctx, { mode: 'bienestar', scope: caseId, message: focus ? `Haz un análisis del caso con este enfoque: ${focus}` : 'Haz un análisis del caso.' })
  if (!answer.ok) return fail(answer.error)
  const { error } = await db.from('wellbeing_case_analyses').insert({
    institution_id: session.institutionId, case_id: caseId, requested_by: session.userId, focus, content: answer.text.slice(0, 12000),
  })
  if (error) return dbError(error, 'ARIA respondió, pero no se pudo guardar el análisis. Inténtalo de nuevo.')
  refresh()
  return ok('Análisis de ARIA guardado en el caso.')
}

/** Corrige el texto de un análisis. Queda marcado como editado, con quién y cuándo. */
export async function updateCaseAnalysis(id: string, form: FormData): Promise<ActionResult> {
  const ctx = await actionContext('bienestar')
  if (!ctx) return NOT_ALLOWED
  const parsed = parseForm(z.object({ content: z.string({ required_error: 'El análisis no puede quedar vacío.' }).trim().min(2, 'El análisis no puede quedar vacío.').max(12000) }), form)
  if ('error' in parsed) return parsed.error
  const { session, db } = ctx
  const { data, error } = await db.from('wellbeing_case_analyses').update({ content: parsed.data.content, edited_by: session.userId, edited_at: new Date().toISOString() })
    .eq('id', id).eq('institution_id', session.institutionId).select('case_id')
  if (error) return dbError(error)
  if (!data?.length) return NOT_ALLOWED
  await audit(db, session, { action: 'wellbeing.analysis.edit', entity: 'wellbeing_case', entityId: data[0].case_id as string, sensitive: true })
  refresh()
  return ok('Análisis actualizado.')
}

export async function deleteCaseAnalysis(id: string): Promise<ActionResult> {
  const ctx = await actionContext('bienestar')
  if (!ctx) return NOT_ALLOWED
  const { session, db } = ctx
  const { data, error } = await db.from('wellbeing_case_analyses').delete().eq('id', id).eq('institution_id', session.institutionId).select('case_id')
  if (error) return dbError(error)
  if (!data?.length) return NOT_ALLOWED
  await audit(db, session, { action: 'wellbeing.analysis.delete', entity: 'wellbeing_case', entityId: data[0].case_id as string, sensitive: true })
  refresh()
  return ok('Análisis eliminado.')
}

// ── Instrumentos de evaluación ──────────────────────────────────────────────
type Question = { id: string; text: string; type: 'scale' | 'text'; min?: number; max?: number }

export async function createTemplate(form: FormData): Promise<ActionResult> {
  const ctx = await actionContext('bienestar')
  if (!ctx) return NOT_ALLOWED
  const parsed = parseForm(z.object({
    title: z.string({ required_error: 'Ingresa un título.' }).trim().min(3).max(160),
    description: z.string().trim().max(2000).optional(),
    authorization_note: z.string({ required_error: 'Indica el respaldo de autorización.' }).trim().min(10, 'Describe la autorización o el origen del instrumento.').max(1000),
    questions: z.string({ required_error: 'Agrega al menos una pregunta.' }).trim().min(3),
    scale_max: z.coerce.number().int().min(2).max(10).default(5),
    scoring: z.enum(['none', 'sum', 'mean']).default('none'),
    scoring_note: z.string().trim().max(1000).optional(),
  }), form)
  if ('error' in parsed) return parsed.error
  const v = parsed.data
  // Una pregunta por línea. Las que empiezan con "T:" son de respuesta abierta; el resto usa la escala.
  const questions: Question[] = v.questions.split('\n').map(l => l.trim()).filter(Boolean).slice(0, 40).map((line, i) => {
    const open = /^t\s*:/i.test(line)
    const text = line.replace(/^[te]\s*:\s*/i, '').slice(0, 300)
    return open ? { id: `q${i + 1}`, text, type: 'text' } : { id: `q${i + 1}`, text, type: 'scale', min: 1, max: v.scale_max }
  })
  if (questions.length === 0) return fail('Agrega al menos una pregunta.')
  if (v.scoring !== 'none' && !questions.some(q => q.type === 'scale')) return fail('Para calcular un resultado se necesita al menos una pregunta de escala.')
  if (v.scoring !== 'none' && !v.scoring_note) return fail('Documenta la regla de cálculo: qué representa el resultado y cuáles son sus límites.')

  const { error } = await ctx.db.from('assessment_templates').insert({
    institution_id: ctx.session.institutionId, title: v.title, description: v.description ?? '', authorization_note: v.authorization_note,
    questions, scoring_rule: { type: v.scoring, note: v.scoring_note ?? '' }, status: 'draft', created_by: ctx.session.userId,
  })
  if (error) return dbError(error)
  refresh()
  return ok('Instrumento creado como borrador. Actívalo cuando esté revisado.')
}

/** Agrega a la biblioteca del colegio una plantilla de cuestionario para la familia, lista para usar. */
export async function adoptStarterTemplate(key: string): Promise<ActionResult> {
  const ctx = await actionContext('bienestar')
  if (!ctx) return NOT_ALLOWED
  const starter = STARTER_TEMPLATES.find(t => t.key === key)
  if (!starter) return fail('Esa plantilla no existe.')
  const { session, db } = ctx
  const { data: existing } = await db.from('assessment_templates').select('id').eq('institution_id', session.institutionId).eq('title', starter.title).neq('status', 'archived').limit(1)
  if (existing?.length) return fail('Esa plantilla ya está en tu biblioteca.')
  const { error } = await db.from('assessment_templates').insert({
    institution_id: session.institutionId, title: starter.title, description: starter.description, authorization_note: TEMPLATE_AUTHORIZATION,
    questions: starterQuestions(starter), scoring_rule: { type: 'none', note: '' }, status: 'active', created_by: session.userId,
    audience: 'apoderado', reading_guide: starter.readingGuide,
  })
  if (error) return dbError(error)
  refresh()
  return ok('Plantilla agregada a tu biblioteca. Ya puedes enviarla a un apoderado.')
}

/** Envía un cuestionario al apoderado de un estudiante con caso activo. El apoderado recibe solo las preguntas. */
export async function sendToGuardian(templateId: string, form: FormData): Promise<ActionResult> {
  const ctx = await actionContext('bienestar')
  if (!ctx) return NOT_ALLOWED
  const parsed = parseForm(z.object({
    student_id: z.string({ required_error: 'Elige el caso.' }).uuid('Elige el caso.'),       // el formulario identifica el caso por su estudiante
    recipient_id: z.string({ required_error: 'Elige al apoderado.' }).uuid('Elige al apoderado.'),
  }), form)
  if ('error' in parsed) return parsed.error
  const { session, db } = ctx
  const inst = session.institutionId
  const [{ data: tpl }, { data: kase }] = await Promise.all([
    db.from('assessment_templates').select('id, title, description, questions, scoring_rule, status').eq('id', templateId).eq('institution_id', inst).maybeSingle(),
    db.from('wellbeing_cases').select('id, student_id').eq('institution_id', inst).eq('student_id', parsed.data.student_id).neq('status', 'closed').order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ])
  if (!tpl || !kase) return NOT_ALLOWED
  if (tpl.status !== 'active') return fail('El instrumento no está activo.')
  const { data: pendingRequest } = await db.from('assessment_requests').select('id').eq('template_id', templateId).eq('case_id', kase.id).eq('guardian_id', parsed.data.recipient_id).eq('status', 'pending').limit(1)
  if (pendingRequest?.length) return fail('Ese apoderado ya tiene este cuestionario pendiente de responder.')

  const { error } = await db.from('assessment_requests').insert({
    institution_id: inst, template_id: templateId, case_id: kase.id, student_id: kase.student_id, guardian_id: parsed.data.recipient_id, sent_by: session.userId,
    title: tpl.title, intro: tpl.description ?? '', questions: tpl.questions, scoring_rule: tpl.scoring_rule,
  })
  if (error) return dbError(error, 'No se pudo enviar. Verifica que la persona sea apoderado de ese estudiante.')
  await audit(db, session, { action: 'wellbeing.questionnaire.send', entity: 'wellbeing_case', entityId: kase.id as string, sensitive: true })
  await notifyGuardianFromWellbeing({ institutionId: inst, institutionName: session.institutionName, guardianId: parsed.data.recipient_id, what: 'questionnaire' })
  refresh()
  revalidatePath('/apoderado', 'layout')
  return ok('Cuestionario enviado. El apoderado lo verá en «Acompañamiento».')
}

export async function cancelGuardianRequest(id: string): Promise<ActionResult> {
  const ctx = await actionContext('bienestar')
  if (!ctx) return NOT_ALLOWED
  const { data, error } = await ctx.db.from('assessment_requests').update({ status: 'cancelled' }).eq('id', id).eq('institution_id', ctx.session.institutionId).eq('status', 'pending').select('id')
  if (error) return dbError(error)
  if (!data?.length) return fail('Ese envío ya fue respondido o anulado.')
  refresh()
  revalidatePath('/apoderado', 'layout')
  return ok('Envío anulado.')
}

/** Pide a ARIA una lectura de un cuestionario respondido. Queda guardada en la aplicación, solo para el equipo. */
export async function requestResponseReading(responseId: string): Promise<ActionResult> {
  const ctx = await actionContext('bienestar')
  if (!ctx) return NOT_ALLOWED
  const { session, db } = ctx
  const { data: response } = await db.from('assessment_responses').select('id, case_id, created_at, assessment_templates(title)').eq('id', responseId).eq('institution_id', session.institutionId).maybeSingle()
  if (!response?.case_id) return NOT_ALLOWED
  const title = (response as unknown as { assessment_templates: { title: string } | null }).assessment_templates?.title ?? 'cuestionario'
  const day = String(response.created_at).slice(0, 10)
  const answer = await askAria(ctx, { mode: 'bienestar', scope: response.case_id as string, message: `Haz una lectura del cuestionario «${title}» respondido el ${day}.` })
  if (!answer.ok) return fail(answer.error)
  const { error } = await db.from('assessment_responses').update({ aria_note: answer.text.slice(0, 12000), aria_note_at: new Date().toISOString() }).eq('id', responseId).eq('institution_id', session.institutionId)
  if (error) return dbError(error, 'ARIA respondió, pero no se pudo guardar la lectura.')
  refresh()
  return ok('Lectura de ARIA guardada. Solo la ve el equipo de bienestar.')
}

export async function setTemplateStatus(id: string, status: 'draft' | 'active' | 'archived'): Promise<ActionResult> {
  const ctx = await actionContext('bienestar')
  if (!ctx) return NOT_ALLOWED
  const { error } = await ctx.db.from('assessment_templates').update({ status }).eq('id', id).eq('institution_id', ctx.session.institutionId)
  if (error) return dbError(error)
  refresh()
  return ok({ draft: 'Instrumento en borrador.', active: 'Instrumento activado.', archived: 'Instrumento archivado.' }[status])
}

/** Registra las respuestas de una aplicación y calcula el resultado según la regla documentada del instrumento. */
export async function saveResponse(templateId: string, form: FormData): Promise<ActionResult> {
  const ctx = await actionContext('bienestar')
  if (!ctx) return NOT_ALLOWED
  const parsed = parseForm(z.object({ case_id: uuid }), form)
  if ('error' in parsed) return parsed.error
  const { session, db } = ctx
  const [{ data: template }, { data: kase }] = await Promise.all([
    db.from('assessment_templates').select('questions, scoring_rule, status').eq('id', templateId).eq('institution_id', session.institutionId).maybeSingle(),
    db.from('wellbeing_cases').select('id, student_id').eq('id', parsed.data.case_id).eq('institution_id', session.institutionId).maybeSingle(),
  ])
  if (!template || !kase) return NOT_ALLOWED
  if (template.status !== 'active') return fail('El instrumento no está activo.')

  const answers: Record<string, number | string> = {}
  const values: number[] = []
  for (const q of template.questions as Question[]) {
    const raw = String(form.get(`q:${q.id}`) ?? '').trim()
    if (q.type === 'scale') {
      const n = Number(raw)
      if (!Number.isInteger(n) || n < (q.min ?? 1) || n > (q.max ?? 5)) return fail(`Responde la pregunta «${q.text}» con un valor de ${q.min ?? 1} a ${q.max ?? 5}.`)
      answers[q.id] = n
      values.push(n)
    } else if (raw) {
      answers[q.id] = raw.slice(0, 2000)
    }
  }
  const rule = (template.scoring_rule as { type: string }).type
  const sum = values.reduce((a, b) => a + b, 0)
  const score = rule === 'sum' ? sum : rule === 'mean' && values.length ? Math.round((sum / values.length) * 100) / 100 : null

  const { error } = await db.from('assessment_responses').insert({
    institution_id: session.institutionId, template_id: templateId, case_id: kase.id, student_id: kase.student_id,
    administered_by: session.userId, answers, computed_score: score,
  })
  if (error) return dbError(error)
  refresh()
  return ok('Aplicación registrada. Queda pendiente tu revisión profesional.')
}

export async function reviewResponse(id: string, form: FormData): Promise<ActionResult> {
  const ctx = await actionContext('bienestar')
  if (!ctx) return NOT_ALLOWED
  const parsed = parseForm(z.object({
    professional_review: z.string({ required_error: 'Escribe tu revisión.' }).trim().min(5, 'La revisión es muy corta.').max(4000),
    recommendations: z.string().trim().max(4000).optional(),
    follow_up_on: date.optional(),
  }), form)
  if ('error' in parsed) return parsed.error
  const { error } = await ctx.db.from('assessment_responses').update({
    professional_review: parsed.data.professional_review, recommendations: parsed.data.recommendations ?? null,
    follow_up_on: parsed.data.follow_up_on ?? null, reviewed_by: ctx.session.userId, reviewed_at: new Date().toISOString(),
  }).eq('id', id).eq('institution_id', ctx.session.institutionId)
  if (error) return dbError(error)
  refresh()
  return ok('Revisión profesional registrada.')
}
