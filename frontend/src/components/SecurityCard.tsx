// Account page: two-factor sign-in (authenticator app) + recent sign-in activity
import { useEffect, useState } from 'react'
import api, { errorMessage } from '../services/api'
import { useAuthStore } from '../context/authStore'
import Icon from './Icon'

interface Activity { at: string; label: string; device: string; ip: string; warn: boolean }

export default function SecurityCard() {
  const { user, setUser } = useAuthStore()
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [left, setLeft] = useState(0)
  const [step, setStep] = useState<'idle' | 'password' | 'scan' | 'codes' | 'disable' | 'regen'>('idle')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [secret, setSecret] = useState<{ secret: string; otpauthUrl: string } | null>(null)
  const [codes, setCodes] = useState<string[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [activity, setActivity] = useState<Activity[] | null>(null)
  const [showAll, setShowAll] = useState(false)

  const load = () => api.get('/auth/2fa').then(r => { setEnabled(r.data.enabled); setLeft(r.data.recoveryLeft) }).catch(() => setEnabled(false))
  useEffect(() => { load(); api.get('/auth/activity').then(r => setActivity(r.data)).catch(() => setActivity([])) }, [])

  const reset = () => { setStep('idle'); setPassword(''); setCode(''); setSecret(null); setError('') }
  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError('')
    try { await fn() } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) }
  }

  const startSetup = () => run(async () => {
    const { data } = await api.post('/auth/2fa/setup', { password })
    setSecret(data); setPassword(''); setStep('scan')
  })
  const confirmSetup = () => run(async () => {
    const { data } = await api.post('/auth/2fa/enable', { code: code.trim() })
    if (user && data.token) setUser({ ...user, token: data.token })
    setCodes(data.recoveryCodes); setCode(''); setStep('codes'); load()
  })
  const disable = () => run(async () => {
    await api.post('/auth/2fa/disable', { password, code: code.trim() })
    reset(); load()
  })
  const regen = () => run(async () => {
    const { data } = await api.post('/auth/2fa/recovery', { password, code: code.trim() })
    setCodes(data.recoveryCodes); setPassword(''); setCode(''); setStep('codes'); load()
  })

  const grouped = secret?.secret.match(/.{1,4}/g)?.join(' ') || ''
  const isPhone = /Android|iPhone|iPad/i.test(navigator.userAgent)

  return (
    <section className="card p-5 space-y-4">
      <h2 className="text-label-sm uppercase text-ink-faint">Security</h2>

      <div className="flex items-start gap-3">
        <span className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${enabled ? 'bg-cyan/15 text-cyan' : 'bg-white/[0.06] text-ink'}`}>
          <Icon name={enabled ? 'verified_user' : 'shield'} size={22} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white">Two-factor sign-in</p>
          <p className="text-xs text-ink-faint">
            {enabled === null ? 'Checking…' : enabled
              ? `On — a code from your authenticator app is needed to sign in. ${left} backup code${left === 1 ? '' : 's'} left.`
              : 'Add a code from an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…) when signing in.'}
          </p>
        </div>
        {step === 'idle' && enabled === false && <button onClick={() => setStep('password')} className="btn-primary px-4 py-2 text-xs">Turn on</button>}
      </div>

      {error && <p role="alert" className="text-sm text-brand-soft">{error}</p>}

      {step === 'password' && (
        <form onSubmit={e => { e.preventDefault(); startSetup() }} className="space-y-2">
          <label className="block text-xs text-ink-muted">Confirm your password
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" className="input mt-1" autoFocus />
          </label>
          <div className="flex gap-2">
            <button disabled={busy || !password} className="btn-primary px-5 py-2 text-xs disabled:opacity-50">Continue</button>
            <button type="button" onClick={reset} className="btn-secondary px-5 py-2 text-xs">Cancel</button>
          </div>
        </form>
      )}

      {step === 'scan' && secret && (
        <form onSubmit={e => { e.preventDefault(); confirmSetup() }} className="space-y-3 rounded-xl bg-dark-surface p-4">
          <p className="text-sm text-ink">1. In your authenticator app, add an account {isPhone ? 'by tapping the button below, or ' : ''}by entering this key:</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 font-mono text-sm sm:text-base text-white bg-dark-void rounded-lg px-3 py-2 break-all select-all">{grouped}</code>
            <button type="button" onClick={() => navigator.clipboard?.writeText(secret.secret)} aria-label="Copy key" className="btn-icon w-9 h-9"><Icon name="content_copy" size={18} /></button>
          </div>
          {isPhone && <a href={secret.otpauthUrl} className="btn-secondary w-full py-2 text-xs"><Icon name="open_in_new" size={16} />Open in authenticator app</a>}
          <p className="text-xs text-ink-faint">Account: {user?.email} · Type: time-based</p>
          <label className="block text-sm text-ink">2. Type the 6-digit code it shows
            <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code"
              placeholder="123456" className="input mt-1 font-mono tracking-[0.3em] text-lg" />
          </label>
          <div className="flex gap-2">
            <button disabled={busy || code.length !== 6} className="btn-primary px-5 py-2 text-xs disabled:opacity-50">Turn on</button>
            <button type="button" onClick={reset} className="btn-secondary px-5 py-2 text-xs">Cancel</button>
          </div>
        </form>
      )}

      {step === 'codes' && (
        <div className="space-y-3 rounded-xl bg-gold/10 border border-gold/25 p-4">
          <p className="text-sm text-white font-bold flex items-center gap-2"><Icon name="key" size={18} className="text-gold" />Save your backup codes</p>
          <p className="text-xs text-ink-muted">Each code works once if you lose your phone. They won't be shown again.</p>
          <div className="grid grid-cols-2 gap-2 font-mono text-sm text-white">
            {codes.map(c => <span key={c} className="bg-dark-void rounded-lg px-3 py-1.5 text-center">{c}</span>)}
          </div>
          <div className="flex gap-2">
            <button onClick={() => navigator.clipboard?.writeText(codes.join('\n'))} className="btn-secondary px-4 py-2 text-xs"><Icon name="content_copy" size={16} />Copy</button>
            <button onClick={() => { setCodes([]); reset() }} className="btn-primary px-4 py-2 text-xs">I saved them</button>
          </div>
        </div>
      )}

      {enabled && step === 'idle' && (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setStep('regen')} className="btn-secondary px-4 py-2 text-xs">New backup codes</button>
          <button onClick={() => setStep('disable')} className="px-4 py-2 rounded-full text-xs font-bold text-brand-soft border border-brand/30 hover:bg-brand/10">Turn off</button>
        </div>
      )}

      {(step === 'disable' || step === 'regen') && (
        <form onSubmit={e => { e.preventDefault(); step === 'disable' ? disable() : regen() }} className="space-y-2 rounded-xl bg-dark-surface p-4">
          <p className="text-sm text-ink">{step === 'disable' ? 'Turn off two-factor sign-in' : 'Make new backup codes (the old ones stop working)'}</p>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" aria-label="Password" autoComplete="current-password" className="input" />
          <input value={code} onChange={e => setCode(e.target.value.slice(0, 12))} placeholder="Authenticator or backup code" aria-label="Code" autoComplete="one-time-code" className="input font-mono" />
          <div className="flex gap-2">
            <button disabled={busy || !password || code.trim().length < 6} className="btn-primary px-5 py-2 text-xs disabled:opacity-50">{step === 'disable' ? 'Turn off' : 'Make codes'}</button>
            <button type="button" onClick={reset} className="btn-secondary px-5 py-2 text-xs">Cancel</button>
          </div>
        </form>
      )}

      <div className="border-t border-white/[0.05] pt-4">
        <p className="text-sm font-bold text-white mb-2 flex items-center gap-2"><Icon name="history" size={18} className="text-ink-faint" />Recent sign-in activity</p>
        {!activity ? <div className="skeleton h-16" /> : !activity.length ? <p className="text-xs text-ink-faint">Nothing yet.</p> : (
          <ul className="divide-y divide-white/[0.05] rounded-xl bg-dark-surface">
            {(showAll ? activity : activity.slice(0, 5)).map((a, i) => (
              <li key={i} className="flex items-center gap-3 px-3 py-2 text-xs">
                <Icon name={a.warn ? 'warning' : 'check_circle'} size={16} className={a.warn ? 'text-gold' : 'text-cyan'} />
                <span className="flex-1 min-w-0">
                  <span className="text-white font-semibold">{a.label}</span>
                  <span className="block text-ink-faint truncate">{a.device} · {a.ip}</span>
                </span>
                <span className="text-ink-faint whitespace-nowrap">{new Date(a.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
              </li>
            ))}
          </ul>
        )}
        {activity && activity.length > 5 && <button onClick={() => setShowAll(s => !s)} className="text-xs text-ink-faint hover:text-white mt-2">{showAll ? 'Show less' : `Show all ${activity.length}`}</button>}
        <p className="text-[11px] text-ink-faint mt-2">Don't recognise something? Change your password — that signs out every other device.</p>
      </div>
    </section>
  )
}
