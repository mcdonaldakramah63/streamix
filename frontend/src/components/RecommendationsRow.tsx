// frontend/src/components/RecommendationsRow.tsx — NEW FILE
import { useRecommendations } from '../hooks/useRecommendations'
import { useProfileStore }    from '../stores/profileStore'
import { useAuthStore }       from '../context/authStore'
import Carousel from './Carousel'

export default function RecommendationsRow() {
  const { user }          = useAuthStore()
  const { activeProfile } = useProfileStore()
  const { sections, loading } = useRecommendations()

  if (!user || !activeProfile) return null

  if (loading) {
    return (
      <div className="mb-6 px-3 sm:px-6">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-1.5 h-5 bg-brand rounded-full" />
          <div className="h-5 w-48 skeleton rounded" />
        </div>
        <div className="flex gap-2 sm:gap-3 overflow-x-hidden">
          {Array(7).fill(0).map((_, i) => (
            <div key={i} className="flex-shrink-0 w-28 sm:w-36 skeleton rounded-xl" style={{ aspectRatio:'2/3' }} />
          ))}
        </div>
      </div>
    )
  }

  if (!sections.length) return null

  return (
    <>
      {sections.map((section, idx) => (
        <div key={idx} className="relative">
          {/* Personalized indicator on first row */}
          {idx === 0 && (
            <div className="absolute -top-1 right-3 sm:right-6 flex items-center gap-1.5 text-[10px] text-brand font-semibold uppercase tracking-wider">
              <span className="w-1.5 h-1.5 bg-brand rounded-full animate-pulse" />
              Personalized for {activeProfile.name}
            </div>
          )}
          <Carousel
            title={section.title}
            movies={section.items}
            loading={false}
          />
        </div>
      ))}
    </>
  )
}
