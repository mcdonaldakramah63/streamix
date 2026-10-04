package com.streamix.app.data

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/** App-wide signed-in state, mirrored from the backend */
class Session(val prefs: Prefs, val api: Api) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    val party = PartyClient(prefs, api)

    /** A notification link the app was opened with, waiting for the main screen */
    val pendingUrl = MutableStateFlow<String?>(null)

    /** Set by the app: stops background work tied to the account */
    var onSignedOut: () -> Unit = {}

    private val _server = MutableStateFlow(prefs.serverUrl)
    val server: StateFlow<String?> = _server.asStateFlow()

    private val _user = MutableStateFlow(prefs.user)
    val user: StateFlow<User?> = _user.asStateFlow()

    private val _profiles = MutableStateFlow<List<Profile>>(emptyList())
    val profiles: StateFlow<List<Profile>> = _profiles.asStateFlow()

    private val _profilesLoaded = MutableStateFlow(false)
    val profilesLoaded: StateFlow<Boolean> = _profilesLoaded.asStateFlow()

    private val _active = MutableStateFlow(prefs.activeProfile)
    val activeProfile: StateFlow<Profile?> = _active.asStateFlow()

    private val _watchlist = MutableStateFlow<List<WLItem>>(emptyList())
    val watchlist: StateFlow<List<WLItem>> = _watchlist.asStateFlow()

    /** Ids in My List — poster cards only need "is this saved?" */
    val watchlistIds: StateFlow<Set<Int>> = _watchlist.map { l -> l.mapTo(HashSet()) { it.movieId } }
        .stateIn(scope, kotlinx.coroutines.flow.SharingStarted.Eagerly, emptySet())
    val signedIn: StateFlow<Boolean> = _user.map { it != null }.stateIn(scope, kotlinx.coroutines.flow.SharingStarted.Eagerly, _user.value != null)

    private val _continue = MutableStateFlow<List<CWItem>>(emptyList())
    val continueWatching: StateFlow<List<CWItem>> = _continue.asStateFlow()

    init {
        api.onUserChanged = { u ->
            scope.launch {
                val wasSignedIn = _user.value != null
                _user.value = u
                if (u == null && wasSignedIn) clearUserData()
            }
        }
        com.streamix.app.ui.theme.Sx.applyTheme(prefs.activeProfile?.theme)
        if (_user.value != null && _server.value != null) refreshAll()
    }

    fun setServer(url: String) {
        prefs.serverUrl = url
        _server.value = prefs.serverUrl
    }

    fun changeServer() {
        scope.launch { signOut() }
        prefs.serverUrl = null
        _server.value = null
    }

    // ── Auth ─────────────────────────────────────────────────────────────────
    suspend fun login(email: String, password: String) = signedIn(api.login(email.trim(), password))
    suspend fun verifyTwoFactor(challenge: String, code: String) = signedIn(api.verifyTwoFactor(challenge, code))
    suspend fun register(username: String, email: String, password: String, confirmTypo: Boolean = false) =
        signedIn(api.register(username.trim(), email.trim(), password, confirmTypo))
    suspend fun verifyEmail(ticket: String, code: String) = signedIn(api.verifyEmail(ticket, code))

    /** A notification was tapped: tell the server (it learns which kinds this person opens) */
    fun markNotificationOpened(url: String) {
        val id = Regex("[?&]n=([a-f0-9]{24})").find(url)?.groupValues?.get(1) ?: return
        scope.launch { runCatching { api.inboxOpen(id) } }
    }

    private fun signedIn(u: User) {
        prefs.user = u
        _user.value = u
        prefs.activeProfile = null
        _active.value = null
        refreshAll()
    }

    /** Ends every session on the account (all devices), then this one */
    suspend fun signOutEverywhere() {
        api.logoutAll()
        signOut()
    }

    /** Turning on 2FA ends other sessions; the server hands this device a fresh one */
    fun replaceUser(u: User) {
        prefs.user = u
        _user.value = u
    }

    suspend fun signOut() {
        party.leave()
        api.logout()
        prefs.user = null
        _user.value = null
        clearUserData()
    }

    private fun clearUserData() {
        onSignedOut()
        prefs.activeProfile = null
        _active.value = null
        _profiles.value = emptyList()
        _profilesLoaded.value = false
        _watchlist.value = emptyList()
        _continue.value = emptyList()
    }

    fun refreshAll() {
        scope.launch { runCatching { fetchProfiles() } }
        scope.launch { runCatching { _watchlist.value = api.watchlist() } }
        scope.launch { runCatching { _continue.value = api.continueWatching() } }
    }

    // ── Profiles ─────────────────────────────────────────────────────────────
    suspend fun fetchProfiles() {
        try {
            val list = api.profiles()
            _profiles.value = list
            // Keep the active profile only if it still exists on this account
            val stillThere = list.firstOrNull { it.id == _active.value?.id }
            setActiveInternal(stillThere)
        } finally {
            _profilesLoaded.value = true
        }
    }

    /** PIN-protected profiles must be verified with [verifyAndActivate] instead */
    fun activate(p: Profile?) = setActiveInternal(p)

    suspend fun verifyAndActivate(p: Profile, pin: String) {
        api.verifyPin(p.id, pin)
        setActiveInternal(p)
    }

    private fun setActiveInternal(p: Profile?) {
        prefs.activeProfile = p
        _active.value = p
        com.streamix.app.ui.theme.Sx.applyTheme(p?.theme)
    }

    suspend fun setTheme(theme: String) {
        val p = _active.value ?: return
        val updated = api.setTheme(p.id, theme).copy(hasPin = p.hasPin)
        _profiles.update { list -> list.map { if (it.id == updated.id) updated else it } }
        setActiveInternal(updated)
    }

    suspend fun createProfile(name: String, avatar: String, color: String, isKids: Boolean, pin: String?): Profile {
        val p = api.createProfile(name, avatar, color, isKids, pin)
        _profiles.update { it + p }
        return p
    }

    suspend fun deleteProfile(p: Profile) {
        api.deleteProfile(p.id)
        _profiles.update { list -> list.filterNot { it.id == p.id } }
        if (_active.value?.id == p.id) setActiveInternal(null)
    }

    /** Saves per-profile playback settings and keeps the local copy in sync */
    suspend fun savePrefs(prefs: ProfilePrefs, parentPin: String? = null) {
        val p = _active.value ?: return
        val updated = api.updatePrefs(p.id, prefs, parentPin)
        _profiles.update { list -> list.map { if (it.id == updated.id) updated.copy(hasPin = it.hasPin) else it } }
        setActiveInternal(updated.copy(hasPin = p.hasPin))
    }

    // ── Interest signals (batched) ───────────────────────────────────────────
    private val pendingEvents = mutableListOf<kotlinx.serialization.json.JsonObject>()
    private var flushJob: kotlinx.coroutines.Job? = null
    private val recentSignals = java.util.concurrent.ConcurrentHashMap<String, Long>()

    /**
     * Tell the taste engine about light interest: kind = detail | trailer | play | search_click.
     * [row] is the Home row kind it was opened from (the server learns which rows this profile uses);
     * [source] is where in the app (feed, ask, upcoming…).
     */
    fun track(kind: String, type: String, id: Int, row: String? = null, source: String? = null) {
        val profile = _active.value ?: return
        val sig = "$kind:$type:$id"
        val now = System.currentTimeMillis()
        if (recentSignals[sig]?.let { now - it < 5000 } == true) return
        recentSignals[sig] = now
        if (recentSignals.size > 50) recentSignals.keys.take(25).forEach { recentSignals.remove(it) }
        synchronized(pendingEvents) {
            pendingEvents += obj("kind" to kind, "mediaType" to (if (type == "tv") "tv" else "movie"), "tmdbId" to id, "row" to row?.ifBlank { null }, "source" to source)
        }
        if (flushJob?.isActive == true) return
        flushJob = scope.launch {
            kotlinx.coroutines.delay(4000)
            val batch = synchronized(pendingEvents) { pendingEvents.toList().also { pendingEvents.clear() } }
            if (batch.isNotEmpty()) runCatching { api.events(profile.id, kotlinx.serialization.json.JsonArray(batch)) }
        }
    }

    /** How an embed provider did in this session (feeds the server's provider ranking) */
    fun reportSource(source: String, type: String, ok: Boolean) {
        if (_user.value == null) return
        scope.launch { runCatching { api.reportSource(source, if (type == "tv") "tv" else "movie", ok) } }
    }

    /** Titles "Play something" offered this session, so pressing again gives something else */
    private val shuffleSkip = mutableListOf<String>()

    /** Ask the server for one thing to start now. Returns null when there's no profile or it can't decide. */
    suspend fun playSomething(): PlayPick? {
        val p = _active.value ?: return null
        val now = java.time.LocalDateTime.now()
        val res = api.playSomething(p.id, now.hour, now.dayOfWeek.value % 7, shuffleSkip.takeLast(20))
        shuffleSkip += "${res.pick.type}:${res.pick.id}"
        track("play", res.pick.type, res.pick.id, source = "shuffle")
        return res.pick
    }

    /** "Not for me": hides a title from rows and recommendations for this profile */
    fun setHidden(type: String, id: Int, hidden: Boolean) {
        val p = _active.value ?: return
        val key = "$type:$id"
        val before = p.hiddenTitles
        setActiveInternal(p.copy(hiddenTitles = if (hidden) (before + key).distinct() else before - key))
        scope.launch {
            val ok = runCatching { api.setHidden(p.id, key, hidden) }.isSuccess
            if (!ok) setActiveInternal(_active.value?.copy(hiddenTitles = before))
        }
    }

    fun isHidden(type: String, id: Int) = _active.value?.hiddenTitles?.contains("$type:$id") == true

    fun recordWatch(tmdbId: Int, title: String, type: String, genres: List<Int>, language: String, completed: Boolean) {
        val profile = _active.value ?: return
        scope.launch {
            runCatching {
                api.recordWatch(profile.id, obj("tmdbId" to tmdbId, "title" to title, "type" to type, "genres" to genres,
                    "language" to language, "completed" to completed))
            }
        }
    }

    // ── My List ──────────────────────────────────────────────────────────────
    fun inWatchlist(id: Int) = _watchlist.value.any { it.movieId == id }

    fun toggleWatchlist(item: WLItem) {
        val had = inWatchlist(item.movieId)
        val before = _watchlist.value
        _watchlist.value = if (had) before.filterNot { it.movieId == item.movieId } else listOf(item) + before
        scope.launch {
            val ok = runCatching { if (had) api.removeWatchlist(item.movieId) else api.addWatchlist(item) }.isSuccess
            if (!ok) _watchlist.value = before
        }
    }

    // ── Continue watching ────────────────────────────────────────────────────
    fun progressFor(id: Int) = _continue.value.firstOrNull { it.movieId == id }

    fun saveProgress(item: CWItem) {
        _continue.update { list -> (listOf(item) + list.filterNot { it.movieId == item.movieId }).take(20) }
        scope.launch { runCatching { api.saveContinue(item) } }
    }

    /** Per-episode progress for the active profile (drives the watched ticks on series pages) */
    fun saveEpisode(tmdbId: Int, season: Int, episode: Int, progress: Int) {
        val profile = _active.value ?: return
        scope.launch { runCatching { api.saveEpisode(profile.id, tmdbId, season, episode, progress.coerceIn(0, 100)) } }
    }

    fun removeProgress(id: Int) {
        _continue.update { list -> list.filterNot { it.movieId == id } }
        scope.launch { runCatching { api.removeContinue(id) } }
    }
}
