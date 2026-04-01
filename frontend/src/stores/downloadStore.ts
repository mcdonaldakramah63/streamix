// frontend/src/stores/downloadStore.ts — NEW FILE
// Offline downloads using Dexie.js (IndexedDB wrapper)
// Works for: HLS anime streams + any direct video URL
// Does NOT work for: VidSrc/embed iframes (third-party, no access)
// Auto-expire: 30 days after download, 48h after first play
import Dexie, { Table } from 'dexie'
import { create } from 'zustand'

// ── Types ─────────────────────────────────────────────────────────────────────
export type DownloadStatus = 'queued' | 'downloading' | 'complete' | 'error' | 'expired'

export interface DownloadItem {
  id?:          number         // auto-increment
  movieId:      number
  title:        string
  poster:       string
  type:         'movie' | 'tv'
  season?:      number
  episode?:     number
  episodeName?: string
  quality:      '480p' | '720p' | '1080p'
  status:       DownloadStatus
  progress:     number         // 0-100
  sizeBytes:    number
  downloadedAt: number         // timestamp
  expiresAt:    number         // timestamp
  firstPlayedAt?:number        // set when user starts watching offline
  blob?:        Blob           // the actual video data
  errorMsg?:    string
}

export interface StorageInfo {
  used:    number  // bytes
  quota:   number  // bytes
  percent: number
}

// ── Dexie database ─────────────────────────────────────────────────────────────
class StreamixDB extends Dexie {
  downloads!: Table<DownloadItem, number>

  constructor() {
    super('StreamixOffline')
    this.version(1).stores({
      downloads: '++id, movieId, status, expiresAt, downloadedAt',
    })
  }
}

const db = new StreamixDB()

// ── Store ─────────────────────────────────────────────────────────────────────
interface DownloadState {
  downloads:   DownloadItem[]
  storageInfo: StorageInfo | null
  loading:     boolean

  init:             () => Promise<void>
  startDownload:    (params: StartDownloadParams) => Promise<void>
  cancelDownload:   (movieId: number) => Promise<void>
  deleteDownload:   (movieId: number) => Promise<void>
  getBlob:          (movieId: number) => Promise<Blob | null>
  refreshStorage:   () => Promise<void>
  purgeExpired:     () => Promise<void>
  isDownloaded:     (movieId: number) => boolean
  getDownload:      (movieId: number) => DownloadItem | undefined
  markPlayed:       (movieId: number) => Promise<void>
}

export interface StartDownloadParams {
  movieId:      number
  title:        string
  poster:       string
  type:         'movie' | 'tv'
  season?:      number
  episode?:     number
  episodeName?: string
  streamUrl:    string         // direct URL (HLS m3u8 or MP4)
  quality?:     '480p' | '720p' | '1080p'
}

// Active download controllers (to allow cancel)
const activeControllers = new Map<number, AbortController>()

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000
const FORTY_EIGHT_HOURS = 48 * 60 * 60 * 1000

export const useDownloadStore = create<DownloadState>((set, get) => ({
  downloads:   [],
  storageInfo: null,
  loading:     false,

  // ── Init — load from IndexedDB + purge expired ──────────────────────────
  init: async () => {
    set({ loading: true })
    try {
      await get().purgeExpired()
      const all = await db.downloads.toArray()
      set({ downloads: all })
    } catch (e) {
      console.error('[DL] init failed:', e)
    } finally {
      set({ loading: false })
    }
    get().refreshStorage()
  },

  // ── Start downloading a video ─────────────────────────────────────────────
  startDownload: async ({
    movieId, title, poster, type, season, episode, episodeName,
    streamUrl, quality = '720p',
  }) => {
    const existing = get().getDownload(movieId)
    if (existing?.status === 'downloading' || existing?.status === 'complete') return

    const controller = new AbortController()
    activeControllers.set(movieId, controller)

    const entry: DownloadItem = {
      movieId, title, poster, type, season, episode, episodeName, quality,
      status:      'queued',
      progress:    0,
      sizeBytes:   0,
      downloadedAt:Date.now(),
      expiresAt:   Date.now() + THIRTY_DAYS,
    }

    // Save initial record
    const dbId = await db.downloads.add(entry)
    const withId = { ...entry, id: dbId }

    set(s => ({
      downloads: [...s.downloads.filter(d => d.movieId !== movieId), withId]
    }))

    const updateProgress = (progress: number, sizeBytes = 0) => {
      set(s => ({
        downloads: s.downloads.map(d =>
          d.movieId === movieId
            ? { ...d, status: 'downloading', progress, sizeBytes }
            : d
        )
      }))
      db.downloads.update(dbId, { status: 'downloading', progress, sizeBytes })
    }

    try {
      updateProgress(0)

      // Fetch the video
      const response = await fetch(streamUrl, { signal: controller.signal })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)

      const contentLength = response.headers.get('content-length')
      const total = contentLength ? parseInt(contentLength, 10) : 0

      // Stream with progress tracking
      const reader  = response.body?.getReader()
      const chunks: Uint8Array[] = []
      let received  = 0

      if (!reader) throw new Error('No response body')

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
        received += value.length
        if (total > 0) updateProgress(Math.round(received / total * 90), received)
      }

      updateProgress(95, received)

      // Detect MIME type
      const ext = streamUrl.split('.').pop()?.toLowerCase()
      const mime = ext === 'mp4' ? 'video/mp4' : ext === 'm3u8' ? 'application/vnd.apple.mpegurl' : 'video/mp4'
      const blob = new Blob(chunks, { type: mime })

      // Save blob to DB
      await db.downloads.update(dbId, {
        status:      'complete',
        progress:    100,
        sizeBytes:   blob.size,
        blob,
        downloadedAt:Date.now(),
        expiresAt:   Date.now() + THIRTY_DAYS,
      })

      set(s => ({
        downloads: s.downloads.map(d =>
          d.movieId === movieId
            ? { ...d, status: 'complete', progress: 100, sizeBytes: blob.size, blob }
            : d
        )
      }))

    } catch (err: any) {
      if (err?.name === 'AbortError') {
        await db.downloads.delete(dbId)
        set(s => ({ downloads: s.downloads.filter(d => d.movieId !== movieId) }))
      } else {
        const msg = err?.message || 'Unknown error'
        await db.downloads.update(dbId, { status: 'error', errorMsg: msg })
        set(s => ({
          downloads: s.downloads.map(d =>
            d.movieId === movieId ? { ...d, status: 'error', errorMsg: msg } : d
          )
        }))
      }
    } finally {
      activeControllers.delete(movieId)
      get().refreshStorage()
    }
  },

  // ── Cancel in-progress download ────────────────────────────────────────────
  cancelDownload: async (movieId) => {
    activeControllers.get(movieId)?.abort()
    activeControllers.delete(movieId)
    const dl = get().getDownload(movieId)
    if (dl?.id) await db.downloads.delete(dl.id)
    set(s => ({ downloads: s.downloads.filter(d => d.movieId !== movieId) }))
  },

  // ── Delete a completed download ────────────────────────────────────────────
  deleteDownload: async (movieId) => {
    activeControllers.get(movieId)?.abort()
    const dl = get().getDownload(movieId)
    if (dl?.id) await db.downloads.delete(dl.id)
    set(s => ({ downloads: s.downloads.filter(d => d.movieId !== movieId) }))
    get().refreshStorage()
  },

  // ── Get the blob for offline playback ─────────────────────────────────────
  getBlob: async (movieId) => {
    const dl = await db.downloads.where('movieId').equals(movieId).first()
    if (!dl?.blob) return null
    // Mark as played → 48h expiry starts
    if (!dl.firstPlayedAt) {
      const newExpiry = Math.min(dl.expiresAt, Date.now() + FORTY_EIGHT_HOURS)
      if (dl.id) await db.downloads.update(dl.id, { firstPlayedAt: Date.now(), expiresAt: newExpiry })
    }
    return dl.blob
  },

  // ── Mark played ──────────────────────────────────────────────────────────
  markPlayed: async (movieId) => {
    const dl = get().getDownload(movieId)
    if (!dl?.id || dl.firstPlayedAt) return
    const newExpiry = Math.min(dl.expiresAt, Date.now() + FORTY_EIGHT_HOURS)
    await db.downloads.update(dl.id, { firstPlayedAt: Date.now(), expiresAt: newExpiry })
    set(s => ({
      downloads: s.downloads.map(d =>
        d.movieId === movieId
          ? { ...d, firstPlayedAt: Date.now(), expiresAt: newExpiry }
          : d
      )
    }))
  },

  // ── Check storage quota ────────────────────────────────────────────────────
  refreshStorage: async () => {
    try {
      if (!navigator.storage?.estimate) return
      const { usage = 0, quota = 0 } = await navigator.storage.estimate()
      set({ storageInfo: { used: usage, quota, percent: quota > 0 ? Math.round(usage / quota * 100) : 0 } })
    } catch { /* not supported */ }
  },

  // ── Purge expired downloads ─────────────────────────────────────────────
  purgeExpired: async () => {
    const expired = await db.downloads.where('expiresAt').below(Date.now()).toArray()
    for (const dl of expired) {
      if (dl.id) await db.downloads.delete(dl.id)
    }
    set(s => ({
      downloads: s.downloads.filter(d => d.expiresAt > Date.now())
    }))
  },

  // ── Helpers ───────────────────────────────────────────────────────────────
  isDownloaded: (movieId) =>
    get().downloads.some(d => d.movieId === movieId && d.status === 'complete'),

  getDownload: (movieId) =>
    get().downloads.find(d => d.movieId === movieId),
}))
