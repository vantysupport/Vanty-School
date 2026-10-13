import { requireSession } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { activePupil } from '@/lib/data/guardian'
import { WellbeingRequestView } from '@/components/shared/wellbeing-request'

export default async function Page() {
  const session = await requireSession('apoderado')
  const { pupil } = await activePupil(await createClient(), session)
  const students = pupil ? [pupil] : []   // la solicitud es sobre el estudiante elegido en la barra superior
  return <WellbeingRequestView session={session} students={students} />
}
