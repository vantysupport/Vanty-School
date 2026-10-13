'use client'
import { Button } from '@/components/ui/primitives'

export default function PanelError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/aria/pose-6.webp" alt="" className="mb-4 h-28 w-auto" />
      <h1 className="text-[16px] font-medium text-v-text">No pudimos cargar esta sección</h1>
      <p className="mt-1 max-w-sm text-[13px] text-v-muted">Puede ser un problema momentáneo de conexión. Tus datos están guardados.</p>
      <Button className="mt-4" onClick={reset}>Reintentar</Button>
    </div>
  )
}
