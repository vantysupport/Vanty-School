import 'server-only'
import type { DB } from '@/lib/supabase/server'
import type { Role } from '@/lib/roles'

export type Member = {
  userId: string; fullName: string; email: string | null; phone: string | null; birthDate: string | null
  role: Role; status: 'active' | 'suspended' | 'removed'; isManaged: boolean; createdAt: string
}

type Row = {
  user_id: string; role: Role; status: Member['status']; is_managed: boolean; created_at: string
  profiles: { full_name: string; email: string | null; phone: string | null; birth_date: string | null } | null
}

const PAGE = 1000

/** Personas del colegio que quien consulta puede ver (RLS filtra según su rol). */
export async function listMembers(db: DB, institutionId: string, roles?: Role[]): Promise<Member[]> {
  // La API entrega hasta 1.000 filas por consulta: el primer tramo trae el total y los demás se piden a la vez.
  const fetchPage = (from: number) => {
    let query = db.from('institution_memberships')
      .select('user_id, role, status, is_managed, created_at, profiles!institution_memberships_user_id_fkey(full_name, email, phone, birth_date)', { count: 'exact' })
      .eq('institution_id', institutionId).order('user_id').range(from, from + PAGE - 1)
    if (roles?.length) query = query.in('role', roles)
    return query
  }
  const first = await fetchPage(0)
  const rest = await Promise.all(Array.from({ length: Math.max(0, Math.ceil((first.count ?? 0) / PAGE) - 1) }, (_, i) => fetchPage((i + 1) * PAGE)))
  const data: unknown[] = [first, ...rest].flatMap(r => r.data ?? [])
  return ((data ?? []) as unknown as Row[]).map(r => ({
    userId: r.user_id, fullName: r.profiles?.full_name || 'Sin nombre', email: r.profiles?.email ?? null,
    phone: r.profiles?.phone ?? null, birthDate: r.profiles?.birth_date ?? null,
    role: r.role, status: r.status, isManaged: r.is_managed, createdAt: r.created_at,
  })).sort((a, b) => a.fullName.localeCompare(b.fullName, 'es'))
}

/** Nombres por id para las personas que RLS permite ver; el resto queda sin nombre. */
export async function nameMap(db: DB, ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((v): v is string => !!v))]
  if (unique.length === 0) return new Map()
  // Por tramos: una lista de cientos de ids no cabe en la dirección de una sola consulta.
  const chunks = Array.from({ length: Math.ceil(unique.length / 150) }, (_, i) => unique.slice(i * 150, i * 150 + 150))
  const pages = await Promise.all(chunks.map(ids => db.from('profiles').select('id, full_name').in('id', ids)))
  return new Map(pages.flatMap(r => r.data ?? []).map(p => [p.id as string, p.full_name as string]))
}

export const STATUS_LABEL: Record<Member['status'], string> = { active: 'Activa', suspended: 'Desactivada', removed: 'Retirada' }
