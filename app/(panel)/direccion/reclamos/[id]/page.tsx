import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, CalendarClock, Check, ClipboardList, Eye, FileText, Lock, MapPin, MessageSquarePlus, Scale, ShieldAlert, UserCheck, UserRound } from 'lucide-react'
import { requireSession } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { audit } from '@/lib/audit'
import { nameMap } from '@/lib/data/people'
import { addReportNote, updateReport } from '@/lib/actions/reports'
import { fmtDate, fmtDateTime } from '@/lib/format'
import { ROLE_LABEL, type Role } from '@/lib/roles'
import { REPORT_CATEGORY, REPORT_KIND, REPORT_STATUS, SEVERITY_TONE } from '@/components/shared/reports'
import { Avatar, Badge, Card, CardBody, CardHeader, Textarea } from '@/components/ui/primitives'
import { InlineForm, SubmitButton } from '@/components/ui/dialog'
import { Reveal } from '@/components/ui/motion'
import { EvidenceList, readEvidence } from '@/components/shared/evidence-list'

const STEPS = [['received', 'Recibido'], ['in_review', 'En revisión'], ['resolved', 'Resuelto']] as const
const SEVERITIES = [['', 'Sin evaluar', 'peer-checked:bg-v-text peer-checked:text-white'], ['baja', 'Baja', 'peer-checked:bg-v-muted peer-checked:text-white'], ['media', 'Media', 'peer-checked:bg-v-accent peer-checked:text-white'],
  ['alta', 'Alta', 'peer-checked:bg-v-warning peer-checked:text-white'], ['grave', 'Grave', 'peer-checked:bg-v-danger peer-checked:text-white']] as const
const LABEL = 'mb-2 block text-[11px] font-semibold uppercase tracking-[0.1em] text-v-subtle'
const CHOICE = 'block cursor-pointer rounded-full border border-v-border-strong px-3.5 py-1.5 text-center text-xs font-semibold text-v-muted transition-colors hover:border-v-accent peer-checked:border-transparent peer-focus-visible:ring-2 peer-focus-visible:ring-v-accent'

export default async function ReportDetail({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession('directivo')
  const { id } = await params
  const db = await createClient()
  const { data: r } = await db.from('reports').select('*').eq('id', id).eq('institution_id', session.institutionId).maybeSingle()
  if (!r) notFound()
  await audit(db, session, { action: 'report.view', entity: 'report', entityId: id, sensitive: true })

  const [{ data: notes }, { data: membership }, { data: enrollment }] = await Promise.all([
    db.from('report_notes').select('id, author_id, body, visible_to_reporter, created_at').eq('report_id', id).order('created_at'),
    db.from('institution_memberships').select('role').eq('institution_id', session.institutionId).eq('user_id', r.reporter_id).maybeSingle(),
    r.student_id ? db.from('course_enrollments').select('courses(name)').eq('student_id', r.student_id).eq('status', 'active').maybeSingle() : Promise.resolve({ data: null }),
  ])
  const names = await nameMap(db, [r.reporter_id, r.assigned_to, r.student_id, ...(notes ?? []).map(n => n.author_id as string)])
  const reporter = names.get(r.reporter_id) ?? 'Usuario'
  const assignee = r.assigned_to ? names.get(r.assigned_to) ?? 'Equipo directivo' : null
  const closed = r.status === 'resolved' || r.status === 'dismissed'
  const days = Math.floor(((closed && r.resolved_at ? new Date(r.resolved_at).getTime() : Date.now()) - new Date(r.created_at).getTime()) / 86_400_000)
  const stepIndex = r.status === 'received' ? 0 : r.status === 'in_review' ? 1 : 2
  const list = notes ?? []

  return (
    <>
      <Link href="/direccion/reclamos" className="mb-3 inline-flex items-center gap-1 text-[12.5px] font-medium text-v-muted hover:text-v-accent"><ArrowLeft size={14} />Volver a la bandeja</Link>

      {/* Cabecera: qué es, en qué etapa va y quién lo lleva */}
      <Reveal className="relative mb-4 overflow-hidden rounded-v border border-v-border bg-v-elevated shadow-v">
        <span aria-hidden className={`absolute inset-y-0 left-0 w-1.5 ${r.kind === 'denuncia' ? 'bg-v-danger' : r.kind === 'reclamo' ? 'bg-v-warning' : 'bg-v-accent'}`} />
        <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-5 p-5 pl-7 sm:p-6 sm:pl-8">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone={REPORT_KIND[r.kind].tone}>{REPORT_KIND[r.kind].label}</Badge>
              <Badge>{REPORT_CATEGORY[r.category]}</Badge>
              {r.severity ? <Badge tone={SEVERITY_TONE[r.severity]}>Gravedad <span className="capitalize">{r.severity}</span></Badge> : <Badge>Gravedad sin evaluar</Badge>}
            </div>
            <h1 className="v-headline mt-2.5 text-[1.5rem] leading-tight sm:text-[1.7rem]">{r.subject}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px] text-v-muted">
              <span className="inline-flex items-center gap-1.5"><CalendarClock size={14} className="text-v-subtle" />Recibido el {fmtDateTime(r.created_at)}</span>
              <span className="inline-flex items-center gap-1.5"><UserCheck size={14} className="text-v-subtle" />{assignee ? <>Responsable: <span className="font-semibold text-v-text">{assignee}</span></> : <span className="font-semibold text-v-warning">Sin responsable asignado</span>}</span>
              <span className={!closed && days >= 5 ? 'font-semibold text-v-danger' : ''}>{closed ? `Cerrado en ${days} ${days === 1 ? 'día' : 'días'}` : days === 0 ? 'Abierto desde hoy' : `Abierto hace ${days} ${days === 1 ? 'día' : 'días'}`}</span>
            </div>
          </div>

          {r.status === 'dismissed' ? <Badge>Cerrado sin acción</Badge> : (
            <ol className="flex shrink-0 items-center" aria-label={`Etapa: ${REPORT_STATUS[r.status].label}`}>
              {STEPS.map(([key, label], i) => (
                <li key={key} className="flex items-center">
                  {i > 0 && <span className={`mx-2 h-0.5 w-8 rounded-full sm:w-12 ${i <= stepIndex ? 'v-brand' : 'bg-v-border-strong'}`} />}
                  <span className="flex flex-col items-center gap-1.5">
                    <span className={`v-display grid size-9 place-items-center rounded-full text-[13px] font-bold ${i < stepIndex || (i === 2 && stepIndex === 2) ? 'bg-v-success text-white' : i === stepIndex ? 'v-brand shadow-v-brand' : 'bg-v-fill text-v-subtle'}`}>
                      {i < stepIndex || (i === 2 && stepIndex === 2) ? <Check size={16} /> : i + 1}
                    </span>
                    <span className={`text-[11px] font-semibold ${i === stepIndex ? 'text-v-text' : 'text-v-subtle'}`}>{label}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </Reveal>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[1.6fr_1fr]">
        <div className="space-y-4">
          <Card index={2}>
            <CardHeader icon={<FileText size={15} />} title="Qué ocurrió" description="Relato tal como lo escribió quien presentó el caso" />
            <CardBody>
              <div className="flex items-center gap-3">
                <Avatar name={reporter} size={42} id={r.reporter_id} />
                <div className="min-w-0 flex-1">
                  <p className="text-[14.5px] font-semibold">{reporter}</p>
                  <p className="text-xs text-v-muted">{ROLE_LABEL[(membership?.role as Role) ?? 'apoderado']}</p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-v-fill px-3 py-1 text-[11px] font-semibold text-v-muted"><Lock size={12} />Identidad reservada</span>
              </div>
              <blockquote className="mt-4 whitespace-pre-wrap rounded-v-sm border-l-[3px] border-v-accent bg-v-fill px-4 py-3.5 text-[14.5px] leading-relaxed text-v-text">{r.description}</blockquote>
              {readEvidence(r.evidence).length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-v-subtle">Pruebas adjuntas · {readEvidence(r.evidence).length}</p>
                  <EvidenceList files={readEvidence(r.evidence)} />
                </div>
              )}
              <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="flex items-start gap-3 rounded-v-sm border border-v-border p-3.5">
                  <span className="grid size-8 shrink-0 place-items-center rounded-[30%] bg-v-accent-soft text-v-accent"><MapPin size={15} /></span>
                  <div className="min-w-0"><dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-v-subtle">Personas o lugar</dt><dd className="mt-0.5 text-[13.5px]">{r.involved || 'No indicado'}</dd></div>
                </div>
                <div className="flex items-start gap-3 rounded-v-sm border border-v-border p-3.5">
                  <span className="grid size-8 shrink-0 place-items-center rounded-[30%] bg-v-accent-soft text-v-accent"><UserRound size={15} /></span>
                  <div className="min-w-0"><dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-v-subtle">Estudiante afectado</dt>
                    <dd className="mt-0.5 text-[13.5px]">{r.student_id
                      ? <Link href={`/direccion/estudiantes/${r.student_id}`} className="font-semibold text-v-accent hover:underline">{names.get(r.student_id) ?? 'Estudiante'} · {(enrollment as unknown as { courses?: { name: string } } | null)?.courses?.name ?? 'sin curso'}</Link>
                      : 'No indicado'}</dd></div>
                </div>
              </dl>
            </CardBody>
          </Card>

          <Card index={3}>
            <CardHeader icon={<ClipboardList size={15} />} title="Bitácora de gestión" description={`${list.length} ${list.length === 1 ? 'registro' : 'registros'} · lo más antiguo arriba`} />
            <CardBody>
              <ol className="relative space-y-5 before:absolute before:bottom-2 before:left-[13px] before:top-2 before:w-px before:bg-v-border-strong">
                <li className="relative flex gap-4">
                  <span className="relative z-10 grid size-7 shrink-0 place-items-center rounded-full bg-v-fill text-v-subtle ring-4 ring-v-elevated"><FileText size={13} /></span>
                  <p className="pt-1 text-[13px] text-v-muted"><span className="font-semibold text-v-text">Caso recibido</span> · {fmtDateTime(r.created_at)}</p>
                </li>
                {list.map(n => (
                  <li key={n.id} className="relative flex gap-4">
                    <span className={`relative z-10 grid size-7 shrink-0 place-items-center rounded-full ring-4 ring-v-elevated ${n.visible_to_reporter ? 'v-brand' : 'bg-v-fill text-v-muted'}`}>{n.visible_to_reporter ? <Eye size={13} /> : <Lock size={13} />}</span>
                    <div className={`min-w-0 flex-1 rounded-v-sm border px-4 py-3 ${n.visible_to_reporter ? 'border-v-accent/25 bg-v-accent-soft' : 'border-v-border bg-v-fill/60'}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[13px]"><span className="font-semibold text-v-text">{names.get(n.author_id as string) ?? 'Dirección'}</span><span className="ml-2 text-xs text-v-subtle">{fmtDateTime(n.created_at)}</span></p>
                        <Badge tone={n.visible_to_reporter ? 'accent' : 'neutral'}>{n.visible_to_reporter ? `Respuesta enviada a ${reporter.split(' ')[0]}` : 'Nota interna'}</Badge>
                      </div>
                      <p className="mt-1.5 whitespace-pre-wrap text-[13.5px] leading-relaxed">{n.body}</p>
                    </div>
                  </li>
                ))}
                {closed && r.resolution && (
                  <li className="relative flex gap-4">
                    <span className="relative z-10 grid size-7 shrink-0 place-items-center rounded-full bg-v-success text-white ring-4 ring-v-elevated"><Check size={14} /></span>
                    <div className="min-w-0 flex-1 rounded-v-sm border border-v-success/30 bg-v-success/10 px-4 py-3">
                      <p className="text-[13px]"><span className="font-semibold text-v-text">{REPORT_STATUS[r.status].label}</span><span className="ml-2 text-xs text-v-subtle">{fmtDate(r.resolved_at)}</span></p>
                      <p className="mt-1.5 whitespace-pre-wrap text-[13.5px] leading-relaxed">{r.resolution}</p>
                    </div>
                  </li>
                )}
              </ol>

              <InlineForm action={addReportNote.bind(null, id)} className="mt-6 rounded-v-sm border border-v-border bg-v-fill/50 p-4">
                <p className="mb-2 text-[13.5px] font-semibold">Registrar una gestión</p>
                <Textarea name="body" required minLength={2} maxLength={4000} rows={3} placeholder="Entrevista realizada, medida adoptada, acuerdo alcanzado…" aria-label="Nueva gestión" />
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-v-muted">
                    <input type="checkbox" name="visible" className="size-4 accent-[var(--v-accent)]" />
                    <span>Enviar también como respuesta a <span className="font-semibold text-v-text">{reporter.split(' ')[0]}</span> <span className="text-v-subtle">(si no, queda como nota interna)</span></span>
                  </label>
                  <SubmitButton><MessageSquarePlus size={14} />Registrar</SubmitButton>
                </div>
              </InlineForm>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-4 xl:sticky xl:top-4">
          <Card index={4}>
            <CardHeader icon={<Scale size={15} />} title="Decisiones del caso" description="Etapa, gravedad y cierre" />
            <CardBody>
              <InlineForm action={updateReport.bind(null, id)} resetOnSuccess={false}>
                <div className="space-y-6">
                  <fieldset>
                    <legend className={LABEL}>Etapa</legend>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(REPORT_STATUS).map(([v, s]) => (
                        <label key={v}><input type="radio" name="status" value={v} defaultChecked={r.status === v} className="peer sr-only" />
                          <span className={`${CHOICE} peer-checked:bg-v-accent peer-checked:text-white`}>{s.label}</span></label>
                      ))}
                    </div>
                  </fieldset>

                  <fieldset>
                    <legend className={LABEL}>Gravedad</legend>
                    <div className="flex flex-wrap gap-2">
                      {SEVERITIES.map(([v, l, on]) => (
                        <label key={v}><input type="radio" name="severity" value={v} defaultChecked={(r.severity ?? '') === v} className="peer sr-only" />
                          <span className={`${CHOICE} ${on}`}>{l}</span></label>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-v-subtle">La define el equipo directivo después de leer el caso.</p>
                  </fieldset>

                  <div>
                    <p className={LABEL}>Responsable</p>
                    <label className="flex cursor-pointer items-center gap-3 rounded-v-sm border border-v-border p-3 text-[13px]">
                      <input type="checkbox" name="assign" defaultChecked={!r.assigned_to} className="size-4 accent-[var(--v-accent)]" />
                      <span className="min-w-0"><span className="block font-semibold">{assignee ? `A cargo de ${assignee}` : 'Nadie lo ha tomado todavía'}</span>
                        <span className="block text-xs text-v-muted">{r.assigned_to === session.userId ? 'Ya eres responsable de este caso.' : 'Marca para hacerte responsable.'}</span></span>
                    </label>
                  </div>

                  <div>
                    <label htmlFor="resolution" className={LABEL}>Resolución</label>
                    <Textarea id="resolution" name="resolution" rows={4} maxLength={6000} defaultValue={r.resolution ?? ''} placeholder="Qué se resolvió o por qué se cierra el caso." />
                    <p className="mt-2 text-xs text-v-subtle">Obligatoria para marcar «Resuelto» o «Cerrado sin acción». Quien presentó el caso podrá leerla.</p>
                  </div>

                  <div className="flex justify-end"><SubmitButton>Guardar decisiones</SubmitButton></div>
                </div>
              </InlineForm>
            </CardBody>
          </Card>

          {r.kind === 'denuncia' && (
            <Card index={5}>
              <CardHeader icon={<ShieldAlert size={15} />} tone="danger" title="Por ser una denuncia" />
              <CardBody>
                <ul className="space-y-2.5 text-[13px] leading-relaxed text-v-muted">
                  <li className="flex gap-2.5"><span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-v-danger" />Activa el protocolo de convivencia que corresponda y registra aquí cada actuación.</li>
                  <li className="flex gap-2.5"><span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-v-danger" />Si el relato describe un posible delito o vulneración de derechos, corresponde denunciar a las autoridades dentro del plazo legal.</li>
                </ul>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </>
  )
}
