import { useState } from 'react'
import axios from 'axios'

interface Torrent {
  quality: string
  type: string
  size: string
  seeders: number
  torrentUrl: string
  hash: string
}

interface Props {
  title: string
  imdbId?: string
  tmdbId: number
  type: 'movie' | 'tv'
  season?: number
  episode?: number
}

const QUALITY_ORDER = ['2160p', '1080p', '720p', '480p']

const Q_STYLE: Record<string, string> = {
  '2160p': 'border-purple-500/30 bg-purple-500/5 text-purple-300',
  '1080p': 'border-teal-500/30  bg-teal-500/5   text-teal-300',
  '720p':  'border-blue-500/30  bg-blue-500/5   text-blue-300',
  '480p':  'border-slate-500/30 bg-slate-500/5  text-slate-300',
}

function buildMagnet(hash: string, title: string) {
  const trackers = [
    'udp://open.demonii.com:1337/announce',
    'udp://tracker.openbittorrent.com:80',
    'udp://tracker.coppersurfer.tk:6969',
    'udp://tracker.opentrackr.org:1337/announce',
    'udp://p4p.arenabg.com:1337',
  ].map(t => `&tr=${encodeURIComponent(t)}`).join('')
  return `magnet:?xt=urn:btih:${hash}&dn=${encodeURIComponent(title)}${trackers}`
}

export default function DownloadLinks({ title, imdbId, tmdbId, type, season = 1, episode = 1 }: Props) {
  const [status,     setStatus]     = useState<'idle' | 'loading' | 'found' | 'notfound' | 'error'>('idle')
  const [torrents,   setTorrents]   = useState<Torrent[]>([])
  const [foundTitle, setFoundTitle] = useState('')
  const [dlState,    setDlState]    = useState<Record<string, 'downloading' | 'done'>>({})
  const [errMsg,     setErrMsg]     = useState('')

  const epStr = `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`

  const findLinks = async () => {
    setStatus('loading')
    setErrMsg('')
    try {
      const { data } = await axios.get('/api/download', {
        params: { imdbId, title, type, season, episode },
        timeout: 20000,
      })

      if (data.found && data.torrents?.length) {
        const sorted = [...data.torrents].sort((a, b) => {
          const ai = QUALITY_ORDER.indexOf(a.quality)
          const bi = QUALITY_ORDER.indexOf(b.quality)
          return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi)
        })
        setTorrents(sorted)
        setFoundTitle(data.title || title)
        setStatus('found')
      } else {
        setStatus('notfound')
      }
    } catch (err: any) {
      setErrMsg(err.response?.data?.message || err.message || 'Unknown error')
      setStatus('error')
    }
  }

  const downloadTorrent = async (t: Torrent) => {
    setDlState(p => ({ ...p, [t.quality]: 'downloading' }))
    try {
      const filename = `${foundTitle} [${t.quality}].torrent`
      const res = await axios.get('/api/download/file', {
        params: { url: t.torrentUrl, filename },
        responseType: 'blob',
        timeout: 20000,
      })
      const blob   = new Blob([res.data], { type: 'application/x-bittorrent' })
      const objUrl = URL.createObjectURL(blob)
      const a      = document.createElement('a')
      a.href       = objUrl
      a.download   = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(objUrl)
    } catch {
      window.open(t.torrentUrl, '_blank')
    } finally {
      setDlState(p => ({ ...p, [t.quality]: 'done' }))
    }
  }

  // ── IDLE ──
  if (status === 'idle') return (
    <div className="bg-dark-surface border border-dark-border rounded-xl p-5 text-center">
      <div className="text-3xl mb-2">⬇</div>
      <p className="text-sm font-semibold text-slate-300 mb-1">{title}</p>
      <p className="text-xs text-slate-500 mb-4">
        {type === 'tv' ? `Find episode ${epStr} downloads` : 'Find HD download links'}
      </p>
      <button onClick={findLinks} className="btn-primary px-8 py-2.5 text-sm">
        Find Download Links
      </button>
    </div>
  )

  // ── LOADING ──
  if (status === 'loading') return (
    <div className="bg-dark-surface border border-dark-border rounded-xl p-5 text-center">
      <div className="w-8 h-8 border-2 border-dark-border border-t-brand rounded-full animate-spin mx-auto mb-3" />
      <p className="text-sm text-slate-400">Trying YTS mirrors...</p>
      <p className="text-xs text-slate-600 mt-1">This may take a few seconds</p>
    </div>
  )

  // ── ERROR ──
  if (status === 'error') {
    const isNetworkErr = errMsg.includes('ENOTFOUND') || errMsg.includes('unreachable') || errMsg.includes('mirrors')
    const q  = encodeURIComponent(title)
    return (
      <div className="bg-dark-surface border border-dark-border rounded-xl p-5 space-y-3">
        <p className="text-sm text-red-400 font-semibold">
          {isNetworkErr ? 'YTS is blocked on this server' : 'Download search failed'}
        </p>
        {isNetworkErr ? (
          <>
            <p className="text-xs text-slate-500">
              Your server can't reach YTS. Search manually on these sites instead:
            </p>
            <div className="flex gap-2 flex-wrap">
              {[
                { n: 'YTS.mx',         u: `https://yts.mx/movies/${title.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'')}` },
                { n: '1337x',          u: `https://1337x.to/search/${q}/1/` },
                { n: 'Torrent Galaxy', u: `https://torrentgalaxy.to/torrents.php?search=${q}` },
              ].map(s => (
                <a key={s.n} href={s.u} target="_blank" rel="noopener noreferrer"
                  className="px-3 py-1.5 bg-dark-card border border-dark-border rounded-lg text-xs text-slate-400 hover:border-brand hover:text-brand transition-colors">
                  {s.n} ↗
                </a>
              ))}
            </div>
          </>
        ) : (
          <p className="text-xs text-slate-500 font-mono bg-dark-card rounded p-2 break-all">{errMsg}</p>
        )}
        <div className="flex gap-2">
          <button onClick={findLinks}               className="btn-primary text-xs px-4 py-2">Retry</button>
          <button onClick={() => setStatus('idle')} className="btn-ghost  text-xs px-4 py-2">Cancel</button>
        </div>
      </div>
    )
  }

  // ── NOT FOUND ──
  if (status === 'notfound') {
    const q  = encodeURIComponent(title)
    const ep = type === 'tv' ? `+${epStr}` : ''
    return (
      <div className="bg-dark-surface border border-dark-border rounded-xl p-5 space-y-3">
        <p className="text-sm font-semibold text-slate-300">Not found for "{title}"</p>
        <p className="text-xs text-slate-500">
          {type === 'tv' ? 'YTS only covers movies. Try these for TV episodes:' : 'Try searching manually:'}
        </p>
        <div className="flex gap-2 flex-wrap">
          {[
            { n: '1337x',          u: `https://1337x.to/search/${q}${ep}/1/` },
            { n: 'EZTV',           u: `https://eztv.re/search/${q}` },
            { n: 'Torrent Galaxy', u: `https://torrentgalaxy.to/torrents.php?search=${q}${ep}` },
          ].map(s => (
            <a key={s.n} href={s.u} target="_blank" rel="noopener noreferrer"
              className="px-3 py-1.5 bg-dark-card border border-dark-border rounded-lg text-xs text-slate-400 hover:border-brand hover:text-brand transition-colors">
              {s.n} ↗
            </a>
          ))}
        </div>
        <button onClick={() => setStatus('idle')} className="text-xs text-slate-600 hover:text-slate-400 transition-colors">← Back</button>
      </div>
    )
  }

  // ── FOUND ──
  return (
    <div className="bg-dark-surface border border-dark-border rounded-xl p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-sm font-bold text-white">{foundTitle}</p>
          <p className="text-xs text-slate-500 mt-0.5">{torrents.length} quality options · YTS</p>
        </div>
        <button onClick={() => { setStatus('idle'); setTorrents([]) }}
          className="text-slate-500 hover:text-white text-lg leading-none transition-colors">✕</button>
      </div>

      <div className="space-y-2 mb-4">
        {torrents.map(t => {
          const style = Q_STYLE[t.quality] || Q_STYLE['480p']
          const dl    = dlState[t.quality]
          return (
            <div key={t.quality} className={`flex items-center gap-3 p-3 rounded-xl border ${style}`}>
              <span className="text-xs font-black px-2.5 py-1 rounded-lg border border-current bg-black/20 flex-shrink-0">
                {t.quality}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-xs flex-wrap">
                  <span className="font-semibold uppercase opacity-80">{t.type}</span>
                  <span className="opacity-60">{t.size}</span>
                  <span className="opacity-40">↑ {t.seeders} seeds</span>
                </div>
              </div>
              <div className="flex gap-1.5 flex-shrink-0">
                <button
                  onClick={() => downloadTorrent(t)}
                  disabled={dl === 'downloading'}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand text-dark text-xs font-bold hover:bg-brand-dark disabled:opacity-60 transition-all min-w-[90px] justify-center"
                >
                  {dl === 'downloading' ? (
                    <><span className="w-3 h-3 border border-dark border-t-transparent rounded-full animate-spin" /> Saving...</>
                  ) : dl === 'done' ? '✓ Saved' : '⬇ Download'}
                </button>
                <button onClick={() => { window.location.href = buildMagnet(t.hash, foundTitle) }}
                  title="Open in qBittorrent"
                  className="px-2.5 py-1.5 rounded-lg bg-dark-card border border-current text-xs hover:opacity-80 transition-all">
                  🧲
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <div className="border-t border-dark-border pt-3 space-y-1">
        <p className="text-xs text-slate-600"><span className="text-slate-400 font-medium">⬇ Download</span> — saves .torrent file, open with qBittorrent to get the video</p>
        <p className="text-xs text-slate-600"><span className="text-slate-400 font-medium">🧲 Magnet</span> — opens qBittorrent / uTorrent directly</p>
      </div>
    </div>
  )
}
