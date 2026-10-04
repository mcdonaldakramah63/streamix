// "New & Hot" (like Netflix): coming soon with Remind me, what everyone's watching, Top 10s
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import Icon from '../components/Icon'
import { useAuthStore } from '../context/authStore'
import { onWsMessage } from '../hooks/useWebSocket'
import { useHidden, useProfileStore } from '../stores/profileStore'

type Tab = 'soon' | 'everyone' | 'rising' | 'released' | 'top-movies' | 'top-tv'
interface Item { id: number; title?: string; name?: string; overview?: string; reason?: string; backdrop_path?: string | null; poster_path?: string | null; media_type: 'movie' | 'tv'; date?: string; vote_average?: number; genre_ids?: number[] }

const IMG = (p?: string | null, s = 'w780') => (p ? `https://image.tmdb.org/t/p/${s}${p}` : '')
const TABS: [Tab, string, string][] = [['soon', 'Coming Soon', 'event'], ['everyone', "Everyone's Watching", 'local_fire_department'],
  ['rising', 'Rising Fast', 'trending_up'], ['released', 'Just Released', 'new_releases'], ['top-movies', 'Top 10 Movies', 'trophy'], ['top-tv', 'Top 10 Shows', 'trophy']]
interface HotLists { updatedAt: string; version: string; hasMomentum: boolean; everyone: Item[]; rising: Item[]; justReleased: Item[]; top10Movies: Item[]; top10Tv: Item[] }

function ago(iso?: string) {
  if (!iso) return ''
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`
}

export default function NewAndHot() {
  const navigate = useNavigate()
  const user = useAuthStore(s => s.user)
  const hidden = useHidden()
  const [tab, setTab] = useState<Tab>('soon')
  const [soon, setSoon] = useState<Item[] | null>(null)
  // Lists from the server's trend tracker (refreshes every 30 min); re-ranked for the profile when there is one
  const [hot, setHot] = useState<HotLists | null>(null)
  const [, tick] = useState(0)
  const profileId = useProfileStore(s => s.activeProfile?._id)
  const loadHot = useCallback(() => {
    const url = profileId ? `/profiles/${profileId}/new-hot` : '/movies/new-hot'
    api.get(url).then(r => setHot(r.data)).catch(() => api.get('/movies/new-hot').then(r => setHot(r.data)).catch(() => {}))
  }, [profileId])
  useEffect(() => { loadHot() }, [loadHot])
  // Refresh by itself: when the server says the lists changed, every 10 minutes while open, and on coming back
  useEffect(() => {
    const off = onWsMessage(m => { if (m.type === 'CATALOG_UPDATED') loadHot() })
    const timer = setInterval(() => { if (document.visibilityState === 'visible') loadHot(); tick(x => x + 1) }, 10 * 60 * 1000)
    const onVis = () => { if (document.visibilityState === 'visible' && hot && Date.now() - new Date(hot.updatedAt).getTime() > 30 * 60 * 1000) loadHot() }
    document.addEventListener('visibilitychange', onVis)
    return () => { off(); clearInterval(timer); document.removeEventListener('visibilitychange', onVis) }
  }, [loadHot, hot])
  const [reminders, setReminders] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (tab === 'soon' && !soon) {
      // With a profile: ranked for them (sequels, people they like, premieres of their shows, taste + hype), with reasons
      const profile = useProfileStore.getState().activeProfile
      const load = profile
        ? api.get(`/profiles/${profile._id}/upcoming`).then(r => r.data.items.filter((i: any) => i.date).map((i: any) => ({ ...i, date: i.date })))
        : api.get('/movies/coming-soon').then(r => r.data)
      load.then(setSoon).catch(() => api.get('/movies/coming-soon').then(r => setSoon(r.data)).catch(() => setSoon([])))
    }
  }, [tab, soon])
  useEffect(() => {
    if (!user) return
    api.get('/inbox/reminders').then(r => setReminders(new Set(r.data.map((x: any) => `${x.type}:${x.tmdbId}`)))).catch(() => {})
  }, [user])

  const toggleRemind = async (it: Item) => {
    if (!user) { navigate('/login'); return }
    const k = `${it.media_type}:${it.id}`, on = !reminders.has(k)
    setReminders(s => { const n = new Set(s); on ? n.add(k) : n.delete(k); return n })
    try { await api.put('/inbox/reminders', { type: it.media_type, tmdbId: it.id, on }) }
    catch { setReminders(s => { const n = new Set(s); on ? n.delete(k) : n.add(k); return n }) }
  }
  const open = (it: Item) => navigate(it.media_type === 'tv' ? `/tv/${it.id}` : `/movie/${it.id}`)
  const visible = (list: Item[] | null) => (list || []).filter(i => !hidden.has(`${i.media_type}:${i.id}`))

  const list: Item[] | null = tab === 'soon' ? soon : !hot ? null
    : tab === 'everyone' ? hot.everyone : tab === 'rising' ? hot.rising : tab === 'released' ? hot.justReleased
    : tab === 'top-movies' ? hot.top10Movies : hot.top10Tv

  return (
    <div className="min-h-screen pt-20 pb-24 px-4 sm:px-6 max-w-4xl mx-auto">
      <div className="flex items-end gap-3 mb-4">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white flex items-center gap-2 flex-1"><Icon name="local_fire_department" size={30} className="text-brand" />New & Hot</h1>
        {hot && tab !== 'soon' && (
          <button onClick={loadHot} className="text-xs text-ink-faint hover:text-white flex items-center gap-1" title="Refresh">
            <Icon name="refresh" size={15} />Updated {ago(hot.updatedAt)}
          </button>
        )}
      </div>
      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1 mb-6 sticky top-16 z-20 bg-dark/90 backdrop-blur-xl py-2 -mx-4 px-4" role="tablist">
        {TABS.map(([id, label, icon]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold transition-all ${tab === id ? 'bg-white text-dark-void' : 'bg-dark-card text-ink-muted hover:text-white'}`}>
            <Icon name={icon} size={18} />{label}
          </button>
        ))}
      </div>

      {tab === 'rising' && hot && !hot.hasMomentum && !hot.rising.length ? (
        <p className="text-center text-sm text-ink-faint py-10">Rising Fast needs a few hours of chart history — it fills in by itself.</p>
      ) : !list || (tab.startsWith('top') && !list.length) ? (
        <div className="space-y-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-56" />)}</div>
      ) : (
        <div className="space-y-6">
          {visible(list).map((it, i) => {
            const k = `${it.media_type}:${it.id}`
            const date = it.date ? new Date(it.date + 'T12:00:00') : null
            return (
              <article key={k} className="flex gap-3 sm:gap-5">
                {tab === 'soon' && date && (
                  <div className="w-12 sm:w-14 flex-shrink-0 text-center pt-1">
                    <p className="text-[11px] uppercase text-ink-faint font-bold">{date.toLocaleDateString(undefined, { month: 'short' })}</p>
                    <p className="text-2xl sm:text-3xl font-black text-white leading-none">{date.getDate()}</p>
                  </div>
                )}
                {tab.startsWith('top') && (
                  <div className="w-10 sm:w-14 flex-shrink-0 text-4xl sm:text-6xl font-black text-transparent leading-none pt-1" style={{ WebkitTextStroke: '2px rgba(255,255,255,0.6)' }}>{i + 1}</div>
                )}
                <div className="flex-1 min-w-0">
                  <button onClick={() => open(it)} className="block w-full aspect-video rounded-2xl overflow-hidden bg-dark-card relative group">
                    {(it.backdrop_path || it.poster_path) && <img src={IMG(it.backdrop_path || it.poster_path)} alt="" loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />}
                    <span className="absolute inset-0 bg-gradient-to-t from-dark-void/90 via-transparent to-transparent" />
                    <span className="absolute left-3 bottom-3 right-3 text-left text-white font-extrabold text-lg sm:text-xl drop-shadow">{it.title || it.name}</span>
                  </button>
                  <div className="flex items-center gap-2 mt-3">
                    {tab === 'soon' ? (
                      <button onClick={() => toggleRemind(it)} aria-pressed={reminders.has(k)}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold ${reminders.has(k) ? 'bg-gold/15 text-gold' : 'bg-white text-dark-void'}`}>
                        <Icon name={reminders.has(k) ? 'notifications_active' : 'notifications'} size={17} fill={reminders.has(k)} />
                        {reminders.has(k) ? 'Reminder set' : 'Remind me'}
                      </button>
                    ) : (
                      <button onClick={() => navigate(it.media_type === 'tv' ? `/player/tv/${it.id}?season=1&episode=1` : `/player/movie/${it.id}`)}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold bg-white text-dark-void"><Icon name="play_arrow" size={18} fill />Play</button>
                    )}
                    <button onClick={() => open(it)} className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold bg-dark-card text-ink hover:text-white"><Icon name="info" size={17} />Info</button>
                    <span className="ml-auto text-[11px] uppercase font-bold text-ink-faint">{it.media_type === 'tv' ? 'Series' : 'Movie'}</span>
                  </div>
                  {it.reason && <p className={`text-xs font-semibold mt-2 ${tab === 'soon' ? 'text-cyan' : 'text-gold'}`}>{it.reason}</p>}
                  {tab === 'soon' && date && <p className="text-xs text-gold font-semibold mt-2">{it.media_type === 'tv' ? 'Premieres' : 'Coming'} {date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p>}
                  {it.overview && <p className="text-sm text-ink-muted mt-1.5 line-clamp-3">{it.overview}</p>}
                </div>
              </article>
            )
          })}
          {!visible(list).length && <p className="text-center text-sm text-ink-faint py-10">Nothing here right now.</p>}
        </div>
      )}
    </div>
  )
}
