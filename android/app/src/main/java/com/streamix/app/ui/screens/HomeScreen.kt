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
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.streamix.app.data.CWItem
import com.streamix.app.data.Media
import com.streamix.app.data.Paged
import com.streamix.app.data.WLItem
import com.streamix.app.data.tmdbImage
import com.streamix.app.ui.Load
import com.streamix.app.ui.components.Chip
import com.streamix.app.ui.components.ErrorState
import com.streamix.app.ui.components.GlassButton
import com.streamix.app.ui.components.MediaRail
import com.streamix.app.ui.components.PrimaryButton
import com.streamix.app.ui.components.RailSkeleton
import com.streamix.app.ui.components.RatingPill
import com.streamix.app.ui.components.SectionHeader
import com.streamix.app.ui.components.TechPill
import com.streamix.app.ui.components.session
import com.streamix.app.ui.rememberLoad
import com.streamix.app.ui.theme.Sx
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

val MOVIE_GENRES = listOf(28 to "Action", 878 to "Sci-Fi", 53 to "Thriller", 35 to "Comedy", 27 to "Horror",
    16 to "Animation", 18 to "Drama", 10749 to "Romance", 99 to "Documentary", 10751 to "Family", 14 to "Fantasy", 80 to "Crime")

private data class HomeData(val trending: Paged, val topRated: Paged, val upcoming: Paged, val nowPlaying: Paged, val popular: Paged, val tv: Paged)

@Composable
fun HomeScreen(
    onOpen: (type: String, id: Int) -> Unit,
    onPlay: (type: String, id: Int, season: Int?, episode: Int?) -> Unit,
    onBrowse: (kind: String, genre: Int?) -> Unit,
    onInbox: () -> Unit,
    onNewHot: () -> Unit,
    onAsk: () -> Unit,
) {
    val s = session()
    val api = s.api
    val unread = rememberUnread(Unit)
    val ctx = androidx.compose.ui.platform.LocalContext.current
    val shuffleScope = androidx.compose.runtime.rememberCoroutineScope()
    var shuffling by androidx.compose.runtime.remember { androidx.compose.runtime.mutableStateOf(false) }
    val cw by s.continueWatching.collectAsState()
    val profile by s.activeProfile.collectAsState()

    val home = rememberLoad(Unit, memo = "home") {
        coroutineScope {
            val t = async { api.list("/movies/trending") }
            val r = async { api.list("/movies/top-rated") }
            val u = async { api.list("/movies/upcoming") }
            val n = async { api.list("/movies/now-playing") }
            val p = async { api.list("/movies/popular") }
            val tv = async { api.list("/movies/tv/trending") }
            HomeData(t.await(), r.await(), u.await(), n.await(), p.await(), tv.await())
        }
    }
    // Hero: what's hot right now (popularity + momentum + this server), re-ranked for the profile
    val hotHero = rememberLoad(profile?.id, memo = "hotHero") { api.newHot(profile?.id).everyone.filter { it.backdropPath != null }.take(6) }
    val recs = rememberLoad(profile?.id, memo = "recs") { profile?.let { api.recommendations(it.id).sections } ?: emptyList() }

    LazyColumn(Modifier.fillMaxSize().background(Sx.Surface), contentPadding = PaddingValues(bottom = 110.dp)) {
        item {
            when (val st = home.state) {
                is Load.Loading -> Box(Modifier.fillMaxWidth().height(520.dp).background(Sx.Card))
                is Load.Err -> Column(Modifier.statusBarsPadding().padding(top = 80.dp)) { ErrorState(st.message, onRetry = home.retry) }
                is Load.Ok -> Hero(hotHero.value?.takeIf { it.isNotEmpty() } ?: st.value.trending.results.filter { it.backdropPath != null }.take(6), onOpen, onPlay, unread, onInbox)
            }
        }
        item {
            LazyRow(contentPadding = PaddingValues(16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                item { Chip("All", true) {} }
                item {
                    // One smart pick to start right now; pressing again offers something else
                    Chip(if (shuffling) "Picking…" else "🎲 Play something", false) {
                        if (shuffling) return@Chip
                        shuffling = true
                        shuffleScope.launch {
                            try {
                                s.playSomething()?.let { p ->
                                    android.widget.Toast.makeText(ctx, "${p.title ?: ""} — ${p.reason}", android.widget.Toast.LENGTH_LONG).show()
                                    onPlay(p.type, p.id, p.season, p.episode)
                                }
                            } catch (e: kotlinx.coroutines.CancellationException) { throw e } catch (e: Throwable) {
                                android.widget.Toast.makeText(ctx, "Couldn't pick something right now — try again", android.widget.Toast.LENGTH_SHORT).show()
                            }
                            shuffling = false
                        }
                    }
                }
                item { Chip("✨ Ask Streamix", false) { onAsk() } }
                item { Chip("New & Hot", false) { onNewHot() } }
                item { Chip("Series", false) { onBrowse("tv", null) } }
                item { Chip("Anime", false) { onBrowse("anime", null) } }
                items(MOVIE_GENRES) { (id, name) -> Chip(name, false) { onBrowse("movie", id) } }
            }
        }
        item { ContinueRow(cw, onPlay, onRemove = { s.removeProgress(it) }) }
        item { UpcomingRow(onOpen, onPlay, onCalendar = onNewHot) }
        // One list item per row, so rows are only built as they scroll into view
        items(recs.value.orEmpty(), key = { "rec-" + it.title }, contentType = { "rail" }) { sec ->
            // Opening a title from a row teaches the server which rows this profile actually uses
            MediaRail(sec.title, sec.items, { s.track("detail", it.kind(), it.id, row = sec.kind, source = "home"); onOpen(it.kind(), it.id) },
                accent = Sx.Cyan, showReasons = true)
        }
        val data = home.value
        if (data == null) { item { if (home.state is Load.Loading) { RailSkeleton(); RailSkeleton() } } }
        else {
            item { MediaRail("Top 10 Trending Today", data.trending.results.take(10), { onOpen("movie", it.id) }, ranked = true, kindHint = "movie") }
            item { MediaRail("Trending Series", data.tv.results, { onOpen("tv", it.id) }, accent = Sx.Cyan, kindHint = "tv") }
            item { MediaRail("Now Playing", data.nowPlaying.results, { onOpen("movie", it.id) }, kindHint = "movie") }
            item { MediaRail("Top Rated", data.topRated.results, { onOpen("movie", it.id) }, accent = Sx.Gold, kindHint = "movie") }
            item { MediaRail("Coming Soon", data.upcoming.results, { onOpen("movie", it.id) }, accent = Sx.Cyan, kindHint = "movie") }
            item { MediaRail("Popular on Streamix", data.popular.results, { onOpen("movie", it.id) }, accent = Sx.Gold, kindHint = "movie") }
        }
    }
}

@Composable
private fun Hero(items: List<Media>, onOpen: (String, Int) -> Unit, onPlay: (String, Int, Int?, Int?) -> Unit, unread: Int, onInbox: () -> Unit) {
    if (items.isEmpty()) return
    val s = session()
    val watchlist by s.watchlist.collectAsState()
    val user by s.user.collectAsState()
    val pager = rememberPagerState { items.size }

    LaunchedEffect(pager) {
        while (true) {
            delay(7000)
            pager.animateScrollToPage((pager.currentPage + 1) % items.size)
        }
    }

    Box(Modifier.fillMaxWidth().height(540.dp)) {
        HorizontalPager(pager, Modifier.fillMaxSize()) { page ->
            val m = items[page]
            Box(Modifier.fillMaxSize().clickable { onOpen(m.kind(), m.id) }) {
                AsyncImage(tmdbImage(m.backdropPath, "w780"), null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                Box(Modifier.fillMaxSize().background(Brush.verticalGradient(0f to Sx.Void.copy(alpha = 0.6f), 0.3f to Color.Transparent, 0.62f to Sx.Surface.copy(alpha = 0.55f), 1f to Sx.Surface)))
            }
        }
        val m = items[pager.currentPage]
        val saved = watchlist.any { it.movieId == m.id }
        Row(Modifier.statusBarsPadding().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Wordmark(20)
            Spacer(Modifier.weight(1f))
            TechPill(items[pager.currentPage].reason ?: "Trending #${pager.currentPage + 1}", Sx.Ink, Sx.Void.copy(alpha = 0.7f))
            if (user != null) { Spacer(Modifier.width(8.dp)); BellButton(unread, onInbox) }
        }
        Column(Modifier.align(Alignment.BottomStart).padding(16.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                RatingPill(m.voteAverage)
                if (m.year.isNotBlank()) TechPill(m.year)
                m.genreIds.take(2).mapNotNull { g -> MOVIE_GENRES.firstOrNull { it.first == g }?.second }.forEach { TechPill(it, Sx.InkMuted) }
                TechPill("HD", Sx.Cyan)
            }
            Spacer(Modifier.height(10.dp))
            Text(m.displayTitle, style = MaterialTheme.typography.displaySmall, color = Color.White, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Spacer(Modifier.height(6.dp))
            Text(m.overview.orEmpty(), style = MaterialTheme.typography.bodyMedium, color = Sx.InkMuted, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Spacer(Modifier.height(14.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                PrimaryButton("Watch Now", Modifier.weight(1f), icon = Icons.Filled.PlayArrow) { onPlay(m.kind(), m.id, if (m.kind() == "tv") 1 else null, if (m.kind() == "tv") 1 else null) }
                GlassButton(null, Icons.Filled.Info) { onOpen(m.kind(), m.id) }
                if (user != null) GlassButton(null, if (saved) Icons.Filled.Check else Icons.Filled.Add, active = saved) {
                    s.toggleWatchlist(WLItem(m.id, m.displayTitle, m.posterPath.orEmpty(), m.backdropPath.orEmpty(), m.voteAverage, m.year, m.kind()))
                }
            }
            Spacer(Modifier.height(14.dp))
            Row(Modifier.align(Alignment.CenterHorizontally), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                repeat(items.size) { i ->
                    Box(Modifier.size(if (i == pager.currentPage) 22.dp else 6.dp, 6.dp).clip(CircleShape)
                        .background(if (i == pager.currentPage) Sx.Scarlet else Color.White.copy(alpha = 0.3f)))
                }
            }
        }
    }
}

@Composable
fun ContinueRow(items: List<CWItem>, onPlay: (String, Int, Int?, Int?) -> Unit, onRemove: (Int) -> Unit) {
    val list = items.filter { it.progress < 98 }.take(12)
    if (list.isEmpty()) return
    Column(Modifier.padding(bottom = 26.dp)) {
        SectionHeader("Continue Watching", trailing = { TechPill("${list.size} in progress", Sx.InkMuted) })
        Spacer(Modifier.height(12.dp))
        LazyRow(contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            items(list, key = { it.movieId }) { item ->
                Column(Modifier.width(250.dp).clip(RoundedCornerShape(20.dp)).background(Sx.Card)
                    .clickable { onPlay(item.type, item.movieId, item.season, item.episode) }) {
                    Box(Modifier.fillMaxWidth().aspectRatio(16f / 9f).background(Sx.Void)) {
                        AsyncImage(tmdbImage(item.backdrop.ifBlank { item.poster }, "w500"), null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                        Box(Modifier.align(Alignment.Center).size(44.dp).clip(CircleShape).background(Sx.Void.copy(alpha = 0.8f)), contentAlignment = Alignment.Center) {
                            Icon(Icons.Filled.PlayArrow, "Resume", tint = Color.White)
                        }
                        val total = item.duration ?: item.durationMins?.times(60)
                        if (total != null && total > 0) {
                            val left = ((total - item.timestamp) / 60).toInt()
                            if (left > 0) Box(Modifier.align(Alignment.BottomEnd).padding(8.dp)) { TechPill("${left}m left", Sx.Ink, Sx.Void.copy(alpha = 0.85f)) }
                        }
                    }
                    Box(Modifier.fillMaxWidth().height(3.dp).background(Sx.Highest)) {
                        Box(Modifier.fillMaxWidth((item.progress / 100).toFloat().coerceIn(0.02f, 1f)).height(3.dp).background(Sx.Scarlet))
                    }
                    Row(Modifier.padding(start = 12.dp, top = 8.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(item.title, style = MaterialTheme.typography.titleSmall, color = Sx.Ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(
                                if (item.type == "tv") "S${item.season ?: 1} : E${item.episode ?: 1}${item.episodeName?.let { " • $it" } ?: ""}"
                                else "Movie • ${item.progress.toInt()}% watched",
                                style = MaterialTheme.typography.bodySmall, color = Sx.InkFaint, maxLines = 1, overflow = TextOverflow.Ellipsis,
                            )
                        }
                        IconButton(onClick = { onRemove(item.movieId) }) { Icon(Icons.Filled.Close, "Remove", tint = Sx.InkFaint, modifier = Modifier.size(18.dp)) }
                    }
                }
            }
        }
    }
}
