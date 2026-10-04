const test = require('node:test')
const assert = require('node:assert')
const { parseName, placeEpisode } = require('../utils/mediaMatcher')

const pick = (n) => { const p = parseName(n); return { title: p.title, season: p.season, episode: p.episode } }

test('anime release names', () => {
  assert.deepStrictEqual(pick('[SubsPlease] Sousou no Frieren - 12 (1080p) [ABCD1234].mkv'), { title: 'Sousou no Frieren', season: null, episode: 12 })
  assert.deepStrictEqual(pick('Dandadan 03 VOSTFR.mp4'), { title: 'Dandadan', season: null, episode: 3 })
  assert.deepStrictEqual(pick('Bleach 366.mkv'), { title: 'Bleach', season: null, episode: 366 })
  assert.deepStrictEqual(pick('Mobile Suit Gundam the Witch from Mercury #5 (w/subtitles)'), { title: 'Mobile Suit Gundam the Witch from Mercury', season: null, episode: 5 })
  assert.deepStrictEqual(pick('A Certain Magical Index - Episode 02 (S1E02) [English Sub]'), { title: 'A Certain Magical Index', season: 1, episode: 2 })
  assert.deepStrictEqual(pick('[SubsPlease] Spy x Family - 25v2 (1080p).mkv'), { title: 'Spy x Family', season: null, episode: 25 })
})

test('numbers that belong to the title stay there', () => {
  assert.deepStrictEqual(pick('Apollo 13.mp4'), { title: 'Apollo 13', season: null, episode: null })
  assert.deepStrictEqual(pick("Ocean's 11 (2001).mkv"), { title: "Ocean's 11", season: null, episode: null })
  // ambiguous: parsed as an episode, but the other reading is kept for the matcher
  assert.strictEqual(parseName('Fahrenheit 451 (1966).mkv').bare.title, 'Fahrenheit 451')
  assert.strictEqual(parseName('Fahrenheit 451 (1966).mkv').year, '1966')
})

test('episode placement: per season, straight-through, and fansub season overflow', () => {
  const seasons = [{ n: 0, eps: 5 }, { n: 1, eps: 25 }, { n: 2, eps: 12 }, { n: 3, eps: 22 }]
  assert.deepStrictEqual(placeEpisode(seasons, 2, 5), { season: 2, episode: 5 })
  assert.deepStrictEqual(placeEpisode(seasons, null, 30), { season: 2, episode: 5 })      // absolute, specials skipped
  assert.deepStrictEqual(placeEpisode(seasons, 3, 49), { season: 3, episode: 12 })         // "S3 - 49"
  assert.deepStrictEqual(placeEpisode(seasons, 3, 20), { season: 3, episode: 20 })
  assert.strictEqual(placeEpisode(seasons, 3, 5 + 60), null)                                // past the end
  assert.strictEqual(placeEpisode(seasons, 3, 30), null)                                   // overflow that lands before S3
})
