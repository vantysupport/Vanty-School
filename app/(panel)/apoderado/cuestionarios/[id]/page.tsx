import { notFound } from 'next/navigation'
import { requireSession } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { nameMap } from '@/lib/data/people'
import { answerQuestionnaire } from '@/lib/actions/support'
import { firstName } from '@/lib/format'
import { ApplyForm, type ApplyQuestion } from '@/components/wellbeing/apply-form'

// El apoderado responde un cuestionario que le envió el equipo de bienestar.
// Solo lee su propio envío (RLS): las preguntas, sin guía de lectura, revisión profesional ni notas de ARIA.
export default async function GuardianQuestionnaire({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession('apoderado')
  const { id } = await params
  const db = await createClient()
  const { data: request } = await db.from('assessment_requests').select('id, title, intro, questions, status, student_id')
    .eq('id', id).eq('institution_id', session.institutionId).eq('guardian_id', session.userId).maybeSingle()
  if (!request) notFound()
  const names = await nameMap(db, [request.student_id as string])
  const student = firstName(names.get(request.student_id as string) ?? '')
  const preview = request.status === 'answered' ? 'Ya respondiste este cuestionario. Gracias: el equipo de bienestar lo está revisando.'
    : request.status === 'cancelled' ? 'El colegio retiró este cuestionario; ya no es necesario responderlo.' : undefined

  return <ApplyForm family action={answerQuestionnaire.bind(null, id)} backHref="/apoderado/acompanamiento" backLabel="Acompañamiento" doneHref="/apoderado/acompanamiento"
    submitLabel="Enviar mis respuestas" title={request.title as string} preview={preview}
    description={`${student ? `Sobre ${student}. ` : ''}${request.intro as string} Tus respuestas las lee solo el equipo de bienestar del colegio.`}
    questions={request.questions as ApplyQuestion[]} />
}
