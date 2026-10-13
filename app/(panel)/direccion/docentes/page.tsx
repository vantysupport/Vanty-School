import Link from 'next/link'
import { ChevronRight, MailPlus, UserPlus, Users } from 'lucide-react'
import { requireSession } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { hasServiceRole } from '@/lib/supabase/admin'
import { listMembers } from '@/lib/data/people'
import { inviteUser, revokeInvitation } from '@/lib/actions/admin'
import { fmtDate } from '@/lib/format'
import { Avatar, Card, CardHeader, EmptyState, Field, Input, Notice, PageHeader, Table, Td, Th } from '@/components/ui/primitives'
import { ConfirmAction, FormDialog } from '@/components/ui/dialog'
import { SearchBox } from '@/components/ui/filters'
import { Reveal } from '@/components/ui/motion'

export default async function DirectionTeachers({ searchParams }: { searchParams: Promise<{ q?: string; ver?: string }> }) {
  const session = await requireSession('directivo')
  const sp = await searchParams
  const db = await createClient()
  const inst = session.institutionId
  const [teachers, { data: teaching }, { data: heads }, { data: invitations }] = await Promise.all([
    listMembers(db, inst, ['docente']),
    db.from('teacher_assignments').select('teacher_id, course_id').eq('institution_id', inst),
    db.from('courses').select('name, head_teacher_id').eq('is_archived', false).eq('institution_id', inst).not('head_teacher_id', 'is', null),
    db.from('invitations').select('id, full_name, email, expires_at').eq('institution_id', inst).eq('role', 'docente')
      .is('accepted_at', null).is('revoked_at', null).gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }),
  ])
  const q = (sp.q ?? '').toLowerCase()
  const inactive = teachers.filter(t => t.status !== 'active').length
  const shown = teachers.filter(t => (sp.ver === 'inactivos' ? t.status !== 'active' : t.status === 'active') && (!q || t.fullName.toLowerCase().includes(q)))
  const pill = (on: boolean) => `whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-semibold ${on ? 'v-brand shadow-v-brand' : 'text-v-muted hover:bg-v-fill hover:text-v-text'}`

  return (
    <>
      <PageHeader title="Docentes" description="Directorio del cuerpo docente. Abre a un docente para ver sus datos, los grados y secciones a su cargo y sus asignaturas."
        actions={
          <FormDialog trigger={<><UserPlus size={15} />Agregar docente</>} title="Agregar docente" action={inviteUser} submitLabel="Crear invitación"
            description="Se genera un enlace seguro, de un solo uso, para que el docente cree su cuenta.">
            <input type="hidden" name="role" value="docente" />
            <Field label="Nombre completo"><Input name="full_name" required minLength={3} maxLength={160} autoComplete="off" /></Field>
            <Field label="Correo electrónico"><Input name="email" type="email" required autoComplete="off" /></Field>
          </FormDialog>
        } />

      {!hasServiceRole() && <div className="mb-4"><Notice tone="warning" title="Las invitaciones aún no se pueden aceptar">Puedes crearlas, pero el docente no podrá activar su cuenta hasta que se configure la clave de servicio de Supabase en el servidor.</Notice></div>}

      <Card>
        <CardHeader icon={<Users size={15} />} title="Cuerpo docente" description={`${shown.length} ${shown.length === 1 ? 'docente' : 'docentes'}`} actions={<>
          <SearchBox placeholder="Buscar docente" />
          <div className="flex rounded-full bg-v-fill p-1">
            <Link href="/direccion/docentes" scroll={false} className={pill(sp.ver !== 'inactivos')}>Activos · {teachers.length - inactive}</Link>
            <Link href="/direccion/docentes?ver=inactivos" scroll={false} className={pill(sp.ver === 'inactivos')}>Inactivos · {inactive}</Link>
          </div>
        </>} />
        {shown.length === 0 ? <EmptyState aria={4} title={teachers.length ? 'Ningún docente coincide' : 'Aún no hay docentes'} description={teachers.length ? 'Ajusta la búsqueda.' : 'Agrega al primero con «Agregar docente».'} /> : (
          <ul className="grid gap-3 px-5 pb-5 pt-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {shown.map((t, i) => {
              const mine = (teaching ?? []).filter(x => x.teacher_id === t.userId)
              const courses = new Set(mine.map(x => x.course_id)).size
              const head = (heads ?? []).find(h => h.head_teacher_id === t.userId)
              return (
                <li key={t.userId}>
                  <Reveal index={Math.min(i, 10)}>
                    <Link href={`/direccion/docentes/${t.userId}`}
                      className="group relative block overflow-hidden rounded-v border border-v-border bg-v-elevated text-center shadow-v-xs hover:-translate-y-1 hover:border-v-accent hover:shadow-v">
                      <span aria-hidden className="v-brand block h-14 opacity-90" />
                      <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-14 bg-[radial-gradient(12rem_5rem_at_80%_0%,rgba(255,255,255,0.35),transparent_70%)]" />
                      <span className="relative -mt-8 inline-block rounded-full shadow-v ring-4 ring-white"><Avatar name={t.fullName} size={64} id={t.userId} /></span>
                      <span className="block px-4 pb-4 pt-2.5">
                        <span className="block truncate text-[15px] font-semibold tracking-tight">{t.fullName}</span>
                        <span className="mt-0.5 block truncate text-xs text-v-muted">{head ? `Profesor jefe de ${head.name}` : mine.length ? `${courses} ${courses === 1 ? 'curso' : 'cursos'} · ${mine.length} ${mine.length === 1 ? 'asignatura' : 'asignaturas'}` : 'Sin cursos asignados'}</span>
                        <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-v-accent-soft px-3 py-1 text-xs font-semibold text-v-accent transition-colors group-hover:bg-v-accent group-hover:text-white">Ver ficha<ChevronRight size={13} /></span>
                      </span>
                    </Link>
                  </Reveal>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      {(invitations ?? []).length > 0 && (
        <Card index={3} className="mt-4">
          <CardHeader icon={<MailPlus size={15} />} tone="warning" title="Invitaciones pendientes" description="Docentes invitados que aún no activan su cuenta" />
          <Table>
            <thead><tr><Th>Docente</Th><Th>Correo</Th><Th>Vence</Th><Th /></tr></thead>
            <tbody>
              {(invitations ?? []).map(inv => (
                <tr key={inv.id}>
                  <Td className="font-semibold">{inv.full_name}</Td><Td className="text-v-muted">{inv.email}</Td><Td className="text-v-muted">{fmtDate(inv.expires_at)}</Td>
                  <Td className="text-right"><ConfirmAction action={revokeInvitation.bind(null, inv.id as string)} title="Revocar invitación" danger confirmLabel="Revocar" message={`El enlace enviado a ${inv.email} dejará de funcionar.`}>Revocar</ConfirmAction></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </>
  )
}
