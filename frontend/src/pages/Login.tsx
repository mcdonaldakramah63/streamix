// frontend/src/pages/Login.tsx
import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import api, { errorMessage } from '../services/api'
import { login } from '../services/session'
import AuthShell, { Field } from '../components/AuthShell'
import Icon from '../components/Icon'
import EmailVerify, { PendingVerification } from '../components/EmailVerify'

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as any)?.from || '/'

  const [form,    setForm]    = useState({ email: '', password: '' })
  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(false)
  const [showPw,  setShowPw]  = useState(false)
  // Second step for accounts with two-factor sign-in
  const [challenge, setChallenge] = useState<string | null>(null)
  const [code,      setCode]      = useState('')
  // Accounts whose email isn't confirmed yet get a code first
  const [pending,   setPending]   = useState<PendingVerification | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.email || !form.password) { setError('Please enter your email and password'); return }
    setLoading(true); setError('')
    try {
      const { data } = await api.post('/auth/login', { email: form.email.trim(), password: form.password })
      if (data.twoFactorRequired) { setChallenge(data.challenge); setCode(''); return }
      if (data.verificationRequired) { setPending(data); return }
      login(data)
      navigate(from, { replace: true })
    } catch (err) {
      setError(errorMessage(err, 'Sign in failed'))
    } finally {
      setLoading(false)
    }
  }

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      const { data } = await api.post('/auth/2fa/verify', { challenge, code: code.trim() })
      login(data)
      if (typeof data.recoveryLeft === 'number') alert(`You used a backup code. ${data.recoveryLeft} left — make new ones in Profile → Account if you're running low.`)
      navigate(from, { replace: true })
    } catch (err: any) {
      setError(errorMessage(err, 'Wrong code'))
      if (err?.response?.status === 401 && /sign in again|too long/i.test(err.response.data?.message || '')) setChallenge(null)
    } finally { setLoading(false) }
  }

  if (pending) return (
    <EmailVerify pending={pending} onBack={() => { setPending(null); setError('') }}
      onVerified={data => { login(data); navigate(from, { replace: true }) }} />
  )

  if (challenge) return (
    <AuthShell badge="Two-factor sign-in" title="Enter your code" subtitle="Open your authenticator app and type the 6-digit code for Streamix. Lost your phone? Use one of your backup codes."
      footer={<button onClick={() => { setChallenge(null); setError('') }} className="text-brand-soft font-bold hover:text-white">Back to sign in</button>}>
      <form onSubmit={submitCode} className="flex flex-col gap-4" noValidate>
        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-xl px-3.5 py-3 text-sm bg-brand/10 text-brand-soft border border-brand/25 animate-slide-down">
            <Icon name="error" size={18} className="mt-px" />{error}
          </div>
        )}
        <Field id="code" label="Code" icon="pin">
          <input id="code" value={code} onChange={e => setCode(e.target.value.slice(0, 12))} autoFocus
            inputMode="text" autoComplete="one-time-code" placeholder="123456"
            className="input pl-11 font-mono tracking-[0.3em] text-lg" />
        </Field>
        <button type="submit" disabled={loading || code.trim().length < 6} className="btn-primary w-full h-12 text-[15px] disabled:opacity-60">
          {loading ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <>Verify <Icon name="arrow_forward" size={20} /></>}
        </button>
      </form>
    </AuthShell>
  )

  return (
    <AuthShell badge="Welcome back" title="Sign in" subtitle="Pick up where you left off — your list, history and profiles sync across devices."
      footer={<>New to Streamix? <Link to="/register" className="text-brand-soft font-bold hover:text-white">Create an account</Link></>}>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-xl px-3.5 py-3 text-sm bg-brand/10 text-brand-soft border border-brand/25 animate-slide-down">
            <Icon name="error" size={18} className="mt-px" />{error}
          </div>
        )}
        <Field id="email" label="Email" icon="alternate_email">
          <input id="email" type="email" autoComplete="email" value={form.email} placeholder="name@domain.com"
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="input pl-11" />
        </Field>
        <Field id="password" label="Password" icon="lock">
          <input id="password" type={showPw ? 'text' : 'password'} autoComplete="current-password" value={form.password} placeholder="••••••••"
            onChange={e => setForm(f => ({ ...f, password: e.target.value }))} className="input pl-11 pr-12" />
          <button type="button" onClick={() => setShowPw(p => !p)} aria-label={showPw ? 'Hide password' : 'Show password'}
            className="absolute right-2 w-9 h-9 flex items-center justify-center rounded-lg text-ink-faint hover:text-white">
            <Icon name={showPw ? 'visibility_off' : 'visibility'} size={20} />
          </button>
        </Field>
        <button type="submit" disabled={loading} className="btn-primary w-full h-12 mt-1 text-[15px] disabled:opacity-60">
          {loading ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <>Sign in <Icon name="arrow_forward" size={20} /></>}
        </button>
      </form>
    </AuthShell>
  )
}
