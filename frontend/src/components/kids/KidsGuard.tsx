// Mounted for kids profiles: counts watch time and locks the app at the daily limit or bedtime
import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useKidsStore } from '../../stores/kidsStore'
import { useProfileStore } from '../../stores/profileStore'

export default function KidsGuard({ profileId }: { profileId: string }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { status, refresh, tick } = useKidsStore()
  const setActive = useProfileStore(s => s.setActive)
  const watching = location.pathname.startsWith('/player/')

  useEffect(() => { refresh(profileId) }, [profileId, refresh])

  // Count a minute of screen time for every minute spent watching with the tab visible
  useEffect(() => {
    const t = setInterval(() => {
      if (watching && document.visibilityState === 'visible') tick(profileId)
      else refresh(profileId) // bedtime can start while browsing
    }, 60_000)
    return () => clearInterval(t)
  }, [profileId, watching, tick, refresh])

  if (!status || status.allowed) return null

  const bedtime = status.reason === 'bedtime'
  const switchProfile = async () => { await setActive(null); navigate('/', { replace: true }) }

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center px-6 text-center"
      style={{ background: bedtime ? 'radial-gradient(circle at 50% 30%, #1e2a5a 0%, #0a0c14 70%)' : 'radial-gradient(circle at 50% 30%, #3a2a10 0%, #0a0c14 70%)' }}
      role="alertdialog" aria-modal="true" aria-labelledby="kids-lock-title">
      <div className="max-w-sm">
        <div className="text-7xl mb-4" aria-hidden="true">{bedtime ? '🌙' : '⏰'}</div>
        <h1 id="kids-lock-title" className="text-white text-2xl font-black mb-2" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
          {bedtime ? "It's bedtime!" : "That's all for today!"}
        </h1>
        <p className="text-white/60 mb-6">
          {bedtime
            ? `Shows are sleeping until ${status.bedtimeEnd}. See you tomorrow!`
            : `You watched ${status.usedToday} minutes today. Time to play, read or go outside!`}
        </p>
        <button onClick={switchProfile} className="px-6 py-3 rounded-2xl text-sm font-bold bg-white/10 text-white hover:bg-white/15">
          Grown-up? Switch profile
        </button>
      </div>
    </div>
  )
}
