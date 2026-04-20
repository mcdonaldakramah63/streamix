// frontend/src/components/ProfileSelector.tsx — FULL REPLACEMENT
// Uses the existing useProfileStore from ../stores/profileStore
import { useState, useEffect } from 'react'
import { useProfileStore, Profile } from '../stores/profileStore'
import { useAuthStore } from '../context/authStore'

const AVATARS = ['🎬','🎭','🚀','🎮','🎵','⚡','🌊','🔥','🦁','🐼','🦊','🐶','🌸','⭐','🍕','🎸','🧙','👻']
const COLORS  = [
  '#14b8a6','#8b5cf6','#f43f5e','#f59e0b',
  '#3b82f6','#10b981','#f97316','#ec4899',
]

type View = 'select' | 'manage' | 'create' | 'edit'

interface FormState {
  name: string
  avatar: string
  color: string
  isKids: boolean
}

interface Props {
  onSelect: (profile: Profile) => void
}

function Avatar({
  avatar, color, size = 'lg', isKids = false,
}: { avatar: string; color: string; size?: 'sm' | 'md' | 'lg'; isKids?: boolean }) {
  const s = { sm: 'w-10 h-10 text-xl rounded-xl', md: 'w-14 h-14 text-3xl rounded-2xl', lg: 'w-20 h-20 sm:w-24 sm:h-24 text-4xl sm:text-5xl rounded-2xl' }[size]
  return (
    <div className={`relative flex items-center justify-center flex-shrink-0 ${s}`}
      style={{ background: color + '22', border: `1.5px solid ${color}44` }}>
      <span>{avatar}</span>
      {isKids && (
        <span
          className="absolute -top-1.5 -right-1.5 text-[8px] font-black px-1.5 py-0.5 rounded-full"
          style={{ background: '#a855f7', color: 'white', lineHeight: 1.4 }}
        >KIDS</span>
      )}
    </div>
  )
}

function Toggle({ value, onChange }: { value: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className="relative flex-shrink-0 rounded-full transition-colors duration-200"
      style={{ width: 44, height: 24, background: value ? '#14b8a6' : 'rgba(255,255,255,0.1)' }}
    >
      <span
        className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-transform duration-200"
        style={{ transform: `translateX(${value ? 20 : 2}px)` }}
      />
    </button>
  )
}

export default function ProfileSelector({ onSelect }: Props) {
  const { user } = useAuthStore()
  const { profiles, fetch, create, update, remove, loading } = useProfileStore()

  const [view, setView]           = useState<View>('select')
  const [editTarget, setEditTarget] = useState<Profile | null>(null)
  const [form, setForm]           = useState<FormState>({ name: '', avatar: '🎬', color: '#14b8a6', isKids: false })
  const [saving, setSaving]       = useState(false)
  const [deleteId, setDeleteId]   = useState<string | null>(null)

  useEffect(() => { if (user) fetch() }, [user?._id])

  const openCreate = () => {
    setForm({ name: '', avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)], color: COLORS[0], isKids: false })
    setEditTarget(null)
    setView('create')
  }

  const openEdit = (p: Profile) => {
    setForm({ name: p.name, avatar: p.avatar || '🎬', color: p.color || '#14b8a6', isKids: p.isKids })
    setEditTarget(p)
    setView('edit')
  }

  const saveForm = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      if (editTarget) {
        await update(editTarget._id, { name: form.name.trim(), avatar: form.avatar, color: form.color, isKids: form.isKids })
        setView('manage')
      } else {
        const p = await create({ name: form.name.trim(), avatar: form.avatar, color: form.color, isKids: form.isKids })
        onSelect(p)
      }
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async (id: string) => {
    setDeleteId(id)
    await remove(id)
    setDeleteId(null)
  }

  // ── SELECT VIEW ────────────────────────────────────────────────────────────
  if (view === 'select') {
    return (
      <div
        className="fixed inset-0 z-[200] flex flex-col items-center justify-center px-6"
        style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(20,184,166,0.07) 0%, #07080c 65%)' }}
      >
        {/* Brand */}
        <p className="text-[11px] font-black tracking-widest text-brand/40 uppercase mb-10">STREAMIX</p>

        <h1
          className="text-white text-3xl sm:text-4xl font-bold text-center mb-2"
          style={{ fontFamily: 'Syne, sans-serif', letterSpacing: '-0.03em' }}
        >
          Who's watching?
        </h1>
        <p className="text-slate-500 text-sm mb-10 text-center">Select your profile to continue</p>

        {/* Profile grid */}
        {loading && !profiles.length ? (
          <div className="flex gap-5 mb-10">
            {[0,1].map(i => (
              <div key={i} className="flex flex-col items-center gap-3">
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-dark-card animate-pulse" />
                <div className="w-16 h-3 rounded bg-dark-card animate-pulse" />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap justify-center gap-5 mb-10 max-w-xl">
            {profiles.map(p => (
              <button
                key={p._id}
                onClick={() => onSelect(p)}
                className="group flex flex-col items-center gap-3 cursor-pointer"
              >
                <div
                  className="relative transition-all duration-200 group-hover:scale-110"
                  style={{
                    filter: 'drop-shadow(0 0 0px transparent)',
                  }}
                  onMouseEnter={e => {
                    const el = e.currentTarget as HTMLElement
                    el.style.filter = `drop-shadow(0 0 18px ${p.color || '#14b8a6'}55)`
                  }}
                  onMouseLeave={e => {
                    const el = e.currentTarget as HTMLElement
                    el.style.filter = 'drop-shadow(0 0 0px transparent)'
                  }}
                >
                  <Avatar avatar={p.avatar || '🎬'} color={p.color || '#14b8a6'} size="lg" isKids={p.isKids} />
                  {/* Ring on hover */}
                  <div
                    className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                    style={{ boxShadow: `0 0 0 2px ${p.color || '#14b8a6'}66` }}
                  />
                </div>
                <div className="text-center">
                  <p className="text-slate-300 text-sm font-semibold group-hover:text-white transition-colors">
                    {p.name}
                  </p>
                </div>
              </button>
            ))}

            {/* Add profile */}
            {profiles.length < 5 && (
              <button
                onClick={openCreate}
                className="group flex flex-col items-center gap-3 cursor-pointer"
              >
                <div
                  className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl flex items-center justify-center text-2xl text-slate-600 group-hover:text-brand transition-all duration-200 group-hover:scale-110"
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '2px dashed rgba(255,255,255,0.12)',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(20,184,166,0.4)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.12)' }}
                >
                  +
                </div>
                <p className="text-slate-600 text-sm group-hover:text-slate-300 transition-colors">Add Profile</p>
              </button>
            )}
          </div>
        )}

        {/* Manage link */}
        <button
          onClick={() => setView('manage')}
          className="text-slate-600 text-sm hover:text-slate-300 transition-colors flex items-center gap-1.5"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
          </svg>
          Manage Profiles
        </button>
      </div>
    )
  }

  // ── MANAGE VIEW ────────────────────────────────────────────────────────────
  if (view === 'manage') {
    return (
      <div
        className="fixed inset-0 z-[200] flex flex-col items-center justify-center px-5"
        style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(20,184,166,0.05) 0%, #07080c 65%)' }}
      >
        <div className="w-full max-w-sm" style={{ animation: 'slideUp 0.25s ease both' }}>
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <button
              onClick={() => setView('select')}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-white transition-colors"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="m15 18-6-6 6-6"/>
              </svg>
            </button>
            <h2 className="text-white text-lg font-bold" style={{ fontFamily: 'Syne, sans-serif' }}>
              Manage Profiles
            </h2>
          </div>

          {/* Profile list */}
          <div className="space-y-2.5 mb-5">
            {profiles.map(p => (
              <div
                key={p._id}
                className="flex items-center gap-3 p-3.5 rounded-2xl"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.07)',
                }}
              >
                <Avatar avatar={p.avatar || '🎬'} color={p.color || '#14b8a6'} size="sm" isKids={p.isKids} />
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-semibold truncate">{p.name}</p>
                  {p.isKids && <p className="text-purple-400 text-[10px] font-bold uppercase tracking-wider">Kids</p>}
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => openEdit(p)}
                    className="text-xs text-slate-400 hover:text-white transition-colors px-3 py-1.5 rounded-xl"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}
                  >
                    Edit
                  </button>
                  {profiles.length > 1 && (
                    <button
                      onClick={() => confirmDelete(p._id)}
                      disabled={deleteId === p._id}
                      className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-600 hover:text-red-400 transition-colors disabled:opacity-40"
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
                    >
                      {deleteId === p._id
                        ? <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                        : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
                      }
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {profiles.length < 5 && (
            <button
              onClick={openCreate}
              className="w-full py-3 rounded-2xl text-sm font-semibold text-brand transition-all hover:opacity-80"
              style={{ background: 'rgba(20,184,166,0.08)', border: '1px solid rgba(20,184,166,0.2)' }}
            >
              + Add New Profile
            </button>
          )}
        </div>

        <style>{`@keyframes slideUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }`}</style>
      </div>
    )
  }

  // ── CREATE / EDIT FORM ────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center px-5"
      style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(20,184,166,0.05) 0%, #07080c 65%)' }}
    >
      <div className="w-full max-w-sm" style={{ animation: 'slideUp 0.25s ease both' }}>
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => setView(editTarget ? 'manage' : 'select')}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-white transition-colors"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="m15 18-6-6 6-6"/>
            </svg>
          </button>
          <h2 className="text-white text-lg font-bold" style={{ fontFamily: 'Syne, sans-serif' }}>
            {editTarget ? 'Edit Profile' : 'New Profile'}
          </h2>
        </div>

        {/* Avatar preview */}
        <div className="flex justify-center mb-5">
          <div
            className="w-24 h-24 rounded-3xl flex items-center justify-center text-5xl"
            style={{ background: form.color + '22', border: `2px solid ${form.color}55`, boxShadow: `0 0 30px ${form.color}22` }}
          >
            {form.avatar}
          </div>
        </div>

        {/* Form card */}
        <div
          className="rounded-3xl p-5 space-y-4"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          {/* Name */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Name</label>
            <input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && saveForm()}
              placeholder="Enter a name..."
              maxLength={20}
              autoFocus
              className="w-full rounded-xl px-4 py-3 text-white text-sm outline-none transition-colors placeholder-slate-600"
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.09)',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = 'rgba(20,184,166,0.4)' }}
              onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)' }}
            />
          </div>

          {/* Avatar picker */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Avatar</label>
            <div className="grid grid-cols-9 gap-1">
              {AVATARS.map(a => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, avatar: a }))}
                  className="h-9 rounded-xl flex items-center justify-center text-lg transition-all duration-150"
                  style={{
                    background: form.avatar === a ? 'rgba(20,184,166,0.2)' : 'rgba(255,255,255,0.04)',
                    border: `1.5px solid ${form.avatar === a ? 'rgba(20,184,166,0.5)' : 'rgba(255,255,255,0.06)'}`,
                    transform: form.avatar === a ? 'scale(1.12)' : 'scale(1)',
                  }}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>

          {/* Color picker */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Color</label>
            <div className="flex gap-2 flex-wrap">
              {COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, color: c }))}
                  className="w-8 h-8 rounded-full transition-all duration-150"
                  style={{
                    background: c,
                    transform: form.color === c ? 'scale(1.2)' : 'scale(1)',
                    boxShadow: form.color === c ? `0 0 0 2px #07080c, 0 0 0 4px ${c}` : 'none',
                  }}
                />
              ))}
            </div>
          </div>

          {/* Kids toggle */}
          <div className="flex items-center justify-between py-1">
            <div>
              <p className="text-white text-sm font-semibold">Kids Profile</p>
              <p className="text-slate-500 text-xs mt-0.5">Filters adult content</p>
            </div>
            <Toggle value={form.isKids} onChange={() => setForm(f => ({ ...f, isKids: !f.isKids }))} />
          </div>

          {/* Save button */}
          <button
            onClick={saveForm}
            disabled={!form.name.trim() || saving}
            className="w-full py-3 rounded-2xl text-sm font-bold transition-all active:scale-98 disabled:opacity-40"
            style={{
              background: 'linear-gradient(135deg, #14b8a6, #0891b2)',
              color: '#07080c',
            }}
          >
            {saving
              ? <div className="w-4 h-4 border-2 border-[#07080c]/30 border-t-[#07080c] rounded-full animate-spin mx-auto" />
              : editTarget ? 'Save Changes' : 'Create Profile'
            }
          </button>
        </div>
      </div>

      <style>{`@keyframes slideUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }`}</style>
    </div>
  )
}
