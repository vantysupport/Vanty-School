import { notFound } from 'next/navigation'
import { requireSession } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { ariaSetup } from '@/lib/aria/scopes'
import { activePupil } from '@/lib/data/guardian'
import { AriaChat } from '@/components/aria/aria-chat'

export default async function Page({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const session = await requireSession('apoderado')
  const db = await createClient()
  const aria = await ariaSetup(db, session)
  if (!aria) notFound()
  // Sin un pupilo indicado en el enlace, ARIA parte con el que el apoderado está viendo.
  const requested = (await searchParams).s ?? (await activePupil(db, session)).pupil?.id
  const initialScope = aria.scopeOptions?.some(o => o.value === requested) ? requested : undefined
  return <AriaChat key={initialScope} {...aria} initialScope={initialScope} fixedScope />
}
