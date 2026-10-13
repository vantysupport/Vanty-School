import { Download } from 'lucide-react'
import { EvidenceIcon, type Evidence } from '@/components/shared/evidence-field'

/** Lee la columna jsonb `evidence` de un caso descartando cualquier entrada mal formada. */
export function readEvidence(value: unknown): Evidence[] {
  if (!Array.isArray(value)) return []
  return value.filter((f): f is Evidence => !!f && typeof f.path === 'string' && typeof f.name === 'string')
    .map(f => ({ path: f.path, name: f.name, type: typeof f.type === 'string' ? f.type : '', size: Number(f.size) || 0 }))
}

/** Pruebas adjuntas a un caso. Cada enlace pasa por /api/archivo, que solo firma la descarga si Storage lo permite. */
export function EvidenceList({ files }: { files: Evidence[] }) {
  if (files.length === 0) return null
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {files.map(f => (
        <li key={f.path}>
          <a href={`/api/archivo?b=evidence&p=${encodeURIComponent(f.path)}`} target="_blank" rel="noreferrer"
            className="flex items-center gap-3 rounded-v-sm border border-v-border bg-v-elevated p-3 hover:border-v-accent">
            <span className="grid size-9 shrink-0 place-items-center rounded-[30%] bg-v-accent-soft text-v-accent"><EvidenceIcon type={f.type} /></span>
            <span className="min-w-0 flex-1"><span className="block truncate text-[13.5px] font-semibold text-v-text">{f.name}</span>
              <span className="text-xs text-v-muted">{f.type.startsWith('image/') ? 'Imagen' : f.type.startsWith('video/') ? 'Video' : f.type.startsWith('audio/') ? 'Audio' : 'Documento'}</span></span>
            <Download size={15} className="shrink-0 text-v-subtle" />
          </a>
        </li>
      ))}
    </ul>
  )
}
