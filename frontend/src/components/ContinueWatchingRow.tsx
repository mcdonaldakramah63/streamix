// frontend/src/components/ContinueWatchingRow.tsx — 16:9 resume cards with scrub bar
import { useNavigate } from 'react-router-dom'
import { useContinueWatching, CWItem } from '../stores/continueWatchingStore'
import { useAuthStore } from '../context/authStore'
import { RailHeader } from './Carousel'
import Icon from './Icon'

function timeLeft(item: CWItem): string {
  const total = item.duration || (item.durationMins ? item.durationMins * 60 : 0)
  if (!total) return ''
  const left = item.timestamp ? total - item.timestamp : total * (1 - item.progress / 100)
  if (left < 60) return ''
  const h = Math.floor(left / 3600), m = Math.floor((left % 3600) / 60)
  return h > 0 ? `${h}h ${m}m left` : `${m}m left`
}

export function resumePath(item: CWItem) {
  return item.type === 'tv'
    ? `/player/tv/${item.movieId}?season=${item.season || 1}&episode=${item.episode || 1}`
    : `/player/movie/${item.movieId}`
}

export default function ContinueWatchingRow() {
  const navigate = useNavigate()
  const user     = useAuthStore(s => s.user)
  const { items, remove } = useContinueWatching()

  if (!user || !items.length) return null
  const sorted = [...items].filter(i => i.progress < 98).sort((a, b) => b.watchedAt - a.watchedAt).slice(0, 12)
  if (!sorted.length) return null

  return (
    <section className="mb-8 sm:mb-10">
      <RailHeader title="Continue Watching" right={
        <span className="text-label-sm uppercase text-ink-faint">{sorted.length} in progress</span>
      } />

      <div className="flex gap-3 sm:gap-4 overflow-x-auto scrollbar-hide px-4 sm:px-6 lg:px-12 pb-2 snap-x">
        {sorted.map(item => {
          const img = item.backdrop
            ? `https://image.tmdb.org/t/p/w500${item.backdrop}`
            : item.poster ? `https://image.tmdb.org/t/p/w342${item.poster}` : null
          const left = timeLeft(item)

          return (
            <div key={item.movieId} className="relative flex-shrink-0 w-60 sm:w-72 rounded-2xl bg-dark-card overflow-hidden shadow-lg group snap-start">
              <button onClick={() => navigate(resumePath(item))} className="relative block w-full aspect-video" aria-label={`Resume ${item.title}`}>
                {img
                  ? <img src={img} alt="" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                  : <div className="w-full h-full flex items-center justify-center bg-dark-void text-ink-faint"><Icon name="movie" size={36} /></div>}
                <div className="absolute inset-0 bg-gradient-to-t from-dark-card via-transparent to-transparent" />
                <span className="absolute inset-0 m-auto w-11 h-11 rounded-full bg-dark-void/80 backdrop-blur-md flex items-center justify-center text-white shadow-[0_0_12px_rgba(0,0,0,0.6)] group-hover:bg-brand group-hover:shadow-brand transition-all">
                  <Icon name="play_arrow" size={24} fill />
                </span>
                {left && (
                  <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md bg-dark-void/85 text-tech-pill uppercase text-ink">{left}</span>
                )}
              </button>

              <div className="w-full h-1 bg-dark-high">
                <div className="h-full bg-brand shadow-[0_0_6px_#e50914]" style={{ width: `${Math.max(2, Math.min(item.progress, 100))}%` }} />
              </div>

              <div className="p-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-[13px] font-bold text-ink truncate">{item.title}</h3>
                  <p className="text-xs text-ink-faint truncate mt-0.5">
                    {item.upNext && <span className="text-cyan font-bold">Up next · </span>}
                    {item.type === 'tv'
                      ? `S${item.season || 1} : E${item.episode || 1}${item.episodeName ? ` • ${item.episodeName}` : ''}`
                      : `Movie • ${item.progress}% watched`}
                  </p>
                </div>
                <button onClick={() => remove(item.movieId)} aria-label={`Remove ${item.title} from Continue Watching`}
                  className="text-ink-faint hover:text-white flex-shrink-0">
                  <Icon name="close" size={18} />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
