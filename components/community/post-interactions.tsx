'use client'
import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CornerUpLeft, Eye, EyeOff, Loader2, Lock, MessageCircle, Send, Trash2, X } from 'lucide-react'
import { addComment, deleteComment, reactToPost, setCommentHidden } from '@/lib/actions/community'
import type { ActionResult } from '@/lib/actions/result'
import { REACTIONS, type ReactionKind } from '@/lib/community'
import { Avatar } from '@/components/ui/primitives'
import { useToast } from '@/components/ui/toast'

export type PostComment = { id: string; authorId: string; name: string; role: string; body: string; when: string; hidden: boolean; mine: boolean; parentId: string | null }
type Props = {
  postId: string
  me: { id: string; name: string }
  allowReactions: boolean
  canComment: boolean
  commentNote: string | null          // por qué no se puede comentar (o quién puede)
  canModerate: boolean
  counts: Partial<Record<ReactionKind, number>>
  mine: ReactionKind | null
  comments: PostComment[]
  compact?: boolean                   // columna angosta (publicación con imágenes): reacciones solo con emoji
}

const PREVIEW = 2

/** Reacciones y comentarios de una publicación. La interfaz se adelanta al servidor y se corrige si este rechaza la acción. */
export function PostInteractions({ postId, me, allowReactions, canComment, commentNote, canModerate, counts, mine, comments, compact }: Props) {
  const router = useRouter()
  const toast = useToast()
  const [pending, start] = useTransition()
  const [local, setLocal] = useState<{ mine: ReactionKind | null; counts: Partial<Record<ReactionKind, number>> } | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [replyTo, setReplyTo] = useState<PostComment | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const byId = new Map(comments.map(c => [c.id, c]))
  const form = useRef<HTMLFormElement>(null)
  const state = local ?? { mine, counts }
  const total = REACTIONS.reduce((n, r) => n + (state.counts[r.kind] ?? 0), 0)
  const visible = comments.filter(c => !c.hidden).length
  const shown = expanded ? comments : comments.slice(-PREVIEW)

  const run = (action: () => Promise<ActionResult>, onFail?: () => void, quiet = false) => start(async () => {
    let res: ActionResult
    try { res = await action() } catch { res = { ok: false, error: 'No se pudo completar la acción.' } }
    if (res.ok) { if (!quiet && res.message) toast.success(res.message); router.refresh() }
    else { onFail?.(); toast.error(res.error) }
    setLocal(null)
  })

  const react = (kind: ReactionKind) => {
    const next = state.mine === kind ? null : kind
    const nextCounts = { ...state.counts }
    if (state.mine) nextCounts[state.mine] = Math.max(0, (nextCounts[state.mine] ?? 1) - 1)
    if (next) nextCounts[next] = (nextCounts[next] ?? 0) + 1
    setLocal({ mine: next, counts: nextCounts })
    run(() => reactToPost(postId, next), undefined, true)
  }

  return (
    <div className="border-t border-v-border">
      <div className="flex flex-wrap items-center gap-1.5 px-4 py-3 sm:gap-2 sm:px-5">
        {allowReactions ? REACTIONS.map(r => {
          const on = state.mine === r.kind
          const n = state.counts[r.kind] ?? 0
          return (
            <button key={r.kind} type="button" onClick={() => react(r.kind)} disabled={pending} aria-pressed={on} title={r.label}
              className={`inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold transition-all active:scale-95 sm:h-9 sm:flex-none ${on ? 'border-v-accent bg-v-accent-soft text-v-accent' : 'border-v-border bg-v-elevated text-v-muted hover:border-v-accent hover:text-v-text'}`}>
              <span className="text-[15px] leading-none">{r.emoji}</span><span className={compact ? 'sr-only' : 'hidden xl:inline'}>{r.label}</span>{n > 0 && <span className="tabular-nums">{n}</span>}
            </button>
          )
        }) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-v-fill px-3 py-1.5 text-xs font-medium text-v-subtle"><Lock size={12} />Reacciones desactivadas{total > 0 ? ` · ${total} antes del cierre` : ''}</span>
        )}
        <span className="inline-flex w-full items-center justify-end gap-1.5 pt-1 text-xs text-v-subtle sm:ml-auto sm:w-auto sm:pt-0"><MessageCircle size={13} />{visible} {visible === 1 ? 'comentario' : 'comentarios'}</span>
      </div>

      {(comments.length > 0 || canComment || commentNote) && (
        <div className="space-y-3 border-t border-v-border bg-v-fill/40 px-4 py-4 sm:px-5">
          {comments.length > PREVIEW && (
            <button type="button" onClick={() => setExpanded(v => !v)} className="text-xs font-semibold text-v-accent hover:underline">
              {expanded ? 'Mostrar solo los más recientes' : `Ver los ${comments.length} comentarios`}
            </button>
          )}
          {/* Como en un chat: lo tuyo a la derecha y en azul; lo de los demás a la izquierda. */}
          {shown.map(c => {
            const parent = c.parentId ? byId.get(c.parentId) : null
            return (
              <div key={c.id} className={`group flex gap-2.5 ${c.mine ? 'flex-row-reverse' : ''} ${c.hidden ? 'opacity-60' : ''}`}>
                <Avatar name={c.name || '?'} id={c.authorId} size={30} />
                <div className={`flex min-w-0 max-w-[85%] flex-col ${c.mine ? 'items-end' : 'items-start'}`}>
                  <div className={`max-w-full px-3.5 py-2 shadow-v-xs ${c.mine ? 'v-brand rounded-[16px] rounded-tr-md' : 'rounded-[16px] rounded-tl-md bg-v-elevated'}`}>
                    <p className="flex flex-wrap items-center gap-x-2 text-[12.5px]">
                      <span className={`font-semibold ${c.mine ? 'text-white' : 'text-v-text'}`}>{c.mine ? 'Tú' : c.name || 'Integrante del colegio'}</span>
                      <span className={`rounded-full px-2 py-px text-[10.5px] font-semibold ${c.mine ? 'bg-white/20 text-white' : 'bg-v-fill text-v-muted'}`}>{c.role}</span>
                      {c.hidden && <span className="inline-flex items-center gap-1 rounded-full bg-v-warning/15 px-2 py-px text-[10.5px] font-semibold text-v-warning"><EyeOff size={10} />Oculto por moderación</span>}
                    </p>
                    {parent && (
                      <p className={`mt-1.5 rounded-lg border-l-[3px] px-2.5 py-1.5 text-[12px] leading-snug ${c.mine ? 'border-white/70 bg-white/15 text-white/90' : 'border-v-accent bg-v-fill text-v-muted'}`}>
                        <span className="block font-semibold">{parent.mine ? 'Tú' : parent.name || 'Integrante del colegio'}</span>
                        <span className="line-clamp-2 break-words">{parent.hidden ? 'Comentario oculto por moderación' : parent.body}</span>
                      </p>
                    )}
                    {c.parentId && !parent && <p className={`mt-1.5 text-[11.5px] italic ${c.mine ? 'text-white/75' : 'text-v-subtle'}`}>Respuesta a un comentario eliminado</p>}
                    <p className={`mt-0.5 whitespace-pre-wrap break-words text-[13.5px] leading-relaxed ${c.mine ? 'text-white' : 'text-v-text'}`}>{c.body}</p>
                  </div>
                  <p className={`mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 px-2 text-[11px] text-v-subtle ${c.mine ? 'justify-end' : ''}`}>
                    <span>{c.when}</span>
                    {canComment && !c.hidden && (
                      <button type="button" onClick={() => { setReplyTo(c); input.current?.focus() }} className="inline-flex items-center gap-1 font-semibold hover:text-v-accent"><CornerUpLeft size={11} />Responder</button>
                    )}
                    {canModerate && (
                      <button type="button" disabled={pending} onClick={() => run(() => setCommentHidden(c.id, !c.hidden))} className="inline-flex items-center gap-1 font-semibold hover:text-v-accent">
                        {c.hidden ? <><Eye size={11} />Volver a mostrar</> : <><EyeOff size={11} />Ocultar</>}
                      </button>
                    )}
                    {c.mine && (
                      <button type="button" disabled={pending} onClick={() => run(() => deleteComment(c.id))} className="inline-flex items-center gap-1 font-semibold hover:text-v-danger"><Trash2 size={11} />Eliminar</button>
                    )}
                  </p>
                </div>
              </div>
            )
          })}

          {canComment ? (
            <div>
              {replyTo && (
                <p className="mb-2 ml-10 flex items-center gap-2 rounded-lg border-l-[3px] border-v-accent bg-v-elevated px-3 py-1.5 text-[12px] text-v-muted shadow-v-xs">
                  <CornerUpLeft size={13} className="shrink-0 text-v-accent" />
                  <span className="min-w-0 flex-1 truncate">Respondiendo a <span className="font-semibold text-v-text">{replyTo.mine ? 'tu comentario' : replyTo.name}</span>: {replyTo.body}</span>
                  <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancelar respuesta" className="shrink-0 text-v-subtle hover:text-v-text"><X size={13} /></button>
                </p>
              )}
              <form ref={form} className="flex items-center gap-2.5" action={data => run(async () => { const res = await addComment(postId, data); if (res.ok) { form.current?.reset(); setReplyTo(null); setExpanded(true) } return res })}>
                <Avatar name={me.name} id={me.id} size={30} />
                {replyTo && <input type="hidden" name="parent_id" value={replyTo.id} />}
                <input ref={input} name="body" required maxLength={1000} autoComplete="off" placeholder={replyTo ? 'Escribe tu respuesta…' : 'Escribe un comentario respetuoso…'} aria-label={replyTo ? 'Escribe tu respuesta' : 'Escribe un comentario'}
                  className="v-input !h-10 flex-1 !rounded-full !py-0 text-[13.5px]" />
                <button type="submit" disabled={pending} aria-label={replyTo ? 'Publicar respuesta' : 'Publicar comentario'} className="v-brand grid size-10 shrink-0 place-items-center rounded-full shadow-v-brand disabled:opacity-60">
                  {pending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                </button>
              </form>
            </div>
          ) : commentNote && (
            <p className="inline-flex items-center gap-1.5 text-xs text-v-subtle"><Lock size={12} />{commentNote}</p>
          )}
        </div>
      )}
    </div>
  )
}
