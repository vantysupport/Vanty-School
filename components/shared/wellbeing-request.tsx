import Link from 'next/link'
import { ArrowRight, Check, ClipboardList, HeartHandshake, Siren, UserRound } from 'lucide-react'
import type { Session } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { nameMap } from '@/lib/data/people'
import { firstName, fmtDate, fmtDateTime } from '@/lib/format'
import { Badge, Card, CardHeader, EmptyState, PageHeader } from '@/components/ui/primitives'
import { SupportComposer } from '@/components/shared/support-composer'

export const REQUEST_STATUS: Record<string, { label: string; tone: 'warning' | 'accent' | 'success' | 'neutral' }> = {
  pending: { label: 'Recibida', tone: 'warning' },
  in_review: { label: 'En revisión', tone: 'accent' },
  in_follow_up: { label: 'En acompañamiento', tone: 'success' },
  closed: { label: 'Cerrada', tone: 'neutral' },
}
export const CATEGORY_LABEL: Record<string, string> = {
  academico: 'Académico', convivencia: 'Convivencia escolar', emocional: 'Bienestar emocional', familiar: 'Situación familiar', otro: 'Otro',
}

/** Formulario para pedir apoyo al equipo de bienestar y seguimiento de las solicitudes propias.
 *  Quien solicita ve el estado y las respuestas que el equipo le dirige; las notas internas no llegan aquí (RLS las filtra). */
export async function WellbeingRequestView({ session, students, simple }: { session: Session; students?: { id: string; name: string }[]; simple?: boolean }) {
  const db = await createClient()
  const [{ data: requests }, { data: settings }] = await Promise.all([
    db.from('wellbeing_requests').select('id, student_id, category, description, status, created_at')
      .eq('institution_id', session.institutionId).eq('requested_by', session.userId).order('created_at', { ascending: false }),
    db.from('institution_settings').select('urgent_protocol').eq('institution_id', session.institutionId).maybeSingle(),
  ])
  const names = await nameMap(db, (requests ?? []).map(r => r.student_id as string))
  const ids = (requests ?? []).map(r => r.id as string)
  const { data: replies } = ids.length
    ? await db.from('wellbeing_request_notes').select('request_id, body, created_at').in('request_id', ids).eq('visible_to_requester', true).order('created_at')
    : { data: [] }
  const guardian = session.role === 'apoderado'
  // Cuestionarios que el equipo de bienestar le envió a este apoderado (RLS: solo los suyos).
  const { data: forms } = guardian
    ? await db.from('assessment_requests').select('id, title, student_id, status, created_at, answered_at').eq('institution_id', session.institutionId).eq('guardian_id', session.userId).neq('status', 'cancelled').order('created_at', { ascending: false })
    : { data: [] }
  const formNames = await nameMap(db, (forms ?? []).map(x => x.student_id as string))
  // Solicitudes que sus pupilos enviaron por su cuenta. RLS no entrega las reservadas (tema «situación en casa»
  // o las que el equipo de bienestar decidió reservar); las respuestas del equipo son solo para el estudiante.
  const { data: byPupil } = guardian
    ? await db.from('wellbeing_requests').select('id, student_id, category, description, status, created_at').eq('institution_id', session.institutionId).eq('source', 'estudiante').neq('requested_by', session.userId).order('created_at', { ascending: false })
    : { data: [] }
  const pupilNames = await nameMap(db, (byPupil ?? []).map(r => r.student_id as string))

  // El apoderado ve lo del estudiante elegido en la barra superior.
  const only = guardian && students?.length === 1 ? students[0].id : null
  const R = (requests ?? []).filter(r => !only || r.student_id === only)
  const F = (forms ?? []).filter(x => !only || x.student_id === only)
  const P = (byPupil ?? []).filter(r => !only || r.student_id === only)
  const pendingForms = F.filter(x => x.status === 'pending')
  const answeredForms = F.filter(x => x.status !== 'pending')
  const open = R.filter(r => r.status !== 'closed').length
  const steps = ['Recibida', 'En revisión', 'En acompañamiento', 'Cerrada']
  const STEP_OF: Record<string, number> = { pending: 0, in_review: 1, in_follow_up: 2, closed: 3 }

  // Estudiantes de cursos chicos: una sola idea por pantalla, letra grande y palabras de niño.
  if (simple) {
    const KID: Record<string, string> = { pending: 'Ya nos llegó', in_review: 'Lo estamos leyendo', in_follow_up: 'Te estamos ayudando', closed: 'Listo' }
    return (
      <div>
        <div className="relative overflow-hidden rounded-v-lg bg-[linear-gradient(135deg,#ec4899,#be185d)] p-7 text-white shadow-v">
          <span aria-hidden className="pointer-events-none absolute -right-10 -top-16 size-56 rounded-full bg-white/15" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/aria/pose-5.webp" alt="" className="v-float pointer-events-none absolute -bottom-2 right-4 hidden h-32 w-auto drop-shadow-[0_10px_18px_rgba(120,0,60,0.3)] sm:block" />
          <p className="v-display relative text-[2rem] font-bold leading-tight tracking-tight">Pedir ayuda</p>
          <p className="relative mt-1 max-w-md text-[17px] leading-snug text-white/95">Si algo te preocupa o te hace sentir mal, cuéntanos. Hay personas en tu colegio para ayudarte.</p>
        </div>

        <h2 className="v-display mb-3 mt-6 text-[1.45rem] font-bold tracking-tight text-v-text">¿Qué te pasa?</h2>
        <SupportComposer role="estudiante" simple />

        <p className="mt-4 flex items-start gap-3 rounded-v-lg border border-v-warning/30 bg-v-warning/10 px-5 py-4 text-[15.5px] leading-relaxed text-v-text">
          <Siren size={20} className="mt-0.5 shrink-0 text-[#b45309]" /><span><span className="font-bold">¿Necesitas ayuda ahora mismo?</span> No esperes: dile a tu profesor o a un adulto del colegio.</span>
        </p>

        {R.length > 0 && (
          <>
            <h2 className="v-display mb-3 mt-6 text-[1.45rem] font-bold tracking-tight text-v-text">Lo que nos has contado</h2>
            <ul className="grid gap-4 lg:grid-cols-2">
              {R.map(r => (
                <li key={r.id as string} className="rounded-v-lg border border-v-border bg-v-elevated p-5 shadow-v">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[14px] font-semibold text-v-muted">Lo escribiste el {fmtDate(r.created_at)}</p>
                    <span className="rounded-full bg-v-accent-soft px-3 py-1 text-[13px] font-bold text-v-accent">{KID[r.status as string] ?? 'Ya nos llegó'}</span>
                  </div>
                  <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-[16px] leading-relaxed text-v-text">{r.description}</p>
                  {(replies ?? []).filter(n => n.request_id === r.id).map((n, k) => (
                    <div key={k} className="mt-3 rounded-v-sm bg-v-accent-soft px-4 py-3">
                      <p className="text-[13px] font-bold text-v-accent">Te respondieron</p>
                      <p className="mt-0.5 whitespace-pre-wrap text-[16px] leading-relaxed text-v-text">{n.body}</p>
                    </div>
                  ))}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    )
  }

  return (
    <>
      <PageHeader title={guardian ? 'Acompañamiento' : 'Pedir apoyo'}
        description={guardian ? 'El equipo de bienestar del colegio está para orientarte. Elige el tema y cuéntanos.' : 'Si algo te preocupa o necesitas conversar, el equipo de bienestar está para acompañarte. Elige el tema y cuéntanos.'} />

      {/* Lo que el equipo espera de ti va primero */}
      {pendingForms.map(x => (
        <div key={x.id as string} className="v-brand mb-4 flex flex-wrap items-center gap-4 rounded-v-lg p-5 shadow-v-brand">
          <span className="grid size-12 shrink-0 place-items-center rounded-[30%] bg-white/20"><ClipboardList size={22} /></span>
          <div className="min-w-0 flex-1 basis-64">
            <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-white/85">El equipo de bienestar te envió un cuestionario</p>
            <p className="mt-0.5 text-[17px] font-semibold tracking-tight">{x.title}</p>
            <p className="mt-0.5 text-[13px] text-white/90">Sobre {firstName(formNames.get(x.student_id as string) ?? '') || 'tu pupilo'} · recibido el {fmtDate(x.created_at)} · toma unos minutos</p>
          </div>
          <Link href={`/apoderado/cuestionarios/${x.id}`} className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-6 text-[14px] font-semibold text-[#0b3b8f] shadow-v hover:bg-white/90">Responder ahora<ArrowRight size={15} /></Link>
        </div>
      ))}

      <h2 className="mb-3 text-[15.5px] font-semibold tracking-tight text-v-text">{guardian ? '¿En qué te podemos acompañar?' : '¿Sobre qué quieres conversar?'}</h2>
      <SupportComposer role={guardian ? 'apoderado' : 'estudiante'} students={students} />

      <div className="mt-4 flex items-start gap-3 rounded-v-lg border border-v-warning/30 bg-v-warning/10 px-5 py-3.5">
        <Siren size={18} className="mt-0.5 shrink-0 text-[#b45309]" />
        <p className="text-[13px] leading-relaxed text-v-text"><span className="font-semibold">Si es una urgencia, no esperes.</span> {settings?.urgent_protocol ?? 'Avisa de inmediato a un adulto de confianza del colegio o llama a los servicios de urgencia (131 SAMU, 133 Carabineros).'} Fono Salud Responde 600 360 7777.</p>
      </div>

      <Card className="mt-4" index={2}>
        <CardHeader icon={<HeartHandshake size={15} />} title="Mis solicitudes" description="En qué va cada una y qué te ha respondido el equipo"
          actions={R.length > 0 && <Badge tone={open ? 'accent' : 'neutral'}>{open ? `${open} en curso` : 'Todas cerradas'}</Badge>} />
        {R.length === 0 ? <EmptyState aria={5} title={only ? `Aún no has pedido apoyo para ${firstName(students![0].name)}` : 'Aún no has pedido apoyo'} description="Cuando envíes una solicitud, aquí verás en qué va y la respuesta del equipo." /> : (
          <ul className={`grid gap-4 p-5 ${R.length > 1 ? 'lg:grid-cols-2' : ''}`}>
            {R.map(r => {
              const step = STEP_OF[r.status as string] ?? 0
              const mine = (replies ?? []).filter(n => n.request_id === r.id)
              return (
                <li key={r.id as string} className="flex flex-col rounded-v-lg border border-v-border bg-v-elevated p-5 shadow-v-xs">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[15.5px] font-semibold tracking-tight text-v-text">{CATEGORY_LABEL[r.category as string]}{guardian && ` · ${firstName(names.get(r.student_id as string) ?? '')}`}</p>
                      <p className="mt-0.5 text-[12.5px] text-v-muted">Enviada el {fmtDate(r.created_at)}</p>
                    </div>
                    {mine.length > 0 && <Badge tone="accent">Con respuesta</Badge>}
                  </div>
                  <ol className="mt-4 flex items-center" aria-label={`Estado: ${REQUEST_STATUS[r.status as string].label}`}>
                    {steps.map((label, n) => (
                      <li key={label} className={`flex items-center ${n < steps.length - 1 ? 'flex-1' : ''}`}>
                        <span className="flex items-center gap-1.5">
                          <span className={`grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold ${n <= step ? 'v-brand' : 'bg-v-fill text-v-subtle'}`}>{n < step ? <Check size={13} /> : n + 1}</span>
                          <span className={`hidden text-[12px] sm:inline ${n === step ? 'font-semibold text-v-text' : 'text-v-subtle'}`}>{label}</span>
                        </span>
                        {n < steps.length - 1 && <span className={`mx-2 h-0.5 flex-1 rounded-full ${n < step ? 'bg-v-accent' : 'bg-v-fill'}`} />}
                      </li>
                    ))}
                  </ol>
                  <p className="mt-4 line-clamp-3 whitespace-pre-wrap text-[13px] leading-relaxed text-v-muted">{r.description}</p>
                  {mine.map((n, k) => (
                    <div key={k} className="mt-3 rounded-v-sm bg-v-accent-soft px-3.5 py-2.5 text-[13px] text-v-text">
                      <p className="text-[11px] font-semibold text-v-accent">Respuesta del equipo de bienestar · {fmtDateTime(n.created_at)}</p>
                      <p className="mt-0.5 whitespace-pre-wrap leading-relaxed">{n.body}</p>
                    </div>
                  ))}
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      {P.length > 0 && (
        <Card className="mt-4" index={3}>
          <CardHeader icon={<UserRound size={15} />} title={only ? `Lo que ${firstName(students![0].name)} pidió por su cuenta` : 'Lo que tus pupilos pidieron por su cuenta'}
            description="Solicitudes que enviaron ellos mismos al equipo de bienestar. Conversa con calma: pedir ayuda es una buena señal." />
          <ul className={`grid gap-4 p-5 ${P.length > 1 ? 'lg:grid-cols-2' : ''}`}>
            {P.map(r => (
              <li key={r.id as string} className="rounded-v-lg border border-v-border bg-v-elevated p-5 shadow-v-xs">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[15.5px] font-semibold tracking-tight text-v-text">{CATEGORY_LABEL[r.category as string]} · {firstName(pupilNames.get(r.student_id as string) ?? '')}</p>
                    <p className="mt-0.5 text-[12.5px] text-v-muted">Enviada el {fmtDate(r.created_at)}</p>
                  </div>
                  <Badge tone={REQUEST_STATUS[r.status as string]?.tone ?? 'neutral'}>{REQUEST_STATUS[r.status as string]?.label ?? 'Recibida'}</Badge>
                </div>
                <p className="mt-3 line-clamp-4 whitespace-pre-wrap text-[13px] leading-relaxed text-v-muted">{r.description}</p>
                <p className="mt-3 text-[12px] text-v-subtle">Las respuestas del equipo de bienestar le llegan directamente a {firstName(pupilNames.get(r.student_id as string) ?? '') || 'tu pupilo'}.</p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {answeredForms.length > 0 && (
        <Card className="mt-4" index={3}>
          <CardHeader icon={<ClipboardList size={15} />} title="Cuestionarios respondidos" description="Tus respuestas las lee solo el equipo de bienestar" />
          <ul className="divide-y divide-v-border">
            {answeredForms.map(x => (
              <li key={x.id as string} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
                <span className="grid size-10 shrink-0 place-items-center rounded-[30%] bg-v-success/15 text-[#157a4b]"><Check size={18} /></span>
                <div className="min-w-0 flex-1 basis-56"><p className="truncate text-[14.5px] font-semibold tracking-tight">{x.title}</p>
                  <p className="text-[12.5px] text-v-muted">Sobre {firstName(formNames.get(x.student_id as string) ?? '') || 'tu pupilo'} · respondido el {fmtDate(x.answered_at)}</p></div>
                <Link href={`/apoderado/cuestionarios/${x.id}`} className="text-[12.5px] font-semibold text-v-accent hover:underline">Ver preguntas</Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  )
}
