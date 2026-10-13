import Link from 'next/link'
import { Archive, BadgeCheck, Calculator, CheckCircle2, ClipboardCheck, ClipboardList, ClipboardPlus, Eye, Clock, History, Home, Hourglass, LayoutGrid, ListChecks, Loader2, Plus, Send, ShieldCheck, Sparkles, Users, X } from 'lucide-react'
import { requireSession } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { nameMap } from '@/lib/data/people'
import { adoptStarterTemplate, cancelGuardianRequest, createTemplate, requestResponseReading, reviewResponse, sendToGuardian, setTemplateStatus } from '@/lib/actions/wellbeing'
import { STARTER_TEMPLATES } from '@/lib/wellbeing-templates'
import { fmtDate } from '@/lib/format'
import { Avatar, Badge, Card, EmptyState, Field, Input, PageHeader, Textarea } from '@/components/ui/primitives'
import { SearchBox } from '@/components/ui/filters'
import { ConfirmAction, FormDialog, InlineForm, SubmitButton } from '@/components/ui/dialog'
import { Kpi, Reveal, Row } from '@/components/ui/motion'
import { TemplateBuilder } from '@/components/wellbeing/template-builder'
import { SendFields, type SendTarget } from '@/components/wellbeing/send-fields'
import { AnalysisView } from '@/components/wellbeing/analysis-view'
import { fetchAll } from '@/lib/supabase/fetch-all'

type Search = { tab?: string; caso?: string; f?: string; e?: string; q?: string }
type Question = { id: string; text: string; type: 'scale' | 'text'; min?: number; max?: number }
type Template = { id: string; title: string; description: string; authorization_note: string; questions: Question[]; scoring_rule: { type: string; note: string }; status: string; audience: string; reading_guide: string }
type Response = {
  id: string; case_id: string; student_id: string; template_id: string; administered_by: string; respondent_id: string | null; aria_note: string | null; aria_note_at: string | null; answers: Record<string, string | number>; computed_score: number | null
  professional_review: string | null; recommendations: string | null; reviewed_at: string | null; follow_up_on: string | null; created_at: string
}

const RULE: Record<string, string> = { none: 'Sin cálculo', sum: 'Suma', mean: 'Promedio' }
const STATUS = { draft: ['Borrador', 'neutral'], active: ['Activo', 'success'], archived: ['Archivado', 'warning'] } as const
const num = (v: number) => String(v).replace('.', ',')
const range = (q: Question) => Array.from({ length: (q.max ?? 5) - (q.min ?? 1) + 1 }, (_, i) => (q.min ?? 1) + i)

export const maxDuration = 60   // la lectura de ARIA puede tardar varios segundos

export default async function AssessmentsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const session = await requireSession('bienestar')
  const sp = await searchParams
  const tab = sp.tab === 'plantillas' || sp.tab === 'enviados' ? sp.tab : sp.tab === 'historial' || sp.tab === 'aplicaciones' || (!sp.tab && sp.caso) ? 'historial' : 'biblioteca'
  const db = await createClient()
  const inst = session.institutionId
  const [{ data: t }, { data: r }, { data: cases }, { data: sent }, { data: links }] = await Promise.all([
    db.from('assessment_templates').select('id, title, description, authorization_note, questions, scoring_rule, status, audience, reading_guide').eq('institution_id', inst).order('created_at', { ascending: false }),
    db.from('assessment_responses').select('*').eq('institution_id', inst).order('created_at', { ascending: false }),
    db.from('wellbeing_cases').select('id, student_id, status').eq('institution_id', inst),
    db.from('assessment_requests').select('id, template_id, student_id, guardian_id, title, status, created_at, answered_at').eq('institution_id', inst).order('created_at', { ascending: false }),
    fetchAll((a, b) => db.from('guardian_student_links').select('student_id, guardian_id, relationship').eq('institution_id', inst).order('id').range(a, b)),
  ])
  const requests = (sent ?? []) as { id: string; template_id: string; student_id: string; guardian_id: string; title: string; status: string; created_at: string; answered_at: string | null }[]
  const L = (links ?? []) as { student_id: string; guardian_id: string; relationship: string }[]
  const templates = (t ?? []) as Template[]
  const allResponses = (r ?? []) as Response[]
  const names = await nameMap(db, [...(cases ?? []).map(c => c.student_id as string), ...allResponses.flatMap(x => [x.student_id, x.administered_by, x.respondent_id]), ...L.map(l => l.guardian_id)])
  // A quién se le puede enviar un cuestionario: apoderados de estudiantes con caso activo.
  const sendTargets: SendTarget[] = (cases ?? []).filter(c => c.status !== 'closed').map(c => ({
    studentId: c.student_id as string, studentName: names.get(c.student_id as string) ?? 'Estudiante',
    guardians: L.filter(l => l.student_id === c.student_id).map(l => ({ id: l.guardian_id, label: `${names.get(l.guardian_id) ?? 'Apoderado'} · ${l.relationship}` })),
  })).sort((a, b) => a.studentName.localeCompare(b.studentName, 'es'))
  const initialStudent = sp.caso ? (cases ?? []).find(c => c.id === sp.caso)?.student_id as string | undefined : undefined
  const awaiting = requests.filter(x => x.status === 'pending')
  const templateOf = new Map(templates.map(x => [x.id, x]))
  const filteredCase = sp.caso ? (cases ?? []).find(c => c.id === sp.caso) : null
  const pending = allResponses.filter(x => !x.reviewed_at)
  const responses = allResponses.filter(x => (!sp.caso || x.case_id === sp.caso) && (sp.f !== 'porrevisar' || !x.reviewed_at))

  const href = (patch: Search) => {
    const next = new URLSearchParams()
    for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v) next.set(k, v)
    const s = next.toString()
    return s ? `/bienestar/evaluaciones?${s}` : '/bienestar/evaluaciones'
  }
  const tabs = [['biblioteca', 'Biblioteca', templates.length, <LayoutGrid key="b" size={15} />], ['plantillas', 'Plantillas', STARTER_TEMPLATES.length, <Sparkles key="p" size={15} />], ['enviados', 'Enviados', awaiting.length, <Send key="e" size={15} />], ['historial', 'Historial', allResponses.length, <History key="h" size={15} />]] as const
  const q = (sp.q ?? '').trim().toLowerCase()
  const library = templates.filter(x => (!sp.e || x.status === sp.e) && (!q || `${x.title} ${x.description}`.toLowerCase().includes(q)))
  const states = [[undefined, 'Todos', templates.length], ['active', 'Activos', templates.filter(x => x.status === 'active').length], ['draft', 'Borradores', templates.filter(x => x.status === 'draft').length], ['archived', 'Archivados', templates.filter(x => x.status === 'archived').length]] as const

  return (
    <>
      <PageHeader title="Evaluaciones" description="Los instrumentos que define tu equipo, cada vez que se aplican y la revisión profesional de cada resultado."
        actions={
          <FormDialog trigger={<><Plus size={15} />Nuevo instrumento</>} title="Nuevo instrumento" action={createTemplate} submitLabel="Crear borrador" wide
            description="Arma tu propia pauta en cuatro pasos. La plataforma no trae instrumentos clínicos ni baremos.">
            <TemplateBuilder />
          </FormDialog>
        } />

      <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi index={0} label="Instrumentos" value={templates.length} hint={`${templates.filter(x => x.status === 'active').length} activos`} icon={<ClipboardList size={17} />} href={href({ tab: undefined, caso: undefined, f: undefined, e: undefined })} />
        <Kpi index={1} label="Aplicaciones" value={allResponses.length} hint="registradas" icon={<ClipboardCheck size={17} />} href={href({ tab: 'historial', caso: undefined, f: undefined })} />
        <Kpi index={2} label="Por revisar" value={pending.length} hint={pending.length ? 'esperan tu lectura' : 'todo revisado'} icon={<Hourglass size={17} />} tone="warning" urgent={pending.length > 0} href={href({ tab: 'historial', caso: undefined, f: 'porrevisar' })} />
        <Kpi index={3} label="Revisadas" value={allResponses.length - pending.length} hint="con lectura profesional" icon={<CheckCircle2 size={17} />} tone="success" href={href({ tab: 'historial', caso: undefined, f: undefined })} />
      </div>

      <nav aria-label="Vistas" className="mb-4 flex overflow-x-auto rounded-full bg-v-fill p-1">
        {tabs.map(([id, label, count, icon]) => (
          <Link key={id} href={href({ tab: id === 'biblioteca' ? (sp.caso ? 'biblioteca' : undefined) : id, f: undefined })} scroll={false}
            className={`flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full px-3 py-2.5 text-[13.5px] font-semibold transition-colors ${tab === id ? 'bg-v-elevated text-v-accent shadow-v' : 'text-v-muted hover:text-v-text'}`}>
            {icon}{label}<span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${tab === id ? 'bg-v-accent-soft text-v-accent' : 'bg-v-border text-v-subtle'}`}>{count}</span>
          </Link>
        ))}
      </nav>

      {filteredCase && (
        <p className="mb-4 flex flex-wrap items-center gap-2 rounded-v-sm bg-v-accent-soft px-4 py-2.5 text-[13px] text-v-text">
          Viendo las aplicaciones del caso de <span className="font-semibold">{names.get(filteredCase.student_id as string) ?? 'Estudiante'}</span>.
          <Link href={`/bienestar/casos/${filteredCase.id}`} className="font-semibold text-v-accent hover:underline">Volver al caso</Link>
          <Link href={href({ caso: undefined })} className="ml-auto inline-flex items-center gap-1 font-semibold text-v-muted hover:text-v-text"><X size={13} />Ver todas</Link>
        </p>
      )}

      {/* ── Biblioteca ── */}
      {tab === 'biblioteca' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1 basis-64"><SearchBox placeholder="Buscar instrumento" /></div>
            <nav aria-label="Estado" className="flex flex-wrap gap-2">
              {states.map(([v, l, n]) => (
                <Link key={l} href={href({ e: v })} scroll={false} className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all ${sp.e === v ? 'border-v-accent/40 bg-v-accent-soft text-v-accent' : 'border-v-border bg-v-elevated text-v-muted hover:text-v-text hover:shadow-v'}`}>{l}<span className="text-[10.5px] opacity-70">{n}</span></Link>
              ))}
            </nav>
          </div>

          {library.length === 0 ? (
            <Card><EmptyState aria={8} title={templates.length ? 'Ningún instrumento coincide' : 'Aún no hay instrumentos'} description={templates.length ? 'Prueba con otra búsqueda o estado.' : 'Crea el primero con «Nuevo instrumento». Queda como borrador hasta que lo actives.'} /></Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {library.map((tpl, i) => {
                const [label, tone] = STATUS[tpl.status as keyof typeof STATUS]
                const scale = tpl.questions.filter(x => x.type === 'scale').length
                const applied = allResponses.filter(x => x.template_id === tpl.id).length
                const active = tpl.status === 'active'
                return (
                  <Reveal key={tpl.id} index={Math.min(i, 8)} className="group flex flex-col rounded-v-lg border border-v-border bg-v-elevated p-5 shadow-v transition-all duration-300 hover:-translate-y-1 hover:shadow-v-lg">
                    <div className="mb-3 flex items-start gap-3">
                      <span className={`grid size-11 shrink-0 place-items-center rounded-[30%] transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110 ${active ? 'bg-v-accent-soft text-v-accent' : 'bg-v-fill text-v-muted'}`}><ClipboardList size={20} /></span>
                      <div className="min-w-0 flex-1">
                        <h2 className="text-[15.5px] font-semibold leading-tight tracking-tight text-v-text">{tpl.title}</h2>
                        <p className="mt-1 text-xs text-v-subtle">{applied === 0 ? 'Aún sin aplicar' : `Aplicado ${applied} ${applied === 1 ? 'vez' : 'veces'}`}</p>
                      </div>
                      <Badge tone={tone}>{label}</Badge>
                    </div>
                    <div className="mb-3 flex flex-wrap gap-1.5">
                      {tpl.audience === 'apoderado' && <span className="inline-flex items-center gap-1 rounded-full bg-v-accent-soft px-2.5 py-0.5 text-[11px] font-semibold text-v-accent"><Users size={11} />Para la familia</span>}
                      <span className="inline-flex items-center gap-1 rounded-full bg-v-fill px-2.5 py-0.5 text-[11px] font-semibold text-v-muted"><ListChecks size={11} />{tpl.questions.length} {tpl.questions.length === 1 ? 'pregunta' : 'preguntas'}</span>
                      {scale > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-v-fill px-2.5 py-0.5 text-[11px] font-semibold text-v-muted">Escala 1–{tpl.questions.find(x => x.type === 'scale')?.max ?? 5}</span>}
                      <span className="inline-flex items-center gap-1 rounded-full bg-v-fill px-2.5 py-0.5 text-[11px] font-semibold text-v-muted"><Calculator size={11} />{RULE[tpl.scoring_rule.type]}</span>
                    </div>
                    <p className="mb-3 line-clamp-2 text-[13.5px] leading-relaxed text-v-muted">{tpl.description || 'Sin descripción.'}</p>
                    <ol className="mb-4 flex-1 space-y-1 text-[12.5px] text-v-muted">
                      {tpl.questions.slice(0, 3).map((x, n) => <li key={x.id} className="flex gap-2"><span className="font-semibold text-v-subtle">{n + 1}.</span><span className="truncate">{x.text}</span></li>)}
                      {tpl.questions.length > 3 && <li className="pl-5 text-v-subtle">y {tpl.questions.length - 3} más…</li>}
                    </ol>
                    <div className="flex gap-2">
                      {active
                        ? <Link href={`/bienestar/evaluaciones/aplicar/${tpl.id}${sp.caso ? `?caso=${sp.caso}` : ''}`} className="v-brand flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full text-[13.5px] font-semibold"><ClipboardPlus size={15} />Aplicar</Link>
                        : <Link href={`/bienestar/evaluaciones/aplicar/${tpl.id}`} className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full border border-v-border-strong text-[13.5px] font-semibold text-v-text hover:border-v-accent hover:text-v-accent"><Eye size={15} />Vista previa</Link>}
                      {active && tpl.audience === 'apoderado' && sendTargets.length > 0 && (
                        <FormDialog trigger={<><Send size={14} />Enviar</>} variant="secondary" title={`Enviar «${tpl.title}»`} description="El apoderado lo responde desde su panel, en «Acompañamiento». Solo ve las preguntas; tus notas y la lectura de ARIA no le llegan." action={sendToGuardian.bind(null, tpl.id)} submitLabel="Enviar al apoderado" wide>
                          <SendFields targets={sendTargets} initialStudent={initialStudent} />
                        </FormDialog>
                      )}
                      {active
                        ? <ConfirmAction action={setTemplateStatus.bind(null, tpl.id, 'archived')} variant="secondary" size="md" ariaLabel="Archivar instrumento" title="Archivar instrumento" confirmLabel="Archivar" message="No se podrá aplicar de nuevo. Las aplicaciones anteriores se conservan."><Archive size={15} /></ConfirmAction>
                        : <ConfirmAction action={setTemplateStatus.bind(null, tpl.id, 'active')} variant="primary" size="md" title="Activar instrumento" confirmLabel="Activar" message="Confirmas que el instrumento fue revisado y que el colegio está autorizado a usarlo. Quedará disponible para aplicarse."><BadgeCheck size={15} />Activar</ConfirmAction>}
                    </div>
                  </Reveal>
                )
              })}
            </div>
          )}
          <p className="flex items-center gap-2 text-[12.5px] text-v-muted"><ShieldCheck size={15} className="shrink-0 text-v-accent" />Sin interpretación automática: no hay puntos de corte, categorías ni diagnósticos. La lectura es siempre de la persona profesional.</p>
        </div>
      )}

      {/* ── Plantillas listas para usar ── */}
      {tab === 'plantillas' && (
        <div className="space-y-4">
          <p className="flex items-start gap-2.5 rounded-v-sm bg-v-accent-soft px-4 py-3 text-[13px] leading-relaxed text-v-text"><Users size={16} className="mt-0.5 shrink-0 text-v-accent" /><span>Cuestionarios para enviar a la familia y conocer mejor al estudiante. Son <span className="font-semibold">descriptivos</span>: no son instrumentos clínicos, no tienen puntajes ni categorías. Agrégalos a tu biblioteca y envíalos al apoderado de un caso.</span></p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {STARTER_TEMPLATES.map((st, i) => {
              const owned = templates.some(x => x.title === st.title && x.status !== 'archived')
              const count = st.sections.reduce((n, sec) => n + sec.items.length, 0)
              return (
                <Reveal key={st.key} index={Math.min(i, 8)} className="group flex flex-col rounded-v-lg border border-v-border bg-v-elevated p-5 shadow-v transition-all duration-300 hover:-translate-y-1 hover:shadow-v-lg">
                  <div className="mb-3 flex items-start gap-3">
                    <span className="grid size-11 shrink-0 place-items-center rounded-[30%] bg-v-accent-soft text-v-accent transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110"><Home size={20} /></span>
                    <div className="min-w-0 flex-1"><h2 className="text-[15.5px] font-semibold leading-tight tracking-tight text-v-text">{st.title}</h2><p className="mt-1 text-xs text-v-subtle">{st.topic}</p></div>
                  </div>
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-full bg-v-accent-soft px-2.5 py-0.5 text-[11px] font-semibold text-v-accent"><Users size={11} />Para la familia</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-v-fill px-2.5 py-0.5 text-[11px] font-semibold text-v-muted"><ListChecks size={11} />{count} preguntas</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-v-fill px-2.5 py-0.5 text-[11px] font-semibold text-v-muted"><Clock size={11} />{st.minutes} min</span>
                  </div>
                  <p className="mb-3 line-clamp-3 text-[13.5px] leading-relaxed text-v-muted">{st.description}</p>
                  <p className="mb-4 flex-1 text-[12.5px] text-v-subtle">Temas: {st.sections.map(sec => sec.title.toLowerCase()).join(' · ')}</p>
                  {owned
                    ? <p className="flex h-10 items-center justify-center gap-1.5 rounded-full bg-v-success/15 text-[13.5px] font-semibold text-[#157a4b]"><CheckCircle2 size={15} />Ya está en tu biblioteca</p>
                    : <ConfirmAction action={adoptStarterTemplate.bind(null, st.key)} variant="primary" size="md" title={`Agregar «${st.title}»`} confirmLabel="Agregar" message="Se agregará a tu biblioteca, lista para enviar a un apoderado. Podrás archivarla cuando quieras."><Plus size={15} />Agregar a mi biblioteca</ConfirmAction>}
                </Reveal>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Enviados a apoderados ── */}
      {tab === 'enviados' && (
        <Card index={2}>
          <div className="px-5 py-4">
            <p className="text-[16px] font-semibold tracking-tight">Cuestionarios enviados</p>
            <p className="mt-0.5 text-[12.5px] text-v-muted">{awaiting.length} esperando respuesta · {requests.length} en total</p>
          </div>
          {requests.length === 0 ? <EmptyState aria={8} title="Aún no has enviado cuestionarios" description="En la biblioteca, usa «Enviar» en un instrumento para la familia." /> : (
            <ul className="divide-y divide-v-border border-t border-v-border">
              {requests.map((x, i) => {
                const student = names.get(x.student_id) ?? 'Estudiante'
                return (
                  <Row key={x.id} index={Math.min(i, 10)} className="relative">
                    <span aria-hidden className={`absolute inset-y-3 left-0 w-1 rounded-r-full ${x.status === 'answered' ? 'bg-v-success' : x.status === 'pending' ? 'bg-v-warning' : 'bg-v-border-strong'}`} />
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4">
                      <Avatar name={student} id={x.student_id} size={46} />
                      <div className="min-w-0 flex-1 basis-56">
                        <p className="truncate text-[15.5px] font-semibold tracking-tight">{x.title}</p>
                        <p className="mt-0.5 truncate text-[13px] text-v-muted">Sobre {student}</p>
                        <p className="mt-1 truncate text-[12.5px] text-v-subtle">Enviado el {fmtDate(x.created_at)} a {names.get(x.guardian_id) ?? 'apoderado'}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <Badge tone={x.status === 'answered' ? 'success' : x.status === 'pending' ? 'warning' : 'neutral'}>{x.status === 'answered' ? <><CheckCircle2 size={12} />Respondido el {fmtDate(x.answered_at)}</> : x.status === 'pending' ? <><Hourglass size={12} />Esperando respuesta</> : 'Anulado'}</Badge>
                        {x.status === 'pending' && <ConfirmAction action={cancelGuardianRequest.bind(null, x.id)} variant="ghost" size="sm" title="Anular envío" confirmLabel="Anular" message="El apoderado ya no podrá responder este cuestionario.">Anular</ConfirmAction>}
                        {x.status === 'answered' && <Link href={href({ tab: 'historial', f: undefined })} className="text-[12.5px] font-semibold text-v-accent hover:underline">Ver en historial</Link>}
                      </div>
                    </div>
                  </Row>
                )
              })}
            </ul>
          )}
        </Card>
      )}

      {/* ── Aplicaciones ── */}
      {tab === 'historial' && (
        <Card index={2}>
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div>
              <p className="text-[16px] font-semibold tracking-tight">Aplicaciones</p>
              <p className="mt-0.5 text-[12.5px] text-v-muted">{responses.length} de {allResponses.length} · la más reciente arriba</p>
            </div>
            <nav aria-label="Filtro" className="flex gap-1">
              {([[undefined, 'Todas'], ['porrevisar', 'Por revisar']] as const).map(([v, l]) => (
                <Link key={l} href={href({ f: v })} scroll={false} className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold ${sp.f === v ? 'bg-v-accent-soft text-v-accent' : 'text-v-muted hover:bg-v-fill'}`}>{l}{v && <span className="opacity-70">{pending.length}</span>}</Link>
              ))}
            </nav>
          </div>
          {responses.length === 0 ? <EmptyState aria={8} title={allResponses.length ? 'Ninguna aplicación coincide' : 'Aún no hay aplicaciones'} description={allResponses.length ? 'Prueba quitando el filtro.' : 'Aplica un instrumento desde la biblioteca; aquí quedará cada aplicación.'} /> : (
            <ul className="divide-y divide-v-border border-t border-v-border">
              {responses.map((x, i) => {
                const tpl = templateOf.get(x.template_id)
                const student = names.get(x.student_id) ?? 'Estudiante'
                const scale = (tpl?.questions ?? []).filter(q => q.type === 'scale')
                return (
                  <Row key={x.id} index={Math.min(i, 10)} className="relative">
                    <span aria-hidden className={`absolute inset-y-3 left-0 w-1 rounded-r-full ${x.reviewed_at ? 'bg-v-success' : 'bg-v-warning'}`} />
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4">
                      <Avatar name={student} id={x.student_id} size={46} />
                      <div className="min-w-0 flex-1 basis-56">
                        <p className="truncate text-[15.5px] font-semibold tracking-tight">{student}</p>
                        <p className="mt-0.5 truncate text-[13px] text-v-muted">{tpl?.title ?? 'Instrumento'}</p>
                        <p className="mt-1 truncate text-[12.5px] text-v-subtle">{x.respondent_id ? <><span className="font-semibold text-v-accent">Respondió la familia</span> ({names.get(x.respondent_id) ?? 'apoderado'}) el {fmtDate(x.created_at)}</> : <>Aplicada el {fmtDate(x.created_at)} · {names.get(x.administered_by) ?? 'Equipo de bienestar'}</>}</p>
                      </div>
                      <div className="shrink-0 basis-36 text-center">
                        {x.computed_score != null ? <><p className="v-display text-[1.7rem] font-bold leading-none tabular-nums">{num(x.computed_score)}</p><p className="mt-1 text-[11.5px] text-v-subtle">{RULE[tpl?.scoring_rule.type ?? 'none']}{scale[0] && tpl?.scoring_rule.type === 'mean' ? ` · escala ${scale[0].min}–${scale[0].max}` : ''}</p></>
                          : <p className="text-[12.5px] text-v-subtle">Sin cálculo</p>}
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <Badge tone={x.reviewed_at ? 'success' : 'warning'}>{x.reviewed_at ? <><CheckCircle2 size={12} />Revisada el {fmtDate(x.reviewed_at)}</> : <><Hourglass size={12} />Por revisar</>}</Badge>
                        <FormDialog trigger={x.reviewed_at ? 'Ver revisión' : 'Revisar'} size="sm" variant={x.reviewed_at ? 'secondary' : 'primary'} title="Revisión profesional" action={reviewResponse.bind(null, x.id)} submitLabel="Guardar revisión" wide
                          description={`${tpl?.title ?? ''} · ${student}`}>
                          <div className="rounded-v-sm bg-v-fill/70 p-4">
                            <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-v-subtle">Respuestas registradas</p>
                            <ul className="space-y-2.5 text-[13px]">
                              {(tpl?.questions ?? []).map(q => {
                                const v = x.answers[q.id]
                                return q.type === 'scale' ? (
                                  <li key={q.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                                    <span className="min-w-0 flex-1 basis-48 text-v-text">{q.text}</span>
                                    <span className="flex items-center gap-1" aria-label={`${v ?? 'sin respuesta'} de ${q.max}`}>
                                      {range(q).map(n => <span key={n} className={`grid size-6 place-items-center rounded-full text-[11px] font-semibold ${n === Number(v) ? 'v-brand' : 'bg-v-elevated text-v-subtle'}`}>{n}</span>)}
                                    </span>
                                  </li>
                                ) : (
                                  <li key={q.id}><span className="text-v-muted">{q.text}</span><span className="mt-0.5 block whitespace-pre-wrap text-v-text">{v || '—'}</span></li>
                                )
                              })}
                            </ul>
                            {x.computed_score != null && <p className="mt-3 border-t border-v-border pt-3 text-[13px] text-v-muted">Resultado ({RULE[tpl?.scoring_rule.type ?? 'none'].toLowerCase()}): <span className="font-semibold text-v-text">{num(x.computed_score)}</span>. {tpl?.scoring_rule.note}</p>}
                          </div>
                          <Field label="Revisión profesional" hint="Tu lectura de las respuestas. El sistema no las interpreta."><Textarea name="professional_review" required minLength={5} rows={4} maxLength={4000} defaultValue={x.professional_review ?? ''} /></Field>
                          <Field label="Recomendaciones"><Textarea name="recommendations" rows={3} maxLength={4000} defaultValue={x.recommendations ?? ''} /></Field>
                          <Field label="Seguimiento"><Input name="follow_up_on" type="date" defaultValue={x.follow_up_on ?? ''} /></Field>
                        </FormDialog>
                      </div>
                    </div>
                    <details className="group border-t border-dashed border-v-border">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-2.5 text-[12.5px] font-semibold text-v-muted hover:text-v-text [&::-webkit-details-marker]:hidden">
                        <span className="inline-flex items-center gap-2"><Sparkles size={14} className="text-v-accent" />Lectura de ARIA <span className="font-normal text-v-subtle">· solo para el equipo{x.aria_note_at ? ` · ${fmtDate(x.aria_note_at)}` : ''}</span></span>
                        <span className="text-v-accent group-open:hidden">{x.aria_note ? 'Ver' : 'Pedir'}</span><span className="hidden text-v-subtle group-open:inline">Ocultar</span>
                      </summary>
                      <div className="px-5 pb-5">
                        {x.aria_note && <AnalysisView text={x.aria_note} />}
                        <InlineForm action={requestResponseReading.bind(null, x.id)} className={`flex flex-wrap items-center justify-between gap-3 ${x.aria_note ? 'mt-4' : ''}`}>
                          <p className="min-w-0 flex-1 basis-64 text-xs text-v-subtle">ARIA lee las respuestas junto con el caso, sin nombres. {x.respondent_id ? 'El apoderado no ve esta lectura.' : ''} No suma ni clasifica: ofrece puntos a mirar y preguntas para la entrevista.</p>
                          <span className="flex items-center gap-3">
                            <span className="hidden items-center gap-1.5 text-xs font-semibold text-v-accent [form[aria-busy=true]_&]:inline-flex"><Loader2 size={14} className="animate-spin" />ARIA está leyendo…</span>
                            <SubmitButton variant={x.aria_note ? 'secondary' : 'primary'} size="sm"><Sparkles size={14} />{x.aria_note ? 'Pedir otra lectura' : 'Pedir lectura a ARIA'}</SubmitButton>
                          </span>
                        </InlineForm>
                      </div>
                    </details>
                  </Row>
                )
              })}
            </ul>
          )}
        </Card>
      )}
    </>
  )
}
