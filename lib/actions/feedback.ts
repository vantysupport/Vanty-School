'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { actionContext } from '@/lib/auth/session'
import { audit } from '@/lib/audit'
import { ARIA_ERROR_MESSAGE, AriaError, complete } from '@/lib/aria/client'
import { redact, validateResponse, wrapContext } from '@/lib/aria/guard'
import { ariaConfigured } from '@/lib/aria/providers'
import { dbError, fail, NOT_ALLOWED, ok, parseForm, type ActionResult } from '@/lib/actions/result'
import { COMMITMENT_FOCUS, currentMonth, FEEDBACK_DIMENSIONS, MIN_RESPONSES, monthLabel, type FeedbackMonth } from '@/lib/feedback'
import { FEEDBACK_INSTRUCTIONS, FEEDBACK_RETRY, feedbackReadingViolations } from '@/lib/aria/feedback-rules'
import { fetchAll } from '@/lib/supabase/fetch-all'

const uuid = z.string().uuid('Identificador inválido.')
const rating = z.coerce.number({ invalid_type_error: 'Responde todas las preguntas.' }).int().min(1, 'Responde todas las preguntas.').max(5)

const feedback = z.object({
  teacher_id: uuid, course_id: uuid, subject_id: uuid,
  claridad: rating, ritmo: rating, participacion: rating, retroalimentacion: rating, organizacion: rating, trato: rating,
  comment: z.string().trim().max(500, 'El comentario admite hasta 500 caracteres.').optional(),
})

/** Respuesta mensual de un estudiante sobre una de sus clases. Es anónima para el colegio y no se puede editar. */
export async function submitTeacherFeedback(form: FormData): Promise<ActionResult> {
  const ctx = await actionContext('estudiante')
  if (!ctx) return NOT_ALLOWED
  const parsed = parseForm(feedback, form)
  if ('error' in parsed) return fail('Responde las seis preguntas antes de enviar.')
  const { session, db } = ctx
  const { error } = await db.from('teacher_feedback').insert({
    institution_id: session.institutionId, student_id: session.userId, period_month: currentMonth(),
    ...parsed.data, comment: parsed.data.comment ?? null,
  })
  if (error) return error.code === '23505' ? fail('Ya evaluaste esta clase este mes.') : dbError(error, 'No se pudo registrar tu evaluación.')
  revalidatePath('/estudiante', 'layout')
  return ok('Gracias. Tu evaluación es anónima y ayuda a mejorar las clases.')
}

/** Pide a ARIA una lectura de mejora sobre los resultados agregados de un docente y la guarda. */
export async function analyzeTeacherFeedback(teacherId: string): Promise<ActionResult> {
  const ctx = await actionContext('directivo')
  if (!ctx) return NOT_ALLOWED
  if (!ariaConfigured()) return fail(ARIA_ERROR_MESSAGE.not_configured)
  const { session, db } = ctx
  const inst = session.institutionId

  const [{ data: summary, error: summaryError }, { data: teacher }, { data: teaching }] = await Promise.all([
    db.rpc('teacher_feedback_summary', { p_inst: inst, p_teacher: teacherId }),
    db.from('profiles').select('full_name').eq('id', teacherId).maybeSingle(),
    db.from('teacher_assignments').select('course_id, subject_id, courses(name), subjects(name)').eq('institution_id', inst).eq('teacher_id', teacherId),
  ])
  if (summaryError) return NOT_ALLOWED
  const months = (summary ?? []) as FeedbackMonth[]
  if (months.length === 0) return fail(`Aún no hay suficientes respuestas para analizar (se necesitan al menos ${MIN_RESPONSES} en un mes).`)

  const groups = (teaching ?? []) as unknown as { course_id: string; subject_id: string; courses: { name: string }; subjects: { name: string } }[]
  const label = (c: string, s: string) => { const g = groups.find(x => x.course_id === c && x.subject_id === s); return g ? `${g.subjects.name} en ${g.courses.name}` : 'un curso' }
  const courseIds = [...new Set(groups.map(g => g.course_id))]
  const [{ data: grades }, { data: enrollments }] = await Promise.all([
    courseIds.length ? fetchAll((a, b) => db.from('grades').select('course_id, subject_id, score').in('course_id', courseIds).in('subject_id', [...new Set(groups.map(x => x.subject_id))]).order('id').range(a, b)) : Promise.resolve({ data: [] }),
    courseIds.length ? db.from('course_enrollments').select('course_id').in('course_id', courseIds).eq('status', 'active') : Promise.resolve({ data: [] }),
  ])
  const names = teacher?.full_name ? [{ value: teacher.full_name as string, label: '[docente]' }] : []

  const lines = [
    `Carga: ${groups.length} asignaturas en ${courseIds.length} cursos, ${(enrollments ?? []).length} estudiantes en total.`,
    ...groups.map(g => {
      const scores = (grades ?? []).filter(x => x.course_id === g.course_id && x.subject_id === g.subject_id).map(x => Number(x.score))
      const size = (enrollments ?? []).filter(e => e.course_id === g.course_id).length
      return `- ${g.subjects.name} en ${g.courses.name}: ${size} estudiantes, promedio de notas ${scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : 'sin notas'}`
    }),
    '',
    'Evaluación de los estudiantes por mes (escala 1 a 5, del más reciente al más antiguo):',
    ...months.slice(0, 4).flatMap(m => [
      `${monthLabel(m.month)} — ${m.responses} respuestas, promedio general ${m.score}`,
      `  ${FEEDBACK_DIMENSIONS.map(d => `${d.label}: ${m.dims[d.key]}`).join(' · ')}`,
      ...m.groups.map(g => `  ${label(g.course_id, g.subject_id)}: ${g.score} (${g.responses} respuestas)`),
    ]),
    '',
    `Comentarios anónimos de ${monthLabel(months[0].month)}:`,
    ...(months[0].comments.length ? months[0].comments.slice(0, 15).map(c => `- "${redact(c, names).slice(0, 300)}"`) : ['- Sin comentarios']),
  ]

  // Lectura del mes anterior: permite a ARIA hacer seguimiento de lo que propuso.
  const { data: earlier } = await db.from('teacher_feedback_insights').select('period_month, content')
    .eq('institution_id', inst).eq('teacher_id', teacherId).lt('period_month', months[0].month).order('period_month', { ascending: false }).limit(1)
  if (earlier?.[0]) lines.push('', `Tu lectura anterior (${monthLabel(earlier[0].period_month as string)}):`, redact(String(earlier[0].content), names).slice(0, 1800))

  const { data: quota } = await db.rpc('ai_register_usage', { p_inst: inst })
  if (!quota?.allowed) return fail(quota?.reason === 'disabled' ? 'Tu colegio tiene desactivado el uso de ARIA.' : 'Alcanzaste el límite diario de consultas a ARIA.')

  try {
    const messages = [
      { role: 'system' as const, content: FEEDBACK_INSTRUCTIONS },
      { role: 'system' as const, content: wrapContext(lines.join('\n')) },
      { role: 'user' as const, content: 'Entrégame la lectura de mejora de este mes.' },
    ]
    let result = await complete(messages)
    let text = validateResponse(result.text)
    // La respuesta se comprueba contra las reglas. Si rompe alguna se pide una vez más; si insiste, no se guarda ni se muestra.
    let broken = text ? feedbackReadingViolations(text) : []
    if (text && broken.length) {
      result = await complete([...messages, { role: 'assistant' as const, content: text }, { role: 'user' as const, content: FEEDBACK_RETRY }])
      text = validateResponse(result.text)
      broken = text ? feedbackReadingViolations(text) : []
    }
    if (text && broken.length) {
      await Promise.all([
        db.rpc('ai_settle_usage', { p_inst: inst, p_tokens: result.tokensIn + result.tokensOut, p_refund: false }),
        db.from('ai_interactions').insert({ institution_id: inst, user_id: session.userId, mode: 'gestion', prompt: 'Lectura de mejora de la evaluación docente',
          context_scope: { teacherId, month: months[0].month, rules: broken }, provider: result.provider, model: result.model, status: 'blocked', error_code: 'rules' }),
      ])
      return fail('ARIA no logró una lectura que cumpla las reglas de esta sección (no calificar a la persona ni sugerir sanciones). No se guardó nada; inténtalo de nuevo.')
    }
    if (!text) throw new AriaError('empty', 'Respuesta vacía')
    const { error } = await db.from('teacher_feedback_insights').upsert({
      institution_id: inst, teacher_id: teacherId, period_month: months[0].month, content: text,
      provider: result.provider, model: result.model, created_by: session.userId, created_at: new Date().toISOString(),
    }, { onConflict: 'teacher_id,period_month,institution_id' })
    if (error) return dbError(error)
    await Promise.all([
      db.rpc('ai_settle_usage', { p_inst: inst, p_tokens: result.tokensIn + result.tokensOut, p_refund: false }),
      db.from('ai_interactions').insert({ institution_id: inst, user_id: session.userId, mode: 'gestion', prompt: 'Lectura de mejora de la evaluación docente', response: text,
        context_scope: { teacherId, month: months[0].month }, provider: result.provider, model: result.model, tokens_in: result.tokensIn, tokens_out: result.tokensOut, latency_ms: result.latencyMs, status: 'ok' }),
      audit(db, session, { action: 'feedback.analyze', entity: 'profile', entityId: teacherId }),
    ])
    revalidatePath('/direccion', 'layout')
    return ok('ARIA analizó los resultados del mes.')
  } catch (err) {
    await db.rpc('ai_settle_usage', { p_inst: inst, p_tokens: 0, p_refund: true })
    return fail(ARIA_ERROR_MESSAGE[err instanceof AriaError ? err.code : 'provider_error'])
  }
}

/** Dirección comparte (o deja de compartir) con el docente la lectura de ARIA de un mes. */
export async function shareInsight(teacherId: string, month: string, share: boolean): Promise<ActionResult> {
  const ctx = await actionContext('directivo')
  if (!ctx || !uuid.safeParse(teacherId).success || !/^\d{4}-\d{2}-01$/.test(month)) return NOT_ALLOWED
  const { data, error } = await ctx.db.from('teacher_feedback_insights').update({ shared_at: share ? new Date().toISOString() : null })
    .eq('institution_id', ctx.session.institutionId).eq('teacher_id', teacherId).eq('period_month', month).select('id')
  if (error) return dbError(error)
  if (!data?.length) return NOT_ALLOWED
  await audit(ctx.db, ctx.session, { action: share ? 'feedback.share' : 'feedback.unshare', entity: 'profile', entityId: teacherId })
  revalidatePath('/direccion', 'layout'); revalidatePath('/docente', 'layout')
  return ok(share ? 'El docente ya puede leer esta lectura en su panel.' : 'La lectura dejó de estar visible para el docente.')
}

const commitment = z.object({
  focus: z.enum(COMMITMENT_FOCUS.map(f => f.key) as [string, ...string[]], { errorMap: () => ({ message: 'Elige el aspecto.' }) }),
  action: z.string({ required_error: 'Escribe la estrategia.' }).trim().min(5, 'Describe la estrategia con un poco más de detalle.').max(1000),
})

/** El docente registra una estrategia que va a aplicar en sus clases. */
export async function addCommitment(form: FormData): Promise<ActionResult> {
  const ctx = await actionContext('docente')
  if (!ctx) return NOT_ALLOWED
  const parsed = parseForm(commitment, form)
  if ('error' in parsed) return parsed.error
  const { error } = await ctx.db.from('teaching_commitments').insert({
    institution_id: ctx.session.institutionId, teacher_id: ctx.session.userId, period_month: currentMonth(), focus: parsed.data.focus, action: parsed.data.action,
  })
  if (error) return dbError(error)
  revalidatePath('/docente', 'layout'); revalidatePath('/direccion', 'layout')
  return ok('Estrategia registrada.')
}

/** El docente actualiza el estado de su estrategia y anota cómo le fue. */
export async function updateCommitment(id: string, form: FormData): Promise<ActionResult> {
  const ctx = await actionContext('docente')
  if (!ctx || !uuid.safeParse(id).success) return NOT_ALLOWED
  const parsed = parseForm(z.object({ status: z.enum(['planned', 'in_progress', 'done']), reflection: z.string().trim().max(1000).optional() }), form)
  if ('error' in parsed) return parsed.error
  const { data, error } = await ctx.db.from('teaching_commitments').update({ status: parsed.data.status, reflection: parsed.data.reflection || null })
    .eq('id', id).eq('teacher_id', ctx.session.userId).select('id')
  if (error) return dbError(error)
  if (!data?.length) return NOT_ALLOWED
  revalidatePath('/docente', 'layout'); revalidatePath('/direccion', 'layout')
  return ok('Estrategia actualizada.')
}

export async function deleteCommitment(id: string): Promise<ActionResult> {
  const ctx = await actionContext('docente')
  if (!ctx || !uuid.safeParse(id).success) return NOT_ALLOWED
  const { data, error } = await ctx.db.from('teaching_commitments').delete().eq('id', id).eq('teacher_id', ctx.session.userId).select('id')
  if (error) return dbError(error)
  if (!data?.length) return NOT_ALLOWED
  revalidatePath('/docente', 'layout'); revalidatePath('/direccion', 'layout')
  return ok('Estrategia eliminada.')
}
