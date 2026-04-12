// frontend/src/components/ProfileSelector.tsx — FULL REPLACEMENT
// Design: Minimal cinematic — dark, focused, premium feel
import { useState, useEffect } from 'react'
import { useProfileStore, Profile } from '../stores/profileStore'
import { useAuthStore } from '../context/authStore'

const AVATARS = ['🎬','📺','🎌','🎭','🚀','👻','💕','⚔️','🧙','🔍','🎵','🌍','🏆','🎨','😂']
const COLORS  = [
  { hex: '#14b8a6', label: 'Teal'    },
  { hex: '#8b5cf6', label: 'Purple'  },
  { hex: '#f59e0b', label: 'Amber'   },
  { hex: '#ef4444', label: 'Red'     },
  { hex: '#3b82f6', label: 'Blue'    },
  { hex: '#10b981', label: 'Green'   },
  { hex: '#f97316', label: 'Orange'  },
  { hex: '#ec4899', label: 'Pink'    },
]

interface Props { onSelect: (profile: Profile) => void }

// ── Profile Avatar Card ───────────────────────────────────────────────────────
function ProfileCard({ profile, onSelect }: { profile: Profile; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className="group flex flex-col items-center gap-3 transition-all duration-200 active:scale-95"
    >
      {/* Avatar */}
      <div
        className="relative flex items-center justify-center transition-all duration-200 group-hover:scale-105"
        style={{
          width:        88,
          height:       88,
          borderRadius: 22,
          background:   profile.color + '18',
          border:       `1.5px solid ${profile.color}30`,
          boxShadow:    `0 0 0 0 ${profile.color}40`,
          fontSize:     36,
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLElement).style.boxShadow = `0 0 0 3px ${profile.color}25, 0 8px 24px ${profile.color}20`
          ;(e.currentTarget as HTMLElement).style.borderColor = profile.color + '60'
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLElement).style.boxShadow = `0 0 0 0 ${profile.color}40`
          ;(e.currentTarget as HTMLElement).style.borderColor = profile.color + '30'
        }}
      >
        {profile.avatar || '🎬'}

        {/* Kids badge */}
        {profile.isKids && (
          <div
            className="absolute -top-1.5 -right-1.5 text-[9px] font-black px-1.5 py-0.5 rounded-full"
            style={{ background: '#FFD93D', color: '#0a0c14', letterSpacing: '0.04em' }}
          >
            KIDS
          </div>
        )}
      </div>

      {/* Name */}
      <div className="text-center">
        <p className="text-sm font-semibold text-white/80 group-hover:text-white transition-colors leading-none">
          {profile.name}
        </p>
        {profile.isKids && (
          <p className="text-[10px] text-white/25 mt-1">Kids Mode</p>
        )}
      </div>
    </button>
  )
}

// ── Create Profile Modal ──────────────────────────────────────────────────────
function CreateProfileModal({
  onClose,
  onCreate,
}: {
  onClose: () => void
  onCreate: (data: Partial<Profile>) => Promise<void>
}) {
  const [form,   setForm]   = useState({ name: '', avatar: '🎬', color: '#14b8a6', isKids: false })
  const [saving, setSaving] = useState(false)
  const [step,   setStep]   = useState<'info' | 'avatar' | 'color'>('info')

  const handleCreate = async () => {
    if (!form.name.trim() || saving) return
    setSaving(true)
    try { await onCreate(form) }
    finally { setSaving(false) }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-[220]"
        style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(12px)' }}
        onClick={onClose}
      />

      <div className="fixed inset-0 z-[221] flex items-center justify-center p-4 pointer-events-none">
        <div
          className="pointer-events-auto w-full max-w-sm overflow-hidden"
          style={{
            borderRadius: 28,
            background:   'linear-gradient(145deg, #14161f 0%, #0e1018 100%)',
            border:       '1px solid rgba(255,255,255,0.07)',
            boxShadow:    '0 40px 80px rgba(0,0,0,0.5)',
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-6 pb-4">
            <h3 className="text-white font-bold text-lg" style={{ fontFamily: 'Syne, sans-serif' }}>
              New Profile
            </h3>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-xl transition-colors"
              style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M18 6 6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>

          {/* Preview */}
          <div className="flex flex-col items-center pb-5">
            <div
              className="flex items-center justify-center mb-2"
              style={{
                width: 72, height: 72, borderRadius: 18, fontSize: 32,
                background: form.color + '18', border: `1.5px solid ${form.color}40`,
              }}
            >
              {form.avatar}
            </div>
            <p className="text-white/50 text-sm font-medium">
              {form.name || 'Profile Name'}
            </p>
          </div>

          {/* Name input */}
          <div className="px-6 mb-4">
            <label className="block text-xs font-bold uppercase tracking-widest text-white/30 mb-2">Name</label>
            <input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Enter profile name…"
              maxLength={30}
              autoFocus
              className="w-full px-4 py-3 rounded-xl text-sm text-white placeholder-white/20 outline-none transition-all"
              style={{
                background:  'rgba(255,255,255,0.05)',
                border:      '1px solid rgba(255,255,255,0.08)',
                fontFamily:  'DM Sans, sans-serif',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = form.color + '80' }}
              onBlur={e  => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}
            />
          </div>

          {/* Avatar picker */}
          <div className="px-6 mb-4">
            <label className="block text-xs font-bold uppercase tracking-widest text-white/30 mb-2.5">Avatar</label>
            <div className="grid grid-cols-5 gap-2">
              {AVATARS.map(a => (
                <button
                  key={a}
                  onClick={() => setForm(f => ({ ...f, avatar: a }))}
                  className="flex items-center justify-center text-2xl rounded-xl transition-all active:scale-90"
                  style={{
                    height:     46,
                    background: form.avatar === a ? form.color + '20' : 'rgba(255,255,255,0.04)',
                    border:     form.avatar === a ? `1.5px solid ${form.color}60` : '1.5px solid rgba(255,255,255,0.06)',
                    transform:  form.avatar === a ? 'scale(1.1)' : 'scale(1)',
                  }}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>

          {/* Color picker */}
          <div className="px-6 mb-5">
            <label className="block text-xs font-bold uppercase tracking-widest text-white/30 mb-2.5">Color</label>
            <div className="flex gap-2.5">
              {COLORS.map(c => (
                <button
                  key={c.hex}
                  onClick={() => setForm(f => ({ ...f, color: c.hex }))}
                  className="transition-all active:scale-90"
                  title={c.label}
                  style={{
                    width:     28,
                    height:    28,
                    borderRadius: '50%',
                    background: c.hex,
                    boxShadow:  form.color === c.hex ? `0 0 0 2px rgba(10,12,20,1), 0 0 0 4px ${c.hex}` : 'none',
                    transform:  form.color === c.hex ? 'scale(1.15)' : 'scale(1)',
                  }}
                />
              ))}
            </div>
          </div>

          {/* Kids toggle */}
          <div className="px-6 mb-5">
            <button
              onClick={() => setForm(f => ({ ...f, isKids: !f.isKids }))}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all"
              style={{
                background: form.isKids ? 'rgba(255,217,61,0.08)' : 'rgba(255,255,255,0.03)',
                border:     form.isKids ? '1px solid rgba(255,217,61,0.25)' : '1px solid rgba(255,255,255,0.07)',
              }}
            >
              <div className="text-left">
                <p className="text-sm font-semibold text-white/80">Kids Mode</p>
                <p className="text-xs text-white/30 mt-0.5">Filters adult content</p>
              </div>
              {/* Toggle */}
              <div
                className="relative flex-shrink-0 transition-colors duration-200"
                style={{
                  width: 42, height: 24, borderRadius: 12,
                  background: form.isKids ? '#FFD93D' : 'rgba(255,255,255,0.12)',
                }}
              >
                <div
                  className="absolute top-1 transition-transform duration-200"
                  style={{
                    left:         4,
                    width:        16,
                    height:       16,
                    borderRadius: '50%',
                    background:   form.isKids ? '#0a0c14' : 'rgba(255,255,255,0.7)',
                    transform:    form.isKids ? 'translateX(18px)' : 'translateX(0)',
                  }}
                />
              </div>
            </button>
          </div>

          {/* Actions */}
          <div className="px-6 pb-6 flex gap-2.5">
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-xl text-sm font-semibold transition-all active:scale-95"
              style={{
                background: 'rgba(255,255,255,0.05)',
                border:     '1px solid rgba(255,255,255,0.07)',
                color:      'rgba(255,255,255,0.5)',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!form.name.trim() || saving}
              className="flex-1 py-3 rounded-xl text-sm font-bold transition-all active:scale-95 disabled:opacity-40"
              style={{ background: form.color, color: '#0a0c14' }}
            >
              {saving ? (
                <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin mx-auto" />
              ) : 'Create Profile'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

// ── Main ProfileSelector ──────────────────────────────────────────────────────
export default function ProfileSelector({ onSelect }: Props) {
  const { user }                                     = useAuthStore()
  const { profiles, fetch, create, loading }         = useProfileStore()
  const [showCreate, setShowCreate]                  = useState(false)

  useEffect(() => { if (user) fetch() }, [user])

  const handleCreate = async (data: Partial<Profile>) => {
    const p = await create(data)
    setShowCreate(false)
    onSelect(p)
  }

  // Full-page loading state
  if (loading && !profiles.length) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center"
        style={{ background: '#0a0c14' }}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-white/10 border-t-white/50 rounded-full animate-spin" />
          <p className="text-white/30 text-sm">Loading profiles…</p>
        </div>
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center"
      style={{ background: '#0a0c14' }}
    >
      {/* Ambient glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 80% 50% at 50% 30%, rgba(20,184,166,0.06) 0%, transparent 70%)',
        }}
      />

      <div className="relative z-10 flex flex-col items-center px-6">
        {/* Header */}
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/25 mb-4">
          STREAMIX
        </p>
        <h1
          className="text-3xl sm:text-4xl font-black text-white mb-2 text-center"
          style={{ fontFamily: 'Syne, sans-serif', letterSpacing: '-0.02em' }}
        >
          Who's watching?
        </h1>
        <p className="text-white/35 text-sm mb-12 text-center">
          Select a profile for a personalized experience
        </p>

        {/* Profile grid */}
        <div className="flex flex-wrap gap-6 sm:gap-8 justify-center max-w-lg mb-10">
          {profiles.map(p => (
            <ProfileCard key={p._id} profile={p} onSelect={() => onSelect(p)} />
          ))}

          {/* Add profile */}
          {profiles.length < 5 && (
            <button
              onClick={() => setShowCreate(true)}
              className="group flex flex-col items-center gap-3 transition-all duration-200 active:scale-95"
            >
              <div
                className="flex items-center justify-center transition-all duration-200 group-hover:scale-105"
                style={{
                  width:        88,
                  height:       88,
                  borderRadius: 22,
                  background:   'rgba(255,255,255,0.03)',
                  border:       '1.5px dashed rgba(255,255,255,0.1)',
                }}
                onMouseEnter={e => {
                  ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(20,184,166,0.4)'
                  ;(e.currentTarget as HTMLElement).style.background  = 'rgba(20,184,166,0.06)'
                }}
                onMouseLeave={e => {
                  ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.1)'
                  ;(e.currentTarget as HTMLElement).style.background  = 'rgba(255,255,255,0.03)'
                }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)"
                  strokeWidth="1.5" strokeLinecap="round"
                  className="group-hover:stroke-[rgba(20,184,166,0.6)] transition-all">
                  <path d="M12 5v14M5 12h14"/>
                </svg>
              </div>
              <p className="text-sm font-medium text-white/25 group-hover:text-white/50 transition-colors">
                Add Profile
              </p>
            </button>
          )}
        </div>

        {/* Manage link */}
        {profiles.length > 0 && (
          <button className="text-xs text-white/20 hover:text-white/40 transition-colors tracking-widest uppercase font-bold">
            Manage Profiles
          </button>
        )}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <CreateProfileModal
          onClose={() => setShowCreate(false)}
          onCreate={handleCreate}
        />
      )}
    </div>
  )
}
