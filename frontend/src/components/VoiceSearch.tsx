// frontend/src/components/VoiceSearch.tsx — NEW FILE
// Drop-in voice search button using Web Speech API
import { useState, useRef, useCallback } from 'react'

interface Props {
  onResult: (text: string) => void
}

export default function VoiceSearch({ onResult }: Props) {
  const [listening, setListening] = useState(false)
  const [supported] = useState(() => 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window)
  const recRef = useRef<any>(null)

  const start = useCallback(() => {
    if (!supported || listening) return

    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    const recognition = new SR()
    recRef.current = recognition

    recognition.lang            = 'en-US'
    recognition.interimResults  = false
    recognition.maxAlternatives = 1

    recognition.onstart  = () => setListening(true)
    recognition.onend    = () => setListening(false)
    recognition.onerror  = () => setListening(false)

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript
      if (transcript) onResult(transcript)
      setListening(false)
    }

    recognition.start()
  }, [supported, listening, onResult])

  const stop = useCallback(() => {
    recRef.current?.stop()
    setListening(false)
  }, [])

  if (!supported) return null

  return (
    <button
      onClick={listening ? stop : start}
      title={listening ? 'Stop listening' : 'Voice search'}
      className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all flex-shrink-0 ${
        listening
          ? 'bg-red-500/20 border border-red-500/40 text-red-400 animate-pulse'
          : 'bg-dark-card border border-dark-border text-slate-500 hover:text-brand hover:border-brand/40'
      }`}>
      {listening ? (
        // Mic active — pulsing red
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <rect x="9" y="2" width="6" height="12" rx="3"/>
          <path d="M5 10c0 4 3 7 7 7s7-3 7-7" stroke="currentColor" strokeWidth="2" fill="none"/>
          <line x1="12" y1="17" x2="12" y2="21" stroke="currentColor" strokeWidth="2"/>
          <line x1="8" y1="21" x2="16" y2="21" stroke="currentColor" strokeWidth="2"/>
        </svg>
      ) : (
        // Mic idle
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="9" y="2" width="6" height="12" rx="3"/>
          <path d="M5 10c0 4 3 7 7 7s7-3 7-7"/>
          <line x1="12" y1="17" x2="12" y2="21"/>
          <line x1="8" y1="21" x2="16" y2="21"/>
        </svg>
      )}
    </button>
  )
}
