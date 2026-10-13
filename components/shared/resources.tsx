import { Download, FileText, Trash2, Upload } from 'lucide-react'
import type { Session } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { nameMap } from '@/lib/data/people'
import { createResource, deleteResource } from '@/lib/actions/content'
import { ROLE_SHORT, type Role } from '@/lib/roles'
import { fmtDate } from '@/lib/format'
import { Badge, buttonClass, Card, EmptyState, Field, Input, PageHeader, Select, Table, Td, Textarea, Th } from '@/components/ui/primitives'
import { ConfirmAction, FormDialog } from '@/components/ui/dialog'
import { FileField } from '@/components/ui/file-field'

const KIND: Record<string, string> = { material: 'Material educativo', documento: 'Documento', institucional: 'Archivo institucional' }
const AUDIENCES: Role[] = ['estudiante', 'apoderado', 'docente', 'bienestar', 'directivo']

export const fileHref = (bucket: 'materials' | 'submissions', path: string) => `/api/archivo?b=${bucket}&p=${encodeURIComponent(path)}`

/** Material y documentos que la persona puede ver. Docentes, dirección y secretaría pueden publicar. */
export async function ResourcesView({ session, title = 'Material' }: { session: Session; title?: string }) {
  const db = await createClient()
  const canPublish = ['admin', 'directivo', 'docente'].includes(session.role)
  const [{ data: rows }, { data: courses }, { data: subjects }] = await Promise.all([
    db.from('resources').select('id, title, description, kind, file_path, file_name, uploaded_by, created_at, courses(name), subjects(name)')
      .eq('institution_id', session.institutionId).order('created_at', { ascending: false }).limit(60),
    session.role === 'docente'
      ? db.from('teacher_assignments').select('courses(id, name)').eq('teacher_id', session.userId).eq('institution_id', session.institutionId)
      : canPublish ? db.from('courses').select('id, name').eq('is_archived', false).eq('institution_id', session.institutionId).order('name') : Promise.resolve({ data: [] }),
    canPublish ? db.from('subjects').select('id, name').eq('institution_id', session.institutionId).order('name') : Promise.resolve({ data: [] }),
  ])
  const list = (rows ?? []) as unknown as { id: string; title: string; description: string; kind: string; file_path: string; file_name: string; uploaded_by: string; created_at: string; courses: { name: string } | null; subjects: { name: string } | null }[]
  const names = await nameMap(db, list.map(r => r.uploaded_by))
  const courseOptions = session.role === 'docente'
    ? [...new Map(((courses ?? []) as unknown as { courses: { id: string; name: string } }[]).map(c => [c.courses.id, c.courses])).values()]
    : ((courses ?? []) as { id: string; name: string }[])

  return (
    <>
      <PageHeader title={title} description={canPublish ? 'Publica guías, documentos y archivos, y define quién puede verlos.' : 'Guías y documentos que tus profesores y el colegio han compartido contigo.'}
        actions={canPublish && (
          <FormDialog trigger={<><Upload size={15} />Subir archivo</>} title="Subir archivo" action={createResource} submitLabel="Publicar" wide>
            <Field label="Título"><Input name="title" required minLength={3} maxLength={160} /></Field>
            <Field label="Descripción"><Textarea name="description" rows={2} maxLength={1000} /></Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Tipo">
                <Select name="kind" defaultValue="material">
                  {Object.entries(KIND).filter(([k]) => session.role !== 'docente' || k === 'material').map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </Select>
              </Field>
              <Field label="Curso">
                <Select name="course_id" defaultValue="" required={session.role === 'docente'}>
                  {session.role === 'docente' ? <option value="" disabled>Selecciona…</option> : <option value="">Todo el colegio</option>}
                  {courseOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </Field>
              <Field label="Asignatura">
                <Select name="subject_id" defaultValue="">
                  <option value="">General</option>
                  {((subjects ?? []) as { id: string; name: string }[]).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              </Field>
            </div>
            <fieldset>
              <legend className="mb-1.5 text-[12.5px] font-medium text-v-text">Visible para</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {AUDIENCES.map(a => (
                  <label key={a} className="flex items-center gap-2 text-[13px]">
                    <input type="checkbox" name="audience[]" value={a} defaultChecked={a === 'estudiante' || a === 'docente'} className="size-4 accent-[var(--v-accent)]" />
                    {ROLE_SHORT[a]}
                  </label>
                ))}
              </div>
            </fieldset>
            <FileField bucket="materials" prefix={session.institutionId} label="Archivo" required />
          </FormDialog>
        )} />

      <Card>
        {list.length === 0 ? (
          <EmptyState aria={8} title="Aún no hay archivos" description={canPublish ? 'Sube el primer material con «Subir archivo».' : 'Cuando tus profesores compartan material lo verás aquí.'} />
        ) : (
          <Table>
            <thead><tr><Th>Archivo</Th><Th>Curso</Th><Th>Publicado</Th><Th /></tr></thead>
            <tbody>
              {list.map(r => (
                <tr key={r.id}>
                  <Td>
                    <span className="flex items-start gap-2.5">
                      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-v-accent-soft text-v-accent"><FileText size={15} /></span>
                      <span className="min-w-0">
                        <span className="block font-medium">{r.title}</span>
                        <span className="block text-[12px] text-v-subtle">{KIND[r.kind]}{r.subjects ? ` · ${r.subjects.name}` : ''}{r.description ? ` · ${r.description}` : ''}</span>
                      </span>
                    </span>
                  </Td>
                  <Td><Badge tone={r.courses ? 'accent' : 'neutral'}>{r.courses?.name ?? 'Todo el colegio'}</Badge></Td>
                  <Td className="text-v-muted">{fmtDate(r.created_at)}<span className="block text-[12px] text-v-subtle">{names.get(r.uploaded_by) ?? ''}</span></Td>
                  <Td className="text-right">
                    <span className="inline-flex items-center gap-1">
                      <a href={fileHref('materials', r.file_path)} target="_blank" rel="noreferrer" className={buttonClass('secondary', 'sm')}><Download size={13} />Descargar</a>
                      {(r.uploaded_by === session.userId || session.role === 'admin') && (
                        <ConfirmAction action={deleteResource.bind(null, r.id)} title="Eliminar archivo" danger confirmLabel="Eliminar" ariaLabel="Eliminar archivo"
                          message={`«${r.title}» dejará de estar disponible y el archivo se borrará.`}><Trash2 size={14} /></ConfirmAction>
                      )}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  )
}
