import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Las pruebas hablan con Supabase igual que la aplicación: clave pública + sesión de un usuario demo.
// No usan la clave service_role, de modo que lo que se verifica son las políticas RLS reales.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const password = process.env.DEMO_PASSWORD

export const configured = !!(url && anon && password)

export const DEMO = {
  admin: 'admin@futuroandino.example',
  directivo: 'direccion@futuroandino.example',
  docenteMat: 'mrojas@futuroandino.example',       // Matemática y Ciencias Naturales
  docenteLen: 'fcontreras@futuroandino.example',   // Lenguaje y Comunicación
  docenteHis: 'dsepulveda@futuroandino.example',   // Historia
  bienestar: 'bienestar@futuroandino.example',
  estudiante6: 'est01@futuroandino.example',       // 6.º básico A
  estudiante7: 'est06@futuroandino.example',       // 7.º básico A, con caso de bienestar
  estudiante1m: 'est09@futuroandino.example',      // 1.º medio A, con solicitud propia
  estudianteAux: 'est10@futuroandino.example',     // se desactiva y reactiva en una prueba
  apoderado: 'ap05@futuroandino.example',          // apoderada de est05 y est06
  otroAdmin: 'admin@aislamiento.example',          // segundo colegio
  otroDocente: 'docente@aislamiento.example',
  otroEstudiante: 'estudiante@aislamiento.example',
} as const

export const anonClient = () => createClient(url!, anon!, { auth: { persistSession: false, autoRefreshToken: false } })

const cache = new Map<string, Promise<{ db: SupabaseClient; id: string }>>()

/** Cliente autenticado como un usuario demo (una sesión por usuario, reutilizada entre pruebas). */
export function as(who: keyof typeof DEMO) {
  if (!cache.has(who)) {
    cache.set(who, (async () => {
      const db = anonClient()
      const { data, error } = await db.auth.signInWithPassword({ email: DEMO[who], password: password! })
      if (error || !data.user) throw new Error(`No se pudo iniciar sesión como ${who}: ${error?.message}`)
      return { db, id: data.user.id }
    })())
  }
  return cache.get(who)!
}

export async function institutionId(who: keyof typeof DEMO) {
  const { db, id } = await as(who)
  const { data } = await db.from('institution_memberships').select('institution_id').eq('user_id', id).single()
  return data!.institution_id as string
}

export const count = async (q: PromiseLike<{ count: number | null; error: unknown }>) => {
  const { count: n, error } = await q
  if (error) throw error
  return n ?? 0
}
