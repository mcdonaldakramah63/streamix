// frontend/src/pages/Watchlist.tsx — FULL REPLACEMENT
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWatchlistStore } from '../stores/watchlistStore'
import { useAuthStore } from '../context/authStore'
import MovieCard from '../components/MovieCard'

export default function Watchlist() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { items, loading, fetch, remove } = useWatchlistStore()

  useEffect(() => {
    if (user) fetch()
  }, [user])

  if (!user) {
    return (
      <div className="pt-14 min-h-screen flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="text-6xl mb-4">🔖</div>
          <h2 className="text-2xl font-bold mb-2" style={{ fontFamily: 'Syne, sans-serif' }}>Your Watchlist</h2>
          <p className="text-slate-500 mb-6">Sign in to save movies and shows to watch later</p>
          <div className="flex gap-3 justify-center">
            <button onClick={() => navigate('/login')} className="btn-primary px-6 py-2.5">Sign In</button>
            <button onClick={() => navigate('/register')} className="btn-secondary px-6 py-2.5">Sign Up</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="pt-14 min-h-screen px-3 sm:px-6 py-6">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white" style={{ fontFamily: 'Syne, sans-serif' }}>
              My Watchlist
            </h1>
            {!loading && items.length > 0 && (
              <p className="text-slate-500 text-sm mt-1">{items.length} title{items.length !== 1 ? 's' : ''} saved</p>
            )}
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="movie-card-grid">
            {Array(12).fill(0).map((_, i) => (
              <div key={i} className="skeleton rounded-xl" style={{ aspectRatio: '2/3' }} />
            ))}
          </div>
        )}

        {/* Empty */}
        {!loading && items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-slate-500">
            <div className="text-6xl mb-4">🔖</div>
            <h3 className="text-lg font-semibold text-white mb-2">Nothing saved yet</h3>
            <p className="text-sm mb-6">Browse movies and shows and tap + to add them here</p>
            <button onClick={() => navigate('/')} className="btn-primary px-6 py-2.5">Browse Movies</button>
          </div>
        )}

        {/* Grid */}
        {!loading && items.length > 0 && (
          <div className="movie-card-grid">
            {items.map(item => (
              <MovieCard
                key={item.movieId}
                movie={{
                  id:            item.movieId,
                  title:         item.title,
                  name:          undefined,
                  poster_path:   item.poster,
                  backdrop_path: item.backdrop,
                  vote_average:  item.rating,
                  release_date:  item.year,
                  genre_ids:     [],
                } as any}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
