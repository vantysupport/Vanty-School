import { requireSession } from '@/lib/auth/session'
import { MODES } from '@/lib/aria/modes'
import { AriaChat } from '@/components/aria/aria-chat'

export default async function Page() {
  await requireSession('directivo')
  const { label, tagline, disclaimer, suggestions } = MODES.gestion
  return <AriaChat mode="gestion" title={label} tagline={tagline} disclaimer={disclaimer} suggestions={suggestions} />
}
