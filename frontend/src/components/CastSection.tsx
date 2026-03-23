// frontend/src/components/CastSection.tsx — NEW FILE
import { useNavigate } from 'react-router-dom'

interface CastMember {
  id:           number
  name:         string
  character:    string
  profile_path: string | null
  order:        number
}

interface Props {
  cast:    CastMember[]
  loading: boolean
}

const IMG = 'https://image.tmdb.org/t/p/w185'
const FALLBACK = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTg1IiBoZWlnaHQ9IjI3OCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTg1IiBoZWlnaHQ9IjI3OCIgZmlsbD0iIzFhMWYyZSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LXNpemU9IjQ4IiBmaWxsPSIjMzM0MTU1Ij7wn5OKPC90ZXh0Pjwvc3ZnPg=='

export default function CastSection({ cast, loading }: Props) {
  const navigate = useNavigate()

  if (loading) {
    return (
      <div>
        <h3 className="text-base font-black mb-3">Cast</h3>
        <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2">
          {Array(8).fill(0).map((_, i) => (
            <div key={i} className="flex-shrink-0 w-24">
              <div className="w-24 h-24 rounded-full bg-dark-card animate-pulse mb-2" />
              <div className="h-3 bg-dark-card animate-pulse rounded mb-1" />
              <div className="h-2.5 bg-dark-card animate-pulse rounded w-3/4" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (!cast?.length) return null

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-black">Cast</h3>
        <span className="text-xs text-slate-500">{cast.length} actors</span>
      </div>
      <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2 -mx-3 px-3 sm:mx-0 sm:px-0">
        {cast.slice(0, 20).map(member => (
          <button
            key={member.id}
            onClick={() => navigate(`/person/${member.id}`)}
            className="flex-shrink-0 w-20 sm:w-24 text-left group">
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden bg-dark-card mb-2 ring-2 ring-transparent group-hover:ring-brand transition-all">
              <img
                src={member.profile_path ? IMG + member.profile_path : FALLBACK}
                alt={member.name}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                onError={e => { (e.target as HTMLImageElement).src = FALLBACK }}
              />
            </div>
            <p className="text-xs font-semibold text-white truncate group-hover:text-brand transition-colors">{member.name}</p>
            <p className="text-xs text-slate-500 truncate">{member.character}</p>
          </button>
        ))}
      </div>
    </div>
  )
}
