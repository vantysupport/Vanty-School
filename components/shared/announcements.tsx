import { PenSquare, Settings2, ShieldCheck, Trash2, Users } from 'lucide-react'
import type { Session } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { nameMap } from '@/lib/data/people'
import { createPost, deletePost, updatePostControls } from '@/lib/actions/community'
import { communityPrefix, type ReactionKind } from '@/lib/community'
import { ROLE_SHORT, type Role } from '@/lib/roles'
import { fmtDateTime } from '@/lib/format'
import { Avatar, Badge, Card, EmptyState, Field, Input, PageHeader, Select, Textarea } from '@/components/ui/primitives'
import { ConfirmAction, FormDialog } from '@/components/ui/dialog'
import { ImagesField } from '@/components/community/images-field'
import { PostInteractions, type PostComment } from '@/components/community/post-interactions'

const AUDIENCES: Role[] = ['apoderado', 'estudiante', 'docente', 'bienestar', 'directivo']
const CHECK = 'size-4 accent-[var(--v-accent)]'
const LEGEND = 'mb-1.5 text-[13px] font-medium text-v-muted'

type Post = {
  id: string; title: string; body: string; audience: Role[]; course_id: string | null; author_id: string; published_at: string
  image_paths: string[]; allow_reactions: boolean; comment_roles: Role[]; courses: { name: string } | null
}
const imageUrl = (path: string) => `/api/archivo?b=materials&p=${encodeURIComponent(path)}`
const roleList = (roles: Role[]) => roles.map(r => ROLE_SHORT[r].toLowerCase()).join(', ')

/** Convierte las direcciones http(s) del texto en enlaces. El resto se muestra tal cual (React escapa el contenido). */
function linkify(text: string) {
  return text.split(/(https?:\/\/[^\s<>"]+)/g).map((part, i) => i % 2 === 1
    ? <a key={i} href={part} target="_blank" rel="noopener noreferrer nofollow" className="font-medium text-v-accent underline-offset-2 hover:underline">{part}</a>
    : part)
}

/** Comunidad del colegio: publicaciones que la persona puede ver (RLS filtra por rol, audiencia y curso), con sus
 *  reacciones y comentarios. Publican secretaría, dirección y docentes; cada publicación define quién interactúa. */
export async function AnnouncementsView({ session }: { session: Session }) {
  const db = await createClient()
  const canPublish = ['admin', 'directivo', 'docente'].includes(session.role)
  const isStaffModerator = session.role === 'admin' || session.role === 'directivo'
  const [{ data: rows }, { data: courses }] = await Promise.all([
    db.from('announcements').select('id, title, body, audience, course_id, author_id, published_at, image_paths, allow_reactions, comment_roles, courses(name)')
      .eq('institution_id', session.institutionId).order('published_at', { ascending: false }).limit(30),
    session.role === 'docente'
      ? db.from('teacher_assignments').select('courses(id, name)').eq('teacher_id', session.userId).eq('institution_id', session.institutionId)
      : canPublish ? db.from('courses').select('id, name').eq('is_archived', false).eq('institution_id', session.institutionId).order('name') : Promise.resolve({ data: [] }),
  ])
  const list = (rows ?? []) as unknown as Post[]
  const ids = list.map(p => p.id)
  const [names, { data: reactionRows }, { data: commentRows }] = await Promise.all([
    nameMap(db, list.map(r => r.author_id)),
    ids.length ? db.from('announcement_reactions').select('announcement_id, user_id, kind').in('announcement_id', ids) : Promise.resolve({ data: [] as { announcement_id: string; user_id: string; kind: string }[] }),
    ids.length ? db.from('announcement_comments').select('id, announcement_id, author_id, author_name, author_role, body, hidden_at, created_at, parent_id').in('announcement_id', ids).order('created_at')
      : Promise.resolve({ data: [] as { id: string; announcement_id: string; author_id: string; author_name: string; author_role: string; body: string; hidden_at: string | null; created_at: string; parent_id: string | null }[] }),
  ])
  const reactions = reactionRows ?? [], comments = commentRows ?? []
  const courseOptions = session.role === 'docente'
    ? [...new Map(((courses ?? []) as unknown as { courses: { id: string; name: string } }[]).map(c => [c.courses.id, c.courses])).values()]
    : ((courses ?? []) as { id: string; name: string }[])
  const audienceOptions = AUDIENCES.filter(a => session.role !== 'docente' || a === 'apoderado' || a === 'estudiante')

  const composer = canPublish && (
    <FormDialog trigger={<><PenSquare size={15} />Nueva publicación</>} title="Publicar en la comunidad" description="Decide quién la ve y cómo pueden participar." action={createPost} submitLabel="Publicar" wide>
      <Field label="Título"><Input name="title" required minLength={3} maxLength={160} placeholder="Feria científica de 7.º básico" /></Field>
      <Field label="Mensaje"><Textarea name="body" required rows={5} maxLength={5000} /></Field>
      <ImagesField prefix={communityPrefix(session.institutionId)} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Dónde se publica">
          <Select name="course_id" defaultValue="" required={session.role === 'docente'}>
            {session.role !== 'docente' && <option value="">Todo el colegio</option>}
            {session.role === 'docente' && <option value="" disabled>Selecciona un curso…</option>}
            {courseOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <fieldset>
          <legend className={LEGEND}>Quién la ve</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {audienceOptions.map(a => (
              <label key={a} className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="audience[]" value={a} defaultChecked={a === 'apoderado' || a === 'estudiante'} className={CHECK} />{ROLE_SHORT[a]}</label>
            ))}
          </div>
        </fieldset>
      </div>
      <div className="rounded-v-sm border border-v-border bg-v-fill/50 p-3.5">
        <p className="flex items-center gap-2 text-[13px] font-semibold"><ShieldCheck size={15} className="text-v-accent" />Control de participación</p>
        <label className="mt-3 flex items-center gap-2 text-[13px]"><input type="checkbox" name="allow_reactions" defaultChecked className={CHECK} />Permitir reacciones</label>
        <fieldset className="mt-3">
          <legend className={LEGEND}>Quién puede comentar <span className="font-normal text-v-subtle">· deja todo sin marcar para desactivar los comentarios</span></legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {audienceOptions.map(a => (
              <label key={a} className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="comment_roles[]" value={a} defaultChecked={a === 'apoderado'} className={CHECK} />{ROLE_SHORT[a]}</label>
            ))}
          </div>
        </fieldset>
        <p className="mt-2.5 text-xs text-v-subtle">Solo comenta quien además ve la publicación. Podrás cambiar estos controles después y ocultar comentarios.</p>
      </div>
    </FormDialog>
  )

  return (
    <>
      <PageHeader title="Comunidad" description={canPublish ? 'Comparte avisos, fotos y actividades con el colegio, y decide quién puede reaccionar y comentar.' : 'Lo que comparte tu colegio y tus cursos.'} />

        <div className="min-w-0 space-y-4">
          {canPublish && (
            <Card className="flex flex-wrap items-center gap-3.5 p-4">
              <Avatar name={session.fullName} id={session.userId} size={42} />
              <p className="min-w-0 flex-1 text-[14px] text-v-muted"><span className="sm:hidden">Comparte algo con tu colegio</span><span className="hidden sm:inline">¿Qué quieres compartir con la comunidad, {session.fullName.split(' ')[0]}?</span></p>
              {composer}
            </Card>
          )}

          {list.length === 0 ? (
            <Card><EmptyState aria={3} title="Aún no hay publicaciones" description={canPublish ? 'Publica el primer aviso o la primera foto de una actividad.' : 'Cuando el colegio publique algo lo verás aquí.'} /></Card>
          ) : list.map((p, i) => {
            const author = names.get(p.author_id) ?? 'Colegio'
            const own = reactions.filter(r => r.announcement_id === p.id)
            const counts: Partial<Record<ReactionKind, number>> = {}
            for (const r of own) counts[r.kind as ReactionKind] = (counts[r.kind as ReactionKind] ?? 0) + 1
            const isAuthor = p.author_id === session.userId
            const canModerate = isAuthor || isStaffModerator
            const canComment = isAuthor ? p.comment_roles.length > 0 : p.comment_roles.includes(session.role)
            const commentNote = p.comment_roles.length === 0 ? 'Los comentarios están desactivados en esta publicación.' : canComment ? null : `En esta publicación solo comentan: ${roleList(p.comment_roles)}.`
            const postComments: PostComment[] = comments.filter(c => c.announcement_id === p.id).map(c => ({
              id: c.id, authorId: c.author_id, name: c.author_name, role: ROLE_SHORT[c.author_role as Role] ?? 'Colegio', body: c.body,
              when: fmtDateTime(c.created_at), hidden: !!c.hidden_at, mine: c.author_id === session.userId, parentId: (c.parent_id as string | null) ?? null,
            }))
            const images = p.image_paths ?? []
            return (
              <Card key={p.id} index={Math.min(i, 6) + 2}>
                {/* Con imágenes y pantalla ancha: fotos a la izquierda, texto y conversación a la derecha. En el celular, todo apilado. */}
                <div className={images.length > 0 ? 'lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:grid-rows-[auto_1fr]' : ''}>
                  <div className={images.length > 0 ? 'lg:col-start-2 lg:row-start-1' : ''}>
                    <div className="flex items-start gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
                      <Avatar name={author} id={p.author_id} size={42} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14.5px] font-semibold leading-tight">{author}</p>
                        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-v-subtle">
                          <span>{fmtDateTime(p.published_at)}</span>
                          <Badge tone={p.course_id ? 'accent' : 'neutral'}>{p.courses?.name ?? 'Todo el colegio'}</Badge>
                        </p>
                        {canPublish && <p className="mt-1 flex items-center gap-1 text-[11.5px] text-v-subtle"><Users size={12} className="shrink-0" /><span className="truncate">Ven: {roleList(p.audience)}</span></p>}
                      </div>
                      <div className="flex shrink-0 items-center">
                        {canModerate && (
                          <FormDialog trigger={<><Settings2 size={15} /><span className="hidden sm:inline">Controles</span></>} variant="ghost" size="sm" title="Controles de la publicación" description={p.title} action={updatePostControls.bind(null, p.id)} submitLabel="Guardar">
                            <label className="flex items-center gap-2 text-[13.5px]"><input type="checkbox" name="allow_reactions" defaultChecked={p.allow_reactions} className={CHECK} />Permitir reacciones</label>
                            <fieldset>
                              <legend className={LEGEND}>Quién puede comentar</legend>
                              <div className="flex flex-wrap gap-x-4 gap-y-2">
                                {p.audience.map(a => (
                                  <label key={a} className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="comment_roles[]" value={a} defaultChecked={p.comment_roles.includes(a)} className={CHECK} />{ROLE_SHORT[a]}</label>
                                ))}
                              </div>
                            </fieldset>
                            <p className="text-xs text-v-subtle">Sin ninguna casilla marcada, los comentarios quedan desactivados. Los comentarios ya publicados no se borran: puedes ocultarlos uno a uno.</p>
                          </FormDialog>
                        )}
                        {(isAuthor || session.role === 'admin') && (
                          <ConfirmAction action={deletePost.bind(null, p.id)} title="Eliminar publicación" danger confirmLabel="Eliminar" ariaLabel="Eliminar publicación"
                            message="Se eliminará la publicación con sus imágenes, reacciones y comentarios. No se puede deshacer."><Trash2 size={15} /></ConfirmAction>
                        )}
                      </div>
                    </div>

                    <div className="px-4 pb-4 pt-3 sm:px-5">
                      <h2 className="text-[16.5px] font-semibold leading-snug tracking-tight">{p.title}</h2>
                      <p className="mt-1.5 whitespace-pre-wrap break-words text-[14px] leading-relaxed text-v-text/85">{linkify(p.body)}</p>
                    </div>
                  </div>

                  {images.length > 0 && (
                    <div className={`grid gap-0.5 bg-v-fill lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:border-r lg:border-v-border ${images.length === 1 ? 'grid-cols-1 place-items-center' : 'grid-cols-2 content-center'}`}>
                      {images.map((path, n) => (
                        <a key={path} href={imageUrl(path)} target="_blank" rel="noreferrer" aria-label={`Abrir imagen ${n + 1} de ${images.length}`}
                          className={`block w-full overflow-hidden ${images.length === 3 && n === 0 ? 'col-span-2' : ''}`}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={imageUrl(path)} alt={`Imagen ${n + 1} de «${p.title}»`} loading="lazy"
                            className={images.length === 1 ? 'mx-auto max-h-[70vh] w-full object-contain lg:max-h-[560px]' : `w-full object-cover ${images.length === 3 && n === 0 ? 'aspect-[2/1]' : 'aspect-square'}`} />
                        </a>
                      ))}
                    </div>
                  )}

                  <div className={images.length > 0 ? 'lg:col-start-2 lg:row-start-2 lg:self-end' : ''}>
                    <PostInteractions postId={p.id} me={{ id: session.userId, name: session.fullName }} allowReactions={p.allow_reactions} canComment={canComment} commentNote={commentNote}
                      canModerate={canModerate} counts={counts} mine={(own.find(r => r.user_id === session.userId)?.kind as ReactionKind | undefined) ?? null} comments={postComments} compact={images.length > 0} />
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
    </>
  )
}
