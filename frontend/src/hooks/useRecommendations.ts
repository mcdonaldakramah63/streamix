// frontend/src/hooks/useRecommendations.ts — personalised rows for the active profile
import { useState, useEffect, useCallback } from 'react'
import { useProfileStore } from '../stores/profileStore'
import api from '../services/api'

export interface RecommendationSection {
  title: string
  kind?: string
  items: any[]
}

export function useRecommendations() {
  const profileId = useProfileStore(s => s.activeProfile?._id)
  const [sections, setSections] = useState<RecommendationSection[]>([])
  const [needsOnboarding, setNeedsOnboarding] = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [version,  setVersion]  = useState(0)

  useEffect(() => {
    if (!profileId) { setSections([]); return }
    let cancelled = false
    setLoading(true)
    api.get(`/profiles/${profileId}/recommendations`, { params: version ? { fresh: 1 } : {} })
      .then(r => { if (!cancelled) { setSections(r.data.sections || []); setNeedsOnboarding(!!r.data.needsOnboarding) } })
      .catch(() => { if (!cancelled) setSections([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [profileId, version])

  /** Fetch again, skipping the server cache (e.g. right after taste onboarding) */
  const refresh = useCallback(() => setVersion(v => v + 1), [])

  return { sections, loading, needsOnboarding, refresh, profileId }
}
