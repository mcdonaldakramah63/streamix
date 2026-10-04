// frontend/src/components/PinModal.tsx — 4-digit PIN pad; the caller verifies (e.g. on the server)
import { useState, useEffect, useRef } from 'react'
import { useProfileStore } from '../stores/profileStore'
import Icon from './Icon'
import ProfileAvatar from './avatar/ProfileAvatar'

interface Props {
  title?:    string
  subtitle?: string
  avatar?:   React.ReactNode
  /** Resolve null when the PIN is accepted, or an error message */
  onSubmit:  (pin: string) => Promise<string | null>
  onCancel:  () => void
}

const NUMPAD = ['1','2','3','4','5','6','7','8','9','','0','⌫']

export default function PinModal({
  title = 'Enter PIN', subtitle = 'Enter the 4-digit profile PIN', avatar, onSubmit, onCancel,
}: Props) {
  const [digits,  setDigits]  = useState('')
  const [error,   setError]   = useState('')
  const [shake,   setShake]   = useState(false)
  const [busy,    setBusy]    = useState(false)
  const [success, setSuccess] = useState(false)
  const busyRef = useRef(false)

  const press = (key: string) => {
    if (busyRef.current) return
    setError('')
    if (key === '⌫') setDigits(d => d.slice(0, -1))
    else setDigits(d => (d.length < 4 ? d + key : d))
  }

  useEffect(() => {
    if (digits.length !== 4 || busyRef.current) return
    busyRef.current = true
    setBusy(true)
    onSubmit(digits).then(err => {
      if (err) {
        setError(err); setShake(true); setDigits('')
        setTimeout(() => setShake(false), 550)
      } else {
        setSuccess(true)
      }
    }).finally(() => { busyRef.current = false; setBusy(false) })
  }, [digits, onSubmit])

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key)
      else if (e.key === 'Backspace') press('⌫')
      else if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onCancel]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center px-5"
      style={{ background: 'rgba(10,14,23,0.88)', backdropFilter: 'blur(16px)' }}
      onClick={e => { if (e.target === e.currentTarget) onCancel() }}
      role="dialog" aria-modal="true" aria-label={title}>
      <div className="w-full max-w-[330px] glass rounded-3xl overflow-hidden shadow-deep animate-scale-in">
        <div className="px-8 pt-8 pb-5 text-center">
          <div className={`w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center text-2xl ${success ? 'bg-brand/20 shadow-brand-sm' : 'bg-white/[0.06]'}`}>
            {success ? <Icon name="lock_open" size={26} className="text-brand" /> : avatar || <Icon name="lock" size={26} className="text-ink" />}
          </div>
          <h2 className="text-white text-lg font-bold mb-1">{title}</h2>
          <p className="text-ink-muted text-sm">{subtitle}</p>
        </div>

        <div className="px-8 pb-4">
          <div className={`flex justify-center gap-3 ${shake ? 'pin-shake' : ''}`}>
            {[0, 1, 2, 3].map(i => {
              const filled = i < digits.length
              return (
                <div key={i} className="w-[54px] h-[54px] rounded-2xl flex items-center justify-center transition-all duration-200"
                  style={{
                    background: filled ? 'rgba(229,9,20,0.14)' : 'rgba(255,255,255,0.04)',
                    border: `1.5px solid ${filled ? 'rgba(229,9,20,0.55)' : 'rgba(255,255,255,0.08)'}`,
                    boxShadow: filled ? '0 0 12px rgba(229,9,20,0.25)' : 'none',
                  }}>
                  <div className={`rounded-full transition-all ${filled ? 'w-2.5 h-2.5 bg-brand' : 'w-2 h-2 bg-white/15'}`} />
                </div>
              )
            })}
          </div>
          <div className="h-6 mt-2 text-center">
            {busy && <span className="inline-block w-4 h-4 border-2 border-white/10 border-t-brand rounded-full animate-spin" />}
            {error && !busy && <p className="text-brand-soft text-xs font-semibold">{error}</p>}
          </div>
        </div>

        <div className="px-6 pb-6">
          <div className="grid grid-cols-3 gap-2">
            {NUMPAD.map((key, i) => key === '' ? <div key={i} /> : (
              <button key={i} onClick={() => press(key)} disabled={busy}
                aria-label={key === '⌫' ? 'Delete digit' : key}
                className="h-[52px] rounded-2xl flex items-center justify-center text-xl font-semibold text-white bg-white/[0.06] border border-white/[0.07] hover:bg-white/[0.1] active:scale-95 active:bg-brand/20 transition-all disabled:opacity-40">
                {key === '⌫' ? <Icon name="backspace" size={20} className="text-ink-muted" /> : key}
              </button>
            ))}
          </div>
          <button onClick={onCancel} className="w-full mt-3 h-11 rounded-full text-sm font-semibold text-ink-muted hover:text-white bg-white/[0.03] border border-white/[0.06]">
            Cancel
          </button>
        </div>
      </div>

      <style>{`
        @keyframes pinShakeAnim { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-9px)} 40%{transform:translateX(9px)} 60%{transform:translateX(-6px)} 80%{transform:translateX(6px)} }
        .pin-shake { animation: pinShakeAnim 0.5s cubic-bezier(0.36,0.07,0.19,0.97) both; }
      `}</style>
    </div>
  )
}

/** Mounted once in App — answers PIN requests from profileStore.setActive */
export function PinGate() {
  const { pinRequest, submitPin, cancelPin } = useProfileStore()
  if (!pinRequest) return null
  const p = pinRequest.profile
  return (
    <PinModal
      title={`Unlock ${p.name}`}
      subtitle="This profile is protected with a PIN"
      avatar={<ProfileAvatar p={p} className="w-14 h-14 rounded-2xl" emojiSize="text-2xl" />}
      onSubmit={submitPin}
      onCancel={cancelPin}
    />
  )
}
