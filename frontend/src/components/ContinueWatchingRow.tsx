// frontend/src/components/ContinueWatchingRow.tsx — FULL REPLACEMENT
import { useNavigate } from 'react-router-dom'
import { useContinueWatching } from '../stores/continueWatchingStore'
import { useAuthStore }        from '../context/authStore'

function fmtTime(seconds: number): string {
  if (!seconds || seconds < 60) return ''
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}m left` : `${m}m left`
}

export default function ContinueWatchingRow() {
  const navigate  = useNavigate()
  const { user }  = useAuthStore()
  const { items, remove } = useContinueWatching()

  if (!user || !items.length) return null

  const sorted = [...items]
    .sort((a, b) => b.watchedAt - a.watchedAt)
    .slice(0, 12)

  const goResume = (item: typeof items[0]) => {
    if (item.type === 'tv' && item.season && item.episode) {
      navigate(`/player/tv/${item.movieId}?season=${item.season}&episode=${item.episode}`)
    } else {
      navigate(`/player/movie/${item.movieId}`)
    }
  }

  return (
    <section className="px-3 sm:px-6 mb-6 sm:mb-8">
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <h2 className="section-title flex items-center gap-2">
          <span className="w-1.5 h-5 bg-brand rounded-full inline-block" />
          Continue Watching
        </h2>
        <span className="text-xs text-slate-600">{items.length} titles</span>
      </div>

      <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1 -mx-3 px-3 sm:-mx-6 sm:px-6">
        {sorted.map(item => {
          const timeLeft = item.duration && item.timestamp
            ? fmtTime(item.duration - item.timestamp) : ''
          const imgSrc = item.backdrop
            ? `https://image.tmdb.org/t/p/w300${item.backdrop}`
            : item.poster
              ? `https://image.tmdb.org/t/p/w300${item.poster}`
              : null

          return (
            <div key={`${item.movieId}-${item.season}-${item.episode}`}
              className="flex-shrink-0 w-44 sm:w-56 group">

              {/* Thumbnail */}
              <div
                onClick={() => goResume(item)}
                className="relative cursor-pointer rounded-xl overflow-hidden bg-dark-card mb-2"
                style={{ aspectRatio: '16/9' }}>

                {imgSrc ? (
                  <img src={imgSrc} alt={item.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-4xl bg-dark-surface">🎬</div>
                )}

                {/* Overlay + play */}
                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <div className="w-11 h-11 rounded-full glass border border-white/20 flex items-center justify-center">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="white" className="ml-0.5"><polygon points="5,3 19,12 5,21"/></svg>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/10">
                  <div className="h-full bg-brand transition-all rounded-full" style={{ width:`${Math.min(item.progress,100)}%` }} />
                </div>

                {/* Remove button */}
                <button
                  onClick={e => { e.stopPropagation(); remove(item.movieId) }}
                  className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/70 flex items-center justify-center text-white/50 hover:text-white hover:bg-black/90 opacity-0 group-hover:opacity-100 transition-all text-xs">
                  ✕
                </button>

                {/* Episode badge */}
                {item.type === 'tv' && item.season && item.episode && (
                  <div className="absolute top-1.5 left-1.5 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded-lg font-bold">
                    S{item.season}·E{item.episode}
                  </div>
                )}
              </div>

              {/* Info */}
              <p className="text-xs font-semibold text-slate-200 truncate">{item.title}</p>
              <p className="text-[11px] text-slate-600 mt-0.5">
                {item.progress}% watched{timeLeft ? ` · ${timeLeft}` : ''}
              </p>
            </div>
          )
        })}
      </div>
    </section>
  )
}
