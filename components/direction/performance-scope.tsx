'use client'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { BookOpen, GraduationCap, Layers, Loader2, RotateCcw, School, Search, X } from 'lucide-react'

type Level = { id: string; name: string; stage: string; sections: number }
type Course = { id: string; name: string; section: string; levelId: string }
type Option = { id: string; name: string }
type Patch = Record<string, string | undefined>

const STAGES: [string, string][] = [['parvularia', 'Parvularia'], ['basica', 'Básica'], ['media', 'Media']]
const plain = (text: string) => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Alcance del análisis: buscador con accesos directos a grados, secciones y asignaturas, más selectores en cascada. Todo vive en la URL. */
export function PerformanceScope({ levels, courses, subjects, selection }: {
  levels: Level[]; courses: Course[]; subjects: Option[]
  selection: { stage?: string; gradeId?: string; courseId?: string; subjectId?: string }
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [pending, start] = useTransition()
  const current = params.get('q') ?? ''
  const [text, setText] = useState(current)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const box = useRef<HTMLDivElement>(null)

  const go = (patch: Patch) => {
    const next = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(patch)) if (v) next.set(k, v); else next.delete(k)
    next.delete('p')
    const query = next.toString()
    start(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }))
  }

  // El texto filtra las listas de la vista (evaluaciones, estudiantes, docentes) con un leve retardo.
  useEffect(() => {
    if (text.trim() === current) return
    const t = setTimeout(() => go({ q: text.trim() || undefined }), 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text])

  useEffect(() => {
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const stageOf = (levelId: string) => levels.find(l => l.id === levelId)?.stage
  const suggestions = useMemo(() => {
    const needle = plain(text.trim())
    if (!needle) return []
    const hit = (name: string) => plain(name).includes(needle)
    return [
      ...courses.filter(c => hit(c.name)).map(c => ({ key: `c${c.id}`, kind: 'Sección', icon: School, name: c.name, patch: { curso: c.id, grado: c.levelId, nivel: stageOf(c.levelId) } as Patch })),
      ...levels.filter(l => hit(l.name)).map(l => ({ key: `g${l.id}`, kind: l.sections ? `Grado · ${l.sections} ${l.sections === 1 ? 'sección' : 'secciones'}` : 'Grado · sin secciones', icon: Layers, name: l.name, patch: { grado: l.id, nivel: l.stage, curso: undefined } as Patch })),
      ...STAGES.filter(([, name]) => hit(name)).map(([id, name]) => ({ key: `n${id}`, kind: 'Nivel de enseñanza', icon: GraduationCap, name, patch: { nivel: id, grado: undefined, curso: undefined } as Patch })),
      ...subjects.filter(s => hit(s.name)).map(s => ({ key: `s${s.id}`, kind: 'Asignatura', icon: BookOpen, name: s.name, patch: { asignatura: s.id } as Patch })),
    ].slice(0, 8)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, courses, levels, subjects])

  const pick = (patch: Patch) => { setText(''); setOpen(false); go({ ...patch, q: undefined }) }
  const sectionOptions = courses.filter(c => (selection.gradeId ? c.levelId === selection.gradeId : !selection.stage || stageOf(c.levelId) === selection.stage))
  const dirty = !!(selection.stage || selection.gradeId || selection.courseId || selection.subjectId || current)
  const select = 'v-input !h-10 !py-0 !pr-8 text-[13px] font-medium'
  const caption = 'mb-1 block px-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-v-subtle'

  return (
    <div className="mb-4 rounded-v border border-v-border bg-v-elevated p-3 shadow-v-xs">
      <div className="grid grid-cols-2 items-end gap-2.5 lg:grid-cols-[minmax(260px,1.6fr)_repeat(3,minmax(0,1fr))_auto]">
        <div ref={box} className="relative col-span-2 lg:col-span-1">
          <span className={caption}>Buscar o ir a</span>
          <div className="relative">
            {pending ? <Loader2 size={15} className="absolute left-3 top-1/2 -translate-y-1/2 animate-spin text-v-accent" /> : <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-v-subtle" />}
            <input type="text" role="combobox" aria-expanded={open && suggestions.length > 0} aria-controls="perf-suggestions" aria-label="Buscar grado, sección, asignatura, estudiante o docente"
              value={text} placeholder="Grado, sección, asignatura, estudiante, docente…" autoComplete="off"
              onChange={e => { setText(e.target.value); setOpen(true); setActive(0) }} onFocus={() => setOpen(true)}
              onKeyDown={e => {
                if (e.key === 'Escape') setOpen(false)
                else if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i + 1, suggestions.length - 1)) }
                else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(i - 1, 0)) }
                else if (e.key === 'Enter' && open && suggestions[active]) { e.preventDefault(); pick(suggestions[active].patch) }
              }}
              className="v-input !h-10 !py-0 !pl-9 !pr-9 text-[13.5px]" />
            {text && <button type="button" aria-label="Borrar búsqueda" onClick={() => { setText(''); go({ q: undefined }) }} className="absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-full text-v-subtle hover:bg-v-fill hover:text-v-text"><X size={13} /></button>}
          </div>
          {open && suggestions.length > 0 && (
            <ul id="perf-suggestions" role="listbox" className="absolute inset-x-0 top-full z-30 mt-1.5 overflow-hidden rounded-v-sm border border-v-border bg-v-elevated p-1 shadow-v">
              <li className="px-2.5 pb-1 pt-1.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-v-subtle">Ir directamente a</li>
              {suggestions.map((s, i) => (
                <li key={s.key} role="option" aria-selected={i === active}>
                  <button type="button" onMouseDown={e => { e.preventDefault(); pick(s.patch) }} onMouseEnter={() => setActive(i)}
                    className={`flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left ${i === active ? 'bg-v-accent-soft' : ''}`}>
                    <span className="grid size-7 shrink-0 place-items-center rounded-[30%] bg-v-fill text-v-accent"><s.icon size={14} /></span>
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-v-text">{s.name}</span>
                    <span className="shrink-0 text-[11px] text-v-subtle">{s.kind}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <label><span className={caption}>Grado</span>
          <select className={select} value={selection.gradeId ?? (selection.stage ? `n:${selection.stage}` : '')}
            onChange={e => { const v = e.target.value; go(v.startsWith('n:') ? { nivel: v.slice(2), grado: undefined, curso: undefined } : { grado: v || undefined, curso: undefined, nivel: v ? stageOf(v) : undefined }) }}>
            <option value="">Todo el colegio</option>
            {STAGES.map(([id, name]) => (
              <optgroup key={id} label={name}>
                <option value={`n:${id}`}>Toda {name.toLowerCase()}</option>
                {levels.filter(l => l.stage === id && l.sections > 0).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
        <label><span className={caption}>Sección</span>
          <select className={select} value={selection.courseId ?? ''} disabled={sectionOptions.length === 0}
            onChange={e => { const c = courses.find(x => x.id === e.target.value); go(c ? { curso: c.id, grado: c.levelId, nivel: stageOf(c.levelId) } : { curso: undefined }) }}>
            <option value="">{selection.gradeId ? 'Todas las secciones' : 'Todas'}</option>
            {sectionOptions.map(c => <option key={c.id} value={c.id}>{selection.gradeId ? `Sección ${c.section}` : c.name}</option>)}
          </select>
        </label>
        <label><span className={caption}>Asignatura</span>
          <select className={select} value={selection.subjectId ?? ''} onChange={e => go({ asignatura: e.target.value || undefined })}>
            <option value="">Todas</option>
            {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => { setText(''); go({ nivel: undefined, grado: undefined, curso: undefined, asignatura: undefined, q: undefined, estado: undefined }) }} disabled={!dirty}
          className="col-span-2 inline-flex h-10 items-center justify-center gap-1.5 rounded-full px-4 text-xs font-semibold text-v-muted hover:bg-v-fill hover:text-v-text disabled:opacity-40 lg:col-span-1">
          <RotateCcw size={13} />Quitar filtros
        </button>
      </div>
    </div>
  )
}
