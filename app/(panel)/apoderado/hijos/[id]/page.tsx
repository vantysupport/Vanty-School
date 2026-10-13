import { redirect } from 'next/navigation'

// La ficha de cada estudiante vive en «Seguimiento escolar» y sigue al selector de la barra superior.
export default async function Page({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams
  redirect(`/apoderado/hijos${tab ? `?tab=${tab}` : ''}`)
}
