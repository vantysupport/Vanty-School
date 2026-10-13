import { Check, Flag, Lightbulb, MessageSquareReply, MessageSquareWarning, ShieldAlert, Siren, type LucideIcon } from 'lucide-react'
import type { Session } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { fmtDate } from '@/lib/format'
import { Badge, Card, CardHeader, EmptyState, PageHeader, type Tone } from '@/components/ui/primitives'
import { ReportComposer } from '@/components/shared/report-composer'
import { EvidenceList, readEvidence } from '@/components/shared/evidence-list'

export const REPORT_KIND: Record<string, { label: string; tone: Tone }> = {
  reclamo: { label: 'Reclamo', tone: 'warning' },
  denuncia: { label: 'Denuncia', tone: 'danger' },
  sugerencia: { label: 'Sugerencia', tone: 'accent' },
}
export const REPORT_CATEGORY: Record<string, string> = {
  convivencia: 'Convivencia escolar', academico: 'Académico', trato: 'Trato del personal',
  infraestructura: 'Infraestructura y servicios', administrativo: 'Administrativo', otro: 'Otro',
}
export const REPORT_STATUS: Record<string, { label: string; tone: Tone }> = {
  received: { label: 'Recibido', tone: 'warning' },
  in_review: { label: 'En revisión', tone: 'accent' },
  resolved: { label: 'Resuelto', tone: 'success' },
  dismissed: { label: 'Cerrado sin acción', tone: 'neutral' },
}
const KIND_ICON: Record<string, LucideIcon> = { reclamo: MessageSquareWarning, denuncia: ShieldAlert, sugerencia: Lightbulb }
const KIND_TILE: Record<string, string> = { reclamo: 'bg-v-warning/15 text-[#b45309]', denuncia: 'bg-v-danger-soft text-[#c0343a]', sugerencia: 'bg-v-accent-soft text-v-accent' }
export const SEVERITY_TONE: Record<string, Tone> = { baja: 'neutral', media: 'accent', alta: 'warning', grave: 'danger' }

/** Canal para presentar reclamos, denuncias y sugerencias, y seguir los propios.
 *  Solo el equipo directivo los recibe; quien reporta ve el estado y las respuestas que le dirijan. */
export async function ReportsView({ session, students, onlyStudent }: { session: Session; students?: { id: string; name: string }[]; onlyStudent?: string }) {
  const db = await createClient()
  const { data: reports } = await db.from('reports').select('id, kind, category, subject, description, status, resolution, evidence, student_id, created_at')
    .eq('institution_id', session.institutionId).eq('reporter_id', session.userId).order('created_at', { ascending: false })
  const ids = (reports ?? []).map(r => r.id as string)
  const { data: notes } = ids.length
    ? await db.from('report_notes').select('report_id, body, created_at').in('report_id', ids).eq('visible_to_reporter', true).order('created_at')
    : { data: [] }

  // Con un estudiante elegido (apoderado): sus casos y los generales, que no nombran a ningún estudiante.
  const R = (reports ?? []).filter(r => !onlyStudent || !r.student_id || r.student_id === onlyStudent)
  const open = R.filter(r => r.status === 'received' || r.status === 'in_review').length
  const answered = new Set((notes ?? []).map(n => n.report_id as string))

  return (
    <>
      <PageHeader title="Reclamos y denuncias" description="Elige qué quieres contarle a la dirección del colegio. Solo el equipo directivo lo recibe." />

      <ReportComposer categories={Object.entries(REPORT_CATEGORY)} students={students} evidencePrefix={`${session.institutionId}/${session.userId}`} />

      <div className="mt-4 flex items-start gap-3 rounded-v-lg border border-v-warning/30 bg-v-warning/10 px-5 py-3.5">
        <Siren size={18} className="mt-0.5 shrink-0 text-[#b45309]" />
        <p className="text-[13px] leading-relaxed text-v-text"><span className="font-semibold">Si alguien está en riesgo, no uses este canal:</span> avisa de inmediato a un adulto responsable del colegio o llama al 133 (Carabineros) o al 131 (SAMU). Aquí no se responde al instante.</p>
      </div>

      <Card className="mt-4" index={2}>
        <CardHeader icon={<MessageSquareReply size={15} />} title="Mis casos" description="Cómo va cada uno y qué te ha respondido la dirección"
          actions={R.length > 0 && <Badge tone={open ? 'warning' : 'success'}>{open ? `${open} en curso` : 'Todos cerrados'}</Badge>} />
        {R.length === 0 ? <EmptyState aria={3} title="Aún no has presentado casos" description="Cuando envíes uno, aquí verás en qué va y la respuesta de la dirección." /> : (
          <ul className={`grid gap-4 p-5 ${R.length > 1 ? 'lg:grid-cols-2' : ''}`}>
            {R.map(r => {
              const kind = REPORT_KIND[r.kind as string], Icon = KIND_ICON[r.kind as string] ?? Flag
              const step = r.status === 'received' ? 0 : r.status === 'in_review' ? 1 : 2
              const mine = (notes ?? []).filter(n => n.report_id === r.id)
              return (
                <li key={r.id} className="flex flex-col rounded-v-lg border border-v-border bg-v-elevated p-5 shadow-v-xs">
                  <div className="flex items-start gap-3">
                    <span className={`grid size-11 shrink-0 place-items-center rounded-2xl ${KIND_TILE[r.kind as string] ?? KIND_TILE.reclamo}`}><Icon size={20} /></span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[15.5px] font-semibold leading-snug tracking-tight text-v-text">{r.subject}</p>
                      <p className="mt-0.5 text-[12.5px] text-v-muted">{kind.label} · {REPORT_CATEGORY[r.category as string]} · {fmtDate(r.created_at)}</p>
                    </div>
                    {!r.resolution && answered.has(r.id as string) && <Badge tone="accent">Con respuesta</Badge>}
                  </div>

                  <ol className="mt-4 flex items-center" aria-label={`Estado: ${REPORT_STATUS[r.status as string].label}`}>
                    {['Recibido', 'En revisión', r.status === 'dismissed' ? 'Cerrado' : 'Resuelto'].map((label, i) => (
                      <li key={label} className={`flex items-center ${i < 2 ? 'flex-1' : ''}`}>
                        <span className="flex items-center gap-1.5">
                          <span className={`grid size-6 place-items-center rounded-full text-[11px] font-bold ${i <= step ? (step === 2 && r.status === 'resolved' ? 'bg-v-success text-white' : 'v-brand') : 'bg-v-fill text-v-subtle'}`}>{i < step || step === 2 ? <Check size={13} /> : i + 1}</span>
                          <span className={`text-[12px] ${i === step ? 'font-semibold text-v-text' : 'text-v-subtle'}`}>{label}</span>
                        </span>
                        {i < 2 && <span className={`mx-2 h-0.5 flex-1 rounded-full ${i < step ? 'bg-v-accent' : 'bg-v-fill'}`} />}
                      </li>
                    ))}
                  </ol>

                  <p className="mt-4 line-clamp-3 whitespace-pre-wrap text-[13px] leading-relaxed text-v-muted">{r.description}</p>
                  {readEvidence(r.evidence).length > 0 && <div className="mt-3"><p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-v-subtle">Pruebas que adjuntaste</p><EvidenceList files={readEvidence(r.evidence)} /></div>}
                  {mine.map((n, i) => (
                    <div key={i} className="mt-3 rounded-v-sm bg-v-accent-soft px-3.5 py-2.5 text-[13px] text-v-text">
                      <p className="text-[11px] font-semibold text-v-accent">Respuesta de dirección · {fmtDate(n.created_at)}</p>
                      <p className="mt-0.5 whitespace-pre-wrap">{n.body}</p>
                    </div>
                  ))}
                  {r.resolution && (
                    <div className="mt-3 rounded-v-sm bg-v-success/15 px-3.5 py-2.5 text-[13px] text-v-text">
                      <p className="text-[11px] font-semibold text-[#157a4b]">{r.status === 'dismissed' ? 'Motivo del cierre' : 'Resolución'}</p>
                      <p className="mt-0.5 whitespace-pre-wrap">{r.resolution}</p>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </>
  )
}
