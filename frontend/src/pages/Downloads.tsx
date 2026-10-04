// frontend/src/pages/Downloads.tsx — "Downloads Hub & Manager" (Stitch design)
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDownloadStore, DownloadItem } from '../stores/downloadStore'
import Icon from '../components/Icon'

function fmtBytes(b: number): string {
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  if (b < 1024 ** 3)   return `${(b / 1024 / 1024).toFixed(0)} MB`
  return `${(b / 1024 ** 3).toFixed(1)} GB`
}

function fmtExpiry(ms: number): string {
  const left = ms - Date.now()
  if (left <= 0) return 'Expired'
  const d = Math.floor(left / 86_400_000), h = Math.floor((left % 86_400_000) / 3_600_000)
  return d > 0 ? `${d}d ${h}h left` : `${h}h left`
}

const IMG = (p: string) => (p ? `https://image.tmdb.org/t/p/w185${p}` : '')

function Thumb({ dl }: { dl: DownloadItem }) {
  return (
    <div className="w-14 h-20 rounded-xl overflow-hidden bg-dark-void flex-shrink-0">
      {dl.poster ? <img src={IMG(dl.poster)} alt="" className="w-full h-full object-cover" />
        : <div className="w-full h-full flex items-center justify-center text-ink-faint"><Icon name="movie" size={22} /></div>}
    </div>
  )
}

const epLabel = (dl: DownloadItem) =>
  dl.type === 'tv' && dl.season != null ? `S${dl.season}:E${dl.episode}${dl.episodeName ? ` • ${dl.episodeName}` : ''}` : 'Movie'

export default function Downloads() {
  const navigate = useNavigate()
  const { downloads, storageInfo, init, deleteDownload, cancelDownload } = useDownloadStore()

  useEffect(() => { init() }, [init])

  const sorted     = [...downloads].sort((a, b) => b.downloadedAt - a.downloadedAt)
  const complete   = sorted.filter(d => d.status === 'complete')
  const inProgress = sorted.filter(d => d.status === 'queued' || d.status === 'downloading')
  const failed     = sorted.filter(d => d.status === 'error')

  const play = (dl: DownloadItem) => {
    const q = dl.type === 'tv' ? `season=${dl.season}&episode=${dl.episode}&` : ''
    navigate(`/player/${dl.type}/${dl.movieId}?${q}offline=${encodeURIComponent(dl.key)}`)
  }

  return (
    <div className="min-h-screen pt-24 px-4 sm:px-6 max-w-4xl mx-auto pb-16">
      <div className="mb-6">
        <h1 className="text-3xl font-extrabold text-white tracking-tight">Downloads</h1>
        <p className="text-ink-muted text-sm mt-1">Watch offline · expires 30 days after download, or 48 hours after first play</p>
      </div>

      {storageInfo && storageInfo.quota > 0 && (
        <div className="card p-4 mb-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-bold text-white flex items-center gap-2"><Icon name="storage" size={18} className="text-cyan" />Browser storage</p>
            <p className="text-xs text-ink-muted">{fmtBytes(storageInfo.used)} of {fmtBytes(storageInfo.quota)}</p>
          </div>
          <div className="h-1.5 rounded-full bg-dark-high overflow-hidden">
            <div className={`h-full rounded-full ${storageInfo.percent > 80 ? 'bg-brand shadow-brand-sm' : 'bg-cyan shadow-cyan'}`}
              style={{ width: `${Math.max(1, Math.min(storageInfo.percent, 100))}%` }} />
          </div>
          {storageInfo.percent > 80 && (
            <p className="text-xs text-brand-soft mt-2 font-semibold">Storage is nearly full — delete some downloads to make room.</p>
          )}
        </div>
      )}

      {downloads.length === 0 && (
        <div className="card p-10 text-center">
          <div className="w-16 h-16 rounded-full bg-cyan/10 text-cyan flex items-center justify-center mx-auto mb-4"><Icon name="download_for_offline" size={34} /></div>
          <p className="text-white font-bold mb-1">No downloads yet</p>
          <p className="text-ink-muted text-sm mb-5 max-w-sm mx-auto">
            Anime episodes that play as a direct stream (marked <span className="text-brand-soft font-bold">HLS</span> in the player) can be downloaded with the <Icon name="download" size={14} /> button.
          </p>
          <button onClick={() => navigate('/anime')} className="btn-primary">Browse anime</button>
        </div>
      )}

      {inProgress.length > 0 && (
        <section className="mb-8">
          <h2 className="text-label-sm uppercase text-ink-faint mb-3">Downloading</h2>
          <div className="space-y-2.5">
            {inProgress.map(dl => (
              <div key={dl.key} className="card p-3 flex items-center gap-3">
                <Thumb dl={dl} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white truncate">{dl.title}</p>
                  <p className="text-xs text-ink-faint truncate">{epLabel(dl)}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <div className="flex-1 h-1.5 bg-dark-high rounded-full overflow-hidden">
                      <div className="h-full bg-cyan rounded-full shadow-cyan transition-all" style={{ width: `${dl.progress}%` }} />
                    </div>
                    <span className="text-tech-pill text-cyan tabular-nums">{dl.progress}%</span>
                  </div>
                </div>
                <button onClick={() => cancelDownload(dl.key)} aria-label={`Cancel ${dl.title}`} className="btn-icon w-10 h-10"><Icon name="close" size={20} /></button>
              </div>
            ))}
          </div>
        </section>
      )}

      {complete.length > 0 && (
        <section className="mb-8">
          <h2 className="text-label-sm uppercase text-ink-faint mb-3">Ready to watch · {complete.length}</h2>
          <div className="space-y-2.5">
            {complete.map(dl => (
              <div key={dl.key} className="card p-3 flex items-center gap-3">
                <Thumb dl={dl} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white truncate">{dl.title}</p>
                  <p className="text-xs text-ink-faint truncate">{epLabel(dl)}</p>
                  <div className="flex gap-2 mt-1.5 flex-wrap">
                    <span className="tech-pill">{fmtBytes(dl.sizeBytes)}</span>
                    <span className="tech-pill text-cyan">{dl.quality}</span>
                    <span className={`tech-pill ${dl.expiresAt - Date.now() < 86_400_000 ? 'text-gold' : 'text-ink-muted'}`}>{fmtExpiry(dl.expiresAt)}</span>
                  </div>
                </div>
                <button onClick={() => play(dl)} aria-label={`Play ${dl.title}`} className="w-11 h-11 rounded-full bg-brand text-white flex items-center justify-center shadow-brand-sm hover:scale-105 transition-transform">
                  <Icon name="play_arrow" size={24} fill />
                </button>
                <button onClick={() => deleteDownload(dl.key)} aria-label={`Delete ${dl.title}`} className="w-10 h-10 rounded-full flex items-center justify-center text-ink-faint hover:text-brand-soft hover:bg-brand/10">
                  <Icon name="delete" size={20} />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {failed.length > 0 && (
        <section className="mb-8">
          <h2 className="text-label-sm uppercase text-brand-soft mb-3">Failed</h2>
          <div className="space-y-2.5">
            {failed.map(dl => (
              <div key={dl.key} className="card p-3 flex items-center gap-3">
                <Thumb dl={dl} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white truncate">{dl.title}</p>
                  <p className="text-xs text-brand-soft mt-0.5">{dl.errorMsg || 'Download failed'}</p>
                </div>
                <button onClick={() => navigate(`/player/${dl.type}/${dl.movieId}${dl.type === 'tv' ? `?season=${dl.season}&episode=${dl.episode}` : ''}`)}
                  className="btn-secondary px-4 py-2 text-xs">Open</button>
                <button onClick={() => deleteDownload(dl.key)} aria-label={`Remove ${dl.title}`} className="w-10 h-10 rounded-full flex items-center justify-center text-ink-faint hover:text-brand-soft">
                  <Icon name="close" size={20} />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
