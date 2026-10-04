// Avatar builder artwork — one SVG drawn from a small config of part indexes.
// Index limits must match CONFIG_LIMITS in backend/utils/avatarStore.js.
import type { AvatarConfig } from '../../stores/profileStore'

export const SKINS = ['#ffdbb4', '#f5c79b', '#e0ac69', '#c68642', '#a0663d', '#8d5524', '#5c3a21', '#f2d6cb']
export const HAIR_COLORS = ['#1f1a17', '#4a2e1c', '#8b5a2b', '#d6a04a', '#f2d16b', '#b5462f', '#9ca3af', '#e50914', '#06b6d4']
export const BGS: [string, string][] = [
  ['#e50914', '#ff3366'], ['#f59e0b', '#ef4444'], ['#06b6d4', '#3b82f6'], ['#8b5cf6', '#ec4899'], ['#10b981', '#06b6d4'],
  ['#1e2638', '#31353f'], ['#f472b6', '#fb7185'], ['#22c55e', '#84cc16'], ['#0ea5e9', '#6366f1'], ['#f97316', '#facc15'],
]
export const PART_COUNTS = { skin: 8, hair: 9, hairColor: 9, eyes: 7, mouth: 7, accessory: 7, bg: 10 } as const
export const PART_LABELS: Record<keyof AvatarConfig, string> = {
  skin: 'Skin', hair: 'Hair', hairColor: 'Hair colour', eyes: 'Eyes', mouth: 'Mouth', accessory: 'Extras', bg: 'Background',
}
export const HAIR_NAMES = ['Bald', 'Short', 'Long', 'Curly', 'Spiky', 'Bun', 'Side part', 'Afro', 'Ponytail']
export const EYE_NAMES = ['Dots', 'Happy', 'Wide', 'Wink', 'Sleepy', 'Sparkle', 'Lashes']
export const MOUTH_NAMES = ['Smile', 'Grin', 'Open', 'Neutral', 'Tongue', 'Smirk', 'Surprised']
export const ACCESSORY_NAMES = ['None', 'Glasses', 'Shades', 'Headphones', 'Cap', 'Crown', 'Bow']

export const DEFAULT_CONFIG: AvatarConfig = { skin: 1, hair: 1, hairColor: 1, eyes: 0, mouth: 0, accessory: 0, bg: 0 }

export function randomConfig(): AvatarConfig {
  const r = (n: number) => Math.floor(Math.random() * n)
  return { skin: r(8), hair: r(9), hairColor: r(9), eyes: r(7), mouth: r(7), accessory: r(7), bg: r(10) }
}

function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16)
  const c = (v: number) => Math.max(0, Math.min(255, v + amt))
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => c(v).toString(16).padStart(2, '0')).join('')}`
}

export default function AvatarArt({ config, className = '', title }: { config: AvatarConfig; className?: string; title?: string }) {
  const c = { ...DEFAULT_CONFIG, ...config }
  const skin = SKINS[c.skin] || SKINS[0]
  const skinDark = shade(skin, -28)
  const hair = HAIR_COLORS[c.hairColor] || HAIR_COLORS[0]
  const hairDark = shade(hair, -25)
  const [bg1, bg2] = BGS[c.bg] || BGS[0]
  const shirt = shade(bg1, -40)
  const id = `av${c.bg}${c.skin}${c.hair}`

  // Hair drawn behind the head (long styles)
  const hairBack = {
    2: <path d="M24 46 Q22 86 34 92 L66 92 Q78 86 76 46 Q74 22 50 20 Q26 22 24 46Z" fill={hairDark} />,
    5: <circle cx="50" cy="16" r="10" fill={hair} />,
    7: <circle cx="50" cy="40" r="30" fill={hair} />,
    8: <path d="M68 40 Q86 52 78 78 Q74 70 70 64Z" fill={hairDark} />,
  }[c.hair]

  // Hair drawn over the head
  const hairFront = {
    1: <path d="M28 42 Q28 22 50 21 Q72 22 72 42 Q64 32 50 31 Q36 32 28 42Z" fill={hair} />,
    2: <path d="M27 46 Q26 21 50 20 Q74 21 73 46 Q66 31 50 30 Q38 31 30 40 L29 52Z" fill={hair} />,
    3: <g fill={hair}>{[30, 38, 46, 54, 62, 70].map((x, i) => <circle key={x} cx={x} cy={i % 2 ? 26 : 30} r="8" />)}<circle cx="27" cy="38" r="6" /><circle cx="73" cy="38" r="6" /></g>,
    4: <path d="M28 40 L30 22 L37 30 L42 16 L48 28 L54 14 L58 28 L65 18 L67 30 L73 24 L72 42 Q62 32 50 32 Q38 32 28 40Z" fill={hair} />,
    5: <path d="M28 42 Q28 24 50 23 Q72 24 72 42 Q62 33 50 33 Q38 33 28 42Z" fill={hair} />,
    6: <path d="M28 44 Q27 22 50 21 Q73 22 72 40 Q60 26 44 34 Q34 38 28 44Z" fill={hair} />,
    7: null,
    8: <path d="M28 42 Q28 22 50 21 Q72 22 72 42 Q62 31 50 31 Q38 31 28 42Z" fill={hair} />,
  }[c.hair]

  const eyes = [
    <g key="0" fill="#1f1a17"><circle cx="41" cy="48" r="3" /><circle cx="59" cy="48" r="3" /></g>,
    <g key="1" stroke="#1f1a17" strokeWidth="2.5" fill="none" strokeLinecap="round"><path d="M37 49 Q41 44 45 49" /><path d="M55 49 Q59 44 63 49" /></g>,
    <g key="2"><circle cx="41" cy="48" r="5" fill="#fff" /><circle cx="59" cy="48" r="5" fill="#fff" /><circle cx="42" cy="49" r="2.6" fill="#1f1a17" /><circle cx="60" cy="49" r="2.6" fill="#1f1a17" /></g>,
    <g key="3"><circle cx="41" cy="48" r="3" fill="#1f1a17" /><path d="M55 49 Q59 45 63 49" stroke="#1f1a17" strokeWidth="2.5" fill="none" strokeLinecap="round" /></g>,
    <g key="4" stroke="#1f1a17" strokeWidth="2.5" strokeLinecap="round"><path d="M37 49 H45" /><path d="M55 49 H63" /></g>,
    <g key="5" fill="#1f1a17"><circle cx="41" cy="48" r="3.4" /><circle cx="59" cy="48" r="3.4" /><circle cx="42.3" cy="46.8" r="1.2" fill="#fff" /><circle cx="60.3" cy="46.8" r="1.2" fill="#fff" /></g>,
    <g key="6" fill="#1f1a17" stroke="#1f1a17" strokeWidth="1.6" strokeLinecap="round"><circle cx="41" cy="49" r="2.8" /><circle cx="59" cy="49" r="2.8" /><path d="M37 45 L35 43 M40 44 L39 42 M63 45 L65 43 M60 44 L61 42" /></g>,
  ][c.eyes]

  const mouth = [
    <path key="0" d="M43 60 Q50 66 57 60" stroke="#7a2e2e" strokeWidth="2.5" fill="none" strokeLinecap="round" />,
    <path key="1" d="M41 59 Q50 70 59 59 Z" fill="#7a2e2e" />,
    <ellipse key="2" cx="50" cy="62" rx="5" ry="4" fill="#7a2e2e" />,
    <path key="3" d="M44 61 H56" stroke="#7a2e2e" strokeWidth="2.5" strokeLinecap="round" />,
    <g key="4"><path d="M42 59 Q50 67 58 59 Z" fill="#7a2e2e" /><ellipse cx="50" cy="64" rx="3.5" ry="3" fill="#f472b6" /></g>,
    <path key="5" d="M44 62 Q52 64 57 58" stroke="#7a2e2e" strokeWidth="2.5" fill="none" strokeLinecap="round" />,
    <circle key="6" cx="50" cy="62" r="3" fill="#7a2e2e" />,
  ][c.mouth]

  const accessory = [
    null,
    <g key="1" stroke="#1f1a17" strokeWidth="2" fill="none"><circle cx="41" cy="48" r="7" /><circle cx="59" cy="48" r="7" /><path d="M48 48 H52" /></g>,
    <g key="2"><rect x="32" y="43" width="16" height="10" rx="4" fill="#0f131c" /><rect x="52" y="43" width="16" height="10" rx="4" fill="#0f131c" /><path d="M48 47 H52" stroke="#0f131c" strokeWidth="2" /></g>,
    <g key="3"><path d="M26 48 Q26 18 50 18 Q74 18 74 48" stroke="#31353f" strokeWidth="5" fill="none" /><rect x="20" y="42" width="10" height="16" rx="4" fill="#e50914" /><rect x="70" y="42" width="10" height="16" rx="4" fill="#e50914" /></g>,
    <g key="4"><path d="M27 38 Q28 20 50 20 Q72 20 73 38Z" fill="#e50914" /><path d="M50 36 H84 Q82 41 72 41 H50Z" fill="#c0000c" /></g>,
    <path key="5" d="M33 26 L37 12 L44 22 L50 9 L56 22 L63 12 L67 26Z" fill="#f59e0b" stroke="#b45309" strokeWidth="1.2" />,
    <g key="6" fill="#ec4899"><path d="M50 22 L38 15 L38 29Z" /><path d="M50 22 L62 15 L62 29Z" /><circle cx="50" cy="22" r="3.5" fill="#be185d" /></g>,
  ][c.accessory]

  return (
    <svg viewBox="0 0 100 100" className={className} role="img" aria-label={title || 'Avatar'}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={bg1} /><stop offset="1" stopColor={bg2} /></linearGradient>
      </defs>
      <rect width="100" height="100" fill={`url(#${id})`} />
      {hairBack}
      {/* shoulders + neck */}
      <path d="M18 100 Q20 78 50 76 Q80 78 82 100Z" fill={shirt} />
      <rect x="43" y="64" width="14" height="14" rx="5" fill={skinDark} />
      {/* ears + head */}
      <circle cx="28" cy="50" r="5" fill={skinDark} /><circle cx="72" cy="50" r="5" fill={skinDark} />
      <ellipse cx="50" cy="48" rx="22" ry="24" fill={skin} />
      {c.hair === 7 && <path d="M28 40 Q30 24 50 22 Q70 24 72 40 Q62 32 50 32 Q38 32 28 40Z" fill={hair} />}
      {hairFront}
      {/* cheeks */}
      <circle cx="36" cy="57" r="3.5" fill="#f472b6" opacity="0.25" /><circle cx="64" cy="57" r="3.5" fill="#f472b6" opacity="0.25" />
      {eyes}
      {mouth}
      {accessory}
    </svg>
  )
}
