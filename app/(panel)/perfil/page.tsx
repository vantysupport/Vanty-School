import { Cake, CalendarDays, Check, GraduationCap, IdCard, LayoutDashboard, Mail, MonitorSmartphone, Phone, ShieldCheck, Smile, Sparkles, Star, Users } from 'lucide-react'
import { requireSession } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { nameMap } from '@/lib/data/people'
import { setDisplayMode, updateMyProfile } from '@/lib/actions/profile'
import { ROLE_LABEL } from '@/lib/roles'
import { studentDisplay, SIMPLE_MODE_MAX_GRADE, type DisplayMode } from '@/lib/student-mode'
import { fmtDate } from '@/lib/format'
import { Avatar, Card, CardBody, CardHeader, Field, Input, PageHeader } from '@/components/ui/primitives'
import { InlineForm, SubmitButton } from '@/components/ui/dialog'
import { AvatarUploader } from '@/components/profile/avatar-uploader'

export default async function ProfilePage() {
  const session = await requireSession()
  const db = await createClient()
  const student = session.role === 'estudiante'
  const [{ data: profile }, { data: record }, { data: enrollment }, { data: links }, display] = await Promise.all([
    db.from('profiles').select('full_name, email, phone, birth_date, avatar_path').eq('id', session.userId).single(),
    // Ficha que registra secretaría; cada persona puede leer la suya.
    db.from('person_records').select('national_id, admission_date').eq('institution_id', session.institutionId).eq('user_id', session.userId).maybeSingle(),
    student ? db.from('course_enrollments').select('courses(name, head_teacher_id)').eq('institution_id', session.institutionId).eq('student_id', session.userId).eq('status', 'active').maybeSingle() : Promise.resolve({ data: null }),
    student ? db.from('guardian_student_links').select('guardian_id, relationship').eq('institution_id', session.institutionId).eq('student_id', session.userId) : Promise.resolve({ data: [] }),
    studentDisplay(db, session),
  ])
  const course = (enrollment as unknown as { courses: { name: string; head_teacher_id: string | null } | null } | null)?.courses ?? null
  const names = await nameMap(db, [course?.head_teacher_id, ...(links ?? []).map(l => l.guardian_id as string)])

  const facts = [
    { icon: <GraduationCap size={17} />, label: 'Curso', value: course?.name ?? 'Sin curso asignado' },
    { icon: <Star size={17} />, label: 'Profesor(a) jefe', value: course?.head_teacher_id ? names.get(course.head_teacher_id) ?? '—' : 'Sin asignar' },
    { icon: <IdCard size={17} />, label: 'RUN', value: (record?.national_id as string | null) || 'No registrado' },
    { icon: <Cake size={17} />, label: 'Fecha de nacimiento', value: profile?.birth_date ? fmtDate(profile.birth_date as string) : 'No registrada' },
    { icon: <CalendarDays size={17} />, label: 'En el colegio desde', value: record?.admission_date ? fmtDate(record.admission_date as string) : 'No registrado' },
    { icon: <Mail size={17} />, label: 'Correo de acceso', value: (profile?.email as string | null) ?? '—' },
  ]
  const modes: { value: DisplayMode; icon: React.ReactNode; title: string; text: string }[] = [
    { value: 'auto', icon: <Sparkles size={20} />, title: 'Automático', text: `Según tu curso. Hoy te corresponde el modo ${display.byGrade ? 'simple' : 'completo'}.` },
    { value: 'simple', icon: <Smile size={20} />, title: 'Simple', text: 'Letra grande, pocas cosas por pantalla y solo lo esencial: tareas, notas y pedir ayuda.' },
    { value: 'completo', icon: <LayoutDashboard size={20} />, title: 'Completo', text: 'Todo el panel: tareas y pruebas, notas con detalle, asistencia, comunidad y mensajes.' },
  ]

  return (
    <>
      <PageHeader title="Mi perfil" description={student ? 'Tu foto, tus datos y cómo quieres ver tu panel.' : 'Tu foto y tus datos de contacto en la plataforma.'} />

      {/* Portada */}
      <div className="v-brand relative mb-4 overflow-hidden rounded-v-lg p-6 shadow-v-brand sm:p-7">
        <span aria-hidden className="pointer-events-none absolute -right-12 -top-20 size-64 rounded-full bg-white/15" />
        <div className="relative flex flex-wrap items-center gap-5">
          <span className="rounded-full ring-4 ring-white/40"><Avatar name={session.fullName} id={session.userId} v={(profile?.avatar_path as string | null) ?? undefined} size={84} /></span>
          <div className="min-w-0 flex-1">
            <h2 className="v-display text-[1.9rem] font-bold leading-tight tracking-tight">{profile?.full_name ?? session.fullName}</h2>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-white/90">
              <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-[12px] font-semibold">{ROLE_LABEL[session.role]}</span>
              {student && course && <span className="inline-flex items-center gap-1.5"><GraduationCap size={15} />{course.name}</span>}
              <span>{session.institutionName}</span>
            </p>
          </div>
        </div>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-2">
        <div className="space-y-4">
          <Card>
            <CardHeader icon={<Smile size={15} />} title="Mi foto" description="Solo la ven personas de tu colegio" />
            <CardBody>
              <AvatarUploader userId={session.userId} name={session.fullName} hasPhoto={!!profile?.avatar_path} version={(profile?.avatar_path as string | null) ?? ''} />
              <p className="mt-4 flex items-start gap-2 rounded-v-sm bg-v-accent-soft px-3.5 py-2.5 text-[12.5px] leading-relaxed text-v-text"><ShieldCheck size={15} className="mt-0.5 shrink-0 text-v-accent" />Usa una foto tuya en la que se te reconozca. No es pública ni se comparte fuera del establecimiento.</p>
            </CardBody>
          </Card>

          {student && (
            <Card index={3}>
              <CardHeader icon={<MonitorSmartphone size={15} />} title="Cómo quiero ver mi panel" description="Puedes cambiarlo cuando quieras" />
              <CardBody>
                <div className="grid gap-2.5">
                  {modes.map(m => {
                    const on = display.choice === m.value
                    return (
                      <form key={m.value} action={async () => { 'use server'; await setDisplayMode(m.value) }}>
                        <button type="submit" aria-pressed={on} className={`flex w-full items-center gap-3.5 rounded-v-sm border p-4 text-left transition-all ${on ? 'border-v-accent/60 bg-v-accent-soft ring-4 ring-v-accent-soft' : 'border-v-border hover:border-v-accent/40'}`}>
                          <span className={`grid size-11 shrink-0 place-items-center rounded-[30%] ${on ? 'v-brand' : 'bg-v-fill text-v-muted'}`}>{m.icon}</span>
                          <span className="min-w-0 flex-1"><span className="block text-[15px] font-semibold text-v-text">{m.title}</span><span className="block text-[13px] leading-relaxed text-v-muted">{m.text}</span></span>
                          {on && <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11.5px] font-semibold text-v-accent"><Check size={13} />En uso</span>}
                        </button>
                      </form>
                    )
                  })}
                </div>
                <p className="mt-3 text-xs leading-relaxed text-v-subtle">En automático, el modo simple se usa hasta {SIMPLE_MODE_MAX_GRADE}.º básico{display.gradeName ? ` (tú estás en ${display.gradeName})` : ''}. Cambiar de modo solo cambia cómo se ve: tus tareas y notas son las mismas.</p>
              </CardBody>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card index={2}>
            <CardHeader icon={<IdCard size={15} />} title="Mis datos" description="Los registra el colegio" />
            <CardBody>
              {student ? (
                <dl className="grid gap-2.5 sm:grid-cols-2">
                  {facts.map(f => (
                    <div key={f.label} className="flex items-center gap-3 rounded-v-sm border border-v-border px-3.5 py-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-[30%] bg-v-accent-soft text-v-accent">{f.icon}</span>
                      <div className="min-w-0"><dt className="text-[11px] font-semibold uppercase tracking-[0.07em] text-v-subtle">{f.label}</dt><dd className="truncate text-[14px] font-semibold text-v-text">{f.value}</dd></div>
                    </div>
                  ))}
                </dl>
              ) : (
                <div className="space-y-4">
                  <Field label="Nombre"><Input value={profile?.full_name ?? ''} disabled readOnly /></Field>
                  <Field label="Correo de acceso"><Input value={profile?.email ?? ''} disabled readOnly /></Field>
                </div>
              )}
              <p className="mt-3 text-xs text-v-subtle">Si algún dato tiene un error, avisa en la secretaría del colegio.</p>
              <InlineForm action={updateMyProfile} resetOnSuccess={false} className="mt-4 flex flex-wrap items-end gap-3 border-t border-v-border pt-4">
                <div className="min-w-0 flex-1 basis-56"><Field label="Teléfono de contacto" hint="Este sí puedes cambiarlo tú."><Input name="phone" defaultValue={profile?.phone ?? ''} placeholder="+56 9 …" maxLength={30} /></Field></div>
                <SubmitButton><Phone size={14} />Guardar</SubmitButton>
              </InlineForm>
            </CardBody>
          </Card>

          {student && (
            <Card index={4}>
              <CardHeader icon={<Users size={15} />} title="Mis apoderados" description="Las personas adultas que te acompañan en el colegio" />
              <CardBody>
                {(links ?? []).length === 0 ? <p className="text-[13.5px] text-v-muted">Aún no hay apoderados vinculados a tu cuenta.</p> : (
                  <ul className="space-y-3">
                    {(links ?? []).map(l => {
                      const name = names.get(l.guardian_id as string) ?? 'Apoderado'
                      return <li key={l.guardian_id as string} className="flex items-center gap-3"><Avatar name={name} id={l.guardian_id as string} size={40} /><span className="min-w-0"><span className="block truncate text-[14.5px] font-semibold">{name}</span><span className="text-xs capitalize text-v-muted">{l.relationship as string}</span></span></li>
                    })}
                  </ul>
                )}
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </>
  )
}
