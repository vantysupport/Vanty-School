import 'server-only'
import { adminClient, hasServiceRole } from '@/lib/supabase/admin'
import { appBaseUrl, mailConfigured, sendEmail } from '@/lib/email/send'
import { newMessageEmail } from '@/lib/email/templates'
import { messagesPath, pickRecipients, type Participant } from '@/lib/email/recipients'

/** Avisa por correo a quienes recibieron un mensaje. El correo no lleva el texto ni el nombre del estudiante:
 *  solo quién escribió y un enlace a la plataforma. Nunca interrumpe el envío del mensaje.
 *  Usa la clave de servicio solo para leer los correos de los participantes de ESA conversación, que quien envía
 *  ya demostró poder usar (la base aceptó su mensaje). */
export async function notifyNewMessage(o: {
  conversationId: string; institutionId: string; institutionName: string
  senderId: string; senderName: string; previousLastMessageAt: string | null; meeting?: boolean
}): Promise<number> {
  const site = appBaseUrl()
  if (!mailConfigured() || !hasServiceRole() || !site) return 0
  try {
    const admin = adminClient()
    const { data: rows } = await admin.from('conversation_participants').select('user_id, last_read_at').eq('conversation_id', o.conversationId)
    const ids = (rows ?? []).map(r => r.user_id as string).filter(id => id !== o.senderId)
    if (!ids.length) return 0
    const [{ data: members }, { data: profiles }] = await Promise.all([
      admin.from('institution_memberships').select('user_id, role').eq('institution_id', o.institutionId).eq('status', 'active').in('user_id', ids),
      admin.from('profiles').select('id, full_name, email').in('id', ids),
    ])
    const participants: Participant[] = (rows ?? []).map(r => {
      const p = profiles?.find(x => x.id === r.user_id)
      return {
        userId: r.user_id as string, lastReadAt: r.last_read_at as string | null,
        role: (members?.find(m => m.user_id === r.user_id)?.role as string | undefined) ?? null,
        email: (p?.email as string | null) ?? null, name: (p?.full_name as string) || '',
      }
    })
    const results = await Promise.all(pickRecipients(participants, o.senderId, o.previousLastMessageAt).map(p =>
      sendEmail(p.email!, newMessageEmail({ name: p.name, from: o.senderName, school: o.institutionName, link: `${site}${messagesPath(p.role)}`, meeting: o.meeting, siteUrl: site }), o.institutionName)))
    return results.filter(Boolean).length
  } catch (e) {
    console.error('[email] aviso de mensaje:', e instanceof Error ? e.message : e)
    return 0
  }
}
