#!/usr/bin/env node
// Starts the backend (http://localhost:5000) and the Vite dev server (http://localhost:5173)
// together, prefixing their output. Ctrl+C stops both.
const { spawn } = require('child_process')
const path = require('path')

const root = path.join(__dirname, '..')
const npm  = process.platform === 'win32' ? 'npm.cmd' : 'npm'

const procs = [
  // PORT is pinned so a PORT set in the parent shell (some launchers do this) can't collide with Vite
  { name: 'api', color: '\x1b[31m', cmd: process.execPath, args: ['--watch', 'server.js'], cwd: path.join(root, 'backend'),
    env: { PORT: process.env.API_PORT || '5000' } },
  { name: 'web', color: '\x1b[36m', cmd: npm, args: ['run', 'dev', '--', '--host', '127.0.0.1'], cwd: path.join(root, 'frontend'),
    env: { STREAMIX_BACKEND: `http://localhost:${process.env.API_PORT || '5000'}` } },
]

const children = procs.map(p => {
  const child = spawn(p.cmd, p.args, { cwd: p.cwd, env: { ...process.env, FORCE_COLOR: '1', ...p.env } })
  const prefix = `${p.color}[${p.name}]\x1b[0m `
  const pipe = (stream, out) => {
    let buf = ''
    stream.on('data', d => {
      buf += d
      const lines = buf.split('\n')
      buf = lines.pop()
      lines.forEach(l => out.write(prefix + l + '\n'))
    })
  }
  pipe(child.stdout, process.stdout)
  pipe(child.stderr, process.stderr)
  child.on('exit', code => {
    console.log(`${prefix}exited with code ${code}`)
    shutdown(code || 0)
  })
  return child
})

let stopping = false
function shutdown(code) {
  if (stopping) return
  stopping = true
  children.forEach(c => { try { c.kill('SIGINT') } catch { /* already gone */ } })
  setTimeout(() => process.exit(code), 500)
}
process.on('SIGINT',  () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))
