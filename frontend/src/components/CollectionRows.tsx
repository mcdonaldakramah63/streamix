// Home rows for admin-curated collections
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import { RailHeader } from './Carousel'
import Icon from './Icon'

interface Item { kind: 'movie' | 'tv' | 'library'; id: string; title: string; year: string; poster: string }
interface Collection { _id: string; title: string; description: string; emoji: string; items: Item[] }

export const collectionTarget = (it: Item) =>
  it.kind === 'library' ? `/watch/${it.id}` : it.kind === 'tv' ? `/tv/${it.id}` : `/movie/${it.id}`

export default function CollectionRows() {
  const navigate = useNavigate()
  const [list, setList] = useState<Collection[]>([])
  useEffect(() => { api.get('/collections').then(r => setList(r.data)).catch(() => setList([])) }, [])

  return (
    <>
      {list.map(c => (
        <section key={c._id} className="mb-8 sm:mb-10">
          <RailHeader title={`${c.emoji} ${c.title}`} accent="gold" right={
            c.description ? <span className="text-xs text-ink-faint hidden sm:inline max-w-sm truncate">{c.description}</span> : undefined
          } />
          <div className="flex gap-3 sm:gap-4 overflow-x-auto scrollbar-hide px-4 sm:px-6 lg:px-12 pb-2 snap-x">
            {c.items.map(it => (
              <button key={`${it.kind}-${it.id}`} onClick={() => navigate(collectionTarget(it))}
                className="group flex-shrink-0 w-36 sm:w-44 rounded-2xl overflow-hidden bg-dark-card text-left snap-start hover:shadow-focus transition-all">
                <div className="relative aspect-[2/3] bg-dark-void">
                  {it.poster
                    ? <img src={it.poster} alt={it.title} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    : <div className="w-full h-full flex items-center justify-center text-ink-faint"><Icon name="movie" size={32} /></div>}
                  {it.kind === 'library' && <span className="absolute top-2 left-2 tech-pill !bg-dark-void/70 text-gold">Streamix</span>}
                </div>
                <div className="p-3">
                  <p className="text-[13px] font-bold text-ink truncate">{it.title}</p>
                  <p className="text-xs text-ink-faint">{it.year || '—'}{it.kind === 'tv' ? ' · Series' : ''}</p>
                </div>
              </button>
            ))}
          </div>
        </section>
      ))}
    </>
  )
}
