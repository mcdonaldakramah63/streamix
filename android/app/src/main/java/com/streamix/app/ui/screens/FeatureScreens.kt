package com.streamix.app.ui.screens

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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Campaign
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.NotificationsActive
import androidx.compose.material.icons.filled.NotificationsNone
import androidx.compose.material.icons.filled.Replay
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.LiveTv
import androidx.compose.material.icons.filled.VideoLibrary
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.streamix.app.data.InboxItem
import com.streamix.app.data.Media
import com.streamix.app.data.ProfilePrefs
import com.streamix.app.data.SoonItem
import com.streamix.app.data.UpEp
import com.streamix.app.data.tmdbImage
import com.streamix.app.ui.Load
import com.streamix.app.ui.components.Chip
import com.streamix.app.ui.components.ErrorState
import com.streamix.app.ui.components.GlassButton
import com.streamix.app.ui.components.GlassCard
import com.streamix.app.ui.components.Loading
import com.streamix.app.ui.components.MediaRail
import com.streamix.app.ui.components.PinDialog
import com.streamix.app.ui.components.PrimaryButton
import com.streamix.app.ui.components.SectionHeader
import com.streamix.app.ui.components.TechPill
import com.streamix.app.ui.components.session
import com.streamix.app.ui.rememberLoad
import com.streamix.app.ui.theme.Sx
import com.streamix.app.ui.userMessage
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit

// ── Helpers ──────────────────────────────────────────────────────────────────

/** "Today", "Tomorrow", "Fri 3 Oct" … for an ISO date */
fun dayLabel(iso: String): String {
    val d = runCatching { LocalDate.parse(iso.take(10)) }.getOrNull() ?: return iso
    return when (ChronoUnit.DAYS.between(LocalDate.now(), d)) {
        0L -> "Today"
        1L -> "Tomorrow"
        else -> d.format(DateTimeFormatter.ofPattern("EEE d MMM"))
    }
}

private fun ago(iso: String): String {
    val t = runCatching { Instant.parse(iso) }.getOrNull() ?: return ""
    val s = maxOf(1, (System.currentTimeMillis() - t.toEpochMilli()) / 1000)
    return when {
        s < 3600 -> "${maxOf(1, s / 60)}m"
        s < 86400 -> "${s / 3600}h"
        else -> "${s / 86400}d"
    } + " ago"
}

@Composable
private fun ScreenHeader(title: String, onBack: () -> Unit, trailing: (@Composable () -> Unit)? = null) {
    Row(Modifier.statusBarsPadding().padding(horizontal = 6.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back", tint = Color.White) }
        Text(title, style = MaterialTheme.typography.headlineSmall, color = Color.White, modifier = Modifier.weight(1f))
        trailing?.invoke()
    }
}

// ── Notification bell ────────────────────────────────────────────────────────

/** Unread count for the bell on Home; refreshes whenever [refreshKey] changes */
@Composable
fun rememberUnread(refreshKey: Any? = Unit): Int {
    val api = session().api
    var unread by remember { mutableStateOf(0) }
    LaunchedEffect(refreshKey) { unread = runCatching { api.inbox().unread }.getOrDefault(0) }
    return unread
}

@Composable
fun BellButton(unread: Int, onClick: () -> Unit) {
    Box {
        IconButton(onClick = onClick, modifier = Modifier.clip(CircleShape).background(Sx.Void.copy(alpha = 0.6f))) {
            Icon(if (unread > 0) Icons.Filled.NotificationsActive else Icons.Filled.NotificationsNone, "Notifications", tint = Color.White)
        }
        if (unread > 0) Box(
            Modifier.align(Alignment.TopEnd).padding(2.dp).size(18.dp).clip(CircleShape).background(Sx.Scarlet),
            contentAlignment = Alignment.Center,
        ) { Text(if (unread > 9) "9+" else "$unread", style = MaterialTheme.typography.labelSmall, color = Color.White) }
    }
}

/** Opens the screen a web-style notification link points at ("/tv/12", "/movie/5", "/player/tv/12?season=1&episode=2") */
fun routeForUrl(url: String): Pair<String, List<Int>>? {
    val parts = url.substringBefore('?').trim('/').split('/')
    val query = url.substringAfter('?', "")
    fun q(name: String) = query.split('&').firstOrNull { it.startsWith("$name=") }?.substringAfter('=')?.toIntOrNull()
    return when {
        parts.size == 2 && (parts[0] == "tv" || parts[0] == "movie") -> parts[0] to listOfNotNull(parts[1].toIntOrNull())
        parts.size == 3 && parts[0] == "player" -> "player:${parts[1]}" to listOfNotNull(parts[2].toIntOrNull(), q("season"), q("episode"))
        else -> null
    }
}

@Composable
fun InboxScreen(onBack: () -> Unit, onUrl: (String) -> Unit) {
    val api = session().api
    val inbox = rememberLoad(Unit) { api.inbox().also { runCatching { api.inboxSeen() } } }

    Column(Modifier.fillMaxSize().background(Sx.Surface)) {
        ScreenHeader("Notifications", onBack)
        when (val st = inbox.state) {
            is Load.Loading -> Loading()
            is Load.Err -> ErrorState(st.message, onRetry = inbox.retry)
            is Load.Ok -> if (st.value.items.isEmpty()) ErrorState("Nothing yet. New episodes of your shows, reminders and new videos show up here.")
            else LazyColumn(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 40.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(st.value.items, key = { it.id }) { n -> InboxRow(n) { onUrl(n.url) } }
            }
        }
    }
}

@Composable
private fun InboxRow(n: InboxItem, onClick: () -> Unit) {
    val icon: ImageVector = when (n.kind) {
        "episode" -> Icons.Filled.LiveTv
        "reminder" -> Icons.Filled.NotificationsActive
        "library" -> Icons.Filled.VideoLibrary
        "weekly" -> Icons.Filled.AutoAwesome
        "announcement" -> Icons.Filled.Campaign
        else -> Icons.Filled.Notifications
    }
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(if (n.unread) Sx.Scarlet.copy(alpha = 0.10f) else Sx.Card)
            .clickable(enabled = n.url.isNotBlank(), onClick = onClick).padding(12.dp),
        verticalAlignment = Alignment.Top,
    ) {
        if (n.image.isNotBlank()) AsyncImage(n.image, null, Modifier.size(40.dp, 56.dp).clip(RoundedCornerShape(8.dp)), contentScale = ContentScale.Crop)
        else Box(Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(Sx.High), contentAlignment = Alignment.Center) { Icon(icon, null, tint = Sx.Ink) }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(n.title, style = MaterialTheme.typography.titleSmall, color = Color.White)
            if (n.body.isNotBlank()) Text(n.body, style = MaterialTheme.typography.bodySmall, color = Sx.InkMuted, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text(ago(n.createdAt), style = MaterialTheme.typography.labelSmall, color = Sx.InkFaint)
        }
        if (n.unread) Box(Modifier.padding(top = 6.dp).size(8.dp).clip(CircleShape).background(Sx.Scarlet))
    }
}

// ── Coming up ────────────────────────────────────────────────────────────────

/** Home row: new and upcoming episodes for shows in My List / Continue Watching */
@Composable
fun UpcomingRow(onOpen: (String, Int) -> Unit, onPlay: (String, Int, Int?, Int?) -> Unit, onCalendar: () -> Unit) {
    val api = session().api
    val data = rememberLoad(Unit) { api.upcomingEpisodes() }.value ?: return
    val items = data.recent.map { it to true } + data.upcoming.take(12).map { it to false }
    if (items.isEmpty()) return
    Column(Modifier.padding(bottom = 26.dp)) {
        SectionHeader("New episodes for you", accent = Sx.Cyan, trailing = {
            Text("Calendar ›", style = MaterialTheme.typography.labelMedium, color = Sx.InkFaint, modifier = Modifier.clickable(onClick = onCalendar))
        })
        Spacer(Modifier.height(12.dp))
        LazyRow(contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            items(items, key = { (e, aired) -> "${if (aired) "r" else "u"}${e.showId}" }) { (e, aired) ->
                UpcomingCard(e, aired, Modifier.width(240.dp)) { if (aired) onPlay("tv", e.showId, e.season, e.episode) else onOpen("tv", e.showId) }
            }
        }
    }
}

@Composable
private fun UpcomingCard(e: UpEp, aired: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Column(modifier.clip(RoundedCornerShape(18.dp)).background(Sx.Card).clickable(onClick = onClick)) {
        Box(Modifier.fillMaxWidth().aspectRatio(16f / 9f).background(Sx.Void)) {
            val img = e.backdrop.ifBlank { e.poster }
            if (img.isNotBlank()) AsyncImage(img, null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
            Box(Modifier.align(Alignment.TopStart).padding(8.dp)) {
                TechPill(if (aired) "New" else dayLabel(e.airDate), if (aired) Sx.Cyan else Sx.Gold, Sx.Void.copy(alpha = 0.85f))
            }
        }
        Column(Modifier.padding(12.dp)) {
            Text(e.name, style = MaterialTheme.typography.titleSmall, color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text("S${e.season} · E${e.episode}${if (e.episodeName.isNotBlank()) " — ${e.episodeName}" else ""}",
                style = MaterialTheme.typography.bodySmall, color = Sx.InkFaint, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

// ── New & Hot ────────────────────────────────────────────────────────────────

private enum class HotTab(val label: String) {
    Soon("Coming Soon"), Everyone("Everyone's Watching"), Rising("Rising Fast"), Released("Just Released"),
    TopMovies("Top 10 Movies"), TopShows("Top 10 Shows"), Episodes("Episodes"),
}

@Composable
fun NewAndHotScreen(onBack: () -> Unit, onOpen: (String, Int) -> Unit, onPlay: (String, Int, Int?, Int?) -> Unit) {
    val s = session()
    val api = s.api
    val scope = rememberCoroutineScope()
    var tab by remember { mutableStateOf(HotTab.Soon) }
    val soon = rememberLoad(Unit, memo = "soon") { api.comingSoon() }
    val profile0 = s.activeProfile.collectAsState().value
    // Trend-tracker lists (re-ranked for the profile). They refresh themselves: every 10 minutes while this screen
    // is open, and when coming back to it after the server's 30-minute update.
    val hot = rememberLoad(profile0?.id) { api.newHot(profile0?.id) }
    LaunchedEffect(Unit) { while (true) { kotlinx.coroutines.delay(10 * 60 * 1000L); hot.retry() } }
    val owner = androidx.lifecycle.compose.LocalLifecycleOwner.current
    androidx.compose.runtime.DisposableEffect(owner) {
        val obs = androidx.lifecycle.LifecycleEventObserver { _, e ->
            if (e == androidx.lifecycle.Lifecycle.Event.ON_RESUME) {
                val at = hot.value?.updatedAt?.let { runCatching { java.time.Instant.parse(it).toEpochMilli() }.getOrNull() } ?: 0L
                if (System.currentTimeMillis() - at > 30 * 60 * 1000L) hot.retry()
            }
        }
        owner.lifecycle.addObserver(obs)
        onDispose { owner.lifecycle.removeObserver(obs) }
    }
    val upcoming = rememberLoad(Unit) { api.upcomingEpisodes() }
    val reminders = remember { mutableStateListOf<String>() }
    LaunchedEffect(Unit) { runCatching { api.reminders() }.getOrNull()?.forEach { reminders += "${it.type}:${it.tmdbId}" } }
    val profile by s.activeProfile.collectAsState()
    val hidden = profile?.hiddenTitles.orEmpty().toSet()

    val forYou = rememberLoad(profile?.id, memo = "upcomingForYou") { profile?.let { api.upcomingForYou(it.id).items } ?: emptyList() }
    fun toggleRemindKey(type: String, id: Int) {
        val key = "$type:$id"
        val on = key !in reminders
        if (on) reminders += key else reminders -= key
        scope.launch { if (runCatching { api.setReminder(type, id, on) }.isFailure) { if (on) reminders -= key else reminders += key } }
    }

    fun toggleRemind(it: SoonItem) {
        val key = "${it.mediaType}:${it.id}"
        val on = key !in reminders
        if (on) reminders += key else reminders -= key
        scope.launch {
            if (runCatching { api.setReminder(it.mediaType, it.id, on) }.isFailure) { if (on) reminders -= key else reminders += key }
        }
    }

    Column(Modifier.fillMaxSize().background(Sx.Surface)) {
        ScreenHeader("New & Hot", onBack) {
            hot.value?.takeIf { tab != HotTab.Soon && tab != HotTab.Episodes }?.let { h ->
                Text("Updated ${ago(h.updatedAt)}", style = MaterialTheme.typography.labelSmall, color = Sx.InkFaint)
                IconButton(onClick = hot.retry) { Icon(Icons.Filled.Refresh, "Refresh", tint = Sx.InkMuted) }
            }
        }
        LazyRow(contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            items(HotTab.entries) { t -> Chip(t.label, t == tab) { tab = t } }
        }
        Spacer(Modifier.height(8.dp))
        LazyColumn(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 40.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            when (tab) {
                HotTab.Soon -> if (profile != null) upcomingForYouItems(forYou.state, forYou.retry, reminders,
                    onRemind = { type, id -> toggleRemindKey(type, id) }, onOpen = { t, i -> s.track("detail", t, i, source = "upcoming"); onOpen(t, i) }, onPlay = onPlay)
                else when (val st = soon.state) {
                    is Load.Loading -> item { Loading() }
                    is Load.Err -> item { ErrorState(st.message, onRetry = soon.retry) }
                    is Load.Ok -> items(st.value.filter { "${it.mediaType}:${it.id}" !in hidden }, key = { "${it.mediaType}-${it.id}" }) { it ->
                        val key = "${it.mediaType}:${it.id}"
                        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Sx.Card)) {
                            Box(Modifier.fillMaxWidth().aspectRatio(16f / 9f).clickable { onOpen(it.mediaType, it.id) }) {
                                AsyncImage(tmdbImage(it.backdropPath ?: it.posterPath, "w780"), null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                                Box(Modifier.align(Alignment.TopStart).padding(10.dp)) { TechPill(dayLabel(it.date.orEmpty()), Sx.Gold, Sx.Void.copy(alpha = 0.85f)) }
                            }
                            Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                                Column(Modifier.weight(1f)) {
                                    Text(it.displayTitle, style = MaterialTheme.typography.titleSmall, color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    Text(it.overview.orEmpty(), style = MaterialTheme.typography.bodySmall, color = Sx.InkMuted, maxLines = 2, overflow = TextOverflow.Ellipsis)
                                }
                                Spacer(Modifier.width(10.dp))
                                GlassButton(if (key in reminders) "Reminded" else "Remind me",
                                    if (key in reminders) Icons.Filled.NotificationsActive else Icons.Filled.Notifications, active = key in reminders) { toggleRemind(it) }
                            }
                        }
                    }
                }
                HotTab.Everyone -> mediaList(hot.state.map { it.everyone }, hot.retry, hidden, onOpen)
                HotTab.Rising -> if (hot.value?.let { !it.hasMomentum && it.rising.isEmpty() } == true)
                    item { ErrorState("Rising Fast needs a few hours of chart history — it fills in by itself.") }
                    else mediaList(hot.state.map { it.rising }, hot.retry, hidden, onOpen)
                HotTab.Released -> mediaList(hot.state.map { it.justReleased }, hot.retry, hidden, onOpen, kind = "movie")
                HotTab.TopMovies -> mediaList(hot.state.map { it.top10Movies }, hot.retry, hidden, onOpen, ranked = true, kind = "movie")
                HotTab.TopShows -> mediaList(hot.state.map { it.top10Tv }, hot.retry, hidden, onOpen, ranked = true, kind = "tv")
                HotTab.Episodes -> when (val st = upcoming.state) {
                    is Load.Loading -> item { Loading() }
                    is Load.Err -> item { ErrorState(st.message, onRetry = upcoming.retry) }
                    is Load.Ok -> {
                        val u = st.value
                        if (u.recent.isEmpty() && u.upcoming.isEmpty()) item {
                            ErrorState(if (u.following == 0) "Add a show to My List or start watching one and its new episodes will appear here."
                            else "No new or upcoming episodes for the ${u.following} shows you follow.")
                        }
                        if (u.recent.isNotEmpty()) item { Text("NEW THIS WEEK", style = MaterialTheme.typography.labelSmall, color = Sx.InkFaint) }
                        items(u.recent, key = { "r${it.showId}" }) { e -> UpcomingCard(e, true) { onPlay("tv", e.showId, e.season, e.episode) } }
                        if (u.upcoming.isNotEmpty()) item { Text("COMING UP", style = MaterialTheme.typography.labelSmall, color = Sx.InkFaint) }
                        items(u.upcoming, key = { "u${it.showId}" }) { e -> UpcomingCard(e, false) { onOpen("tv", e.showId) } }
                    }
                }
            }
        }
    }
}

private fun <T, R> Load<T>.map(f: (T) -> R): Load<R> = when (this) {
    is Load.Loading -> Load.Loading
    is Load.Err -> this
    is Load.Ok -> Load.Ok(f(value))
}

private fun androidx.compose.foundation.lazy.LazyListScope.mediaList(
    state: Load<List<Media>>, retry: () -> Unit, hidden: Set<String>, onOpen: (String, Int) -> Unit,
    ranked: Boolean = false, kind: String? = null,
) {
    when (state) {
        is Load.Loading -> item { Loading() }
        is Load.Err -> item { ErrorState(state.message, onRetry = retry) }
        is Load.Ok -> {
            val list = state.value.filter { "${it.kind(kind)}:${it.id}" !in hidden }
            items(list.size, key = { "${list[it].mediaType}-${list[it].id}" }) { i ->
                val m = list[i]
                Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Sx.Card).clickable { onOpen(m.kind(kind), m.id) }.padding(10.dp),
                    verticalAlignment = Alignment.CenterVertically) {
                    if (ranked) Text("${i + 1}", style = MaterialTheme.typography.headlineMedium, color = Sx.Scarlet, modifier = Modifier.width(36.dp))
                    AsyncImage(tmdbImage(m.posterPath, "w185"), null, Modifier.width(64.dp).aspectRatio(2f / 3f).clip(RoundedCornerShape(10.dp)).background(Sx.Void), contentScale = ContentScale.Crop)
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(m.displayTitle, style = MaterialTheme.typography.titleSmall, color = Color.White, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        Text(listOfNotNull(m.year.ifBlank { null }, m.voteAverage.takeIf { it > 0 }?.let { "★ %.1f".format(it) }).joinToString(" • "),
                            style = MaterialTheme.typography.bodySmall, color = Sx.InkFaint)
                        m.reason?.takeIf { it.isNotBlank() }?.let { Text(it, style = MaterialTheme.typography.labelMedium, color = Sx.Gold, maxLines = 1, overflow = TextOverflow.Ellipsis) }
                        Text(m.overview.orEmpty(), style = MaterialTheme.typography.bodySmall, color = Sx.InkMuted, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
        }
    }
}

// ── Viewing activity + "Not for me" ──────────────────────────────────────────

@Composable
fun ActivityScreen(onBack: () -> Unit, onOpen: (String, Int) -> Unit) {
    val s = session()
    val scope = rememberCoroutineScope()
    val profile by s.activeProfile.collectAsState()
    val p = profile
    if (p == null) { Box(Modifier.fillMaxSize().background(Sx.Surface)) { ErrorState("Pick a profile first") }; return }
    val data = rememberLoad(p.id) { s.api.history(p.id) }
    var confirmClear by remember { mutableStateOf(false) }
    val removed = remember(p.id) { mutableStateListOf<Int>() }

    if (confirmClear) AlertDialog(
        onDismissRequest = { confirmClear = false }, containerColor = Sx.Card,
        title = { Text("Clear all viewing activity?", color = Color.White) },
        text = { Text("This also stops it shaping your recommendations.", color = Sx.InkMuted) },
        confirmButton = { TextButton({ scope.launch { runCatching { s.api.removeHistory(p.id, null) }; confirmClear = false; data.retry() } }) { Text("Clear", color = Sx.Scarlet) } },
        dismissButton = { TextButton({ confirmClear = false }) { Text("Cancel", color = Sx.Ink) } },
    )

    Column(Modifier.fillMaxSize().background(Sx.Surface)) {
        ScreenHeader("Viewing activity", onBack)
        when (val st = data.state) {
            is Load.Loading -> Loading()
            is Load.Err -> ErrorState(st.message, onRetry = data.retry)
            is Load.Ok -> {
                val history = st.value.history.filter { it.tmdbId !in removed }
                LazyColumn(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 40.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    item {
                        Text("What ${p.name} watched. Removing a title also stops it shaping recommendations.", style = MaterialTheme.typography.bodySmall, color = Sx.InkMuted)
                        Spacer(Modifier.height(6.dp))
                    }
                    if (history.isEmpty()) item { ErrorState("Nothing watched yet.") }
                    items(history, key = { "${it.type}-${it.tmdbId}" }) { h ->
                        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Sx.Card).clickable { onOpen(h.type, h.tmdbId) }.padding(start = 14.dp, top = 6.dp, bottom = 6.dp),
                            verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(h.title, style = MaterialTheme.typography.titleSmall, color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text(listOfNotNull(if (h.type == "tv") "Series" else "Movie", if (h.completed) "Finished" else "${h.progress.toInt()}%",
                                    h.watchedAt.take(10).takeIf { it.isNotBlank() }).joinToString(" • "), style = MaterialTheme.typography.bodySmall, color = Sx.InkFaint)
                            }
                            IconButton(onClick = {
                                removed += h.tmdbId
                                scope.launch { runCatching { s.api.removeHistory(p.id, h.tmdbId) } }
                            }) { Icon(Icons.Filled.Delete, "Remove", tint = Sx.InkFaint) }
                        }
                    }
                    if (history.isNotEmpty()) item { GlassButton("Clear all activity", Icons.Filled.Delete, Modifier.fillMaxWidth()) { confirmClear = true } }
                    val hidden = p.hiddenTitles
                    item {
                        Spacer(Modifier.height(14.dp))
                        Text("HIDDEN (“NOT FOR ME”)", style = MaterialTheme.typography.labelSmall, color = Sx.InkFaint)
                    }
                    if (hidden.isEmpty()) item { Text("Titles you mark “Not for me” on their page show up here.", style = MaterialTheme.typography.bodySmall, color = Sx.InkMuted) }
                    items(hidden, key = { it }) { key ->
                        val type = key.substringBefore(':'); val id = key.substringAfter(':').toIntOrNull() ?: return@items
                        val name = st.value.history.firstOrNull { it.tmdbId == id }?.title
                        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Sx.Card).padding(start = 14.dp, top = 6.dp, bottom = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text(name ?: "${if (type == "tv") "Series" else "Movie"} #$id", style = MaterialTheme.typography.titleSmall, color = Color.White, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                            TextButton({ s.setHidden(type, id, false) }) { Text("Undo", color = Sx.Soft) }
                        }
                    }
                }
            }
        }
    }
}

// ── Playback settings (per profile) ──────────────────────────────────────────

private val SUB_LANGS = listOf("" to "Off", "en" to "English", "es" to "Spanish", "fr" to "French", "de" to "German", "pt" to "Portuguese",
    "it" to "Italian", "ja" to "Japanese", "ko" to "Korean", "zh" to "Chinese", "ar" to "Arabic", "hi" to "Hindi")
private val QUALITY = listOf("auto" to "Auto", "saver" to "Save data", "high" to "Best")
private val MATURITY = listOf("7" to "7+", "13" to "13+", "16" to "16+", "all" to "All")

@Composable
fun PlaybackSettingsCard() {
    val s = session()
    val scope = rememberCoroutineScope()
    val profile by s.activeProfile.collectAsState()
    val p = profile ?: return
    if (p.isKids) return
    val prefs = p.prefs
    var error by remember { mutableStateOf<String?>(null) }
    var needPin by remember { mutableStateOf<ProfilePrefs?>(null) }

    fun save(next: ProfilePrefs, pin: String? = null) {
        error = null
        scope.launch {
            try { s.savePrefs(next, pin) }
            catch (e: Throwable) {
                // Loosening the maturity rating needs a parent PIN
                if (e.message?.contains("parent profile PIN") == true && pin == null) needPin = next else error = e.userMessage()
            }
        }
    }

    needPin?.let { next ->
        PinDialog("Parent PIN", "Enter a parent profile PIN to allow more mature titles", onSubmit = { pin ->
            try { s.savePrefs(next, pin); needPin = null; null } catch (e: Throwable) { e.userMessage() }
        }, onDismiss = { needPin = null })
    }

    GlassCard(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            Text("PLAYBACK & VIEWING FOR ${p.name.uppercase()}", style = MaterialTheme.typography.labelSmall, color = Sx.InkFaint)
            Spacer(Modifier.height(6.dp))
            error?.let { Text(it, color = Sx.Soft, style = MaterialTheme.typography.bodySmall) }
            SettingSwitch("Autoplay next episode", "Starts the next episode a few seconds after one ends", prefs.autoplayNext) { save(prefs.copy(autoplayNext = it)) }
            SettingSwitch("Autoplay previews", "Plays a muted trailer on title cards", prefs.autoplayPreviews) { save(prefs.copy(autoplayPreviews = it)) }
            Spacer(Modifier.height(8.dp))
            Text("Subtitles", style = MaterialTheme.typography.titleSmall, color = Color.White)
            Text("Turned on automatically when the video has this language", style = MaterialTheme.typography.bodySmall, color = Sx.InkFaint)
            Spacer(Modifier.height(6.dp))
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(SUB_LANGS) { (v, label) -> Chip(label, prefs.subtitleLang == v) { save(prefs.copy(subtitleLang = v)) } }
            }
            Spacer(Modifier.height(12.dp))
            Text("Data usage", style = MaterialTheme.typography.titleSmall, color = Color.White)
            Text("For Streamix and direct streams (embeds pick their own quality)", style = MaterialTheme.typography.bodySmall, color = Sx.InkFaint)
            Spacer(Modifier.height(6.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { QUALITY.forEach { (v, label) -> Chip(label, prefs.quality == v) { save(prefs.copy(quality = v)) } } }
            Spacer(Modifier.height(12.dp))
            Text("Maturity rating", style = MaterialTheme.typography.titleSmall, color = Color.White)
            Text("Titles rated above this ask for a parent PIN before playing", style = MaterialTheme.typography.bodySmall, color = Sx.InkFaint)
            Spacer(Modifier.height(6.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { MATURITY.forEach { (v, label) -> Chip(label, prefs.maturity == v) { save(prefs.copy(maturity = v)) } } }
        }
    }
}

@Composable
private fun SettingSwitch(title: String, hint: String, on: Boolean, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleSmall, color = Color.White)
            Text(hint, style = MaterialTheme.typography.bodySmall, color = Sx.InkFaint)
        }
        Switch(on, onChange, colors = SwitchDefaults.colors(checkedTrackColor = Sx.Scarlet, checkedThumbColor = Color.White))
    }
}

// ── Report a problem ─────────────────────────────────────────────────────────

private val REPORT_REASONS = listOf("not-playing" to "Won't play", "buffering" to "Keeps buffering", "wrong-video" to "Wrong movie/episode",
    "bad-quality" to "Poor quality", "audio" to "Audio problem", "subtitles" to "Subtitle problem", "other" to "Something else")

@Composable
fun ReportDialog(
    type: String, tmdbId: Int, season: Int?, episode: Int?, title: String, source: String, onDismiss: () -> Unit,
) {
    val api = session().api
    val scope = rememberCoroutineScope()
    var reason by remember { mutableStateOf("") }
    var note by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var done by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    AlertDialog(
        onDismissRequest = onDismiss, containerColor = Sx.Card,
        title = { Text(if (done) "Thanks — we'll look into it" else "Report a problem", color = Color.White) },
        text = {
            if (done) Text("Meanwhile, try another source below the player.", color = Sx.InkMuted)
            else Column {
                Text("$title${if (type == "tv") " · S${season}E$episode" else ""} · $source", style = MaterialTheme.typography.bodySmall, color = Sx.InkFaint, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Spacer(Modifier.height(10.dp))
                @OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
                androidx.compose.foundation.layout.FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    REPORT_REASONS.forEach { (v, label) -> Chip(label, reason == v) { reason = v } }
                }
                Spacer(Modifier.height(10.dp))
                androidx.compose.material3.OutlinedTextField(note, { if (it.length <= 500) note = it }, Modifier.fillMaxWidth(), placeholder = { Text("Anything else? (optional)", color = Sx.InkFaint) },
                    colors = androidx.compose.material3.OutlinedTextFieldDefaults.colors(focusedTextColor = Color.White, unfocusedTextColor = Color.White,
                        focusedBorderColor = Sx.Scarlet, unfocusedBorderColor = Color.White.copy(alpha = 0.1f), cursorColor = Sx.Scarlet), minLines = 2)
                error?.let { Spacer(Modifier.height(6.dp)); Text(it, color = Sx.Soft, style = MaterialTheme.typography.bodySmall) }
            }
        },
        confirmButton = {
            if (done) TextButton(onDismiss) { Text("Close", color = Sx.Soft) }
            else TextButton({
                busy = true; error = null
                scope.launch {
                    try { api.reportProblem(type, tmdbId, season, episode, title, source, reason, note); done = true }
                    catch (e: Throwable) { error = e.userMessage() }
                    busy = false
                }
            }, enabled = reason.isNotEmpty() && !busy) { Text(if (busy) "Sending…" else "Send report", color = if (reason.isNotEmpty()) Sx.Scarlet else Sx.InkFaint) }
        },
        dismissButton = { if (!done) TextButton(onDismiss) { Text("Cancel", color = Sx.Ink) } },
    )
}
