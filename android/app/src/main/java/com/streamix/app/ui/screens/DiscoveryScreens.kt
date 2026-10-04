package com.streamix.app.ui.screens

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
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
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.NotificationsActive
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Theaters
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshots.SnapshotStateList
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.streamix.app.data.FeedStory
import com.streamix.app.data.Media
import com.streamix.app.data.UpcomingItem
import com.streamix.app.data.WLItem
import com.streamix.app.data.tmdbImage
import com.streamix.app.ui.Load
import com.streamix.app.ui.components.Chip
import com.streamix.app.ui.components.ErrorState
import com.streamix.app.ui.components.GlassButton
import com.streamix.app.ui.components.Loading
import com.streamix.app.ui.components.PrimaryButton
import com.streamix.app.ui.components.TechPill
import com.streamix.app.ui.components.session
import com.streamix.app.ui.theme.Sx
import com.streamix.app.ui.userMessage
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

// ── Shared bits ──────────────────────────────────────────────────────────────

/** Badge text + colour for each kind of feed story / upcoming reason */
private fun kindBadge(kind: String): Pair<String, Color> = when (kind) {
    "new_episode", "episode" -> "New episode" to Sx.Cyan
    "premiere" -> "Premiere" to Sx.Gold
    "library" -> "On Streamix" to Sx.Gold
    "coming_soon" -> "Coming soon" to Sx.Gold
    "pick" -> "Top pick for you" to Sx.Soft
    "community" -> "Viewers here" to Sx.Cyan
    "fresh_hit" -> "New & loved" to Sx.Soft
    "trending" -> "Trending" to Sx.InkMuted
    "franchise" -> "Next in the series" to Sx.Gold
    "person" -> "From people you like" to Sx.Soft
    "hype" -> "Most anticipated" to Sx.Gold
    else -> "For you" to Sx.Soft
}

/** Reminders ("type:id") the account has set, with an optimistic toggle */
@Composable
fun rememberReminders(): Pair<SnapshotStateList<String>, (String, Int) -> Unit> {
    val api = session().api
    val scope = rememberCoroutineScope()
    val set = remember { mutableStateListOf<String>() }
    LaunchedEffect(Unit) { runCatching { api.reminders() }.getOrNull()?.forEach { set += "${it.type}:${it.tmdbId}" } }
    val toggle: (String, Int) -> Unit = { type, id ->
        val k = "$type:$id"
        val on = k !in set
        if (on) set += k else set -= k
        scope.launch { if (runCatching { api.setReminder(type, id, on) }.isFailure) { if (on) set -= k else set += k } }
    }
    return set to toggle
}

private fun openTrailer(ctx: android.content.Context, key: String) =
    ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://www.youtube.com/watch?v=$key")))

// ── For You: the news feed ───────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FeedScreen(onOpen: (String, Int) -> Unit, onPlay: (String, Int, Int?, Int?) -> Unit, onAsk: () -> Unit) {
    val s = session()
    val api = s.api
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val profile by s.activeProfile.collectAsState()
    val watchIds by s.watchlistIds.collectAsState()
    val (reminders, toggleRemind) = rememberReminders()
    val stories = remember(profile?.id) { mutableStateListOf<FeedStory>() }
    var page by remember(profile?.id) { mutableStateOf(0) }
    var hasMore by remember(profile?.id) { mutableStateOf(true) }
    var loading by remember { mutableStateOf(false) }
    var refreshing by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val list = rememberLazyListState()

    suspend fun load(fresh: Boolean = false) {
        val p = profile ?: return
        if (loading) return
        loading = true; error = null
        try {
            val next = if (fresh) 1 else page + 1
            val res = api.feed(p.id, next, fresh)
            if (fresh) stories.clear()
            val have = stories.map { it.kind + it.item.id }.toSet()
            stories += res.items.filter { (it.kind + it.item.id) !in have }
            page = next; hasMore = res.hasMore
        } catch (e: CancellationException) { throw e } catch (e: Throwable) { error = e.userMessage() }
        loading = false
    }

    LaunchedEffect(profile?.id) { if (stories.isEmpty()) load() }
    val nearEnd by remember { derivedStateOf { (list.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0) >= list.layoutInfo.totalItemsCount - 3 } }
    LaunchedEffect(nearEnd, page) { if (nearEnd && hasMore && page > 0) load() }

    PullToRefreshBox(
        isRefreshing = refreshing,
        onRefresh = { scope.launch { refreshing = true; load(fresh = true); refreshing = false } },
        modifier = Modifier.fillMaxSize().background(Sx.Surface),
    ) {
        LazyColumn(state = list, contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 110.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            item {
                Row(Modifier.statusBarsPadding().padding(top = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("For You", style = MaterialTheme.typography.headlineMedium, color = Color.White)
                        Text("New episodes, releases and what's worth your time", style = MaterialTheme.typography.bodySmall, color = Sx.InkFaint)
                    }
                    GlassButton("Ask", Icons.Filled.AutoAwesome, onClick = onAsk)
                }
            }
            items(stories, key = { it.kind + ":" + it.item.mediaType + ":" + it.item.id }, contentType = { "story" }) { st ->
                val type = st.item.kind()
                val k = "$type:${st.item.id}"
                FeedCard(
                    st, saved = st.item.id in watchIds, reminded = k in reminders,
                    onOpen = { s.track("detail", type, st.item.id, source = "feed"); onOpen(type, st.item.id) },
                    onPlay = { s.track("play", type, st.item.id, source = "feed"); onPlay(type, st.item.id, st.season, st.episode) },
                    onTrailer = { st.trailerKey?.let { s.track("trailer", type, st.item.id, source = "feed"); openTrailer(ctx, it) } },
                    onSave = { s.toggleWatchlist(WLItem(st.item.id, st.item.displayTitle, st.item.posterPath.orEmpty(), st.item.backdropPath.orEmpty(), st.item.voteAverage, st.item.year, type)) },
                    onRemind = { toggleRemind(type, st.item.id) },
                )
            }
            item {
                when {
                    loading -> Loading()
                    error != null -> ErrorState(error!!, onRetry = { scope.launch { load(fresh = stories.isEmpty()) } })
                    stories.isEmpty() -> ErrorState("Nothing new yet. Follow some shows or add titles to My List and your feed fills up.")
                    !hasMore -> Text("You're all caught up", style = MaterialTheme.typography.bodySmall, color = Sx.InkFaint, modifier = Modifier.fillMaxWidth().padding(16.dp))
                }
            }
        }
    }
}

@Composable
private fun FeedCard(
    st: FeedStory, saved: Boolean, reminded: Boolean,
    onOpen: () -> Unit, onPlay: () -> Unit, onTrailer: () -> Unit, onSave: () -> Unit, onRemind: () -> Unit,
) {
    val (badge, color) = kindBadge(st.kind)
    val upcoming = st.kind == "coming_soon" || st.kind == "premiere"
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(Sx.Card)) {
        Box(Modifier.fillMaxWidth().aspectRatio(16f / 9f).background(Sx.Void).clickable(onClick = onOpen)) {
            AsyncImage(tmdbImage(st.item.backdropPath ?: st.item.posterPath, "w780"), st.item.displayTitle, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
            Box(Modifier.fillMaxSize().background(Brush.verticalGradient(0.55f to Color.Transparent, 1f to Sx.Card)))
            Row(Modifier.align(Alignment.TopStart).padding(10.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                TechPill(badge, color, Sx.Void.copy(alpha = 0.85f))
                if (st.ai) TechPill("AI", Sx.Soft, Sx.Void.copy(alpha = 0.85f))
            }
            if (st.trailerKey != null) Box(
                Modifier.align(Alignment.Center).size(56.dp).clip(CircleShape).background(Sx.Void.copy(alpha = 0.7f)).clickable(onClick = onTrailer),
                contentAlignment = Alignment.Center,
            ) { Icon(Icons.Filled.Theaters, "Watch trailer", tint = Color.White) }
        }
        Column(Modifier.padding(start = 14.dp, end = 14.dp, bottom = 14.dp)) {
            Text(st.headline.ifBlank { st.item.displayTitle }, style = MaterialTheme.typography.titleMedium, color = Color.White, maxLines = 2, overflow = TextOverflow.Ellipsis)
            if (st.detail.isNotBlank()) Text(st.detail, style = MaterialTheme.typography.bodySmall, color = color, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Spacer(Modifier.height(6.dp))
            Text(st.item.overview.orEmpty(), style = MaterialTheme.typography.bodySmall, color = Sx.InkMuted, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Spacer(Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                if (upcoming) GlassButton(if (reminded) "Reminded" else "Remind me", if (reminded) Icons.Filled.NotificationsActive else Icons.Filled.Notifications,
                    Modifier.weight(1f), active = reminded, onClick = onRemind)
                else PrimaryButton(if (st.kind == "new_episode" && st.episode != null) "Play S${st.season}:E${st.episode}" else "Play", Modifier.weight(1f), icon = Icons.Filled.PlayArrow, onClick = onPlay)
                GlassButton(null, if (saved) Icons.Filled.Check else Icons.Filled.Add, active = saved, onClick = onSave)
                GlassButton("Details", null, onClick = onOpen)
            }
        }
    }
}

// ── Ask Streamix ─────────────────────────────────────────────────────────────

private val ASK_IDEAS = listOf(
    "Something funny and short for tonight", "An edge-of-my-seat thriller", "Feel-good movie for a rainy day",
    "Like Interstellar but less sad", "A Korean drama to binge", "Mind-bending sci-fi", "A classic from the 80s",
)

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun AskScreen(initial: String?, onBack: () -> Unit, onOpen: (String, Int) -> Unit) {
    val s = session()
    val scope = rememberCoroutineScope()
    val profile by s.activeProfile.collectAsState()
    var query by rememberSaveable { mutableStateOf(initial.orEmpty()) }
    var state by remember { mutableStateOf<Load<com.streamix.app.data.AskResult>?>(null) }

    fun ask(q: String) {
        val p = profile ?: return
        if (q.trim().length < 3) return
        query = q
        state = Load.Loading
        scope.launch {
            state = try { Load.Ok(s.api.ask(p.id, q.trim())) } catch (e: CancellationException) { throw e } catch (e: Throwable) { Load.Err(e.userMessage()) }
        }
    }
    LaunchedEffect(Unit) { if (!initial.isNullOrBlank() && state == null) ask(initial) }

    LazyColumn(Modifier.fillMaxSize().background(Sx.Surface), contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 40.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            Row(Modifier.statusBarsPadding().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back", tint = Color.White) }
                Icon(Icons.Filled.AutoAwesome, null, tint = Sx.Soft)
                Spacer(Modifier.width(8.dp))
                Text("Ask Streamix", style = MaterialTheme.typography.headlineSmall, color = Color.White)
            }
            Text("Say what you're in the mood for — a feeling, a length, a decade, a title you loved.", style = MaterialTheme.typography.bodySmall, color = Sx.InkMuted)
            Spacer(Modifier.height(10.dp))
            OutlinedTextField(
                query, { query = it.take(300) }, Modifier.fillMaxWidth(), singleLine = false, maxLines = 3,
                placeholder = { Text("e.g. a funny 90s movie, nothing scary", color = Sx.InkFaint) },
                trailingIcon = { IconButton(onClick = { ask(query) }, enabled = query.trim().length >= 3) { Icon(Icons.AutoMirrored.Filled.Send, "Ask", tint = if (query.trim().length >= 3) Sx.Scarlet else Sx.InkFaint) } },
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search), keyboardActions = KeyboardActions(onSearch = { ask(query) }),
                shape = RoundedCornerShape(16.dp),
                colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = Sx.Scarlet, unfocusedBorderColor = Color.White.copy(alpha = 0.08f),
                    focusedContainerColor = Sx.Low, unfocusedContainerColor = Sx.Low, cursorColor = Sx.Scarlet, focusedTextColor = Color.White, unfocusedTextColor = Color.White),
            )
            Spacer(Modifier.height(10.dp))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                ASK_IDEAS.forEach { idea -> Chip(idea, idea == query) { ask(idea) } }
            }
        }
        when (val st = state) {
            null -> Unit
            is Load.Loading -> item {
                Column(Modifier.fillMaxWidth().padding(top = 30.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Loading()
                    Text("Finding titles that fit…", style = MaterialTheme.typography.bodySmall, color = Sx.InkMuted)
                }
            }
            is Load.Err -> item { ErrorState(st.message, onRetry = { ask(query) }) }
            is Load.Ok -> {
                item {
                    Spacer(Modifier.height(8.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(st.value.title, style = MaterialTheme.typography.titleLarge, color = Color.White, modifier = Modifier.weight(1f))
                        TechPill(if (st.value.ai) "Picked with AI" else "Picked by Streamix", if (st.value.ai) Sx.Soft else Sx.InkMuted)
                    }
                }
                if (st.value.items.isEmpty()) item { ErrorState("Nothing fits that yet — try saying it another way.") }
                items(st.value.items, key = { "${it.kind()}-${it.id}" }) { m -> AskRow(m) { s.track("detail", m.kind(), m.id, source = "ask"); onOpen(m.kind(), m.id) } }
            }
        }
    }
}

@Composable
private fun AskRow(m: Media, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Sx.Card).clickable(onClick = onClick).padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
        AsyncImage(tmdbImage(m.posterPath, "w185"), m.displayTitle, Modifier.width(72.dp).aspectRatio(2f / 3f).clip(RoundedCornerShape(12.dp)).background(Sx.Void), contentScale = ContentScale.Crop)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(m.displayTitle, style = MaterialTheme.typography.titleSmall, color = Color.White, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text(listOfNotNull(m.year.ifBlank { null }, if (m.kind() == "tv") "Series" else "Movie", m.voteAverage.takeIf { it > 0 }?.let { "★ " + com.streamix.app.ui.components.rating(it) }).joinToString(" • "),
                style = MaterialTheme.typography.bodySmall, color = Sx.InkFaint)
            m.reason?.takeIf { it.isNotBlank() }?.let {
                Spacer(Modifier.height(4.dp))
                Text(it, style = MaterialTheme.typography.bodySmall, color = Sx.Soft, maxLines = 3, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

// ── Coming up for you (New & Hot → Coming Soon) ─────────────────────────────

fun LazyListScope.upcomingForYouItems(
    state: Load<List<UpcomingItem>>, retry: () -> Unit, reminders: List<String>,
    onRemind: (String, Int) -> Unit, onOpen: (String, Int) -> Unit, onPlay: (String, Int, Int?, Int?) -> Unit,
) {
    when (state) {
        is Load.Loading -> item { Loading() }
        is Load.Err -> item { ErrorState(state.message, onRetry = retry) }
        is Load.Ok -> {
            if (state.value.isEmpty()) item { ErrorState("Nothing on the calendar for you yet.") }
            item { Text("Ranked for you — sequels, people you like, shows you follow, and what fits your taste.", style = MaterialTheme.typography.bodySmall, color = Sx.InkFaint) }
            items(state.value, key = { "up-${it.mediaType}-${it.id}" }) { u ->
                val k = "${u.mediaType}:${u.id}"
                val (badge, color) = kindBadge(u.why)
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Sx.Card)) {
                    Box(Modifier.fillMaxWidth().aspectRatio(16f / 9f).background(Sx.Void).clickable { onOpen(u.mediaType, u.id) }) {
                        AsyncImage(tmdbImage(u.backdropPath ?: u.posterPath, "w780"), null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                        Row(Modifier.align(Alignment.TopStart).padding(10.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            TechPill(u.date?.let { dayLabel(it) } ?: "Date TBA", Sx.Gold, Sx.Void.copy(alpha = 0.85f))
                            if (u.why != "taste") TechPill(badge, color, Sx.Void.copy(alpha = 0.85f))
                        }
                    }
                    Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(u.displayTitle, style = MaterialTheme.typography.titleSmall, color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            u.reason?.takeIf { it.isNotBlank() }?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = Sx.Soft, maxLines = 2, overflow = TextOverflow.Ellipsis) }
                        }
                        Spacer(Modifier.width(10.dp))
                        if (u.why == "episode" && (u.daysUntil ?: 1) <= 0) GlassButton("Play", Icons.Filled.PlayArrow) { onPlay("tv", u.id, u.season, u.episode) }
                        else GlassButton(null, if (k in reminders) Icons.Filled.NotificationsActive else Icons.Filled.Notifications,
                            active = k in reminders) { onRemind(u.mediaType, u.id) }
                    }
                }
            }
        }
    }
}

/** Small refresh glyph used by screens that let you rebuild their list */
@Composable
fun RefreshButton(onClick: () -> Unit) = IconButton(onClick = onClick) { Icon(Icons.Filled.Refresh, "Refresh", tint = Sx.InkMuted) }
