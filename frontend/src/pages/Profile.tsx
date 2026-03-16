import { useState } from 'react'
import { useAuthStore } from '../context/authStore'
import { updateProfile } from '../services/api'

export default function Profile() {
  const { user, setUser } = useAuthStore()
  const [form, setForm]   = useState({ username: user?.username || '', email: user?.email || '', password: '' })
  const [msg, setMsg]     = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setMsg('')
    try {
      const payload: any = { username: form.username, email: form.email }
      if (form.password) payload.password = form.password
      const { data } = await updateProfile(payload)
      setUser({ ...user!, ...data })
      setMsg('Profile updated!')
    } catch (err: any) {
      setMsg(err.response?.data?.message || 'Update failed')
    } finally { setLoading(false) }
  }

  return (
    <div className="pt-20 max-w-lg mx-auto px-4 pb-12">
      <h1 className="text-2xl font-black mb-6">My Profile</h1>
      <div className="bg-dark-surface border border-dark-border rounded-2xl p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-full bg-brand/20 flex items-center justify-center text-brand font-black text-2xl">
            {user?.username[0].toUpperCase()}
          </div>
          <div>
            <div className="font-bold text-lg">{user?.username}</div>
            <div className="text-slate-400 text-sm">{user?.isAdmin ? '👑 Admin' : 'Member'}</div>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {msg && <div className={`text-sm p-3 rounded-lg ${msg.includes('!') ? 'bg-brand/10 border border-brand/30 text-brand' : 'bg-red-500/10 border border-red-500/30 text-red-400'}`}>{msg}</div>}
          {[
            { id: 'username', label: 'Username', type: 'text' },
            { id: 'email', label: 'Email', type: 'email' },
            { id: 'password', label: 'New Password (leave blank to keep)', type: 'password' },
          ].map(({ id, label, type }) => (
            <div key={id}>
              <label className="text-xs text-slate-400 mb-1.5 block">{label}</label>
              <input type={type} value={(form as any)[id]} onChange={e => setForm(p => ({ ...p, [id]: e.target.value }))}
                className="w-full bg-dark-card border border-dark-border rounded-lg px-4 py-2.5 text-sm text-white outline-none focus:border-brand transition-colors" />
            </div>
          ))}
          <button type="submit" disabled={loading} className="btn-primary w-full py-2.5 text-sm">
            {loading ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      </div>
    </div>
  )
}
