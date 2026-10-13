import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Cliente con la clave service_role: SALTA RLS. Solo se usa para lo que Supabase Auth exige
// (crear, bloquear o anonimizar cuentas). Quien lo llama debe haber validado antes rol e institución.

export const hasServiceRole = () => !!process.env.SUPABASE_SERVICE_ROLE_KEY

let cached: SupabaseClient | null = null

export function adminClient(): SupabaseClient {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY no está configurada')
  cached ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return cached
}

export const SERVICE_ROLE_MISSING =
  'Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor. Sin esa clave no se pueden crear ni bloquear cuentas.'
