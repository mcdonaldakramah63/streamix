// One place that knows how to draw a profile: photo → built avatar → emoji
import { useState } from 'react'
import type { Profile } from '../../stores/profileStore'
import AvatarArt from './AvatarArt'

type AvatarLike = Pick<Profile, 'avatar' | 'color'> & Partial<Pick<Profile, 'avatarImage' | 'avatarConfig' | 'name'>>

interface Props {
  p:          AvatarLike | null | undefined
  className?: string          // size + rounding, e.g. "w-10 h-10 rounded-xl"
  emojiSize?: string          // text size for the emoji fallback
  ring?:      boolean
}

export default function ProfileAvatar({ p, className = 'w-10 h-10 rounded-xl', emojiSize = 'text-xl', ring = false }: Props) {
  const [broken, setBroken] = useState(false)
  const color = p?.color || '#e50914'
  const ringStyle = ring ? { boxShadow: `0 0 0 2px ${color}66` } : undefined

  if (p?.avatarImage && !broken) {
    return (
      <img src={p.avatarImage} alt={p.name ? `${p.name}'s photo` : ''} onError={() => setBroken(true)}
        className={`${className} object-cover flex-shrink-0 bg-dark-card`} style={ringStyle} draggable={false} />
    )
  }
  if (p?.avatarConfig) {
    return (
      <span className={`${className} overflow-hidden flex-shrink-0 block`} style={ringStyle}>
        <AvatarArt config={p.avatarConfig} className="w-full h-full block" title={p.name ? `${p.name}'s avatar` : undefined} />
      </span>
    )
  }
  return (
    <span className={`${className} ${emojiSize} flex items-center justify-center flex-shrink-0`}
      style={{ background: `linear-gradient(145deg, ${color}33, ${color}11)`, border: `1.5px solid ${color}55`, ...ringStyle }}>
      {p?.avatar || '🎬'}
    </span>
  )
}
