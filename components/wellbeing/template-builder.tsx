'use client'
import { useState } from 'react'
import { AlignLeft, Calculator, Gauge, ListChecks, NotebookText, Plus, Sigma, Trash2 } from 'lucide-react'
import { Input, Textarea } from '@/components/ui/primitives'

type Q = { key: number; text: string; open: boolean }
const RULES = [
  { value: 'none', icon: NotebookText, title: 'Solo guardar las respuestas', text: 'No se calcula ningún número.' },
  { value: 'mean', icon: Gauge, title: 'Promedio', text: 'El promedio de las preguntas de escala.' },
  { value: 'sum', icon: Sigma, title: 'Suma', text: 'La suma de las preguntas de escala.' },
] as const

const STEP = 'mb-3 flex items-center gap-2.5 text-[14.5px] font-semibold tracking-tight text-v-text'
const NUM = 'v-brand grid size-6 shrink-0 place-items-center rounded-full text-[12px] font-bold'
const LABEL = 'mb-1 block text-[12.5px] font-medium text-v-text'
const HINT = 'mt-1 text-xs text-v-subtle'

/** Formulario guiado para crear un instrumento: cuatro pasos en lenguaje simple y las preguntas una a una.
 *  Entrega los mismos campos que espera createTemplate (las preguntas viajan como líneas, con «T:» las abiertas). */
export function TemplateBuilder() {
  const [questions, setQuestions] = useState<Q[]>([{ key: 1, text: '', open: false }, { key: 2, text: '', open: false }])
  const [next, setNext] = useState(3)
  const [max, setMax] = useState(5)
  const [rule, setRule] = useState<(typeof RULES)[number]['value']>('none')
  const scaleCount = questions.filter(q => !q.open && q.text.trim()).length
  const update = (key: number, patch: Partial<Q>) => setQuestions(list => list.map(q => (q.key === key ? { ...q, ...patch } : q)))
  const serialized = questions.filter(q => q.text.trim()).map(q => `${q.open ? 'T: ' : ''}${q.text.replace(/\s+/g, ' ').trim()}`).join('\n')

  return (
    <div className="space-y-6">
      {/* 1 */}
      <section>
        <h3 className={STEP}><span className={NUM}>1</span>¿Cómo se llama y para qué sirve?</h3>
        <div className="space-y-3">
          <label className="block"><span className={LABEL}>Nombre del instrumento</span><Input name="title" required minLength={3} maxLength={160} placeholder="Ej.: Pauta de hábitos de estudio" /></label>
          <label className="block"><span className={LABEL}>Para qué se usa <span className="font-normal text-v-subtle">· opcional</span></span><Textarea name="description" rows={2} maxLength={2000} placeholder="Ej.: Conocer cómo organiza el estudiante su tiempo de estudio en casa." /></label>
        </div>
      </section>

      {/* 2 */}
      <section>
        <h3 className={STEP}><span className={NUM}>2</span>Las preguntas</h3>
        <input type="hidden" name="questions" value={serialized} />
        <input type="hidden" name="scale_max" value={max} />
        <ol className="space-y-2">
          {questions.map((q, i) => (
            <li key={q.key} className="rounded-v-sm border border-v-border p-2.5">
              <div className="flex items-center gap-2">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-v-accent-soft text-[12px] font-bold text-v-accent">{i + 1}</span>
                <Input value={q.text} onChange={e => update(q.key, { text: e.target.value })} maxLength={300} placeholder={q.open ? 'Ej.: Observaciones' : 'Ej.: Tiene un horario de estudio definido'} aria-label={`Pregunta ${i + 1}`} />
                <button type="button" onClick={() => setQuestions(list => list.filter(x => x.key !== q.key))} disabled={questions.length === 1} aria-label={`Quitar pregunta ${i + 1}`}
                  className="grid size-9 shrink-0 place-items-center rounded-full text-v-subtle hover:bg-v-fill hover:text-v-danger disabled:opacity-30"><Trash2 size={15} /></button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-9">
                <span className="mr-1 text-xs text-v-muted">Se responde con:</span>
                {([[false, `Un número del 1 al ${max}`, Calculator], [true, 'Texto libre', AlignLeft]] as const).map(([open, label, Icon]) => (
                  <button key={label} type="button" onClick={() => update(q.key, { open })} aria-pressed={q.open === open}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${q.open === open ? 'bg-v-accent text-white' : 'border border-v-border-strong text-v-muted hover:border-v-accent'}`}><Icon size={12} />{label}</button>
                ))}
              </div>
            </li>
          ))}
        </ol>
        <button type="button" onClick={() => { setQuestions(list => [...list, { key: next, text: '', open: false }]); setNext(n => n + 1) }} disabled={questions.length >= 40}
          className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-dashed border-v-border-strong px-4 py-2 text-[13px] font-semibold text-v-accent hover:bg-v-accent-soft disabled:opacity-40"><Plus size={15} />Agregar pregunta</button>

        <div className="mt-4 rounded-v-sm bg-v-fill/60 p-3.5">
          <p className="flex items-center gap-2 text-[13px] font-medium text-v-text"><ListChecks size={15} className="text-v-accent" />Las preguntas de número se responden del 1 al
            <select value={max} onChange={e => setMax(Number(e.target.value))} aria-label="Máximo de la escala" className="v-input !h-8 !w-auto !py-0 !text-[13px]">{[3, 4, 5, 6, 7, 10].map(n => <option key={n} value={n}>{n}</option>)}</select>
          </p>
          <p className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {Array.from({ length: max }, (_, i) => <span key={i} className="grid size-8 place-items-center rounded-full border border-v-border-strong bg-v-elevated text-[12.5px] font-semibold text-v-muted">{i + 1}</span>)}
            <span className="ml-1 text-xs text-v-subtle">Así las verá quien aplique el instrumento.</span>
          </p>
        </div>
      </section>

      {/* 3 */}
      <section>
        <h3 className={STEP}><span className={NUM}>3</span>¿Quieres que se calcule un resultado?</h3>
        <div className="grid gap-2 sm:grid-cols-3">
          {RULES.map(r => (
            <label key={r.value} className="relative cursor-pointer">
              <input type="radio" name="scoring" value={r.value} checked={rule === r.value} onChange={() => setRule(r.value)} className="peer sr-only" />
              <span className="flex h-full flex-col gap-1 rounded-v-sm border border-v-border-strong p-3.5 transition-colors hover:border-v-accent peer-checked:border-v-accent peer-checked:bg-v-accent-soft peer-focus-visible:ring-2 peer-focus-visible:ring-v-accent">
                <span className="flex items-center gap-2 text-[13.5px] font-semibold text-v-text"><r.icon size={16} className="text-v-accent" />{r.title}</span>
                <span className="text-xs leading-relaxed text-v-muted">{r.text}</span>
              </span>
            </label>
          ))}
        </div>
        {rule !== 'none' && (
          <div className="mt-3">
            {scaleCount === 0 && <p className="mb-2 rounded-v-sm bg-v-warning/10 px-3 py-2 text-xs text-[#a16207]">Para calcular un resultado necesitas al menos una pregunta que se responda con número.</p>}
            <label className="block"><span className={LABEL}>¿Qué significa ese número?</span>
              <Textarea name="scoring_note" rows={2} required maxLength={1000} placeholder={`Ej.: ${rule === 'mean' ? 'Promedio' : 'Suma'} de las preguntas de número. Es un valor descriptivo para orientar la conversación; no tiene puntos de corte ni significado diagnóstico.`} /></label>
            <p className={HINT}>Explica qué representa y qué no. La plataforma solo hace la cuenta: nunca interpreta el resultado ni lo clasifica.</p>
          </div>
        )}
      </section>

      {/* 4 */}
      <section>
        <h3 className={STEP}><span className={NUM}>4</span>¿De dónde viene este instrumento?</h3>
        <Textarea name="authorization_note" rows={2} required minLength={10} maxLength={1000} aria-label="Origen y autorización" placeholder="Ej.: Pauta interna creada por el equipo de bienestar del colegio. / Instrumento publicado por…, con licencia de uso para establecimientos educacionales." />
        <p className={HINT}>Indica quién lo creó y por qué el colegio puede usarlo. Si es un instrumento con derechos de autor, el colegio debe contar con su licencia.</p>
      </section>

      <p className="rounded-v-sm bg-v-fill/70 px-3.5 py-2.5 text-xs leading-relaxed text-v-muted">Se guarda como <span className="font-semibold text-v-text">borrador</span>. Podrás revisarlo y activarlo después; solo los instrumentos activos se pueden aplicar.</p>
    </div>
  )
}
