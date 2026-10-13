import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/** Cliente con la sesión del usuario: toda consulta pasa por RLS. Es el cliente por defecto del servidor. */
export async function createClient() {
  const store = await cookies()
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(list) {
        try {
          for (const { name, value, options } of list) store.set(name, value, options)
        } catch {
          // Un Server Component no puede escribir cookies; proxy.ts ya renueva la sesión.
        }
      },
    },
  })
}

export type DB = Awaited<ReturnType<typeof createClient>>
