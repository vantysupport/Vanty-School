import { NextResponse } from 'next/server'
import { z } from 'zod'
import { actionContext } from '@/lib/auth/session'
import { askAria } from '@/lib/aria/ask'
import { MAX_MESSAGE_CHARS } from '@/lib/aria/guard'
import { ARIA_MODES } from '@/lib/aria/modes'

export const maxDuration = 60

const body = z.object({
  mode: z.enum(ARIA_MODES),
  message: z.string().trim().min(2).max(MAX_MESSAGE_CHARS),
  scope: z.string().max(80).nullable().optional(),
  history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(6000) })).max(20).optional(),
})

const reply = (error: string, status: number, code?: string) => NextResponse.json({ error, code }, { status })

// El chat de ARIA. Las reglas (rol, contexto autorizado, cupo, validación y registro) viven en askAria.
export async function POST(req: Request) {
  const ctx = await actionContext()
  if (!ctx) return reply('No autorizado', 401)

  const parsed = body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return reply('Consulta inválida. Escribe un mensaje de hasta 1.500 caracteres.', 400)

  const answer = await askAria(ctx, parsed.data)
  if (!answer.ok) return reply(answer.error, answer.status, answer.code)
  return NextResponse.json({ text: answer.text, provider: answer.provider, model: answer.model, used: answer.used, limit: answer.limit })
}
