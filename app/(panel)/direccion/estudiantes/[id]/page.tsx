import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, CalendarCheck, ClipboardList, GraduationCap, UsersRound } from 'lucide-react'
import { requireSession } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { audit } from '@/lib/audit'
import { nameMap } from '@/lib/data/people'
import { loadStudentAcademics } from '@/lib/data/student'
import { fmtPct } from '@/lib/format'
import { Avatar, Card, CardBody, CardHeader, Notice } from '@/components/ui/primitives'
import { Tabs } from '@/components/ui/filters'
import { AcademicSummary, AttendanceList, GradesTable, SubjectAverages, TaskList } from '@/components/shared/academics'

export default async function DirectionStudent({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const session = await requireSession('directivo')
  const { id } = await params
  const tab = (await searchParams).tab ?? 'resumen'
  const db = await createClient()
  const { data: membership } = await db.from('institution_memberships').select('status').eq('institution_id', session.institutionId).eq('user_id', id).eq('role', 'estudiante').maybeSingle()
  if (!membership) notFound()
  // La consulta de una ficha individual queda registrada.
  await audit(db, session, { action: 'student.view', entity: 'profile', entityId: id })

  const [data, { data: links }, { data: profile }] = await Promise.all([
    loadStudentAcademics(db, session.institutionId, id),
    db.from('guardian_student_links').select('guardian_id, relationship').eq('student_id', id).eq('institution_id', session.institutionId),
    db.from('profiles').select('full_name').eq('id', id).maybeSingle(),
  ])
  const names = await nameMap(db, (links ?? []).map(l => l.guardian_id as string))
  const name = profile?.full_name ?? 'Estudiante'

  return (
    <>
      <Link href={data.course ? `/direccion/cursos/${data.course.id}` : '/direccion/cursos'} className="mb-4 inline-flex items-center gap-1 text-[12.5px] text-v-muted hover:text-v-text">
        <ArrowLeft size={14} />{data.course?.name ?? 'Cursos y estudiantes'}
      </Link>
      <div className="mb-5 flex flex-wrap items-center gap-4">
        <Avatar name={name} size={56} id={id} />
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-v-accent">Ficha académica</p>
          <h1 className="v-headline text-[1.75rem]">{name}</h1>
          <p className="mt-1 text-sm text-v-muted">{data.course?.name ?? 'Sin curso asignado'}{membership.status !== 'active' && ' · cuenta desactivada'}</p>
        </div>
      </div>

      <AcademicSummary data={data} />
      <Tabs tabs={[{ id: 'resumen', label: 'Resumen' }, { id: 'notas', label: 'Notas' }, { id: 'tareas', label: 'Tareas', count: data.tasks.length }, { id: 'asistencia', label: 'Asistencia' }]} />

      {tab === 'resumen' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <SubjectAverages data={data} />
          <div className="space-y-4">
            <Card index={2}><CardHeader icon={<ClipboardList size={15} />} tone="warning" title="Actividades sin entregar" /><TaskList data={data} onlyOpen /></Card>
            <Card index={3}>
              <CardHeader icon={<UsersRound size={15} />} title="Apoderados" />
              <CardBody className="space-y-2 text-[13.5px]">
                {(links ?? []).length === 0 ? <p className="text-v-muted">Sin apoderados vinculados.</p>
                  : (links ?? []).map(l => <p key={l.guardian_id as string} className="flex items-center gap-2.5"><Avatar name={names.get(l.guardian_id as string) ?? '?'} size={28} id={l.guardian_id as string} /><span className="font-medium">{names.get(l.guardian_id as string) ?? 'Apoderado'}</span><span className="text-v-subtle">· {l.relationship}</span></p>)}
              </CardBody>
            </Card>
            <Notice title="Información académica">
              Esta ficha muestra notas, tareas y asistencia. La información de bienestar escolar es confidencial y solo la ve el equipo de bienestar.
            </Notice>
          </div>
        </div>
      )}
      {tab === 'notas' && <Card><CardHeader icon={<GraduationCap size={15} />} title="Calificaciones" /><GradesTable data={data} /></Card>}
      {tab === 'tareas' && <Card><CardHeader icon={<ClipboardList size={15} />} title="Tareas del curso" /><TaskList data={data} /></Card>}
      {tab === 'asistencia' && <Card><CardHeader icon={<CalendarCheck size={15} />} tone="success" title={`Asistencia: ${fmtPct(data.attendanceRate)}`} /><AttendanceList data={data} /></Card>}
    </>
  )
}
