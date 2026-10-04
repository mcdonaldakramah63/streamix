// frontend/src/pages/admin/Dashboard.tsx — "Admin · User Management & Audit Logs" (Stitch design)
import { useEffect, useState, useCallback } from 'react'
import { useAuthStore } from '../../context/authStore'
import api, { errorMessage } from '../../services/api'
import Icon from '../../components/Icon'
import Collections from '../../components/admin/Collections'
import Reports from '../../components/admin/Reports'
import AppSettings from '../../components/admin/AppSettings'
import LibraryImport from '../../components/LibraryImport'
import Analytics from '../../components/admin/Analytics'
import UserDetailModal from '../../components/admin/UserDetailModal'
import Announcements from '../../components/admin/Announcements'
import OfficialAnime from '../../components/admin/OfficialAnime'

interface Stats {
  totalUsers: number; adminUsers: number; totalWatchlist: number
  newUsersToday: number; activeUsers: number; lockedAccounts: number
  blockedIPs: { ip: string; reason?: string; expiresIn: string }[]
}
interface UserRow { _id: string; username: string; email: string; isAdmin: boolean; createdAt: string; loginAttempts: number; lockUntil?: string | null; suspended?: boolean; lastActiveAt?: string | null; emailVerified?: boolean }
interface LogRow { _id: string; action: string; email?: string; ip?: string; severity: 'info' | 'warn' | 'critical'; createdAt: string; details?: any }

type Tab = 'overview' | 'users' | 'library' | 'official' | 'collections' | 'reports' | 'announcements' | 'settings' | 'security'
const PAGE = 15

const SEVERITY = { info: 'text-ink-muted', warn: 'text-gold', critical: 'text-brand-soft' }

export default function AdminDashboard() {
  const me = useAuthStore(s => s.user)
  const [tab,     setTab]     = useState<Tab>('overview')
  const [stats,   setStats]   = useState<Stats | null>(null)
  const [users,   setUsers]   = useState<UserRow[]>([])
  const [total,   setTotal]   = useState(0)
  const [page,    setPage]    = useState(1)
  const [search,  setSearch]  = useState('')
  const [query,   setQuery]   = useState('')
  const [logs,    setLogs]    = useState<LogRow[]>([])
  const [logSev,  setLogSev]  = useState<'' | 'warn' | 'critical'>('')
  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(true)
  const [openUser, setOpenUser] = useState<string | null>(null)

  const loadStats = useCallback(() => api.get('/admin/stats').then(r => setStats(r.data)).catch(e => setError(errorMessage(e))), [])

  const loadUsers = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/users', { params: { page, limit: PAGE, search: query || undefined } })
      setUsers(data.users || []); setTotal(data.total || 0)
    } catch (e) { setError(errorMessage(e)) }
  }, [page, query])

  const loadLogs = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/audit-logs', { params: { severity: logSev || undefined } })
      setLogs(data.logs || [])
    } catch (e) { setError(errorMessage(e)) }
  }, [logSev])

  useEffect(() => { Promise.all([loadStats(), loadUsers()]).finally(() => setLoading(false)) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { loadUsers() }, [loadUsers])
  useEffect(() => { if (tab === 'security') loadLogs() }, [tab, loadLogs])
  useEffect(() => { const t = setTimeout(() => { setQuery(search.trim()); setPage(1) }, 350); return () => clearTimeout(t) }, [search])

  const toggleAdmin = async (u: UserRow) => {
    if (!confirm(`${u.isAdmin ? 'Remove admin rights from' : 'Grant admin rights to'} ${u.username}?`)) return
    try {
      const { data } = await api.put(`/admin/user/${u._id}/admin`)
      setUsers(us => us.map(x => (x._id === u._id ? { ...x, isAdmin: data.isAdmin } : x)))
      loadStats()
    } catch (e) { alert(errorMessage(e)) }
  }

  const deleteUser = async (u: UserRow) => {
    if (!confirm(`Permanently delete ${u.username} and all of their data?`)) return
    try {
      await api.delete(`/admin/user/${u._id}`)
      loadUsers(); loadStats()
    } catch (e) { alert(errorMessage(e)) }
  }

  const unblock = async (ip: string) => {
    try { await api.post('/admin/unblock-ip', { ip }); loadStats() } catch (e) { alert(errorMessage(e)) }
  }

  const cards = stats ? [
    { label: 'Total users',  value: stats.totalUsers,     icon: 'group',             tone: 'text-brand' },
    { label: 'New today',    value: stats.newUsersToday,  icon: 'person_add',        tone: 'text-cyan' },
    { label: 'Active (7d)',  value: stats.activeUsers,    icon: 'play_circle',       tone: 'text-gold' },
    { label: 'List items',   value: stats.totalWatchlist, icon: 'bookmark',          tone: 'text-ink' },
    { label: 'Admins',       value: stats.adminUsers,     icon: 'shield_person',     tone: 'text-ink' },
    { label: 'Locked',       value: stats.lockedAccounts, icon: 'lock_clock',        tone: stats.lockedAccounts ? 'text-brand-soft' : 'text-ink' },
  ] : []

  const pages = Math.max(1, Math.ceil(total / PAGE))
  const isLocked = (u: UserRow) => !!u.lockUntil && new Date(u.lockUntil).getTime() > Date.now()

  return (
    <div className="pt-24 min-h-screen px-4 sm:px-6 lg:px-12 pb-16">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-end justify-between gap-4 mb-6">
          <div>
            <p className="text-label-sm uppercase text-brand-soft mb-1">Admin console</p>
            <h1 className="text-3xl font-extrabold text-white tracking-tight">Dashboard</h1>
          </div>
        </div>

        <div className="flex gap-1 p-1 rounded-full bg-dark-card w-fit max-w-full overflow-x-auto scrollbar-hide mb-6" role="tablist">
          {([['overview', 'monitoring', 'Overview'], ['users', 'group', 'Users'], ['library', 'video_library', 'Library'], ['official', 'smart_display', 'Official anime'], ['collections', 'collections_bookmark', 'Collections'], ['reports', 'flag', 'Reports'], ['announcements', 'campaign', 'Announcements'], ['settings', 'tune', 'Settings'], ['security', 'shield', 'Security']] as const).map(([k, icon, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
              className={`h-10 px-4 rounded-full text-sm font-bold flex items-center gap-1.5 transition-all ${tab === k ? 'bg-brand text-white shadow-brand-sm' : 'text-ink-muted hover:text-white'}`}>
              <Icon name={icon} size={18} />{label}
            </button>
          ))}
        </div>

        {error && <div className="rounded-xl px-4 py-3 mb-4 text-sm bg-brand/10 text-brand-soft">{error}</div>}

        {tab === 'overview' && (
          <div className="animate-fade-in">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {loading ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-28" />) : cards.map(c => (
              <div key={c.label} className="card p-5">
                <Icon name={c.icon} size={22} className={c.tone} />
                <p className="text-3xl font-extrabold text-white mt-2 tabular-nums">{c.value.toLocaleString()}</p>
                <p className="text-label-sm uppercase text-ink-faint">{c.label}</p>
              </div>
            ))}
          </div>
          <Analytics />
          </div>
        )}

        {tab === 'users' && (
          <div className="animate-fade-in">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
              <div className="relative flex-1 max-w-sm">
                <Icon name="search" size={20} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search username or email" className="input pl-11 h-11" />
              </div>
              <span className="text-xs text-ink-faint sm:ml-auto">{total.toLocaleString()} users</span>
            </div>

            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-dark-surface text-left">
                      {['User', 'Email', 'Joined', 'Last active', 'Role', ''].map(h => <th key={h} className="px-4 py-3 text-label-sm uppercase text-ink-faint whitespace-nowrap">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(u => (
                      <tr key={u._id} className="border-t border-white/[0.05] hover:bg-white/[0.02]">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <span className="w-8 h-8 rounded-full bg-brand/15 text-brand-soft flex items-center justify-center font-bold flex-shrink-0">{u.username[0]?.toUpperCase()}</span>
                            <button onClick={() => setOpenUser(u._id)} className="font-semibold text-white hover:underline text-left">{u.username}</button>
                            {isLocked(u) && <span className="tech-pill text-gold">Locked</span>}
                            {u.suspended && <span className="tech-pill text-brand-soft">Suspended</span>}
                            {u.emailVerified === false && <span className="tech-pill text-ink-muted" title="Hasn't entered the code from their email yet">Unconfirmed</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-ink-muted text-xs">{u.email}</td>
                        <td className="px-4 py-3 text-ink-faint text-xs whitespace-nowrap">{new Date(u.createdAt).toLocaleDateString()}</td>
                        <td className="px-4 py-3 text-ink-faint text-xs whitespace-nowrap">{u.lastActiveAt ? new Date(u.lastActiveAt).toLocaleDateString() : '—'}</td>
                        <td className="px-4 py-3">{u.isAdmin ? <span className="tech-pill text-gold">Admin</span> : <span className="tech-pill text-ink-muted">User</span>}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 justify-end">
                            <button onClick={() => setOpenUser(u._id)} className="btn-secondary px-3 py-1 text-xs">Details</button>
                          {u._id !== me?._id && (
                            <>
                              <button onClick={() => toggleAdmin(u)} className="btn-secondary px-3 py-1 text-xs whitespace-nowrap">{u.isAdmin ? 'Revoke admin' : 'Make admin'}</button>
                              {!u.isAdmin && (
                                <button onClick={() => deleteUser(u)} aria-label={`Delete ${u.username}`} className="w-8 h-8 rounded-full flex items-center justify-center text-ink-faint hover:text-brand-soft hover:bg-brand/10">
                                  <Icon name="delete" size={18} />
                                </button>
                              )}
                            </>
                          )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!users.length && <tr><td colSpan={6} className="px-4 py-10 text-center text-ink-faint">No users found</td></tr>}
                  </tbody>
                </table>
              </div>
              {pages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-white/[0.05]">
                  <span className="text-xs text-ink-faint">Page {page} of {pages}</span>
                  <div className="flex gap-2">
                    <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-40">Prev</button>
                    <button disabled={page >= pages} onClick={() => setPage(p => p + 1)} className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-40">Next</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'library' && <LibraryImport />}
        {tab === 'official' && <OfficialAnime />}
        {tab === 'collections' && <Collections />}
        {tab === 'reports' && <Reports />}
        {tab === 'settings' && <AppSettings />}

        {tab === 'announcements' && <Announcements />}

        {openUser && (
          <UserDetailModal userId={openUser} isSelf={openUser === me?._id}
            onClose={() => setOpenUser(null)} onChanged={() => { loadUsers(); loadStats() }} />
        )}

        {tab === 'security' && (
          <div className="space-y-6 animate-fade-in">
            {stats && stats.blockedIPs.length > 0 && (
              <section className="card p-5">
                <h2 className="text-label-sm uppercase text-ink-faint mb-3">Blocked IPs</h2>
                <div className="space-y-2">
                  {stats.blockedIPs.map(b => (
                    <div key={b.ip} className="flex items-center gap-3 rounded-xl bg-dark-surface px-3 py-2">
                      <span className="font-mono text-sm text-white">{b.ip}</span>
                      <span className="text-xs text-ink-faint flex-1 truncate">{b.reason} · {b.expiresIn}</span>
                      <button onClick={() => unblock(b.ip)} className="btn-secondary px-3 py-1 text-xs">Unblock</button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="card overflow-hidden">
              <div className="flex items-center justify-between gap-3 px-5 py-4">
                <h2 className="text-label-sm uppercase text-ink-faint">Audit log</h2>
                <select value={logSev} onChange={e => setLogSev(e.target.value as any)} aria-label="Severity"
                  className="h-9 px-3 rounded-full bg-dark-border text-ink text-xs font-bold outline-none">
                  <option value="">All events</option><option value="warn">Warnings</option><option value="critical">Critical</option>
                </select>
              </div>
              <div className="divide-y divide-white/[0.05] max-h-[560px] overflow-y-auto">
                {logs.map(l => (
                  <div key={l._id} className="px-5 py-3 flex items-start gap-3">
                    <Icon name={l.severity === 'critical' ? 'gpp_bad' : l.severity === 'warn' ? 'warning' : 'info'} size={18} className={`${SEVERITY[l.severity]} mt-0.5`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-white">{l.action.replace(/_/g, ' ').toLowerCase()}</p>
                      <p className="text-xs text-ink-faint truncate">{[l.email, l.ip, l.details?.path].filter(Boolean).join(' · ')}</p>
                    </div>
                    <span className="text-xs text-ink-faint whitespace-nowrap">{new Date(l.createdAt).toLocaleString()}</span>
                  </div>
                ))}
                {!logs.length && <p className="px-5 py-10 text-center text-ink-faint text-sm">No events</p>}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
