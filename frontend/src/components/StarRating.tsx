// frontend/src/components/StarRating.tsx — FULL REPLACEMENT
import { useState } from 'react'
import api from '../services/api'
import { useAuthStore } from '../context/authStore'

interface Props {
  tmdbId:        number
  type:          'movie' | 'tv'
  initialRating?: number
  totalRatings?:  number
  avgRating?:     number
}

export default function StarRating({ tmdbId, type, initialRating = 0, totalRatings = 0, avgRating = 0 }: Props) {
  const { user }  = useAuthStore()
  const [myRating, setMyRating] = useState(initialRating)
  const [hover,    setHover]    = useState(0)
  const [saving,   setSaving]   = useState(false)
  const [total,    setTotal]    = useState(totalRatings)
  const [avg,      setAvg]      = useState(avgRating)
  const [saved,    setSaved]    = useState(false)

  const handleRate = async (stars: number) => {
    if (!user || saving) return
    setSaving(true)
    try {
      const { data } = await api.post('/ratings', { tmdbId, type, rating: stars })
      setMyRating(stars)
      setTotal(data.totalRatings)
      setAvg(data.avgRating)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      console.error('Rating failed', e)
    } finally {
      setSaving(false)
    }
  }

  const display = hover || myRating

  return (
    <div className="flex flex-col gap-1.5">
      {/* Stars */}
      <div className="flex items-center gap-0.5">
        {[1,2,3,4,5].map(star => (
          <button
            key={star}
            disabled={!user || saving}
            onMouseEnter={() => setHover(star)}
            onMouseLeave={() => setHover(0)}
            onClick={() => handleRate(star)}
            className={`text-2xl transition-all duration-150 leading-none ${
              star <= display
                ? 'text-gold scale-110 drop-shadow-[0_0_6px_rgba(245,158,11,0.5)]'
                : 'text-slate-700 hover:text-slate-500'
            } disabled:cursor-default`}>
            ★
          </button>
        ))}

        {saving && (
          <div className="w-4 h-4 border border-slate-500 border-t-brand rounded-full animate-spin ml-2" />
        )}
        {saved && !saving && (
          <span className="text-brand text-xs ml-2 animate-fade-in font-medium">Saved!</span>
        )}
      </div>

      {/* Labels */}
      <div className="flex items-center gap-3 text-xs text-slate-600">
        {myRating > 0 && (
          <span>
            Your rating: <span className="text-gold font-semibold">{myRating}/5</span>
          </span>
        )}
        {avg > 0 && (
          <span>
            Community: <span className="text-slate-400">★ {avg.toFixed(1)}</span>
            <span className="text-slate-700 ml-1">({total.toLocaleString()})</span>
          </span>
        )}
        {!user && (
          <span className="text-slate-700 italic">Sign in to rate</span>
        )}
      </div>
    </div>
  )
}
