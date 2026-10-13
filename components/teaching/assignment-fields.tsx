import { Field, Input, Select, Textarea } from '@/components/ui/primitives'
import { FileField } from '@/components/ui/file-field'

export type TeachingOption = { value: string; label: string }

/** Campos para crear o corregir una tarea. Al crear se elige curso y asignatura (o viene fijado) y si se publica ahora. */
export function AssignmentFields({ institutionId, targets, target, defaults, dueDefault, editing }: {
  institutionId: string
  targets?: TeachingOption[]          // cursos y asignaturas del docente (solo al crear)
  target?: string                     // preselección «curso:asignatura»
  defaults?: { title?: string; description?: string; topic?: string | null; attachmentName?: string | null; weight?: number | string | null }
  dueDefault: string                  // valor para datetime-local, en hora de Chile
  editing?: boolean
}) {
  return (
    <>
      {targets && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Tipo" hint="Las tareas se entregan en la plataforma; las evaluaciones solo llevan nota.">
            <Select name="kind" defaultValue="tarea">
              <option value="tarea">Tarea (con entrega)</option>
              <optgroup label="Evaluación en clases">
                <option value="prueba">Prueba</option><option value="examen">Examen</option><option value="control">Control</option>
                <option value="exposicion">Exposición</option><option value="otra">Otra evaluación</option>
              </optgroup>
            </Select>
          </Field>
          <Field label="Asignatura">
            <Select name="target" required defaultValue={target ?? ''}>
              <option value="" disabled>Selecciona…</option>
              {targets.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
          </Field>
        </div>
      )}
      <Field label="Título"><Input name="title" required minLength={3} maxLength={160} defaultValue={defaults?.title ?? ''} placeholder="Guía de fracciones equivalentes" /></Field>
      <Field label="Instrucciones" hint="Qué hay que hacer o estudiar, y qué se va a evaluar.">
        <Textarea name="description" rows={5} maxLength={5000} defaultValue={defaults?.description ?? ''} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Contenido o unidad" hint="Agrupa los resultados."><Input name="topic" maxLength={80} defaultValue={defaults?.topic ?? ''} placeholder="Fracciones" /></Field>
        <Field label="Fecha" hint="Límite de entrega o día de la evaluación."><Input name="due_at" type="datetime-local" required defaultValue={dueDefault} /></Field>
        <Field label="Peso en el promedio (%)" hint="Opcional. Ej.: 30 si vale el 30 % de la asignatura. Vacío: se promedia en partes iguales.">
          <Input name="weight" inputMode="decimal" maxLength={6} pattern="[0-9]{1,3}([.,][0-9]{1,2})?" defaultValue={defaults?.weight != null ? String(defaults.weight).replace('.', ',') : ''} placeholder="Sin porcentaje" />
        </Field>
        {!editing && (
          <Field label="Al guardar">
            <Select name="status" defaultValue="published"><option value="published">Publicar ahora</option><option value="draft">Dejar como borrador</option></Select>
          </Field>
        )}
      </div>
      <FileField bucket="materials" prefix={institutionId} label={defaults?.attachmentName ? `Reemplazar el archivo adjunto (actual: ${defaults.attachmentName})` : 'Archivo adjunto (opcional)'} />
      {editing && defaults?.attachmentName && <label className="flex items-center gap-2 text-[13px] text-v-muted"><input type="checkbox" name="remove_file" className="size-4 accent-[var(--v-accent)]" />Quitar el archivo adjunto actual</label>}
    </>
  )
}
