// Datos compartidos por el panel del equipo Vanty.

export const DEPENDENCIES: Record<string, string> = {
  municipal: 'Municipal',
  slep: 'Servicio Local de Educación (SLEP)',
  particular_subvencionado: 'Particular subvencionado',
  particular_pagado: 'Particular pagado',
}

export const REGIONS = [
  'Arica y Parinacota', 'Tarapacá', 'Antofagasta', 'Atacama', 'Coquimbo', 'Valparaíso', 'Metropolitana de Santiago',
  "Libertador General Bernardo O'Higgins", 'Maule', 'Ñuble', 'Biobío', 'La Araucanía', 'Los Ríos', 'Los Lagos',
  'Aysén del General Carlos Ibáñez del Campo', 'Magallanes y de la Antártica Chilena',
]

export const STAGES = [
  { key: 'parvularia', label: 'Educación parvularia', hint: 'Pre-kínder y kínder' },
  { key: 'basica', label: 'Educación básica', hint: '1.º a 8.º básico' },
  { key: 'media', label: 'Educación media', hint: '1.º a 4.º medio' },
] as const

export type SchoolRow = {
  id: string; name: string; rbd: string | null; dependency: string; commune: string | null; region: string | null
  status: 'active' | 'suspended'; is_demo: boolean; created_at: string
  students: number; teachers: number; guardians: number; admins: number; directors: number; courses: number; pending_invites: number
}

export type SchoolDetail = Omit<SchoolRow, 'students' | 'teachers' | 'guardians' | 'admins' | 'directors' | 'pending_invites'> & {
  period: { name: string; year: number; starts_on: string; ends_on: string } | null
  grade_levels: number; subjects: number; assignments: number; links: number
  members: Record<string, number>
  contacts: { name: string; email: string | null; role: 'admin' | 'directivo'; status: string }[]
  invitations: { id: string; email: string; name: string; role: 'admin' | 'directivo'; expires_at: string; state: 'pending' | 'accepted' | 'revoked' | 'expired' }[]
}

export type SetupStep = { title: string; done: boolean; detail: string; owner: 'Equipo Vanty' | 'Secretaría' }

/** Puesta en marcha de un colegio, en el orden en que la aplicación lo necesita. Cada paso dice quién lo hace. */
export function setupSteps(s: SchoolDetail): SetupStep[] {
  const n = (role: string) => s.members[role] ?? 0
  const pending = s.invitations.filter(i => i.state === 'pending').length
  return [
    { title: 'Colegio creado', done: true, owner: 'Equipo Vanty', detail: s.period ? `Año escolar ${s.period.year}, ${s.period.name.toLowerCase()} vigente.` : 'Falta definir el año escolar.' },
    { title: 'Grados y asignaturas', done: s.grade_levels > 0 && s.subjects > 0, owner: 'Equipo Vanty', detail: `${s.grade_levels} grados y ${s.subjects} asignaturas cargados.` },
    { title: 'Secretaría con cuenta activa', done: n('admin') > 0, owner: 'Equipo Vanty',
      detail: n('admin') > 0 ? `${n('admin')} cuenta${n('admin') === 1 ? '' : 's'} de secretaría.` : pending ? 'Invitación enviada, aún sin aceptar.' : 'Invita a la persona que administrará el colegio.' },
    { title: 'Cursos y secciones', done: s.courses > 0, owner: 'Secretaría', detail: s.courses > 0 ? `${s.courses} cursos en el periodo vigente.` : 'Se crean en Gestión académica, agregando secciones a cada grado.' },
    { title: 'Docentes con sus asignaturas', done: n('docente') > 0 && s.assignments > 0, owner: 'Secretaría',
      detail: n('docente') > 0 ? `${n('docente')} docentes, ${s.assignments} asignaciones a cursos.` : 'Se invitan en Usuarios y se asignan en Gestión académica.' },
    { title: 'Estudiantes matriculados', done: n('estudiante') > 0, owner: 'Secretaría', detail: n('estudiante') > 0 ? `${n('estudiante')} estudiantes con cuenta.` : 'Se invitan en Usuarios, indicando su curso.' },
    { title: 'Apoderados vinculados', done: s.links > 0, owner: 'Secretaría', detail: s.links > 0 ? `${n('apoderado')} apoderados, ${s.links} vínculos con estudiantes.` : 'Se invitan en Usuarios, eligiendo a sus estudiantes.' },
  ]
}
