import Link from 'next/link'
import { CalendarCheck, ClipboardList, GraduationCap, TrendingUp } from 'lucide-react'
import { TASK_STATE, type StudentAcademics } from '@/lib/data/student'
import { KIND_LABEL } from '@/lib/assessments'
import { ATTENDANCE_LABEL, fmtDate, fmtDateTime, fmtPct, fmtScore, scoreTone } from '@/lib/format'
import { Badge, Card, CardHeader, EmptyState, Meter, Stat, StatGrid, Table, Td, Th } from '@/components/ui/primitives'

// Bloques de la situación académica de un estudiante. Los comparten el panel del estudiante y el del apoderado.

export function AcademicSummary({ data }: { data: StudentAcademics }) {
  const pending = data.tasks.filter(t => t.state === 'pending' || t.state === 'late')
  return (
    <StatGrid>
      <Stat label="Curso" value={<span className="text-[17px]">{data.course?.name ?? 'Sin curso'}</span>} icon={<GraduationCap size={15} />} />
      <Stat label="Promedio general" value={fmtScore(data.overall)} hint={`${data.subjects.reduce((n, s) => n + s.count, 0)} notas registradas`} icon={<TrendingUp size={15} />} tone={data.overall != null && data.overall < 4 ? 'danger' : 'accent'} />
      <Stat label="Tareas pendientes" value={pending.length} hint={pending.some(t => t.state === 'late') ? `${pending.filter(t => t.state === 'late').length} con plazo vencido` : 'Al día con los plazos'} icon={<ClipboardList size={15} />} tone="warning" />
      <Stat label="Asistencia" value={fmtPct(data.attendanceRate)} hint="Últimas semanas" icon={<CalendarCheck size={15} />} tone="success" />
    </StatGrid>
  )
}

export function SubjectAverages({ data }: { data: StudentAcademics }) {
  return (
    <Card>
      <CardHeader title="Rendimiento por asignatura" description="Promedio de notas en escala 1,0 a 7,0" />
      {data.subjects.length === 0 ? <EmptyState title="Aún no hay notas registradas" /> : (
        <div className="space-y-4 px-5 pb-5 pt-2">
          {data.subjects.map(s => (
            <div key={s.subjectId}>
              <div className="mb-1 flex items-center justify-between text-[13px]">
                <span>{s.subjectName}<span className="ml-1.5 text-[12px] text-v-subtle">{s.count} {s.count === 1 ? 'nota' : 'notas'}</span></span>
                <Badge tone={scoreTone(s.average)}>{fmtScore(s.average)}</Badge>
              </div>
              <Meter value={(((s.average ?? 1) - 1) / 6) * 100} tone={scoreTone(s.average)} />
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

export function TaskList({ data, hrefBase, limit, onlyOpen }: { data: StudentAcademics; hrefBase?: string; limit?: number; onlyOpen?: boolean }) {
  const all = onlyOpen ? data.tasks.filter(t => t.state === 'pending' || t.state === 'late' || t.state === 'upcoming').sort((a, b) => a.dueAt.localeCompare(b.dueAt)) : data.tasks
  const tasks = limit ? all.slice(0, limit) : all
  if (tasks.length === 0) return <EmptyState aria={2} title={onlyOpen ? 'No hay tareas pendientes' : 'Aún no hay tareas'} description={onlyOpen ? 'Todo entregado. ¡Buen trabajo!' : undefined} />
  return (
    <ul className="divide-y divide-v-border">
      {tasks.map(t => {
        const body = (
          <span className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-[13.5px]">
            <span className="min-w-0">
              <span className="block truncate font-medium">{t.title}</span>
              <span className="text-[12px] text-v-subtle">{t.kind !== 'tarea' ? `${KIND_LABEL[t.kind]} · ` : ''}{t.subjectName} · {t.kind !== 'tarea' ? 'el' : 'vence el'} {fmtDateTime(t.dueAt)}</span>
            </span>
            <span className="flex items-center gap-2">
              {t.grade && <Badge tone={scoreTone(t.grade.score)}>{fmtScore(t.grade.score)}</Badge>}
              <Badge tone={TASK_STATE[t.state].tone}>{TASK_STATE[t.state].label}</Badge>
            </span>
          </span>
        )
        return <li key={t.id}>{hrefBase ? <Link href={`${hrefBase}/${t.id}`} className="block hover:bg-v-fill">{body}</Link> : body}</li>
      })}
    </ul>
  )
}

export function GradesTable({ data }: { data: StudentAcademics }) {
  const graded = data.tasks.filter(t => t.grade).sort((a, b) => b.grade!.gradedAt.localeCompare(a.grade!.gradedAt))
  if (graded.length === 0) return <EmptyState aria={8} title="Aún no hay calificaciones" description="Las notas aparecerán aquí cuando los docentes califiquen." />
  return (
    <Table>
      <thead><tr><Th>Actividad</Th><Th>Asignatura</Th><Th>Nota</Th><Th>Retroalimentación</Th><Th>Fecha</Th></tr></thead>
      <tbody>
        {graded.map(t => (
          <tr key={t.id}>
            <Td className="font-medium">{t.title}</Td>
            <Td className="text-v-muted">{t.subjectName}</Td>
            <Td><Badge tone={scoreTone(t.grade!.score)}>{fmtScore(t.grade!.score)}</Badge></Td>
            <Td className="max-w-xs text-v-muted">{t.grade!.feedback || '—'}</Td>
            <Td className="whitespace-nowrap text-v-muted">{fmtDate(t.grade!.gradedAt)}</Td>
          </tr>
        ))}
      </tbody>
    </Table>
  )
}

const ATT_TONE = { present: 'success', late: 'warning', absent: 'danger', justified: 'neutral' } as const

export function AttendanceList({ data, limit = 30 }: { data: StudentAcademics; limit?: number }) {
  if (data.attendance.length === 0) return <EmptyState title="Aún no hay registros de asistencia" />
  const count = (s: string) => data.attendance.filter(a => a.status === s).length
  return (
    <>
      <div className="flex flex-wrap gap-2 border-b border-v-border p-5">
        {(['present', 'late', 'absent', 'justified'] as const).map(s => <Badge key={s} tone={ATT_TONE[s]}>{ATTENDANCE_LABEL[s]}: {count(s)}</Badge>)}
      </div>
      <ul className="grid gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
        {data.attendance.slice(0, limit).map(a => (
          <li key={a.date} className="flex items-center justify-between border-b border-v-border px-4 py-2 text-[13px]">
            <span className="capitalize text-v-muted">{new Date(`${a.date}T12:00:00`).toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
            <Badge tone={ATT_TONE[a.status as keyof typeof ATT_TONE]}>{ATTENDANCE_LABEL[a.status]}</Badge>
          </li>
        ))}
      </ul>
    </>
  )
}
