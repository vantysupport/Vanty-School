// Comunidad: constantes compartidas entre servidor y navegador.

export const REACTIONS = [
  { kind: 'like', label: 'Me gusta', emoji: '👍' },
  { kind: 'love', label: 'Me encanta', emoji: '❤️' },
  { kind: 'celebrate', label: 'Celebro', emoji: '🎉' },
  { kind: 'thanks', label: 'Gracias', emoji: '🙏' },
] as const

export type ReactionKind = (typeof REACTIONS)[number]['kind']
export const REACTION_KINDS = REACTIONS.map(r => r.kind) as [ReactionKind, ...ReactionKind[]]

export const MAX_IMAGES = 4
export const IMAGE_TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }
/** Las imágenes de la comunidad viven en el bucket privado `materials`, dentro de la carpeta del colegio. */
export const communityPrefix = (institutionId: string) => `${institutionId}/comunidad/`
export const IMAGE_PATH = /^[0-9a-f-]{36}\/comunidad\/[0-9a-f-]{36}\.(png|jpg|webp)$/i
