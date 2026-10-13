'use client'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'

// Voz de ARIA. Usa la misma voz neuronal que VANTY ABA, generada en el servidor (/api/aria/voz) oración por oración
// para que empiece a sonar de inmediato. Si ese servicio no responde, lee con la voz del propio navegador.

const KEY = 'vs_aria_voz'
const EVENT = 'vs-aria-voz'
const noop = () => () => {}

const subscribeAuto = (onChange: () => void) => {
  window.addEventListener('storage', onChange)
  window.addEventListener(EVENT, onChange)
  return () => { window.removeEventListener('storage', onChange); window.removeEventListener(EVENT, onChange) }
}
const readAuto = () => { try { return localStorage.getItem(KEY) === '1' } catch { return false } }

/** Deja el texto listo para leerse: sin marcas de formato y con pausas entre párrafos y viñetas. */
function speakable(text: string) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1').replace(/^#{1,6}\s+/gm, '').replace(/^\s*(?:[-*•]|\d+[.)])\s+/gm, '')
    .replace(/https?:\/\/\S+/g, 'enlace').replace(/[<>|_`~]/g, ' ')
    .replace(/(\d)\.([ºª°])/g, '$1$2')                  // 7.º → 7º, para que no se tome como fin de oración
    .replace(/\n{2,}/g, '. ').replace(/\n/g, '. ').replace(/\s+/g, ' ').replace(/([.!?:;])\s*\./g, '$1').trim()
}

/** Trozos por oración: el primero sale corto para que la voz parta rápido; el resto se agrupa. */
function chunks(text: string, max = 280) {
  const out: string[] = []
  let current = ''
  for (const sentence of text.split(/(?<=[.!?…])\s+/)) {
    if (!sentence) continue
    if (current && (out.length === 0 || (current + ' ' + sentence).length > max)) { out.push(current); current = sentence }
    else current = current ? `${current} ${sentence}` : sentence
    while (current.length > max * 1.6) {
      const cut = current.lastIndexOf(' ', max)
      out.push(current.slice(0, cut > 40 ? cut : max))
      current = current.slice(cut > 40 ? cut + 1 : max)
    }
  }
  if (current) out.push(current)
  return out
}

function pickBrowserVoice() {
  const voices = window.speechSynthesis.getVoices().filter(v => v.lang?.toLowerCase().startsWith('es'))
  const rank = (v: SpeechSynthesisVoice) => {
    const natural = /natural|neural|online/i.test(v.name) ? 0 : 4
    const feminine = /camila|catalina|sabina|helena|laura|paulina|m[oó]nica|elena|dalia|paloma|elvira|francisca|google espa/i.test(v.name) ? 0 : 2
    const region = /^es[-_](cl|pe|419|us|mx|ar|co)$/i.test(v.lang) ? 0 : 1
    return natural + feminine + region
  }
  return voices.sort((a, b) => rank(a) - rank(b))[0] ?? null
}

export function useAriaVoice() {
  const supported = useSyncExternalStore(noop, () => typeof Audio !== 'undefined', () => false)
  const auto = useSyncExternalStore(subscribeAuto, readAuto, () => false)
  const [speaking, setSpeaking] = useState<number | null>(null)   // índice del mensaje que se está leyendo
  const token = useRef(0)
  const audio = useRef<HTMLAudioElement | null>(null)
  const abort = useRef<AbortController | null>(null)

  const silence = useCallback(() => {
    abort.current?.abort()
    abort.current = null
    try { audio.current?.pause() } catch { /* nada que pausar */ }
    audio.current = null
    try { window.speechSynthesis?.cancel() } catch { /* sin síntesis local */ }
  }, [])

  const stop = useCallback(() => { token.current++; silence(); setSpeaking(null) }, [silence])

  /** Respaldo: voz del navegador para lo que falte por leer. */
  const speakLocally = useCallback((parts: string[], mine: number) => {
    if (!('speechSynthesis' in window) || parts.length === 0) { if (mine === token.current) setSpeaking(null); return }
    const voice = pickBrowserVoice()
    parts.forEach((part, i) => {
      const u = new SpeechSynthesisUtterance(part)
      if (voice) u.voice = voice
      u.lang = voice?.lang ?? 'es-CL'
      u.onend = () => { if (i === parts.length - 1 && mine === token.current) setSpeaking(null) }
      u.onerror = () => { if (mine === token.current) setSpeaking(null) }
      window.speechSynthesis.speak(u)
    })
  }, [])

  const speak = useCallback((text: string, index: number) => {
    const mine = ++token.current
    silence()
    const parts = chunks(speakable(text))
    if (parts.length === 0) return
    setSpeaking(index)
    const controller = new AbortController()
    abort.current = controller

    const fetchAudio = async (part: string) => {
      const res = await fetch('/api/aria/voz', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: part }), signal: controller.signal })
      if (!res.ok) throw new Error('voz')
      return URL.createObjectURL(await res.blob())
    }
    const play = (url: string) => new Promise<void>((resolve, reject) => {
      const element = new Audio(url)
      audio.current = element
      element.onended = () => { URL.revokeObjectURL(url); resolve() }
      element.onerror = () => { URL.revokeObjectURL(url); reject(new Error('audio')) }
      element.play().catch(reject)
    })

    void (async () => {
      // Mientras suena una oración se pide la siguiente, para que no haya silencios entre ellas.
      let next: Promise<string> | null = fetchAudio(parts[0])
      for (let i = 0; i < parts.length; i++) {
        let url: string
        try { url = await next! } catch {
          if (mine === token.current) speakLocally(parts.slice(i), mine)
          return
        }
        if (mine !== token.current) { URL.revokeObjectURL(url); return }
        next = i + 1 < parts.length ? fetchAudio(parts[i + 1]) : null
        next?.catch(() => {})   // el error se atiende en la siguiente vuelta
        try { await play(url) } catch {
          if (mine === token.current) speakLocally(parts.slice(i), mine)
          return
        }
        if (mine !== token.current) return
      }
      setSpeaking(null)
    })()
  }, [silence, speakLocally])

  const setAuto = useCallback((on: boolean) => {
    try { localStorage.setItem(KEY, on ? '1' : '0') } catch { /* almacenamiento bloqueado */ }
    window.dispatchEvent(new Event(EVENT))
    if (!on) stop()
  }, [stop])

  useEffect(() => () => { token.current++; silence() }, [silence])

  return { supported, auto, setAuto, speaking, speak, stop }
}
