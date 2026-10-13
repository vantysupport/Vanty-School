import type { z } from 'zod'

export type ActionResult =
  | { ok: true; message?: string; reveal?: { label: string; value: string; note?: string } }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }

export const ok = (message?: string, reveal?: { label: string; value: string; note?: string }): ActionResult => ({ ok: true, message, reveal })
export const fail = (error: string, fieldErrors?: Record<string, string>): ActionResult => ({ ok: false, error, fieldErrors })

export const NOT_ALLOWED = fail('No tienes permiso para realizar esta acción.')

/** Valida un FormData contra un esquema zod. Los campos vacíos llegan como undefined. */
export function parseForm<T extends z.ZodTypeAny>(schema: T, form: FormData): { data: z.infer<T> } | { error: ActionResult } {
  const raw: Record<string, unknown> = {}
  for (const key of new Set(form.keys())) {
    const all = form.getAll(key).filter((v): v is string => typeof v === 'string')
    if (key.endsWith('[]')) raw[key.slice(0, -2)] = all.filter(v => v !== '')
    else raw[key] = all[0] === '' ? undefined : all[0]
  }
  const parsed = schema.safeParse(raw)
  if (parsed.success) return { data: parsed.data }
  const fieldErrors: Record<string, string> = {}
  for (const issue of parsed.error.issues) {
    const k = String(issue.path[0] ?? '')
    if (k && !fieldErrors[k]) fieldErrors[k] = issue.message
  }
  return { error: fail('Revisa los campos marcados.', fieldErrors) }
}

/** Traduce errores de Postgres/PostgREST a un mensaje útil sin filtrar detalles internos. */
export function dbError(error: { code?: string; message?: string } | null, fallback = 'No se pudo guardar. Inténtalo de nuevo.'): ActionResult {
  if (!error) return fail(fallback)
  if (error.code === '23505') return fail('Ya existe un registro con esos datos.')
  if (error.code === '23503') return fail('No se puede completar: hay registros relacionados que lo impiden.')
  if (error.code === '42501' || /row-level security/i.test(error.message ?? '')) return NOT_ALLOWED
  if (error.code === '23514') return fail('Algún valor está fuera del rango permitido.')
  console.error('[db]', error.code, error.message)
  return fail(fallback)
}
