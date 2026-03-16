import { useEffect, useState } from 'react'
import { adminGetStats, adminGetUsers, adminDeleteUser, adminToggleAdmin } from '../../services/api'
import axios from 'axios'

interface Stats {
  totalUsers: number
  adminUsers: number
  totalWatchlist: number
  recentUsers: any[]
  recentLogs: any[]
  blockedIPs: any[]
}

const SEV_STYLE: Record<string, string> = {
  info:     'bg-blue-500/10  text-blue-400  border-blue-500/20',
  warn:     'bg-amber-500/10 text-amber-400 border-amber-500/20',
  critical: 'bg-red-500/10   text-red-400   border-red-500/20',
}

export default function AdminDashboard() {
  const [stats,   setStats]   = useState<Stats | null>(null)
  const [users,   setUsers]   = useState<any[]>([])
  const [logs,    setLogs]    = useState<any[]>([])
  const [tab,     setTab]     = useState<'overview' | 'users' | 'security'>('overview')
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    const [s, u] = await Promise.all([adminGetStats(), adminGetUsers()])
    setStats(s.data)
    setUsers(u.data)
    setLoading(false)
  }

  const loadLogs = async () => {
    const { data } = await axios.get('/api/admin/audit-logs?severity=warn')
    setLogs(data.logs || [])
  }

  useEffect(() => { load() }, [])
  useEffect(() => { if (tab === 'security') loadLogs() }, [tab])

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this user?')) return
    await adminDeleteUser(id)
    setUsers(u => u.filter(x => x._id !== id))
  }

  const handleToggleAdmin = async (id: string) => {
    await adminToggleAdmin(id)
    load()
  }

  const handleUnblockIP = async (ip: string) => {
    await axios.post('/api/admin/unblock-ip', { ip })
    load()
  }

  const TABS = [
    { id: 'overview', label: '📊 Overview' },
    { id: 'users',    label: '👤 Users'    },
    { id: 'security', label: '🔒 Security' },
  ] as const

  return (
    <div className="pt-20 max-w-6xl mx-auto px-4 pb-12">
      <h1 className="text-2xl font-black mb-6 flex items-center gap-2">👑 Admin Panel</h1>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === t.id ? 'bg-brand text-dark' : 'bg-dark-card border border-dark-border text-slate-400 hover:text-white'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? <div className="text-slate-500 animate-pulse">Loading...</div> : <>

        {/* ── OVERVIEW ── */}
        {tab === 'overview' && stats && (
          <div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
              {[
                { label: 'Total Users',     value: stats.totalUsers,     icon: '👤' },
                { label: 'Admin Users',     value: stats.adminUsers,     icon: '👑' },
                { label: 'Watchlist Saves', value: stats.totalWatchlist, icon: '📌' },
                { label: 'Blocked IPs',     value: stats.blockedIPs?.length || 0, icon: '🚫' },
                { label: 'Security Events', value: stats.recentLogs?.length || 0,  icon: '⚠️' },
              ].map(s => (
                <div key={s.label} className="bg-dark-surface border border-dark-border rounded-xl p-5">
                  <div className="text-2xl mb-1">{s.icon}</div>
                  <div className="text-3xl font-black text-brand">{s.value}</div>
                  <div className="text-sm text-slate-400 mt-1">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Recent security events */}
            {stats.recentLogs?.length > 0 && (
              <div className="mb-6">
                <h2 className="text-base font-bold mb-3">⚠ Recent Security Events</h2>
                <div className="bg-dark-surface border border-dark-border rounded-xl overflow-hidden">
                  {stats.recentLogs.slice(0, 5).map((l, i) => (
                    <div key={l._id} className={`flex items-center gap-3 px-4 py-3 ${i < 4 ? 'border-b border-dark-border' : ''}`}>
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${SEV_STYLE[l.severity]}`}>{l.severity}</span>
                      <span className="text-sm font-mono text-slate-300 flex-1">{l.action}</span>
                      <span className="text-xs text-slate-500">{l.email || l.ip}</span>
                      <span className="text-xs text-slate-600">{new Date(l.createdAt).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent signups */}
            <h2 className="text-base font-bold mb-3">Recent Signups</h2>
            <div className="bg-dark-surface border border-dark-border rounded-xl overflow-hidden">
              {stats.recentUsers.map((u, i) => (
                <div key={u._id} className={`flex items-center gap-4 px-5 py-3 ${i < stats.recentUsers.length - 1 ? 'border-b border-dark-border' : ''}`}>
                  <div className="w-8 h-8 rounded-full bg-brand/20 flex items-center justify-center text-brand font-bold text-sm">{u.username[0].toUpperCase()}</div>
                  <div className="flex-1"><div className="text-sm font-semibold">{u.username}</div><div className="text-xs text-slate-500">{u.email}</div></div>
                  <div className="text-xs text-slate-500">{new Date(u.createdAt).toLocaleDateString()}</div>
                  {u.isAdmin && <span className="text-xs bg-brand/10 text-brand border border-brand/20 px-2 py-0.5 rounded-full">Admin</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── USERS ── */}
        {tab === 'users' && (
          <div className="bg-dark-surface border border-dark-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dark-border">
                  {['User','Email','Joined','Role','Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs text-slate-400 font-semibold uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((u, i) => (
                  <tr key={u._id} className={`${i < users.length-1 ? 'border-b border-dark-border' : ''} hover:bg-dark-card transition-colors`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-brand/20 flex items-center justify-center text-brand text-xs font-bold">{u.username[0].toUpperCase()}</div>
                        <span className="font-medium">{u.username}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{u.email}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{new Date(u.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full border ${u.isAdmin ? 'bg-brand/10 text-brand border-brand/20' : 'bg-dark-card text-slate-400 border-dark-border'}`}>
                        {u.isAdmin ? 'Admin' : 'User'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button onClick={() => handleToggleAdmin(u._id)} className="text-xs px-2 py-1 rounded bg-dark-card border border-dark-border hover:border-brand text-slate-400 hover:text-brand transition-colors">
                          {u.isAdmin ? 'Revoke' : 'Make Admin'}
                        </button>
                        <button onClick={() => handleDelete(u._id)} className="text-xs px-2 py-1 rounded bg-dark-card border border-dark-border hover:border-red-500 text-slate-400 hover:text-red-400 transition-colors">
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── SECURITY ── */}
        {tab === 'security' && (
          <div className="space-y-6">
            {/* Blocked IPs */}
            <div>
              <h2 className="text-base font-bold mb-3">🚫 Blocked IPs</h2>
              {stats?.blockedIPs?.length === 0 ? (
                <div className="bg-dark-surface border border-dark-border rounded-xl p-5 text-slate-500 text-sm">No IPs currently blocked</div>
              ) : (
                <div className="bg-dark-surface border border-dark-border rounded-xl overflow-hidden">
                  {stats?.blockedIPs?.map((b, i) => (
                    <div key={b.ip} className={`flex items-center gap-4 px-4 py-3 ${i < (stats.blockedIPs.length - 1) ? 'border-b border-dark-border' : ''}`}>
                      <span className="font-mono text-sm text-red-400">{b.ip}</span>
                      <span className="text-xs text-slate-500 flex-1">{b.reason}</span>
                      <span className="text-xs text-slate-500">expires in {b.expiresIn}</span>
                      <button onClick={() => handleUnblockIP(b.ip)} className="text-xs px-2 py-1 rounded bg-dark-card border border-dark-border hover:border-brand text-slate-400 hover:text-brand transition-colors">Unblock</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Audit logs */}
            <div>
              <h2 className="text-base font-bold mb-3">📋 Security Audit Log</h2>
              <div className="bg-dark-surface border border-dark-border rounded-xl overflow-hidden">
                {logs.length === 0 ? (
                  <div className="p-5 text-slate-500 text-sm">No security events recorded</div>
                ) : logs.map((l, i) => (
                  <div key={l._id} className={`flex items-center gap-3 px-4 py-3 ${i < logs.length-1 ? 'border-b border-dark-border' : ''}`}>
                    <span className={`text-xs px-2 py-0.5 rounded-full border flex-shrink-0 ${SEV_STYLE[l.severity]}`}>{l.severity}</span>
                    <span className="text-xs font-mono text-slate-300 w-40 flex-shrink-0">{l.action}</span>
                    <span className="text-xs text-slate-400 flex-1 truncate">{l.email || '—'}</span>
                    <span className="text-xs text-slate-500 flex-shrink-0">{l.ip}</span>
                    <span className="text-xs text-slate-600 flex-shrink-0">{new Date(l.createdAt).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </>}
    </div>
  )
}
