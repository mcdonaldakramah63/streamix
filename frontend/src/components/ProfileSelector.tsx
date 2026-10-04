// frontend/src/components/ProfileSelector.tsx — "Who's watching?" + profile management
import { useState } from 'react'
import { useProfileStore, Profile } from '../stores/profileStore'
import { errorMessage } from '../services/api'
import { logout } from '../services/session'
import Icon from './Icon'
import Logo from './Logo'
import ProfileAvatar from './avatar/ProfileAvatar'
import AvatarEditor, { AvatarDraft } from './avatar/AvatarEditor'
import { DEFAULT_CONFIG, randomConfig } from './avatar/AvatarArt'

export const AVATARS = ['🎬','🍿','🚀','🎮','🎧','⚡','🌊','🔥','🦁','🐼','🦊','🐶','🌸','⭐','🍕','🎸','🧙','👻']
export const COLORS  = ['#e50914','#ff3366','#f59e0b','#06b6d4','#8b5cf6','#10b981','#3b82f6','#ec4899']

type View = 'select' | 'manage' | 'form'

interface FormState { name: string; avatar: string; color: string; isKids: boolean; pin: string; removePin: boolean; look: AvatarDraft }

export function ProfileBadge({ p, size = 'lg' }: { p: Pick<Profile, 'avatar' | 'color' | 'isKids'> & Partial<Pick<Profile, 'avatarImage' | 'avatarConfig' | 'name'>>; size?: 'sm' | 'lg' }) {
  const cls = size === 'lg' ? 'w-24 h-24 sm:w-28 sm:h-28 rounded-3xl' : 'w-11 h-11 rounded-xl'
  return (
    <div className="relative flex-shrink-0">
      <ProfileAvatar p={p} className={cls} emojiSize={size === 'lg' ? 'text-5xl' : 'text-xl'} />
      {p.isKids && (
        <span className="absolute -top-1.5 -right-1.5 px-1.5 py-0.5 rounded-full bg-gold text-dark-void text-tech-pill uppercase">Kids</span>
      )}
    </div>
  )
}

function Toggle({ value, onChange, label }: { value: boolean; onChange: () => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={value} aria-label={label} onClick={onChange}
      className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${value ? 'bg-brand shadow-brand-sm' : 'bg-white/10'}`}>
      <span className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform"
        style={{ transform: `translateX(${value ? 22 : 2}px)` }} />
    </button>
  )
}

/** Create / edit form, shared with the Profile page */
export function ProfileForm({ editing, onDone, onCancel }: { editing: Profile | null; onDone: (p?: Profile) => void; onCancel: () => void }) {
  const { create, update, uploadAvatar } = useProfileStore()
  const [form, setForm] = useState<FormState>(() => editing
    ? { name: editing.name, avatar: editing.avatar || '🎬', color: editing.color || COLORS[0], isKids: editing.isKids, pin: '', removePin: false,
        look: {
          mode: editing.avatarImage ? 'photo' : editing.avatarConfig ? 'build' : 'emoji',
          emoji: editing.avatar || '🎬', config: editing.avatarConfig || DEFAULT_CONFIG, photo: editing.avatarImage || null,
        } }
    : (() => {
        const emoji = AVATARS[Math.floor(Math.random() * AVATARS.length)]
        return { name: '', avatar: emoji, color: COLORS[0], isKids: false, pin: '', removePin: false,
          look: { mode: 'emoji' as const, emoji, config: randomConfig(), photo: null } }
      })())
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  const save = async () => {
    if (!form.name.trim()) return
    if (!form.isKids && form.pin && !/^\d{4}$/.test(form.pin)) { setError('PIN must be exactly 4 digits'); return }
    setSaving(true); setError('')
    try {
      const pin = form.isKids ? undefined : form.removePin ? null : form.pin || undefined
      const { look } = form
      if (look.mode === 'photo' && !look.photo) { setError('Choose a photo, or pick an emoji or avatar instead'); setSaving(false); return }
      const body = {
        name: form.name.trim(), avatar: look.emoji, color: form.color, isKids: form.isKids, pin,
        avatarConfig: look.mode === 'build' ? look.config : null,
        clearImage: look.mode !== 'photo',
      }
      // Profile first, then the photo (it needs the profile id)
      const saved = editing ? (await update(editing._id, body), editing) : await create(body)
      if (look.mode === 'photo' && look.photo?.startsWith('data:')) await uploadAvatar(saved._id, look.photo)
      const fresh = useProfileStore.getState().profiles.find(p => p._id === saved._id) || saved
      if (editing) onDone()
      else onDone(fresh)
    } catch (e) {
      setError(errorMessage(e, 'Could not save profile'))
    } finally { setSaving(false) }
  }

  return (
    <div className="w-full">
      <div className="flex justify-center mb-5">
        <ProfileBadge p={{
          avatar: form.look.emoji, color: form.color, isKids: form.isKids, name: form.name,
          avatarConfig: form.look.mode === 'build' ? form.look.config : null,
          avatarImage: form.look.mode === 'photo' ? form.look.photo || '' : '',
        }} />
      </div>

      <div className="card p-5 space-y-5">
        <div>
          <label htmlFor="pf-name" className="block text-label-sm uppercase text-ink-muted mb-1.5">Name</label>
          <input id="pf-name" value={form.name} maxLength={30} autoFocus
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && save()}
            placeholder="Who is this?" className="input" />
        </div>

        <div>
          <p className="text-label-sm uppercase text-ink-muted mb-1.5">Picture</p>
          <AvatarEditor draft={form.look} emojis={AVATARS} onChange={look => setForm(f => ({ ...f, look }))} />
        </div>

        <div>
          <p className="text-label-sm uppercase text-ink-muted mb-1.5">Color</p>
          <div className="flex gap-2.5 flex-wrap">
            {COLORS.map(c => (
              <button key={c} type="button" onClick={() => setForm(f => ({ ...f, color: c }))} aria-label={`Color ${c}`}
                className="w-8 h-8 rounded-full transition-transform"
                style={{ background: c, transform: form.color === c ? 'scale(1.18)' : 'scale(1)', boxShadow: form.color === c ? `0 0 0 2px #0f131c, 0 0 0 4px ${c}` : 'none' }} />
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-white">Kids profile</p>
            <p className="text-xs text-ink-faint mt-0.5">Only family-friendly titles, no search</p>
          </div>
          <Toggle label="Kids profile" value={form.isKids} onChange={() => setForm(f => ({ ...f, isKids: !f.isKids }))} />
        </div>

        {!form.isKids && (
          <div>
            <label htmlFor="pf-pin" className="block text-label-sm uppercase text-ink-muted mb-1.5">
              Profile PIN {editing?.hasPin ? '(set — enter a new one to change)' : '(optional)'}
            </label>
            <input id="pf-pin" inputMode="numeric" autoComplete="off" maxLength={4} type="password"
              value={form.pin} disabled={form.removePin}
              onChange={e => setForm(f => ({ ...f, pin: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
              placeholder="4 digits" className="input tracking-[0.5em] disabled:opacity-40" />
            {editing?.hasPin && (
              <label className="flex items-center gap-2 mt-2 text-xs text-ink-muted cursor-pointer">
                <input type="checkbox" checked={form.removePin} className="accent-[#e50914]"
                  onChange={e => setForm(f => ({ ...f, removePin: e.target.checked, pin: '' }))} />
                Remove PIN
              </label>
            )}
            <p className="text-xs text-ink-faint mt-2">A PIN stops others (and kids profiles) from switching into this profile.</p>
          </div>
        )}

        {error && <p className="text-sm text-brand-soft font-semibold">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onCancel} className="btn-secondary flex-1 h-11">Cancel</button>
          <button type="button" onClick={save} disabled={saving || !form.name.trim()} className="btn-primary flex-1 h-11 disabled:opacity-50">
            {saving ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : editing ? 'Save changes' : 'Create profile'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ProfileSelector({ onSelect }: { onSelect: (p: Profile) => void }) {
  const { profiles, remove, loading } = useProfileStore()
  const [view,    setView]    = useState<View>('select')
  const [editing, setEditing] = useState<Profile | null>(null)
  const [confirm, setConfirm] = useState<Profile | null>(null)
  const [deleting, setDeleting] = useState(false)

  const shell = (children: React.ReactNode) => (
    <div className="fixed inset-0 z-[200] overflow-y-auto"
      style={{ backgroundColor: '#0f131c', backgroundImage: 'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(229,9,20,0.10) 0%, #0f131c 65%)' }}>
      <div className="min-h-full flex flex-col items-center justify-center px-5 py-12">{children}</div>
    </div>
  )

  if (view === 'form') {
    return shell(
      <div className="w-full max-w-md animate-slide-up">
        <h1 className="text-2xl font-extrabold text-white text-center mb-6">{editing ? 'Edit profile' : 'New profile'}</h1>
        <ProfileForm editing={editing}
          onCancel={() => setView(editing ? 'manage' : 'select')}
          onDone={(p) => { if (p && !editing) onSelect(p); else setView('manage') }} />
      </div>
    )
  }

  if (view === 'manage') {
    return shell(
      <div className="w-full max-w-md animate-slide-up">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setView('select')} aria-label="Back" className="btn-icon"><Icon name="arrow_back" size={20} /></button>
          <h1 className="text-xl font-extrabold text-white">Manage profiles</h1>
        </div>
        <div className="space-y-2.5 mb-5">
          {profiles.map(p => (
            <div key={p._id} className="card flex items-center gap-3 p-3">
              <ProfileBadge p={p} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white truncate">{p.name}</p>
                <p className="text-xs text-ink-faint">{p.isKids ? 'Kids profile' : p.hasPin ? 'PIN protected' : 'No PIN'}</p>
              </div>
              <button onClick={() => { setEditing(p); setView('form') }} className="btn-secondary px-4 py-1.5 text-xs">Edit</button>
              {profiles.length > 1 && (
                <button onClick={() => setConfirm(p)} aria-label={`Delete ${p.name}`} className="w-9 h-9 rounded-full flex items-center justify-center text-ink-faint hover:text-brand-soft hover:bg-brand/10">
                  <Icon name="delete" size={18} />
                </button>
              )}
            </div>
          ))}
        </div>
        {profiles.length < 5 && (
          <button onClick={() => { setEditing(null); setView('form') }} className="btn-secondary w-full h-12">
            <Icon name="add" size={20} /> Add profile
          </button>
        )}

        {confirm && (
          <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" role="dialog" aria-modal="true">
            <div className="card p-5 max-w-sm w-full">
              <p className="text-white font-bold mb-1">Delete “{confirm.name}”?</p>
              <p className="text-ink-muted text-sm mb-4">Its watch history and recommendations will be lost.</p>
              <div className="flex gap-2">
                <button onClick={() => setConfirm(null)} className="btn-secondary flex-1">Cancel</button>
                <button disabled={deleting} onClick={async () => {
                  setDeleting(true)
                  try { await remove(confirm._id) } finally { setDeleting(false); setConfirm(null) }
                }} className="btn-primary flex-1">Delete</button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  return shell(
    <>
      <Logo className="mb-10" />
      <h1 className="text-white text-3xl sm:text-4xl font-extrabold text-center mb-2 tracking-tight">Who's watching?</h1>
      <p className="text-ink-muted text-sm mb-10 text-center">Choose a profile to continue</p>

      {loading && !profiles.length ? (
        <div className="flex gap-6 mb-10">
          {[0, 1].map(i => <div key={i} className="w-24 h-24 sm:w-28 sm:h-28 skeleton rounded-3xl" />)}
        </div>
      ) : (
        <div className="flex flex-wrap justify-center gap-6 sm:gap-8 mb-10 max-w-2xl">
          {profiles.map(p => (
            <button key={p._id} onClick={() => onSelect(p)} className="group flex flex-col items-center gap-3">
              <div className="transition-transform duration-200 group-hover:scale-110 group-focus-visible:scale-110 rounded-3xl group-hover:shadow-focus">
                <ProfileBadge p={p} />
              </div>
              <span className="flex items-center gap-1 text-ink-muted text-sm font-semibold group-hover:text-white">
                {p.name}{p.hasPin && <Icon name="lock" size={14} />}
              </span>
            </button>
          ))}
          {profiles.length < 5 && (
            <button onClick={() => { setEditing(null); setView('form') }} className="group flex flex-col items-center gap-3">
              <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-3xl flex items-center justify-center text-ink-faint border-2 border-dashed border-white/15 group-hover:border-brand/60 group-hover:text-brand transition-all group-hover:scale-110">
                <Icon name="add" size={40} />
              </div>
              <span className="text-ink-faint text-sm font-semibold group-hover:text-white">Add profile</span>
            </button>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={() => setView('manage')} className="btn-secondary"><Icon name="edit" size={18} /> Manage profiles</button>
        <button onClick={() => logout()} className="btn-ghost"><Icon name="logout" size={18} /> Sign out</button>
      </div>
    </>
  )
}
