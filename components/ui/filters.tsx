'use client'
import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ChevronLeft, ChevronRight, Loader2, Search } from 'lucide-react'

function useParamSetter() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [pending, start] = useTransition()
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString())
    if (value) next.set(key, value)
    else next.delete(key)
    if (key !== 'p') next.delete('p')
    start(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }))
  }
  return { set, params, pending }
}

/** Búsqueda que vive en la URL (?q=): sobrevive a recargas y se puede compartir. */
export function SearchBox({ placeholder = 'Buscar…', param = 'q' }: { placeholder?: string; param?: string }) {
  const { set, params, pending } = useParamSetter()
  const current = params.get(param) ?? ''
  const [value, setValue] = useState(current)

  useEffect(() => {
    if (value === current) return
    const t = setTimeout(() => set(param, value.trim()), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return (
    <div className="relative w-full sm:w-64">
      {pending
        ? <Loader2 size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 animate-spin text-v-subtle" />
        : <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-v-subtle" />}
      <input type="search" value={value} onChange={e => setValue(e.target.value)} placeholder={placeholder}
        aria-label={placeholder} className="v-input !pl-8" />
    </div>
  )
}

export function FilterSelect({ param, label, options }: { param: string; label: string; options: { value: string; label: string }[] }) {
  const { set, params } = useParamSetter()
  return (
    <select aria-label={label} value={params.get(param) ?? ''} onChange={e => set(param, e.target.value)} className="v-input !w-auto">
      <option value="">{label}</option>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

export function Pagination({ page, pageSize, total }: { page: number; pageSize: number; total: number }) {
  const pathname = usePathname()
  const params = useSearchParams()
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (pages <= 1) return null
  const href = (p: number) => {
    const next = new URLSearchParams(params.toString())
    next.set('p', String(p))
    return `${pathname}?${next.toString()}`
  }
  const link = 'grid size-8 place-items-center rounded-v-sm border border-v-border-strong text-v-muted hover:bg-v-fill aria-disabled:pointer-events-none aria-disabled:opacity-40'
  return (
    <div className="flex items-center justify-between px-4 py-3 text-[12.5px] text-v-muted">
      <span>Página {page} de {pages} · {total} en total</span>
      <div className="flex gap-1.5">
        <Link href={href(page - 1)} aria-disabled={page <= 1} aria-label="Página anterior" className={link}><ChevronLeft size={15} /></Link>
        <Link href={href(page + 1)} aria-disabled={page >= pages} aria-label="Página siguiente" className={link}><ChevronRight size={15} /></Link>
      </div>
    </div>
  )
}

/** Pestañas que viven en la URL (?tab=). */
export function Tabs({ tabs, param = 'tab' }: { tabs: { id: string; label: string; count?: number }[]; param?: string }) {
  const pathname = usePathname()
  const params = useSearchParams()
  const active = params.get(param) ?? tabs[0]?.id
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto border-b border-v-border" role="tablist">
      {tabs.map(t => {
        const next = new URLSearchParams()
        next.set(param, t.id)
        const on = active === t.id
        return (
          <Link key={t.id} href={`${pathname}?${next.toString()}`} role="tab" aria-selected={on} scroll={false}
            className={`-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-[13px] transition-colors ${on ? 'border-v-accent font-medium text-v-accent' : 'border-transparent text-v-muted hover:text-v-text'}`}>
            {t.label}
            {t.count != null && <span className="rounded-full bg-v-fill px-1.5 text-[11px] text-v-muted">{t.count}</span>}
          </Link>
        )
      })}
    </div>
  )
}
