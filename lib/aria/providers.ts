import 'server-only'

// Adaptadores de proveedores de IA (API compatible con OpenAI), portados de lib/proveedores-ia.ts de VANTY ABA.
// Groq es el principal y DeepInfra el respaldo automático. Las claves solo existen en el servidor.
// Nota: Groq (proveedor de inferencia) no es Grok.

export type ProviderId = 'groq' | 'deepinfra'
export type Provider = { id: ProviderId; url: string; key: string; models: string[] }

const dedupe = (list: (string | undefined)[]) => [...new Set(list.filter((m): m is string => !!m))]

/** Proveedores configurados, en orden de preferencia; cada uno con su cadena de modelos de respaldo. */
export function providers(): Provider[] {
  const list: Provider[] = []
  if (process.env.GROQ_API_KEY) {
    list.push({
      id: 'groq',
      url: 'https://api.groq.com/openai/v1/chat/completions',
      key: process.env.GROQ_API_KEY,
      models: dedupe([process.env.GROQ_MODEL, 'openai/gpt-oss-120b', process.env.GROQ_MODEL_FAST, 'openai/gpt-oss-20b']),
    })
  }
  if (process.env.DEEPINFRA_API_KEY) {
    list.push({
      id: 'deepinfra',
      url: 'https://api.deepinfra.com/v1/openai/chat/completions',
      key: process.env.DEEPINFRA_API_KEY,
      models: dedupe([process.env.DEEPINFRA_MODEL, 'openai/gpt-oss-120b', process.env.DEEPINFRA_MODEL_FAST, 'openai/gpt-oss-20b']),
    })
  }
  return list
}

export const ariaConfigured = () => !!(process.env.GROQ_API_KEY || process.env.DEEPINFRA_API_KEY)
