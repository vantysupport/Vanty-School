import 'server-only'
import { providers, type Provider, type ProviderId } from '@/lib/aria/providers'

// Cliente central de ARIA. Recorre proveedores y modelos hasta obtener una respuesta:
//   429 / 413 / 404 / 5xx / timeout → siguiente modelo o proveedor.   401 / 403 → siguiente proveedor.
// Basado en lib/groq-client.ts de VANTY ABA, con tiempo de espera, tope de tokens y errores tipados.

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

export type Completion = {
  text: string
  provider: ProviderId
  model: string
  tokensIn: number
  tokensOut: number
  latencyMs: number
}

export class AriaError extends Error {
  constructor(public code: 'not_configured' | 'rate_limited' | 'timeout' | 'provider_error' | 'empty', message: string) {
    super(message)
    this.name = 'AriaError'
  }
}

const TIMEOUT_MS = Number(process.env.ARIA_TIMEOUT_MS) || 25_000
const MAX_OUTPUT_TOKENS = Number(process.env.ARIA_MAX_OUTPUT_TOKENS) || 1400

type Attempt = { ok: true; completion: Completion } | { ok: false; kind: 'next_model' | 'next_provider'; code: AriaError['code'] }

async function attempt(provider: Provider, model: string, messages: ChatMessage[]): Promise<Attempt> {
  const started = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(provider.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${provider.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, temperature: 0.4, max_tokens: MAX_OUTPUT_TOKENS, stream: false }),
      signal: controller.signal,
      cache: 'no-store',
    })
    if (!res.ok) {
      // Solo se registra el estado: el cuerpo del error puede repetir parte del prompt.
      console.warn(`[ARIA] ${provider.id} · ${model} → HTTP ${res.status}`)
      if (res.status === 401 || res.status === 403) return { ok: false, kind: 'next_provider', code: 'provider_error' }
      return { ok: false, kind: 'next_model', code: res.status === 429 ? 'rate_limited' : 'provider_error' }
    }
    const data = await res.json()
    const text = String(data?.choices?.[0]?.message?.content ?? '').trim()
    if (!text) return { ok: false, kind: 'next_model', code: 'empty' }
    return {
      ok: true,
      completion: {
        text, provider: provider.id, model,
        tokensIn: Number(data?.usage?.prompt_tokens) || 0,
        tokensOut: Number(data?.usage?.completion_tokens) || 0,
        latencyMs: Date.now() - started,
      },
    }
  } catch (err) {
    const timedOut = (err as Error)?.name === 'AbortError'
    console.warn(`[ARIA] ${provider.id} · ${model} → ${timedOut ? 'timeout' : 'error de red'}`)
    return { ok: false, kind: 'next_model', code: timedOut ? 'timeout' : 'provider_error' }
  } finally {
    clearTimeout(timer)
  }
}

export async function complete(messages: ChatMessage[]): Promise<Completion> {
  const list = providers()
  if (list.length === 0) throw new AriaError('not_configured', 'No hay ningún proveedor de IA configurado')

  let last: AriaError['code'] = 'provider_error'
  for (const provider of list) {
    for (const model of provider.models) {
      const result = await attempt(provider, model, messages)
      if (result.ok) return result.completion
      last = result.code
      if (result.kind === 'next_provider') break
    }
  }
  throw new AriaError(last, 'Ningún proveedor de IA pudo responder')
}

export const ARIA_ERROR_MESSAGE: Record<AriaError['code'], string> = {
  not_configured: 'ARIA aún no está configurada en este entorno: falta la clave de Groq o de DeepInfra en el servidor.',
  rate_limited: 'ARIA está recibiendo muchas consultas en este momento. Inténtalo de nuevo en un minuto.',
  timeout: 'ARIA tardó demasiado en responder. Inténtalo de nuevo.',
  provider_error: 'ARIA no está disponible en este momento. Inténtalo más tarde.',
  empty: 'ARIA no pudo generar una respuesta. Reformula tu consulta e inténtalo de nuevo.',
}
