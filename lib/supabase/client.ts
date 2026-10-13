'use client'
import { createBrowserClient } from '@supabase/ssr'

/** Cliente de navegador (clave pública + sesión del usuario). Se usa solo para subir archivos a Storage. */
export const browserClient = () =>
  createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
