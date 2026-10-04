// Official episodes published by rights holders on YouTube, in the privacy-enhanced player.
// Talks to the player with YouTube's postMessage protocol (no external script, so the site's CSP stays strict):
// progress for Continue Watching, "ended" for Next episode, and errors (region-locked / not embeddable) so the
// page can fall back to another source.
import { useEffect, useRef, useState } from 'react'

const ORIGINS = ['https://www.youtube-nocookie.com', 'https://www.youtube.com']

export type YouTubeError = 'unavailable' | 'blocked' | 'timeout'

export default function YouTubeEmbed({ videoId, title, startTime = 0, onTime, onEnded, onPlaying, onError }: {
  videoId: string; title: string; startTime?: number
  onTime?: (t: number, d: number) => void
  onEnded?: () => void
  onPlaying?: () => void
  onError?: (kind: YouTubeError, code?: number) => void
}) {
  const frame = useRef<HTMLIFrameElement>(null)
  const [ready, setReady] = useState(false)
  const cb = useRef({ onTime, onEnded, onPlaying, onError })
  cb.current = { onTime, onEnded, onPlaying, onError }

  const src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?enablejsapi=1&autoplay=1&rel=0&modestbranding=1&playsinline=1&iv_load_policy=3`
    + `${startTime > 5 ? `&start=${Math.floor(startTime)}` : ''}&origin=${encodeURIComponent(location.origin)}`

  useEffect(() => {
    setReady(false)
    let heard = false, playedOnce = false, ended = false
    const send = (msg: object) => frame.current?.contentWindow?.postMessage(JSON.stringify(msg), '*')
    // Ask the player to talk to us; repeat until it answers (it ignores messages sent before it has loaded)
    const hello = setInterval(() => send({ event: 'listening', id: videoId, channel: 'widget' }), 400)
    const giveUp = setTimeout(() => { if (!heard) cb.current.onError?.('timeout') }, 20_000)

    const onMsg = (e: MessageEvent) => {
      if (!ORIGINS.includes(e.origin) || e.source !== frame.current?.contentWindow) return
      let m: any
      try { m = typeof e.data === 'string' ? JSON.parse(e.data) : e.data } catch { return }
      if (!m?.event) return
      if (!heard) { heard = true; clearInterval(hello); setReady(true) }
      if (m.event === 'onError') {
        const code = Number(m.info)
        // 100: removed/private · 101/150: the owner doesn't allow it here (region or embedding) · 2/5: bad request/HTML5
        cb.current.onError?.(code === 101 || code === 150 ? 'blocked' : 'unavailable', code)
        return
      }
      const info = m.info || {}
      const state = m.event === 'onStateChange' ? Number(m.info) : typeof info.playerState === 'number' ? info.playerState : null
      if (state === 1 && !playedOnce) { playedOnce = true; cb.current.onPlaying?.() }
      if (state === 0 && !ended) { ended = true; cb.current.onEnded?.() }
      if (state === 1) ended = false
      if (typeof info.currentTime === 'number') cb.current.onTime?.(info.currentTime, typeof info.duration === 'number' ? info.duration : 0)
    }
    window.addEventListener('message', onMsg)
    return () => { clearInterval(hello); clearTimeout(giveUp); window.removeEventListener('message', onMsg) }
  }, [videoId])

  return (
    <div className="relative w-full aspect-video bg-black">
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-10 h-10 border-2 border-white/10 border-t-brand rounded-full animate-spin" />
        </div>
      )}
      <iframe ref={frame} key={videoId} src={src} title={title}
        className="absolute inset-0 w-full h-full border-0" allowFullScreen
        allow="autoplay; fullscreen; picture-in-picture; encrypted-media" referrerPolicy="strict-origin-when-cross-origin" />
    </div>
  )
}
