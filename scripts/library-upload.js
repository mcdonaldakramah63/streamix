#!/usr/bin/env node
// scripts/library-upload.js — add videos to the Streamix library in bulk (admin only).
//
//   npm run upload -- ~/Videos/Films "~/Videos/Shows/Doctor Who" urls.txt https://archive.org/details/TheGeneral1926
//
// What it does for you:
//   • Folders are scanned recursively for videos; samples, extras and partial downloads are skipped.
//   • Names are read the same way the server reads them (title, year, S01E02, 1x02, "Episode 5", tmdb/imdb ids),
//     and a weak file name ("E05.mp4") borrows the show and season from its folders ("Show/Season 2/E05.mp4").
//   • Files go into the server's library folder, sorted into Movies/ and Shows/<Show>/Season N/ (hard-linked when
//     possible, so no extra disk space), and anything already in the library is skipped.
//   • The server's matcher links each video to its TMDB movie or episode; unsure matches are shown with the
//     top suggestions so you can pick one, type an id, or skip.
//   • URL lists (.txt, one per line, "# comments" and "url | hint" allowed) and plain URLs work too.
//   • Anime-style files (MKV, HEVC/10-bit, FLAC/Opus audio) are converted with ffmpeg to MP4 that plays in every
//     browser — re-packed in seconds when possible, re-encoded only when needed — and their subtitles (inside the
//     file, or .srt/.ass beside it) become WebVTT tracks the player offers. Picture subtitles (PGS) are reported.
//
// Options:  --server URL  --license public-domain|creative-commons|own-content|licensed  --yes (I hold the rights)
//           --mode link|copy|move  --hint "tv:1399"  --dry-run  --no-review  --no-match  --report out.json
//           --no-convert  --audio ja|en (which audio track to keep)  --crf 20  --preset veryfast
// Sign-in:  STREAMIX_EMAIL / STREAMIX_PASSWORD, or you're asked (2FA codes supported).
'use strict'
const fs = require('fs')
const path = require('path')
const os = require('os')
const readline = require('readline')

const ROOT = path.resolve(__dirname, '..')
const { parseName } = require(path.join(ROOT, 'backend/utils/mediaMatcher'))
const prep = require(path.join(ROOT, 'backend/utils/mediaPrep'))

const VIDEO = /\.(mp4|m4v|webm|mov|mkv|ogv)$/i
const SKIP_NAME = /(^|[\s._-])(sample|trailer|teaser|featurette|behind[\s._-]the[\s._-]scenes|deleted[\s._-]scenes|extras?)([\s._-]|$)/i
const SKIP_PART = /\.(part|crdownload|!qb|tmp)$/i
const LICENSES = ['public-domain', 'creative-commons', 'own-content', 'licensed']
const BATCH = 200
const SURE = 0.8

// ── Arguments ────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const o = { inputs: [], server: process.env.STREAMIX_SERVER || 'http://localhost:5000', mode: 'link', review: true, match: true }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const val = () => { if (i + 1 >= argv.length) die(`${a} needs a value`); return argv[++i] }
    if (a === '--server') o.server = val().replace(/\/+$/, '')
    else if (a === '--license') o.license = val()
    else if (a === '--yes' || a === '-y') o.yes = true
    else if (a === '--mode') o.mode = val()
    else if (a === '--hint') o.hint = val()
    else if (a === '--dry-run' || a === '-n') o.dry = true
    else if (a === '--no-review') o.review = false
    else if (a === '--no-match') o.match = false
    else if (a === '--report') o.report = val()
    else if (a === '--no-convert') o.noConvert = true
    else if (a === '--audio') o.audio = val().toLowerCase()
    else if (a === '--crf') o.crf = Number(val())
    else if (a === '--preset') o.preset = val()
    else if (a === '--help' || a === '-h') { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 20).map(l => l.replace(/^\/\/ ?/, '')).join('\n')); process.exit(0) }
    else if (a.startsWith('--')) die(`Unknown option ${a} (see --help)`)
    else o.inputs.push(a.replace(/^~(?=$|\/)/, os.homedir()))
  }
  if (!o.inputs.length) die('Give at least one folder, video file, URL list (.txt) or URL. See --help.')
  if (!['link', 'copy', 'move'].includes(o.mode)) die('--mode must be link, copy or move')
  if (o.license && !LICENSES.includes(o.license)) die(`--license must be one of: ${LICENSES.join(', ')}`)
  return o
}

const C = process.stdout.isTTY ? { g: s => `\x1b[32m${s}\x1b[0m`, y: s => `\x1b[33m${s}\x1b[0m`, r: s => `\x1b[31m${s}\x1b[0m`, d: s => `\x1b[2m${s}\x1b[0m`, b: s => `\x1b[1m${s}\x1b[0m` }
  : { g: s => s, y: s => s, r: s => s, d: s => s, b: s => s }
function die(msg) { console.error(C.r(`✗ ${msg}`)); process.exit(1) }
const mb = n => `${(n / 1048576).toFixed(n > 1e9 ? 0 : 1)} MB`

// ── Prompts ──────────────────────────────────────────────────────────────────
function ask(q, { hidden = false } = {}) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    if (hidden) rl._writeToOutput = (s) => { if (s.includes(q)) process.stdout.write(s) }
    rl.question(q, ans => { rl.close(); if (hidden) process.stdout.write('\n'); resolve(ans.trim()) })
  })
}

// ── Library folder (same rule as backend/utils/localMedia.js) ───────────────
function libraryDir() {
  let dir = process.env.LIBRARY_DIR
  if (!dir) {
    try {
      const m = fs.readFileSync(path.join(ROOT, 'backend/.env'), 'utf8').match(/^\s*LIBRARY_DIR\s*=\s*(.+)\s*$/m)
      if (m) dir = m[1].replace(/^["']|["']$/g, '')
    } catch { /* no .env */ }
  }
  return path.resolve(dir || path.join(ROOT, 'backend/media'))
}

// ── Collecting inputs ────────────────────────────────────────────────────────
function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (e.isFile() && VIDEO.test(e.name) && !SKIP_PART.test(e.name)) out.push(p)
  }
}

/** Hint from the folders when the file name alone isn't enough ("Show/Season 2/E05.mp4") */
function folderHint(file) {
  const own = parseName(path.basename(file))
  const parts = path.dirname(file).split(path.sep).filter(Boolean).slice(-3)
  let season = null, show = ''
  for (let i = parts.length - 1; i >= 0; i--) {
    const sm = parts[i].match(/^(?:season|series|s)\s*0*(\d{1,2})$/i)
    if (sm && season == null) { season = Number(sm[1]); continue }
    if (/^(specials?|extras?|featurettes?|videos?|movies?|films?|shows?|tv|downloads?|media)$/i.test(parts[i])) continue
    show = parts[i]; break
  }
  const folder = show ? parseName(show) : null
  const hint = []
  // Plex-style ids in the folder ("Show (2005) {tmdb-57243}") always help
  if (folder && (folder.ids.tmdb || folder.ids.imdb) && !own.ids.tmdb && !own.ids.imdb) hint.push(show)
  // A file name with no real title borrows the folder's (and its season)
  else if (folder?.title && (own.title.replace(/[^a-z]/gi, '').length < 3 || /^(episode|ep|e|part)\b/i.test(own.title))) hint.push(show)
  if (hint.length && season != null && own.season == null) hint.push(`S${season}`)
  return hint.join(' ')
}

function collect(inputs, extraHint) {
  const local = [], urls = []
  for (const input of inputs) {
    if (/^https?:\/\//i.test(input)) { urls.push(input); continue }
    let st
    try { st = fs.statSync(input) } catch { console.warn(C.y(`! Not found, skipped: ${input}`)); continue }
    if (st.isDirectory()) {
      const files = []
      walk(input, files)
      files.forEach(f => local.push(f))
    } else if (/\.(txt|list|csv)$/i.test(input)) {
      for (const line of fs.readFileSync(input, 'utf8').split(/\r?\n/).map(l => l.trim())) if (line && !line.startsWith('#')) urls.push(line)
    } else if (VIDEO.test(input)) local.push(input)
    else console.warn(C.y(`! Not a video or URL list, skipped: ${input}`))
  }

  const items = []
  const seen = new Set()
  for (const file of local) {
    const abs = path.resolve(file)
    if (seen.has(abs)) continue
    seen.add(abs)
    const size = fs.statSync(abs).size
    // Samples are small and say so; real episodes rarely are under 40 MB AND named "sample"
    if (SKIP_NAME.test(path.basename(abs, path.extname(abs))) && size < 400 * 1048576) { console.log(C.d(`  skip extra/sample: ${path.basename(abs)}`)); continue }
    const hint = [folderHint(abs), extraHint].filter(Boolean).join(' ')
    const p = parseName(path.basename(abs))
    const merged = hint ? { ...p, ...Object.fromEntries(Object.entries(parseName(hint)).filter(([k, v]) => v != null && v !== '' && !(k === 'ids' && !Object.keys(v).length))) } : p
    items.push({ kind: 'file', src: abs, size, hint, parsed: merged })
  }
  for (const raw of [...new Set(urls)]) {
    const [url, ...rest] = raw.split('|').map(s => s.trim())
    const hint = [rest.join(' '), extraHint].filter(Boolean).join(' ')
    items.push({ kind: 'url', url, hint, parsed: parseName(hint || url.split('/').pop()) })
  }
  return items
}

// ── Where a file goes in the library folder ─────────────────────────────────
const clean = s => String(s).replace(/[\\/:*?"<>|\x00-\x1f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Untitled'
function destFor(item) {
  const p = item.parsed
  // Files that get converted are stored as .mp4
  const ext = item.prep && item.prep.action !== 'ok' ? '.mp4' : path.extname(item.src)
  const pad = n => String(n).padStart(2, '0')
  // A weak name ("E05.mp4") is stored under a descriptive one so it still matches without its folders
  const name = item.hint && p.title
    ? clean(p.episode != null ? `${p.title} S${pad(p.season ?? 1)}E${pad(p.episode)}` : `${p.title}${p.year ? ` (${p.year})` : ''}`) + ext
    : path.basename(item.src, path.extname(item.src)) + ext
  if (p.episode != null || p.season != null) {
    const show = clean(p.title || path.basename(path.dirname(item.src)))
    return path.join('Shows', show, `Season ${p.season ?? 1}`, name)
  }
  return path.join('Movies', name)
}

async function placeFile(src, dest, mode) {
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  if (mode === 'move') {
    try { fs.renameSync(src, dest); return 'moved' } catch (e) { if (e.code !== 'EXDEV') throw e }
    await copyWithProgress(src, dest); fs.unlinkSync(src); return 'moved'
  }
  if (mode === 'link') {
    try { fs.linkSync(src, dest); return 'linked' } catch (e) { if (!['EXDEV', 'EPERM', 'ENOTSUP'].includes(e.code)) throw e }
  }
  await copyWithProgress(src, dest)
  return 'copied'
}

function copyWithProgress(src, dest) {
  const total = fs.statSync(src).size
  let done = 0, last = 0
  const tmp = dest + '.part'
  return new Promise((resolve, reject) => {
    const r = fs.createReadStream(src), w = fs.createWriteStream(tmp)
    r.on('data', c => {
      done += c.length
      if (process.stdout.isTTY && Date.now() - last > 250) { last = Date.now(); process.stdout.write(`\r    copying ${path.basename(src)} ${Math.floor(done / total * 100)}%   `) }
    })
    r.on('error', reject); w.on('error', reject)
    w.on('finish', () => { if (process.stdout.isTTY) process.stdout.write('\r\x1b[K'); fs.renameSync(tmp, dest); resolve() })
    r.pipe(w)
  })
}

// ── Server API (signs in as you; refreshes the 15-minute token on its own) ───
class Server {
  constructor(base) { this.base = base; this.token = null; this.cookie = '' }

  async req(method, p, body, retry = true) {
    let res
    try {
      res = await fetch(`${this.base}/api${p}`, {
        method, headers: { 'Content-Type': 'application/json', ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}), ...(this.cookie ? { Cookie: this.cookie } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      })
    } catch { die(`Can't reach the Streamix server at ${this.base} — is it running? (npm run dev)`) }
    const setCookie = res.headers.getSetCookie?.() || []
    const rt = setCookie.map(c => c.split(';')[0]).filter(c => /refresh/i.test(c))
    if (rt.length) this.cookie = rt.join('; ')
    if (res.status === 401 && retry && this.cookie && !p.startsWith('/auth/')) {
      const r = await this.req('POST', '/auth/refresh', {}, false)
      this.token = r.token
      return this.req(method, p, body, false)
    }
    const text = await res.text()
    let data
    try { data = JSON.parse(text) } catch { data = { message: text.slice(0, 200) } }
    if (!res.ok) { const e = new Error(data.message || `Server answered ${res.status}`); e.status = res.status; throw e }
    return data
  }

  async login() {
    const email = process.env.STREAMIX_EMAIL || await ask('Admin email: ')
    const password = process.env.STREAMIX_PASSWORD || await ask('Password: ', { hidden: true })
    let u = await this.req('POST', '/auth/login', { email, password }).catch(e => die(`Sign-in failed: ${e.message}`))
    if (u.twoFactorRequired) {
      const code = await ask('Two-factor code (or a backup code): ')
      u = await this.req('POST', '/auth/2fa/verify', { challenge: u.challenge, code }).catch(e => die(`Sign-in failed: ${e.message}`))
    }
    if (!u.isAdmin) die(`${u.username} isn't an admin. Set isAdmin: true on your user in MongoDB first.`)
    this.token = u.token
    return u
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const o = parseArgs(process.argv.slice(2))
  const lib = libraryDir()
  console.log(C.b('Streamix library upload'))
  console.log(C.d(`  server ${o.server} · library folder ${lib}`))

  const items = collect(o.inputs, o.hint)
  if (!items.length) die('No videos or URLs found in what you gave.')
  const files = items.filter(i => i.kind === 'file'), urls = items.filter(i => i.kind === 'url')
  console.log(`\nFound ${files.length} video file${files.length === 1 ? '' : 's'}${files.length ? ` (${mb(files.reduce((a, f) => a + f.size, 0))})` : ''} and ${urls.length} URL${urls.length === 1 ? '' : 's'}.`)

  // Show how each name is understood
  for (const it of items) {
    const p = it.parsed
    const what = p.episode != null ? `${p.title || '?'} · S${p.season ?? 1}E${p.episode}` : `${p.title || '?'}${p.year ? ` (${p.year})` : ''}`
    const ids = p.ids?.tmdb ? ` ${C.d(`[${p.ids.type || 'tmdb'}:${p.ids.tmdb}]`)}` : p.ids?.imdb ? ` ${C.d(`[${p.ids.imdb}]`)}` : ''
    console.log(`  ${C.d('·')} ${path.basename(it.src || it.url)} ${C.d('→')} ${what}${ids}${it.hint ? C.d(`  (hint: ${it.hint})`) : ''}`)
  }

  // What it takes to make each file play in a browser (ffmpeg looks inside)
  const canPrep = !o.noConvert && files.length && await prep.hasFfmpeg()
  if (files.length && !o.noConvert && !canPrep) console.log(C.y('\n! ffmpeg isn’t installed — files are added as they are (MKV/HEVC may not play in browsers). Install ffmpeg to convert them.'))
  if (canPrep) {
    process.stdout.write('\nChecking what’s inside the files… ')
    for (const f of files) {
      try { const info = await prep.probe(f.src); f.prep = prep.plan(info, f.src); f.prep.duration = info.duration; f.prep.subs = info.subs.length }
      catch (e) { f.prep = { action: 'unsupported', reasons: [e.message.split('\n')[0]] } }
    }
    const n = a => files.filter(f => f.prep.action === a).length
    console.log(`done.\n  ${C.g(`${n('ok')} ready`)}, ${n('remux')} to re-pack (seconds), ${n('audio')} to fix audio (fast), ${C.y(`${n('transcode')} to re-encode`)}${n('transcode') ? C.d(' (a few minutes each)') : ''}${n('unsupported') ? `, ${C.r(`${n('unsupported')} unreadable`)}` : ''}`)
    const subs = files.reduce((a, f) => a + (f.prep.subs || 0) + prep.sidecarsOf(f.src).length, 0)
    if (subs) console.log(`  ${subs} subtitle track${subs === 1 ? '' : 's'} will be added`)
  }

  if (o.dry) {
    console.log(`\n${C.y('Dry run')} — nothing was copied or imported. Files would go to:`)
    files.forEach(f => console.log(`  ${path.join(lib, destFor(f))}${f.prep && f.prep.action !== 'ok' ? C.d(`  (${f.prep.action}: ${f.prep.reasons.join(', ')})`) : ''}`))
    return
  }

  // Rights: the server requires an explicit confirmation and a license for every import
  let license = o.license
  if (!license) {
    console.log(`\nHow do you have the right to stream these?\n${LICENSES.map((l, i) => `  ${i + 1}) ${l}`).join('\n')}`)
    license = LICENSES[Number(await ask('Choose 1-4: ')) - 1]
    if (!license) die('No license chosen')
  }
  if (!o.yes && !/^y(es)?$/i.test(await ask(`Confirm you hold the rights to stream all of these (${license}) [y/N]: `))) die('Cancelled')

  const server = new Server(o.server)
  const me = await server.login()
  console.log(C.g(`✓ Signed in as ${me.username}`))

  // Skip what's already there: same library path, same URL, or same file name + size
  const existing = await server.req('GET', '/admin/library')
  const byUrl = new Set(existing.map(e => e.videoUrl))
  const byNameSize = new Set(existing.filter(e => e.fileName && e.sizeBytes).map(e => `${e.fileName}|${e.sizeBytes}`))

  const lines = [], report = []
  for (const f of files) {
    const rel = destFor(f)
    const key = 'local:' + rel.split(path.sep).join('/')
    if (byUrl.has(key) || byNameSize.has(`${path.basename(f.src)}|${f.size}`)) { report.push({ source: f.src, status: 'skipped', reason: 'Already in the library' }); continue }
    const dest = path.join(lib, rel)
    if (fs.existsSync(dest) && fs.statSync(dest).size !== f.size) { report.push({ source: f.src, status: 'failed', reason: `A different file already uses ${rel}` }); continue }
    if (f.prep?.action === 'unsupported') { report.push({ source: f.src, status: 'failed', reason: `Can't read this video: ${f.prep.reasons.join(', ')}` }); continue }
    if (!fs.existsSync(dest)) {
      try {
        if (f.prep && f.prep.action !== 'ok') {
          // Convert straight into the library folder (the original stays where it is unless --mode move)
          const label = { remux: 're-packing', audio: 'fixing audio', transcode: 're-encoding' }[f.prep.action]
          const t0 = Date.now()
          const r = await prep.prepare(f.src, dest, { audioLang: o.audio, crf: o.crf, preset: o.preset,
            onProgress: (_s, frac) => { if (process.stdout.isTTY) process.stdout.write(`\r    ${label} ${path.basename(f.src)} ${Math.floor(frac * 100)}%   `) } })
          if (process.stdout.isTTY) process.stdout.write('\r\x1b[K')
          console.log(C.d(`  ${{ remux: 're-packed', audio: 'audio fixed', transcode: 're-encoded' }[f.prep.action]} → ${rel} (${Math.round((Date.now() - t0) / 1000)}s)${r.subtitles.length ? ` + ${r.subtitles.length} subtitle${r.subtitles.length === 1 ? '' : 's'}` : ''}`))
          if (r.skippedSubs.length) console.log(C.y(`    ! subtitles not converted: ${r.skippedSubs.join(', ')}`))
          if (o.mode === 'move') fs.unlinkSync(f.src)
        } else {
          const how = await placeFile(f.src, dest, o.mode)
          // Already browser-ready: still pick up its subtitles (inside, or .srt/.ass beside it)
          const r = canPrep && (f.prep?.subs || prep.sidecarsOf(f.src).length) ? await prep.prepare(f.src, dest).catch(() => null) : null
          console.log(C.d(`  ${how} → ${rel}${r?.subtitles.length ? ` + ${r.subtitles.length} subtitle${r.subtitles.length === 1 ? '' : 's'}` : ''}`))
        }
      } catch (e) {
        report.push({ source: f.src, status: 'failed', reason: `Couldn't put it in the library folder: ${e.message}` }); continue
      }
    }
    lines.push({ line: [key, f.hint].filter(Boolean).join(' | '), source: f.src, hint: f.hint })
  }
  for (const u of urls) {
    if (byUrl.has(u.url)) { report.push({ source: u.url, status: 'skipped', reason: 'Already in the library' }); continue }
    lines.push({ line: [u.url, u.hint].filter(Boolean).join(' | '), source: u.url, hint: u.hint })
  }

  // Import in batches; the server finds and links TMDB titles
  const results = []
  for (let i = 0; i < lines.length; i += BATCH) {
    const batch = lines.slice(i, i + BATCH)
    process.stdout.write(`\nImporting ${i + 1}-${i + batch.length} of ${lines.length}… `)
    const r = await server.req('POST', '/admin/library/import', { lines: batch.map(b => b.line), license, confirmRights: true, matchTmdb: o.match })
    console.log(`${C.g(`${r.added} added`)}${r.failed ? `, ${C.r(`${r.failed} failed`)}` : ''}`)
    // The server de-duplicates lines, so match results back by line text
    for (const res of r.results) {
      const b = batch.find(x => x.line === res.line)
      results.push({ ...res, source: b?.source || res.line, hint: b?.hint || '' })
    }
  }

  const unsure = []
  for (const r of results) {
    if (!r.ok) { report.push({ source: r.source, status: r.error === 'Already in the library' ? 'skipped' : 'failed', reason: r.error }); continue }
    const sure = r.tmdbId && (r.confidence == null || r.confidence >= SURE) && !(r.mediaType === 'tv' && /needs season/.test(r.linked))
    const mark = sure ? C.g('✓') : C.y('?')
    console.log(`  ${mark} ${r.title}${r.year ? ` (${r.year})` : ''} ${C.d('—')} ${r.linked}${r.confidence != null ? C.d(` · ${Math.round(r.confidence * 100)}%`) : ''}`)
    report.push({ source: r.source, status: sure ? 'linked' : 'unsure', id: r.id, title: r.title, linked: r.linked, confidence: r.confidence })
    if (!sure) unsure.push(r)
  }

  // Review the unsure ones
  if (unsure.length && o.review && process.stdin.isTTY) {
    console.log(`\n${C.b(`${unsure.length} need a look.`)} Pick a number, type movie:ID or "tv:ID s1e2", or press Enter to skip.`)
    for (const r of unsure) {
      const s = await server.req('GET', `/admin/library/${r.id}/suggest${r.hint ? `?hint=${encodeURIComponent(r.hint)}` : ''}`).catch(() => null)
      console.log(`\n${C.b(r.title)} ${C.d(`(${path.basename(r.source)})`)}`)
      const sug = (s?.suggestions || []).slice(0, 5)
      if (!sug.length) console.log(C.d('  No good guesses — type movie:ID or "tv:ID s1e2" (ids are in themoviedb.org links).'))
      sug.forEach((x, i) => console.log(`  ${i + 1}) ${x.title}${x.year ? ` (${x.year})` : ''}${x.mediaType === 'tv' && x.episode != null ? ` · S${x.season ?? 1}E${x.episode}` : ''} ${C.d(`${x.mediaType}:${x.tmdbId} · ${Math.round((x.confidence || 0) * 100)}%`)}`))
      const ans = await ask('  > ')
      if (!ans) continue
      let link = ans
      const n = Number(ans)
      if (Number.isInteger(n) && sug[n - 1]) {
        const x = sug[n - 1]
        link = `${x.mediaType}:${x.tmdbId}`
        if (x.mediaType === 'tv') link += ` ${x.episode != null ? `s${x.season ?? 1}e${x.episode}` : await ask('  Season/episode (e.g. s1e2): ')}`
      }
      try {
        const doc = await server.req('PUT', `/admin/library/${r.id}`, { link })
        console.log(C.g(`  ✓ ${doc.linked}`))
        const row = report.find(x => x.id === r.id); if (row) Object.assign(row, { status: 'linked', linked: doc.linked, confidence: 1 })
      } catch (e) { console.log(C.r(`  ✗ ${e.message}`)) }
    }
  }

  // Summary + report
  const count = s => report.filter(r => r.status === s).length
  console.log(`\n${C.b('Done.')} ${C.g(`${count('linked')} linked`)}, ${C.y(`${count('unsure')} unsure`)}, ${count('skipped')} skipped, ${C.r(`${count('failed')} failed`)}`)
  report.filter(r => r.status === 'failed').forEach(r => console.log(C.r(`  ✗ ${path.basename(r.source)}: ${r.reason}`)))
  if (count('unsure')) console.log(C.d('  Unsure items still play; fix their links any time in Admin → Library or run this again with the same files.'))
  const out = o.report || path.join(os.tmpdir(), `streamix-upload-${Date.now()}.json`)
  fs.writeFileSync(out, JSON.stringify(report, null, 2))
  console.log(C.d(`  Report: ${out}`))
}

main().catch(e => die(e.message))
