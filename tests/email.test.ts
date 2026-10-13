import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { emailLayout, escHtml } from '@/lib/email/layout'
import { invitationEmail, newMessageEmail, recoveryEmail, staffInvitationEmail } from '@/lib/email/templates'
import { messagesPath, pickRecipients, type Participant } from '@/lib/email/recipients'
import { isDeliverable, mailConfigured, sendEmail } from '@/lib/email/send'

describe('plantilla de correos', () => {
  it('escapa el HTML de los datos que escriben las personas', () => {
    const mail = invitationEmail({ name: '<script>alert(1)</script> Ana', school: 'Colegio "Los <b>Aromos</b>"', roleLabel: 'Secretaría', link: 'https://vanty.example/invitacion/abc', days: 7 })
    expect(mail.html).not.toContain('<script>alert(1)</script>')
    expect(mail.html).not.toContain('<b>Aromos</b>')
    expect(mail.html).toContain('&lt;b&gt;Aromos&lt;/b&gt;')
    expect(escHtml(`a&b<c>"d'`)).toBe('a&amp;b&lt;c&gt;&quot;d&#39;')
  })

  it('la invitación lleva el enlace, el perfil y el plazo, y avisa cuando la cuenta es de un estudiante', () => {
    const link = 'https://vanty.example/invitacion/TOKEN123'
    const mail = invitationEmail({ name: 'Camila Soto', school: 'Colegio Los Aromos', roleLabel: 'Estudiante', link, days: 5, managed: true })
    expect(mail.subject).toBe('Colegio Los Aromos te invitó a Vanty School')
    expect(mail.html).toContain(`href="${link}"`)
    expect(mail.html).toContain('Hola, Camila')
    expect(mail.html).toContain('vence en 5 días')
    expect(mail.html).toContain('junto a su apoderado')
    expect(invitationEmail({ name: 'Luis', school: 'C', roleLabel: 'Docente', link, days: 7 }).html).not.toContain('junto a su apoderado')
  })

  it('el aviso de mensaje no incluye el texto del mensaje ni datos del estudiante', () => {
    const mail = newMessageEmail({ name: 'Andrea Díaz', from: 'Marcela Rojas', school: 'Colegio Futuro Andino', link: 'https://vanty.example/apoderado/mensajes' })
    expect(mail.html).toContain('Marcela Rojas')
    expect(mail.html).toContain('solo se muestra dentro de la plataforma')
    expect(newMessageEmail({ name: 'A', from: 'B', school: 'C', link: 'https://x.cl', meeting: true }).subject).toMatch(/reunión/)
  })

  it('recuperación e invitación al equipo llevan su enlace', () => {
    expect(recoveryEmail({ link: 'https://vanty.example/auth/confirm?token_hash=abc&type=recovery' }).html).toContain('token_hash=abc&amp;type=recovery')
    expect(staffInvitationEmail({ name: 'Andrés', link: 'https://vanty.example/invitacion/x' }).html).toContain('panel de plataforma')
  })

  it('solo incluye imágenes cuando el sitio tiene una dirección pública https', () => {
    const base = { subject: 'S', title: 'T', intro: 'I' }
    expect(emailLayout({ ...base, siteUrl: 'http://localhost:3000' })).not.toContain('<img')
    expect(emailLayout({ ...base, siteUrl: null })).not.toContain('<img')
    expect(emailLayout({ ...base, siteUrl: 'https://school.vanty.xyz/' })).toContain('src="https://school.vanty.xyz/aria/pose-1.webp"')
  })
})

describe('a quién se le avisa de un mensaje', () => {
  const p = (over: Partial<Participant>): Participant => ({ userId: 'u', role: 'apoderado', lastReadAt: null, email: 'a@colegio.cl', name: 'A', ...over })

  it('en una conversación nueva avisa a los adultos, nunca a quien escribe ni a estudiantes', () => {
    const list = [p({ userId: 'docente', role: 'docente' }), p({ userId: 'apoderado' }), p({ userId: 'estudiante', role: 'estudiante' })]
    expect(pickRecipients(list, 'docente', null).map(x => x.userId)).toEqual(['apoderado'])
  })

  it('no vuelve a avisar a quien ya tenía mensajes sin leer', () => {
    const before = '2026-10-13T10:00:00Z'
    const alDia = p({ userId: 'al-dia', lastReadAt: '2026-10-13T10:05:00Z' })
    const atrasado = p({ userId: 'atrasado', lastReadAt: '2026-10-13T09:00:00Z' })
    const nunca = p({ userId: 'nunca', lastReadAt: null })
    expect(pickRecipients([alDia, atrasado, nunca], 'otro', before).map(x => x.userId)).toEqual(['al-dia'])
  })

  it('omite cuentas sin correo o sin acceso vigente al colegio', () => {
    expect(pickRecipients([p({ userId: 'a', email: null }), p({ userId: 'b', role: null })], 'x', null)).toEqual([])
  })

  it('lleva a cada rol a su bandeja de mensajes', () => {
    expect(messagesPath('apoderado')).toBe('/apoderado/mensajes')
    expect(messagesPath('docente')).toBe('/docente/mensajes')
    expect(messagesPath('directivo')).toBe('/')
  })
})

describe('envío', () => {
  it('no escribe a direcciones de prueba como las de la demostración', () => {
    expect(isDeliverable('ana@colegio.cl')).toBe(true)
    for (const email of ['est06@futuroandino.example', 'x@prueba.test', 'x@example.com', 'sin-arroba', 'a@b']) expect(isDeliverable(email), email).toBe(false)
  })

  it('sin credenciales configuradas no envía y no falla', async () => {
    vi.stubEnv('GMAIL_USER', ''); vi.stubEnv('GMAIL_PASS', '')
    expect(mailConfigured()).toBe(false)
    await expect(sendEmail('ana@colegio.cl', { subject: 'S', html: '<p>h</p>' })).resolves.toBe(false)
    vi.unstubAllEnvs()
  })
})
