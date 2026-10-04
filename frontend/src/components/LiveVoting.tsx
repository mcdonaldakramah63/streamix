// frontend/src/components/LiveVoting.tsx — community poll per title (real votes only)
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../context/authStore'
import api from '../services/api'
import Icon from './Icon'

interface VoteOption { id: string; label: string; emoji: string; votes: number }
interface Poll { id: string; question: string; options: VoteOption[]; totalVotes: number }

export default function LiveVoting({ tmdbId, type }: { tmdbId: number; type: 'movie' | 'tv' }) {
  const user = useAuthStore(s => s.user)
  const [poll,   setPoll]   = useState<Poll | null>(null)
  const [myVote, setMyVote] = useState<string | null>(null)
  const [busy,   setBusy]   = useState(false)

  useEffect(() => {
    let cancelled = false
    api.get(`/polls/${tmdbId}`, { params: { type } })
      .then(({ data }) => { if (!cancelled) { setPoll(data.poll); setMyVote(data.myVote || null) } })
      .catch(() => { if (!cancelled) setPoll(null) })
    return () => { cancelled = true }
  }, [tmdbId, type, user?._id])

  const vote = async (optionId: string) => {
    if (!user || busy || optionId === myVote) return
    setBusy(true)
    try {
      const { data } = await api.post('/polls/vote', { tmdbId, optionId, type })
      setPoll(data.poll); setMyVote(data.myVote)
    } catch { /* keep previous state */ }
    finally { setBusy(false) }
  }

  if (!poll) return null
  const showResults = !!myVote

  return (
    <section className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-brand animate-pulse shadow-[0_0_6px_#e50914]" />
          <span className="text-label-sm uppercase text-brand-soft">Community poll</span>
        </div>
        <span className="text-xs text-ink-faint">{poll.totalVotes.toLocaleString()} vote{poll.totalVotes === 1 ? '' : 's'}</span>
      </div>
      <p className="text-sm font-bold text-white mb-3">{poll.question}</p>

      <div className="space-y-2">
        {poll.options.map(o => {
          const pct = poll.totalVotes ? Math.round(o.votes / poll.totalVotes * 100) : 0
          const mine = myVote === o.id
          return (
            <button key={o.id} onClick={() => vote(o.id)} disabled={!user || busy}
              className={`relative w-full overflow-hidden rounded-xl text-left transition-all disabled:cursor-default ${
                mine ? 'ring-1 ring-brand' : 'bg-dark-surface hover:bg-dark-border'
              }`}>
              {showResults && <span className="absolute inset-y-0 left-0 bg-brand/15 transition-all duration-700" style={{ width: `${pct}%` }} />}
              <span className="relative flex items-center gap-3 px-3 py-2.5">
                <span className="text-lg w-6 text-center">{o.emoji}</span>
                <span className={`flex-1 text-sm font-semibold ${mine ? 'text-brand-soft' : 'text-ink'}`}>{o.label}</span>
                {mine && <Icon name="check_circle" size={16} className="text-brand" fill />}
                {showResults && <span className="text-xs font-bold tabular-nums text-ink-muted w-9 text-right">{pct}%</span>}
              </span>
            </button>
          )
        })}
      </div>

      {!user && (
        <p className="text-center text-xs text-ink-faint mt-3">
          <Link to="/login" className="text-brand-soft font-bold hover:underline">Sign in</Link> to vote
        </p>
      )}
    </section>
  )
}
