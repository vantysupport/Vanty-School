import { requireSession } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { activePupil } from '@/lib/data/guardian'
import { ReportsView } from '@/components/shared/reports'

export default async function Page() {
  const session = await requireSession('apoderado')
  const { pupil } = await activePupil(await createClient(), session)
  return <ReportsView session={session} students={pupil ? [pupil] : []} onlyStudent={pupil?.id} />
}
