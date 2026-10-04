const test = require('node:test')
const assert = require('node:assert')
const o = require('../utils/officialAnime')
const { parseName } = require('../utils/mediaMatcher')

const read = (title) => { const t = o.cleanTitle(title); const p = parseName(t); return { t, title: p.title, season: p.season, episode: p.episode } }

test('real channel titles are cleaned and read', () => {
  assert.deepStrictEqual(read('A Certain Magical Index - Episode 02 (S1E02) [English Sub]'), { t: 'A Certain Magical Index - Episode 02 (S1E02)', title: 'A Certain Magical Index', season: 1, episode: 2 })
  assert.deepStrictEqual(read('A Tale of the Secret Saint - Episode 02 [English Sub] | Muse Asia'), { t: 'A Tale of the Secret Saint - Episode 02', title: 'A Tale of the Secret Saint', season: null, episode: 2 })
  assert.strictEqual(read('Mobile Suit Gundam the Witch from Mercury #5 (w/subtitles)').episode, 5)
  assert.deepStrictEqual(read('The Sword vs. The Finger | Dragon Ball Z | Episode 122'), { t: 'Dragon Ball Z Episode 122', title: 'Dragon Ball Z', season: null, episode: 122 })
  assert.deepStrictEqual(read("I'll show you the dominance of god! l ONE PIECE l Episode 1180"), { t: 'ONE PIECE Episode 1180', title: 'ONE PIECE', season: null, episode: 1180 })
  assert.strictEqual(o.cleanTitle('【GMM】Mobile Suit Gundam NT (Sub ver)'), 'Mobile Suit Gundam NT')
})

test('episodes vs everything else', () => {
  const v = (title, duration) => ({ title, duration, parsed: parseName(o.cleanTitle(title)) })
  assert.strictEqual(o.classify(v('Frieren - Episode 12 [English Sub]', null)).kind, 'episode')
  assert.strictEqual(o.classify(v('Frieren - Episode 12 [English Sub]', 24 * 60)).kind, 'episode')
  assert.strictEqual(o.classify(v('Frieren Season 2 - Official Trailer', null)).kind, 'skip')
  assert.strictEqual(o.classify(v('Black Clover Catch Up Watch Party | Watch Full Episodes LIVE', 3 * 3600)).kind, 'skip')
  assert.strictEqual(o.classify(v('The Sword vs. The Finger | Dragon Ball Z | Episode 122', 3 * 60), 'mixed').kind, 'skip')   // a clip
  assert.strictEqual(o.classify(v('The Sword vs. The Finger | Dragon Ball Z | Episode 122', null), 'mixed').kind, 'skip')    // can't tell → no
  assert.strictEqual(o.classify(v('Dragon Ball Z | Episode 1 | Full Episode', 23 * 60), 'mixed').kind, 'episode')
  assert.strictEqual(o.classify(v('Mobile Suit Gundam NT (Sub ver)', 110 * 60)).kind, 'movie')
  assert.strictEqual(o.classify(v('Bro Doesn\'t Need Any Powers | Daemons of the Shadow Realm', 70)).kind, 'skip')
})

test('durations, feeds, channel inputs', () => {
  assert.strictEqual(o.isoDuration('PT23M40S'), 1420)
  assert.strictEqual(o.isoDuration('PT1H2M3S'), 3723)
  assert.strictEqual(o.isoDuration('nonsense'), null)
  const xml = '<feed><title>Muse Asia</title><entry><yt:videoId>abcdefghijk</yt:videoId><title>Show &amp; Tell - Episode 1</title><published>2026-10-01T10:00:00+00:00</published></entry></feed>'
  assert.deepStrictEqual(o.parseFeed(xml).map(e => [e.videoId, e.title]), [['abcdefghijk', 'Show & Tell - Episode 1']])
  assert.strictEqual(o.channelIdFrom('https://www.youtube.com/channel/UCGbshtvS9t-8CW11W7TooQg'), 'UCGbshtvS9t-8CW11W7TooQg')
  assert.strictEqual(o.channelIdFrom('@MuseAsia'), null)
  assert.strictEqual(o.handleFrom('https://www.youtube.com/@MuseAsia/videos'), 'MuseAsia')
})

test('playability: API flags, region lists, and learned reports', () => {
  assert.strictEqual(o.playable({}), true)
  assert.strictEqual(o.playable({ embeddable: false }), false)
  assert.strictEqual(o.regionBlocked({ allowed: ['IN', 'PH'] }, 'ke'), true)
  assert.strictEqual(o.regionBlocked({ blocked: ['US'] }, 'KE'), false)
  assert.strictEqual(o.playable({ blocked: 1 }), true)                       // one report isn't enough
  assert.strictEqual(o.playable({ blocked: 3, at: new Date() }), false)
  assert.strictEqual(o.playable({ blocked: 3, ok: 10, at: new Date() }), true)
  assert.strictEqual(o.playable({ blocked: 3, at: new Date(Date.now() - 120 * 86400000) }), true) // old reports fade
})

test('donghua channel titles: series, English name, episode, and what to skip', () => {
  const r = (t) => { const x = o.readTitle(t, parseName); return [x.title, x.alt, x.episode, x.compilation] }
  assert.deepStrictEqual(r('【永夜之王 King of Eternal Night】EP13 | MULTISUB | 优酷动漫  YOUKU ANIMATION'), ['永夜之王', 'King of Eternal Night', 13, false])
  assert.deepStrictEqual(r('【限时免费】逆天邪神 年番 | EP55：暂别倾月启程神凰 | 爱奇艺国漫'), ['逆天邪神', '', 55, false])
  assert.deepStrictEqual(r('【限时免费】大主宰年番2 | EP91：通关之法 | 爱奇艺国漫【加入会员专享最新集】'), ['大主宰', '', 91, false])
  assert.deepStrictEqual(r('【会员专享 Members Only】MULTI SUB《大夏守墓人》The Guardian of Daxia Ep01 | 腾讯视频-动漫'), ['大夏守墓人', 'The Guardian of Daxia', 1, false])
  assert.deepStrictEqual(r('万界至尊 | EP156：入仙级道台 | 爱奇艺国漫 iQIYI Animation | 【加入会员专享最新集】'), ['万界至尊', '', 156, false])
  assert.strictEqual(r('【机械飞升 Mechanical Ascension】EP01-10 FULL | 优酷动漫  YOUKU ANIMATION')[3], true)
  assert.strictEqual(r('【Multi Sub】系列全集： 无惧落雨和飞雪 习得灵武为红颜 | 灵武大陆 | 爱奇艺国漫')[3], true)
  const kind = (t, d = null) => o.classify({ title: t, duration: d, parsed: o.readTitle(t, parseName) }).kind
  assert.strictEqual(kind('【抢先看】云澈结识顶级大盗！| 逆天邪神 年番  | EP56 | 爱奇艺国漫'), 'skip')            // sneak peek
  assert.strictEqual(kind('【师兄啊师兄 Big Brother】EP161 精彩看点 Highlight | MULTISUB | 优酷动漫 YOUKU ANIMATION'), 'skip')
  assert.strictEqual(kind('【预告 Trailer】MULTI SUB《大夏守墓人》EP05 | The Guardian of Daxia | 腾讯视频 - 动漫'), 'skip')
  assert.strictEqual(kind('【深渊之上 Above the Abyss】EP14 | MULTISUB | 优酷动漫  YOUKU ANIMATION', 353), 'episode') // a 6-minute donghua episode
  assert.strictEqual(kind('【机械飞升 Mechanical Ascension】EP01-10 FULL | 优酷动漫', 3610), 'skip')
})
