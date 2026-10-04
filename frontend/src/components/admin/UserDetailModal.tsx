// Admin: one user's details plus suspend / unlock / password reset / admin / delete
import { useEffect, useState } from 'react'
import api, { errorMessage } from '../../services/api'
import Icon from '../Icon'
import ProfileAvatar from '../avatar/ProfileAvatar'

interface Detail {
  _id: string; username: string; email: string; isAdmin: boolean; createdAt: string; lastActiveAt: string | null
  suspended: boolean; suspendedReason: string; locked: boolean; loginAttempts: number; emailVerified?: boolean; pendingEmail?: string | null
  watchlistCount: number; ratingsCount: number
  profiles: { _id: string; name: string; avatar: string; color: string; isKids: boolean; hasPin: boolean; watched: number; avatarImage?: string; avatarConfig?: any }[]
  recentlyWatched: { movieId: number; title: string; type: string; season?: number; episode?: number; progress: number; watchedAt: string }[]
}

const RULES = [/.{8,}/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/]

export default function UserDetailModal({ userId, isSelf, onClose, onChanged }: {
  userId: string; isSelf: boolean; onClose: () => void; onChanged: () => void
}) {
  const [u,       setU]       = useState<Detail | null>(null)
  const [error,   setError]   = useState('')
  const [notice,  setNotice]  = useState('')
  const [busy,    setBusy]    = useState(false)
  const [reason,  setReason]  = useState('')
  const [newPw,   setNewPw]   = useState('')

  const load = () => api.get(`/admin/user/${userId}`).then(r => setU(r.data)).catch(e => setError(errorMessage(e)))
  useEffect(() => { load() }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])

  const act = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true); setError(''); setNotice('')
    try { await fn(); setNotice(done); await load(); onChanged() }
    catch (e) { setError(errorMessage(e)) }
    finally { setBusy(false) }
  }

  const pwOk = RULES.every(r => r.test(newPw))
  const fmt = (d: string | null) => (d ? new Date(d).toLocaleString() : 'Never')

  return (
    <div className="fixed inset-0 z-[210] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm sm:p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }} role="dialog" aria-modal="true" aria-label="User details">
      <div className="w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto card rounded-b-none sm:rounded-2xl animate-slide-up">
        <div className="sticky top-0 z-10 flex items-center gap-3 px-5 py-4 bg-dark-card border-b border-white/[0.06]">
          <span className="w-10 h-10 rounded-full bg-brand/15 text-brand-soft flex items-center justify-center font-bold">{u?.username[0]?.toUpperCase() || '?'}</span>
          <div className="min-w-0 flex-1">
            <p className="text-white font-extrabold truncate">{u?.username || 'Loading…'}</p>
            <p className="text-xs text-ink-faint truncate">{u?.email}</p>
          </div>
          {u?.isAdmin && <span className="tech-pill text-gold">Admin</span>}
          {u?.suspended && <span className="tech-pill text-brand-soft">Suspended</span>}
          {u?.locked && <span className="tech-pill text-gold">Locked</span>}
          <button onClick={onClose} aria-label="Close" className="btn-icon w-9 h-9"><Icon name="close" size={20} /></button>
        </div>

        {!u ? <div className="p-6">{error ? <p className="text-brand-soft text-sm">{error}</p> : <div className="skeleton h-40" />}</div> : (
          <div className="p-5 space-y-5">
            {error  && <div role="alert" className="rounded-xl px-4 py-3 text-sm bg-brand/10 text-brand-soft">{error}</div>}
            {notice && <div role="status" className="rounded-xl px-4 py-3 text-sm bg-cyan/10 text-cyan">{notice}</div>}

            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[['Joined', new Date(u.createdAt).toLocaleDateString()], ['Last active', u.lastActiveAt ? new Date(u.lastActiveAt).toLocaleDateString() : 'Never'],
                ['My List', u.watchlistCount], ['Ratings', u.ratingsCount]].map(([k, v]) => (
                <div key={k} className="rounded-xl bg-dark-surface p-3">
                  <dt className="text-label-sm uppercase text-ink-faint">{k}</dt>
                  <dd className="text-white font-bold mt-0.5">{v}</dd>
                </div>
              ))}
            </dl>

            <section>
              <h3 className="text-label-sm uppercase text-ink-faint mb-2">Profiles ({u.profiles.length})</h3>
              {!u.profiles.length ? <p className="text-sm text-ink-faint">No profiles yet.</p> : (
                <div className="flex flex-wrap gap-2">
                  {u.profiles.map(p => (
                    <span key={p._id} className="flex items-center gap-2 rounded-full pl-1.5 pr-3 py-1 bg-dark-surface text-sm text-ink">
                      <ProfileAvatar p={p} className="w-6 h-6 rounded-full" emojiSize="text-xs" />
                      {p.name}
                      {p.isKids && <span className="text-tech-pill uppercase text-gold">Kids</span>}
                      {p.hasPin && <Icon name="lock" size={13} className="text-ink-faint" />}
                      <span className="text-xs text-ink-faint">{p.watched} watched</span>
                    </span>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h3 className="text-label-sm uppercase text-ink-faint mb-2">Recently watched</h3>
              {!u.recentlyWatched.length ? <p className="text-sm text-ink-faint">Nothing yet.</p> : (
                <ul className="divide-y divide-white/[0.05] rounded-xl bg-dark-surface">
                  {u.recentlyWatched.map(w => (
                    <li key={`${w.type}-${w.movieId}`} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <span className="flex-1 min-w-0 truncate text-white">{w.title}{w.type === 'tv' && w.season ? <span className="text-ink-faint"> · S{w.season}E{w.episode}</span> : null}</span>
                      <span className="text-xs text-ink-faint">{Math.round(w.progress)}%</span>
                      <span className="text-xs text-ink-faint hidden sm:inline">{fmt(w.watchedAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {!isSelf && (
              <section className="space-y-3">
                <h3 className="text-label-sm uppercase text-ink-faint">Actions</h3>

                {u.emailVerified === false && (
                  <div className="rounded-xl bg-dark-surface p-3 flex flex-wrap items-center gap-3">
                    <p className="text-sm text-ink flex-1 min-w-[12rem]">Email not confirmed yet — they can’t sign in until they enter the code we emailed. Confirm it yourself if you know this person.</p>
                    <button disabled={busy} onClick={() => act(() => api.put(`/admin/user/${userId}/verify-email`), 'Email confirmed')} className="btn-secondary px-4 py-2 text-xs">
                      <Icon name="mark_email_read" size={16} />Confirm email
                    </button>
                  </div>
                )}
                {!u.isAdmin && (
                  <div className="rounded-xl bg-dark-surface p-3">
                    {u.suspended ? (
                      <div className="flex flex-wrap items-center gap-3">
                        <p className="text-sm text-ink flex-1">Suspended{u.suspendedReason ? `: “${u.suspendedReason}”` : ''}. They can't sign in or use the app.</p>
                        <button disabled={busy} onClick={() => act(() => api.put(`/admin/user/${userId}/suspend`, { suspended: false }), 'Account reinstated')} className="btn-secondary px-4 py-2 text-xs">Reinstate</button>
                      </div>
                    ) : (
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input value={reason} onChange={e => setReason(e.target.value)} maxLength={300} placeholder="Reason (optional, visible to admins)" className="input h-10 flex-1" />
                        <button disabled={busy} onClick={() => confirm(`Suspend ${u.username}? They will be signed out everywhere.`) && act(() => api.put(`/admin/user/${userId}/suspend`, { suspended: true, reason }), 'Account suspended')}
                          className="h-10 px-4 rounded-full text-xs font-bold text-brand-soft border border-brand/40 hover:bg-brand/10">
                          <span className="flex items-center gap-1.5"><Icon name="block" size={16} />Suspend</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {u.locked && (
                  <div className="rounded-xl bg-dark-surface p-3 flex items-center gap-3">
                    <p className="text-sm text-ink flex-1">Locked after too many failed sign-ins.</p>
                    <button disabled={busy} onClick={() => act(() => api.put(`/admin/user/${userId}/unlock`), 'Account unlocked')} className="btn-secondary px-4 py-2 text-xs">Unlock</button>
                  </div>
                )}

                <div className="rounded-xl bg-dark-surface p-3">
                  <p className="text-sm text-ink mb-2">Reset password</p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input value={newPw} onChange={e => setNewPw(e.target.value)} type="text" autoComplete="off" spellCheck={false}
                      placeholder="New password" className="input h-10 flex-1 font-mono" aria-describedby="pw-hint" />
                    <button disabled={busy || !pwOk} onClick={() => act(async () => { await api.put(`/admin/user/${userId}/password`, { newPassword: newPw }); setNewPw('') }, 'Password reset — share it with the user securely')}
                      className="btn-secondary px-4 h-10 text-xs disabled:opacity-40">Set password</button>
                  </div>
                  <p id="pw-hint" className="text-xs text-ink-faint mt-1.5">8+ characters with an uppercase letter, a number and a symbol.</p>
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
