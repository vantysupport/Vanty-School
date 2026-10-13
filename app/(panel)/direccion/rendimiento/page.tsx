import Link from 'next/link'
import { BookOpen, ChevronRight, ClipboardList, GraduationCap, LayoutDashboard, Sparkles, Users } from 'lucide-react'
import { requireSession } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { loadPerformance, perfHref, STAGES, type PerfSearch, type PerfView } from '@/lib/data/performance'
import { LinkButton } from '@/components/ui/primitives'
import { PerformanceScope } from '@/components/direction/performance-scope'
import { EvaluationsView, GeneralView, StudentsView, SubjectsView, TeachersView } from '@/components/direction/performance-views'

export default async function PerformancePage({ searchParams }: { searchParams: Promise<PerfSearch> }) {
  const session = await requireSession('directivo')
  const sp = await searchParams
  const d = await loadPerformance(await createClient(), session.institutionId, sp)
  const { stage, grade, course, subject } = d.selection

  // Ruta del alcance: cada tramo vuelve a ese nivel de detalle.
  const trail = [
    { label: 'Todo el colegio', href: perfHref(sp, { nivel: undefined, grado: undefined, curso: undefined, asignatura: undefined }) },
    stage && { label: STAGES[stage].short, href: perfHref(sp, { nivel: stage, grado: undefined, curso: undefined, asignatura: undefined }) },
    grade && { label: grade.name, href: perfHref(sp, { nivel: stage, grado: grade.id, curso: undefined, asignatura: undefined }) },
    course && { label: `Sección ${course.section}`, href: perfHref(sp, { asignatura: undefined }) },
    subject && { label: subject.name, href: perfHref(sp, {}) },
  ].filter((x): x is { label: string; href: string } => !!x)

  // Cada pestaña responde una sola pregunta.
  const views: { id: PerfView; label: string; question: string; icon: React.ReactNode }[] = [
    { id: 'general', label: 'Resumen', question: '¿Cómo vamos?', icon: <LayoutDashboard size={16} /> },
    { id: 'asignaturas', label: 'Asignaturas', question: '¿En qué materias cuesta más?', icon: <BookOpen size={16} /> },
    { id: 'evaluaciones', label: 'Evaluaciones', question: '¿Cómo salió cada prueba?', icon: <ClipboardList size={16} /> },
    { id: 'alumnado', label: 'Alumnado', question: '¿Quién necesita apoyo?', icon: <GraduationCap size={16} /> },
    { id: 'docentes', label: 'Docentes', question: '¿Cómo van las clases?', icon: <Users size={16} /> },
  ]

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <h1 className="v-headline text-[1.6rem] text-v-text sm:text-[1.75rem]">Rendimiento <span className="v-brand-text">{d.label}</span></h1>
        <LinkButton href="/direccion/aria" variant="primary"><Sparkles size={14} />Analizar con ARIA</LinkButton>
      </div>

      <nav aria-label="Qué quieres saber" className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
        {views.map(v => {
          const on = d.view === v.id
          return (
            <Link key={v.id} href={perfHref(sp, { vista: v.id === 'general' ? undefined : v.id, estado: undefined, orden: undefined, q: undefined })} scroll={false} aria-current={on ? 'page' : undefined}
              className={`flex items-center gap-3 rounded-v border px-4 py-3 ${on ? 'v-brand border-transparent shadow-v-brand' : 'border-v-border bg-v-elevated shadow-v-xs hover:border-v-accent'}`}>
              <span className={`grid size-9 shrink-0 place-items-center rounded-[30%] ${on ? 'bg-white/20' : 'bg-v-accent-soft text-v-accent'}`}>{v.icon}</span>
              <span className="min-w-0"><span className="block text-[14px] font-semibold leading-tight">{v.label}</span><span className={`block truncate text-[11.5px] ${on ? 'opacity-85' : 'text-v-subtle'}`}>{v.question}</span></span>
            </Link>
          )
        })}
      </nav>

      <PerformanceScope levels={d.structure.levels} courses={d.structure.courses} subjects={d.structure.subjects}
        selection={{ stage, gradeId: grade?.id, courseId: course?.id, subjectId: subject?.id }} />

      {trail.length > 1 && (
        <nav aria-label="Estás viendo" className="-mt-1 mb-4 flex flex-wrap items-center gap-1.5 px-1 text-xs">
          <span className="text-v-subtle">Estás viendo:</span>
          {trail.map((t, i) => (
            <span key={t.label} className="inline-flex items-center gap-1.5">
              {i > 0 && <ChevronRight size={12} className="text-v-subtle" />}
              {i === trail.length - 1 ? <span className="rounded-full bg-v-accent-soft px-2.5 py-1 font-semibold text-v-accent">{t.label}</span>
                : <Link href={t.href} scroll={false} className="rounded-full px-2 py-1 font-semibold text-v-muted hover:bg-v-fill hover:text-v-accent">{t.label}</Link>}
            </span>
          ))}
        </nav>
      )}

      {d.view === 'asignaturas' ? <SubjectsView d={d} sp={sp} />
        : d.view === 'evaluaciones' ? <EvaluationsView d={d} sp={sp} />
        : d.view === 'alumnado' ? <StudentsView d={d} sp={sp} />
        : d.view === 'docentes' ? <TeachersView d={d} sp={sp} />
        : <GeneralView d={d} sp={sp} />}
    </>
  )
}
