// A quién se le avisa por correo de un mensaje nuevo. Lógica pura, sin acceso a datos, para poder probarla.

export type Participant = { userId: string; role: string | null; lastReadAt: string | null; email: string | null; name: string }

const MESSAGES_PATH: Record<string, string> = { apoderado: '/apoderado/mensajes', docente: '/docente/mensajes', bienestar: '/bienestar/mensajes' }
export const messagesPath = (role: string | null) => (role && MESSAGES_PATH[role]) || '/'

/**
 * - Nunca a quien envió el mensaje.
 * - Nunca a estudiantes: sus mensajes van con copia al apoderado, que es quien recibe el aviso.
 * - Solo a cuentas activas del colegio (role distinto de null) y con correo.
 * - Un solo aviso por tanda: si la persona ya tenía un mensaje sin leer en esa conversación, no se le escribe de nuevo.
 */
export function pickRecipients(participants: Participant[], senderId: string, previousLastMessageAt: string | null): Participant[] {
  return participants.filter(p => {
    if (p.userId === senderId || !p.role || p.role === 'estudiante' || !p.email) return false
    if (!previousLastMessageAt) return true                       // conversación nueva
    if (!p.lastReadAt) return false                               // nunca la abrió: ya fue avisado al crearse
    return new Date(p.lastReadAt) >= new Date(previousLastMessageAt)   // estaba al día: este es su primer mensaje sin leer
  })
}
