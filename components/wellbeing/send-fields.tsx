'use client'
import { useState } from 'react'
import { Field, Select } from '@/components/ui/primitives'

export type SendTarget = { studentId: string; studentName: string; guardians: { id: string; label: string }[] }

/** Campos para enviar un cuestionario: el estudiante (con caso activo) y cuál de sus apoderados lo responde. */
export function SendFields({ targets, initialStudent }: { targets: SendTarget[]; initialStudent?: string }) {
  const [studentId, setStudentId] = useState(targets.some(t => t.studentId === initialStudent) ? initialStudent! : targets[0]?.studentId ?? '')
  const guardians = targets.find(t => t.studentId === studentId)?.guardians ?? []
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Estudiante" hint="Solo quienes tienen un caso activo.">
        <Select name="student_id" value={studentId} onChange={e => setStudentId(e.target.value)} required>
          {targets.map(t => <option key={t.studentId} value={t.studentId}>{t.studentName}</option>)}
        </Select>
      </Field>
      <Field label="Lo responde" hint={guardians.length ? undefined : 'Este estudiante no tiene apoderado registrado.'}>
        <Select name="recipient_id" required key={studentId} defaultValue={guardians.length === 1 ? guardians[0].id : ''}>
          <option value="" disabled>{guardians.length ? 'Selecciona…' : 'Sin apoderados'}</option>
          {guardians.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
        </Select>
      </Field>
    </div>
  )
}
