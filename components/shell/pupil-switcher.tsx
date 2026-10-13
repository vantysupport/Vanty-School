import { selectPupil } from '@/lib/actions/support'
import { firstName } from '@/lib/format'
import { Avatar } from '@/components/ui/primitives'

/** Selector del estudiante que el apoderado está viendo. Va en la barra superior de todo su panel:
 *  al cambiarlo, Inicio, Seguimiento, Mensajes, Acompañamiento y ARIA quedan enfocados en ese estudiante. */
export function PupilSwitcher({ pupils, activeId, alerts = {} }: { pupils: { id: string; name: string }[]; activeId: string; alerts?: Record<string, number> }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="hidden shrink-0 text-[11.5px] font-semibold text-v-subtle lg:inline">Viendo a</span>
      <div role="group" aria-label="Estudiante que estás viendo" className="flex min-w-0 gap-1 overflow-x-auto rounded-full bg-v-fill p-1">
        {pupils.map(p => {
          const on = p.id === activeId
          return (
            <form key={p.id} action={selectPupil.bind(null, p.id)}>
              <button type="submit" aria-pressed={on} title={alerts[p.id] ? `${p.name} · ${alerts[p.id]} ${alerts[p.id] === 1 ? 'novedad' : 'novedades'}` : p.name}
                className={`flex items-center gap-2 whitespace-nowrap rounded-full py-1 pl-1 pr-3 text-[13px] font-semibold transition-all ${on ? 'bg-v-elevated text-v-accent shadow-v' : 'text-v-muted hover:text-v-text'}`}>
                <span className="relative"><Avatar name={p.name} id={p.id} size={26} />{alerts[p.id] > 0 && <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-v-danger px-1 text-[10px] font-bold leading-none text-white ring-2 ring-v-elevated">{alerts[p.id]}</span>}</span><span className={on ? '' : 'hidden sm:inline'}>{firstName(p.name)}</span>
              </button>
            </form>
          )
        })}
      </div>
    </div>
  )
}
