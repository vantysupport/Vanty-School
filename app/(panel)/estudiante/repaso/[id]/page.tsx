import { notFound } from 'next/navigation'
import { requireSession } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { subjectCover } from '@/lib/subject-colors'
import { MissionPlayer, type PlayerItem } from '@/components/review/mission-player'
import { usesSimpleMode } from '@/lib/student-mode'

export default async function MissionPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession('estudiante')
  const { id } = await params
  const db = await createClient()
  // RLS: la misión solo existe para el estudiante si está publicada y es de su curso. Las respuestas correctas no se consultan aquí.
  const { data: mission } = await db.from('review_missions').select('id, title, subject_id, student_id, subjects(name)').eq('id', id).eq('institution_id', session.institutionId).eq('status', 'published').maybeSingle()
  if (!mission) notFound()
  const [{ data: items }, { data: progress }] = await Promise.all([
    db.from('review_items').select('id, kind, prompt, youtube_id, options, body').eq('mission_id', id).order('position').order('created_at'),
    db.from('review_progress').select('item_id, done, first_try').eq('mission_id', id).eq('student_id', session.userId),
  ])
  const state = new Map((progress ?? []).map(p => [p.item_id as string, p]))
  const list: PlayerItem[] = (items ?? []).map(i => ({
    id: i.id as string, kind: i.kind as PlayerItem['kind'], prompt: i.prompt as string, body: i.body as string | null, youtubeId: i.youtube_id as string | null, options: i.options as string[] | null,
    done: !!state.get(i.id as string)?.done, firstTry: !!state.get(i.id as string)?.first_try,
  }))
  if (list.length === 0) notFound()

  return <MissionPlayer title={mission.title as string} subject={(mission as unknown as { subjects: { name: string } | null }).subjects?.name ?? 'Asignatura'}
    cover={subjectCover(mission.subject_id as string)} items={list} byAria={!!mission.student_id} simple={await usesSimpleMode(db, session)} />
}
