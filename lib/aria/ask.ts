import 'server-only'
import type { Session } from '@/lib/auth/session'
import type { DB } from '@/lib/supabase/server'
import { audit } from '@/lib/audit'
import { ARIA_ERROR_MESSAGE, AriaError, complete, type ChatMessage } from '@/lib/aria/client'
import { buildContext } from '@/lib/aria/context'
import { looksLikeInjection, MAX_HISTORY_TURNS, sanitize, validateResponse, wrapContext, wrapQuery } from '@/lib/aria/guard'
import { MODES, type AriaMode } from '@/lib/aria/modes'
import { ariaConfigured } from '@/lib/aria/providers'

export type AriaAnswer =
  | { ok: true; text: string; provider: string; model: string; used: number; limit: number }
  | { ok: false; error: string; status: number; code?: string }

/** Una consulta a ARIA de principio a fin: rol, contexto autorizado, cupo, modelo, validación y registro.
 *  La usan el chat (/api/aria) y los análisis que se guardan dentro de un caso; las reglas son las mismas en ambos. */
export async function askAria(ctx: { session: Session; db: DB }, input: {
  mode: AriaMode; message: string; scope?: string | null; history?: { role: 'user' | 'assistant'; content: string }[]
}): Promise<AriaAnswer> {
  const { session, db } = ctx
  const { mode, scope = null, history = [] } = input
  const config = MODES[mode]

  // 1. El modo debe corresponder al rol de quien pregunta.
  if (!config.roles.includes(session.role)) return { ok: false, error: 'Tu perfil no tiene acceso a este modo de ARIA.', status: 403 }
  if (!ariaConfigured()) return { ok: false, error: ARIA_ERROR_MESSAGE.not_configured, status: 503, code: 'not_configured' }

  // 2. El servidor arma el contexto y verifica la relación con los datos antes de gastar cupo.
  const context = await buildContext(db, session, mode, scope || null)
  if (!context.ok) return { ok: false, error: context.error, status: 403 }

  // 3. Cupo diario por usuario (lo fija cada colegio).
  const { data: quota, error: quotaError } = await db.rpc('ai_register_usage', { p_inst: session.institutionId })
  if (quotaError) return { ok: false, error: 'No se pudo verificar tu cupo de consultas.', status: 500 }
  if (!quota?.allowed) {
    return { ok: false, status: 429, code: 'quota', error: quota?.reason === 'disabled'
      ? 'Tu colegio tiene desactivado el uso de ARIA.'
      : `Alcanzaste el límite diario de consultas a ARIA (${quota?.limit}). Podrás volver a consultar mañana.` }
  }

  const message = sanitize(input.message)
  const flagged = looksLikeInjection(message)
  const messages: ChatMessage[] = [
    { role: 'system', content: config.instructions },
    { role: 'system', content: wrapContext(context.text) },
    ...history.slice(-MAX_HISTORY_TURNS).map(h => ({ role: h.role, content: sanitize(h.content, 4000) })),
    { role: 'user', content: wrapQuery(message, flagged) },
  ]

  const log = (fields: Record<string, unknown>) => db.from('ai_interactions').insert({
    institution_id: session.institutionId, user_id: session.userId, mode, prompt: message,
    context_scope: { ...context.scope, flagged }, ...fields,
  })

  try {
    const result = await complete(messages)
    const text = validateResponse(result.text)
    if (!text) throw new AriaError('empty', 'Respuesta vacía')

    await Promise.all([
      log({ response: text, provider: result.provider, model: result.model, tokens_in: result.tokensIn, tokens_out: result.tokensOut, latency_ms: result.latencyMs, status: 'ok' }),
      db.rpc('ai_settle_usage', { p_inst: session.institutionId, p_tokens: result.tokensIn + result.tokensOut, p_refund: false }),
      mode === 'bienestar' && context.scope.caseId
        ? audit(db, session, { action: 'wellbeing.aria', entity: 'wellbeing_case', entityId: String(context.scope.caseId), sensitive: true })
        : null,
    ])
    return { ok: true, text, provider: result.provider, model: result.model, used: quota.used, limit: quota.limit }
  } catch (err) {
    const code = err instanceof AriaError ? err.code : 'provider_error'
    if (!(err instanceof AriaError)) console.error('[ARIA] error inesperado', (err as Error)?.message)
    // La consulta no obtuvo respuesta: se devuelve el cupo.
    await Promise.all([
      log({ status: 'error', error_code: code }),
      db.rpc('ai_settle_usage', { p_inst: session.institutionId, p_tokens: 0, p_refund: true }),
    ])
    return { ok: false, error: ARIA_ERROR_MESSAGE[code], status: code === 'rate_limited' ? 429 : 502, code }
  }
}
