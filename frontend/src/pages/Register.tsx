// frontend/src/pages/Register.tsx — FULL REPLACEMENT
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../context/authStore'
import api from '../services/api'

export default function Register() {
  const navigate  = useNavigate()
  const { setUser } = useAuthStore()

  const [form,    setForm]    = useState({ username: '', email: '', password: '', confirm: '' })
  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(false)
  const [showPw,  setShowPw]  = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.username || !form.email || !form.password) { setError('Please fill in all fields'); return }
    if (form.password !== form.confirm) { setError('Passwords do not match'); return }
    if (form.password.length < 8) { setError('Password must be at least 8 characters'); return }
    setLoading(true); setError('')
    try {
      const { data } = await api.post('/auth/register', {
        username: form.username, email: form.email, password: form.password
      })
      setUser(data)
      navigate('/')
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  const pwStrength = form.password.length === 0 ? 0
    : form.password.length < 6 ? 1
    : form.password.length < 10 ? 2 : 3

  const strengthLabel = ['', 'Weak', 'Good', 'Strong']
  const strengthColor = ['', 'bg-red-500', 'bg-yellow-500', 'bg-brand']

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8 relative overflow-hidden"
      style={{ background: 'radial-gradient(ellipse at 80% 50%, rgba(20,184,166,0.06) 0%, #07080c 60%)' }}>

      <div className="absolute top-1/3 right-1/4 w-64 h-64 bg-brand/5 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-sm relative z-10">

        <div className="text-center mb-8">
          <Link to="/" className="text-brand font-bold text-2xl" style={{ fontFamily: 'Syne, sans-serif' }}>
            STREAMIX
          </Link>
          <p className="text-slate-500 text-sm mt-1">Create your account</p>
        </div>

        <div className="glass rounded-3xl p-7 shadow-deep">
          <h1 className="text-xl font-bold text-white mb-6" style={{ fontFamily: 'Syne, sans-serif' }}>
            Sign Up
          </h1>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-xl mb-5 animate-slide-down">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Username</label>
              <input type="text" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                placeholder="cooluser123" className="input" autoComplete="username" />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Email</label>
              <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="you@example.com" className="input" autoComplete="email" />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Password</label>
              <div className="relative">
                <input type={showPw ? 'text' : 'password'} value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="8+ characters" className="input pr-11" autoComplete="new-password" />
                <button type="button" onClick={() => setShowPw(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs">
                  {showPw ? 'Hide' : 'Show'}
                </button>
              </div>
              {/* Password strength */}
              {form.password && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex gap-1 flex-1">
                    {[1,2,3].map(i => (
                      <div key={i} className={`h-1 flex-1 rounded-full transition-all ${i <= pwStrength ? strengthColor[pwStrength] : 'bg-dark-border'}`} />
                    ))}
                  </div>
                  <span className={`text-xs font-medium ${pwStrength === 1 ? 'text-red-400' : pwStrength === 2 ? 'text-yellow-400' : 'text-brand'}`}>
                    {strengthLabel[pwStrength]}
                  </span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Confirm Password</label>
              <input type="password" value={form.confirm}
                onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))}
                placeholder="••••••••" className="input" autoComplete="new-password" />
              {form.confirm && form.password !== form.confirm && (
                <p className="text-red-400 text-xs mt-1">Passwords don't match</p>
              )}
            </div>

            <button type="submit" disabled={loading}
              className="btn-primary w-full py-3 text-base font-semibold mt-2 disabled:opacity-60">
              {loading ? <div className="w-5 h-5 border-2 border-dark/30 border-t-dark rounded-full animate-spin" /> : 'Create Account'}
            </button>
          </form>

          <p className="text-center text-sm text-slate-500 mt-6">
            Already have an account?{' '}
            <Link to="/login" className="text-brand hover:text-brand-light transition-colors font-medium">Sign In</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
