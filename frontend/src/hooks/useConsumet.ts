// frontend/src/hooks/useConsumet.ts — NEW FILE
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
  provider:  'consumet' | 'iframe'
}

export function useConsumet() {
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  // ── Find anime stream by TMDB id + title ─────────────────────────────────
  const findAnimeStream = useCallback(async (
    title: string,
    season: number,
    episode: number,
    tmdbId: number
  ): Promise<StreamResult | null> => {
    setLoading(true)
    setError(null)
    try {
      // 1. Search for the anime on Zoro
      const searchRes = await api.get('/stream/anime/match', { params: { title } })
      const matches   = searchRes.data?.results || []
      if (!matches.length) return null

      // 2. Pick best match (first result usually best for exact title search)
      const zoroId = matches[0].id

      // 3. Get episode list
      const infoRes  = await api.get('/stream/anime/info', { params: { id: zoroId } })
      const episodes = infoRes.data?.episodes || []

      // 4. Find the right episode
      // For season > 1, try to offset (Zoro lists all eps sequentially for most shows)
      let targetEp = episodes.find((e: any) => e.number === episode)
      if (!targetEp && episodes.length > 0) {
        // fallback: try by index
        targetEp = episodes[episode - 1]
      }
      if (!targetEp) return null

      // 5. Get stream URL
      const watchRes = await api.get('/stream/anime/watch', { params: { episodeId: targetEp.id } })
      const sources  = (watchRes.data?.sources || []) as HLSSource[]
      const subs     = (watchRes.data?.subtitles || []).map((s: any) => ({
        url:   s.url,
        lang:  s.lang || 'en',
        label: s.label || s.lang || 'English',
      }))

      const m3u8Sources = sources.filter(s => s.isM3U8 || s.url?.includes('.m3u8'))
      if (!m3u8Sources.length) return null

      return { sources: m3u8Sources, subtitles: subs, provider: 'consumet' }
    } catch (err: any) {
      console.warn('[Consumet] anime stream failed:', err.message)
      setError(err.message)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  // ── Find movie/TV stream ──────────────────────────────────────────────────
  const findMovieStream = useCallback(async (
    title: string,
    type: 'movie' | 'tv',
    season?: number,
    episode?: number
  ): Promise<StreamResult | null> => {
    setLoading(true)
    setError(null)
    try {
      // 1. Search
      const searchRes = await api.get('/stream/movie/search', { params: { q: title, type } })
      const matches   = searchRes.data?.results || []
      if (!matches.length) return null

      const match = matches[0]

      // 2. Get info (needed for episodeId)
      const infoRes = await api.get('/stream/movie/info', {
        params: { id: match.id, provider: 'flixhx' }
      })

      let episodeId = match.id
      if (type === 'tv' && season && episode) {
        const seasons  = infoRes.data?.seasons || []
        const foundSeason = seasons.find((s: any) => s.season === season || s.number === season)
        if (foundSeason) {
          const eps = foundSeason.episodes || []
          const ep  = eps.find((e: any) => e.episode === episode || e.number === episode)
          if (ep) episodeId = ep.id
        }
      }

      // 3. Get stream
      const watchRes = await api.get('/stream/movie/watch', {
        params: { episodeId, mediaId: match.id, provider: 'flixhx' }
      })

      const sources = (watchRes.data?.sources || []) as HLSSource[]
      const subs    = (watchRes.data?.subtitles || []).map((s: any) => ({
        url:   s.url,
        lang:  s.lang || 'en',
        label: s.label || s.lang || 'English',
      }))

      const m3u8Sources = sources.filter(s => s.isM3U8 || s.url?.includes('.m3u8'))
      if (!m3u8Sources.length) return null

      return { sources: m3u8Sources, subtitles: subs, provider: 'consumet' }
    } catch (err: any) {
      console.warn('[Consumet] movie stream failed:', err.message)
      setError(err.message)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  return { findAnimeStream, findMovieStream, loading, error }
}
