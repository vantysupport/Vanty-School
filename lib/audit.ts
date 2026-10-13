import 'server-only'
import type { DB } from '@/lib/supabase/server'
import type { Session } from '@/lib/auth/session'

type Entry = { action: string; entity?: string; entityId?: string; sensitive?: boolean; metadata?: Record<string, unknown> }

/** Registra una acción en la auditoría del colegio. Nunca interrumpe la operación principal. */
export async function audit(db: DB, session: Session, entry: Entry) {
  const { error } = await db.from('audit_logs').insert({
    institution_id: session.institutionId,
    actor_id: session.userId,
    action: entry.action,
    entity: entry.entity ?? null,
    entity_id: entry.entityId ?? null,
    sensitive: entry.sensitive ?? false,
    metadata: entry.metadata ?? {},
  })
  if (error) console.error('[audit]', entry.action, error.message)
}

export const AUDIT_LABEL: Record<string, string> = {
  'demo.seed': 'Carga de datos de demostración',
  'platform.institution.create': 'Colegio creado por el equipo Vanty',
  'platform.institution.update': 'Datos del colegio editados por el equipo Vanty',
  'platform.institution.status': 'Colegio suspendido o reactivado por el equipo Vanty',
  'user.invite': 'Invitación creada',
  'user.invite.revoke': 'Invitación revocada',
  'user.invite.accept': 'Invitación aceptada',
  'user.update': 'Datos de usuario editados',
  'year.close': 'Cierre de año escolar',
  'year.congratulate': 'Felicitación a curso que egresa',
  'user.record.update': 'Ficha personal editada',
  'student.incident.add': 'Incidencia registrada',
  'student.incident.delete': 'Incidencia eliminada',
  'user.role': 'Cambio de rol',
  'user.suspend': 'Cuenta desactivada',
  'user.reactivate': 'Cuenta reactivada',
  'user.remove': 'Usuario retirado de la institución',
  'user.sessions.revoke': 'Sesiones revocadas',
  'user.deletion.request': 'Solicitud de eliminación',
  'user.anonymize': 'Cuenta anonimizada',
  'guardian.link': 'Apoderado vinculado',
  'guardian.unlink': 'Vínculo de apoderado eliminado',
  'enrollment.create': 'Matrícula registrada',
  'enrollment.withdraw': 'Matrícula retirada',
  'academic.create': 'Estructura académica creada',
  'academic.delete': 'Estructura académica eliminada',
  'settings.update': 'Configuración actualizada',
  'grade.save': 'Calificación registrada',
  'wellbeing.request.view': 'Acceso a solicitud de bienestar',
  'wellbeing.case.view': 'Acceso a caso de bienestar',
  'wellbeing.case.open': 'Caso de bienestar abierto',
  'wellbeing.intervention': 'Intervención registrada',
  'wellbeing.aria': 'Consulta a ARIA Bienestar',
  'report.view': 'Acceso a reclamo o denuncia',
  'report.update': 'Reclamo o denuncia actualizado',
  'feedback.analyze': 'Análisis de ARIA sobre evaluación docente',
  'student.view': 'Consulta de ficha académica de estudiante',
}
