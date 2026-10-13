'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, BookOpen, HeartHandshake, Home, Loader2, MessageCircleHeart, Send, ShieldCheck, Users, type LucideIcon } from 'lucide-react'
import type { ActionResult } from '@/lib/actions/result'
import { createWellbeingRequest } from '@/lib/actions/support'
import { Button, Field, Textarea } from '@/components/ui/primitives'
import { Modal } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'

type Topic = { value: string; title: string; mine: string; kid: string | null; guardian: string; student: string; icon: LucideIcon; tile: string }
const TOPICS: Topic[] = [
  { value: 'academico', title: 'Estudio y notas', mine: 'Estudio y notas', kid: 'Me cuesta algo de las clases', guardian: 'Le está costando una asignatura, las tareas o la organización.', student: 'Me está costando una asignatura, las tareas o la organización.', icon: BookOpen, tile: 'bg-v-accent-soft text-v-accent' },
  { value: 'convivencia', title: 'Convivencia', mine: 'Convivencia', kid: 'Tengo un problema con alguien', guardian: 'Algo pasa con sus compañeros o en el curso.', student: 'Algo pasa con mis compañeros o en el curso.', icon: Users, tile: 'bg-v-warning/20 text-[#b45309]' },
  { value: 'emocional', title: 'Cómo se siente', mine: 'Cómo me siento', kid: 'Me siento triste o preocupado', guardian: 'Lo notas distinto, triste, nervioso o desanimado.', student: 'Me siento triste, nervioso, desanimado o distinto.', icon: MessageCircleHeart, tile: 'bg-[#fce7f3] text-[#be185d]' },
  { value: 'familiar', title: 'Situación en casa', mine: 'Algo en mi casa', kid: 'Pasa algo en mi casa', guardian: 'Un cambio en la familia que conviene que el colegio sepa.', student: 'Algo que está pasando en mi casa.', icon: Home, tile: 'bg-v-success/15 text-[#157a4b]' },
  { value: 'otro', title: 'Otro tema', mine: 'Otro tema', kid: 'Quiero contar otra cosa', guardian: 'Cualquier otra cosa en la que necesites orientación.', student: 'Cualquier otra cosa que quiera conversar.', icon: HeartHandshake, tile: 'bg-v-fill text-v-muted' },
]
const PILL = 'block cursor-pointer rounded-full border border-v-border-strong px-4 py-2 text-center text-[13px] font-semibold text-v-muted transition-colors hover:border-v-accent peer-checked:border-transparent peer-checked:bg-v-accent peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-v-accent'

/** Se elige el tema en tarjetas grandes y recién ahí aparece un formulario corto. Lo usan apoderados y estudiantes.
 *  Con `simple` (estudiantes de cursos chicos) hay menos texto, botones más grandes y palabras de niño. */
export function SupportComposer({ role, students, simple }: { role: 'apoderado' | 'estudiante'; students?: { id: string; name: string }[]; simple?: boolean }) {
  const [topic, setTopic] = useState<Topic | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const router = useRouter()
  const toast = useToast()
  const guardian = role === 'apoderado'
  const close = () => { setTopic(null); setError(null) }

  const submit = (form: FormData) => start(async () => {
    let res: ActionResult
    try { res = await createWellbeingRequest(form) } catch { res = { ok: false, error: 'No se pudo enviar. Revisa tu conexión e inténtalo de nuevo.' } }
    if (!res.ok) { setError([res.error, ...Object.values(res.fieldErrors ?? {})].join(' ')); return }
    toast.success(res.message ?? 'Solicitud enviada.')
    close()
    router.refresh()
  })

  return (
    <>
      {simple ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {TOPICS.map(t => (
            <button key={t.value} type="button" onClick={() => setTopic(t)}
              className="group flex items-center gap-4 rounded-v-lg border border-v-border bg-v-elevated p-5 text-left shadow-v transition-all hover:-translate-y-1 hover:border-v-accent/40 hover:shadow-v-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v-accent">
              <span className={`grid size-16 shrink-0 place-items-center rounded-3xl ${t.tile}`}><t.icon size={30} /></span>
              <span className="min-w-0 flex-1 text-[18px] font-bold leading-snug text-v-text group-hover:text-v-accent">{t.kid}</span>
              <ArrowRight size={20} className="shrink-0 text-v-subtle transition-transform group-hover:translate-x-1 group-hover:text-v-accent" />
            </button>
          ))}
        </div>
      ) : (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        {TOPICS.map(t => (
          <button key={t.value} type="button" onClick={() => setTopic(t)}
            className="group flex flex-col rounded-v-lg border border-v-border bg-v-elevated p-5 text-left shadow-v-sm transition-all hover:-translate-y-1 hover:border-v-accent/40 hover:shadow-v-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v-accent">
            <span className={`mb-3.5 grid size-12 place-items-center rounded-[30%] transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110 ${t.tile}`}><t.icon size={22} /></span>
            <span className="text-[16px] font-semibold tracking-tight text-v-text">{guardian ? t.title : t.mine}</span>
            <span className="mt-1 flex-1 text-[13px] leading-relaxed text-v-muted">{guardian ? t.guardian : t.student}</span>
            <span className="mt-4 flex items-center gap-1.5 text-[13px] font-semibold text-v-accent">Pedir apoyo<ArrowRight size={14} className="transition-transform group-hover:translate-x-1" /></span>
          </button>
        ))}
      </div>
      )}

      <Modal open={!!topic} onClose={close} title={topic ? (simple ? topic.kid ?? 'Pedir ayuda' : `Pedir apoyo · ${guardian ? topic.title : topic.mine}`) : ''} description={simple ? 'Lo va a leer una persona del colegio que ayuda a los estudiantes.' : guardian ? 'Lo lee solo el equipo de bienestar del colegio.' : 'Cuéntalo con tus palabras: el equipo de bienestar te va a responder aquí mismo.'} wide>
        {topic && (
          <form action={submit} className="space-y-4">
            <input type="hidden" name="source" value={role} />
            <input type="hidden" name="category" value={topic.value} />
            {!guardian && (
              <p className={`rounded-v-sm bg-v-fill/70 px-3.5 py-2.5 text-v-muted ${simple ? 'text-[15px]' : 'text-[13px]'}`}>
                {topic.value === 'familiar'
                  ? (simple ? 'Esto lo leen solo las personas del colegio que ayudan a los estudiantes. Tu apoderado no lo ve.' : 'Esto lo lee solo el equipo de bienestar. Tu apoderado no lo ve.')
                  : (simple ? 'Lo leen las personas del colegio que ayudan a los estudiantes. Tu apoderado también podrá ver que pediste ayuda.' : 'Lo lee el equipo de bienestar. Tu apoderado también podrá ver esta solicitud, pero no las respuestas que te den.')}
              </p>
            )}
            {guardian && students && students.length === 1 && <><input type="hidden" name="student_id" value={students[0].id} /><p className="rounded-v-sm bg-v-fill/70 px-3.5 py-2.5 text-[13px] text-v-muted">Esta solicitud es sobre <span className="font-semibold text-v-text">{students[0].name}</span>.</p></>}
            {guardian && students && students.length > 1 && (
              <fieldset>
                <legend className="mb-2 text-[12.5px] font-medium text-v-text">¿Sobre quién es?</legend>
                <div className="flex flex-wrap gap-2">
                  {students.map((s, i) => (
                    <label key={s.id} className="relative"><input type="radio" name="student_id" value={s.id} defaultChecked={i === 0} required className="peer sr-only" /><span className={PILL}>{s.name}</span></label>
                  ))}
                </div>
              </fieldset>
            )}
            <Field label={simple ? 'Cuéntanos qué pasa' : guardian ? 'Cuéntanos la situación' : 'Cuéntanos qué te pasa'} hint={simple ? 'Escribe como tú hablas. No tienes que escribir mucho.' : 'Escribe con tus palabras. No necesitas dar más detalles de los que quieras.'}>
              <Textarea name="description" required minLength={5} maxLength={4000} rows={simple ? 5 : 7} className={simple ? '!text-[16px]' : undefined} placeholder={simple ? 'Escribe aquí…' : guardian ? 'Qué has notado, desde cuándo y qué te gustaría que pasara.' : 'Qué te pasa, desde cuándo y qué te gustaría que pasara.'} />
            </Field>
            <p className="flex items-start gap-2 rounded-v-sm bg-v-accent-soft px-3.5 py-2.5 text-[12.5px] leading-relaxed text-v-text">
              <ShieldCheck size={15} className="mt-0.5 shrink-0 text-v-accent" />
              {simple ? 'No lo van a ver tus compañeros. Si necesitas ayuda ahora mismo, no esperes: dile a tu profesor o a un adulto del colegio.' : 'Es confidencial: no la ven profesores, dirección ni secretaría. El equipo la revisa en horario escolar; no es un canal de urgencias.'}
            </p>
            {error && <p role="alert" className="rounded-v-sm bg-v-danger-soft px-3 py-2 text-[12.5px] text-[#c0343a]">{error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={close} disabled={pending}>Cancelar</Button>
              <Button type="submit" disabled={pending}>{pending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}{simple ? 'Enviar' : 'Enviar solicitud'}</Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  )
}
