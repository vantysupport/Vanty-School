import type { ReactNode } from 'react'
import Link from 'next/link'
import {
  AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, Award, BarChart3, CalendarCheck, ChevronRight, ClipboardCheck, ClipboardList,
  GraduationCap, Grid3x3, Layers, LineChart, Minus, Star, TrendingUp, Users,
} from 'lucide-react'
import { perfHref, type Performance, type PerfSearch } from '@/lib/data/performance'
import { monthLabel } from '@/lib/feedback'
import { fmtDate, fmtDateShort, fmtPct, fmtScore, scoreTone } from '@/lib/format'
import { Avatar, Badge, Card, CardBody, CardHeader, EmptyState, Notice, StatStrip, Table, Td, Th } from '@/components/ui/primitives'
import { Pagination } from '@/components/ui/filters'
import { Bar, BarChart, CountUp, Pop, Reveal, Ring, Row, Stacked } from '@/components/ui/motion'

type Props = { d: Performance; sp: PerfSearch }

const BUCKETS = [
  { label: 'Bajo 4,0', className: 'bg-v-danger', tone: 'danger' },
  { label: '4,0 – 4,9', className: 'bg-v-warning', tone: 'warning' },
  { label: '5,0 – 5,9', className: 'bg-v-accent', tone: 'brand' },
  { label: '6,0 – 7,0', className: 'bg-v-success', tone: 'success' },
] as const
const segments = (values: number[]) => BUCKETS.map((b, i) => ({ label: b.label, className: b.className, value: values[i] ?? 0 }))
const barTone = (avg: number | null) => (avg == null ? 'neutral' : avg < 4 ? 'danger' : avg < 5 ? 'warning' : avg < 6 ? 'brand' : 'success')
const scale = (avg: number | null) => (((avg ?? 1) - 1) / 6) * 100
const five = (v: number | null) => (v == null ? '—' : v.toFixed(1).replace('.', ','))
const pill = (on: boolean) => `inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-semibold ${on ? 'v-brand shadow-v-brand' : 'text-v-muted hover:bg-v-fill hover:text-v-text'}`

/** Color de celda del mapa de calor según el promedio (rojo bajo 4,0 → verde sobre 6,0). */
function heat(avg: number | null) {
  if (avg == null) return { background: 'var(--v-fill)', color: 'var(--v-text-tertiary)' }
  const [r, g, b] = avg < 4 ? [229, 72, 77] : avg < 5 ? [245, 158, 11] : avg < 6 ? [0, 105, 219] : [31, 174, 107]
  const strength = avg < 4 ? 0.14 + (4 - avg) * 0.1 : 0.12 + (avg - Math.floor(avg)) * 0.14
  return { background: `rgba(${r}, ${g}, ${b}, ${Math.min(0.34, strength).toFixed(2)})`, color: `rgb(${Math.round(r * 0.72)}, ${Math.round(g * 0.72)}, ${Math.round(b * 0.72)})` }
}

function Delta({ value, suffix = '', invert = false, quiet = 'igual' }: { value: number | null; suffix?: string; invert?: boolean; quiet?: string }) {
  if (value == null) return null
  if (Math.abs(value) < 0.05) return <span className="inline-flex items-center gap-0.5 text-[11px] text-v-subtle"><Minus size={11} />{quiet}</span>
  const good = invert ? value < 0 : value > 0
  const Icon = value > 0 ? ArrowUpRight : ArrowDownRight
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums ${good ? 'text-v-success' : 'text-v-danger'}`}>
      <Icon size={12} />{value > 0 ? '+' : ''}{value.toFixed(1).replace('.', ',')}{suffix}
    </span>
  )
}

const CHIP = { accent: 'bg-v-accent-soft text-v-accent', success: 'bg-v-success/15 text-v-success', warning: 'bg-v-warning/15 text-v-warning', danger: 'bg-v-danger/10 text-v-danger' }

function Metric({ index, icon, tone = 'accent', label, value, hint, compare, href }: {
  index: number; icon: ReactNode; tone?: keyof typeof CHIP; label: string; value: string | number; hint: string; compare?: ReactNode; href?: string
}) {
  const body = (
    <>
      <div className="flex items-center gap-2.5">
        <span className={`grid size-9 shrink-0 place-items-center rounded-[30%] ${CHIP[tone]}`}>{icon}</span>
        <p className="min-w-0 truncate text-xs font-medium text-v-muted">{label}</p>
      </div>
      <p className="v-display mt-3 text-[1.9rem] font-bold leading-none tracking-tight tabular-nums text-v-text"><CountUp value={value} /></p>
      <p className="mt-2 flex min-h-4 items-center justify-between gap-2 text-[11px] text-v-subtle"><span className="truncate">{hint}</span>{compare}</p>
    </>
  )
  const className = 'block h-full rounded-v border border-v-border bg-v-elevated p-4 shadow-v'
  return <Reveal index={index}>{href ? <Link href={href} scroll={false} className={`${className} hover:border-v-accent`}>{body}</Link> : <div className={className}>{body}</div>}</Reveal>
}

/** Los cuatro indicadores del resumen; con un filtro activo, cada uno se compara con el colegio completo. */
function ScopeMetrics({ d }: { d: Performance }) {
  const { scope: s, school, filtered } = d
  const diff = (a: number | null, b: number | null) => (filtered && a != null && b != null ? a - b : null)
  const vs = 'frente al colegio'
  return (
    <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
      <Metric index={0} icon={<TrendingUp size={17} />} label="Promedio de notas" value={fmtScore(s.average)} hint={filtered ? vs : `${s.graded} calificaciones`} compare={<Delta value={diff(s.average, school.average)} />} />
      <Metric index={1} icon={<AlertTriangle size={17} />} tone={s.belowPct != null && s.belowPct >= 20 ? 'danger' : 'warning'} label="Notas bajo 4,0" value={fmtPct(s.belowPct)}
        hint={filtered ? vs : 'del total de notas'} compare={<Delta value={diff(s.belowPct, school.belowPct)} suffix=" pp" invert />} />
      <Metric index={2} icon={<ClipboardCheck size={17} />} label="Entregas a tiempo" value={fmtPct(s.submissionRate)} hint={filtered ? vs : `${s.delivered} de ${s.expected}`} compare={<Delta value={diff(s.submissionRate, school.submissionRate)} suffix=" pp" />} />
      <Metric index={3} icon={<CalendarCheck size={17} />} tone="success" label="Asistencia" value={fmtPct(s.attendance)} hint={filtered ? vs : 'periodo vigente'} compare={<Delta value={diff(s.attendance, school.attendance)} suffix=" pp" />} />
    </div>
  )
}

// ── Resumen ────────────────────────────────────────────────────────────────────
export function GeneralView({ d, sp }: Props) {
  const total = d.scores.length
  const passed = d.scores.filter(v => v >= 4).length
  const kind = d.unitKind
  const title = kind === 'grado' ? 'Cómo va cada grado' : kind === 'sección' ? `Cómo va cada sección de ${d.selection.grade?.name ?? 'este grado'}` : `Cómo va cada asignatura de ${d.selection.course?.name ?? 'este curso'}`
  const weeklyData = d.weekly.map(w => ({ label: fmtDateShort(w.start), value: w.average, display: fmtScore(w.average) }))
  const look = [
    { n: d.students.counts.alerts, label: 'Estudiantes que necesitan apoyo', hint: 'Promedio, asistencia o entregas', tone: 'warning' as const, icon: <Users size={17} />, href: perfHref(sp, { vista: 'alumnado', estado: 'alerta' }) },
    { n: d.evaluations.counts.low, label: 'Evaluaciones con resultados bajos', hint: 'Promedio bajo 4,0 o 30% reprobado', tone: 'danger' as const, icon: <AlertTriangle size={17} />, href: perfHref(sp, { vista: 'evaluaciones', estado: 'bajas' }) },
    { n: d.evaluations.counts.pending, label: 'Evaluaciones por corregir', hint: 'Entregas recibidas sin nota', tone: 'accent' as const, icon: <ClipboardCheck size={17} />, href: perfHref(sp, { vista: 'evaluaciones', estado: 'porcorregir' }) },
    { n: d.students.counts.outstanding, label: 'Estudiantes destacados', hint: 'Promedio desde 6,0 y al día', tone: 'success' as const, icon: <Award size={17} />, href: perfHref(sp, { vista: 'alumnado', estado: 'destacados' }) },
  ]

  return (
    <>
      <ScopeMetrics d={d} />

      <h2 className="mb-2 mt-1 px-1 text-[13px] font-semibold uppercase tracking-[0.1em] text-v-subtle">Qué revisar primero</h2>
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {look.map((x, i) => (
          <Reveal key={x.label} index={4 + i}>
            <Link href={x.href} scroll={false} className="group flex h-full items-center gap-3.5 rounded-v border border-v-border bg-v-elevated p-4 shadow-v hover:border-v-accent">
              <span className={`v-display grid size-12 shrink-0 place-items-center rounded-[30%] text-xl font-bold tabular-nums ${x.n === 0 ? 'bg-v-fill text-v-subtle' : CHIP[x.tone]}`}>{x.n}</span>
              <span className="min-w-0 flex-1"><span className="block text-[13.5px] font-semibold leading-snug">{x.label}</span><span className="mt-0.5 block truncate text-[11px] text-v-subtle">{x.hint}</span></span>
              <ArrowRight size={15} className="shrink-0 text-v-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-v-accent" />
            </Link>
          </Reveal>
        ))}
      </div>

      <Card index={8} className="mb-4">
        <CardHeader icon={<BarChart3 size={15} />} title={title} description={`Haz clic en una fila para ver solo ${kind === 'grado' ? 'ese grado' : kind === 'sección' ? 'esa sección' : 'esa asignatura'}.`} />
        {d.units.length === 0 ? <EmptyState aria={8} title="Sin cursos en esta selección" description="Este nivel aún no tiene secciones creadas." /> : (
          <Table>
            <thead><tr>
              <Th className="capitalize">{kind}</Th><Th>Promedio</Th><Th>Notas bajo 4,0</Th><Th>Entregas a tiempo</Th>{kind !== 'asignatura' && <Th>Asistencia</Th>}{kind !== 'asignatura' && <Th>Estudiantes en alerta</Th>}<Th />
            </tr></thead>
            <tbody>
              {d.units.map(u => (
                <tr key={u.id} className="group relative hover:bg-v-fill/50">
                  <Td className="whitespace-nowrap"><Link href={perfHref(sp, u.patch)} scroll={false} className="block after:absolute after:inset-0"><span className="block font-semibold group-hover:text-v-accent">{u.label}</span><span className="text-xs text-v-subtle">{u.sub}{kind === 'grado' ? ` · ${u.students} estudiantes` : ''}</span></Link></Td>
                  <Td>
                    <span className="flex items-center gap-3">
                      <span className={`v-display w-9 text-base font-bold ${u.average != null && u.average < 4 ? 'text-v-danger' : ''}`}>{fmtScore(u.average)}</span>
                      <span className="hidden w-32 sm:block"><Bar value={scale(u.average)} tone={barTone(u.average)} /></span>
                    </span>
                  </Td>
                  <Td><span className={`font-semibold ${u.belowPct != null && u.belowPct >= 30 ? 'text-v-danger' : ''}`}>{fmtPct(u.belowPct)}</span></Td>
                  <Td><span className={`font-semibold ${u.submissionRate != null && u.submissionRate < 75 ? 'text-v-warning' : ''}`}>{fmtPct(u.submissionRate)}</span></Td>
                  {kind !== 'asignatura' && <Td><span className={`font-semibold ${u.attendance != null && u.attendance < 88 ? 'text-v-danger' : ''}`}>{fmtPct(u.attendance)}</span></Td>}
                  {kind !== 'asignatura' && <Td>{u.alerts ? <Badge tone="warning">{u.alerts} de {u.students}</Badge> : <span className="text-v-subtle">Ninguno</span>}</Td>}
                  <Td className="text-right"><ChevronRight size={16} className="inline text-v-subtle group-hover:text-v-accent" /></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <div className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-2">
        <Card index={9} className="flex flex-col">
          <CardHeader icon={<Layers size={15} />} title="Cómo se reparten las notas" description={`${total} calificaciones · ${d.label}`} />
          <CardBody className="flex flex-1 flex-col">
            {total === 0 ? <EmptyState title="Sin calificaciones en esta selección" /> : (
              <>
                <div className="flex items-center gap-4 rounded-v-sm bg-v-fill p-3.5">
                  <Ring value={(passed / total) * 100} size={76} label={`${Math.round((passed / total) * 100)}% de notas aprobadas`} />
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-semibold">Notas aprobadas (4,0 o más)</p>
                    <p className="mt-0.5 text-xs text-v-muted">{passed} de {total}. Nota mínima {fmtScore(Math.min(...d.scores))}, máxima {fmtScore(Math.max(...d.scores))}.</p>
                  </div>
                </div>
                <ul className="mt-4 flex flex-1 flex-col justify-between gap-3">
                  {BUCKETS.map((b, i) => (
                    <li key={b.label}>
                      <div className="mb-1.5 flex items-center justify-between text-[13px]">
                        <span className="inline-flex items-center gap-2 font-medium"><span className={`size-2.5 rounded-sm ${b.className}`} />{b.label}</span>
                        <span className="tabular-nums text-v-muted"><span className="font-semibold text-v-text">{d.distribution[i]}</span> · {fmtPct((d.distribution[i] / total) * 100)}</span>
                      </div>
                      <Bar value={(d.distribution[i] / total) * 100} tone={b.tone} delay={0.3 + i * 0.08} />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </CardBody>
        </Card>

        <Card index={10} className="flex flex-col">
          <CardHeader icon={<LineChart size={15} />} title="Cómo han ido las últimas semanas" description="Promedio de las evaluaciones de cada semana" />
          <CardBody className="flex flex-1 flex-col justify-end">
            {weeklyData.every(w => w.value == null) ? <EmptyState title="Sin evaluaciones con nota en las últimas 8 semanas" /> : (
              <BarChart data={weeklyData} height={230} highlight={d.weekly.findLastIndex(w => w.average != null)} />
            )}
          </CardBody>
        </Card>
      </div>
    </>
  )
}

// ── Asignaturas ────────────────────────────────────────────────────────────────
export function SubjectsView({ d, sp }: Props) {
  return (
    <>
      <Card index={2} className="mb-4">
        <CardHeader icon={<Grid3x3 size={15} />} title={`Promedio por ${d.selection.grade ? 'sección' : 'grado'} y asignatura`} description="Rojo: bajo 4,0. Verde: sobre 6,0. Haz clic en una casilla para ver solo ese cruce." />
        <CardBody className="overflow-x-auto">
          {d.heat.length === 0 || d.heatSubjects.length === 0 ? <EmptyState title="Aún no hay notas para comparar" /> : (
            <div className="grid min-w-[520px] gap-1.5" style={{ gridTemplateColumns: `minmax(140px, 1fr) repeat(${d.heatSubjects.length}, minmax(90px, 1fr))` }}>
              <span />
              {d.heatSubjects.map(s => <span key={s.id} className="truncate px-1 pb-1 text-center text-[11px] font-semibold uppercase tracking-[0.06em] text-v-subtle" title={s.name}>{s.name}</span>)}
              {d.heat.map((r, ri) => (
                <div key={r.id} className="contents">
                  <Link href={perfHref(sp, { ...r.patch, asignatura: undefined })} scroll={false} className={`flex items-center text-[13px] font-semibold hover:text-v-accent ${r.selected ? 'text-v-accent' : 'text-v-text'}`}>{r.label}</Link>
                  {r.cells.map((c, ci) => (
                    <Link key={c.subjectId} href={perfHref(sp, { ...r.patch, asignatura: c.subjectId })} scroll={false} aria-label={`${r.label}: promedio ${fmtScore(c.average)}`}>
                      <Pop index={ri * d.heatSubjects.length + ci} style={heat(c.average)} title={c.graded ? `${c.graded} calificaciones · ${fmtPct(c.belowPct)} bajo 4,0` : 'Sin evaluaciones'}
                        className={`flex h-[58px] flex-col items-center justify-center rounded-v-sm ${r.selected && sp.asignatura === c.subjectId ? 'ring-2 ring-v-accent ring-offset-2' : ''}`}>
                        <span className="v-display text-lg font-bold leading-none tabular-nums">{fmtScore(c.average)}</span>
                        <span className="mt-1 text-[10px] font-medium opacity-80">{c.graded ? `${fmtPct(c.belowPct)} bajo 4,0` : 'sin datos'}</span>
                      </Pop>
                    </Link>
                  ))}
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-v-muted">
            {BUCKETS.map(b => <span key={b.label} className="inline-flex items-center gap-1.5"><span className={`size-2.5 rounded-sm ${b.className}`} />{b.label}</span>)}
          </div>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-3">
        {([['Donde más cuesta', 'Menor promedio', d.weakest, 'warning', <AlertTriangle key="i" size={15} />], ['Donde mejor va', 'Mayor promedio', d.strongest, 'success', <Award key="i" size={15} />]] as const).map(([name, description, list, tone, icon], ci) => (
          <Card key={name} index={3 + ci}>
            <CardHeader icon={icon} tone={tone} title={name} description={description} />
            {list.length === 0 ? <EmptyState title="Sin datos" /> : (
              <ul className="space-y-1 px-3 pb-4">
                {list.map((g, i) => (
                  <Row key={g.courseId + g.subjectId} index={i} className="rounded-v-sm px-2 py-2.5 hover:bg-v-fill">
                    <Link href={perfHref(sp, { curso: g.courseId, asignatura: g.subjectId, grado: undefined, nivel: undefined })} scroll={false} className="flex items-center gap-3">
                      <span className={`v-display grid size-8 shrink-0 place-items-center rounded-[30%] text-xs font-bold ${tone === 'warning' ? 'bg-v-warning/15 text-v-warning' : 'bg-v-success/15 text-v-success'}`}>{i + 1}</span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-semibold">{g.subjectName}</span>
                        <span className="block truncate text-[11px] text-v-subtle">{g.courseName} · {fmtPct(g.belowPct)} bajo 4,0</span></span>
                      <Badge tone={scoreTone(g.average)}>{fmtScore(g.average)}</Badge>
                    </Link>
                  </Row>
                ))}
              </ul>
            )}
          </Card>
        ))}
        <Card index={5}>
          <CardHeader icon={<ClipboardList size={15} />} title="Por contenido" description="Promedio de cada contenido evaluado" />
          {d.topics.length === 0 ? <EmptyState title="Sin contenidos evaluados" /> : (
            <ul className="max-h-[272px] space-y-3 overflow-y-auto px-5 pb-5 pt-1">
              {d.topics.map((t, i) => (
                <li key={t.subject + t.topic}>
                  <div className="mb-1.5 flex items-center justify-between gap-2 text-[13px]">
                    <span className="min-w-0 truncate"><span className="font-semibold">{t.topic}</span><span className="ml-1.5 text-[11px] text-v-subtle">{t.subject.split(' ')[0]} · {t.n} notas</span></span>
                    <span className="v-display shrink-0 font-bold tabular-nums">{fmtScore(t.average)}</span>
                  </div>
                  <Bar value={scale(t.average)} tone={barTone(t.average)} delay={0.3 + Math.min(i, 8) * 0.05} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}

// ── Evaluaciones ───────────────────────────────────────────────────────────────
export function EvaluationsView({ d, sp }: Props) {
  const e = d.evaluations
  const filters = [['', 'Todas', e.counts.total], ['porcorregir', 'Por corregir', e.counts.pending], ['bajas', 'Resultados bajos', e.counts.low], ['proximas', 'Próximas', e.counts.upcoming]] as const
  return (
    <>
      <StatStrip items={[
        { label: 'Evaluaciones publicadas', value: e.counts.total, hint: `${e.counts.graded} con notas`, icon: <ClipboardList size={15} /> },
        { label: 'Con entregas por corregir', value: e.counts.pending, icon: <ClipboardCheck size={15} />, tone: e.counts.pending ? 'warning' : 'success', href: perfHref(sp, { estado: 'porcorregir' }) },
        { label: 'Con resultados bajos', value: e.counts.low, hint: 'promedio < 4,0 o 30% reprobado', icon: <AlertTriangle size={15} />, tone: e.counts.low ? 'danger' : 'success', href: perfHref(sp, { estado: 'bajas' }) },
        { label: 'Próximas', value: e.counts.upcoming, icon: <CalendarCheck size={15} />, href: perfHref(sp, { estado: 'proximas' }) },
      ]} />
      <Card index={2}>
        <CardHeader icon={<ClipboardList size={15} />} title="Evaluaciones y tareas" description={`${e.total} ${e.total === 1 ? 'resultado' : 'resultados'} · ${d.label}${sp.q ? ` · «${sp.q}»` : ''}`}
          actions={<nav aria-label="Filtrar evaluaciones" className="flex flex-wrap rounded-full bg-v-fill p-1">
            {filters.map(([v, l, n]) => <Link key={v} href={perfHref(sp, { estado: v || undefined })} scroll={false} className={pill((sp.estado ?? '') === v)}>{l}<span className="opacity-70">{n}</span></Link>)}
          </nav>} />
        {e.rows.length === 0 ? <EmptyState aria={8} title="Ninguna evaluación coincide" description="Cambia el alcance, el filtro o la búsqueda." /> : (
          <Table>
            <thead><tr><Th>Evaluación</Th><Th>Curso y asignatura</Th><Th>Fecha</Th><Th>Cobertura</Th><Th>Promedio</Th><Th>Distribución</Th><Th>Bajo 4,0</Th><Th>Por corregir</Th></tr></thead>
            <tbody>
              {e.rows.map(a => (
                <tr key={a.id} className="hover:bg-v-fill/50">
                  <Td><span className="block max-w-[260px] truncate font-semibold" title={a.title}>{a.title}</span><span className="block max-w-[260px] truncate text-xs text-v-subtle">{a.topic ?? 'Sin contenido indicado'}</span></Td>
                  <Td className="whitespace-nowrap"><Link href={`/direccion/cursos/${a.courseId}`} className="font-medium hover:text-v-accent">{a.courseName}</Link><span className="block text-xs text-v-subtle">{a.subjectName}{a.teacher ? ` · ${a.teacher}` : ''}</span></Td>
                  <Td className="whitespace-nowrap text-v-muted">{fmtDate(a.dueAt)}{!a.isDue && <span className="ml-1.5"><Badge tone="accent">Próxima</Badge></span>}</Td>
                  <Td>
                    <span className="flex items-center gap-2.5">
                      <span className="w-14 whitespace-nowrap text-v-muted"><span className="font-semibold text-v-text">{a.graded}</span> / {a.enrolled}</span>
                      <span className="hidden w-16 lg:block"><Bar value={a.enrolled ? (a.graded / a.enrolled) * 100 : 0} tone={a.graded >= a.enrolled ? 'success' : 'brand'} /></span>
                    </span>
                  </Td>
                  <Td><span className={`v-display text-base font-bold ${a.average != null && a.average < 4 ? 'text-v-danger' : ''}`}>{fmtScore(a.average)}</span></Td>
                  <Td><span className="block w-28"><Stacked segments={segments(a.buckets)} height={8} /></span></Td>
                  <Td>{a.graded ? <><span className={`font-semibold ${a.belowPass / a.graded >= 0.3 ? 'text-v-danger' : ''}`}>{fmtPct((a.belowPass / a.graded) * 100)}</span><span className="ml-1.5 text-xs text-v-subtle">{a.belowPass} de {a.graded}</span></> : <span className="text-v-subtle">—</span>}</Td>
                  <Td>{a.pendingReview ? <Badge tone="warning">{a.pendingReview}</Badge> : <span className="text-v-subtle">0</span>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination page={e.page} pageSize={e.pageSize} total={e.total} />
        <p className="border-t border-v-border px-5 py-3 text-xs text-v-subtle">Cobertura: estudiantes con nota sobre los matriculados del curso. «Por corregir»: entregas recibidas que aún no tienen calificación.</p>
      </Card>
    </>
  )
}

// ── Alumnado ───────────────────────────────────────────────────────────────────
export function StudentsView({ d, sp }: Props) {
  const s = d.students
  const c = s.counts
  const withAverage = c.buckets.reduce((n, v) => n + v, 0)
  const filters = [['', 'Todos', c.total], ['alerta', 'En alerta', c.alerts], ['destacados', 'Destacados', c.outstanding], ['sinnotas', 'Sin notas', c.ungraded]] as const
  const orders = [['', 'Atención primero'], ['promedio', 'Menor promedio'], ['mejor', 'Mayor promedio'], ['asistencia', 'Menor asistencia'], ['nombre', 'Nombre']] as const
  const first = (s.page - 1) * s.pageSize
  return (
    <>
      <div className="mb-4 grid grid-cols-1 items-stretch gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Card index={2} className="flex flex-col">
          <CardHeader icon={<GraduationCap size={15} />} title="Promedio por estudiante" description={`${withAverage} de ${c.total} estudiantes con notas · ${d.label}`}
            actions={<Badge tone={scoreTone(c.average)}>Promedio {fmtScore(c.average)}</Badge>} />
          <CardBody className="flex flex-1 flex-col justify-center">
            {withAverage === 0 ? <EmptyState title="Aún no hay estudiantes con notas" /> : (
              <>
                <Stacked height={14} segments={segments(c.buckets)} />
                <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {BUCKETS.map((b, i) => (
                    <li key={b.label} className="rounded-v-sm bg-v-fill p-3">
                      <p className="inline-flex items-center gap-1.5 text-[11px] font-medium text-v-muted"><span className={`size-2.5 rounded-sm ${b.className}`} />{b.label}</p>
                      <p className="v-display mt-1.5 text-2xl font-bold leading-none tabular-nums">{c.buckets[i]}</p>
                      <p className="mt-1 text-[11px] text-v-subtle">{fmtPct((c.buckets[i] / withAverage) * 100)} del alumnado</p>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </CardBody>
        </Card>
        <Card index={3} className="flex flex-col">
          <CardHeader icon={<AlertTriangle size={15} />} tone="warning" title="Motivos de alerta" description={`${c.alerts} de ${c.total} estudiantes requieren atención`} />
          <CardBody className="flex flex-1 flex-col justify-center">
            <ul className="space-y-4">
              {c.reasons.map((r, i) => (
                <li key={r.label}>
                  <div className="mb-1.5 flex items-center justify-between text-[13px]"><span className="font-medium">{r.label}</span><span className="tabular-nums text-v-muted"><span className="font-semibold text-v-text">{r.value}</span> · {fmtPct(c.total ? (r.value / c.total) * 100 : 0)}</span></div>
                  <Bar value={c.total ? (r.value / c.total) * 100 : 0} tone={r.value ? 'warning' : 'neutral'} delay={0.3 + i * 0.08} />
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-v-subtle">Un estudiante puede cumplir más de un criterio. Las alertas son señales para acompañar, no una evaluación del estudiante.</p>
          </CardBody>
        </Card>
      </div>

      <Card index={4}>
        <CardHeader icon={<Users size={15} />} title="Estudiantes" description={`${s.total} ${s.total === 1 ? 'resultado' : 'resultados'} · ${d.label}${sp.q ? ` · «${sp.q}»` : ''}`}
          actions={<nav aria-label="Filtrar estudiantes" className="flex flex-wrap rounded-full bg-v-fill p-1">
            {filters.map(([v, l, n]) => <Link key={v} href={perfHref(sp, { estado: v || undefined })} scroll={false} className={pill((sp.estado ?? '') === v)}>{l}<span className="opacity-70">{n}</span></Link>)}
          </nav>} />
        <nav aria-label="Ordenar" className="flex items-center gap-1 overflow-x-auto border-t border-v-border px-4 py-2">
          <span className="shrink-0 px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-v-subtle">Ordenar</span>
          {orders.map(([v, l]) => <Link key={v} href={perfHref(sp, { orden: v || undefined })} scroll={false} className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${(sp.orden ?? '') === v ? 'bg-v-accent-soft text-v-accent' : 'text-v-muted hover:bg-v-fill'}`}>{l}</Link>)}
        </nav>
        {s.rows.length === 0 ? <EmptyState aria={8} title="Ningún estudiante coincide" description="Cambia el alcance, el filtro o la búsqueda." /> : (
          <Table>
            <thead><tr><Th className="w-12">N.º</Th><Th>Estudiante</Th><Th>Promedio{d.selection.subject ? ` · ${d.selection.subject.name.split(' ')[0]}` : ''}</Th><Th>Asistencia</Th><Th>Entregas pendientes</Th><Th>Asignaturas bajo 4,0</Th><Th>Situación</Th><Th /></tr></thead>
            <tbody>
              {s.rows.map((r, i) => (
                <tr key={r.id + r.courseId} className="hover:bg-v-fill/50">
                  <Td className="text-v-subtle">{first + i + 1}</Td>
                  <Td>
                    <Link href={`/direccion/estudiantes/${r.id}`} className="flex items-center gap-3">
                      <Avatar name={r.name} id={r.id} size={32} />
                      <span className="min-w-0"><span className="block truncate font-semibold hover:text-v-accent">{r.name}</span><span className="block text-xs text-v-subtle">{r.courseName}</span></span>
                    </Link>
                  </Td>
                  <Td>
                    <span className="flex items-center gap-2.5">
                      <span className={`v-display w-9 text-base font-bold ${r.average != null && r.average < 4 ? 'text-v-danger' : ''}`}>{fmtScore(r.average)}</span>
                      <span className="hidden w-20 sm:block"><Bar value={scale(r.average)} tone={barTone(r.average)} /></span>
                    </span>
                  </Td>
                  <Td><span className={`font-semibold ${r.attendance != null && r.attendance < 85 ? 'text-v-danger' : ''}`}>{fmtPct(r.attendance)}</span></Td>
                  <Td>{r.missing ? <span className={`font-semibold ${r.missing >= 3 ? 'text-v-warning' : ''}`}>{r.missing}</span> : <span className="text-v-subtle">0</span>}</Td>
                  <Td>{r.belowSubjects ? <Badge tone="danger">{r.belowSubjects}</Badge> : <span className="text-v-subtle">0</span>}</Td>
                  <Td>
                    <span className="flex flex-wrap gap-1">
                      {r.reasons.length > 0 ? r.reasons.map(x => <Badge key={x} tone="warning">{x}</Badge>) : r.outstanding ? <Badge tone="success"><Award size={11} />Destacado</Badge> : r.graded === 0 ? <Badge>Sin notas</Badge> : <span className="text-xs text-v-subtle">Al día</span>}
                    </span>
                  </Td>
                  <Td className="text-right"><Link href={`/direccion/estudiantes/${r.id}`} aria-label={`Abrir ficha de ${r.name}`} className="inline-flex text-v-subtle hover:text-v-accent"><ChevronRight size={16} /></Link></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination page={s.page} pageSize={s.pageSize} total={s.total} />
        <p className="border-t border-v-border px-5 py-3 text-xs text-v-subtle">Alerta: promedio bajo 4,0, asistencia bajo 85% o 3 o más entregas pendientes. Destacado: promedio desde 6,0, asistencia desde 90% y entregas al día.</p>
      </Card>
    </>
  )
}

// ── Docentes ───────────────────────────────────────────────────────────────────
export function TeachersView({ d, sp }: Props) {
  const fb = d.classFeedback
  const rows = d.teachers.rows
  const monthly = fb.monthly.map(m => ({ label: monthLabel(m.month).split(' ')[0], value: m.score, display: five(m.score) }))
  return (
    <>
      <div className="mb-4"><Notice title="Información para acompañar, no para calificar">
        Los resultados de un curso dependen de muchos factores además de la docencia. Estas cifras sirven para decidir apoyos, formación y distribución de carga; no constituyen una evaluación de desempeño ni deben usarse como base de sanciones.
      </Notice></div>
      <StatStrip items={[
        { label: 'Docentes en la selección', value: d.teachers.total, icon: <Users size={15} /> },
        { label: 'Grupos a cargo', value: rows.reduce((n, t) => n + t.groups.length, 0), hint: 'curso × asignatura', icon: <Layers size={15} /> },
        { label: 'Entregas por corregir', value: rows.reduce((n, t) => n + t.pendingReview, 0), icon: <ClipboardCheck size={15} />, tone: 'warning' },
        { label: 'Evaluación de clases', value: five(fb.score), hint: fb.score == null ? 'sin respuestas' : 'de 5', icon: <Star size={15} />, tone: 'success' },
      ]} />

      <div className="mb-4 grid grid-cols-1 items-stretch gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Card index={2} className="flex flex-col">
          <CardHeader icon={<Star size={15} />} title="Evaluación de clases por dimensión" description={fb.month ? `${monthLabel(fb.month)} · ${fb.responses} respuestas de estudiantes · ${d.label}` : d.label} />
          <CardBody className="flex-1">
            {fb.score == null ? <EmptyState title="Aún no hay respuestas suficientes" description="Se muestran resultados desde 3 respuestas por grupo." /> : (
              <ul className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
                {fb.dims.map((x, i) => (
                  <li key={x.key}>
                    <div className="mb-1.5 flex items-baseline justify-between gap-2">
                      <span className="text-[13px] font-semibold">{x.label}</span>
                      <span className="flex shrink-0 items-center gap-2"><Delta value={x.value != null && x.previous != null ? x.value - x.previous : null} quiet="" /><span className="v-display text-sm font-bold tabular-nums">{five(x.value)}</span></span>
                    </div>
                    <Bar value={((x.value ?? 0) / 5) * 100} tone={x.value != null && x.value < 3.5 ? 'warning' : 'brand'} delay={0.3 + i * 0.06} />
                    <p className="mt-1 text-[11px] text-v-subtle">{x.question}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
        <Card index={3} className="flex flex-col">
          <CardHeader icon={<LineChart size={15} />} title="Evolución mensual" description="Promedio de la evaluación de clases (1 a 5)"
            actions={<Delta value={fb.score != null && fb.previous != null ? fb.score - fb.previous : null} quiet="igual que el mes anterior" />} />
          <CardBody className="flex flex-1 flex-col justify-end">
            {monthly.every(m => m.value == null) ? <EmptyState title="Sin meses con resultados" /> : <BarChart data={monthly} height={180} />}
          </CardBody>
        </Card>
      </div>

      <Card index={4}>
        <CardHeader icon={<Users size={15} />} title="Docentes y sus cursos" description={`${rows.length} de ${d.teachers.total} · orden alfabético · ${d.label}${sp.q ? ` · «${sp.q}»` : ''}`} />
        {rows.length === 0 ? <EmptyState aria={8} title="Ningún docente coincide" description="Cambia el alcance o la búsqueda." /> : (
          <Table>
            <thead><tr><Th>Docente</Th><Th>Cursos y asignaturas</Th><Th>Estudiantes</Th><Th>Promedio de sus cursos</Th><Th>Bajo 4,0</Th><Th>Entregas a tiempo</Th><Th>Por corregir</Th><Th>Evaluación de clases</Th><Th /></tr></thead>
            <tbody>
              {rows.map(t => (
                <tr key={t.id} className="hover:bg-v-fill/50">
                  <Td>
                    <Link href={`/direccion/docentes/${t.id}`} className="flex items-center gap-3">
                      <Avatar name={t.name} id={t.id} size={34} />
                      <span className="min-w-0"><span className="block truncate font-semibold hover:text-v-accent">{t.name}</span><span className="block text-xs text-v-subtle">{t.groups.length} {t.groups.length === 1 ? 'grupo' : 'grupos'} · {t.evaluations} evaluaciones{t.active ? '' : ' · inactivo'}</span></span>
                    </Link>
                  </Td>
                  <Td>
                    <span className="flex max-w-[320px] flex-wrap gap-1">
                      {t.groups.slice(0, 3).map(g => <Badge key={g.courseName + g.subjectName} tone="accent">{g.courseName} · {g.subjectName.split(' ')[0]}</Badge>)}
                      {t.groups.length > 3 && <Badge>+{t.groups.length - 3}</Badge>}
                    </span>
                  </Td>
                  <Td className="font-semibold">{t.students}</Td>
                  <Td>
                    <span className="flex items-center gap-2.5">
                      <span className="v-display w-9 text-base font-bold">{fmtScore(t.average)}</span>
                      <span className="hidden w-20 sm:block"><Bar value={scale(t.average)} tone={t.average == null ? 'neutral' : 'brand'} /></span>
                    </span>
                  </Td>
                  <Td className="font-semibold">{fmtPct(t.belowPct)}</Td>
                  <Td className="font-semibold">{fmtPct(t.submissionRate)}</Td>
                  <Td>{t.pendingReview ? <Badge tone="warning">{t.pendingReview}</Badge> : <span className="text-v-subtle">0</span>}</Td>
                  <Td>
                    {t.feedback == null ? <span className="text-xs text-v-subtle">Sin respuestas suficientes</span> : (
                      <span className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 font-semibold"><Star size={12} className="text-v-accent" />{five(t.feedback)}</span>
                        <Delta value={t.feedbackPrev != null ? t.feedback - t.feedbackPrev : null} quiet="" />
                        <span className="text-xs text-v-subtle">{t.responses} resp.</span>
                      </span>
                    )}
                  </Td>
                  <Td className="text-right"><Link href={`/direccion/docentes/${t.id}`} aria-label={`Abrir perfil de ${t.name}`} className="inline-flex text-v-subtle hover:text-v-accent"><ChevronRight size={16} /></Link></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <p className="border-t border-v-border px-5 py-3 text-xs text-v-subtle">La evaluación de clases es anónima y solo se muestra con 5 o más respuestas por grupo. En el perfil de cada docente está el historial y la lectura de ARIA orientada a la mejora.</p>
      </Card>
    </>
  )
}
