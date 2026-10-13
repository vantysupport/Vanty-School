import { PageTransition } from '@/components/ui/motion'

// Un template se vuelve a montar en cada navegación: cada página entra con una transición suave.
export default function PanelTemplate({ children }: { children: React.ReactNode }) {
  return <PageTransition>{children}</PageTransition>
}
