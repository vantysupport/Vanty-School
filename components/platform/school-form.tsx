import { Field, Input, Select } from '@/components/ui/primitives'
import { DEPENDENCIES, REGIONS } from '@/lib/platform'

/** Datos de identificación de un colegio. Se usan al crearlo y al editarlo. */
export function SchoolFields({ school }: { school?: { name: string; rbd: string | null; dependency: string; commune: string | null; region: string | null } }) {
  return (
    <>
      <Field label="Nombre del colegio"><Input name="name" required minLength={2} maxLength={160} defaultValue={school?.name} placeholder="Ej.: Colegio Los Aromos" /></Field>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <Field label="RBD" hint="Opcional. Rol Base de Datos del Mineduc."><Input name="rbd" maxLength={20} defaultValue={school?.rbd ?? ''} placeholder="Ej.: 12345-6" /></Field>
        <Field label="Dependencia">
          <Select name="dependency" required defaultValue={school?.dependency ?? 'particular_subvencionado'}>
            {Object.entries(DEPENDENCIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <Field label="Comuna"><Input name="commune" maxLength={80} defaultValue={school?.commune ?? ''} placeholder="Ej.: Maipú" /></Field>
        <Field label="Región">
          <Select name="region" defaultValue={school?.region ?? ''}>
            <option value="">Sin indicar</option>
            {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
          </Select>
        </Field>
      </div>
    </>
  )
}
