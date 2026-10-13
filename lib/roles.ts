export const ROLES = ['admin', 'directivo', 'docente', 'bienestar', 'apoderado', 'estudiante'] as const
export type Role = (typeof ROLES)[number]

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Secretaría',
  directivo: 'Director(a)',
  docente: 'Docente',
  bienestar: 'Bienestar escolar',
  apoderado: 'Apoderado',
  estudiante: 'Estudiante',
}

export const ROLE_SHORT: Record<Role, string> = {
  admin: 'Secretaría',
  directivo: 'Director(a)',
  docente: 'Docente',
  bienestar: 'Bienestar',
  apoderado: 'Apoderado',
  estudiante: 'Estudiante',
}

export const ROLE_HOME: Record<Role, string> = {
  admin: '/admin',
  directivo: '/direccion',
  docente: '/docente',
  bienestar: '/bienestar',
  apoderado: '/apoderado',
  estudiante: '/estudiante',
}

export const isRole = (v: unknown): v is Role => typeof v === 'string' && (ROLES as readonly string[]).includes(v)

export type NavItem = { href: string; label: string; icon: string }

// Los nombres de icono se resuelven en components/shell/icons.ts (los componentes no cruzan el límite servidor→cliente).
/** Menú del estudiante en modo simple (cursos chicos): solo lo esencial. */
export const STUDENT_SIMPLE_NAV: NavItem[] = [
  { href: '/estudiante', label: 'Inicio', icon: 'home' },
  { href: '/estudiante/tareas', label: 'Mis tareas', icon: 'clipboard' },
  { href: '/estudiante/repaso', label: 'Repasemos', icon: 'target' },
  { href: '/estudiante/notas', label: 'Mis notas', icon: 'star' },
  { href: '/estudiante/bienestar', label: 'Pedir ayuda', icon: 'heart' },
  { href: '/perfil', label: 'Mi perfil', icon: 'settings' },
]

export const NAV: Record<Role, NavItem[]> = {
  admin: [
    { href: '/admin', label: 'Inicio', icon: 'home' },
    { href: '/admin/usuarios', label: 'Usuarios', icon: 'users' },
    { href: '/admin/academico', label: 'Gestión académica', icon: 'school' },
    { href: '/admin/matriculas', label: 'Matrículas', icon: 'clipboard' },
    { href: '/admin/comunicados', label: 'Comunidad', icon: 'megaphone' },
    { href: '/admin/configuracion', label: 'Configuración', icon: 'settings' },
  ],
  directivo: [
    { href: '/direccion', label: 'Inicio', icon: 'home' },
    { href: '/direccion/cursos', label: 'Cursos y estudiantes', icon: 'school' },
    { href: '/direccion/docentes', label: 'Docentes', icon: 'users' },
    { href: '/direccion/rendimiento', label: 'Rendimiento', icon: 'chart' },
    { href: '/direccion/reclamos', label: 'Reclamos y denuncias', icon: 'flag' },
    { href: '/direccion/comunicados', label: 'Comunidad', icon: 'megaphone' },
    { href: '/direccion/aria', label: 'ARIA Gestión', icon: 'sparkles' },
  ],
  docente: [
    { href: '/docente', label: 'Inicio', icon: 'home' },
    { href: '/docente/cursos', label: 'Mis cursos', icon: 'school' },
    { href: '/docente/asistencia', label: 'Asistencia', icon: 'calendar' },
    { href: '/docente/evaluacion', label: 'Evaluación de mis clases', icon: 'star' },
    { href: '/docente/comunicados', label: 'Comunidad', icon: 'megaphone' },
    { href: '/docente/mensajes', label: 'Mensajes', icon: 'message' },
    { href: '/docente/reclamos', label: 'Reclamos y denuncias', icon: 'flag' },
    { href: '/docente/aria', label: 'ARIA Pedagógica', icon: 'sparkles' },
  ],
  bienestar: [
    { href: '/bienestar', label: 'Inicio', icon: 'home' },
    { href: '/bienestar/solicitudes', label: 'Solicitudes', icon: 'inbox' },
    { href: '/bienestar/casos', label: 'Casos', icon: 'heart' },
    { href: '/bienestar/evaluaciones', label: 'Evaluaciones', icon: 'clipboard' },
    { href: '/bienestar/mensajes', label: 'Mensajes', icon: 'message' },
    { href: '/bienestar/reclamos', label: 'Reclamos y denuncias', icon: 'flag' },
    { href: '/bienestar/aria', label: 'ARIA Bienestar', icon: 'sparkles' },
  ],
  apoderado: [
    { href: '/apoderado', label: 'Inicio', icon: 'home' },
    { href: '/apoderado/hijos', label: 'Seguimiento escolar', icon: 'users' },
    { href: '/apoderado/comunicados', label: 'Comunidad', icon: 'megaphone' },
    { href: '/apoderado/mensajes', label: 'Mensajes', icon: 'message' },
    { href: '/apoderado/acompanamiento', label: 'Acompañamiento', icon: 'heart' },
    { href: '/apoderado/reclamos', label: 'Reclamos y denuncias', icon: 'flag' },
    { href: '/apoderado/aria', label: 'ARIA Familias', icon: 'sparkles' },
  ],
  estudiante: [
    { href: '/estudiante', label: 'Inicio', icon: 'home' },
    { href: '/estudiante/tareas', label: 'Tareas y pruebas', icon: 'clipboard' },
    { href: '/estudiante/repaso', label: 'Repaso de clases', icon: 'target' },
    { href: '/estudiante/notas', label: 'Mis notas', icon: 'chart' },
    { href: '/estudiante/asistencia', label: 'Mi asistencia', icon: 'calendar' },
    { href: '/estudiante/comunicados', label: 'Comunidad', icon: 'megaphone' },
    { href: '/estudiante/mensajes', label: 'Mensajes', icon: 'message' },
    { href: '/estudiante/evaluacion', label: 'Evaluar mis clases', icon: 'star' },
    { href: '/estudiante/bienestar', label: 'Pedir apoyo', icon: 'heart' },
    { href: '/estudiante/reclamos', label: 'Reclamos y denuncias', icon: 'flag' },
    { href: '/perfil', label: 'Mi perfil', icon: 'settings' },
  ],
}
