// Navbar bell: new episodes, reminders, new on Streamix, security alerts, announcements.
// Opening an item tells the server (it learns which kinds of notification each person cares about), new items
// arrive live over the socket, and a push tapped on the phone ("?inbox=1") opens this panel.
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import { onWsMessage } from '../hooks/useWebSocket'
import Icon from './Icon'

interface Item {
  _id: string; kind: string; title: string; body: string; url: string; image: string; createdAt: string
  unread: boolean; priority?: string; count?: number
}

const ICON: Record<string, string> = {
  episode: 'live_tv', reminder: 'notifications_active', library: 'video_library', weekly: 'auto_awesome',
  announcement: 'campaign', security: 'shield_person', digest: 'inbox',
}

function ago(d: string) {
  const s = Math.max(1, Math.round((Date.now() - new Date(d).getTime()) / 1000))
  if (s < 60) return 'now'
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  return `${Math.round(s / 86400)}d ago`
}

/** Tell the server a notification was opened (once is enough; failures don't matter) */
export function markOpened(id: string) {
  if (/^[a-f0-9]{24}$/i.test(id)) api.post(`/inbox/${id}/open`).catch(() => {})
}

export default function NotificationBell() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Item[] | null>(null)
  const [unread, setUnread] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  const load = () => api.get('/inbox').then(r => { setItems(r.data.items); setUnread(r.data.unread) }).catch(() => {})
  useEffect(() => {
    load()
    const t = setInterval(() => { if (document.visibilityState === 'visible') load() }, 5 * 60 * 1000)
    const vis = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', vis)
    // Something new for us right now (the server sends it when the push goes out)
    const off = onWsMessage((m: any) => { if (m?.type === 'NOTIFICATION') load() })
    // "3 updates from Streamix" push → open the panel
    const show = () => { setOpen(true); load() }
    window.addEventListener('streamix:open-inbox', show)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis); off(); window.removeEventListener('streamix:open-inbox', show) }
  }, [])

  useEffect(() => {
    if (!open) return
    const fn = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', fn); document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', fn); document.removeEventListener('keydown', key) }
  }, [open])

  const markAllRead = () => {
    api.post('/inbox/seen').catch(() => {})
    setUnread(0)
    setItems(list => list?.map(i => ({ ...i, unread: false })) || list)
  }

  const toggle = () => {
    const next = !open
    setOpen(next)
    // Seeing the list clears the badge; the dots stay until each item is opened
    if (next && unread) { api.post('/inbox/seen').catch(() => {}); setUnread(0) }
  }

  const openItem = (n: Item) => {
    markOpened(n._id)
    setItems(list => list?.map(i => (i._id === n._id ? { ...i, unread: false } : i)) || list)
    setOpen(false)
    navigate(n.url || '/')
  }

  const hasUnreadDots = !!items?.some(i => i.unread)

  return (
    <div ref={ref} className="relative">
      <button onClick={toggle} aria-label={unread ? `Notifications, ${unread} new` : 'Notifications'} aria-expanded={open}
        className="relative w-11 h-11 flex items-center justify-center rounded-full text-ink-muted hover:text-white hover:bg-white/[0.06]">
        <Icon name="notifications" size={22} fill={open} />
        {unread > 0 && (
          <span className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-brand text-white text-[10px] font-black flex items-center justify-center">{unread > 9 ? '9+' : unread}</span>
        )}
      </button>
      {open && (
        <div className="fixed sm:absolute left-2 right-2 sm:left-auto sm:right-0 top-16 sm:top-auto sm:mt-2 sm:w-[380px] glass rounded-2xl overflow-hidden shadow-deep z-50 animate-slide-down">
          <div className="flex items-center px-4 py-3 border-b border-white/[0.06]">
            <p className="text-sm font-bold text-white flex-1">Notifications</p>
            {hasUnreadDots && <button onClick={markAllRead} className="text-xs font-semibold text-ink-muted hover:text-white">Mark all read</button>}
            <button onClick={() => { setOpen(false); navigate('/profile?tab=account#notifications') }} aria-label="Notification settings"
              className="ml-2 w-8 h-8 rounded-full flex items-center justify-center text-ink-muted hover:text-white hover:bg-white/[0.06]"><Icon name="settings" size={18} /></button>
          </div>
          <div className="max-h-[min(65vh,520px)] overflow-y-auto overscroll-contain">
            {!items ? <div className="skeleton h-24 m-3" /> : !items.length ? (
              <p className="px-4 py-8 text-center text-sm text-ink-faint">Nothing yet. New episodes of your shows, reminders and new videos show up here.</p>
            ) : items.map(n => {
              const security = n.kind === 'security'
              return (
                <button key={n._id} onClick={() => openItem(n)}
                  className={`w-full flex gap-3 px-4 py-3 text-left hover:bg-white/[0.05] border-b border-white/[0.04] ${security && n.unread ? 'bg-brand/[0.12]' : n.unread ? 'bg-brand/[0.05]' : ''}`}>
                  {n.image && !security
                    ? <span className="relative flex-shrink-0">
                        <img src={n.image} alt="" className="w-10 h-14 rounded-md object-cover" />
                        {(n.count || 1) > 1 && <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full bg-brand text-white text-[10px] font-black flex items-center justify-center">{n.count}</span>}
                      </span>
                    : <span className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${security ? 'bg-brand/20 text-brand' : 'bg-white/[0.06] text-ink'}`}>
                        <Icon name={ICON[n.kind] || 'notifications'} size={20} fill={security} />
                      </span>}
                  <span className="flex-1 min-w-0">
                    <span className={`block text-sm font-semibold leading-snug ${security ? 'text-brand-soft' : 'text-white'}`}>{n.title}</span>
                    {n.body && <span className="block text-xs text-ink-muted mt-0.5 line-clamp-2">{n.body}</span>}
                    <span className="block text-[11px] text-ink-faint mt-1">{ago(n.createdAt)}</span>
                  </span>
                  {n.unread && <span className="w-2 h-2 rounded-full bg-brand mt-1.5 flex-shrink-0" aria-label="New" />}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
