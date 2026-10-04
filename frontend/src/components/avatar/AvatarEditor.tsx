// Pick how a profile looks: emoji, built avatar, or an uploaded photo (cropped in the browser)
import { useEffect, useRef, useState, useCallback } from 'react'
import type { AvatarConfig } from '../../stores/profileStore'
import Icon from '../Icon'
import AvatarArt, {
  PART_COUNTS, PART_LABELS, SKINS, HAIR_COLORS, BGS, HAIR_NAMES, EYE_NAMES, MOUTH_NAMES, ACCESSORY_NAMES, randomConfig,
} from './AvatarArt'

export interface AvatarDraft {
  mode:   'emoji' | 'build' | 'photo'
  emoji:  string
  config: AvatarConfig
  /** Existing photo URL, or a new data: URL waiting to be uploaded */
  photo:  string | null
}

const OUT = 256 // exported photo size (px)

// ── Photo cropper ────────────────────────────────────────────────────────────

function PhotoCropper({ onCropped, onError }: { onCropped: (dataUrl: string) => void; onError: (msg: string) => void }) {
  const [img,  setImg]  = useState<HTMLImageElement | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pos,  setPos]  = useState({ x: 0, y: 0 })   // offset of the image centre, in preview px
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const VIEW = 240

  const load = (file: File) => {
    if (!file.type.startsWith('image/')) return onError('Choose an image file (JPEG, PNG, WebP…)')
    if (file.size > 20 * 1024 * 1024) return onError('That image is over 20 MB')
    const url = URL.createObjectURL(file)
    const im = new Image()
    im.onload = () => { setImg(im); setZoom(1); setPos({ x: 0, y: 0 }); URL.revokeObjectURL(url) }
    im.onerror = () => { onError("Couldn't read that image. Try a JPEG or PNG."); URL.revokeObjectURL(url) }
    im.src = url
  }

  // Scale so the image always covers the square, then apply zoom
  const base = img ? Math.max(VIEW / img.width, VIEW / img.height) : 1
  const scale = base * zoom
  const clamp = useCallback((p: { x: number; y: number }) => {
    if (!img) return p
    const maxX = Math.max(0, (img.width * scale - VIEW) / 2)
    const maxY = Math.max(0, (img.height * scale - VIEW) / 2)
    return { x: Math.max(-maxX, Math.min(maxX, p.x)), y: Math.max(-maxY, Math.min(maxY, p.y)) }
  }, [img, scale])

  useEffect(() => { setPos(p => clamp(p)) }, [zoom, clamp])

  // Render preview + export the crop whenever it changes
  useEffect(() => {
    const cv = canvas.current
    if (!cv || !img) return
    const ctx = cv.getContext('2d')!
    const k = OUT / VIEW
    ctx.fillStyle = '#0f131c'
    ctx.fillRect(0, 0, OUT, OUT)
    const w = img.width * scale * k, h = img.height * scale * k
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, OUT / 2 - w / 2 + pos.x * k, OUT / 2 - h / 2 + pos.y * k, w, h)
    const t = setTimeout(() => {
      let data = cv.toDataURL('image/webp', 0.85)
      if (!data.startsWith('data:image/webp')) data = cv.toDataURL('image/jpeg', 0.88) // Safari
      onCropped(data)
    }, 120)
    return () => clearTimeout(t)
  }, [img, scale, pos, onCropped])

  if (!img) {
    return (
      <div className="flex flex-col items-center gap-3 py-4">
        <button type="button" onClick={() => fileRef.current?.click()}
          className="w-40 h-40 rounded-3xl border-2 border-dashed border-white/15 hover:border-brand/60 text-ink-muted hover:text-white flex flex-col items-center justify-center gap-2 transition-colors">
          <Icon name="add_a_photo" size={36} />
          <span className="text-sm font-semibold">Choose a photo</span>
        </button>
        <p className="text-xs text-ink-faint text-center">JPEG, PNG or WebP. On a phone you can take a new picture.</p>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/*" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) load(f); e.target.value = '' }} />
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative rounded-3xl overflow-hidden touch-none cursor-grab active:cursor-grabbing select-none" style={{ width: VIEW, height: VIEW }}
        onPointerDown={e => { (e.target as HTMLElement).setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y } }}
        onPointerMove={e => { const d = drag.current; if (d) setPos(clamp({ x: d.px + e.clientX - d.x, y: d.py + e.clientY - d.y })) }}
        onPointerUp={() => { drag.current = null }}
        onWheel={e => setZoom(z => Math.min(4, Math.max(1, z - e.deltaY * 0.002)))}
        aria-label="Drag to position your photo">
        <canvas ref={canvas} width={OUT} height={OUT} className="w-full h-full block" />
        <span className="absolute inset-0 rounded-3xl ring-2 ring-inset ring-white/20 pointer-events-none" />
      </div>
      <label className="flex items-center gap-3 w-full max-w-[240px] text-ink-faint">
        <Icon name="zoom_out" size={18} />
        <input type="range" min={1} max={4} step={0.01} value={zoom} onChange={e => setZoom(Number(e.target.value))} aria-label="Zoom" className="flex-1 accent-[#e50914]" />
        <Icon name="zoom_in" size={18} />
      </label>
      <p className="text-xs text-ink-faint">Drag to reposition · scroll or slide to zoom</p>
      <button type="button" onClick={() => fileRef.current?.click()} className="btn-ghost text-xs"><Icon name="photo_library" size={16} />Choose a different photo</button>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/*" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) load(f); e.target.value = '' }} />
    </div>
  )
}

// ── Avatar builder ───────────────────────────────────────────────────────────

function Swatches({ colors, value, onPick, label }: { colors: string[]; value: number; onPick: (i: number) => void; label: string }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
      {colors.map((c, i) => (
        <button key={i} type="button" role="radio" aria-checked={value === i} aria-label={`${label} ${i + 1}`} onClick={() => onPick(i)}
          className="w-8 h-8 rounded-full transition-transform"
          style={{ background: c, transform: value === i ? 'scale(1.15)' : 'scale(1)', boxShadow: value === i ? `0 0 0 2px #0f131c, 0 0 0 4px ${c}` : 'none' }} />
      ))}
    </div>
  )
}

function Options({ names, value, onPick, label }: { names: string[]; value: number; onPick: (i: number) => void; label: string }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
      {names.map((n, i) => (
        <button key={n} type="button" role="radio" aria-checked={value === i} onClick={() => onPick(i)}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${value === i ? 'bg-brand text-white' : 'bg-white/[0.05] text-ink-muted hover:text-white'}`}>
          {n}
        </button>
      ))}
    </div>
  )
}

function Builder({ config, onChange }: { config: AvatarConfig; onChange: (c: AvatarConfig) => void }) {
  const [part, setPart] = useState<keyof AvatarConfig>('hair')
  const set = (k: keyof AvatarConfig, v: number) => onChange({ ...config, [k]: v })
  const tabs = Object.keys(PART_COUNTS) as (keyof AvatarConfig)[]

  return (
    <div>
      <div className="flex gap-1 overflow-x-auto scrollbar-hide mb-3" role="tablist" aria-label="Avatar part">
        {tabs.map(t => (
          <button key={t} type="button" role="tab" aria-selected={part === t} onClick={() => setPart(t)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold ${part === t ? 'bg-white/10 text-white' : 'text-ink-faint hover:text-white'}`}>
            {PART_LABELS[t]}
          </button>
        ))}
      </div>
      <div className="min-h-[72px]">
        {part === 'skin'      && <Swatches label="Skin tone"  colors={SKINS} value={config.skin} onPick={i => set('skin', i)} />}
        {part === 'hairColor' && <Swatches label="Hair colour" colors={HAIR_COLORS} value={config.hairColor} onPick={i => set('hairColor', i)} />}
        {part === 'bg'        && <Swatches label="Background" colors={BGS.map(b => b[0])} value={config.bg} onPick={i => set('bg', i)} />}
        {part === 'hair'      && <Options label="Hair style" names={HAIR_NAMES} value={config.hair} onPick={i => set('hair', i)} />}
        {part === 'eyes'      && <Options label="Eyes" names={EYE_NAMES} value={config.eyes} onPick={i => set('eyes', i)} />}
        {part === 'mouth'     && <Options label="Mouth" names={MOUTH_NAMES} value={config.mouth} onPick={i => set('mouth', i)} />}
        {part === 'accessory' && <Options label="Extras" names={ACCESSORY_NAMES} value={config.accessory} onPick={i => set('accessory', i)} />}
      </div>
      <button type="button" onClick={() => onChange(randomConfig())} className="btn-ghost text-xs mt-2"><Icon name="casino" size={16} />Surprise me</button>
    </div>
  )
}

// ── Editor ───────────────────────────────────────────────────────────────────

export default function AvatarEditor({ draft, onChange, emojis }: { draft: AvatarDraft; onChange: (d: AvatarDraft) => void; emojis: string[] }) {
  const [photoError, setPhotoError] = useState('')
  // Stable callback (the cropper re-exports whenever it changes) that always sees the latest draft
  const latest = useRef({ draft, onChange })
  latest.current = { draft, onChange }
  const onCropped = useCallback((dataUrl: string) => {
    const { draft: d, onChange: set } = latest.current
    if (d.photo !== dataUrl) set({ ...d, mode: 'photo', photo: dataUrl })
  }, [])
  const [replacing, setReplacing] = useState(!draft.photo)
  const hasSavedPhoto = !!draft.photo && !draft.photo.startsWith('data:')

  const modes: { key: AvatarDraft['mode']; label: string; icon: string }[] = [
    { key: 'emoji', label: 'Emoji',  icon: 'mood' },
    { key: 'build', label: 'Create', icon: 'face' },
    { key: 'photo', label: 'Photo',  icon: 'photo_camera' },
  ]

  return (
    <div>
      <div className="grid grid-cols-3 gap-1 p-1 rounded-full bg-dark-surface mb-4" role="tablist" aria-label="Avatar type">
        {modes.map(m => (
          <button key={m.key} type="button" role="tab" aria-selected={draft.mode === m.key} onClick={() => onChange({ ...draft, mode: m.key })}
            className={`h-9 rounded-full text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${draft.mode === m.key ? 'bg-brand text-white shadow-brand-sm' : 'text-ink-muted hover:text-white'}`}>
            <Icon name={m.icon} size={16} />{m.label}
          </button>
        ))}
      </div>

      {draft.mode === 'emoji' && (
        <div className="grid grid-cols-6 sm:grid-cols-9 gap-1.5">
          {emojis.map(a => (
            <button key={a} type="button" onClick={() => onChange({ ...draft, emoji: a })} aria-label={`Avatar ${a}`} aria-pressed={draft.emoji === a}
              className={`h-9 rounded-xl flex items-center justify-center text-lg transition-all ${draft.emoji === a ? 'bg-brand/20 ring-1 ring-brand scale-110' : 'bg-white/[0.04] hover:bg-white/[0.08]'}`}>{a}</button>
          ))}
        </div>
      )}

      {draft.mode === 'build' && <Builder config={draft.config} onChange={config => onChange({ ...draft, config })} />}

      {draft.mode === 'photo' && (
        <div>
          {hasSavedPhoto && !replacing ? (
            <div className="flex flex-col items-center gap-3 py-2">
              <img src={draft.photo!} alt="Current profile photo" className="w-32 h-32 rounded-3xl object-cover" />
              <button type="button" onClick={() => setReplacing(true)} className="btn-secondary text-xs"><Icon name="photo_library" size={16} />Replace photo</button>
            </div>
          ) : (
            <PhotoCropper onCropped={onCropped} onError={setPhotoError} />
          )}
          {photoError && <p role="alert" className="text-xs text-brand-soft text-center mt-2">{photoError}</p>}
        </div>
      )}
    </div>
  )
}

export { AvatarArt }
