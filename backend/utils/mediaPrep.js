// utils/mediaPrep.js — makes your own video files play in any browser, with their subtitles. Uses ffmpeg/ffprobe.
//
// Browsers reliably play MP4 with H.264 (8-bit) video and AAC/MP3 audio. Anime releases are usually MKV, often
// HEVC or 10-bit, with several audio tracks and ASS/SRT subtitles inside. For each file this decides the cheapest
// way to get there:
//   ok         already browser-safe MP4 → used as is
//   remux      right codecs, wrong box (MKV/MOV) → re-packed in seconds, no quality loss
//   audio      video fine, audio isn't (FLAC/Opus/AC3/DTS) → audio re-encoded to AAC, video copied
//   transcode  HEVC / 10-bit / VP9 / AV1 / old codecs → video re-encoded to H.264 (slow: minutes per episode)
// Text subtitles (SRT, ASS/SSA, WebVTT, mov_text) inside the file — and .srt/.ass/.vtt files next to it — become
// WebVTT files beside the MP4 ("Episode 01.en.vtt"), which the server offers to the player automatically.
// Picture subtitles (PGS / VobSub) can't be turned into text without OCR and are reported, not converted.
const { spawn, execFile } = require('child_process')
const fs = require('fs')
const path = require('path')

const BROWSER_VIDEO = new Set(['h264'])
const BROWSER_AUDIO = new Set(['aac', 'mp3'])
const TEXT_SUBS = new Set(['subrip', 'srt', 'ass', 'ssa', 'webvtt', 'mov_text', 'text'])
const PICTURE_SUBS = new Set(['hdmv_pgs_subtitle', 'dvd_subtitle', 'dvb_subtitle', 'xsub'])
const SIDE_EXT = /\.(srt|ass|ssa|vtt)$/i

const LANG_NAMES = { en: 'English', eng: 'English', ja: 'Japanese', jpn: 'Japanese', es: 'Spanish', spa: 'Spanish', fr: 'French', fre: 'French', fra: 'French',
  de: 'German', ger: 'German', deu: 'German', it: 'Italian', ita: 'Italian', pt: 'Portuguese', por: 'Portuguese', ar: 'Arabic', ara: 'Arabic',
  ru: 'Russian', rus: 'Russian', zh: 'Chinese', chi: 'Chinese', zho: 'Chinese', ko: 'Korean', kor: 'Korean', id: 'Indonesian', ind: 'Indonesian',
  sw: 'Swahili', swa: 'Swahili', hi: 'Hindi', hin: 'Hindi', und: 'Unknown' }
const ISO1 = { eng: 'en', jpn: 'ja', spa: 'es', fre: 'fr', fra: 'fr', ger: 'de', deu: 'de', ita: 'it', por: 'pt', ara: 'ar', rus: 'ru', chi: 'zh', zho: 'zh', kor: 'ko', ind: 'id', swa: 'sw', hin: 'hi' }

const run = (bin, args) => new Promise((resolve, reject) =>
  execFile(bin, args, { maxBuffer: 32 * 1024 * 1024 }, (err, stdout, stderr) => (err ? reject(Object.assign(err, { stderr })) : resolve(stdout))))

let available = null
/** Is ffmpeg installed? */
async function hasFfmpeg() {
  if (available === null) available = await run('ffprobe', ['-version']).then(() => true, () => false)
  return available
}

/** What's inside a file → { duration, video, audio[], subs[] } */
async function probe(file) {
  const out = JSON.parse(await run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file]))
  const streams = out.streams || []
  const tag = (s, k) => s.tags?.[k] || s.tags?.[k.toUpperCase()] || ''
  const v = streams.find(s => s.codec_type === 'video' && !s.disposition?.attached_pic)
  return {
    format: out.format?.format_name || '',
    duration: Number(out.format?.duration) || null,
    video: v ? { index: v.index, codec: v.codec_name, pixFmt: v.pix_fmt || '', height: v.height || null, profile: v.profile || '' } : null,
    audio: streams.filter(s => s.codec_type === 'audio').map((s, n) => ({ n, index: s.index, codec: s.codec_name, lang: tag(s, 'language') || 'und', title: tag(s, 'title'), channels: s.channels || 2, default: !!s.disposition?.default })),
    subs: streams.filter(s => s.codec_type === 'subtitle').map((s, n) => ({ n, index: s.index, codec: s.codec_name, lang: tag(s, 'language') || 'und', title: tag(s, 'title'), forced: !!s.disposition?.forced, default: !!s.disposition?.default })),
  }
}

/** Which audio track to keep. Prefers `want` (e.g. "ja" for original audio with subs), else the default, else the first. */
function pickAudio(audio, want) {
  if (!audio.length) return null
  const w = String(want || '').toLowerCase()
  const lang = a => ISO1[a.lang] || a.lang
  return (w && audio.find(a => lang(a) === w || a.lang === w)) || audio.find(a => a.default) || audio[0]
}

/** → { action: 'ok'|'remux'|'audio'|'transcode', reasons[] } */
function plan(info, file) {
  const reasons = []
  const ext = path.extname(file).toLowerCase()
  if (!info.video) return { action: 'unsupported', reasons: ['no video track'] }
  const tenBit = /10|12/.test(info.video.pixFmt) || /High 10|Main 10/i.test(info.video.profile)
  const videoOk = BROWSER_VIDEO.has(info.video.codec) && !tenBit
  if (!videoOk) reasons.push(tenBit ? `${info.video.codec} 10-bit video` : `${info.video.codec} video`)
  const a = pickAudio(info.audio)
  const audioOk = !a || BROWSER_AUDIO.has(a.codec)
  if (!audioOk) reasons.push(`${a.codec} audio`)
  const mp4 = ext === '.mp4' || ext === '.m4v'
  if (!mp4) reasons.push(`${ext.slice(1) || 'unknown'} container`)
  if (!videoOk) return { action: 'transcode', reasons }
  if (!audioOk) return { action: 'audio', reasons }
  if (!mp4 || info.audio.length > 1) return { action: mp4 ? 'remux' : 'remux', reasons: reasons.length ? reasons : ['several audio tracks'] }
  return { action: 'ok', reasons }
}

const label = (s, i) => {
  const name = LANG_NAMES[s.lang] || (s.lang && s.lang !== 'und' ? s.lang.toUpperCase() : `Track ${i + 1}`)
  const extra = s.title && s.title.toLowerCase() !== String(s.lang).toLowerCase() && !new RegExp(name, 'i').test(s.title) ? ` · ${s.title}` : ''
  return `${name}${extra}${s.forced ? ' (forced)' : ''}`.slice(0, 40)
}
const langCode = (l) => (ISO1[l] || (l && l !== 'und' ? l : 'xx')).slice(0, 3)

/** "Show - 01.mkv" → sidecars like "Show - 01.en.srt", "Show - 01.srt", "Show - 01.English.ass" */
function sidecarsOf(file) {
  const dir = path.dirname(file), base = path.basename(file, path.extname(file))
  let names = []
  try { names = fs.readdirSync(dir) } catch { return [] }
  return names.filter(n => SIDE_EXT.test(n) && n.startsWith(base) && n !== path.basename(file)).map(n => {
    const mid = n.slice(base.length, -path.extname(n).length).replace(/^[._\s-]+/, '')
    const lang = (mid.split(/[._\s-]/)[0] || '').toLowerCase()
    return { file: path.join(dir, n), lang: lang.length >= 2 && lang.length <= 3 ? lang : 'und', title: mid }
  })
}

/** Run ffmpeg with a progress callback (0..1) */
function ffmpeg(args, duration, onProgress) {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-progress', 'pipe:1', '-nostats', ...args])
    let err = ''
    p.stdout.on('data', d => {
      const m = String(d).match(/out_time_us=(\d+)/g)
      if (m && duration && onProgress) onProgress(Math.min(1, Number(m[m.length - 1].split('=')[1]) / 1e6 / duration))
    })
    p.stderr.on('data', d => { err += d; if (err.length > 8000) err = err.slice(-8000) })
    p.on('error', reject)
    p.on('close', code => (code === 0 ? resolve() : reject(new Error(err.trim().split('\n').pop() || `ffmpeg exited with ${code}`))))
  })
}

/**
 * Make `src` browser-ready at `destMp4` (+ .vtt sidecars). → { action, reasons, subtitles: [{ file, lang, label }], skippedSubs: [] }
 * opts: { audioLang, onProgress(stage, fraction), dryRun }
 */
async function prepare(src, destMp4, opts = {}) {
  const info = await probe(src)
  const p = plan(info, src)
  const result = { action: p.action, reasons: p.reasons, duration: info.duration, subtitles: [], skippedSubs: [] }
  if (p.action === 'unsupported') throw new Error('No video track in this file')
  if (opts.dryRun) return result
  fs.mkdirSync(path.dirname(destMp4), { recursive: true })
  const tmp = destMp4.replace(/\.mp4$/i, '') + '.part.mp4'

  if (p.action !== 'ok') {
    const a = pickAudio(info.audio, opts.audioLang)
    const args = ['-i', src, '-map', `0:${info.video.index}`]
    if (a) args.push('-map', `0:${a.index}`)
    if (p.action === 'transcode') args.push('-c:v', 'libx264', '-preset', opts.preset || 'veryfast', '-crf', String(opts.crf || 20), '-pix_fmt', 'yuv420p', '-profile:v', 'high')
    else args.push('-c:v', 'copy')
    if (a) {
      if (BROWSER_AUDIO.has(a.codec) && p.action !== 'audio') args.push('-c:a', 'copy')
      else args.push('-c:a', 'aac', '-b:a', a.channels > 2 ? '256k' : '160k', '-ac', String(Math.min(2, a.channels || 2)))
    }
    // Starts playing before the whole file has downloaded
    args.push('-movflags', '+faststart', '-map_metadata', '-1', '-sn', tmp)
    await ffmpeg(args, info.duration, f => opts.onProgress?.(p.action, f))
    fs.renameSync(tmp, destMp4)
  }

  // Subtitles inside the file
  const base = destMp4.replace(/\.mp4$/i, '')
  const used = new Set()
  const outName = (lang, extra) => {
    let name = `${base}.${langCode(lang)}${extra ? `.${extra}` : ''}.vtt`, i = 2
    while (used.has(name)) name = `${base}.${langCode(lang)}${extra ? `.${extra}` : ''}.${i++}.vtt`
    used.add(name)
    return name
  }
  for (const [i, s] of info.subs.entries()) {
    if (PICTURE_SUBS.has(s.codec)) { result.skippedSubs.push(`${label(s, i)} (picture subtitles)`); continue }
    if (!TEXT_SUBS.has(s.codec)) { result.skippedSubs.push(`${label(s, i)} (${s.codec})`); continue }
    const out = outName(s.lang, s.forced ? 'forced' : '')
    try {
      await ffmpeg(['-i', src, '-map', `0:${s.index}`, '-c:s', 'webvtt', out], null)
      result.subtitles.push({ file: out, lang: langCode(s.lang), label: label(s, i) })
    } catch (e) { result.skippedSubs.push(`${label(s, i)} (${e.message})`) }
  }
  // …and next to it
  for (const [i, sc] of sidecarsOf(src).entries()) {
    const out = outName(sc.lang)
    try {
      await ffmpeg(['-i', sc.file, '-c:s', 'webvtt', out], null)
      result.subtitles.push({ file: out, lang: langCode(sc.lang), label: label({ lang: sc.lang, title: sc.title }, info.subs.length + i) })
    } catch (e) { result.skippedSubs.push(`${path.basename(sc.file)} (${e.message})`) }
  }
  return result
}

/** WebVTT files that belong to a library video ("Ep 01.mp4" → "Ep 01.en.vtt", "Ep 01.ja.forced.vtt") */
function subtitlesFor(videoFile) {
  const dir = path.dirname(videoFile), base = path.basename(videoFile, path.extname(videoFile))
  let names = []
  try { names = fs.readdirSync(dir) } catch { return [] }
  return names.filter(n => /\.vtt$/i.test(n) && n.startsWith(base + '.')).sort().map(n => {
    const parts = n.slice(base.length + 1, -4).split('.')
    const lang = parts[0] || 'xx'
    const forced = parts.includes('forced')
    return { file: path.join(dir, n), lang, label: `${LANG_NAMES[lang] || lang.toUpperCase()}${forced ? ' (forced)' : ''}${parts.find(p => /^\d+$/.test(p)) ? ` ${parts.find(p => /^\d+$/.test(p))}` : ''}` }
  })
}

module.exports = { hasFfmpeg, probe, plan, pickAudio, prepare, sidecarsOf, subtitlesFor, _test: { label, langCode } }
