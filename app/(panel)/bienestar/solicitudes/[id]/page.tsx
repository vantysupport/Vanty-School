import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Check, Clock, Eye, FileText, Lock, MessageSquarePlus, NotebookPen, FolderHeart, FolderPlus, Quote, Save, Siren, UserCheck } from 'lucide-react'
import { requireSession } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { audit } from '@/lib/audit'
import { nameMap } from '@/lib/data/people'
import { addRequestNote, openCase, setGuardianVisibility, updateRequest } from '@/lib/actions/wellbeing'
import { fmtDateTime } from '@/lib/format'
import { CATEGORY_LABEL, REQUEST_STATUS } from '@/components/shared/wellbeing-request'
import { Avatar, Badge, Card, CardBody, CardHeader, Field, Input, LinkButton, Textarea } from '@/components/ui/primitives'
import { ConfirmAction, FormDialog, InlineForm, SubmitButton } from '@/components/ui/dialog'
import { Reveal } from '@/components/ui/motion'

const SOURCE: Record<string, string> = { estudiante: 'Lo pidió el propio estudiante', apoderado: 'Lo pidió su apoderado', docente: 'Derivación de un docente', bienestar: 'La registró el equipo de bienestar' }
const PRIORITY_TONE = { baja: 'neutral', media: 'accent', alta: 'warning', urgente: 'danger' } as const
const STEPS = [['pending', 'Recibida'], ['in_review', 'En revisión'], ['in_follow_up', 'En acompañamiento'], ['closed', 'Cerrada']] as const
const CHOICE = 'block cursor-pointer rounded-full border border-v-border-strong px-3.5 py-2 text-center text-[12.5px] font-semibold text-v-muted transition-colors hover:border-v-accent peer-checked:border-transparent peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-v-accent'
const PRIORITIES = [['', 'Sin definir', 'peer-checked:bg-v-text'], ['baja', 'Baja', 'peer-checked:bg-v-muted'], ['media', 'Media', 'peer-checked:bg-v-accent'], ['alta', 'Alta', 'peer-checked:bg-v-warning'], ['urgente', 'Urgente', 'peer-checked:bg-v-danger']] as const

export default async function RequestDetail({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession('bienestar')
  const { id } = await params
  const db = await createClient()
  const { data: r } = await db.from('wellbeing_requests').select('*').eq('id', id).eq('institution_id', session.institutionId).maybeSingle()
  if (!r) notFound()
  // Todo acceso al contenido de una solicitud queda en la auditoría (sin el contenido).
  await audit(db, session, { action: 'wellbeing.request.view', entity: 'wellbeing_request', entityId: id, sensitive: true })

  const [{ data: kase }, { data: enrollment }, names] = await Promise.all([
    db.from('wellbeing_cases').select('id').eq('request_id', id).maybeSingle(),
    db.from('course_enrollments').select('courses(name)').eq('student_id', r.student_id).eq('status', 'active').maybeSingle(),
    nameMap(db, [r.student_id, r.requested_by, r.assigned_to, r.priority_set_by]),
  ])
  const student = names.get(r.student_id) ?? 'Estudiante'
  const { data: notes } = await db.from('wellbeing_request_notes').select('id, author_id, body, visible_to_requester, created_at').eq('request_id', id).order('created_at')
  const list = notes ?? []
  const authors = await nameMap(db, list.map(n => n.author_id as string))
  // A quién le llega una respuesta: a la persona que envió la solicitud, que no siempre es el estudiante.
  const requester = r.source === 'estudiante' ? student : names.get(r.requested_by) ?? 'quien solicitó'
  // El docente que deriva no tiene una pantalla donde leer respuestas, así que a él no se le ofrece esa opción.
  const canReply = r.source === 'estudiante' || r.source === 'apoderado'
  const requesterRole = ({ estudiante: 'estudiante', apoderado: 'apoderado', docente: 'docente' } as Record<string, string>)[r.source] ?? 'solicitante'
  const course = (enrollment as unknown as { courses?: { name: string } } | null)?.courses?.name ?? 'Sin curso'
  const step = STEPS.findIndex(([v]) => v === r.status)

  return (
    <>
      <Link href="/bienestar/solicitudes" className="mb-3 inline-flex items-center gap-1 text-[12.5px] font-medium text-v-muted hover:text-v-accent"><ArrowLeft size={14} />Solicitudes</Link>

      {/* Cabecera: quién, de dónde viene y en qué va */}
      <Reveal className="mb-4 rounded-v-lg border border-v-border bg-v-elevated p-5 shadow-v sm:p-6">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar name={student} id={r.student_id} size={64} />
          <div className="min-w-0 flex-1 basis-64">
            <h1 className="v-display text-[1.7rem] font-bold leading-tight tracking-tight">{student}</h1>
            <p className="mt-0.5 text-[14px] text-v-muted">{course} · {CATEGORY_LABEL[r.category]}</p>
            <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-v-muted">
              <span className="inline-flex items-center gap-1.5"><Clock size={14} className="text-v-subtle" />Recibida el {fmtDateTime(r.created_at)}</span>
              <span className="inline-flex items-center gap-1.5"><UserCheck size={14} className="text-v-subtle" />{r.assigned_to ? `Responsable: ${names.get(r.assigned_to) ?? '—'}` : <span className="font-semibold text-v-warning">Sin responsable</span>}</span>
            </p>
          </div>
          {kase ? <LinkButton href={`/bienestar/casos/${kase.id}`} variant="primary"><FolderHeart size={15} />Ir al caso</LinkButton> : (
            <FormDialog trigger={<><FolderPlus size={15} />Abrir caso de acompañamiento</>} title="Abrir caso de acompañamiento" action={openCase.bind(null, id)} submitLabel="Abrir caso"
              description={`Quedarás como responsable del caso de ${student}.`}>
              <Field label="Resumen inicial" hint="Describe la situación y el foco del acompañamiento, sin diagnósticos.">
                <Textarea name="summary" required minLength={5} maxLength={4000} rows={5} />
              </Field>
              <Field label="Primer seguimiento"><Input name="follow_up_on" type="date" /></Field>
            </FormDialog>
          )}
        </div>
        <ol className="mt-5 flex items-center border-t border-v-border pt-5" aria-label={`Estado: ${REQUEST_STATUS[r.status].label}`}>
          {STEPS.map(([v, label], i) => (
            <li key={v} className={`flex items-center ${i < STEPS.length - 1 ? 'flex-1' : ''}`}>
              <span className="flex items-center gap-2">
                <span className={`grid size-7 shrink-0 place-items-center rounded-full text-[12px] font-bold ${i <= step ? 'v-brand' : 'bg-v-fill text-v-subtle'}`}>{i < step ? <Check size={14} /> : i + 1}</span>
                <span className={`hidden text-[13px] sm:inline ${i === step ? 'font-semibold text-v-text' : 'text-v-subtle'}`}>{label}</span>
              </span>
              {i < STEPS.length - 1 && <span className={`mx-3 h-0.5 flex-1 rounded-full ${i < step ? 'bg-v-accent' : 'bg-v-fill'}`} />}
            </li>
          ))}
        </ol>
      </Reveal>

      <div className="grid items-stretch gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card index={2} className="flex flex-col">
          <CardHeader icon={<Quote size={15} />} title="Lo que se pidió" description={`${SOURCE[r.source] ?? r.source}${r.source !== 'estudiante' ? `: ${names.get(r.requested_by) ?? 'usuario'}` : ''}`}
            actions={r.priority ? <Badge tone={PRIORITY_TONE[r.priority as keyof typeof PRIORITY_TONE]}>Prioridad <span className="capitalize">{r.priority}</span></Badge> : <Badge tone="warning">Prioridad sin definir</Badge>} />
          <CardBody className="flex flex-1 flex-col">
            <blockquote className="flex-1 whitespace-pre-wrap rounded-v-sm border-l-[3px] border-v-accent bg-v-fill/60 px-5 py-4 text-[15px] leading-relaxed text-v-text">{r.description}</blockquote>
            {r.source === 'estudiante' && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-v-sm border border-v-border px-4 py-3">
                <p className="min-w-0 flex-1 basis-56 text-[12.5px] leading-relaxed text-v-muted">
                  {r.guardian_visible
                    ? <><span className="inline-flex items-center gap-1.5 font-semibold text-v-text"><Eye size={14} />El apoderado puede ver esta solicitud.</span> Ve el tema, el texto y en qué va; no tus respuestas ni tus notas.</>
                    : <><span className="inline-flex items-center gap-1.5 font-semibold text-v-text"><Lock size={14} />Reservada: el apoderado no la ve.</span> {r.category === 'familiar' ? 'Las solicitudes sobre la situación en casa nacen reservadas.' : 'La reservó el equipo de bienestar.'}</>}
                </p>
                {r.guardian_visible
                  ? <ConfirmAction action={setGuardianVisibility.bind(null, id, false)} variant="secondary" size="sm" title="Reservar solicitud" confirmLabel="Reservar" message="El apoderado dejará de ver esta solicitud. Úsalo cuando mostrarla pueda poner en riesgo al estudiante."><Lock size={13} />Reservar</ConfirmAction>
                  : <ConfirmAction action={setGuardianVisibility.bind(null, id, true)} variant="secondary" size="sm" title="Mostrar al apoderado" confirmLabel="Mostrar" message="El apoderado podrá ver el tema, el texto y el estado de esta solicitud. Confirma antes que no expone al estudiante."><Eye size={13} />Mostrar al apoderado</ConfirmAction>}
              </div>
            )}
            <p className="mt-4 flex items-start gap-2.5 rounded-v-sm bg-v-warning/10 px-4 py-3 text-[12.5px] leading-relaxed text-v-text">
              <Siren size={16} className="mt-0.5 shrink-0 text-[#b45309]" />
              <span><span className="font-semibold">Si describe una situación urgente o de riesgo,</span> activa el protocolo del colegio de inmediato; el registro en la plataforma viene después.</span>
            </p>
          </CardBody>
        </Card>

        <Card index={3} className="flex flex-col">
          <CardHeader icon={<UserCheck size={15} />} title="Revisión del equipo" description="Define en qué va y qué tan prioritaria es" />
          <CardBody className="flex-1">
            <InlineForm action={updateRequest.bind(null, id)} resetOnSuccess={false} className="flex h-full flex-col gap-5">
              <fieldset>
                <legend className="mb-2 text-[12.5px] font-medium text-v-text">Estado</legend>
                <div className="grid grid-cols-2 gap-2">
                  {STEPS.map(([v, label]) => (
                    <label key={v}><input type="radio" name="status" value={v} defaultChecked={r.status === v} className="peer sr-only" /><span className={`${CHOICE} peer-checked:bg-v-accent`}>{label}</span></label>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend className="mb-2 text-[12.5px] font-medium text-v-text">Prioridad</legend>
                <div className="flex flex-wrap gap-2">
                  {PRIORITIES.map(([v, label, on]) => (
                    <label key={v}><input type="radio" name="priority" value={v} defaultChecked={(r.priority ?? '') === v} className="peer sr-only" /><span className={`${CHOICE} ${on}`}>{label}</span></label>
                  ))}
                </div>
                <p className="mt-2 text-xs text-v-subtle">{r.priority_set_by ? `Definida por ${names.get(r.priority_set_by) ?? 'el equipo'}.` : 'La define una persona del equipo tras leer la solicitud.'}</p>
              </fieldset>
              {r.assigned_to === session.userId ? (
                <p className="flex items-center gap-2.5 rounded-v-sm bg-v-success/10 px-3.5 py-3 text-[13.5px] text-v-text"><UserCheck size={16} className="text-[#157a4b]" />Eres la persona responsable de esta solicitud.</p>
              ) : (
                <label className="flex items-center gap-2.5 rounded-v-sm bg-v-fill/60 px-3.5 py-3 text-[13.5px]">
                  <input type="checkbox" name="assign" defaultChecked={!r.assigned_to} className="size-4 accent-[var(--v-accent)]" />{r.assigned_to ? `Quedar yo como responsable (hoy es ${names.get(r.assigned_to) ?? 'otra persona'})` : 'Asignarme como responsable'}
                </label>
              )}
              <div className="mt-auto flex justify-end"><SubmitButton><Save size={15} />Guardar revisión</SubmitButton></div>
            </InlineForm>
          </CardBody>
        </Card>
      </div>

      {/* Notas del equipo y respuestas a quien pidió la ayuda */}
      <Card index={4} className="mt-4">
        <CardHeader icon={<NotebookPen size={15} />} title="Notas y respuestas" description={`${list.length} ${list.length === 1 ? 'registro' : 'registros'} · lo más antiguo arriba`} />
        <CardBody>
          <ol className="relative space-y-5 before:absolute before:bottom-2 before:left-[13px] before:top-2 before:w-px before:bg-v-border-strong">
            <li className="relative flex gap-4">
              <span className="relative z-10 grid size-7 shrink-0 place-items-center rounded-full bg-v-fill text-v-subtle ring-4 ring-v-elevated"><FileText size={13} /></span>
              <p className="pt-1 text-[13px] text-v-muted"><span className="font-semibold text-v-text">Solicitud recibida</span> · {fmtDateTime(r.created_at)}</p>
            </li>
            {list.map(n => (
              <li key={n.id} className="relative flex gap-4">
                <span className={`relative z-10 grid size-7 shrink-0 place-items-center rounded-full ring-4 ring-v-elevated ${n.visible_to_requester ? 'v-brand' : 'bg-v-fill text-v-muted'}`}>{n.visible_to_requester ? <Eye size={13} /> : <Lock size={13} />}</span>
                <div className={`min-w-0 flex-1 rounded-v-sm border px-4 py-3 ${n.visible_to_requester ? 'border-v-accent/25 bg-v-accent-soft' : 'border-v-border bg-v-fill/60'}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[13px]"><span className="font-semibold text-v-text">{authors.get(n.author_id as string) ?? 'Equipo de bienestar'}</span><span className="ml-2 text-xs text-v-subtle">{fmtDateTime(n.created_at)}</span></p>
                    <Badge tone={n.visible_to_requester ? 'accent' : 'neutral'}>{n.visible_to_requester ? `Respuesta a ${requester.split(' ')[0]}` : 'Nota interna'}</Badge>
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap text-[14px] leading-relaxed">{n.body}</p>
                </div>
              </li>
            ))}
          </ol>

          <InlineForm action={addRequestNote.bind(null, id)} className="mt-6 rounded-v-sm border border-v-border bg-v-fill/50 p-4">
            <p className="mb-2 text-[14px] font-semibold">Escribir</p>
            <Textarea name="body" required minLength={2} maxLength={4000} rows={3} placeholder="Lo que conversaste, lo que acordaron, el siguiente paso…" aria-label="Nueva nota" />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                <label><input type="radio" name="audience" value="interna" defaultChecked className="peer sr-only" /><span className={`${CHOICE} !flex items-center gap-1.5 peer-checked:bg-v-text`}><Lock size={13} />Nota interna · solo el equipo</span></label>
                {canReply && <label><input type="radio" name="audience" value="respuesta" className="peer sr-only" /><span className={`${CHOICE} !flex items-center gap-1.5 peer-checked:bg-v-accent`}><Eye size={13} />Responder a {requester.split(' ')[0]} ({requesterRole})</span></label>}
              </div>
              <SubmitButton><MessageSquarePlus size={15} />Guardar</SubmitButton>
            </div>
            <p className="mt-3 text-xs text-v-subtle">{canReply ? `Una respuesta la lee ${requester} en su panel.` : (r.source === 'bienestar' ? 'Este registro lo abrió el propio equipo: las notas quedan solo para el equipo.' : 'Esta solicitud es una derivación de un docente: las notas quedan solo para el equipo.')} Describe hechos y acuerdos; no escribas diagnósticos.</p>
          </InlineForm>
        </CardBody>
      </Card>
    </>
  )
}
