'use client'

/** <select> que envía el formulario que lo contiene apenas cambia su valor. */
export function AutoSelect({ name, value, label, options, placeholder = 'Sin asignar' }: {
  name: string; value: string; label: string; options: { value: string; label: string }[]; placeholder?: string
}) {
  return (
    <select name={name} defaultValue={value} aria-label={label} required
      onChange={e => e.currentTarget.value && e.currentTarget.form?.requestSubmit()} className="v-input min-w-[150px] !py-1.5 !text-[12.5px]">
      <option value="" disabled>{placeholder}</option>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}
