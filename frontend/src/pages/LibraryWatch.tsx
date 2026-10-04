// frontend/src/pages/LibraryWatch.tsx — plays a title from the server's own library
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api, { errorMessage } from '../services/api'
import HLSPlayer from '../components/HLSPlayer'
import Icon from '../components/Icon'
import LibraryDownloadButton from '../components/LibraryDownloadButton'

interface LibDetail {
  _id: string; title: string; year: string; overview: string; poster: string; backdrop: string
  format: 'mp4' | 'webm' | 'hls' | 'other'; playUrl: string; runtime: number | null
  license: string; licenseUrl: string; sourcePage: string; sizeBytes?: number | null
}

const LICENSE_LABEL: Record<string, string> = {
  'public-domain': 'Public domain', 'creative-commons': 'Creative Commons', 'own-content': 'Original content', licensed: 'Licensed',
}

export default function LibraryWatch() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [item,  setItem]  = useState<LibDetail | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    setItem(null); setError('')
    api.get(`/library/${id}`).then(r => setItem(r.data)).catch(e => setError(errorMessage(e, 'Not found')))
  }, [id])

  return (
    <div className="min-h-screen bg-dark-void flex flex-col">
      <header className="h-16 flex items-center gap-3 px-3 sm:px-5 bg-dark-void/95 border-b border-white/[0.05]">
        <button onClick={() => navigate(-1)} aria-label="Go back" className="btn-icon w-10 h-10"><Icon name="arrow_back" size={22} /></button>
        <p className="text-white font-bold truncate flex-1">{item?.title || ''}</p>
        {item && <span className="tech-pill text-cyan">{LICENSE_LABEL[item.license] || item.license}</span>}
        {item && item.format !== 'hls' && <LibraryDownloadButton id={item._id} sizeBytes={item.sizeBytes} compact />}
      </header>

      <div className="w-full max-w-[1600px] mx-auto">
        {error ? (
          <div className="aspect-video flex flex-col items-center justify-center gap-3 text-center px-6">
            <Icon name="error" size={40} className="text-brand" />
            <p className="text-white font-bold">{error}</p>
            <button onClick={() => navigate('/')} className="btn-secondary">Back home</button>
          </div>
        ) : !item ? (
          <div className="aspect-video bg-black flex items-center justify-center"><div className="w-10 h-10 border-2 border-white/10 border-t-brand rounded-full animate-spin" /></div>
        ) : (
          <HLSPlayer src={item.playUrl} isFile={item.format !== 'hls'} title={item.title} poster={item.backdrop || item.poster || undefined} />
        )}
      </div>

      {item && (
        <div className="w-full max-w-[1600px] mx-auto px-4 py-5 flex gap-5">
          {item.poster && <img src={item.poster} alt="" className="w-28 rounded-xl object-cover hidden sm:block self-start" />}
          <div className="min-w-0">
            <h1 className="text-2xl font-extrabold text-white">{item.title}</h1>
            <p className="text-sm text-ink-faint mt-1">{[item.year, item.runtime ? `${item.runtime} min` : ''].filter(Boolean).join(' • ')}</p>
            {item.overview && <p className="text-ink-muted text-sm mt-3 max-w-3xl leading-relaxed">{item.overview}</p>}
            <div className="flex flex-wrap gap-3 mt-4 text-xs">
              {item.licenseUrl && <a href={item.licenseUrl} target="_blank" rel="noopener noreferrer" className="text-cyan hover:underline">Licence terms ↗</a>}
              {item.sourcePage && <a href={item.sourcePage} target="_blank" rel="noopener noreferrer" className="text-ink-muted hover:text-white hover:underline">Source ↗</a>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
