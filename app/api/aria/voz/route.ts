import { NextResponse } from 'next/server'
import { actionContext } from '@/lib/auth/session'
import { modeForRole } from '@/lib/aria/modes'
import { synthesize } from '@/lib/aria/tts'

// Voz de ARIA: convierte en audio un fragmento de una respuesta. Solo para quienes pueden usar ARIA.
// El audio no se guarda en ningún lado; el texto se envía al servicio de voz para generarlo.
export const runtime = 'nodejs'

const MAX_CHARS = 600           // el navegador pide la respuesta por oraciones
const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 60       // fragmentos por persona y minuto
const recent = new Map<string, number[]>()

export async function POST(req: Request) {
  const ctx = await actionContext()
  if (!ctx) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!modeForRole(ctx.session.role)) return NextResponse.json({ error: 'ARIA no está disponible para tu rol' }, { status: 403 })

  const now = Date.now()
  const calls = (recent.get(ctx.session.userId) ?? []).filter(t => now - t < WINDOW_MS)
  if (calls.length >= MAX_PER_WINDOW) return NextResponse.json({ error: 'Demasiadas solicitudes de voz. Espera un momento.' }, { status: 429 })
  recent.set(ctx.session.userId, [...calls, now])
  if (recent.size > 2000) recent.delete(recent.keys().next().value as string)

  const body = await req.json().catch(() => null) as { text?: unknown } | null
  const text = typeof body?.text === 'string' ? body.text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_CHARS) : ''
  if (!text) return NextResponse.json({ error: 'Texto requerido' }, { status: 400 })

  try {
    const audio = await synthesize(text)
    if (audio.length === 0) return NextResponse.json({ error: 'No se pudo generar el audio' }, { status: 502 })
    return new NextResponse(new Uint8Array(audio), { headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'La voz no está disponible en este momento' }, { status: 502 })
  }
}
