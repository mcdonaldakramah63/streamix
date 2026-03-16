import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { registerUser } from '../services/api'
import { useAuthStore } from '../context/authStore'

export default function Register() {
  const navigate = useNavigate()
  const { setUser } = useAuthStore()
  const [form, setForm]   = useState({ username: '', email: '', password: '', confirm: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.password !== form.confirm) return setError('Passwords do not match')
    setError(''); setLoading(true)
    try {
      const { data } = await registerUser(form.username, form.email, form.password)
      setUser(data); navigate('/')
    } catch (err: any) {
      setError(err.response?.data?.message || 'Registration failed')
    } finally { setLoading(false) }
  }

  const f = (field: string, value: string) => setForm(p => ({ ...p, [field]: value }))

  return (
    <div className="pt-14 min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-brand font-black text-3xl tracking-tight mb-1">STREAMIX</div>
          <div className="text-slate-400 text-sm">Create your account</div>
        </div>
        <form onSubmit={handleSubmit} className="bg-dark-surface border border-dark-border rounded-2xl p-6 space-y-4">
          {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm p-3 rounded-lg">{error}</div>}
          {[
            { id: 'username', label: 'Username', type: 'text', placeholder: 'johndoe' },
            { id: 'email',    label: 'Email',    type: 'email', placeholder: 'you@email.com' },
            { id: 'password', label: 'Password', type: 'password', placeholder: '••••••••' },
            { id: 'confirm',  label: 'Confirm Password', type: 'password', placeholder: '••••••••' },
          ].map(({ id, label, type, placeholder }) => (
            <div key={id}>
              <label className="text-xs text-slate-400 mb-1.5 block">{label}</label>
              <input type={type} value={(form as any)[id]} onChange={e => f(id, e.target.value)} required
                className="w-full bg-dark-card border border-dark-border rounded-lg px-4 py-2.5 text-sm text-white outline-none focus:border-brand transition-colors placeholder-slate-600"
                placeholder={placeholder} />
            </div>
          ))}
          <button type="submit" disabled={loading} className="btn-primary w-full py-3 text-sm">
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
          <p className="text-center text-sm text-slate-500">
            Have an account? <Link to="/login" className="text-brand hover:underline">Sign in</Link>
          </p>
        </form>
      </div>
    </div>
  )
}
