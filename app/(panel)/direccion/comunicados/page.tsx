import { requireSession } from '@/lib/auth/session'
import { AnnouncementsView } from '@/components/shared/announcements'

export default async function Page() {
  return <AnnouncementsView session={await requireSession('directivo')} />
}
