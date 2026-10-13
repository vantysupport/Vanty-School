import 'server-only'
import crypto from 'crypto'
import WebSocket from 'ws'

// Voz de ARIA: la misma voz neuronal que usa VANTY ABA (servicio «Leer en voz alta» de Microsoft Edge).
// No requiere clave. El audio se genera al momento y no se almacena.
// Importante: el texto que se lee viaja al servicio de voz de Microsoft, y el acceso es por el protocolo del
// navegador Edge, sin contrato de servicio. Para producción conviene migrar a Azure Speech (misma voz, con acuerdo).

const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4'
// Debe parecerse a una versión reciente de Edge; si el servicio responde 403, basta con actualizarla por entorno.
const VERSION = process.env.EDGE_TTS_VERSION || '1-138.0.3351.65'
const MAJOR = VERSION.match(/^1-(\d+)/)?.[1] || '138'
const ENDPOINT = 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1'
export const ARIA_VOICE = process.env.EDGE_TTS_VOICE || 'es-PE-CamilaNeural'

// Token rotativo (cada 5 minutos). Se calcula con aritmética de coma flotante, igual que el cliente oficial:
// el servicio valida contra ese valor y un cálculo con enteros exactos produce un token distinto.
function token() {
  let ticks = Date.now() / 1000 + 11644473600
  ticks -= ticks % 300
  ticks *= 1e7
  return crypto.createHash('sha256').update(ticks.toFixed(0) + TRUSTED_CLIENT_TOKEN, 'ascii').digest('hex').toUpperCase()
}

function stamp() {
  const d = new Date()
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${days[d.getUTCDay()]} ${months[d.getUTCMonth()]} ${pad(d.getUTCDate())} ${d.getUTCFullYear()} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} GMT+0000 (Coordinated Universal Time)`
}

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')

/** Genera el audio (MP3) de un texto con la voz de ARIA. El resultado vive solo en memoria. */
export function synthesize(text: string, voice = ARIA_VOICE): Promise<Buffer> {
  const lang = voice.split('-').slice(0, 2).join('-') || 'es-PE'
  const url = `${ENDPOINT}?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}&Sec-MS-GEC=${token()}&Sec-MS-GEC-Version=${VERSION}`
  return new Promise<Buffer>((resolve, reject) => {
    const ws = new WebSocket(url, {
      headers: {
        Pragma: 'no-cache', 'Cache-Control': 'no-cache', Origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
        'Accept-Encoding': 'gzip, deflate, br', 'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${MAJOR}.0.0.0 Safari/537.36 Edg/${MAJOR}.0.0.0`,
      },
    })
    const chunks: Buffer[] = []
    let done = false
    const finish = (err?: Error) => {
      if (done) return
      done = true
      clearTimeout(timeout)
      try { ws.close() } catch { /* ya cerrado */ }
      if (err) reject(err)
      else resolve(Buffer.concat(chunks))
    }
    const timeout = setTimeout(() => finish(new Error('La voz tardó demasiado en responder')), 20_000)

    ws.on('open', () => {
      const date = stamp()
      ws.send(`X-Timestamp:${date}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
        '{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}')
      const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${lang}'><voice name='${voice}'>` +
        `<prosody pitch='+0Hz' rate='+0%' volume='+0%'>${xml(text)}</prosody></voice></speak>`
      ws.send(`X-RequestId:${crypto.randomUUID().replace(/-/g, '')}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${date}Z\r\nPath:ssml\r\n\r\n${ssml}`)
    })
    ws.on('message', (data: Buffer, isBinary: boolean) => {
      if (isBinary) {
        // Trama binaria: [uint16 = largo de cabecera][cabecera][audio]
        if (data.length < 2) return
        const header = data.readUInt16BE(0)
        if (data.length > header + 2) chunks.push(data.subarray(header + 2))
      } else if (data.toString('utf8').includes('Path:turn.end')) finish()
    })
    ws.on('error', e => finish(e instanceof Error ? e : new Error(String(e))))
    ws.on('close', () => finish())
  })
}
