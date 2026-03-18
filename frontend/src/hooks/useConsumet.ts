// frontend/src/hooks/useConsumet.ts — FULL REPLACEMENT
import { useState, useCallback } from 'react'
import api from '../services/api'

export interface HLSSource {
  url:     string
  quality: string
  isM3U8:  boolean
}

export interface StreamResult {
  sources:   HLSSource[]
  subtitles: { url: string; lang: string; label: string }[]
  provider:  'hls' | 'iframe'
}

// Wrap a raw m3u8 URL through our backend proxy to fix CORS
function proxyUrl(rawUrl: string): string {
  if (!rawUrl) return rawUrl
  const base = import.meta.env.VITE_API_URL?.replace('/api', '') || 'https://streamix-usak.onrender.com'
  return `${base}/api/stream/proxy?url=${encodeURIComponent(rawUrl)}`
}

export function useConsumet() {
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const findAnimeStream = useCallback(async (
    title:   string,
    season:  number,
    episode: number
  ): Promise<StreamResult | null> => {
    setLoading(true)
    setError(null)

    try {
      // 1. Search
      const searchRes = await api.get('/stream/anime/search', {
        params: { q: title, page: 1 },
      })
      const animes = searchRes.data?.animes || []
      if (!animes.length) {
        console.log('[Consumet] No results for:', title)
        return null
      }

      // Best match: exact name first, else first result
      const titleLower = title.toLowerCase()
      const best = animes.find(
        (a: any) => a.name?.toLowerCase() === titleLower ||
                    a.jname?.toLowerCase() === titleLower
      ) || animes[0]

      console.log('[Consumet] Match:', best.name, '| id:', best.id)

      // 2. Get episodes
      const epsRes   = await api.get('/stream/anime/episodes', { params: { id: best.id } })
      const episodes = epsRes.data?.episodes || []
      if (!episodes.length) return null

      // 3. Find target episode
      let target = episodes.find((e: any) => e.number === episode)
      if (!target) target = episodes[episode - 1] || episodes[0]
      if (!target) return null

      console.log('[Consumet] Episode:', target.number, '| episodeId:', target.episodeId)

      // 4. Get stream — try sub then dub
      let watchData: any = null
      for (const category of ['sub', 'dub']) {
        try {
          const r = await api.get('/stream/anime/watch', {
            params: { id: target.episodeId, server: 'hd-1', category },
          })
          if (r.data?.sources?.length) {
            watchData = r.data
            console.log(`[Consumet] Got ${category} sources:`, r.data.sources.length)
            break
          }
        } catch { continue }
      }

      if (!watchData?.sources?.length) {
        console.log('[Consumet] No sources returned')
        return null
      }

      // 5. Proxy all m3u8 URLs through backend to fix CORS
      const sources: HLSSource[] = (watchData.sources as any[])
        .filter(s => s.isM3U8 || s.url?.includes('.m3u8'))
        .map(s => ({
          url:     proxyUrl(s.url),   // ← key fix: route through our proxy
          quality: s.quality || 'Auto',
          isM3U8:  true,
        }))

      if (!sources.length) {
        console.log('[Consumet] No m3u8 sources after filter')
        return null
      }

      // 6. Subtitles
      const subtitles = (watchData.tracks || [])
        .filter((t: any) => t.kind === 'captions' || t.kind === 'subtitles')
        .map((t: any) => ({
          url:   t.file,
          lang:  t.label?.toLowerCase().includes('english') ? 'en' : (t.label || 'en'),
          label: t.label || 'English',
        }))

      return { sources, subtitles, provider: 'hls' }

    } catch (err: any) {
      console.warn('[Consumet] Failed:', err?.response?.status, err.message)
      setError(err.message)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  return { findAnimeStream, loading, error }
}
