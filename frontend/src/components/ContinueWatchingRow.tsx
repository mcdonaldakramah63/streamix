// frontend/src/components/ContinueWatchingRow.tsx — NEW FILE
import { useNavigate } from 'react-router-dom'
import { useContinueWatching } from '../stores/continueWatchingStore'
import { useAuthStore } from '../context/authStore'

const IMG = 'https://image.tmdb.org/t/p/w300'

function formatTime(seconds: number): string {
  if (!seconds || seconds < 60) return ''
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m left`
  return `${m}m left`
}

export default function ContinueWatchingRow() {
  const navigate  = useNavigate()
  const { user }  = useAuthStore()
  const { items, remove } = useContinueWatching()

  if (!user || !items.length) return null

  const sorted = [...items]
    .sort((a, b) => b.watchedAt - a.watchedAt)
    .slice(0, 10)

  const goResume = (item: typeof items[0]) => {
    if (item.type === 'tv' && item.season && item.episode) {
      navigate(`/player/tv/${item.movieId}?season=${item.season}&episode=${item.episode}`)
    } else {
      navigate(`/player/movie/${item.movieId}`)
    }
  }

  return (
    <section className="px-3 sm:px-4 mb-4 sm:mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base sm:text-lg font-black flex items-center gap-2">
          <span>▶</span> Continue Watching
        </h2>
        <span className="text-xs text-slate-500">{items.length} titles</span>
      </div>

      <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2 -mx-3 px-3 sm:mx-0 sm:px-0">
        {sorted.map(item => {
          const timeLeft = item.duration && item.timestamp
            ? formatTime(item.duration - item.timestamp)
            : ''
          const imgSrc = item.backdrop
            ? `https://image.tmdb.org/t/p/w300${item.backdrop}`
            : item.poster
              ? `${IMG}${item.poster}`
              : null

          return (
            <div key={`${item.movieId}-${item.season}-${item.episode}`}
              className="flex-shrink-0 w-44 sm:w-56 group">

              {/* Thumbnail */}
              <div className="relative aspect-video rounded-xl overflow-hidden bg-dark-card mb-2 cursor-pointer"
                onClick={() => goResume(item)}>

                {imgSrc ? (
                  <img src={imgSrc} alt={item.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-4xl bg-dark-surface">🎬</div>
                )}

                {/* Dark overlay + play button */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                      <polygon points="5,3 19,12 5,21"/>
                    </svg>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
                  <div className="h-full bg-brand transition-all" style={{ width: `${Math.min(item.progress, 100)}%` }} />
                </div>

                {/* Remove button */}
                <button
                  onClick={e => { e.stopPropagation(); remove(item.movieId) }}
                  className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center text-white/60 hover:text-white hover:bg-black/80 opacity-0 group-hover:opacity-100 transition-all text-xs">
                  ✕
                </button>

                {/* Episode badge */}
                {item.type === 'tv' && item.season && item.episode && (
                  <div className="absolute top-1.5 left-1.5 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded-lg font-bold">
                    S{item.season}·E{item.episode}
                  </div>
                )}
              </div>

              {/* Info */}
              <p className="text-xs font-semibold text-slate-200 truncate">{item.title}</p>
              <div className="flex items-center justify-between mt-0.5">
                <p className="text-xs text-slate-500">
                  {item.progress}% watched{timeLeft ? ` · ${timeLeft}` : ''}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
