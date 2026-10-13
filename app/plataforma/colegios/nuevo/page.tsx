import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { requirePlatform } from '@/lib/auth/platform'
import { PageHeader } from '@/components/ui/primitives'
import { SchoolWizard } from '@/components/platform/school-wizard'

export default async function NewSchool() {
  await requirePlatform()
  return (
    <>
      <Link href="/plataforma" className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-v-muted hover:text-v-text"><ArrowLeft size={14} />Colegios</Link>
      <PageHeader title="Crear colegio" description="Queda con su año escolar, grados y asignaturas listos. Su secretaría continúa desde ahí." />
      <SchoolWizard year={new Date().getFullYear()} />
    </>
  )
}
