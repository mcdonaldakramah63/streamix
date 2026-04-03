// frontend/src/pages/Profile.tsx — FIXED PIN SAVE
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../context/authStore'
import { useProfileStore } from '../stores/profileStore'
import api from '../services/api'

const AVATARS = ['🎬','📺','🎌','🎭','🚀','👻','💕','⚔️','🧙','🔍','🎵','🌍','👨‍👩‍👧','🎨','😂','🦸','🐉','🏆']
const COLORS  = ['#14b8a6','#8b5cf6','#f59e0b','#ef4444','#3b82f6','#10b981','#f97316','#ec4899','#6366f1','#84cc16']

interface FormState {
  name: string
  avatar: string
  color: string
  isKids: boolean
  pin?: string
}

function ProfileCard({
  profile, isActive, onSelect, onEdit, onDelete,
}: {
  profile:any; isActive:boolean; onSelect:()=>void; onEdit:()=>void; onDelete:()=>void
}) {
  return (
    <div className={`card p-4 transition-all cursor-pointer ${isActive ? 'ring-2 ring-brand' : 'hover:border-slate-600'}`}
      onClick={onSelect}>
      <div className="flex items-center gap-3 mb-3">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0"
          style={{ background: (profile.color || '#14b8a6') + '25' }}>
          {profile.avatar || '🎬'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold text-white truncate">{profile.name}</p>
            {isActive && <span className="text-[10px] bg-brand/20 text-brand px-1.5 py-0.5 rounded-full font-bold">Active</span>}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            {profile.isKids && <span className="text-[10px] bg-yellow-400/20 text-yellow-300 px-1.5 py-0.5 rounded-full font-bold">KIDS</span>}
            {!profile.isKids && profile.pin && <span className="text-[10px] bg-amber-400/20 text-amber-300 px-1.5 py-0.5 rounded-full font-bold">🔒 PIN</span>}
          </div>
        </div>
      </div>
      <div className="flex gap-2" onClick={e => e.stopPropagation()}>
        <button onClick={onSelect}
          className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${isActive ? 'bg-brand/15 text-brand border border-brand/30' : 'btn-secondary'}`}>
          {isActive ? '✓ Active' : 'Switch To'}
        </button>
        <button onClick={onEdit}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 border border-dark-border hover:border-slate-500 hover:text-white transition-all">
          Edit
        </button>
        <button onClick={onDelete}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-red-400/70 border border-dark-border hover:border-red-500/40 hover:text-red-400 transition-all">
          ✕
        </button>
      </div>
    </div>
  )
}

function ProfileForm({
  initial, onSave, onCancel, loading,
}: {
  initial: FormState
  onSave: (f: FormState) => void
  onCancel: () => void
  loading: boolean
}) {
  const [form, setForm] = useState<FormState>(initial)

  return (
    <div className="space-y-4">
      {/* Name */}
      <div>
        <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1.5">Profile Name</label>
        <input
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          placeholder="e.g. Kwame, Kids, Mum…"
          maxLength={30}
          className="input w-full"
          autoFocus
        />
      </div>

      {/* Avatar */}
      <div>
        <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1.5">Avatar</label>
        <div className="flex flex-wrap gap-2">
          {AVATARS.map(a => (
            <button key={a} type="button" onClick={() => setForm(f => ({ ...f, avatar: a }))}
              className={`w-10 h-10 rounded-xl text-xl flex items-center justify-center transition-all ${
                form.avatar === a ? 'ring-2 ring-brand bg-brand/15 scale-110' : 'bg-dark-surface hover:bg-dark-hover'
              }`}>
              {a}
            </button>
          ))}
        </div>
      </div>

      {/* Color */}
      <div>
        <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1.5">Color</label>
        <div className="flex gap-2 flex-wrap">
          {COLORS.map(c => (
            <button key={c} type="button" onClick={() => setForm(f => ({ ...f, color: c }))}
              className={`w-8 h-8 rounded-full transition-all ${form.color === c ? 'ring-2 ring-white scale-110' : ''}`}
              style={{ background: c }} />
          ))}
        </div>
      </div>

      {/* Kids mode */}
      <div>
        <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-2">Kids Mode</label>
        <button type="button" onClick={() => setForm(f => ({ ...f, isKids: !f.isKids }))}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
            form.isKids ? 'bg-yellow-400/10 border-yellow-400/40 text-yellow-300' : 'border-dark-border text-slate-400 hover:border-slate-500'
          }`}>
          <div className={`w-10 h-6 rounded-full relative transition-colors flex-shrink-0 ${form.isKids ? 'bg-yellow-400' : 'bg-dark-border'}`}>
            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${form.isKids ? 'translate-x-5' : 'translate-x-1'}`} />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold">{form.isKids ? '🌟 Kids Mode ON' : 'Kids Mode OFF'}</p>
            <p className="text-xs opacity-60">
              {form.isKids ? 'Safe content only, parental PIN to exit' : 'All content available'}
            </p>
          </div>
        </button>
      </div>

      {/* PIN for adult profiles */}
      {!form.isKids && (
        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1.5">PIN Protection (optional)</label>
          <input
            type="password"
            maxLength={4}
            value={form.pin || ''}
            onChange={e => setForm(f => ({ ...f, pin: e.target.value }))}
            placeholder="4-digit PIN (optional)"
            className="input w-full"
          />
          <p className="text-[10px] text-slate-500 mt-1">Leave empty if you don't want PIN protection</p>
        </div>
      )}

      {/* Preview */}
      <div className="p-3 rounded-xl bg-dark-surface border border-dark-border">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-2">Preview</p>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-2xl"
            style={{ background: (form.color || '#14b8a6') + '25' }}>
            {form.avatar}
          </div>
          <div>
            <p className="text-sm font-bold text-white">{form.name || 'Untitled'}</p>
            <div className="flex gap-1 mt-0.5">
              {form.isKids && <span className="text-[10px] bg-yellow-400/20 text-yellow-300 px-1.5 py-0.5 rounded-full font-bold">KIDS</span>}
              {!form.isKids && form.pin && <span className="text-[10px] bg-amber-400/20 text-amber-300 px-1.5 py-0.5 rounded-full font-bold">🔒 PIN</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Buttons */}
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="btn-secondary flex-1 py-2.5">Cancel</button>
        <button type="button"
          onClick={() => onSave(form)}
          disabled={loading || !form.name.trim()}
          className="btn-primary flex-1 py-2.5 disabled:opacity-60">
          {loading ? <div className="w-4 h-4 border-2 border-dark/30 border-t-dark rounded-full animate-spin mx-auto" /> : 'Save Profile'}
        </button>
      </div>
    </div>
  )
}

export default function Profile() {
  const navigate = useNavigate()
  const { user, setUser, logout } = useAuthStore()
  const { profiles, activeProfile, fetch: fetchProfiles, create, update, remove, setActive } = useProfileStore()

  const [tab, setTab] = useState<'profiles'|'account'>('profiles')
  const [editTarget, setEditTarget] = useState<any>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [formLoading, setFormLoading] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  // Account settings
  const [username, setUsername] = useState(user?.username || '')
  const [email, setEmail] = useState(user?.email || '')
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' })
  const [acctMsg, setAcctMsg] = useState('')
  const [acctErr, setAcctErr] = useState('')
  const [acctLoad, setAcctLoad] = useState(false)

  useEffect(() => { if (user) fetchProfiles() }, [user?._id])

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-400 mb-4">Sign in to manage your profile</p>
          <button onClick={() => navigate('/login')} className="btn-primary px-6 py-2.5">Sign In</button>
        </div>
      </div>
    )
  }

  const handleCreateSave = async (form: FormState) => {
    if (!form.name.trim()) return
    setFormLoading(true)
    try {
      await create(form)
      setShowCreate(false)
      await fetchProfiles()
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Failed to create profile')
    } finally { setFormLoading(false) }
  }

  const handleEditSave = async (form: FormState) => {
    if (!form.name.trim() || !editTarget) return
    setFormLoading(true)
    try {
      await update(editTarget._id, form)
      setEditTarget(null)
      await fetchProfiles()
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Failed to update profile')
    } finally { setFormLoading(false) }
  }

  const handleDelete = async (id: string) => {
    try {
      await remove(id)
      setDeleteConfirm(null)
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Failed to delete profile')
    }
  }

  const saveAccount = async () => {
    setAcctLoad(true); setAcctMsg(''); setAcctErr('')
    try {
      const { data } = await api.put('/users/profile', { username: username.trim(), email: email.trim() })
      setUser({ ...user, ...data })
      setAcctMsg('Account updated!')
    } catch (e: any) {
      setAcctErr(e?.response?.data?.message || 'Update failed')
    } finally { setAcctLoad(false) }
  }

  const changePassword = async () => {
    if (pwForm.next !== pwForm.confirm) return setAcctErr('Passwords do not match')
    if (pwForm.next.length < 8) return setAcctErr('Password must be at least 8 characters')
    setAcctLoad(true); setAcctMsg(''); setAcctErr('')
    try {
      await api.put('/users/password', { currentPassword: pwForm.current, newPassword: pwForm.next })
      setPwForm({ current: '', next: '', confirm: '' })
      setAcctMsg('Password changed!')
    } catch (e: any) {
      setAcctErr(e?.response?.data?.message || 'Failed to change password')
    } finally { setAcctLoad(false) }
  }

  return (
    <div className="min-h-screen pt-20 px-4 sm:px-6 max-w-3xl mx-auto pb-16">

      {/* Page header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-14 h-14 rounded-2xl bg-brand/20 flex items-center justify-center text-brand font-black text-2xl flex-shrink-0">
          {(activeProfile?.avatar || user.username?.[0] || 'U').slice(0,2)}
        </div>
        <div>
          <h1 className="text-xl font-black text-white" style={{ fontFamily:'Syne, sans-serif' }}>
            {activeProfile?.name || user.username}
          </h1>
          <p className="text-slate-500 text-sm">{user.email}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl mb-6" style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.06)' }}>
        {(['profiles','account'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold capitalize transition-all ${
              tab===t ? 'bg-dark-card text-white shadow' : 'text-slate-400 hover:text-white'
            }`}>
            {t === 'profiles' ? '👤 Profiles' : '⚙️ Account'}
          </button>
        ))}
      </div>

      {/* Profiles tab */}
      {tab === 'profiles' && (
        <div>
          <div className="space-y-3 mb-4">
            {profiles.map(p => (
              <ProfileCard key={p._id} profile={p}
                isActive={activeProfile?._id === p._id}
                onSelect={() => setActive(p)}
                onEdit={() => { setEditTarget(p); setShowCreate(false) }}
                onDelete={() => setDeleteConfirm(p._id)}
              />
            ))}
          </div>

          {profiles.length < 5 && !showCreate && !editTarget && (
            <button onClick={() => { setShowCreate(true); setEditTarget(null) }}
              className="w-full py-3 rounded-2xl border-2 border-dashed border-dark-border text-slate-500 hover:border-brand/50 hover:text-brand text-sm font-semibold flex items-center justify-center gap-2 transition-all">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14"/>
              </svg>
              Add Profile ({profiles.length}/5)
            </button>
          )}

          {showCreate && (
            <div className="card p-4 mt-3">
              <h3 className="text-base font-bold text-white mb-4" style={{ fontFamily:'Syne, sans-serif' }}>New Profile</h3>
              <ProfileForm
                initial={{ name: '', avatar: '🎬', color: '#14b8a6', isKids: false, pin: '' }}
                onSave={handleCreateSave}
                onCancel={() => setShowCreate(false)}
                loading={formLoading}
              />
            </div>
          )}

          {editTarget && (
            <div className="card p-4 mt-3">
              <h3 className="text-base font-bold text-white mb-4" style={{ fontFamily:'Syne, sans-serif' }}>
                Edit: {editTarget.name}
              </h3>
              <ProfileForm
                initial={{
                  name: editTarget.name,
                  avatar: editTarget.avatar || '🎬',
                  color: editTarget.color || '#14b8a6',
                  isKids: !!editTarget.isKids,
                  pin: editTarget.pin || ''
                }}
                onSave={handleEditSave}
                onCancel={() => setEditTarget(null)}
                loading={formLoading}
              />
            </div>
          )}

          {deleteConfirm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
              <div className="card p-5 max-w-sm w-full">
                <p className="text-white font-bold mb-1">Delete this profile?</p>
                <p className="text-slate-500 text-sm mb-4">All watch history for this profile will be lost.</p>
                <div className="flex gap-2">
                  <button onClick={() => setDeleteConfirm(null)} className="btn-secondary flex-1 py-2">Cancel</button>
                  <button onClick={() => handleDelete(deleteConfirm)} className="flex-1 py-2 bg-red-500/20 text-red-400 rounded-xl font-semibold hover:bg-red-500/30 border border-red-500/30 transition-all">Delete</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Account tab */}
      {tab === 'account' && (
        <div className="space-y-4">
          <div className="card p-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-4">Account Info</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-500 block mb-1">Username</label>
                <input value={username} onChange={e => setUsername(e.target.value)} className="input w-full" placeholder="Username"/>
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Email</label>
                <input value={email} onChange={e => setEmail(e.target.value)} type="email" className="input w-full" placeholder="Email"/>
              </div>
              {acctMsg && <p className="text-green-400 text-sm">{acctMsg}</p>}
              {acctErr && <p className="text-red-400 text-sm">{acctErr}</p>}
              <button onClick={saveAccount} disabled={acctLoad} className="btn-primary w-full py-2.5 disabled:opacity-60">
                {acctLoad ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>

          <div className="card p-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-4">Change Password</h3>
            <div className="space-y-3">
              <input value={pwForm.current} onChange={e => setPwForm(f=>({...f,current:e.target.value}))}
                type="password" placeholder="Current password" className="input w-full"/>
              <input value={pwForm.next} onChange={e => setPwForm(f=>({...f,next:e.target.value}))}
                type="password" placeholder="New password (min 8 chars)" className="input w-full"/>
              <input value={pwForm.confirm} onChange={e => setPwForm(f=>({...f,confirm:e.target.value}))}
                type="password" placeholder="Confirm new password" className="input w-full"/>
              <button onClick={changePassword} disabled={acctLoad || !pwForm.current || !pwForm.next}
                className="btn-primary w-full py-2.5 disabled:opacity-60">
                {acctLoad ? 'Changing…' : 'Change Password'}
              </button>
            </div>
          </div>

          <div className="card p-4 border-red-500/20">
            <h3 className="text-sm font-bold uppercase tracking-wider text-red-400/70 mb-3">Danger Zone</h3>
            <button onClick={() => { logout(); navigate('/') }}
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-red-400 border border-red-500/30 hover:bg-red-500/10 transition-all">
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}