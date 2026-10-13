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

/** Dirección pública del logo de un colegio (bucket público «school-logos»). */
export const logoUrl = (path: string | null | undefined) =>
  path ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/school-logos/${path}` : null

export const DEFAULT_COLOR = '#0069db'
export const BRAND_COLORS = [
  { value: '#0069db', label: 'Azul Vanty' }, { value: '#0e7490', label: 'Petróleo' }, { value: '#047857', label: 'Verde' },
  { value: '#b45309', label: 'Ámbar' }, { value: '#b91c1c', label: 'Rojo' }, { value: '#be185d', label: 'Frambuesa' },
  { value: '#6d28d9', label: 'Violeta' }, { value: '#1e3a8a', label: 'Azul marino' },
]
/** Degradado de portada a partir del color del colegio. */
export const coverStyle = (color: string | null | undefined) => {
  const c = color && /^#[0-9a-f]{6}$/i.test(color) ? color : DEFAULT_COLOR
  return { background: `linear-gradient(135deg, color-mix(in srgb, ${c} 78%, white) 0%, ${c} 55%, color-mix(in srgb, ${c} 82%, black) 100%)` }
}

/** Lo que se crea junto con el colegio, según los niveles elegidos (igual que platform_create_institution). */
const GRADES_PER_STAGE: Record<string, number> = { parvularia: 2, basica: 8, media: 4 }
const SUBJECT_STAGES: string[][] = [
  ['parvularia', 'basica'], ['basica', 'media'], ['parvularia', 'basica', 'media'], ['basica', 'media'], ['basica', 'media'], ['basica', 'media'],
  ['parvularia', 'basica', 'media'], ['parvularia', 'basica', 'media'], ['parvularia', 'basica', 'media'], ['basica', 'media'], ['basica', 'media'], ['basica', 'media'],
  ['media'], ['media'], ['media'],
]
export const baseFor = (stages: string[], withSubjects: boolean) => ({
  grades: stages.reduce((n, s) => n + (GRADES_PER_STAGE[s] ?? 0), 0),
  subjects: withSubjects ? SUBJECT_STAGES.filter(list => list.some(s => stages.includes(s))).length : 0,
})

export type Branding = { logo_path: string | null; brand_color: string | null; address: string | null; phone: string | null }

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
