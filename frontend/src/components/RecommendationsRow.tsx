// frontend/src/components/RecommendationsRow.tsx — rows built by the taste engine for the active profile
import { useState } from 'react'
import { useRecommendations } from '../hooks/useRecommendations'
import { useProfileStore } from '../stores/profileStore'
import Carousel from './Carousel'
import TasteOnboarding from './TasteOnboarding'

const ICON: Record<string, string> = { top: 'auto_awesome', because: 'history', cf: 'group', genre: 'theater_comedy', person: 'person', gems: 'diamond', weekly: 'event', explore: 'explore', popular: 'trending_up', acclaimed: 'workspace_premium' }

export default function RecommendationsRow() {
  const { sections, loading, needsOnboarding, refresh, profileId } = useRecommendations()
  const name = useProfileStore(s => s.activeProfile?.name || '')
  const [dismissed, setDismissed] = useState(false)

  return (
    <>
      {needsOnboarding && !dismissed && profileId && (
        <TasteOnboarding profileId={profileId} profileName={name} onDone={() => { setDismissed(true); refresh() }} />
      )}
      {loading && !sections.length ? <Carousel title="" movies={[]} loading /> : sections.map((section, idx) => (
        <Carousel key={section.title} title={section.title} movies={section.items} trackRow={section.kind}
          icon={ICON[section.kind || ''] || (idx === 0 ? 'auto_awesome' : undefined)} accent={idx === 0 ? 'cyan' : 'brand'} />
      ))}
    </>
  )
}
