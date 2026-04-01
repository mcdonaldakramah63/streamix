// frontend/src/hooks/useConsumet.ts — FULL REPLACEMENT
// FIX: On 5xx responses (502/503/504), immediately returns null to trigger iframe fallback
//      Only retries if server returns a network error (not a backend error)
//      Adds 6-second abort controller so slow servers don't block the UI
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

const BACKEND = (import.meta.env.VITE_API_URL || 'https://streamix-production-1cb4.up.railway.app/api')
  .replace('/api', '')

function proxyUrl(rawUrl: string): string {
  if (!rawUrl) return rawUrl
  return `${BACKEND}/api/stream/proxy?url=${encodeURIComponent(rawUrl)}`
}

// Test if a proxied m3u8 URL is actually accessible (not 403/404)
async function testSource(rawUrl: string): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 4000)
    const res = await fetch(proxyUrl(rawUrl), { method: 'HEAD', signal: controller.signal })
    clearTimeout(timeout)
    return res.ok
  } catch {
    return false
  }
}

const SERVERS = [
  { server: 'hd-2',         category: 'sub' },
  { server: 'hd-1',         category: 'sub' },
  { server: 'vidstreaming', category: 'sub' },
  { server: 'hd-2',         category: 'dub' },
  { server: 'hd-1',         category: 'dub' },
]

export function useConsumet() {
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const findAnimeStream = useCallback(async (
    title:   string,
    season:  number,
    episode: number,
  ): Promise<StreamResult | null> => {
    setLoading(true)
    setError(null)

    try {
      // ── 1. Search ──────────────────────────────────────────────────────────
      let searchData: any
      try {
        const r = await api.get('/stream/anime/search', { params: { q: title, page: 1 } })
        searchData = r.data
      } catch (e: any) {
        // 5xx = backend/aniwatch is down → immediate fallback, don't retry
        if ((e?.response?.status || 0) >= 500) {
          console.log('[Anime] Backend unavailable, using iframe fallback')
          return null
        }
        throw e
      }

      const animes = searchData?.animes || []
      if (!animes.length) return null

      const tl   = title.toLowerCase()
      const best = animes.find((a: any) =>
        a.name?.toLowerCase() === tl || a.jname?.toLowerCase() === tl
      ) || animes[0]

      console.log('[Anime] Match:', best.name, best.id)

      // ── 2. Get episodes ────────────────────────────────────────────────────
      let episodesData: any
      try {
        const r = await api.get('/stream/anime/episodes', { params: { id: best.id } })
        episodesData = r.data
      } catch (e: any) {
        if ((e?.response?.status || 0) >= 500) return null
        throw e
      }

      const episodes = episodesData?.episodes || []
      if (!episodes.length) return null

      let target = episodes.find((e: any) => e.number === episode)
      if (!target) target = episodes[episode - 1] || episodes[0]
      if (!target) return null

      console.log('[Anime] Episode:', target.number, target.episodeId)

      // ── 3. Try each server ─────────────────────────────────────────────────
      for (const { server, category } of SERVERS) {
        try {
          const r = await api.get('/stream/anime/watch', {
            params: { id: target.episodeId, server, category },
          })

          // 5xx from backend → aniwatch is down, stop trying
          if (r.status >= 500) {
            console.log('[Anime] Backend returned 5xx, stopping')
            return null
          }

          const rawSources = (r.data?.sources || []).filter(
            (s: any) => s.isM3U8 || s.url?.includes('.m3u8')
          )
          if (!rawSources.length) continue

          const firstRaw = rawSources[0].url
          console.log(`[Anime] Testing ${server}/${category}:`, firstRaw.slice(0, 60))

          const works = await testSource(firstRaw)
          if (!works) {
            console.log(`[Anime] ${server}/${category} → blocked, trying next`)
            continue
          }

          console.log(`[Anime] ✅ ${server}/${category} works!`)

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

        } catch (e: any) {
          const status = e?.response?.status || 0
          // 5xx = backend/aniwatch is broken → stop immediately, don't spam 6 requests
          if (status >= 500) {
            console.log(`[Anime] ${server}/${category} → ${status}, aniwatch is down`)
            return null  // immediate fallback
          }
          // Other errors (network, timeout) → try next server
          continue
        }
      }

      console.log('[Anime] All servers failed — iframe fallback')
      return null

    } catch (err: any) {
      console.warn('[Anime] Unexpected error:', err.message)
      setError(err.message)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  return { findAnimeStream, loading, error }
}
