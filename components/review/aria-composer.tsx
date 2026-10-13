'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Sparkles } from 'lucide-react'
import { createMissionWithAria } from '@/lib/actions/review'

/** «Crear con ARIA»: el estudiante elige la asignatura, escribe el tema y ARIA le arma un repaso solo para él. */
export function AriaComposer({ subjects, simple = false }: { subjects: { id: string; name: string; color: string }[]; simple?: boolean }) {
  const router = useRouter()
  const [subject, setSubject] = useState(subjects[0]?.id ?? '')
  const [topic, setTopic] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const create = () => {
    if (pending) return
    if (topic.trim().length < 3) { setError('Escribe el tema que quieres repasar.'); return }
    setError(null)
    start(async () => {
      const res = await createMissionWithAria(subject, topic)
      if (!res.ok) { setError(res.error); return }
      router.push(`/estudiante/repaso/${res.id}`)
    })
  }

  return (
    <section aria-labelledby="aria-composer" className="relative mb-4 overflow-clip rounded-v-lg border border-v-accent/25 bg-v-elevated p-5 shadow-v sm:p-6">
      <span aria-hidden className="pointer-events-none absolute right-0 top-0 size-56 rounded-full opacity-70" style={{ background: 'radial-gradient(circle, var(--v-glow-1), transparent 70%)' }} />
      <div className="relative flex items-start gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {simple && <img src="/aria/pose-3.webp" alt="" className="v-float hidden h-32 w-auto shrink-0 drop-shadow-[0_8px_14px_rgba(0,60,160,0.25)] sm:block" />}
        <div className="min-w-0 flex-1">
          <h2 id="aria-composer" className={`v-display flex items-center gap-2 ${simple ? 'text-[1.7rem]' : 'text-[1.35rem]'} font-bold tracking-tight text-v-text`}><Sparkles size={simple ? 24 : 20} className="text-v-accent" />{simple ? '¿Qué quieres repasar?' : 'Generar un repaso con ARIA'}</h2>
          <p className={`mt-0.5 ${simple ? 'text-[17px]' : 'text-[14.5px]'} text-v-muted`}>{simple ? 'Elige la asignatura, escribe el tema y ARIA te arma una misión.' : 'Indica la asignatura y el tema. ARIA prepara un resumen, un video y preguntas de práctica solo para ti.'}</p>

          <div className="mt-4 flex flex-wrap gap-2" role="radiogroup" aria-label="Asignatura">
            {subjects.map(s => (
              <button key={s.id} type="button" role="radio" aria-checked={subject === s.id} onClick={() => setSubject(s.id)} disabled={pending}
                className={`inline-flex items-center gap-2 rounded-full border-2 ${simple ? 'px-5 py-3 text-[16px]' : 'px-4 py-2 text-[13.5px]'} font-semibold transition-colors ${subject === s.id ? 'border-v-accent bg-v-accent-soft text-v-accent' : 'border-v-border bg-v-elevated text-v-muted hover:text-v-text'}`}>
                <span className="size-2.5 rounded-full" style={{ background: s.color }} />{s.name}
              </button>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap gap-2.5">
            <input value={topic} onChange={e => setTopic(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); create() } }} maxLength={200} disabled={pending}
              aria-label="Tema que quieres repasar" placeholder={simple ? 'Ej.: las sumas, los animales…' : 'Ej.: fracciones equivalentes, la fotosíntesis, los pueblos originarios…'} className={`v-input min-w-0 flex-1 basis-72 ${simple ? 'h-14 !text-[18px]' : 'h-12 !text-[15px]'}`} />
            <button type="button" onClick={create} disabled={pending} className={`v-brand inline-flex shrink-0 items-center gap-2 rounded-full font-bold shadow-v-brand disabled:opacity-70 ${simple ? 'h-14 px-8 text-[18px]' : 'h-12 px-6 text-[15px]'}`}>
              {pending ? <Loader2 size={17} className="animate-spin" /> : <Sparkles size={17} />}{pending ? (simple ? 'Preparando…' : 'Generando…') : simple ? 'Crear' : 'Generar repaso'}
            </button>
          </div>
          {error && <p role="alert" className="mt-3 rounded-v-sm bg-v-warning/15 px-3.5 py-2.5 text-[14px] text-v-text">{error}</p>}
          <p className={`mt-3 leading-relaxed ${simple ? 'text-[14.5px] text-v-muted' : 'text-[12.5px] text-v-subtle'}`}>{simple ? 'ARIA a veces se equivoca. Si algo te parece raro, pregúntale a tu profesor.' : 'ARIA es una inteligencia artificial y puede cometer errores: contrasta el contenido con tus apuntes o consulta a tu docente. Tu docente puede ver los repasos que generas.'}</p>
        </div>
      </div>
    </section>
  )
}
