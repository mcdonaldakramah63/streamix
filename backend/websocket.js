// backend/websocket.js — NEW FILE
// Real-time watch progress sync via WebSockets
// Attach to your Express server in server.js

const WebSocket = require('ws')
const jwt       = require('jsonwebtoken')
const url       = require('url')

// Connected clients: Map<userId, Set<ws>>
const clients = new Map()

function setupWebSocket(server) {
  const wss = new WebSocket.Server({ server, path: '/ws' })

  wss.on('connection', (ws, req) => {
    // Authenticate via token in query string
    const { query } = url.parse(req.url, true)
    const token = query.token

    let userId = null
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET)
      userId = decoded.id
    } catch {
      ws.close(1008, 'Invalid token')
      return
    }

    // Register client
    if (!clients.has(userId)) clients.set(userId, new Set())
    clients.get(userId).add(ws)
    console.log(`[WS] User ${userId} connected (${clients.get(userId).size} connections)`)

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString())

        if (msg.type === 'PROGRESS_UPDATE') {
          // Broadcast to all OTHER devices of same user
          const userClients = clients.get(userId)
          if (userClients) {
            userClients.forEach(client => {
              if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                  type:      'PROGRESS_SYNC',
                  movieId:   msg.movieId,
                  timestamp: msg.timestamp,
                  episode:   msg.episode,
                  season:    msg.season,
                }))
              }
            })
          }
        }
      } catch { /* ignore malformed messages */ }
    })

    ws.on('close', () => {
      const userClients = clients.get(userId)
      if (userClients) {
        userClients.delete(ws)
        if (userClients.size === 0) clients.delete(userId)
      }
    })

    ws.on('error', () => { /* ignore */ })

    // Send confirmation
    ws.send(JSON.stringify({ type: 'CONNECTED', userId }))
  })

  // Ping all clients every 30s to keep connections alive
  setInterval(() => {
    wss.clients.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) ws.ping()
    })
  }, 30_000)

  console.log('[WS] WebSocket server ready at /ws')
  return wss
}

module.exports = { setupWebSocket }

// ─────────────────────────────────────────────────────────────────────────────
// ADD TO backend/server.js:
//
// 1. Install ws:  npm install ws
//
// 2. Change server startup from:
//    app.listen(PORT, ...)
//
//    To:
//    const http = require('http')
//    const { setupWebSocket } = require('./websocket')
//    const server = http.createServer(app)
//    setupWebSocket(server)
//    server.listen(PORT, () => console.log(`[Streamix] Server on port ${PORT}`))
// ─────────────────────────────────────────────────────────────────────────────
