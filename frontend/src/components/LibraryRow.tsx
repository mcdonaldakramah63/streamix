// Home row for titles an admin added to the server's own library
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import { RailHeader } from './Carousel'
import Icon from './Icon'

interface LibItem {
  _id: string; title: string; year: string; poster: string; license: string
  tmdbId?: number | null; mediaType?: 'movie' | 'tv'; season?: number | null; episode?: number | null
}

/** Linked files open on their real movie / episode page; the rest use the standalone player */
const target = (it: LibItem) => {
  if (!it.tmdbId) return `/watch/${it._id}`
  if (it.mediaType === 'tv') return it.episode != null ? `/player/tv/${it.tmdbId}?season=${it.season || 1}&episode=${it.episode}` : `/tv/${it.tmdbId}`
  return `/movie/${it.tmdbId}`
}

export default function LibraryRow() {
  const navigate = useNavigate()
  const [items, setItems] = useState<LibItem[]>([])

  useEffect(() => {
    api.get('/library').then(r => setItems(r.data.items || [])).catch(() => setItems([]))
  }, [])

  if (!items.length) return null

  return (
    <section className="mb-8 sm:mb-10">
      <RailHeader title="Streamix Library" icon="video_library" accent="cyan" right={
        <span className="text-label-sm uppercase text-ink-faint">{items.length} free to watch</span>
      } />
      <div className="flex gap-3 sm:gap-4 overflow-x-auto scrollbar-hide px-4 sm:px-6 lg:px-12 pb-2 snap-x">
        {items.map(it => (
          <button key={it._id} onClick={() => navigate(target(it))}
            className="group flex-shrink-0 w-36 sm:w-44 rounded-2xl overflow-hidden bg-dark-card text-left snap-start hover:shadow-focus transition-all">
            <div className="relative aspect-[2/3] bg-dark-void">
              {it.poster
                ? <img src={it.poster} alt={it.title} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                : <div className="w-full h-full flex items-center justify-center text-ink-faint"><Icon name="movie" size={32} /></div>}
              <span className="absolute top-2 left-2 tech-pill !bg-dark-void/70 text-cyan">{it.license === 'public-domain' ? 'Public domain' : it.license === 'creative-commons' ? 'CC' : 'Library'}</span>
              <span className="absolute inset-0 m-auto w-12 h-12 rounded-full bg-brand text-white flex items-center justify-center shadow-brand opacity-0 group-hover:opacity-100 transition-opacity">
                <Icon name="play_arrow" size={28} fill />
              </span>
            </div>
            <div className="p-3">
              <p className="text-[13px] font-bold text-ink truncate">{it.title}</p>
              <p className="text-xs text-ink-faint">{it.mediaType === 'tv' && it.episode != null ? `S${it.season || 1} · E${it.episode}` : it.year || '—'}</p>
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}
