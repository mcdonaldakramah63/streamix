// frontend/src/pages/Register.tsx
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api, { errorMessage } from '../services/api'
import { login } from '../services/session'
import AuthShell, { Field } from '../components/AuthShell'
import Icon from '../components/Icon'
import EmailVerify, { PendingVerification } from '../components/EmailVerify'

type EmailHint = { state: 'idle' | 'checking' | 'ok' | 'bad'; message?: string; suggestion?: string; reason?: string }

// Mirrors backend/utils/passwordRules.js
const RULES = [
  { test: (p: string) => p.length >= 8,          label: '8+ characters' },
  { test: (p: string) => /[A-Z]/.test(p),        label: 'Uppercase letter' },
  { test: (p: string) => /[0-9]/.test(p),        label: 'Number' },
  { test: (p: string) => /[^A-Za-z0-9]/.test(p), label: 'Symbol' },
]

export default function Register() {
  const navigate = useNavigate()
  const [form,    setForm]    = useState({ username: '', email: '', password: '', confirm: '' })
  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(false)
  const [showPw,  setShowPw]  = useState(false)
  const [pending, setPending] = useState<PendingVerification | null>(null)
  const [hint,    setHint]    = useState<EmailHint>({ state: 'idle' })
  const [confirmTypo, setConfirmTypo] = useState(false)
  const checkSeq = useRef(0)

  // Live check while typing (debounced): can this address receive mail? typo? throwaway?
  useEffect(() => {
    const email = form.email.trim()
    setConfirmTypo(false)
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) { setHint({ state: 'idle' }); return }
    const seq = ++checkSeq.current
    setHint(h => (h.state === 'bad' ? h : { state: 'checking' }))
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get('/auth/email-check', { params: { email } })
        if (seq !== checkSeq.current) return
        setHint(data.ok ? { state: 'ok' } : { state: 'bad', message: data.message, suggestion: data.suggestion, reason: data.reason })
      } catch { if (seq === checkSeq.current) setHint({ state: 'idle' }) }
    }, 600)
    return () => clearTimeout(t)
  }, [form.email])

  const passed = RULES.filter(r => r.test(form.password)).length

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.username || !form.email || !form.password) { setError('Please fill in all fields'); return }
    if (!/^[a-zA-Z0-9_]{3,30}$/.test(form.username)) { setError('Username: 3–30 letters, numbers or underscores'); return }
    if (passed < RULES.length) { setError('Password needs ' + RULES.filter(r => !r.test(form.password)).map(r => r.label.toLowerCase()).join(', ')); return }
    if (form.password !== form.confirm) { setError('Passwords do not match'); return }
    if (hint.state === 'bad' && !(hint.reason === 'typo' && confirmTypo)) { setError(hint.reason === 'typo' ? 'Check your email address — tap the suggestion, or “No, it’s correct”' : hint.message || 'Check your email address'); return }
    setLoading(true); setError('')
    try {
      const { data } = await api.post('/auth/register', { username: form.username.trim(), email: form.email.trim(), password: form.password, confirmTypo })
      if (data.verificationRequired) { setPending(data); return }
      login(data)
      navigate('/', { replace: true })
    } catch (err: any) {
      const d = err?.response?.data
      if (d?.field === 'email' && d?.reason) setHint({ state: 'bad', message: d.message, suggestion: d.suggestion, reason: d.reason })
      setError(d?.reason === 'typo' ? '' : errorMessage(err, 'Registration failed'))
    } finally {
      setLoading(false)
    }
  }

  if (pending) return (
    <EmailVerify pending={pending} onBack={() => { setPending(null); setError('') }}
      onVerified={data => { login(data); navigate('/', { replace: true }) }} />
  )

  const useSuggestion = () => { if (hint.suggestion) setForm(f => ({ ...f, email: hint.suggestion! })) }

  return (
    <AuthShell badge="Free account" title="Create your account" subtitle="Save titles to your list, resume on any device, and set up profiles for the whole household."
      footer={<>Already have an account? <Link to="/login" className="text-brand-soft font-bold hover:text-white">Sign in</Link></>}>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-xl px-3.5 py-3 text-sm bg-brand/10 text-brand-soft border border-brand/25 animate-slide-down">
            <Icon name="error" size={18} className="mt-px" />{error}
          </div>
        )}
        <Field id="username" label="Username" icon="person">
          <input id="username" autoComplete="username" value={form.username} placeholder="cinephile_42" maxLength={30}
            onChange={e => setForm(f => ({ ...f, username: e.target.value }))} className="input pl-11" />
        </Field>
        <Field id="email" label="Email" icon="alternate_email">
          <input id="email" type="email" autoComplete="email" value={form.email} placeholder="name@domain.com"
            aria-invalid={hint.state === 'bad' && !confirmTypo} aria-describedby="email-hint"
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className={`input pl-11 pr-10 ${hint.state === 'bad' && !confirmTypo ? '!border-brand/60' : ''}`} />
          <span className="absolute right-3 flex items-center" aria-hidden="true">
            {hint.state === 'checking' && <span className="w-4 h-4 border-2 border-white/20 border-t-white/70 rounded-full animate-spin" />}
            {hint.state === 'ok' && <Icon name="check_circle" size={20} className="text-cyan" fill />}
            {hint.state === 'bad' && !confirmTypo && <Icon name="error" size={20} className="text-brand-soft" />}
          </span>
        </Field>
        <div id="email-hint" aria-live="polite" className="-mt-2 empty:hidden">
          {hint.state === 'bad' && hint.reason === 'typo' && !confirmTypo && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
              <span className="text-gold">Did you mean</span>
              <button type="button" onClick={useSuggestion} className="font-bold text-white underline decoration-gold/60 underline-offset-2 hover:decoration-gold">{hint.suggestion}</button>
              <span className="text-ink-faint">?</span>
              <button type="button" onClick={() => setConfirmTypo(true)} className="ml-auto text-xs text-ink-faint hover:text-white">No, it’s correct</button>
            </div>
          )}
          {hint.state === 'bad' && hint.reason !== 'typo' && (
            <p className="text-[13px] text-brand-soft flex items-start gap-1.5">
              <span>{hint.message}</span>
              {hint.suggestion && <button type="button" onClick={useSuggestion} className="font-bold text-white underline underline-offset-2 whitespace-nowrap">Use {hint.suggestion}</button>}
            </p>
          )}
          {hint.state === 'ok' && <p className="text-xs text-ink-faint">We’ll send a code to this address to confirm it’s yours.</p>}
        </div>
        <Field id="password" label="Password" icon="lock">
          <input id="password" type={showPw ? 'text' : 'password'} autoComplete="new-password" value={form.password} maxLength={72}
            onChange={e => setForm(f => ({ ...f, password: e.target.value }))} className="input pl-11 pr-12" />
          <button type="button" onClick={() => setShowPw(p => !p)} aria-label={showPw ? 'Hide password' : 'Show password'}
            className="absolute right-2 w-9 h-9 flex items-center justify-center rounded-lg text-ink-faint hover:text-white">
            <Icon name={showPw ? 'visibility_off' : 'visibility'} size={20} />
          </button>
        </Field>
        {form.password && (
          <div className="-mt-1">
            <div className="flex gap-1 mb-2">
              {RULES.map((_, i) => (
                <span key={i} className={`h-1 flex-1 rounded-full transition-colors ${i < passed ? (passed === RULES.length ? 'bg-cyan shadow-cyan' : 'bg-gold') : 'bg-dark-high'}`} />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {RULES.map(r => (
                <span key={r.label} className={`flex items-center gap-1 text-xs ${r.test(form.password) ? 'text-cyan' : 'text-ink-faint'}`}>
                  <Icon name={r.test(form.password) ? 'check_circle' : 'radio_button_unchecked'} size={14} />{r.label}
                </span>
              ))}
            </div>
          </div>
        )}
        <Field id="confirm" label="Confirm password" icon="lock_reset">
          <input id="confirm" type="password" autoComplete="new-password" value={form.confirm} maxLength={72}
            onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))} className="input pl-11" />
        </Field>
        {form.confirm && form.password !== form.confirm && <p className="text-xs text-brand-soft -mt-2">Passwords don't match</p>}
        <button type="submit" disabled={loading} className="btn-primary w-full h-12 mt-1 text-[15px] disabled:opacity-60">
          {loading ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <>Create account <Icon name="arrow_forward" size={20} /></>}
        </button>
      </form>
    </AuthShell>
  )
}
