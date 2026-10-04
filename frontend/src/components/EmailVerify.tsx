// "Check your email" step after sign-up (or signing in to an account whose email isn't confirmed yet)
import { useEffect, useRef, useState } from 'react'
import api, { errorMessage } from '../services/api'
import AuthShell from './AuthShell'
import Icon from './Icon'

export interface PendingVerification {
  verificationRequired: true
  ticket: string
  email: string        // masked: "jo•••@gmail.com"
  resendIn: number
  sent: boolean
  sendError?: string
}

/** Six boxes for a one-time code: type, paste the whole code, or let the phone fill it from the email */
export function CodeBoxes({ value, onChange, onComplete, disabled, invalid }: {
  value: string; onChange: (v: string) => void; onComplete?: (v: string) => void; disabled?: boolean; invalid?: boolean
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([])
  const digits = Array.from({ length: 6 }, (_, i) => value[i] || '')

  const set = (next: string) => {
    const clean = next.replace(/\D/g, '').slice(0, 6)
    onChange(clean)
    if (clean.length === 6) onComplete?.(clean)
    return clean
  }
  const focus = (i: number) => refs.current[Math.max(0, Math.min(5, i))]?.focus()

  return (
    <div className="flex justify-between gap-1.5 sm:gap-2" role="group" aria-label="6-digit code">
      {digits.map((d, i) => (
        <input key={i} ref={el => { refs.current[i] = el }} value={d} disabled={disabled}
          inputMode="numeric" pattern="[0-9]*" maxLength={i === 0 ? 6 : 1}
          autoComplete={i === 0 ? 'one-time-code' : 'off'} autoFocus={i === 0}
          aria-label={`Digit ${i + 1}`}
          onChange={e => {
            const v = e.target.value.replace(/\D/g, '')
            if (v.length > 1) { const c = set(v); focus(c.length); return }   // pasted / autofilled
            const arr = digits.slice(); arr[i] = v
            set(arr.join('').slice(0, 6))
            if (v) focus(i + 1)
          }}
          onKeyDown={e => {
            if (e.key === 'Backspace' && !digits[i] && i > 0) { const arr = digits.slice(); arr[i - 1] = ''; set(arr.join('')); focus(i - 1); e.preventDefault() }
            if (e.key === 'ArrowLeft') focus(i - 1)
            if (e.key === 'ArrowRight') focus(i + 1)
          }}
          onPaste={e => { e.preventDefault(); const c = set(e.clipboardData.getData('text')); focus(c.length) }}
          onFocus={e => e.target.select()}
          className={`w-full min-w-0 h-12 sm:h-14 rounded-xl text-center text-xl sm:text-2xl font-black font-mono text-white bg-dark-surface border-2 outline-none transition-colors
            ${invalid ? 'border-brand/70' : d ? 'border-white/20' : 'border-white/[0.08]'} focus:border-brand disabled:opacity-50`} />
      ))}
    </div>
  )
}

/** Ticks down a "resend in" timer */
export function useCountdown(initial: number) {
  const [left, setLeft] = useState(initial)
  useEffect(() => {
    if (left <= 0) return
    const t = setTimeout(() => setLeft(l => l - 1), 1000)
    return () => clearTimeout(t)
  }, [left])
  return [left, setLeft] as const
}

export default function EmailVerify({ pending, onVerified, onBack }: {
  pending: PendingVerification; onVerified: (session: any) => void; onBack: () => void
}) {
  const [ticket] = useState(pending.ticket)
  const [code, setCode] = useState('')
  const [error, setError] = useState(pending.sendError || '')
  const [note, setNote] = useState(pending.sent ? '' : pending.sendError ? '' : 'We already sent you a code — check your inbox (and spam folder).')
  const [busy, setBusy] = useState(false)
  const [left, setLeft] = useCountdown(pending.resendIn || 0)

  const verify = async (c = code) => {
    if (c.length !== 6 || busy) return
    setBusy(true); setError(''); setNote('')
    try {
      const { data } = await api.post('/auth/verify-email', { ticket, code: c })
      onVerified(data)
    } catch (e: any) {
      const d = e?.response?.data
      setError(errorMessage(e, 'That code didn’t work'))
      setCode('')
      if (d?.restart) setTimeout(onBack, 2500)
    } finally { setBusy(false) }
  }

  const resend = async () => {
    setBusy(true); setError(''); setNote('')
    try {
      const { data } = await api.post('/auth/verify-email/resend', { ticket })
      setLeft(data.resendIn || 30)
      setNote(`New code sent to ${data.email || pending.email}`)
      setCode('')
    } catch (e: any) {
      setError(errorMessage(e, 'Couldn’t send a new code'))
      if (typeof e?.response?.data?.resendIn === 'number') setLeft(e.response.data.resendIn)
      if (e?.response?.data?.restart) setTimeout(onBack, 2500)
    } finally { setBusy(false) }
  }

  return (
    <AuthShell badge="One last step" title="Check your email"
      subtitle={`We sent a 6-digit code to ${pending.email}. Enter it to confirm the address is yours.`}
      footer={<button onClick={onBack} className="text-brand-soft font-bold hover:text-white">Use a different email</button>}>
      <form onSubmit={e => { e.preventDefault(); verify() }} className="flex flex-col gap-4" noValidate>
        <div className="flex items-center gap-3 rounded-xl bg-white/[0.04] px-3.5 py-3">
          <span className="w-10 h-10 rounded-xl bg-brand/15 text-brand flex items-center justify-center flex-shrink-0"><Icon name="mark_email_unread" size={22} /></span>
          <p className="text-xs text-ink-muted leading-relaxed">The code works for 15 minutes. Can’t find it? Check spam or promotions.</p>
        </div>
        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-xl px-3.5 py-3 text-sm bg-brand/10 text-brand-soft border border-brand/25 animate-slide-down">
            <Icon name="error" size={18} className="mt-px flex-shrink-0" />{error}
          </div>
        )}
        {note && !error && (
          <p role="status" className="flex items-center gap-2 text-sm text-cyan"><Icon name="check_circle" size={18} />{note}</p>
        )}
        <CodeBoxes value={code} onChange={setCode} onComplete={verify} disabled={busy} invalid={!!error} />
        <button type="submit" disabled={busy || code.length !== 6} className="btn-primary w-full h-12 text-[15px] disabled:opacity-60">
          {busy ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <>Confirm email <Icon name="arrow_forward" size={20} /></>}
        </button>
        <button type="button" onClick={resend} disabled={busy || left > 0}
          className="text-sm font-semibold text-ink-muted hover:text-white disabled:text-ink-faint disabled:cursor-not-allowed flex items-center justify-center gap-1.5">
          <Icon name="refresh" size={18} />{left > 0 ? `Send a new code in ${left}s` : 'Send a new code'}
        </button>
      </form>
    </AuthShell>
  )
}
