import { AlertTriangle, Compass, FileText, HelpCircle, Lightbulb, ShieldCheck, type LucideIcon } from 'lucide-react'
import { Formatted } from '@/components/aria/aria-chat'

type Section = { title: string; body: string }

const STYLE: { match: RegExp; icon: LucideIcon; tile: string; card: string }[] = [
  { match: /alerta/i, icon: AlertTriangle, tile: 'bg-v-warning/20 text-[#b45309]', card: 'border-v-warning/35 bg-v-warning/[0.07]' },
  { match: /protector|fortaleza/i, icon: ShieldCheck, tile: 'bg-v-success/15 text-[#157a4b]', card: 'border-v-success/30 bg-v-success/[0.06]' },
  { match: /lectura|hip[oó]tesis/i, icon: Lightbulb, tile: 'bg-v-accent-soft text-v-accent', card: 'border-v-accent/25 bg-v-accent-soft/50' },
  { match: /vac[ií]o|falta/i, icon: HelpCircle, tile: 'bg-v-fill text-v-muted', card: 'border-v-border bg-v-fill/50' },
  { match: /idea|considerar|paso/i, icon: Compass, tile: 'bg-v-accent-soft text-v-accent', card: 'border-v-border bg-v-elevated' },
]
const DEFAULT = { icon: FileText, tile: 'bg-v-fill text-v-muted', card: 'border-v-border bg-v-elevated' }

/** Separa el texto de ARIA en secciones por sus títulos («## Título» o una línea solo en negrita). */
function parse(text: string): { intro: string; sections: Section[] } {
  const intro: string[] = []
  const sections: Section[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    const heading = line.match(/^#{1,4}\s+(.+?)\s*:?$/) ?? line.match(/^\*\*([^*]+?):?\*\*:?$/)
    if (heading) { sections.push({ title: heading[1].replace(/\*\*/g, '').trim(), body: '' }); continue }
    if (sections.length) sections[sections.length - 1].body += `${raw}\n`
    else intro.push(raw)
  }
  return { intro: intro.join('\n').trim(), sections: sections.filter(s => s.body.trim()) }
}

/** Un análisis de ARIA presentado por secciones, en dos columnas: se lee de un vistazo en vez de como un texto largo. */
export function AnalysisView({ text }: { text: string }) {
  const { intro, sections } = parse(text)
  if (sections.length < 2) return <div className="text-[14px] leading-relaxed text-v-text"><Formatted text={text} /></div>
  return (
    <div>
      {intro && <div className="mb-3 text-[14px] leading-relaxed text-v-text"><Formatted text={intro} /></div>}
      <div className="grid gap-3 lg:grid-cols-2">
        {sections.map((s, i) => {
          const style = STYLE.find(x => x.match.test(s.title)) ?? DEFAULT
          const Icon = style.icon
          return (
            <section key={i} className={`rounded-v-sm border p-4 ${style.card}`}>
              <h3 className="mb-2.5 flex items-center gap-2.5 text-[14.5px] font-semibold tracking-tight text-v-text">
                <span className={`grid size-8 shrink-0 place-items-center rounded-[30%] ${style.tile}`}><Icon size={16} /></span>{s.title}
              </h3>
              <div className="text-[13.5px] leading-relaxed text-v-text"><Formatted text={s.body.trim()} /></div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
