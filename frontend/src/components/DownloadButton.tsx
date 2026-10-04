// frontend/src/components/DownloadButton.tsx — download an HLS stream for offline viewing
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDownloadStore, StartDownloadParams, downloadKey } from '../stores/downloadStore'
import Icon from './Icon'

function fmtBytes(b: number): string {
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  if (b < 1024 ** 3)   return `${(b / 1024 / 1024).toFixed(0)} MB`
  return `${(b / 1024 ** 3).toFixed(1)} GB`
}

export default function DownloadButton({ params, compact = false }: { params: StartDownloadParams; compact?: boolean }) {
  const navigate = useNavigate()
  const { init, startDownload, cancelDownload, deleteDownload } = useDownloadStore()
  const key = downloadKey(params.movieId, params.type === 'tv' ? params.season : undefined, params.type === 'tv' ? params.episode : undefined)
  const dl  = useDownloadStore(s => s.downloads.find(d => d.key === key))
  const [menu, setMenu] = useState(false)

  useEffect(() => { init() }, [init])

  const base = `h-10 rounded-full flex items-center gap-2 text-xs font-bold transition-all ${compact ? 'w-10 justify-center' : 'px-4'}`

  if (dl?.status === 'downloading' || dl?.status === 'queued') {
    const r = 7, c = 2 * Math.PI * r
    return (
      <button onClick={() => cancelDownload(key)} title="Downloading — click to cancel" aria-label={`Downloading ${dl.progress}%, click to cancel`}
        className={`${base} bg-cyan/10 text-cyan hover:bg-brand/15 hover:text-brand-soft group`}>
        <svg className="w-5 h-5 -rotate-90" viewBox="0 0 18 18" style={{ filter: 'drop-shadow(0 0 4px #06b6d4)' }}>
          <circle cx="9" cy="9" r={r} fill="none" stroke="currentColor" strokeWidth="2" opacity="0.2" />
          <circle cx="9" cy="9" r={r} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={c * (1 - dl.progress / 100)} className="transition-all duration-300" />
        </svg>
        {!compact && <span>{dl.progress}%</span>}
      </button>
    )
  }

  if (dl?.status === 'complete') {
    return (
      <div className="relative">
        <button onClick={() => setMenu(m => !m)} aria-label="Downloaded — options" aria-expanded={menu}
          className={`${base} bg-cyan/10 text-cyan`}>
          <Icon name="download_done" size={20} />{!compact && fmtBytes(dl.sizeBytes)}
        </button>
        {menu && (
          <div className="absolute top-full right-0 mt-2 w-52 glass rounded-2xl overflow-hidden shadow-deep z-50 animate-slide-down">
            <p className="px-4 pt-3 pb-2 text-xs text-ink-muted">{fmtBytes(dl.sizeBytes)} · {dl.quality}</p>
            <button onClick={() => navigate('/downloads')} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-ink hover:bg-white/[0.06]">
              <Icon name="download_for_offline" size={18} /> Open Downloads
            </button>
            <button onClick={() => { deleteDownload(key); setMenu(false) }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-brand-soft hover:bg-white/[0.06]">
              <Icon name="delete" size={18} /> Delete download
            </button>
          </div>
        )}
      </div>
    )
  }

  if (dl?.status === 'error') {
    return (
      <button onClick={() => startDownload(params)} title={dl.errorMsg || 'Download failed — retry'} aria-label="Download failed, retry"
        className={`${base} bg-brand/15 text-brand-soft hover:bg-brand/25`}>
        <Icon name="refresh" size={20} />{!compact && 'Retry'}
      </button>
    )
  }

  if (!params.streamUrl) return null
  return (
    <button onClick={() => startDownload(params)} title="Download for offline viewing" aria-label="Download for offline viewing"
      className={`${base} bg-dark-border text-ink hover:text-cyan hover:bg-cyan/10`}>
      <Icon name="download" size={20} />{!compact && 'Download'}
    </button>
  )
}
