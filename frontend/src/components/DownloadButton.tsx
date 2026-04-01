// frontend/src/components/DownloadButton.tsx — NEW FILE
// Smart download button for HLS anime streams / direct video URLs
// Shows: Download / Downloading (with %) / Downloaded / Expired
import { useEffect, useState } from 'react'
import { useDownloadStore, StartDownloadParams } from '../stores/downloadStore'

interface Props {
  params:   StartDownloadParams
  compact?: boolean           // icon-only mode
  onOfflinePlay?: () => void  // called when user wants to play offline copy
}

function fmtBytes(b: number): string {
  if (b < 1024)             return `${b} B`
  if (b < 1024 * 1024)     return `${(b / 1024).toFixed(1)} KB`
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(0)} MB`
  return `${(b / 1024 / 1024 / 1024).toFixed(1)} GB`
}

function fmtExpiry(ms: number): string {
  const left = ms - Date.now()
  if (left <= 0)            return 'Expired'
  const days  = Math.floor(left / 86_400_000)
  const hours = Math.floor((left % 86_400_000) / 3_600_000)
  if (days > 0)             return `${days}d left`
  return `${hours}h left`
}

export default function DownloadButton({ params, compact = false, onOfflinePlay }: Props) {
  const { startDownload, cancelDownload, deleteDownload, getDownload, isDownloaded, init } =
    useDownloadStore()

  const [initialized, setInitialized] = useState(false)
  const [showMenu,    setShowMenu]    = useState(false)

  useEffect(() => {
    init().then(() => setInitialized(true))
  }, [])

  if (!initialized) return null

  const dl = getDownload(params.movieId)
  const status = dl?.status

  // ── Queued / Downloading ─────────────────────────────────────────────────
  if (status === 'queued' || status === 'downloading') {
    return (
      <button
        onClick={() => cancelDownload(params.movieId)}
        className={`flex items-center gap-2 ${compact ? 'px-2 py-2' : 'px-4 py-2'} rounded-xl border border-brand/40 bg-brand/10 text-brand text-xs font-semibold transition-all hover:bg-red-500/10 hover:border-red-500/40 hover:text-red-400 group`}
        title="Click to cancel"
      >
        {/* Circular progress */}
        <div className="relative w-4 h-4 flex-shrink-0">
          <svg className="w-4 h-4 -rotate-90" viewBox="0 0 16 16">
            <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.2"/>
            <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2"
              strokeDasharray={`${2 * Math.PI * 6}`}
              strokeDashoffset={`${2 * Math.PI * 6 * (1 - (dl?.progress || 0) / 100)}`}
              className="transition-all duration-300"
            />
          </svg>
        </div>
        {!compact && (
          <span className="group-hover:hidden">{dl?.progress ?? 0}%</span>
        )}
        {!compact && <span className="hidden group-hover:inline text-red-400">Cancel</span>}
      </button>
    )
  }

  // ── Complete ─────────────────────────────────────────────────────────────
  if (status === 'complete') {
    const expiry = dl?.expiresAt || 0

    return (
      <div className="relative">
        <button
          onClick={() => setShowMenu(m => !m)}
          className={`flex items-center gap-2 ${compact ? 'px-2 py-2' : 'px-4 py-2'} rounded-xl border border-green-500/40 bg-green-500/10 text-green-400 text-xs font-semibold transition-all hover:bg-green-500/20`}
          title="Downloaded — click for options"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
          {!compact && (
            <span>{fmtBytes(dl?.sizeBytes || 0)} · {fmtExpiry(expiry)}</span>
          )}
        </button>

        {showMenu && (
          <div
            className="absolute bottom-full right-0 mb-2 rounded-xl overflow-hidden shadow-deep z-50"
            style={{ background:'rgba(7,8,12,0.97)', border:'1px solid rgba(255,255,255,0.08)', minWidth:180 }}
          >
            {onOfflinePlay && (
              <button
                onClick={() => { onOfflinePlay(); setShowMenu(false) }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs text-white hover:bg-dark-hover transition-colors text-left"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
                Play Offline
              </button>
            )}
            <div className="border-t border-dark-border"/>
            <div className="px-3 py-2">
              <p className="text-[10px] text-slate-600 font-bold uppercase tracking-wider mb-1">Storage</p>
              <p className="text-[11px] text-slate-400">{fmtBytes(dl?.sizeBytes || 0)} · {dl?.quality}</p>
              <p className="text-[10px] text-slate-600 mt-0.5">Expires {fmtExpiry(expiry)}</p>
            </div>
            <div className="border-t border-dark-border"/>
            <button
              onClick={() => { deleteDownload(params.movieId); setShowMenu(false) }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs text-red-400 hover:bg-dark-hover transition-colors text-left"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                <path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
              </svg>
              Delete Download
            </button>
          </div>
        )}
      </div>
    )
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (status === 'error') {
    return (
      <button
        onClick={() => startDownload(params)}
        className={`flex items-center gap-2 ${compact ? 'px-2 py-2' : 'px-4 py-2'} rounded-xl border border-red-500/40 bg-red-500/10 text-red-400 text-xs font-semibold hover:bg-red-500/20 transition-all`}
        title={dl?.errorMsg || 'Download failed — click to retry'}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        {!compact && 'Retry'}
      </button>
    )
  }

  // ── Default: not downloaded ───────────────────────────────────────────────
  if (!params.streamUrl) return null  // can't download iframes

  return (
    <button
      onClick={() => startDownload(params)}
      className={`flex items-center gap-2 ${compact ? 'px-2 py-2' : 'px-4 py-2'} rounded-xl border border-dark-border text-slate-400 hover:border-brand/50 hover:text-brand hover:bg-brand/5 text-xs font-semibold transition-all active:scale-95`}
      title="Download for offline viewing"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
      {!compact && 'Download'}
    </button>
  )
}
