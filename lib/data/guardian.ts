import 'server-only'
import { cookies } from 'next/headers'
import type { DB } from '@/lib/supabase/server'
import type { Session } from '@/lib/auth/session'

export type Pupil = { id: string; name: string; relationship: string }

/** Estudiantes vinculados al apoderado. Es la única lista de estudiantes que su panel puede usar. */
export async function guardianStudents(db: DB, session: Session): Promise<Pupil[]> {
  const { data } = await db.from('guardian_student_links')
    .select('student_id, relationship, profiles!guardian_student_links_student_id_fkey(full_name)')
    .eq('institution_id', session.institutionId).eq('guardian_id', session.userId)
  return ((data ?? []) as unknown as { student_id: string; relationship: string; profiles: { full_name: string } | null }[])
    .map(r => ({ id: r.student_id, name: r.profiles?.full_name ?? 'Estudiante', relationship: r.relationship }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))
}

export const PUPIL_COOKIE = 'vs_pupil'

/** Estudiantes del apoderado y cuál está viendo ahora. La elección se recuerda en una cookie, pero siempre se
 *  valida contra los vínculos reales: un id ajeno o antiguo se ignora y se usa el primero. */
export async function activePupil(db: DB, session: Session): Promise<{ pupils: Pupil[]; pupil: Pupil | null; ordered: Pupil[] }> {
  const pupils = await guardianStudents(db, session)
  const chosen = (await cookies()).get(PUPIL_COOKIE)?.value
  const pupil = pupils.find(p => p.id === chosen) ?? pupils[0] ?? null
  // `ordered` pone primero al elegido: así queda preseleccionado en los formularios.
  return { pupils, pupil, ordered: pupil ? [pupil, ...pupils.filter(p => p.id !== pupil.id)] : [] }
}
