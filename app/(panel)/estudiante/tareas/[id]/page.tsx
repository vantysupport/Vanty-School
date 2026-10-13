import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, CalendarClock, CheckCircle2, ClipboardList, Download, FileCheck2, FileText, Lock, MessageSquareText, Paperclip, Send, Star } from 'lucide-react'
import { requireSession } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { loadStudentAcademics, TASK_STATE } from '@/lib/data/student'
import { submitAssignment } from '@/lib/actions/support'
import { fmtDateTime, fmtScore, scoreTone } from '@/lib/format'
import { fileHref } from '@/components/shared/resources'
import { fmtWeight, isEvaluation, KIND_LABEL } from '@/lib/assessments'
import { subjectCover } from '@/lib/subject-colors'
import { Card, CardBody, CardHeader, Field, Textarea } from '@/components/ui/primitives'
import { InlineForm, SubmitButton } from '@/components/ui/dialog'
import { FileField } from '@/components/ui/file-field'
import { Reveal } from '@/components/ui/motion'
import { usesSimpleMode } from '@/lib/student-mode'

const SCORE_TEXT: Record<string, string> = { success: 'text-v-success', warning: 'text-[#a16207]', danger: 'text-v-danger', neutral: 'text-v-text' }

export default async function StudentTask({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession('estudiante')
  const { id } = await params
  const db = await createClient()
  const data = await loadStudentAcademics(db, session.institutionId, session.userId)
  const simple = await usesSimpleMode(db, session)   // cursos chicos: sin porcentajes y con palabras más simples
  const task = data.tasks.find(t => t.id === id)
  if (!task) notFound()
  const evaluation = isEvaluation(task.kind)
  const canSubmit = !evaluation && task.status === 'published' && !task.grade
  const late = task.submission && new Date(task.submission.submittedAt) > new Date(task.dueAt)
  // En qué paso va: una prueba no tiene entrega, solo se rinde y se califica.
  const steps = evaluation ? (simple ? ['Viene pronto', 'Ya la hice', 'Tengo mi nota'] : ['Agendada', 'Rendida', 'Con nota']) : simple ? ['Por hacer', 'Ya la entregué', 'Tengo mi nota'] : ['Por hacer', 'Entregada', 'Con nota']
  const step = task.grade ? 2 : (evaluation ? task.state === 'awaiting' : !!task.submission) ? 1 : 0

  return (
    <>
      <Link href="/estudiante/tareas" className="mb-3 inline-flex items-center gap-1 text-[12.5px] font-medium text-v-muted hover:text-v-accent"><ArrowLeft size={14} />{simple ? 'Mis tareas' : 'Tareas y pruebas'}</Link>

      <Reveal className="relative mb-4 overflow-hidden rounded-v-lg text-white shadow-v">
        <div className="relative p-6 sm:p-7" style={{ background: subjectCover(task.subjectId) }}>
          <span aria-hidden className="pointer-events-none absolute -right-12 -top-20 size-64 rounded-full bg-white/15" />
          <span aria-hidden className="pointer-events-none absolute -bottom-24 right-40 size-56 rounded-full bg-white/10" />
          <div className="relative flex flex-wrap items-end justify-between gap-5">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-[12px] font-semibold text-white/90">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-0.5">{evaluation ? <FileCheck2 size={12} /> : <ClipboardList size={12} />}{evaluation ? KIND_LABEL[task.kind] : 'Tarea'}</span>
                <span>{task.subjectName}</span>
                {task.topic && <span className="rounded-full bg-white/20 px-2.5 py-0.5">{task.topic}</span>}
                {task.weight != null && !simple && <span className="rounded-full bg-white px-2.5 py-0.5 text-[#0b3b8f]">Vale el {fmtWeight(task.weight)} de tu promedio</span>}
              </p>
              <h1 className="v-display mt-2 text-[1.8rem] font-bold leading-tight tracking-tight sm:text-[2.1rem]">{task.title}</h1>
              <p className="mt-1.5 inline-flex items-center gap-1.5 text-[14px] text-white/90"><CalendarClock size={15} />{evaluation ? 'Se rinde el' : 'Se entrega hasta el'} {fmtDateTime(task.dueAt)}</p>
            </div>
            {task.grade
              ? <div className="rounded-2xl bg-white px-5 py-3 text-center shadow-v"><p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-v-subtle">Tu nota</p><p className={`v-display text-4xl font-bold leading-none ${SCORE_TEXT[scoreTone(task.grade.score)]}`}>{fmtScore(task.grade.score)}</p></div>
              : <span className="rounded-full bg-white/20 px-4 py-2 text-[13px] font-semibold">{simple && task.state === 'late' ? 'Todavía puedes entregarla' : TASK_STATE[task.state].label}</span>}
          </div>
        </div>
        <ol className="flex items-center border-x border-b border-v-border bg-v-elevated px-5 py-4 text-v-text" aria-label={`Estado: ${steps[step]}`}>
          {steps.map((label, n) => (
            <li key={label} className={`flex items-center ${n < steps.length - 1 ? 'flex-1' : ''}`}>
              <span className="flex items-center gap-2">
                <span className={`grid size-7 shrink-0 place-items-center rounded-full text-[12px] font-bold ${n <= step ? 'v-brand' : 'bg-v-fill text-v-subtle'}`}>{n < step || (n === step && step === 2) ? <CheckCircle2 size={15} /> : n + 1}</span>
                <span className={`text-[13px] ${n === step ? 'font-semibold text-v-text' : 'text-v-subtle'}`}>{label}</span>
              </span>
              {n < steps.length - 1 && <span className={`mx-3 h-0.5 flex-1 rounded-full ${n < step ? 'bg-v-accent' : 'bg-v-fill'}`} />}
            </li>
          ))}
        </ol>
      </Reveal>

      <div className="grid items-start gap-4 lg:grid-cols-[1.15fr_1fr]">
        <Card index={2}>
          <CardHeader icon={<FileText size={15} />} title={evaluation ? (simple ? 'Qué va a entrar en la prueba' : 'Qué entra y cómo prepararte') : 'Qué hay que hacer'} description="Lo que escribió tu profesor" />
          <CardBody>
            <p className="whitespace-pre-wrap text-[14.5px] leading-relaxed text-v-text">{task.description || (evaluation ? 'Tu profesor no agregó indicaciones escritas para esta evaluación.' : 'Tu profesor no agregó instrucciones escritas.')}</p>
            {task.attachmentPath && (
              <a href={fileHref('materials', task.attachmentPath)} target="_blank" rel="noreferrer" className="mt-4 inline-flex max-w-full items-center gap-3 rounded-v-sm border border-v-border p-3 pr-5 hover:border-v-accent">
                <span className="grid size-10 shrink-0 place-items-center rounded-[30%] bg-v-accent-soft text-v-accent"><Paperclip size={17} /></span>
                <span className="min-w-0"><span className="block truncate text-[13.5px] font-semibold text-v-text">{task.attachmentName}</span><span className="inline-flex items-center gap-1 text-xs text-v-muted"><Download size={11} />Descargar material</span></span>
              </a>
            )}
          </CardBody>
        </Card>

        <div className="space-y-4">
          {task.grade && (
            <Card index={3}>
              <CardHeader icon={<Star size={15} />} tone="success" title="Tu nota" description={`Calificada el ${fmtDateTime(task.grade.gradedAt)}`} />
              <CardBody>
                <div className="flex items-center gap-4">
                  <span className={`v-display grid size-16 shrink-0 place-items-center rounded-2xl bg-v-fill text-[1.6rem] font-bold ${SCORE_TEXT[scoreTone(task.grade.score)]}`}>{fmtScore(task.grade.score)}</span>
                  <p className="text-[13px] leading-relaxed text-v-muted">{simple ? 'Las notas van del 1 al 7.' : `Escala de 1,0 a 7,0; se aprueba con 4,0.${task.weight != null ? ` Esta nota vale el ${fmtWeight(task.weight)} de tu promedio en ${task.subjectName}.` : ''}`}</p>
                </div>
                <div className="mt-4 rounded-v-sm border-l-[3px] border-v-accent bg-v-accent-soft px-4 py-3">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-v-accent"><MessageSquareText size={13} />Lo que te dice tu profesor</p>
                  <p className="mt-1 whitespace-pre-wrap text-[14px] leading-relaxed text-v-text">{task.grade.feedback || 'No dejó un comentario escrito.'}</p>
                </div>
              </CardBody>
            </Card>
          )}

          {evaluation ? !task.grade && (
            <Card index={3}>
              <CardBody className="!pt-5">
                <p className="flex items-start gap-3 text-[14px] leading-relaxed text-v-text"><span className="grid size-10 shrink-0 place-items-center rounded-[30%] bg-v-accent-soft text-v-accent"><FileCheck2 size={18} /></span>
                  <span><span className="block font-semibold">Se rinde en clases</span><span className="text-v-muted">No tienes que subir nada aquí. Cuando tu profesor registre la nota, la verás en esta pantalla.</span></span></p>
              </CardBody>
            </Card>
          ) : (
            <Card index={4}>
              <CardHeader icon={<Send size={15} />} title="Tu entrega" description={task.submission ? `Entregada el ${fmtDateTime(task.submission.submittedAt)}${late ? ' · fuera de plazo' : ''}` : 'Escribe tu respuesta o sube un archivo'} />
              <CardBody>
                {task.submission && (
                  <div className="mb-4 rounded-v-sm bg-v-success/10 px-4 py-3">
                    <p className="flex items-center gap-1.5 text-[13.5px] font-semibold text-[#157a4b]"><CheckCircle2 size={16} />Tu entrega está registrada</p>
                    {!canSubmit && task.submission.content && <p className="mt-2 whitespace-pre-wrap text-[13.5px] leading-relaxed text-v-text">{task.submission.content}</p>}
                    {task.submission.filePath && <a href={fileHref('submissions', task.submission.filePath)} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-semibold text-v-accent hover:underline"><Download size={13} />{task.submission.fileName}</a>}
                  </div>
                )}
                {canSubmit ? (
                  <InlineForm action={submitAssignment.bind(null, id)} resetOnSuccess={false} className="space-y-3.5">
                    <Field label={task.submission ? 'Cambiar tu respuesta' : 'Tu respuesta'}>
                      <Textarea name="content" rows={7} maxLength={10000} defaultValue={task.submission?.content ?? ''} placeholder="Escribe aquí tu respuesta…" />
                    </Field>
                    <FileField bucket="submissions" prefix={`${session.institutionId}/${id}/${session.userId}`} label="Archivo (opcional)" />
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-xs text-v-subtle">Puedes cambiar tu entrega hasta que te pongan nota.</p>
                      <SubmitButton><Send size={15} />{task.submission ? 'Actualizar entrega' : 'Entregar tarea'}</SubmitButton>
                    </div>
                  </InlineForm>
                ) : !task.submission ? (
                  <p className="flex items-start gap-2.5 rounded-v-sm bg-v-warning/10 px-4 py-3 text-[13.5px] leading-relaxed text-v-text"><Lock size={16} className="mt-0.5 shrink-0 text-[#b45309]" />{task.grade ? 'Tu profesor te puso nota sin entrega en la plataforma (por ejemplo, un trabajo en papel).' : 'Esta tarea está cerrada y ya no recibe entregas. Si necesitas entregarla, conversa con tu profesor.'}</p>
                ) : (
                  <p className="text-[12.5px] text-v-subtle">Tu entrega ya tiene nota y no se puede cambiar.</p>
                )}
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </>
  )
}
