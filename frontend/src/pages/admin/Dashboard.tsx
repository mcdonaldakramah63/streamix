// frontend/src/pages/admin/Dashboard.tsx — FULL REPLACEMENT
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../context/authStore'
import api from '../../services/api'

interface Stats {
  totalUsers:    number
  totalWatchlist:number
  newUsersToday: number
  activeUsers:   number
}

interface UserRow {
  _id:       string
  username:  string
  email:     string
  isAdmin:   boolean
  createdAt: string
  loginAttempts: number
}

type Tab = 'overview' | 'users' | 'security'

export default function AdminDashboard() {
  const navigate  = useNavigate()
  const { user }  = useAuthStore()

  const [tab,      setTab]      = useState<Tab>('overview')
  const [stats,    setStats]    = useState<Stats | null>(null)
  const [users,    setUsers]    = useState<UserRow[]>([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')
  const [page,     setPage]     = useState(1)
  const [total,    setTotal]    = useState(0)

  useEffect(() => {
    if (!user?.isAdmin) { navigate('/'); return }
    fetchData()
  }, [user])

  useEffect(() => { if (tab === 'users') fetchUsers() }, [tab, page, search])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [s, u] = await Promise.all([
        api.get('/admin/stats').catch(() => ({ data: null })),
        api.get('/admin/users?page=1&limit=10').catch(() => ({ data: { users: [], total: 0 } })),
      ])
      setStats(s.data)
      setUsers(u.data.users || [])
      setTotal(u.data.total || 0)
    } finally { setLoading(false) }
  }

  const fetchUsers = async () => {
    try {
      const { data } = await api.get('/admin/users', { params: { page, limit: 15, search: search || undefined } })
      setUsers(data.users || [])
      setTotal(data.total || 0)
    } catch (e) { console.error(e) }
  }

  const toggleAdmin = async (userId: string, current: boolean) => {
    try {
      await api.put(`/admin/users/${userId}`, { isAdmin: !current })
      setUsers(us => us.map(u => u._id === userId ? { ...u, isAdmin: !current } : u))
    } catch (e) { console.error(e) }
  }

  const deleteUser = async (userId: string) => {
    if (!confirm('Delete this user permanently?')) return
    try {
      await api.delete(`/admin/users/${userId}`)
      setUsers(us => us.filter(u => u._id !== userId))
      setTotal(t => t - 1)
    } catch (e) { console.error(e) }
  }

  if (!user?.isAdmin) return null

  const STAT_CARDS = stats ? [
    { label: 'Total Users',     value: stats.totalUsers?.toLocaleString()    || '—', icon: '👥', color: 'text-brand' },
    { label: 'New Today',       value: stats.newUsersToday?.toLocaleString() || '—', icon: '✨', color: 'text-emerald-400' },
    { label: 'Active Users',    value: stats.activeUsers?.toLocaleString()   || '—', icon: '🔥', color: 'text-orange-400' },
    { label: 'Watchlist Items', value: stats.totalWatchlist?.toLocaleString()|| '—', icon: '🔖', color: 'text-purple-400' },
  ] : []

  const TABS: { key: Tab; label: string; icon: string }[] = [
    { key: 'overview', label: 'Overview', icon: '📊' },
    { key: 'users',    label: 'Users',    icon: '👥' },
    { key: 'security', label: 'Security', icon: '🛡' },
  ]

  return (
    <div className="pt-16 min-h-screen px-3 sm:px-6 py-6">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-7">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-brand mb-1">Admin Panel</p>
            <h1 className="text-2xl sm:text-3xl font-bold text-white" style={{ fontFamily:'Syne, sans-serif' }}>
              Dashboard
            </h1>
          </div>
          <button onClick={() => navigate('/')} className="btn-ghost text-sm">
            ← Back to Site
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-dark-surface border border-dark-border rounded-xl p-1 w-fit mb-7">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                tab === t.key ? 'bg-brand text-dark' : 'text-slate-400 hover:text-white'
              }`}>
              <span>{t.icon}</span>{t.label}
            </button>
          ))}
        </div>

        {/* ── Overview ── */}
        {tab === 'overview' && (
          <div className="animate-fade-in">
            {loading ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
                {Array(4).fill(0).map((_,i) => <div key={i} className="skeleton rounded-2xl h-28" />)}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
                {STAT_CARDS.map(s => (
                  <div key={s.label} className="card p-5">
                    <div className="text-2xl mb-2">{s.icon}</div>
                    <div className={`text-2xl sm:text-3xl font-bold mb-0.5 ${s.color}`} style={{ fontFamily:'Syne, sans-serif' }}>{s.value}</div>
                    <div className="text-xs text-slate-500">{s.label}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Recent users preview */}
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-dark-border">
                <h3 className="text-sm font-bold text-white" style={{ fontFamily:'Syne, sans-serif' }}>Recent Users</h3>
                <button onClick={() => setTab('users')} className="text-xs text-brand hover:underline">View all</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-dark-border">
                      <th className="text-left px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-600">User</th>
                      <th className="text-left px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-600 hidden sm:table-cell">Email</th>
                      <th className="text-left px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-600 hidden md:table-cell">Joined</th>
                      <th className="text-left px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-600">Role</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.slice(0,5).map((u, i) => (
                      <tr key={u._id} className={`border-b border-dark-border/40 hover:bg-dark-hover transition-colors ${i % 2 === 0 ? '' : 'bg-dark-surface/30'}`}>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-brand/15 flex items-center justify-center text-brand text-sm font-bold flex-shrink-0">
                              {u.username[0].toUpperCase()}
                            </div>
                            <span className="font-medium text-white text-sm">{u.username}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-slate-400 text-xs hidden sm:table-cell">{u.email}</td>
                        <td className="px-5 py-3.5 text-slate-500 text-xs hidden md:table-cell">
                          {new Date(u.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className={`badge text-[10px] ${u.isAdmin ? 'badge-brand' : 'bg-dark-surface border border-dark-border text-slate-500'}`}>
                            {u.isAdmin ? '👑 Admin' : 'User'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── Users ── */}
        {tab === 'users' && (
          <div className="animate-fade-in">
            {/* Search + count */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
              <div className="flex items-center gap-2.5 bg-dark-surface border border-dark-border rounded-xl px-4 py-2.5 flex-1 max-w-sm focus-within:border-brand/40 transition-colors">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-500 flex-shrink-0">
                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                </svg>
                <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
                  placeholder="Search users…"
                  className="bg-transparent outline-none text-sm text-white placeholder-slate-500 flex-1" />
                {search && <button onClick={() => { setSearch(''); setPage(1) }} className="text-slate-500 hover:text-white text-xs">✕</button>}
              </div>
              <span className="text-xs text-slate-600 sm:ml-auto">{total.toLocaleString()} users total</span>
            </div>

            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-dark-border bg-dark-surface">
                      {['User', 'Email', 'Joined', 'Role', 'Actions'].map(h => (
                        <th key={h} className="text-left px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-600 whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u, i) => (
                      <tr key={u._id} className={`border-b border-dark-border/40 hover:bg-dark-hover transition-colors ${i % 2 === 0 ? '' : 'bg-dark-surface/20'}`}>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="w-7 h-7 rounded-full bg-brand/15 flex items-center justify-center text-brand text-xs font-bold flex-shrink-0">
                              {u.username[0].toUpperCase()}
                            </div>
                            <span className="font-medium text-white">{u.username}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-slate-400 text-xs">{u.email}</td>
                        <td className="px-5 py-3.5 text-slate-500 text-xs whitespace-nowrap">
                          {new Date(u.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className={`badge text-[10px] ${u.isAdmin ? 'badge-brand' : 'bg-dark-surface border border-dark-border text-slate-500'}`}>
                            {u.isAdmin ? '👑 Admin' : 'User'}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <button onClick={() => toggleAdmin(u._id, u.isAdmin)}
                              className="text-[10px] px-2.5 py-1 rounded-lg border border-dark-border text-slate-400 hover:border-brand/40 hover:text-white transition-colors whitespace-nowrap">
                              {u.isAdmin ? 'Remove Admin' : 'Make Admin'}
                            </button>
                            {u._id !== user?._id && (
                              <button onClick={() => deleteUser(u._id)}
                                className="text-[10px] px-2.5 py-1 rounded-lg border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-colors">
                                Delete
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {total > 15 && (
                <div className="flex items-center justify-between px-5 py-4 border-t border-dark-border">
                  <span className="text-xs text-slate-600">Page {page} of {Math.ceil(total/15)}</span>
                  <div className="flex gap-2">
                    <button disabled={page === 1} onClick={() => setPage(p => p-1)}
                      className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-40">← Prev</button>
                    <button disabled={page >= Math.ceil(total/15)} onClick={() => setPage(p => p+1)}
                      className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-40">Next →</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Security ── */}
        {tab === 'security' && (
          <div className="animate-fade-in space-y-4">
            <div className="card p-6">
              <h3 className="text-sm font-bold text-white mb-4" style={{ fontFamily:'Syne, sans-serif' }}>
                🛡 Security Overview
              </h3>
              <div className="grid sm:grid-cols-2 gap-4">
                {[
                  { label: 'Rate Limiting',      status: 'Active',   desc: '300 req/15min general, 10 req/15min auth' },
                  { label: 'JWT Authentication', status: 'Active',   desc: '64-byte secret, token expiry enabled' },
                  { label: 'XSS Protection',     status: 'Active',   desc: 'xss-clean middleware enabled' },
                  { label: 'NoSQL Injection',     status: 'Active',   desc: 'express-mongo-sanitize enabled' },
                  { label: 'CORS Policy',         status: 'Active',   desc: 'Restricted to streammix.netlify.app' },
                  { label: 'HTTP Headers',        status: 'Active',   desc: 'Helmet.js security headers' },
                ].map(s => (
                  <div key={s.label} className="flex items-start gap-3 p-4 bg-dark-surface rounded-xl border border-dark-border">
                    <div className="w-2 h-2 rounded-full bg-emerald-400 mt-1.5 flex-shrink-0 shadow-[0_0_8px_rgba(52,211,153,0.5)]" />
                    <div>
                      <p className="text-sm font-semibold text-white">{s.label}</p>
                      <p className="text-[11px] text-emerald-400 font-medium mb-0.5">{s.status}</p>
                      <p className="text-[11px] text-slate-500">{s.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Locked accounts */}
            {users.filter(u => u.loginAttempts >= 5).length > 0 && (
              <div className="card p-6">
                <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                  <span className="text-red-400">⚠</span> Suspicious Activity
                </h3>
                <div className="space-y-2">
                  {users.filter(u => u.loginAttempts >= 5).map(u => (
                    <div key={u._id} className="flex items-center justify-between p-3 bg-red-500/5 border border-red-500/20 rounded-xl">
                      <div>
                        <p className="text-sm font-medium text-white">{u.username}</p>
                        <p className="text-xs text-red-400">{u.loginAttempts} failed login attempts</p>
                      </div>
                      <button onClick={() => deleteUser(u._id)}
                        className="text-xs px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-colors">
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
