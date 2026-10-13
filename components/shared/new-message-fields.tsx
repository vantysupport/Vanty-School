'use client'
import { useState } from 'react'
import { Field, Input, Select, Textarea } from '@/components/ui/primitives'

export type MessageTarget = { studentId: string; studentName: string; recipients: { id: string; label: string }[] }

/** Campos de un mensaje nuevo: los destinatarios disponibles dependen del estudiante elegido. */
export function NewMessageFields({ targets, studentLabel, allowMeeting }: { targets: MessageTarget[]; studentLabel: string; allowMeeting?: boolean }) {
  const [studentId, setStudentId] = useState(targets[0]?.studentId ?? '')
  const recipients = targets.find(t => t.studentId === studentId)?.recipients ?? []
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        {targets.length === 1 ? (
          <Field label={studentLabel}><input type="hidden" name="student_id" value={studentId} /><p className="v-input flex items-center bg-v-fill/60 text-v-text">{targets[0].studentName}</p></Field>
        ) : (
          <Field label={studentLabel}>
            <Select name="student_id" value={studentId} onChange={e => setStudentId(e.target.value)} required>
              {targets.map(t => <option key={t.studentId} value={t.studentId}>{t.studentName}</option>)}
            </Select>
          </Field>
        )}
        <Field label="Para">
          <Select name="recipient_id" required key={studentId} defaultValue="">
            <option value="" disabled>{recipients.length ? 'Selecciona…' : 'Sin destinatarios disponibles'}</option>
            {recipients.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
          </Select>
        </Field>
      </div>
      {allowMeeting && (
        <Field label="Tipo">
          <Select name="kind" defaultValue="message">
            <option value="message">Mensaje</option>
            <option value="meeting_request">Solicitud de reunión</option>
          </Select>
        </Field>
      )}
      <Field label="Asunto"><Input name="subject" required minLength={3} maxLength={160} /></Field>
      <Field label="Mensaje"><Textarea name="body" required rows={5} maxLength={4000} /></Field>
    </>
  )
}
