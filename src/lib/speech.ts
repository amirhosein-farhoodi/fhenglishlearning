import { useEffect, useState } from 'react'

/**
 * Read-aloud for target-language examples, on the browser's own speech synthesis.
 *
 * Language books come without their audio, so this is how a learner hears "Je voudrais un café
 * crème" said by a French voice. Nothing is fetched and nothing is sent anywhere: the voices are
 * the operating system's. When the device has no voice for the language the button simply does
 * not appear - a wrong-language voice reading French is worse than silence.
 */

const synth: SpeechSynthesis | null =
  typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null

const tag = (l: string) => l.replace('_', '-').toLowerCase()

function pickVoice(lang: string): SpeechSynthesisVoice | null {
  if (!synth) return null
  const want = tag(lang)
  const base = want.split('-')[0]
  const voices = synth.getVoices()
  // Same region first (fr-FR over fr-CA), then any voice of the language.
  const exact = voices.filter((v) => tag(v.lang) === want)
  const family = voices.filter((v) => tag(v.lang) === base || tag(v.lang).startsWith(`${base}-`))
  const pool = exact.length ? exact : family
  // Prefer the platform's default, then an on-device voice (works offline, starts instantly).
  return pool.find((v) => v.default) ?? pool.find((v) => v.localService) ?? pool[0] ?? null
}

/** The best voice for `lang`, updated when the browser finishes loading its voice list. */
export function useVoice(lang: string | null): SpeechSynthesisVoice | null {
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(() => (lang ? pickVoice(lang) : null))
  useEffect(() => {
    if (!synth || !lang) {
      setVoice(null)
      return
    }
    // Chrome fills getVoices() asynchronously and announces it with voiceschanged.
    const update = () => setVoice(pickVoice(lang))
    update()
    synth.addEventListener('voiceschanged', update)
    return () => synth.removeEventListener('voiceschanged', update)
  }, [lang])
  return voice
}

/**
 * Content markup turned into what should be said: speaker labels (*Le serveur :*), wrong forms
 * (~~...~~) and blanks are dropped; bold and italic keep their words.
 */
export function speakable(text: string): string {
  return text
    .replace(/\*[^*\n]+?\s?:\*/g, ' ')
    .replace(/~~[^~]+~~/g, ' ')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/___/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * The callback of whatever is playing now. Browsers disagree on whether cancel() fires the
 * interrupted utterance's events (Safari often does not), so speak() and stopSpeaking() call it
 * themselves - otherwise a button could stay lit after another one took over.
 */
let finishCurrent: (() => void) | null = null

/** Speak `text`, cutting off anything already playing. `onDone` fires once: on end, error or cancel. */
export function speak(text: string, voice: SpeechSynthesisVoice, onDone: () => void) {
  stopSpeaking()
  if (!synth) return onDone()
  let finished = false
  const finish = () => {
    if (finished) return
    finished = true
    if (finishCurrent === finish) finishCurrent = null
    onDone()
  }
  finishCurrent = finish
  const u = new SpeechSynthesisUtterance(speakable(text))
  u.voice = voice
  u.lang = voice.lang
  // A touch slower than conversational: these are learners hearing a sentence for the first time.
  u.rate = 0.9
  u.onend = finish
  u.onerror = finish
  synth.speak(u)
}

export function stopSpeaking() {
  const finish = finishCurrent
  finishCurrent = null
  synth?.cancel()
  finish?.()
}
