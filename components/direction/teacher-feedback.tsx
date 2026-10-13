import Link from 'next/link'
import { ArrowDownRight, ArrowUpRight, Handshake, History, Lock, MessageSquareQuote, Minus, Share2, ShieldCheck, Sparkles, Star, TrendingUp } from 'lucide-react'
import type { DB } from '@/lib/supabase/server'
import { analyzeTeacherFeedback, shareInsight } from '@/lib/actions/feedback'
import { ariaConfigured } from '@/lib/aria/providers'
import { COMMITMENT_FOCUS, COMMITMENT_STATUS, FEEDBACK_DIMENSIONS, MIN_COMMENT_RESPONSES, MIN_RESPONSES, monthLabel, type FeedbackMonth } from '@/lib/feedback'
import { fmtDateTime } from '@/lib/format'
import { Badge, Card, CardBody, CardHeader, EmptyState, Table, Td, Th } from '@/components/ui/primitives'
import { ConfirmAction } from '@/components/ui/dialog'
import { AriaAvatar } from '@/components/aria/aria-chat'
import { Bar, BarChart, Ring } from '@/components/ui/motion'

export const one = (v: number) => v.toFixed(1).replace('.', ',')
export const tone = (v: number) => (v >= 4 ? 'success' : v >= 3.2 ? 'brand' : v >= 2.5 ? 'warning' : 'danger') as 'success' | 'brand' | 'warning' | 'danger'

export function Delta({ value, compact }: { value: number | null; compact?: boolean }) {
  if (compact) {
    if (value == null || Math.abs(value) < 0.05) return null
    return <span className={`text-[10.5px] font-semibold tabular-nums ${value > 0 ? 'text-v-success' : 'text-v-warning'}`}>{value > 0 ? '+' : ''}{one(value)}</span>
  }
  if (value == null || Math.abs(value) < 0.05) return <span className="inline-flex w-12 items-center justify-end gap-0.5 text-[11px] text-v-subtle"><Minus size={11} />igual</span>
  const Icon = value > 0 ? ArrowUpRight : ArrowDownRight
  return <span className={`inline-flex w-12 items-center justify-end gap-0.5 text-[11px] font-semibold tabular-nums ${value > 0 ? 'text-v-success' : 'text-v-warning'}`}><Icon size={12} />{value > 0 ? '+' : ''}{one(value)}</span>
}

/** Texto de ARIA: párrafos, **negritas** y listas con guion. */
export function Insight({ text }: { text: string }) {
  const inline = (line: string) => line.split(/(\*\*[^*]+\*\*)/g).map((p, i) => p.startsWith('**') && p.endsWith('**') ? <strong key={i} className="font-semibold text-v-text">{p.slice(2, -2)}</strong> : p.replace(/\*+/g, ''))
  return (
    <div className="gap-10 text-[13.5px] leading-relaxed text-v-muted xl:columns-2 [&>p]:mb-2 [&>p]:break-inside-avoid">
      {text.split('\n').map(l => l.trim()).filter(Boolean).map((line, i) => {
        const bullet = line.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/)
        return bullet
          ? <p key={i} className="flex gap-2 pl-1"><span className="mt-[9px] size-1.5 shrink-0 rounded-full bg-v-accent" /><span>{inline(bullet[1])}</span></p>
          : <p key={i} className={/^\*\*.+\*\*/.test(line) ? 'pt-1.5' : ''}>{inline(line.replace(/^#+\s*/, ''))}</p>
      })}
    </div>
  )
}

/** Evaluación mensual de las clases de un docente, vista por dirección: agregados anónimos y lectura de ARIA. */
export async function TeacherFeedback({ db, institutionId, teacherId, groups, expected, basePath, selectedMonth }: {
  db: DB; institutionId: string; teacherId: string; basePath: string; selectedMonth?: string
  groups: { courseId: string; subjectId: string; label: string }[]
  expected: number   // respuestas posibles por mes (estudiantes × asignaturas a su cargo)
}) {
  const [{ data: summary }, { data: insights }, { data: commitments }] = await Promise.all([
    db.rpc('teacher_feedback_summary', { p_inst: institutionId, p_teacher: teacherId }),
    db.from('teacher_feedback_insights').select('period_month, content, created_at, shared_at').eq('institution_id', institutionId).eq('teacher_id', teacherId).order('period_month', { ascending: false }).limit(24),
    db.from('teaching_commitments').select('id, period_month, focus, action, status, reflection').eq('institution_id', institutionId).eq('teacher_id', teacherId).order('period_month', { ascending: false }).order('created_at', { ascending: false }).limit(12),
  ])
  const months = (summary ?? []) as FeedbackMonth[]
  const latest = months[0], previous = months[1]
  // Archivo de lecturas de ARIA: una por mes. Se muestra la del mes elegido o, por defecto, la más reciente.
  const archive = (insights ?? []) as { period_month: string; content: string; created_at: string; shared_at: string | null }[]
  const insight = archive.find(i => i.period_month === selectedMonth) ?? archive[0]
  const hasCurrent = !!latest && archive.some(i => i.period_month === latest.month)

  if (!latest) {
    return (
      <Card index={5} className="mt-4">
        <CardHeader icon={<Star size={15} />} title="Evaluación de sus estudiantes" description="Percepción mensual de los estudiantes sobre sus clases" />
        <EmptyState aria={3} title="Aún no hay resultados" description={`Se muestran cuando un mes reúne al menos ${MIN_RESPONSES} respuestas, para resguardar el anonimato de los estudiantes.`} />
      </Card>
    )
  }
  const sorted = [...FEEDBACK_DIMENSIONS].sort((a, b) => latest.dims[b.key] - latest.dims[a.key])
  const strongest = sorted[0], weakest = sorted[sorted.length - 1]
  // Cambio de cada dimensión entre el primer mes con datos y el más reciente.
  const oldest = months[months.length - 1]
  const changes = months.length > 1
    ? FEEDBACK_DIMENSIONS.map(d => ({ label: d.label, delta: latest.dims[d.key] - oldest.dims[d.key] })).filter(c => Math.abs(c.delta) >= 0.05).sort((a, b) => b.delta - a.delta)
    : []

  return (
    <div className="mt-4 space-y-4">
    <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
      <Card index={5}>
        <CardHeader icon={<Star size={15} />} title="Evaluación de sus estudiantes" description={`${monthLabel(latest.month)} · ${latest.responses} respuestas${expected ? ` de ${expected} posibles` : ''}`}
          actions={<Badge tone="accent"><ShieldCheck size={11} />Anónima</Badge>} />
        <CardBody>
          <div className="flex flex-wrap items-center gap-5 rounded-v-sm bg-v-fill p-4">
            <Ring value={(latest.score / 5) * 100} size={84} label={`Promedio ${one(latest.score)} de 5`} />
            <div className="min-w-0 flex-1">
              <p className="flex items-baseline gap-2"><span className="v-display text-4xl font-bold leading-none tabular-nums">{one(latest.score)}</span><span className="text-sm text-v-subtle">de 5</span>
                {previous && <Delta value={latest.score - previous.score} />}</p>
              <p className="mt-1.5 text-xs text-v-muted">Lo más valorado: <span className="font-semibold text-v-text">{strongest.label.toLowerCase()}</span> · Mayor espacio de mejora: <span className="font-semibold text-v-text">{weakest.label.toLowerCase()}</span></p>
            </div>
          </div>

          <ul className="mt-5 space-y-3.5">
            {FEEDBACK_DIMENSIONS.map((d, i) => (
              <li key={d.key}>
                <div className="mb-1.5 flex items-center justify-between gap-3 text-[13px]">
                  <span className="min-w-0"><span className="font-semibold">{d.label}</span><span className="ml-2 hidden text-xs text-v-subtle sm:inline">{d.question}</span></span>
                  <span className="flex shrink-0 items-center gap-2"><span className="v-display w-8 text-right font-bold tabular-nums">{one(latest.dims[d.key])}</span><Delta value={previous ? latest.dims[d.key] - previous.dims[d.key] : null} /></span>
                </div>
                <Bar value={(latest.dims[d.key] / 5) * 100} tone={tone(latest.dims[d.key])} delay={0.2 + i * 0.06} />
              </li>
            ))}
          </ul>

          {latest.groups.length > 0 && (
            <div className="mt-6 border-t border-v-border pt-5">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-v-subtle">Por curso y asignatura</p>
              <ul className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                {latest.groups.map(g => (
                  <li key={g.course_id + g.subject_id}>
                    <div className="mb-1 flex justify-between gap-2 text-xs"><span className="truncate font-medium">{groups.find(x => x.courseId === g.course_id && x.subjectId === g.subject_id)?.label ?? 'Curso'}</span>
                      <span className="shrink-0 tabular-nums text-v-muted"><span className="font-semibold text-v-text">{one(g.score)}</span> · {g.responses} resp.</span></div>
                    <Bar value={(g.score / 5) * 100} tone={tone(g.score)} />
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[11px] text-v-subtle">Solo se muestran los cursos con {MIN_RESPONSES} o más respuestas.</p>
            </div>
          )}
        </CardBody>
      </Card>

      <div className="flex min-w-0 flex-col gap-4">
        {months.length > 1 && (
          <Card index={6}>
            <CardHeader icon={<TrendingUp size={15} />} tone="success" title="Evolución mensual" description="Promedio general de cada mes" />
            <CardBody><BarChart height={150} data={[...months].reverse().slice(-6).map(m => ({ label: monthLabel(m.month).slice(0, 3), value: m.score, display: one(m.score) }))} /></CardBody>
          </Card>
        )}

        <Card index={7} className="flex flex-1 flex-col">
          <CardHeader icon={<MessageSquareQuote size={15} />} title="Comentarios de estudiantes" description="Anónimos y en orden aleatorio" />
          {latest.comments_locked ? (
            <CardBody><p className="flex items-start gap-2.5 rounded-v-sm bg-v-fill px-4 py-3 text-[13px] leading-relaxed text-v-muted"><Lock size={15} className="mt-0.5 shrink-0 text-v-subtle" />Los comentarios se muestran cuando el mes reúne {MIN_COMMENT_RESPONSES} o más respuestas. Con menos, la forma de escribir podría delatar a quien respondió.</p></CardBody>
          ) : latest.comments.length === 0 ? <CardBody><p className="text-[13.5px] text-v-muted">Sin comentarios este mes.</p></CardBody> : (
            <ul className="max-h-[26rem] flex-1 space-y-2 overflow-y-auto px-5 pb-5">
              {latest.comments.slice(0, 20).map((c, i) => <li key={i} className="rounded-v-sm bg-v-fill px-3.5 py-2.5 text-[13px] leading-relaxed text-v-text">«{c}»</li>)}
            </ul>
          )}
          <p className="mt-auto border-t border-v-border px-5 py-3 text-xs leading-relaxed text-v-subtle">
            Es la percepción de los estudiantes sobre la clase, no una medición del desempeño del docente. Sirve para conversar y ofrecer apoyo; no corresponde basar en ella sanciones ni decisiones contractuales.
          </p>
        </Card>
      </div>
    </div>

    {months.length > 1 && (
      <Card index={8}>
        <CardHeader icon={<History size={15} />} title="Historial mes a mes" description={`Desde ${monthLabel(oldest.month).toLowerCase()}. Cada cifra muestra su variación respecto del mes anterior.`} />
        {changes.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-5 pb-4">
            <span className="text-xs font-medium text-v-muted">En el periodo:</span>
            {changes.map(c => (
              <span key={c.label} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${c.delta > 0 ? 'bg-v-success/15 text-[#157a4b]' : 'bg-v-warning/15 text-[#a16207]'}`}>
                {c.delta > 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}{c.label} {c.delta > 0 ? '+' : ''}{one(c.delta)}
              </span>
            ))}
          </div>
        )}
        <Table>
          <thead><tr><Th>Mes</Th><Th className="!px-2">Resp.</Th><Th className="!px-2">Promedio</Th>{FEEDBACK_DIMENSIONS.map(d => <Th key={d.key} className="!px-2">{d.label.replace('Retroalimentación', 'Retroalim.')}</Th>)}<Th className="!px-2">ARIA</Th></tr></thead>
          <tbody>
            {months.map((m, i) => {
              const before = months[i + 1]
              const read = archive.find(a => a.period_month === m.month)
              return (
                <tr key={m.month} className={i === 0 ? 'bg-v-accent-soft/40' : 'hover:bg-v-fill/50'}>
                  <Td className="whitespace-nowrap font-semibold">{monthLabel(m.month)}{i === 0 && <span className="ml-2"><Badge tone="accent">Actual</Badge></span>}</Td>
                  <Td className="!px-2 text-v-muted">{m.responses}</Td>
                  <Td className="!px-2"><span className="flex items-baseline gap-1.5"><span className="v-display text-base font-bold">{one(m.score)}</span><Delta compact value={before ? m.score - before.score : null} /></span></Td>
                  {FEEDBACK_DIMENSIONS.map(d => (
                    <Td key={d.key} className="!px-2"><span className="flex items-baseline gap-1"><span className={`font-semibold ${m.dims[d.key] < 3.2 ? 'text-v-warning' : ''}`}>{one(m.dims[d.key])}</span><Delta compact value={before ? m.dims[d.key] - before.dims[d.key] : null} /></span></Td>
                  ))}
                  <Td className="!px-2 whitespace-nowrap">{read
                    ? <Link href={`${basePath}?mes=${m.month}#lectura-aria`} className="text-xs font-semibold text-v-accent hover:underline">Ver</Link>
                    : <span className="text-xs text-v-subtle">—</span>}</Td>
                </tr>
              )
            })}
          </tbody>
        </Table>
        <p className="border-t border-v-border px-5 py-3 text-xs text-v-subtle">Compara un mes con el anterior para ver si los apoyos acordados se reflejan en la percepción de los estudiantes. Variaciones pequeñas con pocas respuestas no son concluyentes.</p>
      </Card>
    )}

    <div id="lectura-aria" className="scroll-mt-4" />
    <Card index={6} className="relative">
      <div aria-hidden className="v-brand absolute inset-x-0 top-0 h-[3px]" />
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-3 pt-5">
        <div className="flex items-center gap-2.5">
          <span className="rounded-full ring-2 ring-v-accent-soft"><AriaAvatar size={34} /></span>
          <div><h2 className="text-[15px] font-semibold tracking-tight">Lectura de ARIA{insight && <span className="ml-2 font-normal text-v-muted">· {monthLabel(insight.period_month)}</span>}</h2><p className="text-xs text-v-subtle">Hipótesis y apoyos posibles, no una evaluación</p></div>
        </div>
        <ConfirmAction action={analyzeTeacherFeedback.bind(null, teacherId)} variant={hasCurrent ? 'secondary' : 'primary'} size="sm" title="Analizar con ARIA" confirmLabel="Analizar"
          message="ARIA leerá los promedios y comentarios anónimos del mes y propondrá hipótesis y formas de apoyo. No recibe el nombre del docente ni de ningún estudiante.">
          <Sparkles size={13} />{hasCurrent ? `Actualizar ${monthLabel(latest.month).split(' ')[0].toLowerCase()}` : `Analizar ${monthLabel(latest.month).split(' ')[0].toLowerCase()} con ARIA`}
        </ConfirmAction>
      </div>
      {archive.length > 1 && (
        <nav aria-label="Lecturas anteriores" className="flex items-center gap-1 overflow-x-auto px-5 pb-3">
          <span className="mr-1 shrink-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-v-subtle">Lecturas</span>
          {archive.map(a => (
            <Link key={a.period_month} href={`${basePath}?mes=${a.period_month}#lectura-aria`} scroll={false}
              className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${a.period_month === insight?.period_month ? 'v-brand shadow-v-brand' : 'text-v-muted hover:bg-v-fill hover:text-v-text'}`}>{monthLabel(a.period_month)}</Link>
          ))}
        </nav>
      )}
      <CardBody>
        {insight ? (
          <>
            <Insight text={insight.content as string} />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-v-border pt-3">
              <p className="min-w-0 flex-1 basis-64 text-[11px] text-v-subtle">Generado el {fmtDateTime(insight.created_at as string)} sobre {monthLabel(insight.period_month as string).toLowerCase()}. Es un apoyo para la conversación con el docente; la decisión es de la dirección.</p>
              {insight.shared_at
                ? <span className="flex items-center gap-2"><Badge tone="success"><Share2 size={11} />Compartida con el docente</Badge>
                    <ConfirmAction action={shareInsight.bind(null, teacherId, insight.period_month, false)} variant="ghost" size="sm" title="Dejar de compartir" confirmLabel="Dejar de compartir" message="El docente dejará de ver esta lectura en su panel.">Dejar de compartir</ConfirmAction></span>
                : <ConfirmAction action={shareInsight.bind(null, teacherId, insight.period_month, true)} variant="secondary" size="sm" title="Compartir con el docente" confirmLabel="Compartir"
                    message="El docente podrá leer esta lectura completa en «Evaluación de mis clases». Léela antes: debe servir para conversar y acordar apoyos."><Share2 size={13} />Compartir con el docente</ConfirmAction>}
            </div>
          </>
        ) : (
          <p className="text-[13.5px] leading-relaxed text-v-muted">
            {ariaConfigured()
              ? 'Pídele a ARIA una lectura de estos resultados: qué está funcionando, qué podría estar pasando en las dimensiones más bajas y cómo apoyar al docente.'
              : 'ARIA aún no está configurada en este entorno (falta la clave de Groq o de DeepInfra). Cuando lo esté, aquí aparecerá su lectura de estos resultados.'}
          </p>
        )}
      </CardBody>
    </Card>

    <Card index={7}>
      <CardHeader icon={<Handshake size={15} />} tone="success" title="Estrategias que el docente se propuso" description="Las registra el propio docente a partir de sus resultados. Dirección las acompaña; no las edita." />
      {(commitments ?? []).length === 0 ? (
        <CardBody><p className="text-[13.5px] leading-relaxed text-v-muted">Aún no ha registrado estrategias. Puede hacerlo en su panel, en «Evaluación de mis clases», donde ve sus resultados agregados.</p></CardBody>
      ) : (
        <ul className="grid gap-3 p-5 lg:grid-cols-2">
          {(commitments ?? []).map(c => (
            <li key={c.id as string} className="rounded-v-sm border border-v-border p-4">
              <p className="flex flex-wrap items-center gap-2 text-[11.5px] font-semibold text-v-muted">
                <Badge tone="accent">{COMMITMENT_FOCUS.find(f => f.key === c.focus)?.label ?? 'General'}</Badge>
                <Badge tone={COMMITMENT_STATUS[c.status as string]?.tone ?? 'neutral'}>{COMMITMENT_STATUS[c.status as string]?.label ?? 'Por empezar'}</Badge>
                <span>{monthLabel(c.period_month as string)}</span>
              </p>
              <p className="mt-2 whitespace-pre-wrap text-[13.5px] leading-relaxed text-v-text">{c.action as string}</p>
              {c.reflection && <p className="mt-2 rounded-v-sm bg-v-fill px-3 py-2 text-[12.5px] leading-relaxed text-v-muted"><span className="font-semibold text-v-text">Cómo le fue: </span>{c.reflection as string}</p>}
            </li>
          ))}
        </ul>
      )}
    </Card>
    </div>
  )
}
