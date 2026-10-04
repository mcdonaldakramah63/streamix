// Profile page: playback & viewing preferences for the active profile (like Netflix's profile settings)
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useProfileStore, usePrefs, ProfilePrefs } from '../stores/profileStore'
import { errorMessage } from '../services/api'
import Icon from './Icon'

const LANGS: [string, string][] = [['', 'Off'], ['en', 'English'], ['es', 'Spanish'], ['fr', 'French'], ['de', 'German'], ['pt', 'Portuguese'],
  ['it', 'Italian'], ['ja', 'Japanese'], ['ko', 'Korean'], ['zh', 'Chinese'], ['ar', 'Arabic'], ['hi', 'Hindi']]
const MATURITY: [ProfilePrefs['maturity'], string, string][] = [
  ['7', '7+', 'G, PG, TV-Y7, TV-PG'], ['13', '13+', 'adds PG-13'], ['16', '16+', 'adds TV-14'], ['all', 'All', 'everything, including R and TV-MA'],
]

function Toggle({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint: string }) {
  return (
    <label className="flex items-center gap-3 py-2 cursor-pointer">
      <span className="flex-1 min-w-0">
        <span className="block text-sm text-white font-semibold">{label}</span>
        <span className="block text-xs text-ink-faint">{hint}</span>
      </span>
      <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)}
        className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${on ? 'bg-brand' : 'bg-white/15'}`}>
        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
      </button>
    </label>
  )
}

export default function PlaybackSettings() {
  const profile = useProfileStore(s => s.activeProfile)
  const update = useProfileStore(s => s.update)
  const prefs = usePrefs()
  const [error, setError] = useState('')
  if (!profile || profile.isKids) return null

  // Loosening maturity asks for a parent PIN automatically (profile store retries with it)
  const save = async (patch: Partial<ProfilePrefs>) => {
    setError('')
    try { await update(profile._id, { prefs: { ...prefs, ...patch } }) }
    catch (e) { setError(errorMessage(e, 'Could not save')) }
  }

  return (
    <section className="card p-5 mb-5">
      <div className="flex items-center mb-2">
        <h2 className="text-label-sm uppercase text-ink-faint flex-1">Playback & viewing for {profile.name}</h2>
        <Link to="/activity" className="text-xs text-ink-faint hover:text-white flex items-center gap-1"><Icon name="history" size={15} />Viewing activity</Link>
      </div>
      {error && <p role="alert" className="text-sm text-brand-soft mb-2">{error}</p>}
      <div className="divide-y divide-white/[0.05]">
        <Toggle on={prefs.autoplayNext} onChange={v => save({ autoplayNext: v })} label="Autoplay next episode" hint="Starts the next episode a few seconds after one ends" />
        <Toggle on={prefs.autoplayPreviews} onChange={v => save({ autoplayPreviews: v })} label="Autoplay previews" hint="Plays a muted trailer when you hover over a title" />
        <label className="flex items-center gap-3 py-2.5">
          <span className="flex-1"><span className="block text-sm text-white font-semibold">Subtitles</span><span className="block text-xs text-ink-faint">Turned on automatically when the video has this language</span></span>
          <select value={prefs.subtitleLang} onChange={e => save({ subtitleLang: e.target.value })} className="input h-10 !w-auto !text-sm">
            {LANGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-3 py-2.5">
          <span className="flex-1"><span className="block text-sm text-white font-semibold">Data usage</span><span className="block text-xs text-ink-faint">For Streamix and direct streams (embeds pick their own quality)</span></span>
          <select value={prefs.quality} onChange={e => save({ quality: e.target.value as ProfilePrefs['quality'] })} className="input h-10 !w-auto !text-sm">
            <option value="auto">Automatic</option><option value="saver">Save data (up to 480p)</option><option value="high">Best quality</option>
          </select>
        </label>
        <div className="py-2.5">
          <p className="text-sm text-white font-semibold">Maturity rating</p>
          <p className="text-xs text-ink-faint mb-2">Titles rated above this ask for a parent PIN before playing</p>
          <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Maturity rating">
            {MATURITY.map(([v, label, hint]) => (
              <button key={v} role="radio" aria-checked={prefs.maturity === v} onClick={() => save({ maturity: v })} title={hint}
                className={`py-2 rounded-xl text-sm font-bold ${prefs.maturity === v ? 'bg-brand text-white' : 'bg-dark-surface text-ink-muted hover:text-white'}`}>{label}</button>
            ))}
          </div>
          <p className="text-[11px] text-ink-faint mt-1.5">{MATURITY.find(m => m[0] === prefs.maturity)?.[2]}</p>
        </div>
      </div>
    </section>
  )
}
