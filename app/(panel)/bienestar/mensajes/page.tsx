import { requireSession } from '@/lib/auth/session'
import { MessagesView } from '@/components/shared/messages'

export default async function Page({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const session = await requireSession('bienestar')
  return <MessagesView session={session} basePath="/bienestar/mensajes" conversationId={(await searchParams).c} />
}
