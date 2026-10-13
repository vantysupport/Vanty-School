// Reglas de los avisos masivos por correo. Lógica pura, para poder probarla.

/** Máximo de destinatarios por aviso. Gmail limita los envíos diarios de una cuenta (unos 500 destinatarios):
 *  un comunicado a todo un colegio grande lo agotaría de una vez, así que sobre este tope no se envía por correo. */
export const bulkLimit = () => {
  const n = Number(process.env.MAIL_BULK_LIMIT)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 150
}

export const chunk = <T>(list: T[], size: number): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

export type MailReport = { sent: number; skipped: number }
export const NO_MAIL: MailReport = { sent: 0, skipped: 0 }

/** Frase que se suma al mensaje de la acción, para que quien publica sepa qué pasó con los correos. */
export function mailSummary(r: MailReport): string {
  if (r.skipped) return ` No se avisó por correo: son ${r.skipped} destinatarios y el máximo por aviso es ${bulkLimit()}.`
  if (r.sent) return ` Se avisó por correo a ${r.sent} persona${r.sent === 1 ? '' : 's'}.`
  return ''
}
