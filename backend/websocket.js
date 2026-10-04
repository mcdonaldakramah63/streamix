// backend/websocket.js — real-time features over one socket per tab:
//   • watch progress sync between a user's devices
//   • watch parties (synced playback, chat, reactions, countdown)
//   • counting how many videos an account is playing at once (only enforced if an admin sets a limit)
const WebSocket = require('ws')
const crypto    = require('crypto')
const settings  = require('./utils/settings')

// Connected clients: Map<userId, Set<ws>>
const clients = new Map()
// Watch parties: Map<code, Room>
const rooms = new Map()

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O/1/I
const newCode = () => {
  let code
  do { code = Array.from(crypto.randomBytes(6), b => CODE_CHARS[b % CODE_CHARS.length]).join('') } while (rooms.has(code))
  return code
}

const send = (ws, msg) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg)) }
const str = (v, max) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max)

/** Only the fields a party needs, length-limited (these come from the browser) */
function cleanMedia(m = {}) {
  const type = m.type === 'tv' ? 'tv' : m.type === 'library' ? 'library' : 'movie'
  const id = type === 'library' ? str(m.id, 24).replace(/[^a-f0-9]/g, '') : Number(m.id) || 0
  return {
    type, id,
    season: type === 'tv' ? Math.max(0, Number(m.season) || 1) : null,
    episode: type === 'tv' ? Math.max(0, Number(m.episode) || 1) : null,
    title: str(m.title, 120),
    poster: /^https:\/\/image\.tmdb\.org\//.test(String(m.poster || '')) ? str(m.poster, 200) : '',
  }
}
function cleanProfile(p = {}, fallbackName) {
  return {
    name: str(p.name, 30) || fallbackName,
    avatar: str(p.avatar, 16) || '🎬',
    color: /^#[0-9a-fA-F]{6}$/.test(String(p.color)) ? p.color : '#e50914',
    avatarImage: /^\/uploads\/avatars\/[\w.-]+$/.test(String(p.avatarImage || '')) ? p.avatarImage : '',
  }
}

function roomState(room) {
  return {
    type: 'PARTY_STATE',
    code: room.code,
    hostId: room.host.memberId,
    media: room.media,
    playback: room.playback,
    members: [...room.members].map(ws => ({ id: ws.memberId, userId: ws.userId, ...ws.partyProfile })),
  }
}
const broadcast = (room, msg, except) => room.members.forEach(ws => { if (ws !== except) send(ws, msg) })
/** Room state to everyone, each told which member they are */
const sendState = (room) => { const st = roomState(room); room.members.forEach(ws => send(ws, { ...st, you: ws.memberId })) }

function leaveRoom(ws, reason) {
  const room = ws.room
  if (!room) return
  ws.room = null
  room.members.delete(ws)
  if (!room.members.size) { rooms.delete(room.code); return }
  if (room.host === ws) {
    room.host = room.members.values().next().value // oldest remaining member becomes host
    broadcast(room, { type: 'PARTY_NOTICE', text: `${ws.partyProfile?.name || 'The host'} left — ${room.host.partyProfile.name} is the host now` })
  } else if (reason !== 'silent') {
    broadcast(room, { type: 'PARTY_NOTICE', text: `${ws.partyProfile?.name || 'Someone'} left` })
  }
  sendState(room)
}

/** Simple token bucket so one tab can't flood a room */
function allow(ws, cost = 1) {
  const now = Date.now()
  ws.bucket = Math.min(10, (ws.bucket ?? 10) + ((now - (ws.bucketAt || now)) / 1000) * 2)
  ws.bucketAt = now
  if (ws.bucket < cost) return false
  ws.bucket -= cost
  return true
}

async function handleParty(ws, msg) {
  switch (msg.type) {
    case 'PARTY_CREATE': {
      if (!allow(ws, 3)) return
      leaveRoom(ws, 'silent')
      const room = {
        code: newCode(), host: ws, members: new Set([ws]),
        media: cleanMedia(msg.media),
        playback: { playing: false, time: 0, at: Date.now() },
        createdAt: Date.now(),
      }
      ws.partyProfile = cleanProfile(msg.profile, ws.username)
      ws.room = room
      rooms.set(room.code, room)
      sendState(room)
      return
    }
    case 'PARTY_JOIN': {
      // About one guess a second at most — far too slow to stumble on someone's code
      if (!allow(ws, 2)) return send(ws, { type: 'PARTY_ERROR', text: 'Slow down a little and try again' })
      const room = rooms.get(str(msg.code, 6).toUpperCase())
      if (!room) return send(ws, { type: 'PARTY_ERROR', text: 'That watch party has ended or the code is wrong' })
      if (ws.room === room) return send(ws, { ...roomState(room), you: ws.memberId })
      const { partyMaxMembers } = await settings.limits()
      if (room.members.size >= partyMaxMembers) return send(ws, { type: 'PARTY_ERROR', text: `This party is full (${partyMaxMembers} people)` })
      leaveRoom(ws, 'silent')
      ws.partyProfile = cleanProfile(msg.profile, ws.username)
      ws.room = room
      room.members.add(ws)
      broadcast(room, { type: 'PARTY_NOTICE', text: `${ws.partyProfile.name} joined` }, ws)
      sendState(room)
      return
    }
    case 'PARTY_LEAVE':
      return leaveRoom(ws)
  }

  const room = ws.room
  if (!room) return
  const isHost = room.host === ws

  switch (msg.type) {
    case 'PARTY_SYNC': // host's player state
      if (!isHost || !allow(ws, 0.5)) return
      room.playback = { playing: !!msg.playing, time: Math.max(0, Number(msg.time) || 0), at: Date.now() }
      broadcast(room, { type: 'PARTY_SYNC', ...room.playback, seek: !!msg.seek }, ws)
      return
    case 'PARTY_REQUEST_SYNC':
      send(ws, { type: 'PARTY_SYNC', ...room.playback, seek: true })
      return
    case 'PARTY_MEDIA': // host moved to another episode / title
      if (!isHost) return
      room.media = cleanMedia(msg.media)
      room.playback = { playing: false, time: 0, at: Date.now() }
      sendState(room)
      return
    case 'PARTY_CHAT': {
      const text = str(msg.text, 300)
      if (!text || !allow(ws)) return
      broadcast(room, { type: 'PARTY_CHAT', from: ws.memberId, name: ws.partyProfile.name, color: ws.partyProfile.color, text, at: Date.now() })
      return
    }
    case 'PARTY_REACT': {
      const emoji = ['😂', '😮', '😍', '😱', '👏', '🔥', '😢', '💀'].find(e => e === msg.emoji)
      if (!emoji || !allow(ws, 0.5)) return
      broadcast(room, { type: 'PARTY_REACT', from: ws.memberId, name: ws.partyProfile.name, emoji })
      return
    }
    case 'PARTY_COUNTDOWN': // "3-2-1 play" for sources that can't be synced (embeds)
      if (!isHost || !allow(ws, 2)) return
      broadcast(room, { type: 'PARTY_COUNTDOWN', startAt: Date.now() + 3500, serverNow: Date.now() })
      return
    case 'PARTY_KICK': {
      if (!isHost) return
      const target = [...room.members].find(m => m.memberId === msg.memberId && m !== ws)
      if (target) { send(target, { type: 'PARTY_ENDED', text: 'The host removed you from the party' }); leaveRoom(target) }
      return
    }
  }
}

/** Videos playing at once for this account (0 = no limit) */
async function handleWatching(ws, msg) {
  if (msg.type === 'STOPPED') { ws.watching = false; return }
  ws.watching = true
  const { maxStreams } = await settings.limits()
  if (!maxStreams) return send(ws, { type: 'STREAM_OK' })
  const playing = [...(clients.get(ws.userId) || [])].filter(c => c.watching)
    .sort((a, b) => (a.watchingSince || 0) - (b.watchingSince || 0))
  ws.watchingSince = ws.watchingSince || Date.now()
  // The newest streams over the limit are the ones that have to stop
  const over = playing.slice(maxStreams)
  if (over.includes(ws)) {
    ws.watching = false
    send(ws, { type: 'STREAM_LIMIT', max: maxStreams })
  } else send(ws, { type: 'STREAM_OK' })
}

function setupWebSocket(server) {
  const wss = new WebSocket.Server({ server, path: '/ws', maxPayload: 16 * 1024 })

  wss.on('connection', (ws, req) => {
    // Authenticate via token in query string
    const token = new URL(req.url, 'http://localhost').searchParams.get('token')

    let userId = null, decoded = null
    try {
      decoded = require('./utils/tokens').verifyAccess(token)
      userId = decoded.id
    } catch {
      // 4001 tells the client to refresh its access token before reconnecting
      ws.close(4001, 'Invalid token')
      return
    }

    ws.userId = userId
    ws.memberId = crypto.randomBytes(6).toString('hex')
    ws.username = 'Guest'
    // Drop sockets for deleted / suspended users or signed-out sessions
    require('./models/User').findById(userId).select('username suspended tokenVersion').lean()
      .then(u => {
        if (!u || u.suspended || !require('./utils/tokens').current(decoded, u)) return ws.close(4001, 'Session ended')
        ws.username = u.username
      }).catch(() => {})

    // One account can't open unlimited sockets
    if ((clients.get(userId)?.size || 0) >= 30) { ws.close(4008, 'Too many connections'); return }

    if (!clients.has(userId)) clients.set(userId, new Set())
    clients.get(userId).add(ws)
    ws.isAlive = true
    ws.on('pong', () => { ws.isAlive = true })

    ws.on('message', (data) => {
      let msg
      try { msg = JSON.parse(data.toString()) } catch { return }
      if (!msg || typeof msg.type !== 'string') return

      if (msg.type === 'PROGRESS_UPDATE') {
        // Broadcast to all OTHER devices of the same user
        clients.get(userId)?.forEach(client => {
          if (client !== ws) send(client, {
            type: 'PROGRESS_SYNC', movieId: msg.movieId, timestamp: msg.timestamp,
            duration: msg.duration, episode: msg.episode, season: msg.season,
          })
        })
      } else if (msg.type.startsWith('PARTY_')) {
        handleParty(ws, msg).catch(() => {})
      } else if (msg.type === 'WATCHING' || msg.type === 'STOPPED') {
        handleWatching(ws, msg).catch(() => {})
      }
    })

    ws.on('close', () => {
      leaveRoom(ws)
      const set = clients.get(userId)
      if (set) {
        set.delete(ws)
        if (set.size === 0) clients.delete(userId)
      }
    })

    ws.on('error', () => { /* ignore */ })
    send(ws, { type: 'CONNECTED', memberId: ws.memberId })
  })

  // Ping every 30s; drop connections that stopped answering
  const interval = setInterval(() => {
    wss.clients.forEach(ws => {
      if (ws.isAlive === false) return ws.terminate()
      ws.isAlive = false
      if (ws.readyState === WebSocket.OPEN) ws.ping()
    })
  }, 30_000)
  wss.on('close', () => clearInterval(interval))

  console.log('[WS] WebSocket server ready at /ws')
  return wss
}

/**
 * Live inbox: a new bell item goes straight to every open socket of those users (null = everyone),
 * so the Android app can show it as a notification at once instead of waiting for its next check.
 */
function pushNotification(userIds, item) {
  const msg = { type: 'NOTIFICATION', item }
  if (userIds === null) clients.forEach(set => set.forEach(ws => send(ws, msg)))
  else userIds.forEach(id => clients.get(String(id))?.forEach(ws => send(ws, msg)))
}

/** Something everyone may want to know about (e.g. New & Hot lists changed) */
function broadcastAll(msg) { clients.forEach(set => set.forEach(ws => send(ws, msg))) }

module.exports = { setupWebSocket, pushNotification, broadcastAll, _rooms: rooms }
