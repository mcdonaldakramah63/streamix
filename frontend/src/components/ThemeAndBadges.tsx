// Profile page: accent theme picker + achievement badges for the active profile
import { useEffect, useState } from 'react'
import api from '../services/api'
import { useProfileStore } from '../stores/profileStore'
import { THEMES, ThemeName, applyTheme } from '../utils/theme'
import Icon from './Icon'

interface Badge { id: string; emoji: string; name: string; description: string; earned: boolean; progress: number; goal: number }

export default function ThemeAndBadges() {
  const { activeProfile, update } = useProfileStore()
  const [badges, setBadges] = useState<Badge[] | null>(null)

  useEffect(() => {
    if (!activeProfile) return
    api.get(`/profiles/${activeProfile._id}/badges`).then(r => setBadges(r.data.badges)).catch(() => setBadges([]))
  }, [activeProfile?._id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!activeProfile) return null
  const current = (activeProfile.theme || 'scarlet') as ThemeName
  const pick = (t: ThemeName) => { applyTheme(t); update(activeProfile._id, { theme: t }).catch(() => applyTheme(current)) }
  const earned = badges?.filter(b => b.earned).length ?? 0

  return (
    <div className="space-y-4 mb-5">
      <section className="card p-5">
        <h2 className="text-label-sm uppercase text-ink-faint mb-3">Theme for {activeProfile.name}</h2>
        <div className="flex flex-wrap gap-3" role="radiogroup" aria-label="Accent colour">
          {(Object.keys(THEMES) as ThemeName[]).map(t => (
            <button key={t} onClick={() => pick(t)} role="radio" aria-checked={current === t}
              className={`flex flex-col items-center gap-1.5 text-[11px] font-semibold ${current === t ? 'text-white' : 'text-ink-faint hover:text-ink'}`}>
              <span className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${current === t ? 'ring-2 ring-white ring-offset-2 ring-offset-dark-card scale-110' : ''}`}
                style={{ background: `rgb(${THEMES[t].brand})`, boxShadow: `0 0 16px rgb(${THEMES[t].brand} / 0.45)` }}>
                {current === t && <Icon name="check" size={20} className="text-white" />}
              </span>
              {THEMES[t].label}
            </button>
          ))}
        </div>
      </section>

      <section className="card p-5">
        <div className="flex items-center mb-3">
          <h2 className="text-label-sm uppercase text-ink-faint flex-1">Badges</h2>
          {badges && <span className="text-xs text-ink-faint">{earned} of {badges.length} earned</span>}
        </div>
        {!badges ? <div className="skeleton h-24" /> : (
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5">
            {badges.map(b => (
              <div key={b.id} title={b.description}
                className={`rounded-2xl p-3 text-center ${b.earned ? 'bg-brand/10 border border-brand/25' : 'bg-dark-surface opacity-60'}`}>
                <div className={`text-3xl ${b.earned ? '' : 'grayscale'}`} aria-hidden="true">{b.emoji}</div>
                <p className="text-[11px] font-bold text-white mt-1 leading-tight">{b.name}</p>
                {b.earned
                  ? <p className="text-[10px] text-brand-soft mt-0.5">Earned</p>
                  : <div className="mt-1.5 h-1 rounded-full bg-white/10 overflow-hidden" role="progressbar" aria-valuenow={b.progress} aria-valuemax={b.goal} aria-label={`${b.name} progress`}>
                      <div className="h-full bg-brand" style={{ width: `${(b.progress / b.goal) * 100}%` }} />
                    </div>}
                <span className="sr-only">{b.description}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
