// frontend/src/stores/downloadStore.ts — offline downloads in IndexedDB (Dexie)
// HLS streams: every segment (+ encryption keys / init segments) is stored, and a local
// playlist pointing at blob: URLs is rebuilt at playback time. Direct MP4s are stored whole.
// Embed/iframe sources can't be downloaded.
import Dexie, { Table } from 'dexie'
import { create } from 'zustand'

export type DownloadStatus = 'queued' | 'downloading' | 'complete' | 'error'
export type Quality = '480p' | '720p' | '1080p'

export interface DownloadItem {
  id?:            number
  key:            string            // movie: "123", episode: "123-s1e2"
  movieId:        number
  title:          string
  poster:         string
  type:           'movie' | 'tv'
  season?:        number
  episode?:       number
  episodeName?:   string
  quality:        Quality
  format?:        'hls' | 'mp4'
  playlist?:      string            // media playlist with __PART_n__ placeholders
  status:         DownloadStatus
  progress:       number            // 0-100
  sizeBytes:      number
  downloadedAt:   number
  expiresAt:      number
  firstPlayedAt?: number
  errorMsg?:      string
}

interface Part { id?: number; downloadKey: string; index: number; blob: Blob }

export interface StorageInfo { used: number; quota: number; percent: number }

export interface StartDownloadParams {
  movieId:      number
  title:        string
  poster:       string
  type:         'movie' | 'tv'
  season?:      number
  episode?:     number
  episodeName?: string
  streamUrl:    string   // HLS playlist (proxied) or direct MP4
  quality?:     Quality
}

export interface Playback { url: string; format: 'hls' | 'mp4'; item: DownloadItem; release: () => void }

class StreamixDB extends Dexie {
  downloads!: Table<DownloadItem, number>
  parts!:     Table<Part, number>
  constructor() {
    super('StreamixOffline')
    this.version(1).stores({ downloads: '++id, movieId, status, expiresAt, downloadedAt' })
    // v2: per-episode keys + segment storage. v1 records only held a playlist file, so drop them.
    this.version(2).stores({
      downloads: '++id, &key, movieId, status, expiresAt, downloadedAt',
      parts:     '++id, downloadKey, [downloadKey+index]',
    }).upgrade(tx => tx.table('downloads').clear())
  }
}
const db = new StreamixDB()

export const downloadKey = (movieId: number, season?: number, episode?: number) =>
  season != null && episode != null ? `${movieId}-s${season}e${episode}` : String(movieId)

const THIRTY_DAYS       = 30 * 24 * 60 * 60 * 1000
const FORTY_EIGHT_HOURS = 48 * 60 * 60 * 1000
const CONCURRENCY       = 4
const controllers = new Map<string, AbortController>()

// ── HLS helpers ───────────────────────────────────────────────────────────────
const absolute = (ref: string, base: string) => new URL(ref, new URL(base, window.location.href)).toString()

async function fetchText(url: string, signal: AbortSignal) {
  const r = await fetch(url, { signal })
  if (!r.ok) throw new Error(`Playlist HTTP ${r.status}`)
  return r.text()
}

async function fetchBlob(url: string, signal: AbortSignal) {
  const r = await fetch(url, { signal })
  if (!r.ok) throw new Error(`Segment HTTP ${r.status}`)
  return r.blob()
}

/** Picks the variant closest to (but not above) the wanted height from a master playlist */
function pickVariant(master: string, base: string, quality: Quality): string {
  const want = parseInt(quality)
  const lines = master.split(/\r?\n/)
  const variants: { height: number; bw: number; url: string }[] = []
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith('#EXT-X-STREAM-INF')) continue
    const height = Number(/RESOLUTION=\d+x(\d+)/.exec(lines[i])?.[1] || 0)
    const bw     = Number(/BANDWIDTH=(\d+)/.exec(lines[i])?.[1] || 0)
    const uri = lines.slice(i + 1).find(l => l.trim() && !l.startsWith('#'))
    if (uri) variants.push({ height, bw, url: absolute(uri.trim(), base) })
  }
  if (!variants.length) throw new Error('No variants in playlist')
  const fit = variants.filter(v => !v.height || v.height <= want).sort((a, b) => b.height - a.height || b.bw - a.bw)
  return (fit[0] || variants.sort((a, b) => a.height - b.height)[0]).url
}

// ── Store ─────────────────────────────────────────────────────────────────────
interface DownloadState {
  downloads:   DownloadItem[]
  storageInfo: StorageInfo | null
  loading:     boolean
  init:           () => Promise<void>
  startDownload:  (p: StartDownloadParams) => Promise<void>
  cancelDownload: (key: string) => Promise<void>
  deleteDownload: (key: string) => Promise<void>
  getPlayback:    (key: string) => Promise<Playback | null>
  refreshStorage: () => Promise<void>
  purgeExpired:   () => Promise<void>
  getDownload:    (key: string) => DownloadItem | undefined
}

async function removeRecord(key: string) {
  await db.transaction('rw', db.downloads, db.parts, async () => {
    await db.parts.where('downloadKey').equals(key).delete()
    await db.downloads.where('key').equals(key).delete()
  })
}

let initPromise: Promise<void> | null = null

export const useDownloadStore = create<DownloadState>((set, get) => {
  const patch = (key: string, changes: Partial<DownloadItem>) => {
    set(s => ({ downloads: s.downloads.map(d => (d.key === key ? { ...d, ...changes } : d)) }))
    db.downloads.where('key').equals(key).modify(changes).catch(() => {})
  }

  return {
    downloads:   [],
    storageInfo: null,
    loading:     false,

    init: () => {
      if (!initPromise) {
        initPromise = (async () => {
          set({ loading: true })
          try {
            await get().purgeExpired()
            const all = await db.downloads.toArray()
            // Anything still "downloading" was interrupted by a page reload
            for (const d of all) {
              if (d.status === 'downloading' || d.status === 'queued') {
                d.status = 'error'; d.errorMsg = 'Interrupted — retry'
                await db.downloads.update(d.id!, { status: 'error', errorMsg: d.errorMsg })
              }
            }
            set({ downloads: all })
          } catch (e) {
            console.error('[DL] init failed:', e)
          } finally {
            set({ loading: false })
          }
          get().refreshStorage()
        })()
      }
      return initPromise
    },

    startDownload: async (p) => {
      await get().init()
      const key = downloadKey(p.movieId, p.type === 'tv' ? p.season : undefined, p.type === 'tv' ? p.episode : undefined)
      const existing = get().getDownload(key)
      if (existing?.status === 'downloading' || existing?.status === 'complete') return
      if (existing) await removeRecord(key)

      const controller = new AbortController()
      controllers.set(key, controller)
      const { signal } = controller

      const entry: DownloadItem = {
        key, movieId: p.movieId, title: p.title, poster: p.poster, type: p.type,
        season: p.season, episode: p.episode, episodeName: p.episodeName,
        quality: p.quality || '720p', status: 'downloading', progress: 0, sizeBytes: 0,
        downloadedAt: Date.now(), expiresAt: Date.now() + THIRTY_DAYS,
      }
      entry.id = await db.downloads.add(entry)
      set(s => ({ downloads: [...s.downloads.filter(d => d.key !== key), entry] }))

      try {
        const head = await fetch(p.streamUrl, { signal })
        if (!head.ok) throw new Error(`HTTP ${head.status}`)
        const ct = head.headers.get('content-type') || ''
        const isHls = ct.includes('mpegurl') || /\.m3u8(\?|$)/i.test(p.streamUrl) || p.streamUrl.includes('%2Em3u8') || p.streamUrl.includes('.m3u8')

        if (!isHls) {
          // Direct file
          const blob = await head.blob()
          await db.parts.add({ downloadKey: key, index: 0, blob })
          patch(key, { status: 'complete', progress: 100, sizeBytes: blob.size, format: 'mp4' })
          return
        }

        // Resolve master → media playlist
        let playlistUrl = p.streamUrl
        let text = await head.text()
        if (text.includes('#EXT-X-STREAM-INF')) {
          playlistUrl = pickVariant(text, p.streamUrl, entry.quality)
          text = await fetchText(playlistUrl, signal)
        }

        // Collect every resource the playlist references and swap them for placeholders
        const urls: string[] = []
        const lines = text.split(/\r?\n/).map(line => {
          const t = line.trim()
          if (!t) return line
          if (t.startsWith('#')) {
            return line.replace(/URI="([^"]+)"/g, (_m, uri) => {
              urls.push(absolute(uri, playlistUrl))
              return `URI="__PART_${urls.length - 1}__"`
            })
          }
          urls.push(absolute(t, playlistUrl))
          return `__PART_${urls.length - 1}__`
        })
        if (!urls.length) throw new Error('Empty playlist')

        let done = 0, bytes = 0, next = 0
        const worker = async () => {
          while (next < urls.length) {
            const index = next++
            const blob = await fetchBlob(urls[index], signal)
            await db.parts.add({ downloadKey: key, index, blob })
            done++; bytes += blob.size
            if (done % 3 === 0 || done === urls.length) {
              patch(key, { progress: Math.min(99, Math.round(done / urls.length * 100)), sizeBytes: bytes })
            }
          }
        }
        await Promise.all(Array.from({ length: Math.min(CONCURRENCY, urls.length) }, worker))

        patch(key, { status: 'complete', progress: 100, sizeBytes: bytes, format: 'hls', playlist: lines.join('\n') })
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          await removeRecord(key)
          set(s => ({ downloads: s.downloads.filter(d => d.key !== key) }))
        } else {
          await db.parts.where('downloadKey').equals(key).delete()
          patch(key, { status: 'error', errorMsg: err?.message || 'Download failed', progress: 0 })
        }
      } finally {
        controllers.delete(key)
        get().refreshStorage()
      }
    },

    cancelDownload: async (key) => {
      controllers.get(key)?.abort()
      controllers.delete(key)
      await removeRecord(key)
      set(s => ({ downloads: s.downloads.filter(d => d.key !== key) }))
    },

    deleteDownload: async (key) => {
      controllers.get(key)?.abort()
      await removeRecord(key)
      set(s => ({ downloads: s.downloads.filter(d => d.key !== key) }))
      get().refreshStorage()
    },

    getPlayback: async (key) => {
      await get().init()
      const item = await db.downloads.where('key').equals(key).first()
      if (!item || item.status !== 'complete') return null

      // First offline play starts the 48-hour expiry window
      if (!item.firstPlayedAt) {
        const changes = { firstPlayedAt: Date.now(), expiresAt: Math.min(item.expiresAt, Date.now() + FORTY_EIGHT_HOURS) }
        await db.downloads.update(item.id!, changes)
        Object.assign(item, changes)
        set(s => ({ downloads: s.downloads.map(d => (d.key === key ? { ...d, ...changes } : d)) }))
      }

      const parts = await db.parts.where('downloadKey').equals(key).sortBy('index')
      const objectUrls = parts.map(pt => URL.createObjectURL(pt.blob))
      const release = () => objectUrls.forEach(u => URL.revokeObjectURL(u))

      if (item.format !== 'hls') {
        if (!objectUrls[0]) return null
        return { url: objectUrls[0], format: 'mp4', item, release }
      }

      const byIndex = new Map(parts.map((pt, i) => [pt.index, objectUrls[i]]))
      const playlist = (item.playlist || '').replace(/__PART_(\d+)__/g, (_m, n) => byIndex.get(Number(n)) || '')
      const playlistUrl = URL.createObjectURL(new Blob([playlist], { type: 'application/vnd.apple.mpegurl' }))
      return {
        url: playlistUrl, format: 'hls', item,
        release: () => { release(); URL.revokeObjectURL(playlistUrl) },
      }
    },

    refreshStorage: async () => {
      try {
        if (!navigator.storage?.estimate) return
        const { usage = 0, quota = 0 } = await navigator.storage.estimate()
        set({ storageInfo: { used: usage, quota, percent: quota > 0 ? Math.round(usage / quota * 100) : 0 } })
      } catch { /* not supported */ }
    },

    purgeExpired: async () => {
      const expired = await db.downloads.where('expiresAt').below(Date.now()).toArray()
      for (const d of expired) await removeRecord(d.key)
      if (expired.length) set(s => ({ downloads: s.downloads.filter(d => d.expiresAt > Date.now()) }))
    },

    getDownload: (key) => get().downloads.find(d => d.key === key),
  }
})
