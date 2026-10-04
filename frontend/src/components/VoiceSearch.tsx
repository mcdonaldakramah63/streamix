// Voice search button using the Web Speech API (hidden where unsupported)
import { useState, useRef, useCallback, useEffect } from 'react'
import Icon from './Icon'

interface Props {
  onResult: (text: string) => void
}

export default function VoiceSearch({ onResult }: Props) {
  const [listening, setListening] = useState(false)
  const [supported] = useState(() => 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window)
  const recRef = useRef<any>(null)

  useEffect(() => () => recRef.current?.abort?.(), [])

  const start = useCallback(() => {
    if (!supported || listening) return
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    const recognition = new SR()
    recRef.current = recognition
    recognition.lang            = navigator.language || 'en-US'
    recognition.interimResults  = false
    recognition.maxAlternatives = 1
    recognition.onstart  = () => setListening(true)
    recognition.onend    = () => setListening(false)
    recognition.onerror  = () => setListening(false)
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript
      if (transcript) onResult(transcript)
    }
    recognition.start()
  }, [supported, listening, onResult])

  const stop = useCallback(() => { recRef.current?.stop(); setListening(false) }, [])

  if (!supported) return null

  return (
    <button
      type="button"
      onClick={listening ? stop : start}
      aria-label={listening ? 'Stop listening' : 'Voice search'}
      className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
        listening ? 'bg-brand/20 text-brand animate-pulse shadow-brand-sm' : 'text-ink-faint hover:text-white'
      }`}>
      <Icon name="mic" size={18} fill={listening} />
    </button>
  )
}
