import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import { ToastProvider } from '@/components/ui/toast'
import './globals.css'

// Mismo sistema de dos tipografías que VANTY ABA: Plus Jakarta Sans para el cuerpo y Poppins para
// títulos, cifras y negritas. El contraste entre ambas es lo que da presencia a la interfaz.
// next/font exige literales: por eso la lista de respaldo se repite.
const jakarta = localFont({
  src: [
    { path: './fonts/jakarta-400.woff2', weight: '400', style: 'normal' },
    { path: './fonts/jakarta-500.woff2', weight: '500', style: 'normal' },
    { path: './fonts/jakarta-600.woff2', weight: '600', style: 'normal' },
    { path: './fonts/jakarta-700.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-jakarta', display: 'swap', fallback: ['system-ui', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
})
const poppins = localFont({
  src: [
    { path: './fonts/poppins-500.woff2', weight: '500', style: 'normal' },
    { path: './fonts/poppins-600.woff2', weight: '600', style: 'normal' },
    { path: './fonts/poppins-700.woff2', weight: '700', style: 'normal' },
    { path: './fonts/poppins-800.woff2', weight: '800', style: 'normal' },
  ],
  variable: '--font-poppins', display: 'swap', fallback: ['system-ui', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
})

export const viewport: Viewport = { themeColor: '#0069db', width: 'device-width', initialScale: 1 }

export const metadata: Metadata = {
  title: { default: 'Vanty School', template: '%s · Vanty School' },
  description: 'Plataforma de inteligencia educativa que conecta a toda la comunidad escolar.',
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-CL" className={`${jakarta.variable} ${poppins.variable}`}>
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  )
}
