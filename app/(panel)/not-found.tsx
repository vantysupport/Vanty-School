import { LinkButton } from '@/components/ui/primitives'

/** «No encontrado» dentro del panel: conserva el menú y ofrece volver, en vez de una página en blanco. */
export default function PanelNotFound() {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/aria/pose-6.webp" alt="" className="mb-4 h-28 w-auto" />
      <h1 className="text-[16px] font-medium text-v-text">No encontramos esta página</h1>
      <p className="mt-1 max-w-sm text-[13px] text-v-muted">Puede que ya no exista o que no tengas acceso a ella.</p>
      <LinkButton href="/" className="mt-4">Volver al inicio</LinkButton>
    </div>
  )
}
