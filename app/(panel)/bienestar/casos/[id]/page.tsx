import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, CalendarClock, ClipboardCheck, ClipboardList, Eye, FileText, FolderOpen, GraduationCap, MessageSquare, History, Loader2, MessagesSquare, Pencil, Plus, Trash2, RefreshCw, Share2, Sparkles, UserCheck, Users, type LucideIcon } from 'lucide-react'
import { requireSession } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { audit } from '@/lib/audit'
import { nameMap } from '@/lib/data/people'
import { loadStudentAcademics } from '@/lib/data/student'
import { addIntervention, deleteCaseAnalysis, requestCaseAnalysis, updateCase, updateCaseAnalysis } from '@/lib/actions/wellbeing'
import { fmtDate, fmtDateTime, fmtPct, fmtScore, scoreTone, todayISO } from '@/lib/format'
import { CASE_STATUS, daysBetween, followUp, INTERVENTION_KIND } from '@/lib/wellbeing'
import { CATEGORY_LABEL } from '@/components/shared/wellbeing-request'
import { Avatar, Badge, Card, CardBody, CardHeader, EmptyState, Field, Input, LinkButton, Meter, Select, Textarea } from '@/components/ui/primitives'
import { ConfirmAction, FormDialog, InlineForm, SubmitButton } from '@/components/ui/dialog'
import { AriaAvatar } from '@/components/aria/aria-chat'
import { AnalysisView } from '@/components/wellbeing/analysis-view'
import { Reveal } from '@/components/ui/motion'

export const maxDuration = 60   // pedirle un análisis a ARIA puede tardar varios segundos

const KIND_ICON: Record<string, LucideIcon> = { entrevista: MessagesSquare, observacion: Eye, reunion_apoderado: Users, coordinacion_docente: GraduationCap, derivacion: Share2, seguimiento: RefreshCw }
const SOURCE: Record<string, string> = { estudiante: 'la pidió el propio estudiante', apoderado: 'la pidió su apoderado', docente: 'derivación de un docente', bienestar: 'la abrió el equipo' }
const FACT_TEXT: Record<string, string> = { danger: 'text-v-danger', warning: 'text-[#a16207]', accent: 'text-v-accent', neutral: 'text-v-text', success: 'text-v-text' }
const SCORE_TEXT: Record<string, string> = { success: 'text-v-success', warning: 'text-[#a16207]', danger: 'text-v-danger', neutral: 'text-v-text' }

export default async function CaseDetail({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession('bienestar')
  const { id } = await params
  const db = await createClient()
  const { data: c } = await db.from('wellbeing_cases').select('*, wellbeing_requests(id, category, source, description, created_at)')
    .eq('id', id).eq('institution_id', session.institutionId).maybeSingle()
  if (!c) notFound()
  await audit(db, session, { action: 'wellbeing.case.view', entity: 'wellbeing_case', entityId: id, sensitive: true })

  const [{ data: interventions }, { data: responses }, academics, { data: guardians }, { data: analyses }] = await Promise.all([
    db.from('wellbeing_interventions').select('id, kind, notes, occurred_on, next_follow_up_on, professional_id').eq('case_id', id).order('occurred_on', { ascending: false }).order('created_at', { ascending: false }),
    db.from('assessment_responses').select('id, computed_score, reviewed_at, created_at, assessment_templates(title)').eq('case_id', id).order('created_at', { ascending: false }),
    // RLS permite al equipo de bienestar leer notas y asistencia solo de estudiantes con solicitud o caso.
    loadStudentAcademics(db, session.institutionId, c.student_id),
    db.from('guardian_student_links').select('guardian_id, relationship').eq('student_id', c.student_id).eq('institution_id', session.institutionId),
    db.from('wellbeing_case_analyses').select('id, requested_by, focus, content, edited_by, edited_at, created_at').eq('case_id', id).order('created_at', { ascending: false }),
  ])
  const A = analyses ?? []
  const names = await nameMap(db, [c.student_id, c.responsible_id, ...(interventions ?? []).map(i => i.professional_id as string), ...(guardians ?? []).map(g => g.guardian_id as string), ...A.flatMap(a => [a.requested_by, a.edited_by] as string[])])
  const student = names.get(c.student_id) ?? 'Estudiante'
  const request = (c as unknown as { wellbeing_requests: { id: string; category: string; source: string; description: string; created_at: string } | null }).wellbeing_requests
  const list = interventions ?? []
  const R = (responses ?? []) as unknown as { id: string; computed_score: number | null; reviewed_at: string | null; created_at: string; assessment_templates: { title: string } }[]
  const today = todayISO()
  const closed = c.status === 'closed'
  const next = followUp(c.follow_up_on, today, closed)
  const daysOpen = daysBetween(c.created_at, today)

  const interventionForm = (
    <FormDialog trigger={<><Plus size={15} />Registrar intervención</>} title="Registrar intervención" description={`Caso de ${student}`} action={addIntervention.bind(null, id)} submitLabel="Registrar" wide>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Tipo"><Select name="kind" defaultValue="entrevista">{Object.entries(INTERVENTION_KIND).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
        <Field label="Fecha"><Input name="occurred_on" type="date" required defaultValue={today} max={today} /></Field>
        <Field label="Próximo seguimiento"><Input name="next_follow_up_on" type="date" min={today} /></Field>
      </div>
      <Field label="Registro" hint="Describe lo realizado, los acuerdos y las recomendaciones. Evita juicios diagnósticos.">
        <Textarea name="notes" required minLength={5} maxLength={6000} rows={6} />
      </Field>
    </FormDialog>
  )

  return (
    <>
      <Link href="/bienestar/casos" className="mb-3 inline-flex items-center gap-1 text-[12.5px] font-medium text-v-muted hover:text-v-accent"><ArrowLeft size={14} />Casos</Link>

      {/* Cabecera: quién, en qué va y las acciones del caso */}
      <Reveal className="mb-4 overflow-hidden rounded-v-lg border border-v-border bg-v-elevated shadow-v">
        <div className="flex flex-wrap items-center gap-4 p-5 sm:p-6">
          <Avatar name={student} id={c.student_id} size={68} />
          <div className="min-w-0 flex-1 basis-64">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="v-display text-[1.75rem] font-bold leading-tight tracking-tight">{student}</h1>
              <Badge tone={CASE_STATUS[c.status].tone}>{CASE_STATUS[c.status].label}</Badge>
            </div>
            <p className="mt-0.5 text-[14px] text-v-muted">{academics.course?.name ?? 'Sin curso'}{request ? ` · ${CATEGORY_LABEL[request.category]}` : ''} · caso de acompañamiento</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <LinkButton href="#aria"><Sparkles size={14} />Analizar con ARIA</LinkButton>
            <FormDialog trigger={<><Pencil size={14} />Actualizar caso</>} variant="secondary" title="Actualizar caso" action={updateCase.bind(null, id)} wide>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Estado"><Select name="status" defaultValue={c.status}>{Object.entries(CASE_STATUS).map(([v, s]) => <option key={v} value={v}>{s.label}</option>)}</Select></Field>
                <Field label="Próximo seguimiento"><Input name="follow_up_on" type="date" defaultValue={c.follow_up_on ?? ''} /></Field>
              </div>
              <Field label="Resumen del caso" hint="La situación y el foco del acompañamiento, sin diagnósticos."><Textarea name="summary" required rows={6} maxLength={4000} defaultValue={c.summary} /></Field>
            </FormDialog>
            {!closed && interventionForm}
          </div>
        </div>
        <dl className="grid grid-cols-2 divide-v-border border-t border-v-border bg-v-fill/40 lg:grid-cols-4 lg:divide-x">
          {[
            { icon: <UserCheck size={17} />, label: 'Responsable', value: names.get(c.responsible_id) ?? '—', hint: c.responsible_id === session.userId ? 'Está a tu cargo' : 'Equipo de bienestar', tone: 'neutral' },
            { icon: <FolderOpen size={17} />, label: 'Abierto', value: fmtDate(c.created_at), hint: `hace ${daysOpen} ${daysOpen === 1 ? 'día' : 'días'}`, tone: 'neutral' },
            { icon: <ClipboardList size={17} />, label: 'Intervenciones', value: String(list.length), hint: list[0] ? `Última: ${fmtDate(list[0].occurred_on)}` : 'Aún ninguna', tone: 'neutral' },
            { icon: <CalendarClock size={17} />, label: 'Próximo seguimiento', value: next.label, hint: !closed && c.follow_up_on ? fmtDate(c.follow_up_on) : closed ? 'Sin seguimiento' : 'Defínela en «Actualizar caso»', tone: next.tone },
          ].map(f => (
            <div key={f.label} className="flex items-center gap-3 px-5 py-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-[30%] bg-v-elevated text-v-accent shadow-v-xs">{f.icon}</span>
              <div className="min-w-0"><dt className="text-[11px] font-semibold uppercase tracking-[0.07em] text-v-subtle">{f.label}</dt>
                <dd className={`truncate text-[15px] font-semibold ${FACT_TEXT[f.tone]}`}>{f.value}</dd><dd className="truncate text-xs text-v-subtle">{f.hint}</dd></div>
            </div>
          ))}
        </dl>
      </Reveal>

      <div className="grid items-start gap-4 xl:grid-cols-[1.6fr_1fr]">
        <div className="space-y-4">
          <Card index={2}>
            <CardHeader icon={<FileText size={15} />} title="Resumen del caso" description="Situación y foco del acompañamiento" />
            <CardBody>
              <p className="whitespace-pre-wrap text-[14.5px] leading-relaxed text-v-text">{c.summary}</p>
              {request && (
                <div className="mt-5 rounded-v-sm border-l-[3px] border-v-accent bg-v-fill/60 px-4 py-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-v-subtle">Solicitud de origen · {fmtDate(request.created_at)} · {SOURCE[request.source] ?? request.source}</p>
                    <Link href={`/bienestar/solicitudes/${request.id}`} className="text-xs font-semibold text-v-accent hover:underline">Ver solicitud</Link>
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap text-[13.5px] leading-relaxed text-v-muted">{request.description}</p>
                </div>
              )}
            </CardBody>
          </Card>

          <Card index={4}>
            <CardHeader icon={<ClipboardList size={15} />} title="Bitácora de intervenciones" description={`${list.length} ${list.length === 1 ? 'registro' : 'registros'} · lo más reciente arriba`} />
            {list.length === 0 ? <EmptyState aria={6} title="Aún no hay intervenciones" description="Registra la primera entrevista, observación o reunión del acompañamiento." action={!closed ? interventionForm : undefined} /> : (
              <CardBody>
                <ol className="relative space-y-5 before:absolute before:bottom-3 before:left-[17px] before:top-3 before:w-px before:bg-v-border-strong">
                  {list.map(i => {
                    const Icon = KIND_ICON[i.kind as string] ?? ClipboardList
                    return (
                      <li key={i.id} className="relative flex gap-4">
                        <span className="v-brand relative z-10 grid size-9 shrink-0 place-items-center rounded-full ring-4 ring-v-elevated"><Icon size={16} /></span>
                        <div className="min-w-0 flex-1 rounded-v-sm border border-v-border bg-v-elevated px-4 py-3.5 shadow-v-xs">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-[14.5px] font-semibold tracking-tight">{INTERVENTION_KIND[i.kind as string]}</p>
                            <p className="text-xs text-v-muted"><span className="font-semibold text-v-text">{fmtDate(i.occurred_on)}</span> · {names.get(i.professional_id as string) ?? 'Profesional'}</p>
                          </div>
                          <p className="mt-2 whitespace-pre-wrap text-[13.5px] leading-relaxed text-v-muted">{i.notes}</p>
                          {i.next_follow_up_on && <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-v-accent-soft px-3 py-1 text-xs font-semibold text-v-accent"><CalendarClock size={13} />Se acordó seguimiento para el {fmtDate(i.next_follow_up_on)}</p>}
                        </div>
                      </li>
                    )
                  })}
                  <li className="relative flex gap-4">
                    <span className="relative z-10 grid size-9 shrink-0 place-items-center rounded-full bg-v-fill text-v-subtle ring-4 ring-v-elevated"><FolderOpen size={15} /></span>
                    <p className="pt-2 text-[13px] text-v-muted"><span className="font-semibold text-v-text">Caso abierto</span> · {fmtDate(c.created_at)}</p>
                  </li>
                </ol>
              </CardBody>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card index={4}>
            <CardHeader icon={<GraduationCap size={15} />} title="Antecedentes académicos" description="Lo que el equipo de bienestar está autorizado a ver" />
            <CardBody>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-v-sm bg-v-fill/60 p-3.5"><p className="text-xs text-v-muted">Asistencia</p><p className="v-display mt-1 text-[1.6rem] font-bold leading-none">{fmtPct(academics.attendanceRate)}</p>
                  <div className="mt-2.5"><Meter value={academics.attendanceRate ?? 0} tone={(academics.attendanceRate ?? 100) < 85 ? 'warning' : 'success'} /></div></div>
                <div className="rounded-v-sm bg-v-fill/60 p-3.5"><p className="text-xs text-v-muted">Promedio general</p><p className={`v-display mt-1 text-[1.6rem] font-bold leading-none ${SCORE_TEXT[scoreTone(academics.overall)]}`}>{fmtScore(academics.overall)}</p>
                  <p className="mt-2.5 text-xs text-v-subtle">Escala de 1,0 a 7,0</p></div>
              </div>
              {academics.subjects.length > 0 && (
                <ul className="mt-4 divide-y divide-v-border text-[13.5px]">
                  {academics.subjects.map(s => (
                    <li key={s.subjectId} className="flex items-center justify-between gap-3 py-2"><span className="truncate text-v-muted">{s.subjectName}</span><span className={`font-semibold tabular-nums ${SCORE_TEXT[scoreTone(s.average)]}`}>{fmtScore(s.average)}</span></li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card index={5}>
            <CardHeader icon={<Users size={15} />} title="Apoderados" actions={(guardians ?? []).length > 0 && <Link href="/bienestar/mensajes" className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-v-accent hover:underline"><MessageSquare size={13} />Escribir</Link>} />
            <CardBody>
              {(guardians ?? []).length === 0 ? <p className="text-[13.5px] text-v-muted">Sin apoderados vinculados.</p> : (
                <ul className="space-y-3">
                  {(guardians ?? []).map(g => {
                    const name = names.get(g.guardian_id as string) ?? 'Apoderado'
                    return <li key={g.guardian_id as string} className="flex items-center gap-3"><Avatar name={name} id={g.guardian_id as string} size={38} /><span className="min-w-0"><span className="block truncate text-[14px] font-semibold">{name}</span><span className="text-xs capitalize text-v-muted">{g.relationship}</span></span></li>
                  })}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card index={6}>
            <CardHeader icon={<ClipboardCheck size={15} />} title="Evaluaciones aplicadas" actions={<Link href={`/bienestar/evaluaciones?caso=${id}`} className="text-[12.5px] font-semibold text-v-accent hover:underline">Aplicar o revisar</Link>} />
            {R.length === 0 ? <CardBody><p className="text-[13.5px] text-v-muted">Aún no se ha aplicado ninguna a este caso.</p></CardBody> : (
              <ul className="divide-y divide-v-border">
                {R.map(r => (
                  <li key={r.id} className="flex items-center justify-between gap-2 px-5 py-3 text-[13.5px]">
                    <span className="min-w-0"><span className="block truncate font-medium">{r.assessment_templates.title}</span><span className="text-xs text-v-subtle">{fmtDate(r.created_at)}</span></span>
                    <Badge tone={r.reviewed_at ? 'success' : 'warning'}>{r.reviewed_at ? 'Revisada' : 'Por revisar'}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <p className="flex items-start gap-2.5 rounded-v-sm bg-v-accent-soft px-4 py-3 text-[12.5px] leading-relaxed text-v-text"><Sparkles size={15} className="mt-0.5 shrink-0 text-v-accent" />Los análisis de ARIA son un apoyo para ordenar antecedentes: no son un diagnóstico ni reemplazan tu criterio profesional.</p>
        </div>
      </div>

    {/* Análisis de ARIA: se piden aquí y quedan guardados en el caso */}
    <div id="aria" className="mt-4 scroll-mt-4">
      <Card index={3}>
        <CardHeader icon={<Sparkles size={15} />} title="Análisis de ARIA" description={A.length ? `${A.length} ${A.length === 1 ? 'análisis guardado' : 'análisis guardados'} en este caso` : 'Lecturas posibles, señales de alerta y vacíos de información; su respuesta queda guardada aquí'}
          actions={<Link href={`/bienestar/aria?s=${id}`} className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-v-accent hover:underline"><MessagesSquare size={13} />Conversar con ARIA</Link>} />
        <CardBody>
          {A.length > 0 && (
            <ol className="mb-5 space-y-3">
              {A.map((a, n) => {
                const body = (
                  <>
                    {a.focus && <p className="mb-3 rounded-v-sm bg-v-fill/70 px-3.5 py-2.5 text-[13px] text-v-muted"><span className="font-semibold text-v-text">Se le pidió:</span> {a.focus}</p>}
                    <AnalysisView text={a.content as string} />
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-v-border pt-3">
                      <p className="text-xs text-v-subtle">{a.edited_at ? `Corregido por ${names.get(a.edited_by as string) ?? 'el equipo'} el ${fmtDateTime(a.edited_at)}` : 'Texto de ARIA, sin cambios'}</p>
                      <div className="flex gap-1.5">
                        <FormDialog trigger={<><Pencil size={13} />Editar</>} size="sm" variant="secondary" title="Editar análisis" description="Corrige o complementa el texto. Quedará marcado como corregido por ti." action={updateCaseAnalysis.bind(null, a.id as string)} submitLabel="Guardar cambios" wide>
                          <Field label="Análisis"><Textarea name="content" required minLength={2} maxLength={12000} rows={16} defaultValue={a.content as string} /></Field>
                        </FormDialog>
                        <ConfirmAction action={deleteCaseAnalysis.bind(null, a.id as string)} variant="ghost" size="sm" danger title="Eliminar análisis" confirmLabel="Eliminar" message="Este análisis se quitará del caso de forma definitiva. Los demás análisis no cambian."><Trash2 size={13} />Eliminar</ConfirmAction>
                      </div>
                    </div>
                  </>
                )
                const head = (
                  <span className="flex min-w-0 flex-1 items-center gap-3">
                    <AriaAvatar size={34} />
                    <span className="min-w-0"><span className="block truncate text-[14.5px] font-semibold tracking-tight">{a.focus ? 'Análisis a pedido' : 'Análisis general del caso'}{n === 0 && <span className="ml-2 rounded-full bg-v-accent-soft px-2 py-px text-[10.5px] font-semibold text-v-accent">más reciente</span>}</span>
                      <span className="block truncate text-xs text-v-muted">{fmtDateTime(a.created_at)} · lo pidió {names.get(a.requested_by as string) ?? 'el equipo'}</span></span>
                  </span>
                )
                return (
                  <li key={a.id as string}>
                    <details open={n === 0} className="group rounded-v-sm border border-v-border bg-v-elevated shadow-v-xs open:border-v-accent/30">
                      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">{head}<span className="shrink-0 text-xs font-semibold text-v-accent group-open:hidden">Ver</span><span className="hidden shrink-0 text-xs font-semibold text-v-subtle group-open:inline">Ocultar</span></summary>
                      <div className="border-t border-v-border px-4 py-4">{body}</div>
                    </details>
                  </li>
                )
              })}
            </ol>
          )}

          <InlineForm action={requestCaseAnalysis.bind(null, id)} className="rounded-v-sm border border-v-border bg-v-fill/50 p-4">
            <p className="flex items-center gap-2 text-[14px] font-semibold">{A.length ? <><History size={15} className="text-v-accent" />Pedir otro análisis</> : <><Sparkles size={15} className="text-v-accent" />Pedir un análisis</>}</p>
            <p className="mb-2.5 mt-0.5 text-xs text-v-muted">{A.length ? 'Los anteriores se conservan en el historial.' : 'Si no escribes nada, ARIA hace un análisis general del caso.'}</p>
            <Textarea name="focus" rows={2} maxLength={1500} placeholder="Opcional: ¿en qué quieres que se enfoque? Ej.: un plan de seguimiento para las próximas dos semanas" aria-label="Enfoque del análisis" />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-v-subtle">ARIA recibe el caso sin nombres ni datos de contacto. No diagnostica ni indica qué hacer: ofrece lecturas posibles.</p>
              <span className="flex items-center gap-3">
                <span className="hidden items-center gap-1.5 text-xs font-semibold text-v-accent [form[aria-busy=true]_&]:inline-flex"><Loader2 size={14} className="animate-spin" />ARIA está analizando…</span>
                <SubmitButton><Sparkles size={15} />{A.length ? 'Pedir otro análisis' : 'Analizar con ARIA'}</SubmitButton>
              </span>
            </div>
          </InlineForm>
        </CardBody>
      </Card>
    </div>

    </>
  )
}
