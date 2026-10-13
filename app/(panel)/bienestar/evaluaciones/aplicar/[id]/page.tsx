import { notFound } from 'next/navigation'
import { requireSession } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { nameMap } from '@/lib/data/people'
import { saveResponse } from '@/lib/actions/wellbeing'
import { ApplyForm, type ApplyQuestion } from '@/components/wellbeing/apply-form'

export default async function ApplyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ caso?: string }> }) {
  const session = await requireSession('bienestar')
  const { id } = await params
  const sp = await searchParams
  const db = await createClient()
  const inst = session.institutionId
  const [{ data: tpl }, { data: cases }] = await Promise.all([
    db.from('assessment_templates').select('id, title, description, questions, scoring_rule, status, reading_guide').eq('id', id).eq('institution_id', inst).maybeSingle(),
    db.from('wellbeing_cases').select('id, student_id').eq('institution_id', inst).neq('status', 'closed'),
  ])
  if (!tpl) notFound()
  const studentIds = (cases ?? []).map(c => c.student_id as string)
  const [names, { data: enrollments }] = await Promise.all([
    nameMap(db, studentIds),
    studentIds.length ? db.from('course_enrollments').select('student_id, courses(name)').in('student_id', studentIds).eq('status', 'active') : Promise.resolve({ data: [] }),
  ])
  const courseOf = new Map(((enrollments ?? []) as unknown as { student_id: string; courses: { name: string } | null }[]).map(e => [e.student_id, e.courses?.name ?? null]))
  const list = (cases ?? []).map(c => ({ id: c.id as string, studentId: c.student_id as string, student: names.get(c.student_id as string) ?? 'Estudiante', course: courseOf.get(c.student_id as string) ?? null }))
    .sort((a, b) => a.student.localeCompare(b.student, 'es'))
  const preview = tpl.status === 'draft' ? 'Este instrumento es un borrador: actívalo desde la biblioteca para poder aplicarlo.'
    : tpl.status === 'archived' ? 'Este instrumento está archivado y ya no se aplica.' : undefined

  return <ApplyForm action={saveResponse.bind(null, id)} backHref="/bienestar/evaluaciones" backLabel="Evaluaciones" doneHref="/bienestar/evaluaciones?tab=historial" title={tpl.title as string} description={tpl.description as string} questions={tpl.questions as ApplyQuestion[]}
    cases={list} guide={(tpl.reading_guide as string) || undefined} initialCase={sp.caso} preview={preview} ruleNote={(tpl.scoring_rule as { note?: string }).note || undefined} />
}
