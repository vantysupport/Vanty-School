import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Las páginas son Server Components asíncronos: se ejecutan una vez por petición, así que leer la hora
    // actual durante el render es correcto. La regla está pensada para componentes de cliente.
    files: ['app/**/page.tsx', 'components/shared/**/*.tsx'],
    rules: { 'react-hooks/purity': 'off' },
  },
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts']),
])
