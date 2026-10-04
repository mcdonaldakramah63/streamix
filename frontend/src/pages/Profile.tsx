// frontend/src/pages/Profile.tsx — "Profile & Account Hub" (Stitch design)
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../context/authStore'
import { useProfileStore, Profile as ViewerProfile } from '../stores/profileStore'
import { useContinueWatching } from '../stores/continueWatchingStore'
import { useWatchlistStore } from '../stores/watchlistStore'
import { useDownloadStore } from '../stores/downloadStore'
import { ProfileForm, ProfileBadge } from '../components/ProfileSelector'
import { logout } from '../services/session'
import api, { errorMessage } from '../services/api'
import Icon from '../components/Icon'
import KidsControlsModal from '../components/kids/KidsControlsModal'
import AppAndNotifications from '../components/AppAndNotifications'
import SecurityCard from '../components/SecurityCard'
import ThemeAndBadges from '../components/ThemeAndBadges'
import PlaybackSettings from '../components/PlaybackSettings'
import { CodeBoxes, useCountdown } from '../components/EmailVerify'

export default function Profile() {
  const navigate = useNavigate()
  const { user, setUser } = useAuthStore()
  const { profiles, activeProfile, remove, setActive } = useProfileStore()
  const watching  = useContinueWatching(s => s.items.length)
  const saved     = useWatchlistStore(s => s.items.length)
  const downloads = useDownloadStore(s => s.downloads.filter(d => d.status === 'complete').length)

  // ?tab=account (#notifications) — links from the bell's settings button and security alerts
  const [tab,       setTab]       = useState<'profiles' | 'account'>(() => new URLSearchParams(location.search).get('tab') === 'account' ? 'account' : 'profiles')
  useEffect(() => {
    if (tab !== 'account' || !location.hash) return
    const t = setTimeout(() => document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300)
    return () => clearTimeout(t)
  }, [tab])
  const [editing,   setEditing]   = useState<ViewerProfile | null | 'new'>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [kidsFor,   setKidsFor]   = useState<ViewerProfile | null>(null)
  const [maxProfiles, setMaxProfiles] = useState(5)
  useEffect(() => { api.get('/settings/public').then(r => setMaxProfiles(r.data.maxProfiles || 5)).catch(() => {}) }, [])

  const [username, setUsername] = useState(user?.username || '')
  const [email,    setEmail]    = useState(user?.email || '')
  const [pw,       setPw]       = useState({ current: '', next: '', confirm: '' })
  const [msg,      setMsg]      = useState<{ ok: boolean; text: string } | null>(null)
  const [busy,     setBusy]     = useState(false)
  const [emailPw,  setEmailPw]  = useState('')
  // Email change waiting for the code sent to the new address
  const [pendingEmail, setPendingEmail] = useState<string | null>((user as any)?.pendingEmail || null)
  const [emailCode, setEmailCode] = useState('')
  const [resendLeft, setResendLeft] = useCountdown(0)
  const [typoFix, setTypoFix] = useState<string | null>(null)
  useEffect(() => { api.get('/users/profile').then(r => setPendingEmail(r.data?.pendingEmail || null)).catch(() => {}) }, [])

  if (!user) return null

  const saveAccount = async () => {
    setBusy(true); setMsg(null)
    try {
      const emailChanged = email.trim().toLowerCase() !== (user.email || '').toLowerCase()
      const { data } = await api.put('/users/profile', { username: username.trim(), email: email.trim(), ...(emailChanged ? { currentPassword: emailPw, confirmTypo: typoFix === 'confirmed' } : {}) })
      setEmailPw(''); setTypoFix(null)
      setUser({ ...user, username: data.username, email: data.email, avatar: data.avatar, token: user.token })
      if (data.verificationRequired) {
        setPendingEmail(data.pendingEmail); setEmailCode(''); setResendLeft(data.resendIn || 30); setEmail(data.email)
        setMsg({ ok: true, text: `We sent a code to ${data.pendingEmail}. Enter it below to switch your email.` })
      } else setMsg({ ok: true, text: data.changed ? 'Email changed' : 'Account updated' })
    } catch (e: any) {
      const d = e?.response?.data
      if (d?.reason === 'typo' && d?.suggestion) setTypoFix(d.suggestion)
      setMsg({ ok: false, text: errorMessage(e, 'Update failed') })
    }
    finally { setBusy(false) }
  }

  const confirmEmailChange = async (code = emailCode) => {
    if (code.length !== 6) return
    setBusy(true); setMsg(null)
    try {
      const { data } = await api.post('/users/email/verify', { code })
      setUser({ ...user, email: data.email, token: user.token })
      setEmail(data.email); setPendingEmail(null); setEmailCode('')
      setMsg({ ok: true, text: `Your email is now ${data.email}` })
    } catch (e) { setEmailCode(''); setMsg({ ok: false, text: errorMessage(e, 'That code didn’t work') }) }
    finally { setBusy(false) }
  }
  const resendEmailCode = async () => {
    try { const { data } = await api.post('/users/email/resend'); setResendLeft(data.resendIn || 30); setMsg({ ok: true, text: 'New code sent' }) }
    catch (e: any) { if (e?.response?.data?.resendIn) setResendLeft(e.response.data.resendIn); setMsg({ ok: false, text: errorMessage(e, 'Couldn’t send a new code') }) }
  }
  const cancelEmailChange = async () => {
    await api.delete('/users/email/pending').catch(() => {})
    setPendingEmail(null); setEmailCode(''); setMsg(null)
  }

  const changePassword = async () => {
    if (pw.next !== pw.confirm) { setMsg({ ok: false, text: 'New passwords do not match' }); return }
    setBusy(true); setMsg(null)
    try {
      // The server signs out other devices and returns a fresh session for this one
      const { data } = await api.put('/users/password', { currentPassword: pw.current, newPassword: pw.next })
      if (data?.token) setUser({ ...user, ...data })
      setPw({ current: '', next: '', confirm: '' })
      setMsg({ ok: true, text: 'Password changed — other devices have been signed out' })
    } catch (e) { setMsg({ ok: false, text: errorMessage(e, 'Could not change password') }) }
    finally { setBusy(false) }
  }

  const stats = [
    { label: 'Watching',  value: watching,  icon: 'play_circle',          tone: 'text-brand' },
    { label: 'My List',   value: saved,     icon: 'bookmark',             tone: 'text-gold'  },
    { label: 'Downloads', value: downloads, icon: 'download_for_offline', tone: 'text-cyan'  },
  ]

  return (
    <div className="min-h-screen pt-24 px-4 sm:px-6 max-w-3xl mx-auto pb-16">
      {/* Header card */}
      <div className="card p-5 sm:p-6 mb-6 relative overflow-hidden">
        <div className="absolute -top-16 -right-16 w-56 h-56 bg-brand/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex items-center gap-4 relative">
          <ProfileBadge p={activeProfile || { avatar: user.username[0]?.toUpperCase(), color: '#e50914', isKids: false }} size="sm" />
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-extrabold text-white truncate">{activeProfile?.name || user.username}</h1>
            <p className="text-ink-faint text-sm truncate">{user.email}</p>
          </div>
          {user.isAdmin && <span className="tech-pill text-gold">Admin</span>}
        </div>
        <div className="grid grid-cols-3 gap-3 mt-5 relative">
          {stats.map(s => (
            <div key={s.label} className="rounded-2xl bg-dark-surface p-3 text-center">
              <Icon name={s.icon} size={20} className={s.tone} />
              <p className="text-xl font-extrabold text-white mt-1">{s.value}</p>
              <p className="text-label-sm uppercase text-ink-faint">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-full bg-dark-card mb-6" role="tablist">
        {(['profiles', 'account'] as const).map(t => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => { setTab(t); setMsg(null) }}
            className={`flex-1 h-10 rounded-full text-sm font-bold capitalize transition-all ${tab === t ? 'bg-brand text-white shadow-brand-sm' : 'text-ink-muted hover:text-white'}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'profiles' && !editing && !activeProfile?.isKids && <PlaybackSettings />}
      {tab === 'profiles' && !editing && !activeProfile?.isKids && <ThemeAndBadges />}
      {tab === 'profiles' && (
        editing ? (
          <ProfileForm editing={editing === 'new' ? null : editing} onCancel={() => setEditing(null)} onDone={() => setEditing(null)} />
        ) : (
          <div className="space-y-2.5">
            {profiles.map(p => {
              const isActive = activeProfile?._id === p._id
              return (
                <div key={p._id} className={`card p-3 flex items-center gap-3 ${isActive ? 'ring-1 ring-brand/60' : ''}`}>
                  <ProfileBadge p={p} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate flex items-center gap-1.5">
                      {p.name}{p.hasPin && <Icon name="lock" size={14} className="text-ink-faint" />}
                    </p>
                    <p className="text-xs text-ink-faint">{isActive ? 'Watching now' : p.isKids ? 'Kids profile' : 'Standard profile'}</p>
                  </div>
                  {!isActive && (
                    <button onClick={async () => { if (await setActive(p)) navigate(p.isKids ? '/kids' : '/') }} className="btn-secondary px-4 py-1.5 text-xs">Switch</button>
                  )}
                  {p.isKids && !activeProfile?.isKids && (
                    <button onClick={() => setKidsFor(p)} title="Kids controls" aria-label={`Kids controls for ${p.name}`}
                      className="h-9 px-3 rounded-full flex items-center gap-1.5 text-xs font-bold text-gold hover:bg-gold/10">
                      <Icon name="family_restroom" size={18} /><span className="hidden sm:inline">Controls</span>
                    </button>
                  )}
                  <button onClick={() => setEditing(p)} aria-label={`Edit ${p.name}`} className="w-9 h-9 rounded-full flex items-center justify-center text-ink-faint hover:text-white hover:bg-white/[0.06]">
                    <Icon name="edit" size={18} />
                  </button>
                  {profiles.length > 1 && (
                    <button onClick={() => setConfirmId(p._id)} aria-label={`Delete ${p.name}`} className="w-9 h-9 rounded-full flex items-center justify-center text-ink-faint hover:text-brand-soft hover:bg-brand/10">
                      <Icon name="delete" size={18} />
                    </button>
                  )}
                </div>
              )
            })}
            {kidsFor && <KidsControlsModal profile={kidsFor} onClose={() => setKidsFor(null)} />}
            {profiles.length < maxProfiles && (
              <button onClick={() => setEditing('new')} className="w-full h-14 rounded-2xl border-2 border-dashed border-white/10 text-ink-muted hover:border-brand/50 hover:text-white text-sm font-bold flex items-center justify-center gap-2 transition-all">
                <Icon name="add" size={20} /> Add profile ({profiles.length}/{maxProfiles})
              </button>
            )}
          </div>
        )
      )}

      {tab === 'account' && (
        <div className="space-y-4">
          {msg && (
            <div role="status" className={`rounded-xl px-4 py-3 text-sm font-semibold ${msg.ok ? 'bg-cyan/10 text-cyan' : 'bg-brand/10 text-brand-soft'}`}>{msg.text}</div>
          )}
          <AppAndNotifications />
          <SecurityCard />
          <section className="card p-5 space-y-3">
            <h2 className="text-label-sm uppercase text-ink-faint">Account info</h2>
            <label className="block"><span className="text-xs text-ink-muted">Username</span>
              <input value={username} onChange={e => setUsername(e.target.value)} className="input mt-1" autoComplete="username" /></label>
            <label className="block"><span className="text-xs text-ink-muted">Email</span>
              <input value={email} onChange={e => setEmail(e.target.value)} type="email" className="input mt-1" autoComplete="email" /></label>
            {typoFix && typoFix !== 'confirmed' && (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] -mt-1">
                <span className="text-gold">Did you mean</span>
                <button type="button" onClick={() => { setEmail(typoFix); setTypoFix(null) }} className="font-bold text-white underline decoration-gold/60 underline-offset-2">{typoFix}</button>
                <span className="text-ink-faint">?</span>
                <button type="button" onClick={() => setTypoFix('confirmed')} className="ml-auto text-xs text-ink-faint hover:text-white">No, it’s correct</button>
              </div>
            )}
            {email.trim().toLowerCase() !== (user.email || '').toLowerCase() && (
              <label className="block"><span className="text-xs text-ink-muted">Current password (needed to change your email)</span>
                <input value={emailPw} onChange={e => setEmailPw(e.target.value)} type="password" className="input mt-1" autoComplete="current-password" /></label>
            )}
            {pendingEmail && (
              <div className="rounded-2xl border border-gold/25 bg-gold/[0.06] p-4 space-y-3">
                <div className="flex items-start gap-2.5">
                  <Icon name="mark_email_unread" size={20} className="text-gold mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-ink">Enter the code we sent to <span className="font-bold text-white break-all">{pendingEmail}</span>. Until then you keep signing in with {user.email}.</p>
                </div>
                <CodeBoxes value={emailCode} onChange={setEmailCode} onComplete={confirmEmailChange} disabled={busy} />
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={() => confirmEmailChange()} disabled={busy || emailCode.length !== 6} className="btn-primary px-4 py-2 text-xs disabled:opacity-50">Confirm new email</button>
                  <button onClick={resendEmailCode} disabled={resendLeft > 0} className="btn-ghost px-3 py-2 text-xs disabled:opacity-50">{resendLeft > 0 ? `Resend in ${resendLeft}s` : 'Resend code'}</button>
                  <button onClick={cancelEmailChange} className="ml-auto text-xs text-ink-faint hover:text-white">Cancel change</button>
                </div>
              </div>
            )}
            <button onClick={saveAccount} disabled={busy} className="btn-primary w-full h-11 disabled:opacity-60">Save changes</button>
          </section>

          <section className="card p-5 space-y-3">
            <h2 className="text-label-sm uppercase text-ink-faint">Change password</h2>
            <input value={pw.current} onChange={e => setPw(f => ({ ...f, current: e.target.value }))} type="password" placeholder="Current password" className="input" autoComplete="current-password" />
            <input value={pw.next} onChange={e => setPw(f => ({ ...f, next: e.target.value }))} type="password" placeholder="New password" className="input" autoComplete="new-password" />
            <input value={pw.confirm} onChange={e => setPw(f => ({ ...f, confirm: e.target.value }))} type="password" placeholder="Confirm new password" className="input" autoComplete="new-password" />
            <p className="text-xs text-ink-faint">8+ characters with an uppercase letter, a number and a symbol.</p>
            <button onClick={changePassword} disabled={busy || !pw.current || !pw.next} className="btn-secondary w-full h-11 disabled:opacity-50">Update password</button>
          </section>

          <section className="card p-5">
            <button onClick={async () => { await logout(); navigate('/') }} className="w-full h-11 rounded-full text-sm font-bold text-brand-soft border border-brand/30 hover:bg-brand/10 transition-all flex items-center justify-center gap-2">
              <Icon name="logout" size={18} /> Sign out
            </button>
            <button onClick={async () => {
                if (!confirm('Sign out on every device, including this one?')) return
                try { await api.post('/auth/logout-all') } catch { /* signed out anyway below */ }
                await logout(); navigate('/')
              }}
              className="w-full mt-2 h-10 rounded-full text-xs font-semibold text-ink-faint hover:text-white flex items-center justify-center gap-2">
              <Icon name="devices" size={16} /> Sign out everywhere
            </button>
          </section>
        </div>
      )}

      {confirmId && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" role="dialog" aria-modal="true">
          <div className="card p-5 max-w-sm w-full">
            <p className="text-white font-bold mb-1">Delete this profile?</p>
            <p className="text-ink-muted text-sm mb-4">Its watch history and recommendations will be lost.</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmId(null)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={async () => { try { await remove(confirmId) } finally { setConfirmId(null) } }} className="btn-primary flex-1">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
