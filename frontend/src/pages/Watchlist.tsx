import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useWatchlistStore } from '../context/watchlistStore'
import { img, rating } from '../services/tmdb'

export default function Watchlist() {
  const { items, loading, fetch, remove } = useWatchlistStore()

  useEffect(() => { fetch() }, [])

  if (loading) return (
    <div className="pt-20 max-w-5xl mx-auto px-4">
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4">
        {Array(10).fill(0).map((_, i) => <div key={i} className="aspect-[2/3] rounded-lg bg-dark-card animate-pulse" />)}
      </div>
    </div>
  )

  return (
    <div className="pt-20 max-w-5xl mx-auto px-4 pb-12">
      <h1 className="text-2xl font-black mb-6">My Watchlist</h1>
      {items.length === 0 ? (
        <div className="text-center py-20 text-slate-500">
          <div className="text-5xl mb-4">📌</div>
          <p className="mb-4">Nothing saved yet.</p>
          <Link to="/" className="btn-primary text-sm">Browse Movies</Link>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
          {items.map(item => (
            <div key={item._id} className="group relative">
              <Link to={`/movie/${item.movieId}`} className="block card-hover">
                <img src={img(item.poster, 'w300')} alt={item.title} className="w-full aspect-[2/3] object-cover rounded-lg bg-dark-card" />
                <div className="mt-1.5">
                  <div className="text-xs font-semibold text-slate-200 truncate">{item.title}</div>
                  <div className="text-xs text-slate-500 flex gap-2"><span>{item.year}</span><span className="text-yellow-400">★ {rating(item.rating)}</span></div>
                </div>
              </Link>
              <button onClick={() => remove(item.movieId)}
                className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/70 text-red-400 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500 hover:text-white">✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
