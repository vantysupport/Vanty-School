import { notFound } from 'next/navigation'
import { requireSession } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { ariaSetup } from '@/lib/aria/scopes'
import { AriaChat } from '@/components/aria/aria-chat'

export default async function Page({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const session = await requireSession('docente')
  const aria = await ariaSetup(await createClient(), session)
  if (!aria) notFound()
  const requested = (await searchParams).s
  const initialScope = aria.scopeOptions?.some(o => o.value === requested) ? requested : undefined
  return <AriaChat {...aria} initialScope={initialScope} />
}
