// Saves a Streamix library file to this device (through the server, so any host works)
import { useState } from 'react'
import api, { errorMessage } from '../services/api'
import { useAuthStore } from '../context/authStore'
import Icon from './Icon'

const fmtBytes = (b?: number | null) =>
  !b ? '' : b < 1024 ** 3 ? `${Math.round(b / 1024 / 1024)} MB` : `${(b / 1024 ** 3).toFixed(1)} GB`

export default function LibraryDownloadButton({ id, sizeBytes, compact = false, className = '' }: {
  id: string; sizeBytes?: number | null; compact?: boolean; className?: string
}) {
  const user = useAuthStore(s => s.user)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const download = async () => {
    setBusy(true); setError('')
    try {
      const { data } = await api.post(`/library/${id}/download`)
      // Same-origin link with Content-Disposition: the browser's own download manager takes over
      const a = document.createElement('a')
      a.href = data.url
      a.rel = 'noopener'
      document.body.appendChild(a); a.click(); a.remove()
    } catch (e) {
      setError(errorMessage(e, 'Download failed'))
    } finally { setBusy(false) }
  }

  if (!user) return null
  const size = fmtBytes(sizeBytes)
  return (
    <span className={`relative inline-flex ${className}`}>
      <button onClick={download} disabled={busy} title={`Download to this device${size ? ` (${size})` : ''}`} aria-label="Download to this device"
        className={`h-10 rounded-full flex items-center justify-center gap-2 text-xs font-bold bg-dark-border text-ink hover:bg-dark-high hover:text-white transition-all disabled:opacity-50 ${compact ? 'w-10' : 'px-4'}`}>
        <Icon name={busy ? 'progress_activity' : 'download'} size={20} className={busy ? 'animate-spin' : ''} />
        {!compact && <span>Download{size ? ` · ${size}` : ''}</span>}
      </button>
      {error && <span role="alert" className="absolute top-full right-0 mt-2 w-60 rounded-xl px-3 py-2 text-xs bg-dark-card text-brand-soft shadow-deep z-50">{error}</span>}
    </span>
  )
}
