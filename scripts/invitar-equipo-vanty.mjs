// Crea la invitación para la PRIMERA persona del equipo Vanty (después, el resto se invita desde el panel).
// Uso:  npm run plataforma:invitar -- correo@ejemplo.cl "Nombre Apellido"
//
// Lee la clave service_role de .env.local (solo servidor) y muestra un enlace de un solo uso, válido 7 días.
// No crea contraseñas: la persona define la suya al abrir el enlace.
import { createHash, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split(/\r?\n/)
  .filter(l => l && !l.startsWith('#') && l.includes('=')).map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]))

const [email, ...rest] = process.argv.slice(2)
const name = rest.join(' ').trim()
if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || name.length < 3) {
  console.error('Uso: npm run plataforma:invitar -- correo@ejemplo.cl "Nombre Apellido"')
  process.exit(1)
}
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local.')
  process.exit(1)
}

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const token = randomBytes(32).toString('base64url')
const { error } = await db.from('platform_invitations').insert({
  email: email.toLowerCase(), full_name: name, token_hash: createHash('sha256').update(token).digest('hex'),
  expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
})
if (error) { console.error('No se pudo crear la invitación:', error.message); process.exit(1) }

const origin = env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
console.log(`\nInvitación al equipo Vanty para ${name} <${email.toLowerCase()}>`)
console.log(`\n  ${origin}/invitacion/${token}\n`)
console.log('Vence en 7 días y sirve una sola vez. Quien la use podrá crear y suspender colegios.\n')
