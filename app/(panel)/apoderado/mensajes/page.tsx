import { requireSession } from '@/lib/auth/session'
import { MessagesView } from '@/components/shared/messages'
import { createClient } from '@/lib/supabase/server'
import { activePupil } from '@/lib/data/guardian'

export default async function Page({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const session = await requireSession('apoderado')
  const { pupil } = await activePupil(await createClient(), session)
  return <MessagesView session={session} basePath="/apoderado/mensajes" conversationId={(await searchParams).c} preferredStudent={pupil?.id} />
}
