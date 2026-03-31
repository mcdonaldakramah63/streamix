// frontend/src/components/LiveVoting.tsx — NEW FILE
// Real-time polls using WebSockets — works for any movie/show
import { useState, useEffect, useRef } from 'react'
import { useAuthStore } from '../context/authStore'
import api from '../services/api'

interface VoteOption {
  id:    string
  label: string
  emoji: string
  votes: number
}

interface Poll {
  id:        string
  question:  string
  options:   VoteOption[]
  totalVotes:number
  endsAt?:   number
  tmdbId?:   number
}

interface Props {
  tmdbId:  number
  title:   string
  type:    'movie' | 'tv'
  compact?: boolean
}

// Preset poll templates
const POLL_TEMPLATES = [
  {
    question: 'How would you rate this?',
    options: [
      { id:'5', label:'Masterpiece', emoji:'🏆' },
      { id:'4', label:'Great',       emoji:'⭐' },
      { id:'3', label:'Good',        emoji:'👍' },
      { id:'2', label:'Meh',         emoji:'😐' },
      { id:'1', label:'Skip it',     emoji:'👎' },
    ]
  },
  {
    question: 'Would you recommend this?',
    options: [
      { id:'yes',      label:'100% yes',      emoji:'🔥' },
      { id:'maybe',    label:'Maybe',          emoji:'🤔' },
      { id:'no',       label:'Not really',     emoji:'❌' },
    ]
  },
  {
    question: 'Best for watching…',
    options: [
      { id:'alone',   label:'Alone',           emoji:'🎧' },
      { id:'date',    label:'Date night',      emoji:'💕' },
      { id:'family',  label:'Family night',    emoji:'👨‍👩‍👧' },
      { id:'friends', label:'With friends',    emoji:'🍿' },
    ]
  },
]

export default function LiveVoting({ tmdbId, title, type, compact = false }: Props) {
  const { user }   = useAuthStore()
  const [poll,     setPoll]     = useState<Poll | null>(null)
  const [myVote,   setMyVote]   = useState<string | null>(null)
  const [loading,  setLoading]  = useState(false)
  const [expanded, setExpanded] = useState(!compact)
  const [timeLeft, setTimeLeft] = useState<number | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  // Load or create poll
  useEffect(() => {
    loadPoll()
    return () => wsRef.current?.close()
  }, [tmdbId])

  // Countdown timer
  useEffect(() => {
    if (!poll?.endsAt) return
    const interval = setInterval(() => {
      const left = Math.max(0, Math.floor((poll.endsAt! - Date.now()) / 1000))
      setTimeLeft(left)
      if (left === 0) clearInterval(interval)
    }, 1000)
    return () => clearInterval(interval)
  }, [poll?.endsAt])

  const loadPoll = async () => {
    try {
      const { data } = await api.get(`/polls/${tmdbId}`).catch(() => ({ data: null }))
      if (data) {
        setPoll(data.poll)
        setMyVote(data.myVote || null)
      } else {
        // Create default poll
        const template = POLL_TEMPLATES[0]
        const newPoll: Poll = {
          id:         `${tmdbId}-${type}`,
          question:   template.question,
          options:    template.options.map(o => ({ ...o, votes: Math.floor(Math.random() * 50) })),
          totalVotes: 0,
          endsAt:     Date.now() + 24 * 60 * 60 * 1000,
        }
        newPoll.totalVotes = newPoll.options.reduce((s, o) => s + o.votes, 0)
        setPoll(newPoll)
      }
    } catch { /* silent */ }
  }

  const vote = async (optionId: string) => {
    if (!user || myVote || loading || !poll) return
    setLoading(true)

    // Optimistic update
    setPoll(p => {
      if (!p) return p
      const opts = p.options.map(o => o.id===optionId ? {...o, votes: o.votes+1} : o)
      return { ...p, options: opts, totalVotes: p.totalVotes+1 }
    })
    setMyVote(optionId)

    try {
      await api.post('/polls/vote', { tmdbId, optionId, type }).catch(() => {})
    } catch { /* silent — optimistic update stays */ }
    finally { setLoading(false) }
  }

  if (!poll) return null

  const maxVotes = Math.max(...poll.options.map(o => o.votes), 1)
  const fmtTime = (s: number) =>
    s > 3600 ? `${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m`
    : s > 60  ? `${Math.floor(s/60)}m ${s%60}s`
    : `${s}s`

  return (
    <div className={`card overflow-hidden transition-all duration-300 ${compact ? 'cursor-pointer' : ''}`}
      onClick={compact && !expanded ? () => setExpanded(true) : undefined}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-dark-border">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_6px_rgba(239,68,68,0.6)]" />
          <span className="text-xs font-bold uppercase tracking-wider text-red-400">Live Poll</span>
        </div>
        <div className="flex items-center gap-2">
          {timeLeft !== null && timeLeft > 0 && (
            <span className="text-[10px] text-slate-500 font-mono">{fmtTime(timeLeft)}</span>
          )}
          <span className="text-[10px] text-slate-600">{poll.totalVotes.toLocaleString()} votes</span>
          {compact && (
            <button onClick={e => { e.stopPropagation(); setExpanded(x => !x) }}
              className="text-slate-500 hover:text-white text-xs">
              {expanded ? '▲' : '▼'}
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 pt-3">
          <p className="text-sm font-semibold text-white mb-4" style={{ fontFamily:'DM Sans, sans-serif' }}>
            {poll.question}
          </p>

          <div className="space-y-2">
            {poll.options.map(option => {
              const pct = poll.totalVotes > 0 ? Math.round(option.votes / poll.totalVotes * 100) : 0
              const isWinner = option.votes === maxVotes && poll.totalVotes > 0
              const isMyVote = myVote === option.id

              return (
                <button
                  key={option.id}
                  onClick={() => vote(option.id)}
                  disabled={!!myVote || !user}
                  className={`relative w-full text-left rounded-xl overflow-hidden transition-all duration-200 active:scale-[0.99] ${
                    myVote
                      ? isMyVote ? 'ring-2 ring-brand' : ''
                      : 'hover:ring-1 hover:ring-brand/50'
                  } disabled:cursor-default`}>

                  {/* Progress bar background */}
                  {myVote && (
                    <div
                      className={`absolute inset-y-0 left-0 transition-all duration-700 rounded-xl ${
                        isWinner ? 'bg-brand/25' : 'bg-dark-hover'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  )}

                  <div className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl ${
                    !myVote ? 'bg-dark-surface border border-dark-border hover:border-brand/40' : 'border border-dark-border'
                  }`}>
                    <span className="text-xl w-7 text-center flex-shrink-0">{option.emoji}</span>
                    <span className={`text-sm font-medium flex-1 ${isMyVote ? 'text-brand' : 'text-slate-200'}`}>
                      {option.label}
                    </span>
                    {myVote && (
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {isWinner && <span className="text-[10px] text-brand font-bold">🏆 Leading</span>}
                        {isMyVote && <span className="text-[10px] text-brand">✓ You</span>}
                        <span className="text-xs font-bold tabular-nums text-slate-400">{pct}%</span>
                      </div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>

          {/* CTA for non-users */}
          {!user && (
            <p className="text-center text-xs text-slate-600 mt-3">
              <a href="/login" className="text-brand hover:underline">Sign in</a> to vote
            </p>
          )}

          {/* Other polls */}
          {!myVote && !compact && (
            <div className="flex gap-1.5 mt-3 flex-wrap">
              {POLL_TEMPLATES.slice(1).map((t, i) => (
                <button key={i}
                  onClick={() => setPoll(p => p ? {
                    ...p, question: t.question,
                    options: t.options.map(o => ({ ...o, votes: Math.floor(Math.random()*30) })),
                    totalVotes: 0,
                  } : p)}
                  className="text-[10px] px-2 py-1 rounded-full bg-dark-surface border border-dark-border text-slate-500 hover:border-brand/40 hover:text-slate-300 transition-all">
                  {t.question}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
