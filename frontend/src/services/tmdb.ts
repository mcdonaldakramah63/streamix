const BASE = import.meta.env.VITE_TMDB_IMAGE_BASE || 'https://image.tmdb.org/t/p'

export const img = (path: string | null | undefined, size = 'w500') =>
  path ? `${BASE}/${size}${path}` : '/placeholder.jpg'

export const backdrop = (path: string | null | undefined) => img(path, 'w1280')
export const poster   = (path: string | null | undefined) => img(path, 'w500')
export const avatar   = (path: string | null | undefined) => img(path, 'w185')

export const year = (date?: string) => date?.slice(0, 4) ?? ''
export const rating = (n?: number) => n?.toFixed(1) ?? '-'
export const runtime = (mins?: number) => {
  if (!mins) return ''
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}
