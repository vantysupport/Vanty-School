import { requireSession } from '@/lib/auth/session'
import { WellbeingRequestView } from '@/components/shared/wellbeing-request'
import { createClient } from '@/lib/supabase/server'
import { usesSimpleMode } from '@/lib/student-mode'

export default async function Page() {
  const session = await requireSession('estudiante')
  return <WellbeingRequestView session={session} simple={await usesSimpleMode(await createClient(), session)} />
}
