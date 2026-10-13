import 'server-only'
import type { DB } from '@/lib/supabase/server'
import type { Session } from '@/lib/auth/session'
import { MODES, modeForRole, type AriaMode } from '@/lib/aria/modes'
import { firstName, fmtDate } from '@/lib/format'

export type AriaSetup = {
  mode: AriaMode; title: string; tagline: string; disclaimer: string; suggestions: string[]
  scopeLabel?: string; scopeOptions?: { value: string; label: string }[]; scopeRequired: boolean
}

/** Configuración de ARIA para el rol activo, con las opciones de alcance que esa persona puede elegir. */
export async function ariaSetup(db: DB, session: Session): Promise<AriaSetup | null> {
  const mode = modeForRole(session.role)
  if (!mode) return null
  const { label, tagline, disclaimer, suggestions, scopeRequired } = MODES[mode]
  const base = { mode, title: label, tagline, disclaimer, suggestions, scopeRequired }

  if (mode === 'pedagogica') {
    const { data } = await db.from('teacher_assignments').select('course_id, subject_id, courses(name), subjects(name)')
      .eq('institution_id', session.institutionId).eq('teacher_id', session.userId)
    const rows = (data ?? []) as unknown as { course_id: string; subject_id: string; courses: { name: string }; subjects: { name: string } }[]
    return {
      ...base, scopeLabel: 'Curso',
      scopeOptions: rows.map(r => ({ value: `${r.course_id}:${r.subject_id}`, label: `${r.courses.name} · ${r.subjects.name}` }))
        .sort((a, b) => a.label.localeCompare(b.label, 'es')),
    }
  }
  if (mode === 'familias') {
    const { data } = await db.from('guardian_student_links')
      .select('student_id, profiles!guardian_student_links_student_id_fkey(full_name)')
      .eq('institution_id', session.institutionId).eq('guardian_id', session.userId)
    const rows = (data ?? []) as unknown as { student_id: string; profiles: { full_name: string } | null }[]
    return { ...base, scopeLabel: 'Pupilo', scopeOptions: rows.map(r => ({ value: r.student_id, label: firstName(r.profiles?.full_name ?? 'Estudiante') })) }
  }
  if (mode === 'bienestar') {
    const { data } = await db.from('wellbeing_cases')
      .select('id, created_at, profiles!wellbeing_cases_student_id_fkey(full_name)')
      .eq('institution_id', session.institutionId).neq('status', 'closed').order('created_at', { ascending: false })
    const rows = (data ?? []) as unknown as { id: string; created_at: string; profiles: { full_name: string } | null }[]
    return { ...base, scopeLabel: 'Caso', scopeOptions: rows.map(r => ({ value: r.id, label: `${r.profiles?.full_name ?? 'Estudiante'} · ${fmtDate(r.created_at)}` })) }
  }
  return base
}

export const GREETINGS: Record<string, { pose: number; text: string }[]> = {
  admin: [
    { pose: 8, text: 'El colegio está al día. Estoy aquí si me necesitas.' },
    { pose: 4, text: 'Un colegio ordenado parte por una buena gestión.' },
  ],
  directivo: [
    { pose: 8, text: 'Ya tengo los indicadores listos para revisarlos juntos.' },
    { pose: 7, text: 'Tu equipo cuenta contigo. Revisemos cómo va el semestre.' },
  ],
  docente: [
    { pose: 2, text: 'Cada clase suma. Si necesitas ideas de refuerzo, aquí estoy.' },
    { pose: 8, text: 'Puedo ayudarte a leer los resultados de tus cursos.' },
  ],
  bienestar: [
    { pose: 3, text: 'Gracias por acompañar. Puedo ayudarte a ordenar la información.' },
    { pose: 5, text: 'Tu trabajo cuida a la comunidad. Cuenta conmigo.' },
  ],
  apoderado: [
    { pose: 1, text: 'Acompañar desde la casa hace la diferencia.' },
    { pose: 2, text: '¿Vemos juntos cómo va la semana?' },
  ],
}
