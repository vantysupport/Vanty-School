// Un color estable por asignatura, para reconocerla de un vistazo en las tarjetas del estudiante.
const COVERS = [
  'linear-gradient(135deg,#01abfc,#0063d8)', 'linear-gradient(135deg,#6366f1,#7c3aed)', 'linear-gradient(135deg,#0ea5a4,#0369a1)',
  'linear-gradient(135deg,#f59e0b,#f97316)', 'linear-gradient(135deg,#ec4899,#be185d)', 'linear-gradient(135deg,#22c55e,#15803d)',
]

export function subjectCover(subjectId: string): string {
  let hash = 0
  for (const ch of subjectId) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return COVERS[hash % COVERS.length]
}
