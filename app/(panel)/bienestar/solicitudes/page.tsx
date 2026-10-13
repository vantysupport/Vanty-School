import Link from 'next/link'
import { AlertTriangle, ChevronRight, Clock, FolderHeart, HeartHandshake, Inbox, UserCheck, UserX } from 'lucide-react'
import { requireSession } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { nameMap } from '@/lib/data/people'
import { fmtDate } from '@/lib/format'
import { CATEGORY_LABEL, REQUEST_STATUS } from '@/components/shared/wellbeing-request'
import { Avatar, Badge, Card, EmptyState, PageHeader, StatStrip } from '@/components/ui/primitives'
import { SearchBox } from '@/components/ui/filters'
import { Row } from '@/components/ui/motion'

type Search = { estado?: string; origen?: string; q?: string }

const PRIORITY_TONE = { baja: 'neutral', media: 'accent', alta: 'warning', urgente: 'danger' } as const
const PRIORITY_RANK: Record<string, number> = { urgente: 0, alta: 1, media: 3, baja: 4 }   // sin revisar (2) va antes que media y baja
const STRIPE: Record<string, string> = { urgente: 'bg-v-danger', alta: 'bg-v-warning', media: 'bg-v-accent', baja: 'bg-v-border-strong' }
const SOURCE: Record<string, string> = { estudiante: 'Lo pidió el propio estudiante', apoderado: 'Lo pidió su apoderado', docente: 'Derivación de un docente', bienestar: 'La registró el equipo de bienestar' }
const ago = (days: number) => (days <= 0 ? 'hoy' : days === 1 ? 'ayer' : `hace ${days} días`)

export default async function RequestsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const session = await requireSession('bienestar')
  const sp = await searchParams
  const db = await createClient()
  // La lista no trae el relato: el contenido de una solicitud solo se lee al abrirla, y ese acceso queda auditado.
  const { data } = await db.from('wellbeing_requests').select('id, student_id, requested_by, source, category, status, priority, assigned_to, created_at')
    .eq('institution_id', session.institutionId).order('created_at', { ascending: false })
  const base = data ?? []
  const studentIds = [...new Set(base.map(r => r.student_id as string))]
  const [names, { data: enrollments }, { data: cases }] = await Promise.all([
    nameMap(db, base.flatMap(r => [r.student_id, r.requested_by, r.assigned_to] as string[])),
    studentIds.length ? db.from('course_enrollments').select('student_id, courses(name)').in('student_id', studentIds).eq('status', 'active') : Promise.resolve({ data: [] }),
    base.length ? db.from('wellbeing_cases').select('id, request_id').in('request_id', base.map(r => r.id as string)) : Promise.resolve({ data: [] }),
  ])
  const courseOf = new Map(((enrollments ?? []) as unknown as { student_id: string; courses: { name: string } | null }[]).map(e => [e.student_id, e.courses?.name ?? null]))
  const caseOf = new Map((cases ?? []).map(c => [c.request_id as string, c.id as string]))
  const now = Date.now()

  const all = base.map(r => ({
    id: r.id as string, studentId: r.student_id as string, student: names.get(r.student_id as string) ?? 'Estudiante', course: courseOf.get(r.student_id as string) ?? null,
    source: r.source as string, sender: names.get(r.requested_by as string) ?? null, category: r.category as string, status: r.status as string,
    priority: r.priority as keyof typeof PRIORITY_TONE | null, assignee: names.get(r.assigned_to as string) ?? null, createdAt: r.created_at as string,
    days: Math.floor((now - new Date(r.created_at as string).getTime()) / 86_400_000), open: r.status !== 'closed', hasCase: caseOf.has(r.id as string),
  }))
  // Lo abierto primero; dentro de eso, lo más urgente y lo que lleva más tiempo esperando.
  const order = (r: (typeof all)[number]) => [r.open ? 0 : 1, r.priority ? PRIORITY_RANK[r.priority] : 2, r.status === 'pending' ? 0 : 1, -r.days]
  all.sort((a, b) => { const x = order(a), y = order(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0 })

  const state = sp.estado ?? 'abiertas'
  const q = (sp.q ?? '').trim().toLowerCase()
  const inState = (r: (typeof all)[number]) => state === 'todas' ? true : state === 'abiertas' ? r.open : state === 'prioritarias' ? r.open && (r.priority === 'urgente' || r.priority === 'alta')
    : state === 'sinresponsable' ? r.open && !r.assignee : r.status === state
  const rows = all.filter(r => inState(r) && (!sp.origen || r.source === sp.origen)
    && (!q || [r.student, r.course, r.sender, r.assignee, CATEGORY_LABEL[r.category]].some(t => (t ?? '').toLowerCase().includes(q))))

  const open = all.filter(r => r.open)
  const count = (status: string) => all.filter(r => r.status === status).length
  const href = (patch: Search) => {
    const next = new URLSearchParams()
    for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v) next.set(k, v)
    const s = next.toString()
    return s ? `/bienestar/solicitudes?${s}` : '/bienestar/solicitudes'
  }
  const states = [['abiertas', 'Abiertas', open.length], ['pending', 'Sin revisar', count('pending')], ['in_review', 'En revisión', count('in_review')], ['in_follow_up', 'En acompañamiento', count('in_follow_up')], ['closed', 'Cerradas', count('closed')], ['todas', 'Todas', all.length]] as const
  const sources = [['', 'Cualquier origen'], ['estudiante', 'Estudiantes'], ['apoderado', 'Apoderados'], ['docente', 'Docentes'], ['bienestar', 'Del equipo']] as const
  const special = state === 'prioritarias' || state === 'sinresponsable'

  return (
    <>
      <PageHeader title="Solicitudes de ayuda" description="Lo que piden estudiantes y apoderados, y lo que derivan los docentes. La prioridad la define siempre una persona del equipo." />

      <StatStrip items={[
        { label: 'Sin revisar', value: count('pending'), hint: 'nadie las ha leído', icon: <Inbox size={15} />, tone: 'warning', href: href({ estado: 'pending', origen: undefined }) },
        { label: 'Urgentes o altas', value: open.filter(r => r.priority === 'urgente' || r.priority === 'alta').length, hint: 'abiertas', icon: <AlertTriangle size={15} />, tone: 'danger', href: href({ estado: 'prioritarias', origen: undefined }) },
        { label: 'Sin responsable', value: open.filter(r => !r.assignee).length, hint: 'abiertas', icon: <UserX size={15} />, href: href({ estado: 'sinresponsable', origen: undefined }) },
        { label: 'En acompañamiento', value: count('in_follow_up'), hint: 'con seguimiento', icon: <HeartHandshake size={15} />, tone: 'success', href: href({ estado: 'in_follow_up', origen: undefined }) },
      ]} />

      <Card index={2}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div>
            <p className="text-[16px] font-semibold tracking-tight">{state === 'prioritarias' ? 'Urgentes o de prioridad alta' : state === 'sinresponsable' ? 'Abiertas sin responsable' : 'Bandeja de solicitudes'}</p>
            <p className="mt-0.5 text-[12.5px] text-v-muted">{rows.length} de {all.length} · lo más urgente y lo que lleva más tiempo esperando va primero</p>
          </div>
          <SearchBox placeholder="Buscar estudiante o curso" />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-y border-v-border bg-v-fill/40 px-4 py-2.5">
          <nav aria-label="Estado" className="flex flex-wrap gap-1">
            {states.map(([v, l, n]) => (
              <Link key={v} href={href({ estado: v === 'abiertas' ? undefined : v })} scroll={false}
                className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold ${state === v || (v === 'abiertas' && special) ? 'v-brand shadow-v-brand' : 'text-v-muted hover:bg-v-fill hover:text-v-text'}`}>
                {l}<span className="opacity-70">{n}</span>
              </Link>
            ))}
          </nav>
          <span className="hidden h-5 w-px bg-v-border lg:block" />
          <nav aria-label="Origen" className="flex flex-wrap gap-1">
            {sources.map(([v, l]) => <Link key={v} href={href({ origen: v || undefined })} scroll={false} className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${(sp.origen ?? '') === v ? 'bg-v-accent-soft text-v-accent' : 'text-v-muted hover:bg-v-fill'}`}>{l}</Link>)}
          </nav>
        </div>

        {rows.length === 0 ? (
          <EmptyState aria={2} title={all.length === 0 ? 'Aún no hay solicitudes' : state === 'abiertas' && !q && !sp.origen ? 'No hay solicitudes abiertas' : 'Ninguna solicitud coincide'}
            description={all.length === 0 ? 'Cuando alguien pida apoyo o un docente derive a un estudiante, aparecerá aquí.' : 'Prueba con otro estado, origen o búsqueda.'} />
        ) : (
          <ul className="divide-y divide-v-border">
            {rows.map((r, i) => (
              <Row key={r.id} index={Math.min(i, 10)} className="group relative hover:bg-v-fill/50">
                <span aria-hidden className={`absolute inset-y-3 left-0 w-1 rounded-r-full ${!r.open ? 'bg-transparent' : r.priority ? STRIPE[r.priority] : 'bg-v-warning/60'}`} />
                <Link href={`/bienestar/solicitudes/${r.id}`} className="flex flex-wrap items-center gap-x-5 gap-y-3 px-5 py-4">
                  <Avatar name={r.student} id={r.studentId} size={48} />
                  <div className="min-w-0 flex-1 basis-60">
                    <p className="truncate text-[16px] font-semibold tracking-tight group-hover:text-v-accent">{r.student}</p>
                    <p className="mt-0.5 truncate text-[13px] text-v-muted">{r.course ?? 'Sin curso'} · {CATEGORY_LABEL[r.category]}</p>
                    <p className="mt-1.5 truncate text-[12.5px] text-v-subtle">{SOURCE[r.source] ?? r.source}{r.source !== 'estudiante' && r.source !== 'bienestar' && r.sender ? `: ${r.sender}` : ''}</p>
                  </div>
                  <div className="flex shrink-0 basis-52 flex-col gap-1.5 text-[12.5px]">
                    <span className="inline-flex items-center gap-1.5"><UserCheck size={14} className="text-v-subtle" />{r.assignee ?? <span className="font-semibold text-v-warning">Sin responsable</span>}</span>
                    <span className={`inline-flex items-center gap-1.5 ${r.status === 'pending' && r.days >= 3 ? 'font-semibold text-v-danger' : 'text-v-muted'}`}><Clock size={14} className={r.status === 'pending' && r.days >= 3 ? '' : 'text-v-subtle'} />Recibida {r.days > 6 ? `el ${fmtDate(r.createdAt)}` : ago(r.days)}</span>
                    {r.hasCase && <span className="inline-flex items-center gap-1.5 text-[#157a4b]"><FolderHeart size={14} />Con caso de acompañamiento</span>}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {r.priority ? <Badge tone={PRIORITY_TONE[r.priority]}>Prioridad <span className="capitalize">{r.priority}</span></Badge> : r.open && <Badge tone="warning">Prioridad sin definir</Badge>}
                    <Badge tone={REQUEST_STATUS[r.status].tone}>{REQUEST_STATUS[r.status].label}</Badge>
                    <span className="grid size-9 place-items-center rounded-full bg-v-fill text-v-muted transition-all group-hover:bg-v-accent group-hover:text-white"><ChevronRight size={16} /></span>
                  </div>
                </Link>
              </Row>
            ))}
          </ul>
        )}
        <p className="border-t border-v-border px-5 py-3 text-xs text-v-subtle">La lista no muestra el relato: se lee al abrir la solicitud, y cada apertura queda registrada.</p>
      </Card>
    </>
  )
}
