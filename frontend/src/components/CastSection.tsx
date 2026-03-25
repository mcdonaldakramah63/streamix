// frontend/src/components/CastSection.tsx — FULL REPLACEMENT
import { useNavigate } from 'react-router-dom'

interface CastMember {
  id:          number
  name:        string
  character:   string
  profile_path:string | null
  order:       number
}

interface Props {
  cast:    CastMember[]
  loading: boolean
}

const IMG_PS = 'https://image.tmdb.org/t/p/w185'
const FALLBACK = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTg1IiBoZWlnaHQ9IjI3OCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTg1IiBoZWlnaHQ9IjI3OCIgZmlsbD0iIzEzMTYxZiIvPjx0ZXh0IHg9IjUwJSIgeT0iNDglIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LXNpemU9IjQwIiBmaWxsPSIjMWUyMjM1Ij7wn5OKPC90ZXh0Pjwvc3ZnPg=='

export default function CastSection({ cast, loading }: Props) {
  const navigate = useNavigate()

  if (loading) {
    return (
      <div>
        <div className="h-5 w-24 skeleton rounded mb-4" />
        <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2">
          {Array(8).fill(0).map((_, i) => (
            <div key={i} className="flex-shrink-0 w-20 sm:w-24 space-y-2">
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full skeleton" />
              <div className="h-3 skeleton rounded w-full" />
              <div className="h-2.5 skeleton rounded w-3/4" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (!cast?.length) return null

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="section-title">Cast</h3>
        <span className="text-xs text-slate-600">{cast.length} actors</span>
      </div>

      <div className="flex gap-3 sm:gap-4 overflow-x-auto scrollbar-hide pb-2 -mx-3 px-3 sm:-mx-6 sm:px-6">
        {cast.slice(0, 20).map(member => (
          <button
            key={member.id}
            onClick={() => navigate(`/person/${member.id}`)}
            className="flex-shrink-0 w-20 sm:w-24 text-left group">

            {/* Photo circle */}
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden bg-dark-card mb-2
              ring-2 ring-transparent group-hover:ring-brand transition-all duration-300 relative">
              <img
                src={member.profile_path ? IMG_PS + member.profile_path : FALLBACK}
                alt={member.name}
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                onError={e => { (e.target as HTMLImageElement).src = FALLBACK }}
              />
              {/* Hover overlay */}
              <div className="absolute inset-0 bg-brand/20 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>

            <p className="text-xs font-semibold text-slate-200 truncate group-hover:text-brand transition-colors">
              {member.name}
            </p>
            <p className="text-[10px] text-slate-600 truncate mt-0.5">
              {member.character}
            </p>
          </button>
        ))}
      </div>
    </div>
  )
}
