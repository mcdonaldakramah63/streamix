// frontend/src/pages/Downloads.tsx — NEW FILE
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDownloadStore } from '../stores/downloadStore'

function fmtBytes(b: number): string {
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(0)} MB`
  return `${(b / 1024 / 1024 / 1024).toFixed(1)} GB`
}

function fmtExpiry(ms: number): string {
  const left = ms - Date.now()
  if (left <= 0) return 'Expired'
  const d = Math.floor(left / 86_400_000)
  const h = Math.floor((left % 86_400_000) / 3_600_000)
  return d > 0 ? `${d}d ${h}h left` : `${h}h left`
}

const IMG = (p: string) => p ? `https://image.tmdb.org/t/p/w342${p}` : ''

const statusColor: Record<string, string> = {
  queued:      'text-slate-400',
  downloading: 'text-brand',
  complete:    'text-green-400',
  error:       'text-red-400',
  expired:     'text-slate-600',
}

const statusLabel: Record<string, string> = {
  queued:      '⏳ Queued',
  downloading: '⬇ Downloading',
  complete:    '✓ Ready',
  error:       '⚠ Failed',
  expired:     '💀 Expired',
}

export default function Downloads() {
  const navigate = useNavigate()
  const { downloads, storageInfo, init, deleteDownload, purgeExpired, getBlob } = useDownloadStore()

  useEffect(() => { init() }, [])

  const sorted = [...downloads].sort((a, b) => b.downloadedAt - a.downloadedAt)
  const complete   = sorted.filter(d => d.status === 'complete')
  const inProgress = sorted.filter(d => d.status === 'queued' || d.status === 'downloading')
  const failed     = sorted.filter(d => d.status === 'error')

  const playOffline = async (movieId: number, type: string, season?: number, episode?: number) => {
    const blob = await getBlob(movieId)
    if (!blob) return
    const url = URL.createObjectURL(blob)
    navigate(`/player/${type}/${movieId}?offline=${encodeURIComponent(url)}`)
  }

  return (
    <div className="min-h-screen pt-20 px-4 sm:px-6 max-w-4xl mx-auto pb-16">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-white" style={{ fontFamily:'Syne, sans-serif' }}>
            📥 Downloads
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">Watch offline • Expires after 30 days</p>
        </div>
        {downloads.some(d => d.status === 'expired') && (
          <button onClick={purgeExpired}
            className="text-xs text-slate-500 hover:text-white border border-dark-border px-3 py-1.5 rounded-lg transition-colors">
            Clear Expired
          </button>
        )}
      </div>

      {/* Storage bar */}
      {storageInfo && (
        <div className="card p-4 mb-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-white">Device Storage</p>
            <p className="text-xs text-slate-500">
              {fmtBytes(storageInfo.used)} / {fmtBytes(storageInfo.quota)} used
            </p>
          </div>
          <div className="h-2 rounded-full bg-dark-border overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${storageInfo.percent > 80 ? 'bg-red-500' : storageInfo.percent > 60 ? 'bg-yellow-500' : 'bg-brand'}`}
              style={{ width:`${Math.min(storageInfo.percent, 100)}%` }}
            />
          </div>
          <div className="flex justify-between mt-1.5">
            <span className="text-[10px] text-slate-600">{storageInfo.percent}% used</span>
            <span className="text-[10px] text-slate-600">Limit: {fmtBytes(storageInfo.quota)}</span>
          </div>

          {/* Warning */}
          {storageInfo.percent > 80 && (
            <div className="mt-3 flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
              <span className="text-red-400">⚠</span>
              <p className="text-xs text-red-400">Storage nearly full — delete some downloads to free space</p>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {downloads.length === 0 && (
        <div className="card p-12 text-center">
          <p className="text-4xl mb-3">📲</p>
          <p className="text-white font-semibold mb-1">No downloads yet</p>
          <p className="text-slate-500 text-sm mb-4">
            Download anime episodes for offline viewing.<br/>
            Look for the ⬇ button on the player page.
          </p>
          <button onClick={() => navigate('/anime')} className="btn-primary px-6 py-2 text-sm">
            Browse Anime
          </button>
        </div>
      )}

      {/* In-progress */}
      {inProgress.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-3">Downloading</h2>
          <div className="space-y-2">
            {inProgress.map(dl => (
              <div key={dl.movieId} className="card p-3 flex items-center gap-3">
                <div className="w-12 h-16 rounded-lg overflow-hidden bg-dark-card flex-shrink-0">
                  {dl.poster ? <img src={IMG(dl.poster)} alt="" className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center text-xl">🎬</div>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{dl.title}</p>
                  {dl.type === 'tv' && dl.season && <p className="text-xs text-slate-500">S{dl.season} E{dl.episode}</p>}
                  <div className="flex items-center gap-2 mt-1.5">
                    <div className="flex-1 h-1.5 bg-dark-border rounded-full overflow-hidden">
                      <div className="h-full bg-brand rounded-full transition-all" style={{ width:`${dl.progress}%` }}/>
                    </div>
                    <span className="text-[10px] text-brand font-bold tabular-nums">{dl.progress}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Complete */}
      {complete.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-3">
            Ready to watch ({complete.length})
          </h2>
          <div className="space-y-2">
            {complete.map(dl => (
              <div key={dl.movieId} className="card p-3 flex items-center gap-3">
                <div className="w-12 h-16 rounded-lg overflow-hidden bg-dark-card flex-shrink-0 relative">
                  {dl.poster
                    ? <img src={IMG(dl.poster)} alt="" className="w-full h-full object-cover"/>
                    : <div className="w-full h-full flex items-center justify-center text-xl">🎬</div>}
                  <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                    <div className="w-5 h-5 rounded-full bg-green-500/80 flex items-center justify-center">
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="white"><polyline points="20 6 9 17 4 12"/></svg>
                    </div>
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{dl.title}</p>
                  {dl.type === 'tv' && dl.season && (
                    <p className="text-xs text-slate-500">S{dl.season} E{dl.episode}{dl.episodeName ? ` · ${dl.episodeName}` : ''}</p>
                  )}
                  <div className="flex gap-3 mt-0.5">
                    <span className="text-[10px] text-slate-600">{fmtBytes(dl.sizeBytes)} · {dl.quality}</span>
                    <span className={`text-[10px] font-medium ${dl.expiresAt - Date.now() < 86_400_000 ? 'text-yellow-400' : 'text-slate-600'}`}>
                      {fmtExpiry(dl.expiresAt)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => playOffline(dl.movieId, dl.type, dl.season, dl.episode)}
                    className="w-9 h-9 rounded-xl bg-brand/15 text-brand flex items-center justify-center hover:bg-brand/25 transition-colors">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
                  </button>
                  <button onClick={() => deleteDownload(dl.movieId)}
                    className="w-9 h-9 rounded-xl text-slate-600 flex items-center justify-center hover:text-red-400 hover:bg-red-500/10 transition-colors">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Failed */}
      {failed.length > 0 && (
        <section>
          <h2 className="text-sm font-bold uppercase tracking-wider text-red-500/60 mb-3">Failed</h2>
          <div className="space-y-2">
            {failed.map(dl => (
              <div key={dl.movieId} className="card p-3 flex items-center gap-3 border-red-500/20">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{dl.title}</p>
                  <p className="text-xs text-red-400 mt-0.5">{dl.errorMsg || 'Download failed'}</p>
                </div>
                <button onClick={() => deleteDownload(dl.movieId)} className="text-slate-600 hover:text-red-400 transition-colors">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6 6 18M6 6l12 12"/>
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Info box */}
      <div className="mt-8 rounded-2xl p-4 border border-dark-border bg-dark-surface/50">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">About Offline Downloads</p>
        <ul className="space-y-1.5 text-xs text-slate-600">
          <li>✓ Works for anime streams (HLS) — look for ⬇ button on the player</li>
          <li>✓ Downloads stored securely in your browser's storage</li>
          <li>✓ Auto-expires 30 days after download</li>
          <li>✓ Expires 48 hours after you first start watching offline</li>
          <li>⚠ Movies/TV shows from embed sources cannot be downloaded</li>
          <li>⚠ Downloads are device-specific — not synced across devices</li>
        </ul>
      </div>
    </div>
  )
}
