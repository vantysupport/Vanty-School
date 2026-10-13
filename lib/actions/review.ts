'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { actionContext } from '@/lib/auth/session'
import { dbError, fail, NOT_ALLOWED, ok, parseForm, type ActionResult } from '@/lib/actions/result'
import { youtubeId } from '@/lib/youtube'
import { draftMission } from '@/lib/aria/review'
import { canCreateWithAria } from '@/lib/student-mode'

// «Repasemos»: misiones de repaso. Las arma el docente del curso y asignatura (RLS lo comprueba) y las
// resuelve el estudiante a través de la función review_answer, que es la única que conoce las respuestas.

const uuid = z.string().uuid('Identificador inválido.')
const refresh = () => { revalidatePath('/docente', 'layout'); revalidatePath('/estudiante', 'layout') }

export async function createMission(form: FormData): Promise<ActionResult> {
  const ctx = await actionContext('docente')
  if (!ctx) return NOT_ALLOWED
  const parsed = parseForm(z.object({
    target: z.string({ required_error: 'Elige la asignatura.' }).regex(/^[0-9a-f-]{36}:[0-9a-f-]{36}$/i, 'Elige la asignatura.'),
    title: z.string({ required_error: 'Ponle un nombre a la misión.' }).trim().min(3, 'El nombre es muy corto.').max(120),
    description: z.string().trim().max(600).optional(),
    topic: z.string().trim().max(80).optional(),
  }), form)
  if ('error' in parsed) return parsed.error
  const [courseId, subjectId] = parsed.data.target.split(':')
  const { error } = await ctx.db.from('review_missions').insert({
    institution_id: ctx.session.institutionId, course_id: courseId, subject_id: subjectId, teacher_id: ctx.session.userId,
    title: parsed.data.title, description: parsed.data.description ?? '', topic: parsed.data.topic ?? null,
  })
  if (error) return dbError(error)
  refresh()
  return ok('Misión creada como borrador. Ábrela para agregarle videos y preguntas.')
}

export async function setMissionStatus(id: string, status: 'draft' | 'published'): Promise<ActionResult> {
  const ctx = await actionContext('docente')
  if (!ctx) return NOT_ALLOWED
  if (status === 'published') {
    const { count } = await ctx.db.from('review_items').select('id', { count: 'exact', head: true }).eq('mission_id', id)
    if (!count) return fail('Agrega al menos un video o una pregunta antes de publicar.')
  }
  const { data, error } = await ctx.db.from('review_missions').update({ status }).eq('id', id).eq('institution_id', ctx.session.institutionId).select('id')
  if (error) return dbError(error)
  if (!data?.length) return NOT_ALLOWED
  refresh()
  return ok(status === 'published' ? 'Misión publicada: ya la ven los estudiantes del curso.' : 'La misión volvió a borrador.')
}

export async function deleteMission(id: string): Promise<ActionResult> {
  const ctx = await actionContext('docente')
  if (!ctx) return NOT_ALLOWED
  const { data, error } = await ctx.db.from('review_missions').delete().eq('id', id).eq('institution_id', ctx.session.institutionId).select('id')
  if (error) return dbError(error)
  if (!data?.length) return NOT_ALLOWED
  refresh()
  return ok('Misión eliminada.')
}

async function nextPosition(db: NonNullable<Awaited<ReturnType<typeof actionContext>>>['db'], missionId: string) {
  const { data } = await db.from('review_items').select('position').eq('mission_id', missionId).order('position', { ascending: false }).limit(1)
  return ((data?.[0]?.position as number | undefined) ?? 0) + 1
}

/** Agrega un video de YouTube a la misión, a partir de su enlace o de un resultado de búsqueda. */
export async function addVideoItem(missionId: string, form: FormData): Promise<ActionResult> {
  const ctx = await actionContext('docente')
  if (!ctx) return NOT_ALLOWED
  const parsed = parseForm(z.object({
    video: z.string({ required_error: 'Pega el enlace del video.' }).trim().min(5, 'Pega el enlace del video.').max(300),
    prompt: z.string().trim().max(200).optional(),
  }), form)
  if ('error' in parsed) return parsed.error
  const id = youtubeId(parsed.data.video)
  if (!id) return fail('Revisa los campos marcados.', { video: 'Ese no parece un enlace de YouTube válido.' })
  const { error } = await ctx.db.from('review_items').insert({
    institution_id: ctx.session.institutionId, mission_id: missionId, position: await nextPosition(ctx.db, missionId),
    kind: 'video', prompt: parsed.data.prompt || 'Mira este video', youtube_id: id,
  })
  if (error) return dbError(error)
  refresh()
  return ok('Video agregado a la misión.')
}

/** Agrega una pregunta de alternativas. La respuesta correcta se guarda aparte, donde el estudiante no puede leerla. */
export async function addQuestionItem(missionId: string, form: FormData): Promise<ActionResult> {
  const ctx = await actionContext('docente')
  if (!ctx) return NOT_ALLOWED
  const parsed = parseForm(z.object({
    prompt: z.string({ required_error: 'Escribe la pregunta.' }).trim().min(3, 'La pregunta es muy corta.').max(500),
    option: z.array(z.string().trim().min(1).max(200)).min(2, 'Escribe al menos dos alternativas.').max(5),
    correct: z.coerce.number({ invalid_type_error: 'Marca cuál es la correcta.' }).int().min(0).max(4),
    explanation: z.string().trim().max(600).optional(),
  }), form)
  if ('error' in parsed) return parsed.error
  const v = parsed.data
  // El formulario numera las alternativas tal como se ven; las vacías se descartan y el índice correcto se recalcula.
  const raw = form.getAll('option[]').map(x => String(x).trim())
  const kept = raw.map((text, index) => ({ text, index })).filter(o => o.text)
  const correct = kept.findIndex(o => o.index === v.correct)
  if (correct < 0) return fail('Revisa los campos marcados.', { correct: 'La alternativa marcada como correcta está vacía.' })

  const { data: item, error } = await ctx.db.from('review_items').insert({
    institution_id: ctx.session.institutionId, mission_id: missionId, position: await nextPosition(ctx.db, missionId),
    kind: 'question', prompt: v.prompt, options: kept.map(o => o.text),
  }).select('id').single()
  if (error) return dbError(error)
  const { error: keyError } = await ctx.db.from('review_item_keys').insert({ item_id: item.id, institution_id: ctx.session.institutionId, correct_index: correct, explanation: v.explanation ?? '' })
  if (keyError) { await ctx.db.from('review_items').delete().eq('id', item.id); return dbError(keyError) }
  refresh()
  return ok('Pregunta agregada a la misión.')
}

export async function deleteItem(id: string): Promise<ActionResult> {
  const ctx = await actionContext('docente')
  if (!ctx) return NOT_ALLOWED
  const { data, error } = await ctx.db.from('review_items').delete().eq('id', id).eq('institution_id', ctx.session.institutionId).select('id')
  if (error) return dbError(error)
  if (!data?.length) return NOT_ALLOWED
  refresh()
  return ok('Paso eliminado.')
}

export type ReviewAnswer = { ok: true; done: boolean; correct?: boolean; explanation?: string | null } | { ok: false; error: string }

/** El estudiante marca un video como visto o responde una pregunta. */
export async function answerItem(itemId: string, choice: number | null): Promise<ReviewAnswer> {
  const ctx = await actionContext('estudiante')
  if (!ctx || !uuid.safeParse(itemId).success) return { ok: false, error: 'No tienes permiso para hacer esto.' }
  const { data, error } = await ctx.db.rpc('review_answer', { p_item: itemId, p_choice: choice })
  if (error) return { ok: false, error: /invalid_choice/.test(error.message) ? 'Elige una alternativa.' : 'No se pudo guardar tu avance. Inténtalo de nuevo.' }
  revalidatePath('/estudiante', 'layout')
  const r = data as { done: boolean; correct?: boolean; explanation?: string | null }
  return { ok: true, done: !!r.done, correct: r.correct, explanation: r.explanation ?? null }
}

export type PersonalMission = { ok: true; id: string } | { ok: false; error: string }

/** «Crear con ARIA»: el estudiante escribe un tema y recibe una misión de repaso solo para él. */
export async function createMissionWithAria(subjectId: string, topicText: string): Promise<PersonalMission> {
  const ctx = await actionContext('estudiante')
  if (!ctx || !uuid.safeParse(subjectId).success) return { ok: false, error: 'No tienes permiso para hacer esto.' }
  const topic = String(topicText ?? '').trim()
  if (topic.length < 3) return { ok: false, error: 'Escribe el tema que quieres repasar.' }
  if (topic.length > 200) return { ok: false, error: 'Escribe el tema en pocas palabras.' }

  // El curso sale de la matrícula del estudiante y la asignatura debe ser de ese curso: no se confía en lo que envía el navegador.
  const { data: enrollment } = await ctx.db.from('course_enrollments').select('course_id, courses(grade_levels(name, stage))')
    .eq('institution_id', ctx.session.institutionId).eq('student_id', ctx.session.userId).eq('status', 'active').maybeSingle()
  if (!enrollment) return { ok: false, error: 'No encontramos tu curso.' }
  const { data: plan } = await ctx.db.from('course_subjects').select('subjects(name)').eq('course_id', enrollment.course_id).eq('subject_id', subjectId).maybeSingle()
  const subject = (plan as unknown as { subjects: { name: string } | null } | null)?.subjects?.name
  if (!subject) return { ok: false, error: 'Elige una de tus asignaturas.' }
  const level = (enrollment as unknown as { courses: { grade_levels: { name: string; stage: string } | null } | null }).courses?.grade_levels
  if (!canCreateWithAria(level?.stage, level?.name)) return { ok: false, error: 'En tu curso los repasos los preparan tus profesores.' }
  const grade = level?.name ?? null

  const result = await draftMission(ctx, { subject, grade, topic })
  if (!result.ok) return result
  const { data: id, error } = await ctx.db.rpc('review_create_personal', {
    p_course: enrollment.course_id, p_subject: subjectId, p_title: result.draft.title, p_description: result.draft.description, p_topic: topic.slice(0, 80), p_items: result.draft.items,
  })
  if (error) return { ok: false, error: /too_many/.test(error.message) ? 'Ya tienes muchos repasos guardados. Borra alguno que no uses y vuelve a intentarlo.' : 'No se pudo guardar tu repaso. Inténtalo de nuevo.' }
  revalidatePath('/estudiante', 'layout')
  return { ok: true, id: id as string }
}

/** El estudiante borra un repaso que creó con ARIA. RLS solo le deja borrar los suyos. */
export async function deletePersonalMission(id: string): Promise<ActionResult> {
  const ctx = await actionContext('estudiante')
  if (!ctx) return NOT_ALLOWED
  const { data, error } = await ctx.db.from('review_missions').delete().eq('id', id).eq('student_id', ctx.session.userId).select('id')
  if (error) return dbError(error)
  if (!data?.length) return NOT_ALLOWED
  refresh()
  return ok('Repaso borrado.')
}
