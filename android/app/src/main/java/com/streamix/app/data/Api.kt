package com.streamix.app.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.KSerializer
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

class ApiException(val code: Int, message: String) : Exception(message)

/** Password was right; the account also needs an authenticator code */
class TwoFactorRequired(val challenge: String) : Exception("Enter the code from your authenticator app")

/** Signed up / signed in, but the email isn't confirmed yet: a code was emailed. `ticket` lets this device verify. */
class EmailVerificationRequired(
    val ticket: String, val email: String, val resendIn: Int, val sent: Boolean, val sendError: String?,
) : Exception(sendError ?: "Enter the code we emailed you")

/** HTTP client for the Streamix backend (`<server>/api/...`) */
private const val CACHE_MS = 5 * 60 * 1000L

class Api(private val prefs: Prefs) {
    val cookieJar = PersistentCookieJar(prefs)

    /** Called when the server-side session ends (refresh failed) or the token is renewed */
    var onUserChanged: (User?) -> Unit = {}

    private val jsonType = "application/json".toMediaType()

    val client: OkHttpClient = OkHttpClient.Builder()
        .cookieJar(cookieJar)
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(45, TimeUnit.SECONDS)
        .addInterceptor { chain ->
            val req = chain.request()
            val token = prefs.user?.token
            val isOwnServer = prefs.serverUrl?.let { req.url.toString().startsWith(it) } == true
            val b = req.newBuilder()
            if (token != null && isOwnServer && req.header("Authorization") == null) b.header("Authorization", "Bearer $token")
            // Quiet hours and "send when they're usually around" use the phone's time zone
            if (isOwnServer) b.header("X-Timezone", java.util.TimeZone.getDefault().id)
            chain.proceed(b.build())
        }
        .authenticator { _, response ->
            // 401 → try the refresh cookie once, then replay the request with the new token
            val path = response.request.url.encodedPath
            if (path.contains("/api/auth/") || response.priorResponse != null || prefs.user == null) return@authenticator null
            val token = refreshBlocking()
            if (token == null) {
                prefs.user = null
                onUserChanged(null)
                null
            } else response.request.newBuilder().header("Authorization", "Bearer $token").build()
        }
        .build()

    val server: String get() = prefs.serverUrl ?: error("Server not configured")
    val base: String get() = "$server/api"

    /**
     * Proxied through the backend so ExoPlayer gets CORS-free, referer-correct segments.
     * The server hands out signed links (`signed`, a "/api/stream/proxy?…&sig=…" path); unsigned ones are refused.
     */
    fun proxied(raw: String, signed: String? = null) =
        if (signed != null) server + signed else "$server/api/stream/proxy?url=" + URLEncoder.encode(raw, "UTF-8")

    @Synchronized
    fun refreshBlocking(): String? = runCatching {
        val req = Request.Builder().url("$base/auth/refresh").post("{}".toRequestBody(jsonType)).build()
        client.newCall(req).execute().use { res ->
            if (!res.isSuccessful) return@use null
            val user = AppJson.decodeFromString(User.serializer(), res.body.string())
            prefs.user = user
            onUserChanged(user)
            user.token
        }
    }.getOrNull()

    // ── Low-level ────────────────────────────────────────────────────────────
    suspend fun call(method: String, path: String, body: JsonElement? = null, query: Map<String, Any?> = emptyMap()): String =
        withContext(Dispatchers.IO) {
            val url = "$base$path".toHttpUrl().newBuilder().apply {
                query.forEach { (k, v) -> if (v != null) addQueryParameter(k, v.toString()) }
            }.build()
            val reqBody = when {
                body != null -> body.toString().toRequestBody(jsonType)
                method == "POST" || method == "PUT" -> "{}".toRequestBody(jsonType)
                else -> null
            }
            val req = Request.Builder().url(url).method(method, reqBody).build()
            try {
                client.newCall(req).execute().use { res ->
                    val text = res.body.string()
                    if (!res.isSuccessful) {
                        val msg = runCatching { AppJson.parseToJsonElement(text).jsonObject["message"]?.jsonPrimitive?.content }.getOrNull()
                        throw ApiException(res.code, msg ?: "Server error (${res.code})")
                    }
                    text
                }
            } catch (e: IOException) {
                throw ApiException(0, "Can't reach the Streamix server at $server")
            }
        }

    /**
     * Movie/TV catalogue data (/movies/…) is the same for everyone and changes slowly: keep it 5 minutes, so going
     * back to a screen is instant instead of a reload. Personal data (profiles, progress, lists) is never cached.
     */
    private val catalogue = object : LinkedHashMap<String, Pair<Long, Any?>>(64, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Pair<Long, Any?>>) = size > 300
    }

    suspend fun <T> get(path: String, ser: KSerializer<T>, query: Map<String, Any?> = emptyMap()): T {
        val cacheable = path.startsWith("/movies/")
        val key = if (cacheable) "$path?" + query.entries.filter { it.value != null }.sortedBy { it.key }.joinToString("&") { "${it.key}=${it.value}" } else ""
        if (cacheable) synchronized(catalogue) {
            catalogue[key]?.let { (at, v) -> if (System.currentTimeMillis() - at < CACHE_MS) @Suppress("UNCHECKED_CAST") return v as T }
        }
        // Parse off the main thread — big TMDB lists are slow to decode on low-end phones
        val raw = call("GET", path, query = query)
        val value = withContext(Dispatchers.Default) { AppJson.decodeFromString(ser, raw) }
        if (cacheable) synchronized(catalogue) { catalogue[key] = System.currentTimeMillis() to value }
        return value
    }

    /** A cached catalogue value, if fresh — lets a screen draw its content on the first frame */
    fun <T> peek(path: String, query: Map<String, Any?> = emptyMap()): T? {
        val key = "$path?" + query.entries.filter { it.value != null }.sortedBy { it.key }.joinToString("&") { "${it.key}=${it.value}" }
        return synchronized(catalogue) {
            catalogue[key]?.takeIf { System.currentTimeMillis() - it.first < CACHE_MS }?.second?.let { @Suppress("UNCHECKED_CAST") (it as T) }
        }
    }

    suspend fun <T> post(path: String, body: JsonElement?, ser: KSerializer<T>): T {
        val raw = call("POST", path, body)
        return withContext(Dispatchers.Default) { AppJson.decodeFromString(ser, raw) }
    }

    // ── Catalogue ────────────────────────────────────────────────────────────
    suspend fun list(path: String, page: Int = 1, extra: Map<String, Any?> = emptyMap()) =
        get(path, Paged.serializer(), mapOf("page" to page) + extra)

    suspend fun discover(params: Map<String, Any?>) = get("/movies/discover", Paged.serializer(), params)
    suspend fun search(query: String, page: Int = 1, type: String = "multi") =
        get("/movies/search", Paged.serializer(), mapOf("query" to query, "page" to page, "type" to type))

    /** Typo-tolerant, query-aware search (year, series/film, people, franchises), ranked for the profile and by what people open */
    suspend fun smartSearch(query: String, page: Int, profileId: String?) =
        get("/movies/smart-search", SmartSearch.serializer(), mapOf("query" to query, "page" to page, "profile" to profileId))
    /** Teach search what people open for a query */
    suspend fun searchClick(q: String, m: Media) {
        call("POST", "/movies/search-click", obj("q" to q, "type" to m.kind(), "id" to m.id, "title" to m.displayTitle, "poster" to m.posterPath, "year" to m.year))
    }

    suspend fun details(type: String, id: Int) =
        get(if (type == "tv") "/movies/tv/$id" else "/movies/$id", Details.serializer())

    suspend fun season(id: Int, season: Int) = get("/movies/tv/$id/season/$season", SeasonDetail.serializer())
    suspend fun similar(type: String, id: Int) =
        get(if (type == "tv") "/movies/tv/$id/recommendations" else "/movies/$id/recommendations", Paged.serializer())

    // ── Account ──────────────────────────────────────────────────────────────
    /** Returns the signed-in user, or throws [TwoFactorRequired] when the account needs a code next */
    suspend fun login(email: String, password: String): User {
        val raw = call("POST", "/auth/login", obj("email" to email, "password" to password))
        val json = AppJson.parseToJsonElement(raw).jsonObject
        if (json["twoFactorRequired"]?.jsonPrimitive?.booleanOrNull == true) {
            throw TwoFactorRequired(json["challenge"]!!.jsonPrimitive.content)
        }
        verificationOrNull(json)?.let { throw it }
        return AppJson.decodeFromJsonElement(User.serializer(), json)
    }

    private fun verificationOrNull(json: JsonObject): EmailVerificationRequired? {
        if (json["verificationRequired"]?.jsonPrimitive?.booleanOrNull != true) return null
        return EmailVerificationRequired(
            ticket = json["ticket"]!!.jsonPrimitive.content,
            email = json["email"]?.jsonPrimitive?.contentOrNull ?: "your email",
            resendIn = json["resendIn"]?.jsonPrimitive?.intOrNull ?: 30,
            sent = json["sent"]?.jsonPrimitive?.booleanOrNull ?: true,
            sendError = json["sendError"]?.jsonPrimitive?.contentOrNull,
        )
    }

    /** Confirms the emailed code → a normal signed-in session */
    suspend fun verifyEmail(ticket: String, code: String) =
        post("/auth/verify-email", obj("ticket" to ticket, "code" to code.filter { it.isDigit() }), User.serializer())

    /** Sends a new code; returns seconds until another may be sent */
    suspend fun resendEmailCode(ticket: String): Int {
        val raw = call("POST", "/auth/verify-email/resend", obj("ticket" to ticket))
        return AppJson.parseToJsonElement(raw).jsonObject["resendIn"]?.jsonPrimitive?.intOrNull ?: 30
    }

    suspend fun verifyTwoFactor(challenge: String, code: String) =
        post("/auth/2fa/verify", obj("challenge" to challenge, "code" to code.trim()), User.serializer())

    /** Throws [EmailVerificationRequired] (the usual case): a code was emailed to confirm the address */
    suspend fun register(username: String, email: String, password: String, confirmTypo: Boolean = false): User {
        val raw = call("POST", "/auth/register", obj("username" to username, "email" to email, "password" to password, "confirmTypo" to confirmTypo))
        val json = AppJson.parseToJsonElement(raw).jsonObject
        verificationOrNull(json)?.let { throw it }
        return AppJson.decodeFromJsonElement(User.serializer(), json)
    }

    suspend fun logout() { runCatching { call("POST", "/auth/logout") }; cookieJar.clear() }

    suspend fun profiles() = get("/profiles", ListSerializer(Profile.serializer()))
    suspend fun createProfile(name: String, avatar: String, color: String, isKids: Boolean, pin: String?) =
        post("/profiles", obj("name" to name, "avatar" to avatar, "color" to color, "isKids" to isKids, "pin" to pin), Profile.serializer())
    suspend fun deleteProfile(id: String) { call("DELETE", "/profiles/$id") }
    suspend fun verifyPin(id: String, pin: String) { call("POST", "/profiles/$id/verify-pin", obj("pin" to pin)) }
    suspend fun recordWatch(profileId: String, body: JsonObject) { call("POST", "/profiles/$profileId/watch", body) }
    suspend fun recommendations(profileId: String) = get("/profiles/$profileId/recommendations", Recommendations.serializer())

    // ── Discovery ────────────────────────────────────────────────────────────
    /** "Ask Streamix": a plain-language request → picks with reasons (Claude plans + explains when the server has a key) */
    suspend fun ask(profileId: String, q: String) = post("/profiles/$profileId/ask", obj("q" to q), AskResult.serializer())
    /** Personalised upcoming: sequels, new work from people you like, premieres of shows you follow, taste + hype */
    /** Embed providers best-first (server health checks + learned outcomes) */
    suspend fun embedSources(type: String) = get("/stream/sources", EmbedSources.serializer(), mapOf("type" to if (type == "tv") "tv" else "movie"))
    suspend fun reportSource(source: String, type: String, ok: Boolean) { call("POST", "/stream/source-outcome", obj("source" to source, "type" to type, "ok" to ok)) }
    /** One smart pick to start now (time of day, habits, half-watched, new episodes, top picks, what you usually accept) */
    suspend fun playSomething(profileId: String, hour: Int, dow: Int, skip: List<String>) = post("/profiles/$profileId/play-something",
        obj("hour" to hour, "dow" to dow, "skip" to kotlinx.serialization.json.JsonArray(skip.map { kotlinx.serialization.json.JsonPrimitive(it) })), PlaySomething.serializer())

    /** New & Hot lists: hotness (popularity + momentum + what this server is watching), re-ranked for the profile */
    suspend fun newHot(profileId: String?) =
        if (profileId != null) runCatching { get("/profiles/$profileId/new-hot", HotLists.serializer()) }.getOrElse { get("/movies/new-hot", HotLists.serializer()) }
        else get("/movies/new-hot", HotLists.serializer())

    suspend fun upcomingForYou(profileId: String) = get("/profiles/$profileId/upcoming", UpcomingForYou.serializer())
    suspend fun feed(profileId: String, page: Int, fresh: Boolean = false) =
        get("/profiles/$profileId/feed", FeedPage.serializer(), mapOf("page" to page, "fresh" to if (fresh) 1 else null))
    /** Interest signals for the taste engine (opened, trailer, played, search click — plus the Home row it came from) */
    suspend fun events(profileId: String, events: kotlinx.serialization.json.JsonArray) { call("POST", "/profiles/$profileId/events", obj("events" to events)) }

    suspend fun watchlist() = get("/watchlist", ListSerializer(WLItem.serializer()))
    suspend fun addWatchlist(item: WLItem) { call("POST", "/watchlist", AppJson.encodeToJsonElement(WLItem.serializer(), item)) }
    suspend fun removeWatchlist(id: Int) { call("DELETE", "/watchlist/$id") }

    suspend fun continueWatching() = get("/users/continue-watching", ListSerializer(CWItem.serializer()))
    suspend fun saveContinue(item: CWItem) { call("POST", "/users/continue-watching", AppJson.encodeToJsonElement(CWItem.serializer(), item)) }
    suspend fun removeContinue(id: Int) { call("DELETE", "/users/continue-watching/$id") }

    // ── Viewer features ──────────────────────────────────────────────────────
    /** Saves playback preferences. Loosening the maturity rating needs a parent PIN (server replies 403 "needsPin"). */
    suspend fun updatePrefs(id: String, prefs: ProfilePrefs, parentPin: String? = null): Profile {
        val body = obj("prefs" to AppJson.encodeToJsonElement(ProfilePrefs.serializer(), prefs), "parentPin" to parentPin)
        return AppJson.decodeFromString(Profile.serializer(), call("PUT", "/profiles/$id", body))
    }

    suspend fun history(profileId: String) = get("/profiles/$profileId/history", History.serializer())
    suspend fun removeHistory(profileId: String, tmdbId: Int?) { call("DELETE", "/profiles/$profileId/history/${tmdbId ?: "all"}") }
    suspend fun setHidden(profileId: String, key: String, hidden: Boolean) { call("PUT", "/profiles/$profileId/hidden", obj("key" to key, "hidden" to hidden)) }

    suspend fun episodeProgress(profileId: String, tmdbId: Int) =
        get("/profiles/$profileId/episodes/$tmdbId", ListSerializer(EpProgress.serializer()))
    suspend fun saveEpisode(profileId: String, tmdbId: Int, season: Int, episode: Int, progress: Int) {
        call("POST", "/profiles/$profileId/episodes", obj("tmdbId" to tmdbId, "season" to season, "episode" to episode, "progress" to progress))
    }
    suspend fun markEpisodes(profileId: String, tmdbId: Int, season: Int, episodes: List<Int>, watched: Boolean) {
        call("PUT", "/profiles/$profileId/episodes/mark", obj("tmdbId" to tmdbId, "season" to season, "episodes" to episodes, "watched" to watched))
    }

    suspend fun inbox() = get("/inbox", Inbox.serializer())
    suspend fun inboxSeen() { call("POST", "/inbox/seen") }
    /** Pushes the server actually sent this account (after quiet hours, daily limits, merging) */
    suspend fun pushes(since: String?) = get("/inbox/pushes", Inbox.serializer(), mapOf("since" to since))
    /** Counts an opened notification (the server learns which kinds you care about) */
    suspend fun inboxOpen(id: String) { call("POST", "/inbox/$id/open") }
    suspend fun reminders() = get("/inbox/reminders", ListSerializer(Reminder.serializer()))
    suspend fun setReminder(type: String, tmdbId: Int, on: Boolean) { call("PUT", "/inbox/reminders", obj("type" to type, "tmdbId" to tmdbId, "on" to on)) }

    suspend fun upcomingEpisodes() = get("/users/upcoming", Upcoming.serializer())
    suspend fun comingSoon() = get("/movies/coming-soon", ListSerializer(SoonItem.serializer()))
    suspend fun top10() = get("/movies/top10", Top10.serializer())

    suspend fun libraryFiles(type: String, id: Int, season: Int?, episode: Int?) =
        get("/library/for/$type/$id", ListSerializer(LibFile.serializer()),
            if (type == "tv" && season != null && episode != null) mapOf("season" to season, "episode" to episode) else emptyMap())

    /** Free official episodes (rights holders' YouTube channels) for a title */
    suspend fun officialFor(type: String, id: Int) = get("/anime/official/title/$type/$id", OfficialList.serializer())

    suspend fun reportProblem(type: String, tmdbId: Int, season: Int?, episode: Int?, title: String, source: String, reason: String, note: String) {
        call("POST", "/reports", obj("type" to type, "tmdbId" to tmdbId, "season" to season, "episode" to episode,
            "title" to title, "source" to source, "reason" to reason, "note" to note))
    }

    suspend fun kidsStatus(profileId: String, day: String, time: String) =
        get("/profiles/$profileId/kids-status", KidsStatus.serializer(), mapOf("day" to day, "time" to time))
    suspend fun addKidsUsage(profileId: String, day: String, time: String) =
        post("/profiles/$profileId/usage", obj("day" to day, "time" to time, "minutes" to 1), KidsStatus.serializer())

    /** Kid-safe rows (the server applies the age-rating filter): shows, cartoons, anime, animated-movies, anime-movies, family… */
    suspend fun kidsBrowse(section: String, page: Int = 1) = get("/movies/kids-browse", Paged.serializer(), mapOf("section" to section, "page" to page))
    suspend fun kidsSearch(query: String) = get("/movies/kids-search", Paged.serializer(), mapOf("query" to query))

    suspend fun kidsCheck(profileId: String, type: String, tmdbId: Int) =
        get("/profiles/$profileId/kids-check", KidsCheck.serializer(), mapOf("type" to type, "tmdbId" to tmdbId))
    /** Needs a parent PIN when an adult profile has one (403 otherwise) */
    suspend fun kidsControls(profileId: String, parentPin: String?) =
        get("/profiles/$profileId/kids-controls", KidsControlsData.serializer(), mapOf("parentPin" to parentPin))
    suspend fun saveKidsControls(profileId: String, parentPin: String?, c: KidsControls) {
        val body = AppJson.encodeToJsonElement(KidsControls.serializer(), c).jsonObject.toMutableMap()
        parentPin?.let { body["parentPin"] = kotlinx.serialization.json.JsonPrimitive(it) }
        call("PUT", "/profiles/$profileId/kids-controls", JsonObject(body))
    }

    suspend fun badges(profileId: String) = get("/profiles/$profileId/badges", Badges.serializer())
    suspend fun setTheme(profileId: String, theme: String) =
        AppJson.decodeFromString(Profile.serializer(), call("PUT", "/profiles/$profileId", obj("theme" to theme)))

    suspend fun libraryDownload(id: String) = post("/library/$id/download", null, DownloadLink.serializer())

    // ── Security ─────────────────────────────────────────────────────────────
    suspend fun twoFactorStatus() = get("/auth/2fa", TwoFactorStatus.serializer())
    suspend fun twoFactorSetup(password: String) = post("/auth/2fa/setup", obj("password" to password), TwoFactorSetup.serializer())
    /** Turns 2FA on. Other sessions end, so this returns a fresh signed-in user plus the backup codes. */
    suspend fun twoFactorEnable(code: String): Pair<User, List<String>> {
        val raw = call("POST", "/auth/2fa/enable", obj("code" to code.trim()))
        return AppJson.decodeFromString(User.serializer(), raw) to AppJson.decodeFromString(RecoveryCodes.serializer(), raw).recoveryCodes
    }
    suspend fun twoFactorDisable(password: String, code: String) { call("POST", "/auth/2fa/disable", obj("password" to password, "code" to code.trim())) }
    suspend fun newRecoveryCodes(password: String, code: String) =
        post("/auth/2fa/recovery", obj("password" to password, "code" to code.trim()), RecoveryCodes.serializer()).recoveryCodes
    suspend fun signIns() = get("/auth/activity", ListSerializer(SignInEvent.serializer()))
    suspend fun logoutAll() { call("POST", "/auth/logout-all") }

    // ── Anime streams ────────────────────────────────────────────────────────
    suspend fun animeSearch(q: String) = get("/stream/anime/search", AnimeSearch.serializer(), mapOf("q" to q, "page" to 1))
    suspend fun animeEpisodes(id: String) = get("/stream/anime/episodes", AnimeEpisodes.serializer(), mapOf("id" to id))
    suspend fun animeWatch(id: String, server: String, category: String) =
        get("/stream/anime/watch", AnimeSources.serializer(), mapOf("id" to id, "server" to server, "category" to category))

    /** HEAD-checks a proxied stream URL, like the web player does before committing to HLS */
    suspend fun reachable(url: String): Boolean = withContext(Dispatchers.IO) {
        runCatching {
            client.newBuilder().callTimeout(6, TimeUnit.SECONDS).build()
                .newCall(Request.Builder().url(url).head().build()).execute().use { it.isSuccessful }
        }.getOrDefault(false)
    }

    /** Checks a server address before saving it */
    suspend fun ping(serverUrl: String): Boolean = withContext(Dispatchers.IO) {
        runCatching {
            client.newCall(Request.Builder().url(serverUrl.trimEnd('/') + "/health").build()).execute().use { it.isSuccessful }
        }.getOrDefault(false)
    }
}

/** Builds a JSON object from simple Kotlin values (null values are skipped) */
fun obj(vararg pairs: Pair<String, Any?>): JsonObject = kotlinx.serialization.json.buildJsonObject {
    pairs.forEach { (k, v) ->
        when (v) {
            null -> Unit
            is String -> put(k, kotlinx.serialization.json.JsonPrimitive(v))
            is Number -> put(k, kotlinx.serialization.json.JsonPrimitive(v))
            is Boolean -> put(k, kotlinx.serialization.json.JsonPrimitive(v))
            is JsonElement -> put(k, v)
            is List<*> -> put(k, kotlinx.serialization.json.JsonArray(v.map { kotlinx.serialization.json.JsonPrimitive(it as Number) }))
            else -> put(k, kotlinx.serialization.json.JsonPrimitive(v.toString()))
        }
    }
}
