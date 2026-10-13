'use client'
import { useState } from 'react'
import { ROLE_LABEL, ROLES, type Role } from '@/lib/roles'
import { Field, Input, Notice, Select } from '@/components/ui/primitives'

type Option = { id: string; label: string }

/** Campos del formulario de invitación; cambian según el rol elegido. */
export function InviteFields({ courses, students }: { courses: Option[]; students: Option[] }) {
  const [role, setRole] = useState<Role>('docente')
  return (
    <>
      <Field label="Nombre completo"><Input name="full_name" required minLength={3} maxLength={160} autoComplete="off" /></Field>
      <Field label="Correo electrónico" hint={role === 'estudiante' ? 'Correo institucional del estudiante.' : undefined}>
        <Input name="email" type="email" required autoComplete="off" />
      </Field>
      <Field label="Rol">
        <Select name="role" value={role} onChange={e => setRole(e.target.value as Role)}>
          {ROLES.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </Select>
      </Field>

      {role === 'estudiante' && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Curso" hint="Opcional: se matricula al aceptar.">
              <Select name="course_id" defaultValue="">
                <option value="">Sin matrícula por ahora</option>
                {courses.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </Select>
            </Field>
            <Field label="Fecha de nacimiento"><Input name="birth_date" type="date" /></Field>
          </div>
          <Notice>Las cuentas de estudiantes son gestionadas por el colegio. Para menores de edad, entrega el enlace a su apoderado para una activación supervisada.</Notice>
        </>
      )}

      {role === 'apoderado' && (
        <>
          <Field label="Estudiantes a su cargo" hint="Mantén presionado Ctrl (o Cmd) para elegir más de uno.">
            <select name="student_ids[]" multiple required size={Math.min(6, Math.max(3, students.length))} className="v-input">
              {students.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </Field>
          <Field label="Parentesco"><Input name="relationship" placeholder="madre, padre, tutor legal…" maxLength={40} /></Field>
        </>
      )}

      {role === 'bienestar' && <Notice>Este perfil accede a información sensible de bienestar. Asígnalo solo a profesionales autorizados por el colegio.</Notice>}
      {role === 'admin' && <Notice tone="warning">Secretaría puede gestionar todas las cuentas del colegio.</Notice>}
    </>
  )
}
