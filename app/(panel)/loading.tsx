import { Skeleton } from '@/components/ui/primitives'

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Cargando">
      <Skeleton className="mb-2 h-6 w-48" />
      <Skeleton className="mb-6 h-4 w-80 max-w-full" />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-[92px]" />)}
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  )
}
