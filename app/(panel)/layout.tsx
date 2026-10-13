import { requireSession } from '@/lib/auth/session'
import { getPlatformUser } from '@/lib/auth/platform'
import { createClient } from '@/lib/supabase/server'
import { NAV, ROLE_LABEL, STUDENT_SIMPLE_NAV } from '@/lib/roles'
import { usesSimpleMode } from '@/lib/student-mode'
import { ariaSetup, GREETINGS } from '@/lib/aria/scopes'
import { firstName } from '@/lib/format'
import { Shell } from '@/components/shell/shell'
import { AriaFloating } from '@/components/aria/aria-floating'
import { PupilSwitcher } from '@/components/shell/pupil-switcher'
import { activePupil } from '@/lib/data/guardian'

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession()
  const db = await createClient()
  const aria = await ariaSetup(db, session)
  const simple = await usesSimpleMode(db, session)   // estudiantes de cursos chicos: menú corto
  // El apoderado con más de un estudiante elige a quién está viendo; esa elección acompaña todo su panel.
  const family = session.role === 'apoderado' ? await activePupil(db, session) : null
  // Novedades por estudiante (mensajes sin leer y cuestionarios por responder): se avisan en el selector,
  // para que lo del hermano que no se está viendo no pase desapercibido.
  const alerts: Record<string, number> = {}
  if (family && family.pupils.length > 1) {
    const [{ data: inbox }, { data: forms }] = await Promise.all([
      db.from('conversation_participants').select('last_read_at, conversations(student_id, last_message_at)').eq('user_id', session.userId),
      db.from('assessment_requests').select('student_id').eq('institution_id', session.institutionId).eq('guardian_id', session.userId).eq('status', 'pending'),
    ])
    for (const p of (inbox ?? []) as unknown as { last_read_at: string | null; conversations: { student_id: string | null; last_message_at: string } | null }[]) {
      const c = p.conversations
      if (c?.student_id && (!p.last_read_at || new Date(p.last_read_at) < new Date(c.last_message_at))) alerts[c.student_id] = (alerts[c.student_id] ?? 0) + 1
    }
    for (const f of forms ?? []) alerts[f.student_id as string] = (alerts[f.student_id as string] ?? 0) + 1
  }

  // Quien además es del equipo Vanty tiene a mano el panel de plataforma.
  const platform = session.role === 'estudiante' ? null : await getPlatformUser()
  const nav = simple ? STUDENT_SIMPLE_NAV : NAV[session.role]

  return (
    <Shell
      nav={platform ? [...nav, { href: '/plataforma', label: 'Plataforma Vanty', icon: 'building' }] : nav}
      user={{ id: session.userId, avatarVersion: session.avatarPath, name: session.fullName, email: session.email, roleLabel: ROLE_LABEL[session.role] }}
      institution={{ id: session.institutionId, name: session.institutionName, isDemo: session.isDemo }}
      institutions={session.memberships.map(m => ({ id: m.institutionId, name: m.institutionName }))}
      switcher={family?.pupil && family.pupils.length > 1 ? <PupilSwitcher pupils={family.pupils} activeId={family.pupil.id} alerts={alerts} /> : undefined}
    >
      {children}
      {aria && <AriaFloating {...aria} key={family?.pupil?.id ?? 'aria'} initialScope={family?.pupil?.id} fixedScope={!!family?.pupil} firstName={firstName(session.fullName)} greetings={GREETINGS[session.role] ?? GREETINGS.docente} />}
    </Shell>
  )
}
