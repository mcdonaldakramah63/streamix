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

function proxyUrl(rawUrl: string): string {
  if (!rawUrl) return rawUrl
  const base = (import.meta.env.VITE_API_URL || 'https://streamix-production-1cb4.up.railway.app/api')
    .replace('/api', '')
  return `${base}/api/stream/proxy?url=${encodeURIComponent(rawUrl)}`
}

// Test if a proxied m3u8 URL actually loads (not 403)
async function testSource(rawUrl: string): Promise<boolean> {
  try {
    const proxied = proxyUrl(rawUrl)
    const res = await fetch(proxied, { method: 'HEAD' })
    return res.ok
  } catch {
    return false
  }
}

const SERVERS = [
  { server: 'vidstreaming', category: 'sub'  },
  { server: 'hd-2',        category: 'sub'  },
  { server: 'hd-1',        category: 'sub'  },
  { server: 'vidstreaming', category: 'dub'  },
  { server: 'hd-2',        category: 'dub'  },
  { server: 'hd-1',        category: 'dub'  },
]

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
      const searchRes = await api.get('/stream/anime/search', { params: { q: title, page: 1 } })
      const animes    = searchRes.data?.animes || []
      if (!animes.length) return null

      const titleLower = title.toLowerCase()
      const best = animes.find(
        (a: any) => a.name?.toLowerCase() === titleLower || a.jname?.toLowerCase() === titleLower
      ) || animes[0]

      console.log('[Anime] Match:', best.name, best.id)

      // 2. Get episodes
      const epsRes   = await api.get('/stream/anime/episodes', { params: { id: best.id } })
      const episodes = epsRes.data?.episodes || []
      if (!episodes.length) return null

      // 3. Find target episode
      let target = episodes.find((e: any) => e.number === episode)
      if (!target) target = episodes[episode - 1] || episodes[0]
      if (!target) return null

      console.log('[Anime] Episode:', target.number, target.episodeId)

      // 4. Try each server — test the proxied URL actually loads before returning it
      for (const { server, category } of SERVERS) {
        try {
          const r = await api.get('/stream/anime/watch', {
            params: { id: target.episodeId, server, category },
          })

          const rawSources = (r.data?.sources || []).filter(
            (s: any) => s.isM3U8 || s.url?.includes('.m3u8')
          )

          if (!rawSources.length) continue

          // Test if the first source is actually accessible through proxy
          const firstRaw = rawSources[0].url
          console.log(`[Anime] Testing ${server}/${category}:`, firstRaw.substring(0, 60))

          const works = await testSource(firstRaw)

          if (!works) {
            console.log(`[Anime] ${server}/${category} → 403, trying next server`)
            continue
          }

          console.log(`[Anime] ✅ ${server}/${category} works!`)

          // Proxy all sources
          const sources: HLSSource[] = rawSources.map((s: any) => ({
            url:     proxyUrl(s.url),
            quality: s.quality || 'Auto',
            isM3U8:  true,
          }))

          const subtitles = (r.data?.tracks || [])
            .filter((t: any) => t.kind === 'captions' || t.kind === 'subtitles')
            .map((t: any) => ({
              url:   t.file,
              lang:  t.label?.toLowerCase().includes('english') ? 'en' : (t.label || 'en'),
              label: t.label || 'English',
            }))

          return { sources, subtitles, provider: 'hls' }

        } catch { continue }
      }

      console.log('[Anime] All servers failed or blocked')
      return null

    } catch (err: any) {
      console.warn('[Anime] Error:', err.message)
      setError(err.message)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  return { findAnimeStream, loading, error }
}
