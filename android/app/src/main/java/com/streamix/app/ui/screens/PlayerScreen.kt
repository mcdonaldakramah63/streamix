package com.streamix.app.ui.screens

import android.annotation.SuppressLint
import android.app.Activity
import android.content.pm.ActivityInfo
import android.net.Uri
import android.view.View
import android.view.ViewGroup
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.BackHandler
import androidx.annotation.OptIn
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Equalizer
import androidx.compose.material.icons.filled.Fullscreen
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material.icons.filled.SkipPrevious
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableDoubleStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import com.streamix.app.data.LibFile
import com.streamix.app.data.ProfilePrefs
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.filled.Lock
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.runtime.collectAsState
import com.streamix.app.data.Offline
import com.streamix.app.data.OfflineMeta
import com.streamix.app.data.PartyMedia
import androidx.compose.material.icons.filled.Groups
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.ui.PlayerView
import coil3.compose.AsyncImage
import com.streamix.app.data.Api
import com.streamix.app.data.ApiException
import com.streamix.app.data.CWItem
import com.streamix.app.data.Details
import com.streamix.app.data.Episode
import com.streamix.app.data.tmdbImage
import com.streamix.app.ui.components.Chip
import com.streamix.app.ui.components.ErrorState
import com.streamix.app.ui.components.GlassButton
import com.streamix.app.ui.components.Loading
import com.streamix.app.ui.components.PrimaryButton
import com.streamix.app.ui.components.TechPill
import com.streamix.app.ui.components.session
import com.streamix.app.ui.rememberLoad
import com.streamix.app.ui.theme.Sx
import kotlinx.coroutines.delay
import okhttp3.OkHttpClient

// ── Embed sources (identical to the web player) ──────────────────────────────
// Embed providers. The server ranks them (health checks + what happened in viewers' sessions — backend
// utils/sourceHealth.js); this list is only the fallback when that can't be fetched.
private data class Source(val id: String, val label: String, val movieTpl: String, val tvTpl: String) {
    fun movie(id: Int) = movieTpl.replace("{id}", "$id")
    fun tv(id: Int, s: Int, e: Int) = tvTpl.replace("{id}", "$id").replace("{s}", "$s").replace("{e}", "$e")
}

private val FALLBACK_SOURCES = listOf(
    Source("vidsrc", "VidSrc", "https://vidsrc.sh/embed/movie/{id}", "https://vidsrc.sh/embed/tv/{id}/{s}/{e}"),
    Source("vidsrc2", "VidSrc 2", "https://vidsrc.sh/embed/movie?tmdb={id}", "https://vidsrc.sh/embed/tv?tmdb={id}&season={s}&episode={e}"),
    Source("vidlink", "VidLink", "https://vidlink.pro/movie/{id}", "https://vidlink.pro/tv/{id}/{s}/{e}"),
    Source("autoembed", "AutoEmbed", "https://autoembed.co/movie/tmdb/{id}", "https://autoembed.co/tv/tmdb/{id}-{s}-{e}"),
    Source("2embed", "2Embed", "https://www.2embed.cc/embed/{id}", "https://www.2embed.cc/embedtv/{id}&s={s}&e={e}"),
    Source("multiembed", "Multiembed", "https://multiembed.mov/?video_id={id}&tmdb=1", "https://multiembed.mov/?video_id={id}&tmdb=1&s={s}&e={e}"),
)

private val ANIME_SERVERS = listOf("hd-2" to "sub", "hd-1" to "sub", "vidstreaming" to "sub", "hd-2" to "dub", "hd-1" to "dub")

private data class Sub(val url: String, val lang: String, val label: String)
private data class Hls(val url: String, val subs: List<Sub>)

/** Same lookup as the web player: search → episode → first server whose stream is reachable */
private suspend fun findAnimeStream(api: Api, title: String, episode: Int): Hls? {
    val hits = runCatching { api.animeSearch(title).animes }.getOrNull() ?: return null
    val best = hits.firstOrNull { it.name.equals(title, true) || it.jname.equals(title, true) } ?: hits.firstOrNull() ?: return null
    val eps = runCatching { api.animeEpisodes(best.id).episodes }.getOrNull() ?: return null
    val target = eps.firstOrNull { it.number == episode } ?: eps.getOrNull(episode - 1) ?: return null
    for ((server, category) in ANIME_SERVERS) {
        val src = try { api.animeWatch(target.episodeId, server, category) }
        catch (e: ApiException) { if (e.code >= 500) return null else continue }
        val m3u8 = src.sources.filter { it.isM3U8 || ".m3u8" in it.url }
        if (m3u8.isEmpty()) continue
        val url = api.proxied(m3u8.first().url, m3u8.first().proxied)
        if (!api.reachable(url)) continue
        val subs = src.tracks.filter { (it.kind == "captions" || it.kind == "subtitles") && it.file != null }.map {
            val label = it.label ?: "English"
            Sub(api.proxied(it.file!!, it.proxied), if (label.contains("english", true)) "en" else label.lowercase(), label)
        }
        return Hls(url, subs)
    }
    return null
}

private enum class Mode { Searching, Hls, Library, Embed }

@Composable
fun PlayerScreen(
    type: String, id: Int, startSeason: Int?, startEpisode: Int?, onBack: () -> Unit,
    /** Opens another title in the player (a watch-party guest following the host) */
    onSwitch: (String, Int, Int?, Int?) -> Unit = { _, _, _, _ -> },
    openParty: Boolean = false,
) {
    val s = session()
    val api = s.api
    val isTV = type == "tv"
    var season by remember { mutableIntStateOf(startSeason ?: 1) }
    var episode by remember { mutableIntStateOf(startEpisode ?: 1) }
    val epKey = if (isTV) "$id-s${season}e$episode" else "$id"

    val details = rememberLoad(type, id, memo = "details") { api.details(type, id) }
    val episodes = rememberLoad(id, season, memo = "season") { if (isTV) api.season(id, season).episodes else emptyList() }
    val d = details.value
    val eps = episodes.value.orEmpty()
    val curEp = eps.firstOrNull { it.episodeNumber == episode }

    var mode by remember(epKey) { mutableStateOf(Mode.Searching) }
    var hls by remember(epKey) { mutableStateOf<Hls?>(null) }
    var animeFailed by remember(epKey) { mutableStateOf(false) }
    var sourceIdx by remember { mutableIntStateOf(0) }
    // Providers best-first from the server; the built-in list until that arrives (or if it can't)
    var SOURCES by remember { mutableStateOf(FALLBACK_SOURCES) }
    LaunchedEffect(type) {
        runCatching { api.embedSources(type) }.getOrNull()?.sources?.takeIf { it.isNotEmpty() }?.let { list ->
            SOURCES = list.map { Source(it.id, it.label, it.template, it.template) }
            sourceIdx = 0
        }
    }
    // Session outcome per provider: 3+ minutes watched = works; failed to load / switched away within a minute = didn't
    var sourceStartedAt by remember { mutableStateOf(0L) }
    val failedSources = remember(epKey) { mutableSetOf<Int>() }
    var fullscreen by remember { mutableStateOf(false) }
    var webFullscreenView by remember { mutableStateOf<View?>(null) }
    var countdown by remember { mutableStateOf<Int?>(null) }
    var libFiles by remember(epKey) { mutableStateOf<List<LibFile>>(emptyList()) }
    // Free official uploads for this title (opened in the YouTube app — the studios' own player)
    var official by remember(id, type) { mutableStateOf<List<com.streamix.app.data.OfficialVid>>(emptyList()) }
    LaunchedEffect(id, type) { official = runCatching { api.officialFor(type, id).videos }.getOrDefault(emptyList()) }
    var libIdx by remember(epKey) { mutableIntStateOf(0) }
    var reporting by remember { mutableStateOf(false) }
    var exo by remember { mutableStateOf<ExoPlayer?>(null) }
    var partyOpen by remember { mutableStateOf(openParty) }
    val party = s.party
    val partyCode by party.code.collectAsState()
    val partyHost by party.hostId.collectAsState()
    val partyYou by party.you.collectAsState()
    val partyMedia by party.media.collectAsState()
    val inParty = partyCode != null
    val isHost = inParty && partyHost == partyYou
    val partyGuest = inParty && !isHost
    var seekTo by remember { mutableStateOf<Double?>(null) }
    val profile by s.activeProfile.collectAsState()
    val prefs = profile?.prefs ?: ProfilePrefs()
    val autoplayNext = prefs.autoplayNext || profile?.isKids == true

    // Playback bookkeeping
    var position by remember(epKey) { mutableDoubleStateOf(0.0) }   // seconds
    var duration by remember(epKey) { mutableDoubleStateOf(0.0) }
    var resumeAt by remember(epKey) { mutableDoubleStateOf(0.0) }

    fun durationSecs(): Double = when {
        duration > 0 -> duration
        isTV -> ((curEp?.runtime ?: d?.episodeRunTime?.firstOrNull() ?: 45) * 60).toDouble()
        else -> ((d?.runtime ?: 110) * 60).toDouble()
    }

    fun save(forceProgress: Double? = null) {
        val m = d ?: return
        val dur = durationSecs()
        s.saveProgress(CWItem(
            movieId = id, title = m.displayTitle, poster = m.posterPath.orEmpty(), backdrop = m.backdropPath.orEmpty(),
            type = type, season = if (isTV) season else null, episode = if (isTV) episode else null,
            episodeName = curEp?.name, progress = forceProgress ?: minOf(99.0, (position / dur * 100).toInt().toDouble()),
            timestamp = position, duration = dur, durationMins = dur / 60,
        ))
        if (isTV) s.saveEpisode(id, season, episode, (forceProgress ?: (position / dur * 100)).toInt())
    }
    val saveNow by rememberUpdatedState({ p: Double? -> save(p) })

    // Pick the stream when the title / episode changes
    LaunchedEffect(d?.id, epKey) {
        val m = d ?: return@LaunchedEffect
        val prev = s.progressFor(id)
        val sameEp = prev != null && (!isTV || (prev.season == season && prev.episode == episode))
        resumeAt = if (sameEp && prev!!.progress < 97) prev.timestamp else 0.0
        position = resumeAt
        mode = Mode.Searching
        // Videos an admin added to the Streamix library for this title play first
        val files = runCatching { api.libraryFiles(type, id, if (isTV) season else null, if (isTV) episode else null) }.getOrDefault(emptyList())
        if (files.isNotEmpty()) {
            libFiles = files; libIdx = 0; mode = Mode.Library
        } else if (m.isAnime && isTV) {
            val found = findAnimeStream(api, m.displayTitle, episode)
            if (found != null) { hls = found; mode = Mode.Hls } else { animeFailed = true; mode = Mode.Embed }
        } else mode = Mode.Embed
        save(if (sameEp) prev!!.progress else 0.0)
        delay(30_000)
        s.recordWatch(id, m.displayTitle, type, m.genres.map { it.id }, m.originalLanguage ?: "en", false)
        s.track("play", type, id)
    }

    val sourceLifecycle = LocalLifecycleOwner.current.lifecycle
    LaunchedEffect(mode, sourceIdx, epKey, SOURCES) {
        if (mode != Mode.Embed) return@LaunchedEffect
        sourceStartedAt = System.currentTimeMillis()
        delay(180_000)
        if (sourceLifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) s.reportSource(SOURCES[sourceIdx].id, type, true)
    }

    // Embeds can't report playback time — count foreground watch time instead
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    LaunchedEffect(mode, epKey) {
        while (mode == Mode.Embed) {
            delay(1000)
            if (lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) position += 1
        }
    }
    // Periodic + final save
    LaunchedEffect(epKey) { while (true) { delay(15_000); if (position > 5 && mode != Mode.Searching) saveNow(null) } }
    DisposableEffect(epKey) { onDispose { if (position > 5) saveNow(null) } }

    // Episode navigation
    val totalSeasons = d?.numberOfSeasons ?: 1
    val nextEp = eps.firstOrNull { it.episodeNumber == episode + 1 }
    val prevEp = eps.firstOrNull { it.episodeNumber == episode - 1 }
    val hasNextSeason = nextEp == null && season < totalSeasons
    fun goTo(sn: Int, ep: Int) { countdown = null; season = sn; episode = ep }
    fun goNext() { if (nextEp != null) goTo(season, nextEp.episodeNumber) else if (hasNextSeason) goTo(season + 1, 1) }

    LaunchedEffect(countdown) {
        val c = countdown ?: return@LaunchedEffect
        if (c <= 0) goNext() else { delay(1000); countdown = c - 1 }
    }

    // ── Watch party ──────────────────────────────────────────────────────────
    val ctx = LocalContext.current
    val thisMedia = d?.let { PartyMedia(type, id, if (isTV) season else null, if (isTV) episode else null, it.displayTitle, tmdbImage(it.posterPath, "w185").orEmpty()) }
    // Host moved to another episode → everyone follows
    LaunchedEffect(isHost, thisMedia) { if (isHost && thisMedia != null) party.setMedia(thisMedia) }
    // Guest: go wherever the host is
    LaunchedEffect(partyGuest, partyMedia) {
        val m = partyMedia ?: return@LaunchedEffect
        if (!partyGuest || m.id == 0) return@LaunchedEffect
        if (m.type == type && m.id == id) { if (isTV && m.season != null && m.episode != null && (m.season != season || m.episode != episode)) goTo(m.season, m.episode) }
        else onSwitch(m.type, m.id, m.season, m.episode)
    }
    // Host: broadcast play / pause / seek, plus a heartbeat
    LaunchedEffect(isHost, exo) {
        val p = exo ?: return@LaunchedEffect
        if (!isHost) return@LaunchedEffect
        val listener = object : Player.Listener {
            override fun onPlayWhenReadyChanged(playWhenReady: Boolean, reason: Int) { party.sync(playWhenReady, p.currentPosition / 1000.0) }
            override fun onPositionDiscontinuity(old: Player.PositionInfo, new: Player.PositionInfo, reason: Int) {
                if (reason == Player.DISCONTINUITY_REASON_SEEK) party.sync(p.playWhenReady, new.positionMs / 1000.0, seek = true)
            }
        }
        p.addListener(listener)
        party.sync(p.playWhenReady, p.currentPosition / 1000.0, seek = true)
        try { while (true) { delay(4000); party.sync(p.playWhenReady, p.currentPosition / 1000.0) } }
        finally { p.removeListener(listener) }
    }
    // Guest: follow the host
    LaunchedEffect(partyGuest, exo) {
        val p = exo ?: return@LaunchedEffect
        if (!partyGuest) return@LaunchedEffect
        fun apply(m: com.streamix.app.data.PartySync) {
            val expected = m.time + if (m.playing) (System.currentTimeMillis() - m.at) / 1000.0 + 0.2 else 0.0
            if (m.seek || kotlin.math.abs(p.currentPosition / 1000.0 - expected) > 1.5) p.seekTo((expected * 1000).toLong().coerceAtLeast(0))
            p.playWhenReady = m.playing
        }
        party.lastSync?.let { apply(it.copy(seek = true)) }
        party.requestSync()
        party.syncs.collect { apply(it) }
    }

    // Kids profiles: stop at the daily limit / bedtime, and report each minute watched
    var kidsLocked by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(profile?.id) {
        val p = profile?.takeIf { it.isKids } ?: return@LaunchedEffect
        fun day() = java.time.LocalDate.now().toString()
        fun time() = java.time.LocalTime.now().let { "%02d:%02d".format(it.hour, it.minute) }
        runCatching { api.kidsStatus(p.id, day(), time()) }.getOrNull()?.takeIf { !it.allowed }?.let { kidsLocked = it.reason; return@LaunchedEffect }
        // Blocked titles / "only titles I pick"
        runCatching { api.kidsCheck(p.id, type, id) }.getOrNull()?.takeIf { !it.allowed }?.let { kidsLocked = it.reason ?: "blocked"; return@LaunchedEffect }
        while (true) {
            delay(60_000)
            if (mode == Mode.Searching || !lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) continue
            val st = runCatching { api.addKidsUsage(p.id, day(), time()) }.getOrNull() ?: continue
            if (!st.allowed) { kidsLocked = st.reason; break }
        }
    }

    // Fullscreen: landscape + hidden system bars
    val activity = LocalContext.current as Activity
    val view = LocalView.current
    val immersive = fullscreen || webFullscreenView != null
    DisposableEffect(immersive) {
        val controller = WindowCompat.getInsetsController(activity.window, view)
        if (immersive) {
            activity.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
            controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            controller.hide(WindowInsetsCompat.Type.systemBars())
        } else {
            activity.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
            controller.show(WindowInsetsCompat.Type.systemBars())
        }
        onDispose {
            activity.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
            controller.show(WindowInsetsCompat.Type.systemBars())
        }
    }
    BackHandler(enabled = immersive) { fullscreen = false; webFullscreenView = null }

    val embedUrl = SOURCES[sourceIdx].let { if (isTV) it.tv(id, season, episode) else it.movie(id) }

    val video: @Composable (Modifier) -> Unit = { mod ->
        Box(mod.background(Color.Black)) {
            when {
                details.value == null && details.state is com.streamix.app.ui.Load.Err ->
                    ErrorState("Couldn't load this title", Modifier.align(Alignment.Center), onRetry = details.retry)
                mode == Mode.Searching -> Column(Modifier.align(Alignment.Center), horizontalAlignment = Alignment.CenterHorizontally) {
                    Loading()
                    Text(if (d?.isAnime == true) "Finding the anime stream…" else "Loading…", color = Sx.InkMuted, style = MaterialTheme.typography.bodySmall)
                }
                kidsLocked != null -> Column(Modifier.align(Alignment.Center).padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(Icons.Filled.Lock, null, tint = Sx.Gold, modifier = Modifier.size(36.dp))
                    Spacer(Modifier.height(8.dp))
                    Text(when (kidsLocked) { "bedtime" -> "It's bedtime"; "limit" -> "Screen time is up for today"; else -> "This one isn't available" },
                        style = MaterialTheme.typography.titleMedium, color = Color.White)
                    Text("Ask a grown-up if you want to keep watching.", style = MaterialTheme.typography.bodySmall, color = Sx.InkMuted)
                }
                mode == Mode.Library && libFiles.getOrNull(libIdx) != null -> {
                    val f = libFiles[libIdx]
                    Box(Modifier.fillMaxSize()) {
                        ExoVideo(
                            url = if (f.playUrl.startsWith("/")) api.server + f.playUrl else f.playUrl, hlsStream = f.format == "hls",
                            subs = f.subtitles.map { Sub(if (it.url.startsWith("/")) api.server + it.url else it.url, it.lang, it.label) },
                            startSec = resumeAt, client = api.client, prefs = prefs, seekTo = seekTo, onSeeked = { seekTo = null },
                            fullscreen = fullscreen, onToggleFullscreen = { fullscreen = !fullscreen },
                            onProgress = { p, dur -> position = p; if (dur > 0) duration = dur },
                            onEnded = {
                                save(100.0)
                                d?.let { m -> s.recordWatch(id, m.displayTitle, type, m.genres.map { it.id }, m.originalLanguage ?: "en", true) }
                                if (isTV && autoplayNext && (nextEp != null || hasNextSeason)) countdown = 10
                            },
                            onError = { animeFailed = true; mode = Mode.Embed },
                            onPlayer = { exo = it },
                        )
                        // Intro / credits markers set by the admin
                        val m = f.markers
                        val inIntro = m.introStart != null && m.introEnd != null && position >= m.introStart && position < m.introEnd
                        val inCredits = m.creditsStart != null && position >= m.creditsStart && isTV && (nextEp != null || hasNextSeason)
                        if (inIntro) Box(Modifier.align(Alignment.BottomEnd).padding(end = 12.dp, bottom = 56.dp)) { GlassButton("Skip intro", Icons.Filled.SkipNext) { seekTo = m.introEnd } }
                        else if (inCredits) Box(Modifier.align(Alignment.BottomEnd).padding(end = 12.dp, bottom = 56.dp)) { GlassButton("Next episode", Icons.Filled.SkipNext) { goNext() } }
                    }
                }
                mode == Mode.Hls && hls != null -> ExoVideo(
                    url = hls!!.url, subs = hls!!.subs, startSec = resumeAt, client = api.client, prefs = prefs,
                    seekTo = null, onSeeked = {},
                    fullscreen = fullscreen, onToggleFullscreen = { fullscreen = !fullscreen },
                    onProgress = { p, dur -> position = p; if (dur > 0) duration = dur },
                    onEnded = {
                        save(100.0)
                        d?.let { m -> s.recordWatch(id, m.displayTitle, type, m.genres.map { it.id }, m.originalLanguage ?: "en", true) }
                        if (isTV && autoplayNext && (nextEp != null || hasNextSeason)) countdown = 10
                    },
                    onError = { animeFailed = true; mode = Mode.Embed },
                    onPlayer = { exo = it },
                )
                else -> EmbedVideo(embedUrl, api.server, onCustomView = { webFullscreenView = it }, onFailed = {
                    // This provider didn't load: try the next one (once round the list)
                    s.reportSource(SOURCES[sourceIdx].id, type, false)
                    if (failedSources.add(sourceIdx) && failedSources.size < SOURCES.size) {
                        val next = (1 until SOURCES.size).map { (sourceIdx + it) % SOURCES.size }.first { it !in failedSources }
                        android.widget.Toast.makeText(ctx, "${SOURCES[sourceIdx].label} didn't load — trying ${SOURCES[next].label}", android.widget.Toast.LENGTH_SHORT).show()
                        sourceIdx = next
                    }
                })
            }
            if (inParty) PartyOverlay()
        }
    }

    Box(Modifier.fillMaxSize().background(Sx.Void)) {
    Column(Modifier.fillMaxSize()) {
        if (!fullscreen) Row(Modifier.statusBarsPadding().height(60.dp).padding(horizontal = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back", tint = Color.White) }
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(d?.displayTitle.orEmpty(), style = MaterialTheme.typography.titleMedium, color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                    Spacer(Modifier.width(6.dp))
                    when {
                        mode == Mode.Library -> TechPill("Streamix", Sx.Gold, Sx.Gold.copy(alpha = 0.15f))
                        mode == Mode.Hls -> TechPill("HLS", Sx.Soft, Sx.Scarlet.copy(alpha = 0.2f))
                        mode == Mode.Embed && d?.isAnime == true -> TechPill("Embed", Sx.Gold)
                        else -> Unit
                    }
                }
                if (isTV) Text("S$season:E$episode${curEp?.name?.let { " • $it" } ?: ""}", style = MaterialTheme.typography.bodySmall, color = Sx.InkFaint, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            val libFile = libFiles.getOrNull(libIdx)
            val dlId = Offline.keyFor(type, id, if (isTV) season else null, if (isTV) episode else null)
            if (d != null && profile?.isKids != true && ((mode == Mode.Library && libFile != null) || (mode == Mode.Hls && hls != null))) {
                DownloadButton(dlId) {
                    val meta = OfflineMeta(type, id, if (isTV) season else null, if (isTV) episode else null, d.displayTitle, curEp?.name,
                        tmdbImage(d.posterPath).orEmpty(), hls = mode == Mode.Hls || libFile?.format == "hls",
                        libId = if (mode == Mode.Library && libFile?.format != "hls") libFile?.id else null)
                    val url = when {
                        mode == Mode.Hls -> hls!!.url
                        libFile!!.format == "hls" -> if (libFile.playUrl.startsWith("/")) api.server + libFile.playUrl else libFile.playUrl
                        else -> api.server + api.libraryDownload(libFile.id).offlineUrl
                    }
                    // Anime streams' subtitle tracks are saved with the video
                    val subs = when {
                        mode == Mode.Hls -> hls!!.subs.map { com.streamix.app.data.SubSource(it.url, it.lang, it.label) }
                        // Library videos' subtitles go into the download too
                        else -> libFile?.subtitles.orEmpty().map { com.streamix.app.data.SubSource(if (it.url.startsWith("/")) api.server + it.url else it.url, it.lang, it.label) }
                    }
                    Offline.start(ctx, api, dlId, url, meta, prefs.quality, subs)
                }
            }
            if (profile?.isKids != true) IconButton(onClick = { partyOpen = !partyOpen }) {
                Icon(Icons.Filled.Groups, "Watch party", tint = if (inParty) Sx.Scarlet else Color.White)
            }
            IconButton(onClick = { reporting = true }) { Icon(Icons.Filled.Flag, "Report a problem", tint = Sx.InkMuted) }
            IconButton(onClick = { fullscreen = true }) { Icon(Icons.Filled.Fullscreen, "Fullscreen", tint = Color.White) }
        }

        // One call site for the video so the player keeps playing when toggling fullscreen
        video(if (fullscreen) Modifier.fillMaxSize() else Modifier.fillMaxWidth().aspectRatio(16f / 9f))

        if (!fullscreen) LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 40.dp)) {
            if (partyOpen) item {
                PartyPanel(thisMedia, canSync = mode == Mode.Hls || mode == Mode.Library, onClose = { partyOpen = false })
            }
            if (animeFailed && mode == Mode.Embed) item {
                Text("Direct stream unavailable — using embed", style = MaterialTheme.typography.labelMedium, color = Sx.Gold, modifier = Modifier.padding(16.dp, 10.dp, 16.dp, 0.dp))
            }
            countdown?.takeIf { it > 0 }?.let { c ->
                item {
                    Row(Modifier.padding(16.dp).fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Sx.Card).padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text("Up next: ${nextEp?.name ?: "Season ${season + 1}"}", style = MaterialTheme.typography.titleSmall, color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text("Playing in ${c}s", style = MaterialTheme.typography.bodySmall, color = Sx.InkFaint)
                        }
                        PrimaryButton("Play", onClick = { goNext() })
                        Spacer(Modifier.width(8.dp))
                        GlassButton("Cancel", null) { countdown = null }
                    }
                }
            }
            if (mode == Mode.Library && libFiles.size > 1) item {
                LazyRow(contentPadding = PaddingValues(16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    item { Text("STREAMIX", style = MaterialTheme.typography.labelSmall, color = Sx.Gold) }
                    itemsIndexed(libFiles) { i, f -> Chip(f.title.take(24).ifBlank { "Version ${i + 1}" }, i == libIdx) { libIdx = i } }
                }
            }
            val officialNow = official.firstOrNull { !isTV || (it.season == season && it.episode == episode) }
            if (officialNow != null) item {
                val c = LocalContext.current
                Row(Modifier.padding(16.dp, 12.dp, 16.dp, 0.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("FREE", style = MaterialTheme.typography.labelSmall, color = Sx.Cyan)
                    Spacer(Modifier.width(10.dp))
                    Chip("Official · ${officialNow.channel} ↗", false) {
                        runCatching {
                            c.startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse("https://www.youtube.com/watch?v=${officialNow.videoId}")))
                        }
                    }
                }
            }
            if (mode == Mode.Embed) item {
                LazyRow(contentPadding = PaddingValues(16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    item { Text("SOURCE", style = MaterialTheme.typography.labelSmall, color = Sx.InkFaint) }
                    itemsIndexed(SOURCES) { i, src -> Chip(src.label, i == sourceIdx) {
                        if (i != sourceIdx && System.currentTimeMillis() - sourceStartedAt < 60_000) s.reportSource(SOURCES[sourceIdx].id, type, false)
                        sourceIdx = i
                    } }
                }
            }
            if (isTV) {
                item {
                    Row(Modifier.padding(horizontal = 16.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                        LazyRow(Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            items((1..totalSeasons).toList()) { sn -> Chip("S$sn", sn == season) { goTo(sn, 1) } }
                        }
                        IconButton(onClick = { prevEp?.let { goTo(season, it.episodeNumber) } }, enabled = prevEp != null) {
                            Icon(Icons.Filled.SkipPrevious, "Previous episode", tint = if (prevEp != null) Color.White else Sx.InkFaint)
                        }
                        IconButton(onClick = { goNext() }, enabled = nextEp != null || hasNextSeason) {
                            Icon(Icons.Filled.SkipNext, "Next episode", tint = if (nextEp != null || hasNextSeason) Color.White else Sx.InkFaint)
                        }
                    }
                }
                items(eps, key = { it.id }) { ep -> EpisodeRow(ep, ep.episodeNumber == episode) { goTo(season, ep.episodeNumber) } }
            } else if (d != null) item { MovieInfo(d) }
        }
    }
    if (reporting) ReportDialog(
        type, id, if (isTV) season else null, if (isTV) episode else null, d?.displayTitle.orEmpty(),
        source = when (mode) { Mode.Library -> "Streamix"; Mode.Hls -> "Anime stream"; else -> SOURCES[sourceIdx].label },
        onDismiss = { reporting = false },
    )
    // Fullscreen video from an embed (HTML5 fullscreen) shown over everything
    webFullscreenView?.let { v -> AndroidView({ v }, Modifier.fillMaxSize().background(Color.Black)) }
    }
}

@Composable
private fun EpisodeRow(ep: Episode, active: Boolean, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().background(if (active) Sx.Scarlet.copy(alpha = 0.1f) else Color.Transparent).clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.width(120.dp).aspectRatio(16f / 9f).clip(RoundedCornerShape(10.dp)).background(Sx.Card)) {
            AsyncImage(tmdbImage(ep.stillPath, "w300"), null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
            if (active) Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.45f)), contentAlignment = Alignment.Center) {
                Icon(Icons.Filled.Equalizer, "Now playing", tint = Sx.Scarlet)
            }
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text("${ep.episodeNumber}. ${ep.name}", style = MaterialTheme.typography.titleSmall, color = if (active) Sx.Soft else Color.White, maxLines = 2, overflow = TextOverflow.Ellipsis)
            ep.runtime?.let { Text("${it}m", style = MaterialTheme.typography.bodySmall, color = Sx.InkFaint) }
        }
    }
}

@Composable
private fun MovieInfo(d: Details) {
    Column(Modifier.padding(16.dp)) {
        Text(d.displayTitle, style = MaterialTheme.typography.titleLarge, color = Color.White)
        Text(listOfNotNull(d.year.ifBlank { null }, d.runtime?.let { "$it min" }, d.voteAverage.takeIf { it > 0 }?.let { "★ %.1f".format(it) }).joinToString(" • "),
            style = MaterialTheme.typography.bodySmall, color = Sx.InkFaint)
        Spacer(Modifier.height(8.dp))
        Text(d.overview.orEmpty(), style = MaterialTheme.typography.bodyMedium, color = Sx.InkMuted)
    }
}

// ── Offline playback (a finished download) ──────────────────────────────────

@Composable
fun OfflinePlayerScreen(downloadId: String, onBack: () -> Unit) {
    val s = session()
    val ctx = LocalContext.current
    val item = remember(downloadId) { Offline.manager(ctx, s.api); Offline.refresh(); Offline.find(downloadId) }
    val media = remember(downloadId) { Offline.playback(ctx, s.api, downloadId) }
    var fullscreen by remember { mutableStateOf(false) }
    var position by remember { mutableDoubleStateOf(0.0) }
    var duration by remember { mutableDoubleStateOf(0.0) }
    val meta = item?.meta
    // Resume where the online player (or a previous offline session) left off
    val resume = remember(downloadId) {
        meta?.let { m -> s.progressFor(m.tmdbId)?.takeIf { p -> m.type != "tv" || (p.season == m.season && p.episode == m.episode) }?.takeIf { it.progress < 97 }?.timestamp } ?: 0.0
    }
    fun save(force: Double? = null) {
        val m = meta ?: return
        if (duration <= 0 || position < 5) return
        s.saveProgress(CWItem(m.tmdbId, m.title, m.poster.substringAfter("/w342", m.poster), "", m.type, m.season, m.episode, m.episodeName,
            force ?: minOf(99.0, position / duration * 100), position, duration, duration / 60))
    }
    val saveNow by rememberUpdatedState({ save() })
    DisposableEffect(Unit) { onDispose { saveNow() } }

    val activity = ctx as Activity
    val view = LocalView.current
    DisposableEffect(fullscreen) {
        val controller = WindowCompat.getInsetsController(activity.window, view)
        if (fullscreen) {
            activity.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
            controller.hide(WindowInsetsCompat.Type.systemBars())
        } else {
            activity.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
            controller.show(WindowInsetsCompat.Type.systemBars())
        }
        onDispose { activity.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED; controller.show(WindowInsetsCompat.Type.systemBars()) }
    }
    BackHandler(enabled = fullscreen) { fullscreen = false }

    Column(Modifier.fillMaxSize().background(Sx.Void)) {
        if (!fullscreen) Row(Modifier.statusBarsPadding().height(60.dp).padding(horizontal = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back", tint = Color.White) }
            Column(Modifier.weight(1f)) {
                Text(meta?.title.orEmpty(), style = MaterialTheme.typography.titleMedium, color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (meta?.type == "tv") Text("S${meta.season}:E${meta.episode}${meta.episodeName?.let { " • $it" } ?: ""}", style = MaterialTheme.typography.bodySmall, color = Sx.InkFaint)
            }
            TechPill("Offline", Sx.Cyan)
            Spacer(Modifier.width(8.dp))
        }
        Box(if (fullscreen) Modifier.fillMaxSize() else Modifier.fillMaxWidth().aspectRatio(16f / 9f)) {
            if (media == null || item?.done != true) ErrorState("This download isn't ready yet", Modifier.align(Alignment.Center))
            else ExoVideo(
                url = "", subs = emptyList(), startSec = resume, client = s.api.client, prefs = s.activeProfile.collectAsState().value?.prefs ?: ProfilePrefs(),
                seekTo = null, onSeeked = {}, fullscreen = fullscreen, onToggleFullscreen = { fullscreen = !fullscreen },
                onProgress = { p, dur -> position = p; if (dur > 0) duration = dur }, onEnded = { save(100.0) }, onError = {},
                mediaOverride = media,
            )
        }
    }
}

// ── ExoPlayer (direct HLS through the backend proxy) ─────────────────────────

@OptIn(UnstableApi::class)
@Composable
private fun ExoVideo(
    url: String, subs: List<Sub>, startSec: Double, client: OkHttpClient, prefs: ProfilePrefs,
    seekTo: Double?, onSeeked: () -> Unit,
    fullscreen: Boolean, onToggleFullscreen: () -> Unit,
    onProgress: (Double, Double) -> Unit, onEnded: () -> Unit, onError: () -> Unit,
    hlsStream: Boolean = true,
    onPlayer: (ExoPlayer?) -> Unit = {},
    mediaOverride: Pair<MediaItem, androidx.media3.datasource.DataSource.Factory>? = null,
) {
    val ctx = LocalContext.current
    val ended by rememberUpdatedState(onEnded)
    val failed by rememberUpdatedState(onError)
    val progress by rememberUpdatedState(onProgress)

    val player = remember(url) {
        ExoPlayer.Builder(ctx)
            .setMediaSourceFactory(DefaultMediaSourceFactory(mediaOverride?.second ?: OkHttpDataSource.Factory(client)))
            .build().apply {
                setMediaItem(
                    mediaOverride?.first ?: MediaItem.Builder().setUri(url).apply { if (hlsStream) setMimeType(MimeTypes.APPLICATION_M3U8) }
                        .setSubtitleConfigurations(subs.map {
                            MediaItem.SubtitleConfiguration.Builder(Uri.parse(it.url))
                                .setMimeType(MimeTypes.TEXT_VTT).setLanguage(it.lang).setLabel(it.label).build()
                        }).build()
                )
                // Profile preferences: subtitle language and data usage
                trackSelectionParameters = trackSelectionParameters.buildUpon().apply {
                    if (prefs.subtitleLang.isNotBlank()) setPreferredTextLanguage(prefs.subtitleLang)
                    if (prefs.quality == "saver") setMaxVideoSize(854, 480)
                }.build()
                if (startSec > 5) seekTo((startSec * 1000).toLong())
                prepare()
                playWhenReady = true
            }
    }

    DisposableEffect(player) {
        val listener = object : Player.Listener {
            override fun onPlaybackStateChanged(state: Int) { if (state == Player.STATE_ENDED) ended() }
            override fun onPlayerError(error: PlaybackException) { failed() }
        }
        player.addListener(listener)
        onPlayer(player)
        onDispose {
            progress(player.currentPosition / 1000.0, player.duration.coerceAtLeast(0) / 1000.0)
            onPlayer(null)
            player.removeListener(listener)
            player.release()
        }
    }
    LaunchedEffect(player) {
        while (true) {
            delay(1000)
            progress(player.currentPosition / 1000.0, player.duration.coerceAtLeast(0) / 1000.0)
        }
    }

    LaunchedEffect(seekTo) { seekTo?.let { player.seekTo((it * 1000).toLong()); onSeeked() } }
    var controls by remember { mutableStateOf<PlayerView?>(null) }

    Box(Modifier.fillMaxSize()) {
    AndroidView(
        factory = {
            PlayerView(it).apply {
                controls = this
                this.player = player
                setShowSubtitleButton(true)
                setFullscreenButtonClickListener { onToggleFullscreen() }
                layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
            }
        },
        update = { it.player = player; it.setFullscreenButtonState(fullscreen) },
        modifier = Modifier.fillMaxSize(),
    )
    // Double-tap the left / right half to skip 10 s; a single tap still shows the controls.
    // The bottom strip is left alone so the seek bar and buttons keep working.
    Box(
        Modifier.align(Alignment.TopCenter).fillMaxWidth().fillMaxHeight(0.7f).pointerInput(player) {
            detectTapGestures(
                onTap = { controls?.let { v -> if (v.isControllerFullyVisible) v.hideController() else v.showController() } },
                onDoubleTap = { o ->
                    val target = if (o.x < size.width / 2) player.currentPosition - 10_000 else player.currentPosition + 10_000
                    player.seekTo(target.coerceIn(0, maxOf(0L, player.duration)))
                },
            )
        },
    )
    }
}

// ── Embed sites in a WebView ─────────────────────────────────────────────────

/**
 * The provider page inside an iframe — the same setup as the web player. The wrapper gets a private https origin
 * (never fetched): players need a secure context (crypto.subtle), which a plain http://<LAN-IP> page can't give.
 */
private const val EMBED_ORIGIN = "https://player.streamix.invalid/"

private fun embedPage(url: String) = """<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}iframe{position:fixed;top:0;left:0;border:0;width:100%;height:100%;display:block}</style></head>
<body><iframe src="${android.text.Html.escapeHtml(url)}" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen referrerpolicy="origin"></iframe></body></html>"""

@SuppressLint("SetJavaScriptEnabled")
@Composable
private fun EmbedVideo(url: String, server: String, onCustomView: (View?) -> Unit, onFailed: () -> Unit) {
    val customView by rememberUpdatedState(onCustomView)
    val failed by rememberUpdatedState(onFailed)
    val wrapperHost = Uri.parse(EMBED_ORIGIN).host.orEmpty()
    AndroidView(
        factory = { ctx ->
            WebView(ctx).apply {
                setBackgroundColor(android.graphics.Color.BLACK)
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = true
                settings.mediaPlaybackRequiresUserGesture = false
                settings.mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
                // Several providers refuse Android WebViews ("; wv") — look like the phone's Chrome instead
                settings.userAgentString = settings.userAgentString.replace("; wv", "").replace(Regex("Version/\\d+(\\.\\d+)* "), "")
                // Players keep session state in cookies of their own (third-party inside our page)
                android.webkit.CookieManager.getInstance().setAcceptCookie(true)
                // Same as the web app's popup blocking: embeds can't open new windows
                settings.setSupportMultipleWindows(false)
                settings.javaScriptCanOpenWindowsAutomatically = false
                webViewClient = object : WebViewClient() {
                    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                        // The provider runs in the iframe; anything trying to take over the whole page is an ad redirect
                        if (!request.isForMainFrame) return false
                        val host = request.url.host.orEmpty()
                        return host != wrapperHost
                    }
                    /** Is this the provider's own page (the iframe document), not one of its images or scripts? */
                    private fun isEmbedDoc(v: WebView, r: WebResourceRequest): Boolean {
                        val embed = Uri.parse(v.tag as? String ?: return false)
                        return !r.isForMainFrame && r.url.host == embed.host && r.url.path == embed.path
                    }
                    override fun onReceivedHttpError(v: WebView, r: WebResourceRequest, res: android.webkit.WebResourceResponse) {
                        if (isEmbedDoc(v, r) && res.statusCode >= 400) failed()
                    }
                    override fun onReceivedError(v: WebView, r: WebResourceRequest, e: android.webkit.WebResourceError) {
                        if (isEmbedDoc(v, r)) failed()
                    }
                }
                webChromeClient = object : WebChromeClient() {
                    override fun onShowCustomView(view: View, callback: CustomViewCallback) { customView(view) }
                    override fun onHideCustomView() { customView(null) }
                }
                android.webkit.CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)
                tag = url
                loadDataWithBaseURL(EMBED_ORIGIN, embedPage(url), "text/html", "utf-8", null)
            }
        },
        update = { if (it.tag != url) { it.tag = url; it.loadDataWithBaseURL(EMBED_ORIGIN, embedPage(url), "text/html", "utf-8", null) } },
        onRelease = { it.stopLoading(); it.destroy() },
        modifier = Modifier.fillMaxSize(),
    )
}
