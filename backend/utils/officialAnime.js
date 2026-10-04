// utils/officialAnime.js — official, free anime that rights holders publish on YouTube. Pure helpers, unit-tested.
//
// Channels like Muse Asia, Ani-One and GUNDAM post full licensed episodes for free. Their uploads are mixed with
// trailers, openings, clips, live streams and podcasts, and titles carry boilerplate ("[English Sub] | Muse Asia",
// "(w/subtitles)"), so each video is:
//   1. cleaned — channel boilerplate and language tags removed, then read by the library's file-name parser;
//   2. classified — full episode / movie / skip, from the title and (with a YouTube API key) its length;
//      channels that mostly post clips ("mixed") only count a video when its length says it's a full episode;
//   3. grouped by series, so a show is matched to TMDB once and every episode is placed by its number;
//   4. kept only while it plays here: YouTube's embeddable flag and region list, plus what viewers' players
//      report (a Beta posterior of "played" vs "blocked", fading over 30 days — region rules change).

/** Verified channel ids (checked against each channel's public feed). mode: 'episodes' | 'mixed' */
const DEFAULT_CHANNELS = [
  { id: 'UCGbshtvS9t-8CW11W7TooQg', name: 'Muse Asia',            mode: 'episodes' },
  { id: 'UCrWNiNprIWU1nj0Zm6t1IWg', name: 'Ani-One Asia',         mode: 'episodes' },
  { id: 'UCGc153XWQx05KVkm13BVYpw', name: 'Ani-One Ultra',        mode: 'episodes' },
  { id: 'UCejtUitnpnf8Be-v5NuDSLw', name: 'GUNDAM CHANNEL INTL',  mode: 'episodes' },
  { id: 'UCQYYekTKCb1y12sas08T6gQ', name: 'Toei Animation',       mode: 'mixed' },
  { id: 'UC6pGDc4bFGD1_36IKv3FnYg', name: 'Crunchyroll',          mode: 'mixed' },
  { id: 'UCPZkYpT5XIUou8sV8zk-3jQ', name: 'RetroCrush',           mode: 'mixed' },
  { id: 'UCWcTTRbmxbVM9HF8eKsDSBg', name: 'Discotek Media',       mode: 'mixed' },
  // Chinese animation (donghua) — the studios' own channels; full episodes, trailers and highlights mixed, but
  // their titles say which is which (预告 trailer, 抢先看 sneak peek, 精彩片段 highlight, 限时免费 free episode)
  { id: 'UCcYw1UUwxjIMYfvmdQrcyUA', name: 'YOUKU ANIMATION',      mode: 'episodes' },
  { id: 'UCQe8YEJaNoqWQCiw0p6XjXg', name: 'iQIYI Animation',      mode: 'episodes' },
  { id: 'UCdpiId0eJGnnIvfhpbJIM1w', name: 'Tencent Video Animation', mode: 'episodes' },
]

const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/

/** "PT1H2M3S" → 3723 */
function isoDuration(s) {
  const m = String(s || '').match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/)
  if (!m) return null
  return ((+m[1] || 0) * 86400) + ((+m[2] || 0) * 3600) + ((+m[3] || 0) * 60) + (+m[4] || 0)
}

const BOILER = [
  /\|\s*[^|]*$/,                                              // "… | Muse Asia", "… | Dragon Ball Z | Episode 3" handled below
  /[[(（【]\s*(?:eng(?:lish)?|multi|indo|thai|viet|chinese|malay|hindi|spanish|portuguese|arabic)?[\s-]*(?:sub(?:title)?s?|dub(?:bed)?)[^\])）】]*[\])）】]/gi,
  /\(\s*w\/\s*subtitles\s*\)/gi,
  /\b(?:full episode|official|hd|eng sub|english sub|english dub|multi[- ]subs?|sub ver(?:sion)?|dub ver(?:sion)?)\b/gi,
  /[【[]\s*[A-Z]{2,5}\s*[】\]]/g,                              // 【GMM】
]

/**
 * "Frieren - Episode 12 [English Sub] | Muse Asia" → "Frieren - Episode 12"
 * Titles that put the series in the middle ("The Sword vs. The Finger | Dragon Ball Z | Episode 122") keep the
 * series and the episode part.
 */
function cleanTitle(raw) {
  let t = String(raw || '').replace(/\s+/g, ' ').trim()
  // Toei writes "… l ONE PIECE l Episode 1180" with a lowercase L as the separator
  if (/\sl\s.*\b(episode|ep)\b/i.test(t)) t = t.replace(/\s+l\s+/g, ' | ')
  const parts = t.split(/\s+\|\s+/)
  if (parts.length >= 3) {
    // "<scene title> | <series> | Episode N" → "<series> Episode N"
    const ep = parts.find(p => /\b(episode|ep\.?|#)\s*\d/i.test(p))
    const series = parts.find(p => p !== ep && p !== parts[0]) || parts[1]
    t = `${series} ${ep || ''}`.trim()
  } else {
    for (const re of BOILER) t = t.replace(re, ' ')
  }
  for (const re of BOILER.slice(1)) t = t.replace(re, ' ')
  return t.replace(/\s+/g, ' ').replace(/\s*[-–:|]\s*$/, '').trim()
}

// ── Chinese titles (donghua channels) ───────────────────────────────────────
const CJK = /[\u3400-\u9fff\uf900-\ufaff]/
// Status / language tags in brackets: 【限时免费】 limited-time free, 【会员专享】 members, 【LIMITED FREE】…
const TAG = /【\s*(?:限时免费|limited free|会员专享[^】]*|members only|multi ?subs?|eng ?subs?|加入会员专享最新集|新番上线|独播|完整版|独家)\s*】/gi
// Channel names, language labels, hashtags
const NOISE = /\b(?:multi ?subs?|multisub|eng ?subs?|engsub|full ?hd|1080p|4k|youku animation|iqiyi animation|tencent video|get the \w+ app|get app now)\b|优酷动漫|腾讯视频\s*[-–]?\s*动漫|腾讯视频|爱奇艺国漫|爱奇艺|哔哩哔哩|#\S+/gi
// Several episodes in one video can't be one episode's source
const COMPILATION = /\b(?:ep|episode)s?\.?\s*\d{1,4}\s*[-–~～]\s*\d{1,4}\b|全集|合集|complete series|\bfull\b(?!\s*episode)|marathon/i
// Yearly-run markers aren't part of the show's name ("逆天邪神 年番" is Against the Gods)
const YEARLY = /\s*(?:年番|周番)\s*\d*\s*$/

/** "永夜之王 King of Eternal Night" → { cjk: '永夜之王', latin: 'King of Eternal Night' } */
function splitNames(s) {
  const str = String(s || '').replace(NOISE, ' ').replace(/\s+/g, ' ').trim()
  const cjk = (str.match(/[\u3400-\u9fff\uf900-\ufaff][\u3400-\u9fff\uf900-\ufaff0-9０-９：:·・，,！!？?\s]*[\u3400-\u9fff\uf900-\ufaff0-9]|[\u3400-\u9fff\uf900-\ufaff]/) || [''])[0].trim()
  const latin = str.replace(cjk, ' ').replace(/[^A-Za-z0-9'’:\-\s]/g, ' ').replace(/\s+/g, ' ').trim()
  return { cjk: cjk.replace(YEARLY, '').trim(), latin: /[A-Za-z]{2}/.test(latin) ? latin : '' }
}

/**
 * Reads an official upload's title → { title, alt, season, episode, compilation }.
 * English-style titles go through the library's file-name parser (parseName); Chinese-style ones
 * ("【永夜之王 King of Eternal Night】EP13 | MULTISUB | 优酷动漫", "【限时免费】逆天邪神 年番 | EP55：暂别… | 爱奇艺国漫",
 * "MULTI SUB《大夏守墓人》The Guardian of Daxia Ep01") are read here: title = the Chinese name (TMDB keeps it as the
 * original title), alt = the English one.
 */
function readTitle(raw, parseName) {
  let t = String(raw || '').replace(/｜/g, '|').replace(/：/g, ':').replace(/\s+/g, ' ').trim()
  const compilation = COMPILATION.test(t)
  if (!CJK.test(t) && !/[《【]/.test(t)) {
    const p = parseName(cleanTitle(t))
    return { title: p.title, alt: '', season: p.season, episode: p.episode, compilation }
  }
  const em = t.match(/\b(?:ep|episode)\.?\s*0*(\d{1,4})\b/i) || t.match(/第\s*0*(\d{1,4})\s*[集话話]/) || t.match(/#0*(\d{1,4})\b/)
  const sm = t.match(/第\s*(\d{1,2})\s*季/) || t.match(/\bseason\s*(\d{1,2})\b/i)
  t = t.replace(TAG, ' ')
  let names = null
  const book = t.match(/《([^》]+)》\s*([A-Za-z][A-Za-z0-9'’:\-\s]*?)?(?=\s*(?:\||\bep\b|\bep\d|\bepisode\b|【|$))/i)
  const bracket = t.match(/【([^】]+)】/)
  if (book) names = { cjk: splitNames(book[1]).cjk || book[1].trim(), latin: (book[2] || '').trim() }
  else if (bracket && splitNames(bracket[1]).cjk) names = splitNames(bracket[1])
  else {
    // "择日飞升 | EP12: … | 爱奇艺国漫": the part that names the show — not the episode part, not channel noise,
    // not an exclamation (iQIYI puts a scene description first: "许应开天眼挥鞭伐瘟神！")
    const parts = t.split(/\s*\|\s*/).map(x => x.trim()).filter(Boolean)
    const cand = parts.filter(x => !/\b(?:ep|episode)\.?\s*\d/i.test(x) && x.replace(NOISE, '').replace(/[\s【】]/g, '') && !/[！!？?]\s*$/.test(x))
    names = splitNames(cand[0] || parts[0] || '')
  }
  return {
    title: names.cjk || names.latin, alt: names.cjk ? names.latin : '',
    season: sm ? Number(sm[1]) : null, episode: em ? Number(em[1]) : null, compilation,
  }
}

// Things that are never a full episode
const NOT_EPISODE_CJK = /预告|抢先看|精彩|看点|花絮|片段|先导|特辑|彩蛋|片头曲|片尾曲|主题曲|混剪|速看|解说|回顾|名场面|建模/
const NOT_EPISODE = /\b(trailer|teaser|pv|promo|preview|announcement|opening|ending|op\d*|ed\d*|creditless|ncop|nced|clip|highlights?|recap|reaction|podcast|live ?stream|watch party|catch ?up|interview|behind the scenes|making of|music video|mv|amv|shorts?|#shorts|countdown|premiere event|commercial|cm|special message|asmr|karaoke|cover|lyric)\b/i

/**
 * → { kind: 'episode' | 'movie' | 'skip', reason }
 * v: { title, duration (s, may be null), parsed: parseName(cleanTitle(title)) }, mode: channel mode
 */
function classify(v, mode = 'episodes') {
  const title = String(v.title || '')
  if (NOT_EPISODE.test(title) || NOT_EPISODE_CJK.test(title)) return { kind: 'skip', reason: 'not an episode' }
  if (v.parsed?.compilation) return { kind: 'skip', reason: 'several episodes in one video' }
  const d = v.duration
  const hasEp = v.parsed?.episode != null
  if (d != null) {
    // Some donghua run 5–8 minutes an episode; trailers and highlights are under 3
    if (d < 3 * 60) return { kind: 'skip', reason: 'too short' }
    if (hasEp) return d < 12 * 60 && mode === 'mixed' ? { kind: 'skip', reason: 'clip-length' } : { kind: 'episode', reason: 'episode' }
    if (d >= 60 * 60) return { kind: 'movie', reason: 'feature length' }
    return mode === 'mixed' ? { kind: 'skip', reason: 'no episode number' } : { kind: 'skip', reason: 'no episode number' }
  }
  // No length known (no API key): trust only channels that post full episodes, and clear episode titles
  if (mode === 'mixed') return { kind: 'skip', reason: 'length unknown on a clip channel' }
  if (hasEp) return { kind: 'episode', reason: 'episode title' }
  if (/\b(the movie|movie|film)\b/i.test(title)) return { kind: 'movie', reason: 'movie title' }
  return { kind: 'skip', reason: 'no episode number' }
}

/** Series grouping key: the parsed title, lowercase, no punctuation, plus the season if one was named */
function seriesKey(parsed) {
  const t = String(parsed?.title || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
  return t ? `${t}${parsed.season != null ? `#s${parsed.season}` : ''}` : ''
}

/**
 * Plays here? Beta(ok+2, blocked+1) with 30-day fading. Hidden once two or more fresh "blocked" reports
 * outweigh plays (P(ok) < 0.35).
 */
function playable(stat = {}, now = Date.now()) {
  if (stat.embeddable === false || stat.regionBlocked === true) return false
  const f = stat.at ? Math.pow(0.5, Math.max(0, now - new Date(stat.at).getTime()) / (30 * 86400000)) : 1
  const ok = (stat.ok || 0) * f, bad = (stat.blocked || 0) * f
  if (bad < 2) return true
  return (ok + 2) / (ok + bad + 3) >= 0.35
}

/** Region rule from the YouTube API (contentDetails.regionRestriction) for one ISO country */
function regionBlocked(rr, region) {
  if (!rr || !region) return false
  const R = String(region).toUpperCase()
  if (Array.isArray(rr.allowed)) return !rr.allowed.includes(R)
  if (Array.isArray(rr.blocked)) return rr.blocked.includes(R)
  return false
}

/** Minimal YouTube feed parser (Atom): [{ videoId, title, published }] */
function parseFeed(xml) {
  const out = []
  for (const e of String(xml || '').split('<entry>').slice(1)) {
    const id = e.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1]
    const title = e.match(/<title>([^<]*)<\/title>/)?.[1]
    const published = e.match(/<published>([^<]+)<\/published>/)?.[1]
    if (id && VIDEO_ID.test(id) && title) out.push({ videoId: id, title: decodeXml(title), published: published ? new Date(published) : null })
  }
  return out
}
const decodeXml = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))

/** A channel id from what an admin pasted: "UC…", ".../channel/UC…", or null (handles need a lookup) */
function channelIdFrom(input) {
  const s = String(input || '').trim()
  if (CHANNEL_ID.test(s)) return s
  const m = s.match(/youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})/)
  return m ? m[1] : null
}
/** "@MuseAsia" / "youtube.com/@MuseAsia" → "MuseAsia" */
function handleFrom(input) {
  const m = String(input || '').trim().match(/(?:youtube\.com\/)?@([A-Za-z0-9._-]{3,30})/)
  return m ? m[1] : null
}

module.exports = { readTitle, splitNames, DEFAULT_CHANNELS, CHANNEL_ID, VIDEO_ID, isoDuration, cleanTitle, classify, seriesKey, playable, regionBlocked, parseFeed, channelIdFrom, handleFrom }
