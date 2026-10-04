// utils/localMedia.js — videos kept on this computer (the admin upload script copies them here).
// Library items point at them as "local:<path inside LIBRARY_DIR>"; the server streams them itself.
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(process.env.LIBRARY_DIR || path.join(__dirname, '..', 'media'))
const PREFIX = 'local:'
const PLAYABLE = /\.(mp4|m4v|webm|mov|mkv|ogv)$/i

const isLocal = (videoUrl) => String(videoUrl || '').startsWith(PREFIX)

/** Absolute path for "local:Movies/x.mp4", or null when it would leave LIBRARY_DIR */
function resolve(videoUrl) {
  const rel = String(videoUrl).slice(PREFIX.length).replace(/\\/g, '/')
  if (!rel || rel.includes('\0') || path.isAbsolute(rel)) return null
  const abs = path.resolve(ROOT, rel)
  return abs.startsWith(ROOT + path.sep) ? abs : null
}

/** { abs, size, fileName } for an import line's "local:..." part, or throws a readable error */
function inspect(videoUrl) {
  const abs = resolve(videoUrl)
  if (!abs) throw new Error('Local files must be inside the library folder')
  if (!PLAYABLE.test(abs)) throw new Error('Not a video file this player can stream (mp4, m4v, webm, mov, mkv, ogv)')
  let st
  try { st = fs.statSync(abs) } catch { throw new Error(`File not found in the library folder: ${path.relative(ROOT, abs)}`) }
  if (!st.isFile()) throw new Error('Not a file')
  return { abs, size: st.size, fileName: path.basename(abs) }
}

module.exports = { ROOT, PREFIX, isLocal, resolve, inspect }
