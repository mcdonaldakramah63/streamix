// frontend/src/components/StarRating.tsx — NEW FILE
import { useState } from 'react'
import api from '../services/api'
import { useAuthStore } from '../context/authStore'

interface Props {
  tmdbId:      number
  type:        'movie' | 'tv'
  initialRating?: number
  totalRatings?:  number
  avgRating?:     number
}

export default function StarRating({ tmdbId, type, initialRating = 0, totalRatings = 0, avgRating = 0 }: Props) {
  const { user }  = useAuthStore()
  const [myRating, setMyRating]  = useState(initialRating)
  const [hover,    setHover]     = useState(0)
  const [saving,   setSaving]    = useState(false)
  const [total,    setTotal]     = useState(totalRatings)
  const [avg,      setAvg]       = useState(avgRating)

  const handleRate = async (stars: number) => {
    if (!user) return
    setSaving(true)
    try {
      const { data } = await api.post('/ratings', { tmdbId, type, rating: stars })
      setMyRating(stars)
      setTotal(data.totalRatings)
      setAvg(data.avgRating)
    } catch (e) {
      console.error('Rating failed', e)
    } finally {
      setSaving(false)
    }
  }

  const display = hover || myRating

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        {[1,2,3,4,5].map(star => (
          <button
            key={star}
            disabled={!user || saving}
            onMouseEnter={() => setHover(star)}
            onMouseLeave={() => setHover(0)}
            onClick={() => handleRate(star)}
            className={`transition-all text-xl sm:text-2xl ${
              star <= display
                ? 'text-yellow-400 scale-110'
                : 'text-slate-600 hover:text-yellow-300'
            } disabled:cursor-not-allowed`}>
            ★
          </button>
        ))}
        {saving && (
          <div className="w-4 h-4 border border-slate-500 border-t-brand rounded-full animate-spin ml-1" />
        )}
      </div>
      <div className="flex items-center gap-2 text-xs text-slate-500">
        {myRating > 0 && <span className="text-brand font-semibold">Your rating: {myRating}/5</span>}
        {avg > 0 && <span>Community: ★ {avg.toFixed(1)} ({total.toLocaleString()})</span>}
        {!user && <span>Sign in to rate</span>}
      </div>
    </div>
  )
}
