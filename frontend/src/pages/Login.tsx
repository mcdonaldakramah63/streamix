// Login.tsx - mobile optimized
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { loginUser } from '../services/api'
import { useAuthStore } from '../context/authStore'

export function Login() {
  const navigate = useNavigate()
  const { setUser } = useAuthStore()
  const [form,    setForm]    = useState({ email: '', password: '' })
  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true)
    try {
      const { data } = await loginUser(form.email, form.password)
      setUser(data); navigate('/')
    } catch (err: any) { setError(err.response?.data?.message || 'Login failed') }
    finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 pt-14 pb-8">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-brand font-black text-3xl tracking-tight mb-1">STREAMIX</div>
          <div className="text-slate-400 text-sm">Welcome back</div>
        </div>
        <form onSubmit={handleSubmit} className="bg-dark-surface border border-dark-border rounded-2xl p-5 sm:p-6 space-y-4">
          {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm p-3 rounded-lg">{error}</div>}
          <div>
            <label className="text-xs text-slate-400 mb-1.5 block">Email</label>
            <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required
              className="w-full bg-dark-card border border-dark-border rounded-lg px-4 py-3 text-base text-white outline-none focus:border-brand transition-colors placeholder-slate-600"
              placeholder="you@email.com" autoComplete="email" inputMode="email" />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1.5 block">Password</label>
            <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required
              className="w-full bg-dark-card border border-dark-border rounded-lg px-4 py-3 text-base text-white outline-none focus:border-brand transition-colors placeholder-slate-600"
              placeholder="••••••••" autoComplete="current-password" />
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full py-3 text-sm">
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
          <p className="text-center text-sm text-slate-500">
            No account? <Link to="/register" className="text-brand hover:underline">Sign up free</Link>
          </p>
        </form>
      </div>
    </div>
  )
}

export default Login
