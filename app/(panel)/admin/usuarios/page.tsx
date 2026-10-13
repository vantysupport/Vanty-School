import Link from 'next/link'
import { BookOpen, Briefcase, ChevronRight, GraduationCap, HeartHandshake, Phone, UserPlus, Users } from 'lucide-react'
import { requireSession } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { hasServiceRole } from '@/lib/supabase/admin'
import { listMembers, nameMap, STATUS_LABEL } from '@/lib/data/people'
import { anonymizeUser, inviteUser, rejectDeletion, revokeInvitation } from '@/lib/actions/admin'
import { isRole, ROLE_LABEL, ROLE_SHORT, ROLES } from '@/lib/roles'
import { fmtDate } from '@/lib/format'
import { Avatar, Badge, Card, EmptyState, Notice, PageHeader, StatStrip, Table, Td, Th } from '@/components/ui/primitives'
import { ConfirmAction, FormDialog } from '@/components/ui/dialog'
import { FilterSelect, Pagination, SearchBox, Tabs } from '@/components/ui/filters'
import { InviteFields } from '@/components/admin/invite-fields'
import { fetchAll } from '@/lib/supabase/fetch-all'

const PAGE_SIZE = 15
const STATUS_TONE = { active: 'success', suspended: 'warning', removed: 'neutral' } as const

type Search = { tab?: string; q?: string; rol?: string; estado?: string; curso?: string; ficha?: string; p?: string }

export default async function UsersPage({ searchParams }: { searchParams: Promise<Search> }) {
  const session = await requireSession('admin')
  const sp = await searchParams
  const db = await createClient()
  const tab = sp.tab ?? 'usuarios'

  const inst = session.institutionId
  const [members, courses, invitations, deletions, { data: enrollments }, { data: teaching }, { data: links }, { data: records }] = await Promise.all([
    listMembers(db, session.institutionId),
    db.from('courses').select('id, name').eq('is_archived', false).eq('institution_id', session.institutionId).order('name'),
    db.from('invitations').select('id, email, full_name, role, expires_at, accepted_at, revoked_at, created_at')
      .eq('institution_id', session.institutionId).order('created_at', { ascending: false }).limit(50),
    db.from('deletion_requests').select('id, user_id, requested_by, reason, status, created_at')
      .eq('institution_id', session.institutionId).order('created_at', { ascending: false }),
    fetchAll((a, b) => db.from('course_enrollments').select('student_id, course_id').eq('institution_id', inst).eq('status', 'active').order('id').range(a, b)),
    db.from('teacher_assignments').select('teacher_id, course_id').eq('institution_id', inst),
    fetchAll((a, b) => db.from('guardian_student_links').select('guardian_id, student_id').eq('institution_id', inst).order('id').range(a, b)),
    fetchAll((a, b) => db.from('person_records').select('user_id, national_id, address, emergency_phone, job_title').eq('institution_id', inst).order('user_id').range(a, b)),
  ])
  const { data: alumni } = await db.from('alumni').select('student_id, graduation_year').eq('institution_id', inst)
  const promotionOf = new Map((alumni ?? []).map(a => [a.student_id as string, a.graduation_year as number]))
  const courseName = new Map((courses.data ?? []).map(c => [c.id as string, c.name as string]))
  const courseOf = new Map((enrollments ?? []).map(e => [e.student_id as string, e.course_id as string]))
  const recordOf = new Map((records ?? []).map(x => [x.user_id as string, x]))
  const nameOf = new Map(members.map(m => [m.userId, m.fullName]))
  // Vínculos y asignaturas agrupados una vez: la ficha de cada persona no recorre las listas completas.
  type Link = NonNullable<typeof links>[number]
  const linksOfStudent = new Map<string, Link[]>(), linksOfGuardian = new Map<string, Link[]>()
  for (const l of links ?? []) {
    for (const [map, key] of [[linksOfStudent, l.student_id as string], [linksOfGuardian, l.guardian_id as string]] as const) { const list = map.get(key); if (list) list.push(l); else map.set(key, [l]) }
  }
  const teachingOf = new Map<string, NonNullable<typeof teaching>>()
  for (const t of teaching ?? []) { const list = teachingOf.get(t.teacher_id as string); if (list) list.push(t); else teachingOf.set(t.teacher_id as string, [t]) }

  // Qué hace cada persona en el colegio y si su ficha tiene lo esencial.
  const detail = (m: (typeof members)[number]) => {
    const record = recordOf.get(m.userId)
    const missing = [!record?.national_id && 'RUN', !m.birthDate && 'nacimiento', !m.phone && 'teléfono', !record?.address && 'domicilio',
      m.role === 'estudiante' && !record?.emergency_phone && 'emergencia'].filter((x): x is string => !!x)
    if (m.role === 'estudiante') {
      const guardians = linksOfStudent.get(m.userId) ?? []
      const course = courseName.get(courseOf.get(m.userId) ?? '')
      const promotion = promotionOf.get(m.userId)
      if (!course && promotion) return { missing, main: `Exalumno · Promoción ${promotion}`, warn: false, sub: 'Egresó del colegio' }
      return { missing, main: course ?? 'Sin curso asignado', warn: !course, sub: guardians.length ? `Apoderado: ${guardians.map(l => nameOf.get(l.guardian_id as string) ?? '—').join(', ')}` : 'Sin apoderado vinculado' }
    }
    if (m.role === 'docente') {
      const mine = teachingOf.get(m.userId) ?? []
      const n = new Set(mine.map(t => t.course_id)).size
      return { missing, main: mine.length ? `${mine.length} ${mine.length === 1 ? 'asignatura' : 'asignaturas'} en ${n} ${n === 1 ? 'curso' : 'cursos'}` : 'Sin asignaturas', warn: mine.length === 0, sub: record?.job_title ?? 'Docente' }
    }
    if (m.role === 'apoderado') {
      const pupils = linksOfGuardian.get(m.userId) ?? []
      return { missing, main: pupils.length ? pupils.map(l => nameOf.get(l.student_id as string) ?? '—').join(', ') : 'Sin estudiantes vinculados', warn: pupils.length === 0,
        sub: pupils.length ? pupils.map(l => courseName.get(courseOf.get(l.student_id as string) ?? '') ?? 'sin curso').join(' · ') : 'No ve información de ningún estudiante' }
    }
    return { missing, main: record?.job_title ?? ROLE_LABEL[m.role], warn: false, sub: 'Equipo del colegio' }
  }
  const inCourse = (m: (typeof members)[number]) => !sp.curso || (m.role === 'estudiante' ? courseOf.get(m.userId) === sp.curso
    : m.role === 'docente' ? (teachingOf.get(m.userId) ?? []).some(t => t.course_id === sp.curso)
    : m.role === 'apoderado' ? (linksOfGuardian.get(m.userId) ?? []).some(l => courseOf.get(l.student_id as string) === sp.curso) : false)
  const current = members.filter(m => m.status !== 'removed')
  const roleCount = (role: string) => current.filter(m => m.role === role).length
  const incomplete = current.filter(m => detail(m).missing.length > 0).length

  const q = (sp.q ?? '').toLowerCase()
  const filtered = members.filter(m =>
    (!q || m.fullName.toLowerCase().includes(q) || (m.email ?? '').toLowerCase().includes(q))
    && (!isRole(sp.rol) || m.role === sp.rol)
    && (sp.estado ? m.status === sp.estado : m.status !== 'removed')
    && inCourse(m) && (sp.ficha !== 'incompleta' || detail(m).missing.length > 0))
  const page = Math.max(1, Number(sp.p) || 1)
  const rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const invState = (i: { accepted_at: string | null; revoked_at: string | null; expires_at: string }) =>
    i.accepted_at ? ['Aceptada', 'success'] as const : i.revoked_at ? ['Revocada', 'neutral'] as const
      : new Date(i.expires_at).getTime() < Date.now() ? ['Vencida', 'warning'] as const : ['Vigente', 'accent'] as const
  const pendingInv = (invitations.data ?? []).filter(i => invState(i)[0] === 'Vigente').length
  const pendingDel = (deletions.data ?? []).filter(d => d.status === 'pending')
  const names = await nameMap(db, (deletions.data ?? []).flatMap(d => [d.user_id, d.requested_by]))

  return (
    <>
      <PageHeader title="Usuarios" description="Invita, edita y controla el acceso de las personas de tu colegio. No existe registro público: toda cuenta nace de una invitación."
        actions={
          <FormDialog trigger={<><UserPlus size={15} />Invitar usuario</>} title="Invitar usuario" action={inviteUser} submitLabel="Crear invitación"
            description="Se genera un enlace seguro, de un solo uso y con vencimiento.">
            <InviteFields
              courses={(courses.data ?? []).map(c => ({ id: c.id, label: c.name }))}
              students={members.filter(m => m.role === 'estudiante' && m.status === 'active').map(m => ({ id: m.userId, label: m.fullName }))} />
          </FormDialog>
        } />

      {!hasServiceRole() && (
        <div className="mb-4"><Notice tone="warning" title="Falta la clave de servicio de Supabase">
          Puedes crear invitaciones y gestionar accesos, pero nadie podrá aceptar una invitación ni se podrán anonimizar cuentas hasta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor.
        </Notice></div>
      )}

      <Tabs tabs={[
        { id: 'usuarios', label: 'Usuarios', count: members.filter(m => m.status !== 'removed').length },
        { id: 'invitaciones', label: 'Invitaciones', count: pendingInv },
        { id: 'eliminaciones', label: 'Solicitudes de eliminación', count: pendingDel.length },
      ]} />

      {tab === 'usuarios' && (
        <StatStrip items={[
          { label: 'Estudiantes', value: roleCount('estudiante'), icon: <GraduationCap size={15} />, href: '?rol=estudiante' },
          { label: 'Docentes', value: roleCount('docente'), icon: <BookOpen size={15} />, href: '?rol=docente' },
          { label: 'Apoderados', value: roleCount('apoderado'), icon: <HeartHandshake size={15} />, tone: 'success', href: '?rol=apoderado' },
          { label: 'Equipo del colegio', value: roleCount('admin') + roleCount('directivo') + roleCount('bienestar'), hint: 'dirección, bienestar, admin.', icon: <Briefcase size={15} /> },
          { label: 'Fichas incompletas', value: incomplete, icon: <Users size={15} />, tone: incomplete ? 'warning' : 'success', href: '?ficha=incompleta' },
        ]} />
      )}

      {tab === 'usuarios' && (
        <Card>
          <div className="flex flex-wrap items-center gap-2 border-b border-v-border px-5 py-3.5">
            <SearchBox placeholder="Buscar por nombre o correo" />
            <FilterSelect param="rol" label="Todos los roles" options={ROLES.map(r => ({ value: r, label: ROLE_SHORT[r] }))} />
            <FilterSelect param="curso" label="Todos los cursos" options={(courses.data ?? []).map(c => ({ value: c.id as string, label: c.name as string }))} />
            <FilterSelect param="estado" label="Activas y desactivadas" options={[
              { value: 'active', label: 'Activas' }, { value: 'suspended', label: 'Desactivadas' }, { value: 'removed', label: 'Retiradas' }]} />
            <FilterSelect param="ficha" label="Todas las fichas" options={[{ value: 'incompleta', label: 'Ficha incompleta' }]} />
            <span className="ml-auto text-xs text-v-subtle">{filtered.length} {filtered.length === 1 ? 'persona' : 'personas'}</span>
          </div>
          {rows.length === 0 ? (
            <EmptyState icon={<Users size={20} />} title="Sin resultados" description="Ninguna persona coincide con la búsqueda o los filtros." />
          ) : (
            <Table>
              <thead><tr><Th>Persona</Th><Th>Rol</Th><Th>En el colegio</Th><Th>Contacto</Th><Th>Ficha</Th><Th>Estado</Th><Th /></tr></thead>
              <tbody>
                {rows.map(m => { const d = detail(m); return (
                  <tr key={m.userId} className="hover:bg-v-fill/50">
                    <Td>
                      <Link href={`/admin/usuarios/${m.userId}`} className="flex items-center gap-2.5">
                        <Avatar name={m.fullName} size={30} id={m.userId} />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{m.fullName}{m.userId === session.userId && <span className="font-normal text-v-subtle"> (tú)</span>}</span>
                          <span className="block truncate text-[12px] text-v-subtle">{m.email ?? 'Sin correo'}</span>
                        </span>
                      </Link>
                    </Td>
                    <Td><Badge tone="accent">{ROLE_SHORT[m.role]}</Badge>{m.isManaged && <span className="ml-1.5 text-[11.5px] text-v-subtle">gestionada</span>}</Td>
                    <Td><span className={`block max-w-[240px] truncate font-medium ${d.warn ? 'text-[#a16207]' : ''}`} title={d.main}>{d.main}</span><span className="block max-w-[240px] truncate text-[12px] text-v-subtle" title={d.sub}>{d.sub}</span></Td>
                    <Td className="whitespace-nowrap text-v-muted">{m.phone ? <span className="inline-flex items-center gap-1.5"><Phone size={12} className="text-v-subtle" />{m.phone}</span> : <span className="text-v-subtle">Sin teléfono</span>}</Td>
                    <Td>{d.missing.length === 0 ? <Badge tone="success">Completa</Badge> : <span title={`Falta: ${d.missing.join(', ')}`}><Badge tone="warning">Faltan {d.missing.length}</Badge></span>}</Td>
                    <Td><Badge tone={STATUS_TONE[m.status]}>{STATUS_LABEL[m.status]}</Badge><span className="mt-0.5 block whitespace-nowrap text-[11px] text-v-subtle">desde {fmtDate(m.createdAt)}</span></Td>
                    <Td className="text-right">
                      <Link href={`/admin/usuarios/${m.userId}`} className="inline-flex items-center gap-0.5 whitespace-nowrap text-[12.5px] font-semibold text-v-accent hover:underline">Ver ficha<ChevronRight size={13} /></Link>
                    </Td>
                  </tr>
                ) })}
              </tbody>
            </Table>
          )}
          <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} />
        </Card>
      )}

      {tab === 'invitaciones' && (
        <Card>
          {(invitations.data ?? []).length === 0 ? (
            <EmptyState aria={8} title="Aún no hay invitaciones" description="Usa «Invitar usuario» para sumar a docentes, estudiantes, apoderados y profesionales." />
          ) : (
            <Table>
              <thead><tr><Th>Invitado</Th><Th>Rol</Th><Th>Estado</Th><Th>Vence</Th><Th /></tr></thead>
              <tbody>
                {(invitations.data ?? []).map(i => {
                  const [label, tone] = invState(i)
                  return (
                    <tr key={i.id}>
                      <Td><span className="block font-medium">{i.full_name}</span><span className="text-[12px] text-v-subtle">{i.email}</span></Td>
                      <Td>{isRole(i.role) ? ROLE_LABEL[i.role] : i.role}</Td>
                      <Td><Badge tone={tone}>{label}</Badge></Td>
                      <Td className="text-v-muted">{fmtDate(i.expires_at)}</Td>
                      <Td className="text-right">
                        {label === 'Vigente' && (
                          <ConfirmAction action={revokeInvitation.bind(null, i.id)} title="Revocar invitación" danger confirmLabel="Revocar"
                            message={`El enlace enviado a ${i.email} dejará de funcionar de inmediato.`}>Revocar</ConfirmAction>
                        )}
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          )}
        </Card>
      )}

      {tab === 'eliminaciones' && (
        <Card>
          <div className="border-b border-v-border p-5">
            <Notice title="La eliminación nunca borra el historial académico">
              Resolver una solicitud anonimiza la cuenta: se eliminan nombre, correo, teléfono y acceso, y se conservan notas, entregas y asistencia sin identidad.
              La eliminación definitiva de registros depende de la política de conservación y de las obligaciones legales del colegio, y no está automatizada.
            </Notice>
          </div>
          {(deletions.data ?? []).length === 0 ? (
            <EmptyState title="Sin solicitudes" description="Las solicitudes de eliminación se crean desde la ficha de cada usuario." />
          ) : (
            <Table>
              <thead><tr><Th>Usuario</Th><Th>Motivo</Th><Th>Solicitada</Th><Th>Estado</Th><Th /></tr></thead>
              <tbody>
                {(deletions.data ?? []).map(d => (
                  <tr key={d.id}>
                    <Td className="font-medium">{names.get(d.user_id) ?? 'Usuario'}</Td>
                    <Td className="max-w-xs text-v-muted">{d.reason}</Td>
                    <Td className="text-v-muted">{fmtDate(d.created_at)}<span className="block text-[12px] text-v-subtle">por {names.get(d.requested_by) ?? '—'}</span></Td>
                    <Td><Badge tone={d.status === 'pending' ? 'warning' : d.status === 'anonymized' ? 'success' : 'neutral'}>
                      {{ pending: 'Pendiente', anonymized: 'Anonimizada', rejected: 'Rechazada' }[d.status as string]}</Badge></Td>
                    <Td className="text-right">
                      {d.status === 'pending' && (
                        <span className="inline-flex gap-1">
                          <ConfirmAction action={rejectDeletion.bind(null, d.id)} title="Rechazar solicitud" message="La cuenta se mantiene sin cambios.">Rechazar</ConfirmAction>
                          <ConfirmAction action={anonymizeUser.bind(null, d.id)} variant="danger" danger title="Anonimizar cuenta" confirmLabel="Anonimizar"
                            message="Se borrarán de forma irreversible los datos personales y el acceso de esta persona. Sus registros académicos se conservan sin identidad.">Anonimizar</ConfirmAction>
                        </span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}
    </>
  )
}
