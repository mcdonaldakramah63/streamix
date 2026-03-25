// frontend/src/components/ProfileSelector.tsx — NEW FILE
import { useState, useEffect } from 'react'
import { useProfileStore, Profile } from '../stores/profileStore'
import { useAuthStore } from '../context/authStore'

const AVATAR_OPTIONS = ['🎬','📺','🎌','🎭','🚀','👻','💕','⚔️','🧙','🔍','🎵','🌍','👨‍👩‍👧','🎨','😂']
const COLOR_OPTIONS  = ['#14b8a6','#8b5cf6','#f59e0b','#ef4444','#3b82f6','#10b981','#f97316','#ec4899']

interface Props {
  onSelect: (profile: Profile) => void
}

export default function ProfileSelector({ onSelect }: Props) {
  const { user }    = useAuthStore()
  const { profiles, fetch, create, loading } = useProfileStore()

  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: '', avatar: '🎬', color: '#14b8a6', isKids: false })
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (user) fetch() }, [user])

  const handleCreate = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const p = await create(form)
      onSelect(p)
    } finally { setSaving(false) }
  }

  if (loading && !profiles.length) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-dark">
        <div className="w-10 h-10 border-2 border-dark-border border-t-brand rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-dark"
      style={{ background: 'radial-gradient(ellipse at center, rgba(20,184,166,0.05) 0%, #07080c 70%)' }}>

      <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2" style={{ fontFamily:'Syne, sans-serif' }}>
        Who's Watching?
      </h1>
      <p className="text-slate-500 text-sm mb-10">Select a profile to personalize your experience</p>

      {/* Profile grid */}
      <div className="flex flex-wrap gap-5 justify-center mb-8 max-w-xl px-4">
        {profiles.map(p => (
          <button key={p._id} onClick={() => onSelect(p)}
            className="flex flex-col items-center gap-2.5 group">
            <div
              className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl flex items-center justify-center text-4xl sm:text-5xl
                border-2 border-transparent group-hover:border-white transition-all duration-200 group-hover:scale-105"
              style={{ background: p.color + '25', borderColor: 'transparent' }}>
              {p.avatar || '🎬'}
              {p.isKids && (
                <div className="absolute -top-1 -right-1 bg-yellow-400 text-dark text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                  KIDS
                </div>
              )}
            </div>
            <span className="text-slate-300 text-sm group-hover:text-white transition-colors font-medium">
              {p.name}
            </span>
          </button>
        ))}

        {/* Add profile button */}
        {profiles.length < 5 && (
          <button onClick={() => setShowCreate(true)}
            className="flex flex-col items-center gap-2.5 group">
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl flex items-center justify-center
              border-2 border-dashed border-dark-border group-hover:border-brand transition-all duration-200 group-hover:scale-105 bg-dark-card">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                className="text-slate-600 group-hover:text-brand transition-colors">
                <path d="M12 5v14M5 12h14"/>
              </svg>
            </div>
            <span className="text-slate-600 text-sm group-hover:text-slate-300 transition-colors">Add Profile</span>
          </button>
        )}
      </div>

      {/* Create profile modal */}
      {showCreate && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="glass rounded-3xl p-6 w-full max-w-sm shadow-deep animate-scale-in">
            <h2 className="text-lg font-bold text-white mb-5" style={{ fontFamily:'Syne, sans-serif' }}>
              New Profile
            </h2>

            {/* Name */}
            <input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Profile name"
              className="input mb-4"
              maxLength={30}
              autoFocus
            />

            {/* Avatar picker */}
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Avatar</p>
            <div className="flex flex-wrap gap-2 mb-4">
              {AVATAR_OPTIONS.map(a => (
                <button key={a} onClick={() => setForm(f => ({ ...f, avatar: a }))}
                  className={`w-10 h-10 rounded-xl text-2xl flex items-center justify-center transition-all ${
                    form.avatar === a ? 'bg-brand/20 ring-2 ring-brand scale-110' : 'bg-dark-card hover:bg-dark-hover'
                  }`}>
                  {a}
                </button>
              ))}
            </div>

            {/* Color picker */}
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Color</p>
            <div className="flex gap-2 mb-4">
              {COLOR_OPTIONS.map(c => (
                <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))}
                  className={`w-8 h-8 rounded-full transition-all ${form.color === c ? 'ring-2 ring-white scale-110' : ''}`}
                  style={{ background: c }} />
              ))}
            </div>

            {/* Kids toggle */}
            <label className="flex items-center gap-3 mb-5 cursor-pointer">
              <div
                onClick={() => setForm(f => ({ ...f, isKids: !f.isKids }))}
                className={`w-11 h-6 rounded-full relative transition-colors ${form.isKids ? 'bg-brand' : 'bg-dark-border'}`}>
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${form.isKids ? 'translate-x-6' : 'translate-x-1'}`} />
              </div>
              <span className="text-sm text-slate-300">Kids Mode <span className="text-slate-600 text-xs">(filters adult content)</span></span>
            </label>

            <div className="flex gap-2">
              <button onClick={() => setShowCreate(false)} className="btn-secondary flex-1 py-2.5">Cancel</button>
              <button onClick={handleCreate} disabled={saving || !form.name.trim()}
                className="btn-primary flex-1 py-2.5 disabled:opacity-60">
                {saving ? <div className="w-4 h-4 border-2 border-dark/30 border-t-dark rounded-full animate-spin mx-auto" /> : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
