import { requireSession } from '@/lib/auth/session'
import { ReportsView } from '@/components/shared/reports'

export default async function Page() {
  return <ReportsView session={await requireSession('estudiante')} />
}
