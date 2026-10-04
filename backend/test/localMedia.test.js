// Local library files can't escape the library folder
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const os = require('os')
const path = require('path')

test('local media paths stay inside LIBRARY_DIR', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sx-lib-'))
  process.env.LIBRARY_DIR = dir
  delete require.cache[require.resolve('../utils/localMedia')]
  const lm = require('../utils/localMedia')
  fs.mkdirSync(path.join(dir, 'Movies'))
  fs.writeFileSync(path.join(dir, 'Movies', 'Nosferatu (1922).mp4'), 'x')

  assert.ok(lm.isLocal('local:Movies/a.mp4'))
  assert.ok(!lm.isLocal('https://x/a.mp4'))
  assert.strictEqual(lm.resolve('local:../etc/passwd'), null)
  assert.strictEqual(lm.resolve('local:/etc/passwd'), null)
  assert.strictEqual(lm.resolve('local:Movies/../../x.mp4'), null)
  const f = lm.inspect('local:Movies/Nosferatu (1922).mp4')
  assert.strictEqual(f.size, 1)
  assert.throws(() => lm.inspect('local:Movies/missing.mp4'), /not found/)
  assert.throws(() => lm.inspect('local:Movies/notes.txt'), /video file/)
  fs.rmSync(dir, { recursive: true })
})
