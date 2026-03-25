// frontend/src/components/SleepTimer.tsx — NEW FILE
import { useState, useEffect, useRef } from 'react'

interface Props {
  onExpire: () => void  // called when timer runs out — pause playback
}

const PRESETS = [
  { label: '15 min', mins: 15 },
  { label: '30 min', mins: 30 },
  { label: '45 min', mins: 45 },
  { label: '1 hour', mins: 60 },
  { label: 'End of ep', mins: -1 },  // -1 = special case handled externally
]

export default function SleepTimer({ onExpire }: Props) {
  const [open,      setOpen]      = useState(false)
  const [remaining, setRemaining] = useState<number | null>(null) // seconds
  const intervalRef = useRef<ReturnType<typeof setInterval>>()

  const start = (mins: number) => {
    if (mins === -1) {
      // "End of episode" — just set a flag, parent handles it
      setRemaining(-1)
      setOpen(false)
      return
    }
    clearInterval(intervalRef.current)
    setRemaining(mins * 60)
    setOpen(false)
  }

  const cancel = () => {
    clearInterval(intervalRef.current)
    setRemaining(null)
  }

  useEffect(() => {
    if (remaining === null || remaining === -1) return
    intervalRef.current = setInterval(() => {
      setRemaining(r => {
        if (r === null || r <= 1) {
          clearInterval(intervalRef.current)
          onExpire()
          return null
        }
        return r - 1
      })
    }, 1000)
    return () => clearInterval(intervalRef.current)
  }, [remaining !== null && remaining > 0])

  const fmt = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${String(sec).padStart(2,'0')}`
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all border ${
          remaining !== null
            ? 'bg-brand/15 border-brand/30 text-brand'
            : 'bg-dark-card border-dark-border text-slate-400 hover:border-brand/40 hover:text-white'
        }`}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
        {remaining !== null && remaining > 0
          ? `Sleep: ${fmt(remaining)}`
          : remaining === -1
          ? 'End ep'
          : 'Sleep'}
      </button>

      {open && (
        <div className="absolute bottom-full right-0 mb-2 glass rounded-2xl overflow-hidden shadow-deep z-50 animate-slide-down min-w-[140px]">
          <div className="px-3 py-2 border-b border-dark-border">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Sleep Timer</p>
          </div>
          {PRESETS.map(p => (
            <button key={p.label} onClick={() => start(p.mins)}
              className="block w-full px-4 py-2.5 text-left text-xs text-slate-300 hover:bg-dark-hover hover:text-white transition-colors">
              {p.label}
            </button>
          ))}
          {remaining !== null && (
            <>
              <div className="border-t border-dark-border" />
              <button onClick={cancel}
                className="block w-full px-4 py-2.5 text-left text-xs text-red-400 hover:bg-dark-hover transition-colors">
                Cancel timer
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
