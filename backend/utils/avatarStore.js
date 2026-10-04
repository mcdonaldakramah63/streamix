// Stores profile photos on disk under backend/uploads/avatars and validates avatar-builder configs
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const DIR = path.join(__dirname, '..', 'uploads', 'avatars')
const PUBLIC_PREFIX = '/uploads/avatars/'
const MAX_BYTES = 400 * 1024   // client sends ~256px images; this is a generous ceiling

fs.mkdirSync(DIR, { recursive: true })

/** Identify the image by its bytes — never trust the declared type (and never accept SVG) */
function sniff(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg'
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png'
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp'
  return null
}

/** data:image/...;base64,.... → saved file's public URL */
function saveDataUrl(dataUrl) {
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''))
  if (!m) throw Object.assign(new Error('Upload a JPEG, PNG or WebP image'), { status: 400 })
  const buf = Buffer.from(m[2], 'base64')
  if (buf.length > MAX_BYTES) throw Object.assign(new Error('Image is too large (max 400 KB after resizing)'), { status: 400 })
  const ext = sniff(buf)
  if (!ext) throw Object.assign(new Error('That file is not a valid image'), { status: 400 })
  const name = `${crypto.randomBytes(16).toString('hex')}.${ext}`
  fs.writeFileSync(path.join(DIR, name), buf)
  return PUBLIC_PREFIX + name
}

/** Deletes a previously stored photo (ignores anything that isn't one of ours) */
function removeStored(url) {
  if (!url || !url.startsWith(PUBLIC_PREFIX)) return
  const name = path.basename(url)
  if (!/^[a-f0-9]{32}\.(jpg|png|webp)$/.test(name)) return
  fs.promises.unlink(path.join(DIR, name)).catch(() => {})
}

// Avatar builder: every part is an index into a fixed list on the client
const CONFIG_LIMITS = { skin: 8, hair: 9, hairColor: 9, eyes: 7, mouth: 7, accessory: 7, bg: 10 }

/** Returns a clean config object, or null when the input isn't a usable config */
function cleanConfig(input) {
  if (!input || typeof input !== 'object') return null
  const out = {}
  for (const [k, max] of Object.entries(CONFIG_LIMITS)) {
    const v = Number(input[k])
    out[k] = Number.isInteger(v) && v >= 0 && v < max ? v : 0
  }
  return out
}

module.exports = { saveDataUrl, removeStored, cleanConfig, DIR }
