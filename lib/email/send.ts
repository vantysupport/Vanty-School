import 'server-only'
import { createTransport, type Transporter } from 'nodemailer'
import { chunk } from '@/lib/email/bulk'

// Envío de correos por Gmail SMTP con Nodemailer, igual que VANTY ABA.
// Variables (solo servidor): GMAIL_USER y GMAIL_PASS (contraseña de aplicación de 16 caracteres).
// Sin ellas no se envía nada y la aplicación sigue funcionando: los enlaces se muestran en pantalla.

export const mailConfigured = () => !!(process.env.GMAIL_USER && process.env.GMAIL_PASS)

/** Dirección pública para los enlaces de los correos. Nunca sale de la cabecera Host de la petición:
 *  se podría falsificar para robar enlaces de un solo uso. */
export function appBaseUrl(): string | null {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '')
  if (configured) return configured
  return process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : null
}

/** Dominios reservados para pruebas (RFC 2606): las cuentas de demostración usan «.example» y no reciben correo. */
export const isDeliverable = (email: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) && !/\.(example|test|invalid|localhost)$/i.test(email) && !/@example\.(com|org|net)$/i.test(email)

let cached: Transporter | null = null
function transporter(): Transporter | null {
  const user = process.env.GMAIL_USER
  const pass = process.env.GMAIL_PASS?.replace(/\s/g, '')   // la contraseña de aplicación se copia con espacios
  if (!user || !pass) return null
  // Nodemailer 8: SMTP directo (service: 'gmail' ya no existe).
  cached ??= createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user, pass } })
  return cached
}

/** Envía el mismo correo a muchas personas, en copia oculta y por tandas: nadie ve las direcciones de los demás.
 *  Devuelve a cuántas personas se envió. Las direcciones repetidas o de prueba se descartan. */
export async function sendBulk(recipients: string[], mail: { subject: string; html: string }, fromName = 'Vanty School'): Promise<number> {
  const list = [...new Set(recipients.map(e => e.trim().toLowerCase()))].filter(isDeliverable)
  const t = transporter()
  if (!t || !list.length) return 0
  let sent = 0
  for (const group of chunk(list, 40)) {
    try {
      await t.sendMail({ from: `"${fromName.replace(/["\r\n]/g, '')}" <${process.env.GMAIL_USER}>`, to: process.env.GMAIL_USER, bcc: group, subject: mail.subject, html: mail.html })
      sent += group.length
    } catch (e) {
      console.error('[email] no se pudo enviar una tanda:', e instanceof Error ? e.message : e)
    }
  }
  return sent
}

/** Envía un correo. Devuelve false si no hay configuración, si la dirección es de prueba o si falla el envío.
 *  Nunca lanza: un correo que no sale no debe interrumpir la acción principal.
 *  `fromName`: nombre visible del remitente (el colegio o «Vanty School»). */
export async function sendEmail(to: string, mail: { subject: string; html: string }, fromName = 'Vanty School'): Promise<boolean> {
  if (!isDeliverable(to)) return false
  const t = transporter()
  if (!t) return false
  try {
    await t.sendMail({ from: `"${fromName.replace(/["\r\n]/g, '')}" <${process.env.GMAIL_USER}>`, to, subject: mail.subject, html: mail.html })
    return true
  } catch (e) {
    console.error('[email] no se pudo enviar:', e instanceof Error ? e.message : e)
    return false
  }
}
