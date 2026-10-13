import Link from 'next/link'
import { AlertTriangle, ChevronRight, Clock, Flag, Inbox, MessageSquare, PieChart, ShieldAlert, Timer, UserCheck } from 'lucide-react'
import { requireSession } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { nameMap } from '@/lib/data/people'
import { fmtDate } from '@/lib/format'
import { ROLE_SHORT, type Role } from '@/lib/roles'
import { REPORT_CATEGORY, REPORT_KIND, REPORT_STATUS, SEVERITY_TONE } from '@/components/shared/reports'
import { Avatar, Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, StatStrip } from '@/components/ui/primitives'
import { SearchBox } from '@/components/ui/filters'
import { Bar, Row } from '@/components/ui/motion'

type Search = { estado?: string; tipo?: string; q?: string }

const STRIPE: Record<string, string> = { denuncia: 'bg-v-danger', reclamo: 'bg-v-warning', sugerencia: 'bg-v-accent' }
const SEVERITY_RANK: Record<string, number> = { grave: 0, alta: 1, media: 2, baja: 3 }
const isOpen = (status: string) => status === 'received' || status === 'in_review'
const ago = (days: number) => (days <= 0 ? 'hoy' : days === 1 ? 'ayer' : `hace ${days} días`)

export default async function ReportsInbox({ searchParams }: { searchParams: Promise<Search> }) {
  const session = await requireSession('directivo')
  const sp = await searchParams
  const db = await createClient()
  const { data } = await db.from('reports').select('id, reporter_id, student_id, kind, category, subject, description, status, severity, assigned_to, created_at, resolved_at')
    .eq('institution_id', session.institutionId).order('created_at', { ascending: false })
  const now = Date.now()
  const base = data ?? []
  const [names, { data: memberships }, { data: notes }] = await Promise.all([
    nameMap(db, base.flatMap(r => [r.reporter_id, r.assigned_to, r.student_id] as string[])),
    db.from('institution_memberships').select('user_id, role').eq('institution_id', session.institutionId).in('user_id', [...new Set(base.map(r => r.reporter_id as string))]),
    base.length ? db.from('report_notes').select('report_id, created_at').in('report_id', base.map(r => r.id as string)).order('created_at') : Promise.resolve({ data: [] as { report_id: string; created_at: string }[] }),
  ])
  const roleOf = new Map((memberships ?? []).map(m => [m.user_id as string, m.role as Role]))

  const all = base.map(r => {
    const own = (notes ?? []).filter(n => n.report_id === r.id)
    return {
      id: r.id as string, kind: r.kind as string, category: r.category as string, subject: r.subject as string, description: r.description as string,
      status: r.status as string, severity: r.severity as string | null, createdAt: r.created_at as string, resolvedAt: r.resolved_at as string | null,
      reporterId: r.reporter_id as string, reporter: names.get(r.reporter_id as string) ?? 'Usuario', role: ROLE_SHORT[roleOf.get(r.reporter_id as string) ?? 'apoderado'],
      student: names.get(r.student_id as string) ?? null, assignee: names.get(r.assigned_to as string) ?? null,
      days: Math.floor((now - new Date(r.created_at as string).getTime()) / 86_400_000),
      notes: own.length, lastNote: own[own.length - 1]?.created_at ?? null, open: isOpen(r.status as string),
    }
  })
  // Lo abierto primero y, dentro de eso, lo más delicado y lo que lleva más tiempo esperando.
  const urgency = (r: (typeof all)[number]) => [r.open ? 0 : 1, r.kind === 'denuncia' ? 0 : 1, SEVERITY_RANK[r.severity ?? ''] ?? 2, r.status === 'received' ? 0 : 1, -r.days]
  all.sort((a, b) => { const x = urgency(a), y = urgency(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0 })

  const state = sp.estado ?? 'abiertos'
  const q = (sp.q ?? '').trim().toLowerCase()
  const inState = (r: (typeof all)[number]) => state === 'todos' ? true : state === 'abiertos' ? r.open : state === 'sinrevisar' ? r.status === 'received' : r.status === state
  const rows = all.filter(r => inState(r) && (!sp.tipo || r.kind === sp.tipo)
    && (!q || [r.subject, r.description, r.reporter, r.student, r.assignee, REPORT_CATEGORY[r.category]].some(t => (t ?? '').toLowerCase().includes(q))))

  const open = all.filter(r => r.open)
  const resolved = all.filter(r => r.resolvedAt)
  const avgDays = resolved.length ? resolved.reduce((n, r) => n + (new Date(r.resolvedAt!).getTime() - new Date(r.createdAt).getTime()) / 86_400_000, 0) / resolved.length : null
  const oldest = open.reduce((n, r) => Math.max(n, r.days), 0)
  const byCategory = Object.entries(REPORT_CATEGORY).map(([id, label]) => ({ label, total: all.filter(r => r.category === id).length, open: open.filter(r => r.category === id).length }))
    .filter(c => c.total > 0).sort((a, b) => b.open - a.open || b.total - a.total)

  const href = (patch: Search) => {
    const next = new URLSearchParams()
    for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v) next.set(k, v)
    const s = next.toString()
    return s ? `/direccion/reclamos?${s}` : '/direccion/reclamos'
  }
  const pill = (on: boolean) => `inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-semibold ${on ? 'v-brand shadow-v-brand' : 'text-v-muted hover:bg-v-fill hover:text-v-text'}`
  const states = [['abiertos', 'Abiertos', open.length], ['resolved', 'Resueltos', all.filter(r => r.status === 'resolved').length], ['dismissed', 'Cerrados sin acción', all.filter(r => r.status === 'dismissed').length], ['todos', 'Todos', all.length]] as const
  const kinds = [['', 'Todo tipo'], ['denuncia', 'Denuncias'], ['reclamo', 'Reclamos'], ['sugerencia', 'Sugerencias']] as const

  return (
    <>
      <PageHeader title="Reclamos y denuncias" description="Lo que estudiantes, apoderados y funcionarios le hacen llegar a la dirección. Solo el equipo directivo ve esta bandeja." />

      <StatStrip items={[
        { label: 'Sin revisar', value: all.filter(r => r.status === 'received').length, hint: 'nadie los ha tomado', icon: <Inbox size={15} />, tone: 'warning', href: href({ estado: 'sinrevisar', tipo: undefined }) },
        { label: 'En revisión', value: all.filter(r => r.status === 'in_review').length, hint: 'con gestión en curso', icon: <Clock size={15} />, href: href({ estado: 'in_review', tipo: undefined }) },
        { label: 'Denuncias abiertas', value: open.filter(r => r.kind === 'denuncia').length, hint: 'requieren protocolo', icon: <AlertTriangle size={15} />, tone: 'danger', href: href({ estado: 'abiertos', tipo: 'denuncia' }) },
        { label: 'Tiempo de resolución', value: avgDays != null ? avgDays.toFixed(1).replace('.', ',') : '—', hint: avgDays != null ? 'días en promedio' : 'sin casos resueltos', icon: <Timer size={15} />, tone: 'success' },
      ]} />

      <div className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-[1.9fr_1fr]">
        <Card index={2} className="flex flex-col">
          <CardHeader icon={<Flag size={15} />} title="Bandeja de casos"
            description={state === 'abiertos' ? `${rows.length} ${rows.length === 1 ? 'caso espera' : 'casos esperan'} gestión · lo más delicado primero` : `${rows.length} de ${all.length} casos`}
            actions={<SearchBox placeholder="Buscar por asunto o persona" />} />
          <div className="flex flex-wrap items-center gap-2 border-y border-v-border bg-v-fill/40 px-4 py-2">
            <nav aria-label="Estado" className="flex flex-wrap gap-1">
              {states.map(([v, l, n]) => <Link key={v} href={href({ estado: v === 'abiertos' ? undefined : v })} scroll={false} className={pill(state === v || (v === 'abiertos' && (state === 'sinrevisar' || state === 'in_review')))}>{l}<span className="opacity-70">{n}</span></Link>)}
            </nav>
            <span className="hidden h-5 w-px bg-v-border lg:block" />
            <nav aria-label="Tipo" className="flex flex-wrap gap-1">
              {kinds.map(([v, l]) => <Link key={v} href={href({ tipo: v || undefined })} scroll={false} className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${(sp.tipo ?? '') === v ? 'bg-v-accent-soft text-v-accent' : 'text-v-muted hover:bg-v-fill'}`}>{l}</Link>)}
            </nav>
          </div>

          {rows.length === 0 ? (
            <EmptyState aria={2} title={state === 'abiertos' && !q && !sp.tipo ? 'No hay casos esperando gestión' : 'Ningún caso coincide'} description={state === 'abiertos' && !q && !sp.tipo ? 'Cuando alguien presente un reclamo, denuncia o sugerencia aparecerá aquí.' : 'Prueba con otro estado, tipo o búsqueda.'} />
          ) : (
            <ul className="divide-y divide-v-border">
              {rows.map((r, i) => (
                <Row key={r.id} index={i} className="group relative hover:bg-v-fill/50">
                  <span aria-hidden className={`absolute inset-y-3 left-0 w-1 rounded-r-full ${r.open ? STRIPE[r.kind] : 'bg-v-border-strong'}`} />
                  <Link href={`/direccion/reclamos/${r.id}`} className="flex items-start gap-4 px-5 py-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={REPORT_KIND[r.kind].tone}>{REPORT_KIND[r.kind].label}</Badge>
                        <Badge>{REPORT_CATEGORY[r.category]}</Badge>
                        {r.severity ? <Badge tone={SEVERITY_TONE[r.severity]}>Gravedad <span className="capitalize">{r.severity}</span></Badge>
                          : r.open && <span className="text-[11px] font-medium text-v-subtle">Gravedad sin evaluar</span>}
                      </div>
                      <p className="mt-2 text-[15px] font-semibold tracking-tight group-hover:text-v-accent">{r.subject}</p>
                      <p className="mt-0.5 line-clamp-1 text-[13px] text-v-muted">{r.description}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-v-muted">
                        <span className="inline-flex items-center gap-2"><Avatar name={r.reporter} id={r.reporterId} size={22} /><span><span className="font-semibold text-v-text">{r.reporter}</span> · {r.role}</span></span>
                        {r.student && <span>Estudiante: <span className="font-medium text-v-text">{r.student}</span></span>}
                        <span className="inline-flex items-center gap-1"><UserCheck size={13} className="text-v-subtle" />{r.assignee ?? <span className="font-semibold text-v-warning">Sin responsable</span>}</span>
                        <span className="inline-flex items-center gap-1"><MessageSquare size={13} className="text-v-subtle" />{r.notes === 0 ? 'Sin gestiones' : `${r.notes} ${r.notes === 1 ? 'gestión' : 'gestiones'} · última ${fmtDate(r.lastNote)}`}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5 text-right">
                      <Badge tone={REPORT_STATUS[r.status].tone}>{REPORT_STATUS[r.status].label}</Badge>
                      <span className={`text-xs ${r.open && r.days >= 5 ? 'font-semibold text-v-danger' : 'text-v-subtle'}`}>{r.open ? `Recibido ${ago(r.days)}` : r.resolvedAt ? `Resuelto el ${fmtDate(r.resolvedAt)}` : fmtDate(r.createdAt)}</span>
                      <span className="mt-1 inline-flex items-center text-xs font-semibold text-v-accent">{r.open ? 'Gestionar' : 'Ver caso'}<ChevronRight size={13} className="transition-transform group-hover:translate-x-0.5" /></span>
                    </div>
                  </Link>
                </Row>
              ))}
            </ul>
          )}
          <p className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-v-border px-5 py-3 text-[11px] text-v-muted">
            <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-v-danger" />Denuncia</span>
            <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-v-warning" />Reclamo</span>
            <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-v-accent" />Sugerencia</span>
            <span>Orden: casos abiertos primero, de mayor a menor gravedad y antigüedad.</span>
          </p>
        </Card>

        <div className="flex flex-col gap-4">
          <Card index={3}>
            <CardHeader icon={<PieChart size={15} />} title="De qué se trata" description={`${all.length} casos recibidos · ${open.length} abiertos`} />
            <CardBody>
              {byCategory.length === 0 ? <p className="text-sm text-v-muted">Aún no se han recibido casos.</p> : (
                <ul className="space-y-3.5">
                  {byCategory.map((c, i) => (
                    <li key={c.label}>
                      <div className="mb-1.5 flex items-center justify-between gap-2 text-[13px]">
                        <span className="font-medium">{c.label}</span>
                        <span className="text-v-muted"><span className="font-semibold text-v-text">{c.total}</span>{c.open > 0 && <span className="ml-1.5 text-v-warning">{c.open} {c.open === 1 ? 'abierto' : 'abiertos'}</span>}</span>
                      </div>
                      <Bar value={(c.total / all.length) * 100} tone={c.open ? 'warning' : 'neutral'} delay={0.3 + i * 0.06} />
                    </li>
                  ))}
                </ul>
              )}
              {open.length > 0 && <p className="mt-4 rounded-v-sm bg-v-fill px-3 py-2 text-xs text-v-muted">El caso abierto más antiguo lleva <span className="font-semibold text-v-text">{oldest} {oldest === 1 ? 'día' : 'días'}</span> esperando.</p>}
            </CardBody>
          </Card>

          <Card index={4} className="flex-1">
            <CardHeader icon={<ShieldAlert size={15} />} tone="danger" title="Ante una denuncia" description="La plataforma registra la gestión; no reemplaza el protocolo" />
            <CardBody>
              <ol className="space-y-3 text-[13px] leading-relaxed text-v-muted">
                {[
                  ['Evalúa la gravedad', 'y asigna a una persona responsable del caso.'],
                  ['Activa el protocolo de convivencia', 'del reglamento interno si hay maltrato, acoso escolar o vulneración de derechos.'],
                  ['Denuncia a las autoridades', 'si los hechos pueden ser delito: es un deber legal del colegio.'],
                  ['Deja registro de cada gestión', 'y responde a quien presentó el caso.'],
                ].map(([strong, rest], i) => (
                  <li key={strong} className="flex gap-3">
                    <span className="v-display grid size-6 shrink-0 place-items-center rounded-full bg-v-danger/10 text-[11px] font-bold text-v-danger">{i + 1}</span>
                    <span><span className="font-semibold text-v-text">{strong}</span> {rest}</span>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  )
}
