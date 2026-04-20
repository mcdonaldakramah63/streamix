// frontend/src/components/PinModal.tsx — FULL REPLACEMENT
import { useState, useEffect, useCallback } from 'react'

interface Props {
  title?: string
  subtitle?: string
  storedPin?: string          // validate mode — compare against this
  onSetPin?: (pin: string) => void  // set mode — called with new pin
  onSuccess: () => void
  onCancel?: () => void
}

const NUMPAD = ['1','2','3','4','5','6','7','8','9','','0','⌫']

export default function PinModal({
  title = 'Enter PIN',
  subtitle = 'Enter your 4-digit PIN to continue',
  storedPin,
  onSetPin,
  onSuccess,
  onCancel,
}: Props) {
  const isSetMode = !storedPin && !!onSetPin

  const [digits, setDigits]     = useState<string[]>([])
  const [shake, setShake]       = useState(false)
  const [error, setError]       = useState('')
  const [success, setSuccess]   = useState(false)
  const [phase, setPhase]       = useState<'enter' | 'confirm'>('enter')
  const [firstPin, setFirstPin] = useState('')

  const displayTitle = isSetMode
    ? (phase === 'enter' ? 'Create PIN' : 'Confirm PIN')
    : title

  const displaySubtitle = isSetMode
    ? (phase === 'enter' ? 'Choose a 4-digit PIN for kids mode' : 'Re-enter your PIN to confirm')
    : subtitle

  const triggerShake = (msg: string) => {
    setError(msg)
    setShake(true)
    setDigits([])
    setTimeout(() => setShake(false), 550)
  }

  const checkPin = useCallback(() => {
    const pin = digits.join('')

    if (isSetMode) {
      if (phase === 'enter') {
        setFirstPin(pin)
        setDigits([])
        setPhase('confirm')
        return
      }
      if (pin === firstPin) {
        setSuccess(true)
        setTimeout(() => { onSetPin!(pin); onSuccess() }, 400)
      } else {
        setPhase('enter')
        setFirstPin('')
        triggerShake("PINs don't match. Try again.")
      }
      return
    }

    if (pin === storedPin) {
      setSuccess(true)
      setTimeout(onSuccess, 400)
    } else {
      triggerShake('Incorrect PIN. Try again.')
    }
  }, [digits, phase, firstPin, isSetMode, storedPin, onSetPin, onSuccess])

  // Auto-submit when 4 digits entered
  useEffect(() => {
    if (digits.length === 4) {
      const t = setTimeout(checkPin, 150)
      return () => clearTimeout(t)
    }
  }, [digits, checkPin])

  // Keyboard support
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        setDigits(d => d.length < 4 ? [...d, e.key] : d)
        setError('')
      } else if (e.key === 'Backspace') {
        setDigits(d => d.slice(0, -1))
        setError('')
      } else if (e.key === 'Escape') {
        onCancel?.()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onCancel])

  const handleKey = (key: string) => {
    if (key === '⌫') {
      setDigits(d => d.slice(0, -1))
      setError('')
    } else if (digits.length < 4) {
      setDigits(d => [...d, key])
      setError('')
    }
  }

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center px-5"
      style={{ background: 'rgba(4,5,9,0.88)', backdropFilter: 'blur(16px)' }}
      onClick={e => { if (e.target === e.currentTarget) onCancel?.() }}
    >
      <div
        className="w-full max-w-[320px]"
        style={{ animation: 'pinModalIn 0.3s cubic-bezier(0.34,1.56,0.64,1) both' }}
      >
        {/* Card */}
        <div
          className="rounded-3xl overflow-hidden"
          style={{
            background: 'linear-gradient(160deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)',
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 40px 100px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.08)',
          }}
        >
          {/* Header */}
          <div className="px-8 pt-8 pb-5 text-center">
            {/* Lock icon */}
            <div
              className="w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center"
              style={{
                background: success
                  ? 'linear-gradient(135deg, rgba(20,184,166,0.25), rgba(20,184,166,0.1))'
                  : 'rgba(255,255,255,0.06)',
                border: `1px solid ${success ? 'rgba(20,184,166,0.4)' : 'rgba(255,255,255,0.08)'}`,
                transition: 'all 0.3s',
              }}
            >
              <span className="text-2xl">{success ? '✓' : isSetMode ? '🔑' : '🔒'}</span>
            </div>

            <h2
              className="text-white text-[18px] font-bold mb-1.5"
              style={{ fontFamily: 'Syne, sans-serif', letterSpacing: '-0.02em' }}
            >
              {displayTitle}
            </h2>
            <p className="text-slate-400 text-sm leading-snug">{displaySubtitle}</p>

            {/* Step indicator for set mode */}
            {isSetMode && (
              <div className="flex justify-center gap-1.5 mt-3">
                {['enter','confirm'].map((p, i) => (
                  <div
                    key={p}
                    className="h-1 rounded-full transition-all duration-300"
                    style={{
                      width: phase === p ? 20 : 6,
                      background: phase === p ? '#14b8a6' : 'rgba(255,255,255,0.15)',
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* PIN dots */}
          <div className="px-8 pb-5">
            <div
              className={`flex justify-center gap-3 mb-2 ${shake ? 'pin-shake' : ''}`}
              style={{ transition: 'all 0.2s' }}
            >
              {[0,1,2,3].map(i => {
                const filled = i < digits.length
                return (
                  <div
                    key={i}
                    className="relative flex items-center justify-center transition-all duration-200"
                    style={{
                      width: 54,
                      height: 54,
                      borderRadius: 16,
                      background: filled
                        ? success
                          ? 'rgba(20,184,166,0.2)'
                          : 'rgba(20,184,166,0.12)'
                        : 'rgba(255,255,255,0.04)',
                      border: `1.5px solid ${
                        filled
                          ? success ? 'rgba(20,184,166,0.7)' : 'rgba(20,184,166,0.4)'
                          : 'rgba(255,255,255,0.08)'
                      }`,
                      transform: filled ? 'scale(1.04)' : 'scale(1)',
                    }}
                  >
                    {filled ? (
                      <div
                        className="w-2.5 h-2.5 rounded-full"
                        style={{
                          background: success ? '#10b981' : '#14b8a6',
                          animation: 'pinDot 0.18s cubic-bezier(0.34,1.56,0.64,1) both',
                        }}
                      />
                    ) : (
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ background: 'rgba(255,255,255,0.12)' }}
                      />
                    )}
                  </div>
                )
              })}
            </div>

            {/* Error text */}
            <div className="h-5 text-center flex items-center justify-center">
              {error && (
                <p
                  className="text-red-400 text-xs font-medium"
                  style={{ animation: 'fadeIn 0.2s ease' }}
                >
                  {error}
                </p>
              )}
            </div>
          </div>

          {/* Numpad */}
          <div className="px-6 pb-6">
            <div className="grid grid-cols-3 gap-2">
              {NUMPAD.map((key, i) => {
                if (key === '') return <div key={i} />
                const isBack = key === '⌫'
                return (
                  <button
                    key={i}
                    onClick={() => handleKey(key)}
                    disabled={!isBack && digits.length >= 4}
                    className="relative h-[52px] rounded-2xl flex items-center justify-center select-none transition-all duration-100 active:scale-95 disabled:opacity-30"
                    style={{
                      background: isBack ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.07)',
                      fontSize: isBack ? '18px' : '20px',
                      fontWeight: 600,
                      color: isBack ? 'rgba(255,255,255,0.45)' : 'white',
                      letterSpacing: '-0.02em',
                    }}
                    onMouseDown={e => {
                      const el = e.currentTarget as HTMLButtonElement
                      el.style.background = 'rgba(20,184,166,0.18)'
                      el.style.borderColor = 'rgba(20,184,166,0.35)'
                    }}
                    onMouseUp={e => {
                      const el = e.currentTarget as HTMLButtonElement
                      el.style.background = isBack ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)'
                      el.style.borderColor = 'rgba(255,255,255,0.07)'
                    }}
                    onTouchStart={e => {
                      const el = e.currentTarget as HTMLButtonElement
                      el.style.background = 'rgba(20,184,166,0.18)'
                      el.style.borderColor = 'rgba(20,184,166,0.35)'
                    }}
                    onTouchEnd={e => {
                      const el = e.currentTarget as HTMLButtonElement
                      el.style.background = isBack ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)'
                      el.style.borderColor = 'rgba(255,255,255,0.07)'
                    }}
                  >
                    {key}
                  </button>
                )
              })}
            </div>

            {onCancel && (
              <button
                onClick={onCancel}
                className="w-full mt-3 h-11 rounded-2xl text-sm text-slate-500 hover:text-slate-300 transition-colors"
                style={{
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pinModalIn {
          from { opacity: 0; transform: scale(0.86) translateY(16px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes pinDot {
          from { transform: scale(0); opacity: 0; }
          to   { transform: scale(1); opacity: 1; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-3px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pinShakeAnim {
          0%,100% { transform: translateX(0); }
          10%      { transform: translateX(-9px); }
          30%      { transform: translateX(9px); }
          50%      { transform: translateX(-6px); }
          70%      { transform: translateX(6px); }
          90%      { transform: translateX(-3px); }
        }
        .pin-shake { animation: pinShakeAnim 0.55s cubic-bezier(0.36,0.07,0.19,0.97) both; }
      `}</style>
    </div>
  )
}
