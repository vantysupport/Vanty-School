import { Field, Input, Select } from '@/components/ui/primitives'
import { BRAND_COLORS, DEFAULT_COLOR, DEPENDENCIES, REGIONS } from '@/lib/platform'

/** Datos de identificación de un colegio. Se usan al crearlo y al editarlo. */
export function SchoolFields({ school }: { school?: { name: string; rbd: string | null; dependency: string; commune: string | null; region: string | null; brand_color?: string | null; address?: string | null; phone?: string | null } }) {
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
        <Field label="Dirección"><Input name="address" maxLength={160} defaultValue={school?.address ?? ''} placeholder="Ej.: Av. Los Pajaritos 1234" /></Field>
        <Field label="Teléfono"><Input name="phone" type="tel" maxLength={40} defaultValue={school?.phone ?? ''} placeholder="Ej.: +56 2 2345 6789" /></Field>
      </div>
      <fieldset>
        <legend className="mb-2 text-[12.5px] font-medium text-v-text">Color del colegio</legend>
        <div className="flex flex-wrap gap-2">
          {BRAND_COLORS.map(c => (
            <label key={c.value} title={c.label} className="cursor-pointer">
              <input type="radio" name="brand_color" value={c.value} defaultChecked={(school?.brand_color ?? DEFAULT_COLOR).toLowerCase() === c.value} className="peer sr-only" />
              <span className="block size-9 rounded-full ring-offset-2 ring-offset-v-elevated peer-checked:ring-2 peer-checked:ring-v-text peer-focus-visible:ring-2 peer-focus-visible:ring-v-accent" style={{ background: c.value }}><span className="sr-only">{c.label}</span></span>
            </label>
          ))}
        </div>
      </fieldset>
    </>
  )
}
