import { redirect } from 'next/navigation'

// Las tareas viven dentro de cada curso; se conserva la ruta para los enlaces antiguos.
export default async function Page({ searchParams }: { searchParams: Promise<{ curso?: string; asignatura?: string; estado?: string }> }) {
  const sp = await searchParams
  if (!sp.curso) redirect('/docente/cursos')
  const next = new URLSearchParams()
  if (sp.asignatura) next.set('tab', sp.asignatura)
  if (sp.estado) next.set('estado', sp.estado)
  const q = next.toString()
  redirect(`/docente/cursos/${sp.curso}${q ? `?${q}` : ''}`)
}
