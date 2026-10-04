package com.streamix.app.data

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener

data class PartyMember(val id: String, val name: String, val avatar: String, val color: String)

/** What the party is watching (a TMDB movie, or a series episode) */
data class PartyMedia(val type: String, val id: Int, val season: Int?, val episode: Int?, val title: String, val poster: String) {
    fun json() = obj("type" to type, "id" to id, "season" to season, "episode" to episode, "title" to title, "poster" to poster)
}

/** Host's player state; [at] is the server's clock when it was sent */
data class PartySync(val playing: Boolean, val time: Double, val at: Long, val seek: Boolean)

data class ChatLine(val name: String, val color: String, val text: String, val notice: Boolean = false, val mine: Boolean = false)
data class Reaction(val name: String, val emoji: String, val at: Long = System.currentTimeMillis())

val PARTY_EMOJI = listOf("😂", "😮", "😍", "😱", "👏", "🔥", "😢", "💀")

/**
 * Watch parties over the server's `/ws` socket — the same protocol the web app uses, so phones and
 * browsers can be in one party. Play/pause/seek follow the host for direct streams; embeds get a countdown.
 */
class PartyClient(private val prefs: Prefs, private val api: Api) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var socket: WebSocket? = null
    private var open = false
    private val pending = mutableListOf<JsonObject>()
    private var reconnect: Job? = null
    private var leaving = false
    private var myProfile: JsonObject? = null
    /** Rejoining after a dropped connection; if the party is gone by then, forget it */
    private var rejoining = false

    private val _code = MutableStateFlow<String?>(null)
    val code: StateFlow<String?> = _code.asStateFlow()
    private val _hostId = MutableStateFlow<String?>(null)
    private val _you = MutableStateFlow<String?>(null)
    val you: StateFlow<String?> = _you.asStateFlow()
    val hostId: StateFlow<String?> = _hostId.asStateFlow()
    private val _members = MutableStateFlow<List<PartyMember>>(emptyList())
    val members: StateFlow<List<PartyMember>> = _members.asStateFlow()
    private val _media = MutableStateFlow<PartyMedia?>(null)
    val media: StateFlow<PartyMedia?> = _media.asStateFlow()
    private val _chat = MutableStateFlow<List<ChatLine>>(emptyList())
    val chat: StateFlow<List<ChatLine>> = _chat.asStateFlow()
    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()
    private val _syncs = MutableSharedFlow<PartySync>(extraBufferCapacity = 16)
    val syncs: SharedFlow<PartySync> = _syncs.asSharedFlow()
    private val _reactions = MutableSharedFlow<Reaction>(extraBufferCapacity = 32)
    val reactions: SharedFlow<Reaction> = _reactions.asSharedFlow()
    /** Local time (ms) at which a 3-2-1 countdown ends */
    private val _countdown = MutableStateFlow<Long?>(null)
    val countdown: StateFlow<Long?> = _countdown.asStateFlow()
    var lastSync: PartySync? = null
        private set

    val isHost: Boolean get() = _code.value != null && _hostId.value != null && _hostId.value == _you.value

    // ── Actions ──────────────────────────────────────────────────────────────
    fun create(media: PartyMedia, profile: Profile?) {
        myProfile = profileJson(profile)
        send(obj("type" to "PARTY_CREATE", "media" to media.json(), "profile" to myProfile))
    }

    fun join(code: String, profile: Profile?) {
        _error.value = null
        myProfile = profileJson(profile)
        send(obj("type" to "PARTY_JOIN", "code" to code.trim().uppercase(), "profile" to myProfile))
    }

    fun leave() {
        if (_code.value == null) return
        send(obj("type" to "PARTY_LEAVE"))
        reset()
        leaving = true
        socket?.close(1000, "left"); socket = null; open = false
    }

    fun sync(playing: Boolean, time: Double, seek: Boolean = false) {
        if (isHost) send(obj("type" to "PARTY_SYNC", "playing" to playing, "time" to time, "seek" to seek))
    }
    fun requestSync() = send(obj("type" to "PARTY_REQUEST_SYNC"))
    fun setMedia(media: PartyMedia) { if (isHost && media != _media.value) { _media.value = media; send(obj("type" to "PARTY_MEDIA", "media" to media.json())) } }
    fun chat(text: String) {
        val t = text.trim().take(300)
        if (t.isEmpty()) return
        send(obj("type" to "PARTY_CHAT", "text" to t))
        // The server doesn't echo chat back to the sender
        val me = _members.value.firstOrNull { it.id == _you.value }
        addLine(ChatLine(me?.name ?: "You", me?.color ?: "#e50914", t, mine = true))
    }
    fun react(emoji: String) {
        send(obj("type" to "PARTY_REACT", "emoji" to emoji))
        _reactions.tryEmit(Reaction("You", emoji))
    }
    fun startCountdown() {
        if (!isHost) return
        send(obj("type" to "PARTY_COUNTDOWN"))
        _countdown.value = System.currentTimeMillis() + 3500
    }
    fun kick(memberId: String) = send(obj("type" to "PARTY_KICK", "memberId" to memberId))
    fun clearError() { _error.value = null }

    // ── Socket ───────────────────────────────────────────────────────────────
    private fun profileJson(p: Profile?) = obj("name" to (p?.name ?: prefs.user?.username ?: "Viewer"), "avatar" to (p?.avatar ?: "🎬"), "color" to (p?.color ?: "#e50914"))

    private fun send(msg: JsonObject) {
        if (open) socket?.send(msg.toString()) else { pending += msg; connect() }
    }

    private fun connect() {
        if (socket != null) return
        val server = prefs.serverUrl ?: return
        val token = prefs.user?.token ?: return
        leaving = false
        val url = server.replaceFirst("http", "ws") + "/ws?token=" + java.net.URLEncoder.encode(token, "UTF-8")
        socket = api.client.newWebSocket(Request.Builder().url(url).build(), object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                scope.launch {
                    if (socket !== webSocket) return@launch
                    open = true
                    val queued = pending.toList(); pending.clear()
                    queued.forEach { webSocket.send(it.toString()) }
                }
            }
            override fun onMessage(webSocket: WebSocket, text: String) { scope.launch { if (socket === webSocket) handle(text) } }
            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) { scope.launch { dropped(webSocket, code) } }
            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) { scope.launch { dropped(webSocket, response?.code ?: 0) } }
        })
    }

    private fun dropped(ws: WebSocket, closeCode: Int) {
        if (socket !== ws) return
        socket = null; open = false
        if (leaving) return
        val code = _code.value
        if (code == null && pending.isEmpty()) return
        // Reconnect (refreshing the 15-minute access token first) and rejoin the same party
        reconnect?.cancel()
        reconnect = scope.launch {
            delay(if (closeCode == 4001) 200 else 2000)
            if (closeCode == 4001 || closeCode == 0) withContext(Dispatchers.IO) { api.refreshBlocking() }
            if (code != null && pending.none { it["type"]?.jsonPrimitive?.contentOrNull == "PARTY_JOIN" }) {
                pending.add(0, obj("type" to "PARTY_JOIN", "code" to code, "profile" to myProfile))
                rejoining = true
            }
            connect()
        }
    }

    private fun reset() {
        _code.value = null; _hostId.value = null; _members.value = emptyList(); _media.value = null
        _chat.value = emptyList(); _countdown.value = null; lastSync = null; pending.clear()
    }

    private fun addLine(l: ChatLine) = _chat.update { (it + l).takeLast(100) }

    private fun handle(text: String) {
        val m = runCatching { AppJson.parseToJsonElement(text).jsonObject }.getOrNull() ?: return
        fun s(k: String) = m[k]?.jsonPrimitive?.contentOrNull
        when (s("type")) {
            "PARTY_STATE" -> {
                rejoining = false
                val first = _code.value == null
                _code.value = s("code")
                _hostId.value = s("hostId")
                s("you")?.let { _you.value = it }
                _members.value = m["members"]?.jsonArray?.map { el ->
                    val o = el.jsonObject
                    PartyMember(o.str("id"), o.str("name").ifBlank { "Viewer" }, o.str("avatar").ifBlank { "🎬" }, o.str("color").ifBlank { "#e50914" })
                }.orEmpty()
                _media.value = m["media"]?.jsonObject?.let { o ->
                    PartyMedia(o.str("type").ifBlank { "movie" }, o["id"]?.jsonPrimitive?.intOrNull ?: 0, o["season"]?.jsonPrimitive?.intOrNull,
                        o["episode"]?.jsonPrimitive?.intOrNull, o.str("title"), o.str("poster"))
                }
                m["playback"]?.jsonObject?.let { lastSync = parseSync(it, seek = true) }
                if (first) addLine(ChatLine("", "", "You joined the party", notice = true))
            }
            "PARTY_SYNC" -> parseSync(m, m["seek"]?.jsonPrimitive?.booleanOrNull == true).let { lastSync = it; _syncs.tryEmit(it) }
            "PARTY_CHAT" -> addLine(ChatLine(s("name") ?: "Viewer", s("color") ?: "#e50914", s("text").orEmpty()))
            "PARTY_REACT" -> _reactions.tryEmit(Reaction(s("name") ?: "Viewer", s("emoji") ?: return))
            "PARTY_NOTICE" -> addLine(ChatLine("", "", s("text").orEmpty(), notice = true))
            "PARTY_COUNTDOWN" -> {
                val startAt = m["startAt"]?.jsonPrimitive?.longOrNull ?: return
                val serverNow = m["serverNow"]?.jsonPrimitive?.longOrNull ?: startAt - 3500
                _countdown.value = System.currentTimeMillis() + (startAt - serverNow)
            }
            "PARTY_ERROR" -> {
                _error.value = s("text")
                if (rejoining) { rejoining = false; reset() } else if (_code.value == null) pending.clear()
            }
            "PARTY_ENDED" -> { _error.value = s("text") ?: "The party ended"; reset(); leaving = true; socket?.close(1000, "ended") }
        }
    }

    private fun parseSync(o: JsonObject, seek: Boolean) = PartySync(
        o["playing"]?.jsonPrimitive?.booleanOrNull == true, o["time"]?.jsonPrimitive?.doubleOrNull ?: 0.0,
        o["at"]?.jsonPrimitive?.longOrNull ?: System.currentTimeMillis(), seek,
    )

    private fun JsonObject.str(k: String) = (this[k] as? JsonPrimitive)?.contentOrNull.orEmpty()
}
