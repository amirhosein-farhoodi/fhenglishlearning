import { useEffect, useRef, useState } from 'react'
import { langAttr } from '../content/languages'
import { plain } from '../lib/markup'
import { speak, stopSpeaking, useVoice } from '../lib/speech'
import { useTargetLang } from '../lib/targetLang'
import { Speaker } from './Icons'

/**
 * Reads one target-language example aloud. Renders nothing for English books, and nothing when
 * the device has no voice for the book's language.
 */
export default function SpeakButton({ text }: { text: string }) {
  const language = useTargetLang()
  const voice = useVoice(langAttr(language) ? language.speechLang : null)
  const [speaking, setSpeaking] = useState(false)
  const speakingRef = useRef(false)
  speakingRef.current = speaking

  // Leaving the page (or the block) mid-sentence should not leave a voice talking.
  useEffect(
    () => () => {
      if (speakingRef.current) stopSpeaking()
    },
    [],
  )

  if (!voice) return null

  const onClick = () => {
    if (speaking) {
      stopSpeaking()
      setSpeaking(false)
      return
    }
    setSpeaking(true)
    speak(text, voice, () => setSpeaking(false))
  }

  return (
    <button
      type="button"
      className={`speak-btn${speaking ? ' on' : ''}`}
      onClick={onClick}
      aria-pressed={speaking}
      aria-label={`${speaking ? 'Stop' : 'Listen'}: ${plain(text)}`}
      title={speaking ? 'Stop' : `Listen in ${language.name}`}
      lang="en"
    >
      <Speaker size={16} />
    </button>
  )
}
