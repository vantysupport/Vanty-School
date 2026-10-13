import { requireSession } from '@/lib/auth/session'
import { MessagesView } from '@/components/shared/messages'

export default async function Page({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const session = await requireSession('docente')
  return <MessagesView session={session} basePath="/docente/mensajes" conversationId={(await searchParams).c} />
}
