// frontend/src/pages/Profile.tsx — FULL REPLACEMENT
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../context/authStore'
import { useContinueWatching } from '../stores/continueWatchingStore'
import { useWatchlistStore }   from '../stores/watchlistStore'
import api from '../services/api'

export default function Profile() {
  const navigate  = useNavigate()
  const { user, logout, setUser } = useAuthStore()
  const { items: cwItems }  = useContinueWatching()
  const { items: wlItems }  = useWatchlistStore()

  const [tab,     setTab]     = useState<'overview'|'settings'>('overview')
  const [form,    setForm]    = useState({ username: '', currentPassword: '', newPassword: '', confirmPassword: '' })
  const [saving,  setSaving]  = useState(false)
  const [msg,     setMsg]     = useState<{ text: string; type: 'success'|'error' } | null>(null)

  useEffect(() => {
    if (!user) { navigate('/login'); return }
    setForm(f => ({ ...f, username: user.username }))
  }, [user])

  if (!user) return null

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.newPassword && form.newPassword !== form.confirmPassword) {
      setMsg({ text: 'Passwords do not match', type: 'error' }); return
    }
    setSaving(true); setMsg(null)
    try {
      const payload: any = {}
      if (form.username !== user.username) payload.username = form.username
      if (form.newPassword) { payload.currentPassword = form.currentPassword; payload.newPassword = form.newPassword }
      if (!Object.keys(payload).length) { setMsg({ text: 'Nothing to update', type: 'error' }); setSaving(false); return }
      const { data } = await api.put('/users/update', payload)
      setUser({ ...user, ...data })
      setMsg({ text: 'Profile updated!', type: 'success' })
      setForm(f => ({ ...f, currentPassword: '', newPassword: '', confirmPassword: '' }))
    } catch (err: any) {
      setMsg({ text: err?.response?.data?.message || 'Update failed', type: 'error' })
    } finally { setSaving(false) }
  }

  const stats = [
    { label: 'Watching',    value: cwItems.length,                  icon: '▶' },
    { label: 'Watchlist',   value: wlItems.length,                  icon: '🔖' },
    { label: 'Completed',   value: cwItems.filter(i => i.progress >= 90).length, icon: '✓' },
    { label: 'Member Since',value: '2024',                          icon: '📅' },
  ]

  return (
    <div className="pt-16 min-h-screen px-3 sm:px-6 py-6">
      <div className="max-w-2xl mx-auto">

        {/* Profile header */}
        <div className="card p-6 mb-6 flex items-center gap-5">
          {/* Avatar */}
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-brand/15 flex items-center justify-center flex-shrink-0 border border-brand/20">
            <span className="text-brand font-bold text-2xl sm:text-3xl" style={{ fontFamily:'Syne, sans-serif' }}>
              {user.username[0].toUpperCase()}
            </span>
          </div>

          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-white" style={{ fontFamily:'Syne, sans-serif' }}>
              {user.username}
            </h1>
            <p className="text-slate-500 text-sm">{user.email}</p>
            {user.isAdmin && (
              <span className="badge-brand text-[11px] mt-1.5">👑 Admin</span>
            )}
          </div>

          <button onClick={() => { logout(); navigate('/') }}
            className="btn-ghost text-red-400 hover:text-red-300 text-sm flex-shrink-0">
            Sign Out
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-2 sm:gap-3 mb-6">
          {stats.map(s => (
            <div key={s.label} className="card p-3 sm:p-4 text-center">
              <div className="text-xl sm:text-2xl mb-1">{s.icon}</div>
              <div className="text-lg sm:text-2xl font-bold text-white" style={{ fontFamily:'Syne, sans-serif' }}>
                {s.value}
              </div>
              <div className="text-[10px] sm:text-xs text-slate-500 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-dark-surface border border-dark-border rounded-xl p-1 mb-6 w-fit">
          {[
            { key: 'overview', label: '📊 Overview' },
            { key: 'settings', label: '⚙️ Settings' },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key as any)}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                tab === t.key ? 'bg-brand text-dark' : 'text-slate-400 hover:text-white'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Overview tab */}
        {tab === 'overview' && (
          <div className="space-y-4 animate-fade-in">
            {/* Recent CW */}
            {cwItems.length > 0 && (
              <div className="card p-5">
                <h3 className="text-sm font-bold text-white mb-3">Recently Watched</h3>
                <div className="space-y-3">
                  {cwItems.slice(0,5).map(item => (
                    <div key={item.movieId}
                      onClick={() => navigate(item.type === 'tv' ? `/tv/${item.movieId}` : `/movie/${item.movieId}`)}
                      className="flex items-center gap-3 cursor-pointer hover:bg-dark-hover rounded-xl p-2 -mx-2 transition-colors">
                      {item.poster && (
                        <img src={`https://image.tmdb.org/t/p/w92${item.poster}`} alt=""
                          className="w-10 h-14 object-cover rounded-lg flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{item.title}</p>
                        {item.type === 'tv' && item.season && (
                          <p className="text-xs text-slate-500">S{item.season}·E{item.episode}</p>
                        )}
                        <div className="mt-1.5 h-1 bg-dark-border rounded-full overflow-hidden w-full max-w-[140px]">
                          <div className="h-full bg-brand rounded-full" style={{ width:`${item.progress}%` }} />
                        </div>
                      </div>
                      <span className="text-xs text-slate-600">{item.progress}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quick links */}
            <div className="card p-5">
              <h3 className="text-sm font-bold text-white mb-3">Quick Actions</h3>
              <div className="space-y-1">
                {[
                  { label: 'My Watchlist',      icon: '🔖', to: '/watchlist' },
                  { label: 'Browse Movies',     icon: '🎬', to: '/' },
                  { label: 'Browse Anime',      icon: '🎌', to: '/anime' },
                  ...(user.isAdmin ? [{ label: 'Admin Dashboard', icon: '👑', to: '/admin' }] : []),
                ].map(({ label, icon, to }) => (
                  <button key={to} onClick={() => navigate(to)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-slate-300 hover:bg-dark-hover hover:text-white transition-all text-left">
                    <span>{icon}</span> {label}
                    <svg className="ml-auto" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="m9 18 6-6-6-6"/>
                    </svg>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Settings tab */}
        {tab === 'settings' && (
          <div className="card p-5 sm:p-6 animate-fade-in">
            <h3 className="text-sm font-bold text-white mb-5">Account Settings</h3>

            {msg && (
              <div className={`px-4 py-3 rounded-xl text-sm mb-5 animate-slide-down ${
                msg.type === 'success'
                  ? 'bg-brand/10 border border-brand/30 text-brand'
                  : 'bg-red-500/10 border border-red-500/30 text-red-400'
              }`}>
                {msg.text}
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-5">
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-1.5">Username</label>
                <input type="text" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                  className="input" />
              </div>

              <div className="border-t border-dark-border pt-5">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">Change Password</p>
                <div className="space-y-3">
                  <input type="password" value={form.currentPassword}
                    onChange={e => setForm(f => ({ ...f, currentPassword: e.target.value }))}
                    placeholder="Current password" className="input" />
                  <input type="password" value={form.newPassword}
                    onChange={e => setForm(f => ({ ...f, newPassword: e.target.value }))}
                    placeholder="New password" className="input" />
                  <input type="password" value={form.confirmPassword}
                    onChange={e => setForm(f => ({ ...f, confirmPassword: e.target.value }))}
                    placeholder="Confirm new password" className="input" />
                </div>
              </div>

              <button type="submit" disabled={saving} className="btn-primary w-full py-3 font-semibold disabled:opacity-60">
                {saving ? <div className="w-5 h-5 border-2 border-dark/30 border-t-dark rounded-full animate-spin" /> : 'Save Changes'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
