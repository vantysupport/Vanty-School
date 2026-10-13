import 'server-only'
import { createHash, randomBytes } from 'crypto'

/** Token de invitación: 256 bits aleatorios. En la base de datos solo se guarda su hash SHA-256. */
export const newToken = () => randomBytes(32).toString('base64url')
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')
export const isTokenShaped = (token: string) => /^[A-Za-z0-9_-]{40,64}$/.test(token)
