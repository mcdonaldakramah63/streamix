// Account page card: install the app + notification settings.
// "This device" turns pushes on/off for this browser; everything else is account-wide (all devices) and feeds the
// server's notification engine (quiet hours in your time zone, daily limit, which kinds may buzz you, emails).
import { useEffect, useState } from 'react'
import { usePWA, isIOS } from '../hooks/usePWA'
import { usePush } from '../hooks/usePush'
import api, { errorMessage } from '../services/api'
import Icon from './Icon'

type Kind = 'episode' | 'reminder' | 'library' | 'weekly' | 'announcement'
interface Prefs {
  push: Record<Kind, boolean>
  email: { security: boolean; digest: boolean }
  quiet: { enabled: boolean; start: number; end: number }
  maxPerDay: number
}

const KINDS: { key: Kind; label: string; hint: string; icon: string }[] = [
  { key: 'episode',      label: 'New episodes',     hint: 'Shows you watch or saved — “your next episode is ready” comes first', icon: 'live_tv' },
  { key: 'reminder',     label: 'Reminders',        hint: 'Titles you asked us to remind you about', icon: 'notifications_active' },
  { key: 'library',      label: 'New on Streamix',  hint: 'Videos added to the Streamix library', icon: 'video_library' },
  { key: 'weekly',       label: 'Weekly pick',      hint: 'One title chosen for you, at a time you’re usually watching', icon: 'auto_awesome' },
  { key: 'announcement', label: 'Announcements',    hint: 'News from whoever runs this Streamix', icon: 'campaign' },
]

const hourLabel = (h: number) => new Date(2000, 0, 1, h).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
      className={`relative w-11 h-6 rounded-full flex-shrink-0 transition-colors disabled:opacity-40 ${on ? 'bg-brand' : 'bg-dark-high'}`}>
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : ''}`} />
    </button>
  )
}

export default function AppAndNotifications() {
  const { canInstall, install, isInstalled } = usePWA()
  const push = usePush()
  const [tested, setTested] = useState('')
  const [prefs, setPrefs] = useState<Prefs | null>(null)
  const [learned, setLearned] = useState<Partial<Record<Kind, number>>>({})
  const [tz, setTz] = useState('')
  const [emailOk, setEmailOk] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    api.get('/inbox/prefs').then(r => { setPrefs(r.data.prefs); setLearned(r.data.learned || {}); setTz(r.data.tz || ''); setEmailOk(r.data.emailConfigured !== false) }).catch(() => {})
  }, [])

  // Optimistic: flip it now, save in the background, undo on failure
  const save = async (patch: Partial<Prefs>) => {
    if (!prefs) return
    const before = prefs
    const next = { ...prefs, ...patch, push: { ...prefs.push, ...(patch.push || {}) }, email: { ...prefs.email, ...(patch.email || {}) }, quiet: { ...prefs.quiet, ...(patch.quiet || {}) } }
    setPrefs(next); setErr(''); setSaving(true)
    try {
      const { data } = await api.put('/inbox/prefs', patch)
      setPrefs(data.prefs)
    } catch (e) { setPrefs(before); setErr(errorMessage(e, 'Couldn’t save that')) }
    finally { setSaving(false) }
  }

  const localZone = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone } catch { return '' } })()

  return (
    <section id="notifications" className="card p-5 space-y-4 scroll-mt-24">
      <h2 className="text-label-sm uppercase text-ink-faint">App & notifications</h2>

      <div className="flex items-center gap-3">
        <span className="w-10 h-10 rounded-xl bg-brand/15 text-brand flex items-center justify-center flex-shrink-0"><Icon name="install_mobile" size={22} /></span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white">Streamix app</p>
          <p className="text-xs text-ink-faint">
            {isInstalled ? 'Installed on this device'
              : canInstall ? 'Install it for a full-screen app with its own icon'
              : isIOS() ? 'In Safari, tap Share → “Add to Home Screen”'
              : 'Use your browser menu → “Install app” / “Add to Home screen”'}
          </p>
        </div>
        {canInstall && <button onClick={install} className="btn-primary px-4 py-2 text-xs">Install</button>}
        {isInstalled && <Icon name="check_circle" size={22} className="text-cyan" fill />}
      </div>

      {/* This device */}
      <div className="border-t border-white/[0.05] pt-4">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-gold/15 text-gold flex items-center justify-center flex-shrink-0"><Icon name="notifications" size={22} /></span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white">Notifications on this device</p>
            <p className="text-xs text-ink-faint">
              {push.state === 'on' ? 'On — this browser can buzz you'
                : push.state === 'blocked' ? 'Blocked — allow notifications for this site in your browser settings'
                : push.state === 'unsupported' ? (push.error || "This browser can't receive notifications (needs https or localhost)")
                : 'Off — you’ll still see everything in the bell'}
            </p>
          </div>
          {push.state === 'off' && <button onClick={push.enable} className="btn-primary px-4 py-2 text-xs">Turn on</button>}
          {push.state === 'on' && <button onClick={push.disable} className="btn-secondary px-4 py-2 text-xs">Turn off</button>}
        </div>
        {push.error && push.state !== 'unsupported' && <p role="alert" className="text-xs text-brand-soft mt-2">{push.error}</p>}
        {push.state === 'on' && (
          <div className="mt-2 pl-[52px]">
            <button onClick={async () => { const n = await push.test().catch(() => 0); setTested(n ? 'Test sent — check your notifications' : 'Could not send a test') }}
              className="text-xs text-ink-faint hover:text-white flex items-center gap-1"><Icon name="send" size={14} />Send me a test</button>
            {tested && <p role="status" className="text-xs text-cyan mt-1">{tested}</p>}
          </div>
        )}
      </div>

      {/* Account-wide */}
      {prefs && (
        <div className="border-t border-white/[0.05] pt-4 space-y-5">
          <div>
            <p className="text-sm font-bold text-white">What can buzz your devices</p>
            <p className="text-xs text-ink-faint mt-0.5">Applies to all your devices. Everything still appears in the bell.</p>
            <div className="mt-3 space-y-1.5">
              {KINDS.map(k => (
                <div key={k.key} className="flex items-center gap-3 rounded-xl bg-dark-surface px-3 py-2.5">
                  <Icon name={k.icon} size={20} className="text-ink-muted flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white">{k.label}</p>
                    <p className="text-xs text-ink-faint">{k.hint}
                      {learned[k.key] !== undefined && <span className="text-ink-muted"> · you open about {learned[k.key]}%</span>}
                    </p>
                  </div>
                  <Toggle on={prefs.push[k.key]} onChange={v => save({ push: { [k.key]: v } as any })} label={k.label} />
                </div>
              ))}
              <div className="flex items-center gap-3 rounded-xl bg-dark-surface px-3 py-2.5 opacity-80">
                <Icon name="shield_person" size={20} className="text-brand flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white">Security alerts</p>
                  <p className="text-xs text-ink-faint">New sign-ins and password changes — always on, even in quiet hours</p>
                </div>
                <Icon name="lock" size={18} className="text-ink-faint" />
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white">Quiet hours</p>
                <p className="text-xs text-ink-faint">No buzzing overnight — it waits until morning. {tz || localZone ? `Your time zone: ${tz || localZone}` : ''}</p>
              </div>
              <Toggle on={prefs.quiet.enabled} onChange={v => save({ quiet: { ...prefs.quiet, enabled: v } })} label="Quiet hours" />
            </div>
            {prefs.quiet.enabled && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                {(['start', 'end'] as const).map(which => (
                  <label key={which} className="block">
                    <span className="text-xs text-ink-muted">{which === 'start' ? 'From' : 'Until'}</span>
                    <select value={prefs.quiet[which]} onChange={e => save({ quiet: { ...prefs.quiet, [which]: Number(e.target.value) } })}
                      className="input mt-1 w-full">
                      {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
                    </select>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-white">At most {prefs.maxPerDay} a day</p>
                <p className="text-xs text-ink-faint">More than that waits in the bell. Several at once arrive as one.</p>
              </div>
            </div>
            <input type="range" min={1} max={12} step={1} value={prefs.maxPerDay} aria-label="Most notifications per day"
              onChange={e => setPrefs({ ...prefs, maxPerDay: Number(e.target.value) })}
              onPointerUp={e => save({ maxPerDay: Number((e.target as HTMLInputElement).value) })}
              onKeyUp={e => save({ maxPerDay: Number((e.target as HTMLInputElement).value) })}
              className="w-full mt-2 accent-[#e50914]" />
            <div className="flex justify-between text-[10px] text-ink-faint"><span>1</span><span>12</span></div>
          </div>

          <div>
            <p className="text-sm font-bold text-white">Email</p>
            {!emailOk && <p className="text-xs text-gold mt-0.5">This Streamix server hasn’t been set up to send email yet.</p>}
            <div className="mt-2 space-y-1.5">
              <div className="flex items-center gap-3 rounded-xl bg-dark-surface px-3 py-2.5">
                <Icon name="security" size={20} className="text-ink-muted flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white">Security emails</p>
                  <p className="text-xs text-ink-faint">A new device signs in, your password or email changes{!prefs.email.security && <span className="text-brand-soft"> — recommended on</span>}</p>
                </div>
                <Toggle on={prefs.email.security} onChange={v => save({ email: { ...prefs.email, security: v } })} label="Security emails" />
              </div>
              <div className="flex items-center gap-3 rounded-xl bg-dark-surface px-3 py-2.5">
                <Icon name="mail" size={20} className="text-ink-muted flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white">Weekly email</p>
                  <p className="text-xs text-ink-faint">Only what you haven’t already seen — skipped on quiet weeks</p>
                </div>
                <Toggle on={prefs.email.digest} onChange={v => save({ email: { ...prefs.email, digest: v } })} label="Weekly email" />
              </div>
            </div>
          </div>
          <p role="status" aria-live="polite" className="text-xs min-h-[1rem]">
            {err ? <span className="text-brand-soft">{err}</span> : saving ? <span className="text-ink-faint">Saving…</span> : null}
          </p>
        </div>
      )}
    </section>
  )
}
