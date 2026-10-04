// Site-wide banners posted by admins; each viewer can dismiss them
import { useEffect, useState } from 'react'
import api from '../services/api'
import Icon from './Icon'
import { TONES } from './admin/Announcements'

interface Ann { _id: string; message: string; tone: keyof typeof TONES }

const KEY = 'streamix_dismissed_announcements'
const readDismissed = (): string[] => { try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] } }

export default function AnnouncementBanner() {
  const [items,     setItems]     = useState<Ann[]>([])
  const [dismissed, setDismissed] = useState<string[]>(readDismissed)

  useEffect(() => {
    const load = () => api.get('/announcements').then(r => setItems(r.data)).catch(() => {})
    load()
    const t = setInterval(load, 5 * 60 * 1000)
    return () => clearInterval(t)
  }, [])

  const visible = items.filter(a => !dismissed.includes(a._id))
  if (!visible.length) return null

  const dismiss = (id: string) => {
    const next = [...dismissed, id].slice(-50)
    setDismissed(next)
    try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* storage unavailable */ }
  }

  return (
    <div className="fixed top-16 inset-x-0 z-40 px-3 sm:px-6 lg:px-12 pt-2 space-y-2 pointer-events-none">
      {visible.map(a => (
        <div key={a._id} role="status"
          className={`pointer-events-auto max-w-[1800px] mx-auto flex items-center gap-2.5 rounded-xl border px-4 py-2.5 text-sm backdrop-blur-xl shadow-deep animate-slide-down ${TONES[a.tone]?.cls || TONES.info.cls}`}
          style={{ backgroundColor: 'rgba(15,19,28,0.88)' }}>
          <Icon name={TONES[a.tone]?.icon || 'campaign'} size={18} />
          <span className="flex-1">{a.message}</span>
          <button onClick={() => dismiss(a._id)} aria-label="Dismiss announcement" className="opacity-70 hover:opacity-100"><Icon name="close" size={18} /></button>
        </div>
      ))}
    </div>
  )
}
