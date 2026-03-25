// frontend/src/hooks/useRecommendations.ts — NEW FILE
import { useState, useEffect } from 'react'
import { useProfileStore } from '../stores/profileStore'
import { useAuthStore }    from '../context/authStore'
import api from '../services/api'

export interface RecommendationSection {
  title: string
  items: any[]
}

export function useRecommendations() {
  const { user }   = useAuthStore()
  const { activeProfile } = useProfileStore()

  const [sections, setSections] = useState<RecommendationSection[]>([])
  const [loading,  setLoading]  = useState(false)
  const [loaded,   setLoaded]   = useState(false)

  useEffect(() => {
    if (!user || !activeProfile) return
    if (loaded) return  // don't refetch on every render

    setLoading(true)
    api.get(`/profiles/${activeProfile._id}/recommendations`)
      .then(r => {
        setSections(r.data.sections || [])
        setLoaded(true)
      })
      .catch(() => setSections([]))
      .finally(() => setLoading(false))
  }, [user, activeProfile?._id])

  const refresh = () => {
    setLoaded(false)
    setSections([])
  }

  return { sections, loading, refresh }
}
