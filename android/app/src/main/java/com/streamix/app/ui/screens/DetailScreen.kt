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
import androidx.compose.foundation.layout.offset
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
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Movie
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.setValue
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.material3.TextButton
import kotlinx.coroutines.launch
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.streamix.app.data.Details
import com.streamix.app.data.EpProgress
import com.streamix.app.data.WLItem
import com.streamix.app.data.tmdbImage
import com.streamix.app.ui.Load
import com.streamix.app.ui.components.BottomFade
import com.streamix.app.ui.components.Chip
import com.streamix.app.ui.components.ErrorState
import com.streamix.app.ui.components.GlassButton
import com.streamix.app.ui.components.GlassCard
import com.streamix.app.ui.components.Loading
import com.streamix.app.ui.components.MediaRail
import com.streamix.app.ui.components.PrimaryButton
import com.streamix.app.ui.components.RatingPill
import com.streamix.app.ui.components.TechPill
import com.streamix.app.ui.components.session
import com.streamix.app.ui.rememberLoad
import com.streamix.app.ui.theme.Sx

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun DetailScreen(
    type: String, id: Int,
    onBack: () -> Unit,
    onOpen: (String, Int) -> Unit,
    onPlay: (String, Int, Int?, Int?) -> Unit,
) {
    val s = session()
    val ctx = LocalContext.current
    // Opening a title is a light "interested" signal for the taste engine
    LaunchedEffect(type, id) { s.track("detail", type, id) }
    val details = rememberLoad(type, id, memo = "details") { s.api.details(type, id) }
    val similar = rememberLoad(type, id, memo = "similar") { s.api.similar(type, id).results }
    val watchlist by s.watchlist.collectAsState()
    val cw by s.continueWatching.collectAsState()
    val user by s.user.collectAsState()
    val resume = cw.firstOrNull { it.movieId == id }
    val profile by s.activeProfile.collectAsState()
    val scope = rememberCoroutineScope()
    // Per-episode watched state for the current profile
    val watched = remember(id, profile?.id) { mutableStateMapOf<Pair<Int, Int>, EpProgress>() }
    LaunchedEffect(id, profile?.id) {
        val p = profile ?: return@LaunchedEffect
        if (type != "tv") return@LaunchedEffect
        runCatching { s.api.episodeProgress(p.id, id) }.getOrNull()?.forEach { watched[it.season to it.episode] = it }
    }

    when (val st = details.state) {
        is Load.Loading -> Box(Modifier.fillMaxSize().background(Sx.Surface)) { Loading(Modifier.align(Alignment.Center)) }
        is Load.Err -> Box(Modifier.fillMaxSize().background(Sx.Surface).statusBarsPadding()) {
            ErrorState(st.message, Modifier.align(Alignment.Center), onRetry = details.retry)
            IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back", tint = Color.White) }
        }
        is Load.Ok -> {
            val d = st.value
            val seasons = d.seasons.filter { it.seasonNumber > 0 }
            var season by remember(d.id) { mutableIntStateOf(resume?.season ?: seasons.firstOrNull()?.seasonNumber ?: 1) }
            val episodes = rememberLoad(d.id, season, memo = "season") { if (type == "tv") s.api.season(id, season).episodes else emptyList() }
            var showMore by remember { mutableStateOf(false) }
            val saved = watchlist.any { it.movieId == id }

            LazyColumn(Modifier.fillMaxSize().background(Sx.Surface), contentPadding = PaddingValues(bottom = 110.dp)) {
                item {
                    Box(Modifier.fillMaxWidth().aspectRatio(16f / 11f)) {
                        AsyncImage(tmdbImage(d.backdropPath, "w780"), null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                        BottomFade(from = 0.35f)
                        IconButton(onClick = onBack, modifier = Modifier.statusBarsPadding().padding(8.dp).clip(CircleShape).background(Sx.Void.copy(alpha = 0.6f))) {
                            Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back", tint = Color.White)
                        }
                        d.trailer?.let { t ->
                            Box(Modifier.align(Alignment.Center).size(60.dp).clip(CircleShape).background(Sx.Highest.copy(alpha = 0.8f))
                                .clickable { s.track("trailer", type, id); ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://www.youtube.com/watch?v=${t.key}"))) },
                                contentAlignment = Alignment.Center) {
                                Icon(Icons.Filled.PlayArrow, "Play trailer", Modifier.size(34.dp), tint = Sx.Scarlet)
                            }
                        }
                    }
                }
                item {
                    Row(Modifier.padding(horizontal = 16.dp).offset(y = (-48).dp), verticalAlignment = Alignment.Bottom) {
                        AsyncImage(tmdbImage(d.posterPath), d.displayTitle, Modifier.width(108.dp).aspectRatio(2f / 3f).clip(RoundedCornerShape(16.dp)).background(Sx.Card), contentScale = ContentScale.Crop)
                        Spacer(Modifier.width(14.dp))
                        Column {
                            val meta = listOfNotNull(d.year.ifBlank { null },
                                d.runtime?.takeIf { it > 0 }?.let { "${it / 60}h ${it % 60}m" },
                                d.numberOfSeasons?.let { "$it season${if (it == 1) "" else "s"}" })
                            Text(meta.joinToString(" • "), style = MaterialTheme.typography.bodySmall, color = Sx.InkMuted)
                            Text(d.displayTitle, style = MaterialTheme.typography.headlineMedium, color = Color.White, maxLines = 3, overflow = TextOverflow.Ellipsis)
                            Spacer(Modifier.height(6.dp))
                            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                RatingPill(d.voteAverage)
                                TechPill(if (type == "tv") "Series" else "Movie")
                                if (d.isAnime) TechPill("Anime", Sx.Soft)
                            }
                        }
                    }
                }
                item {
                    Column(Modifier.padding(horizontal = 16.dp).offset(y = (-32).dp)) {
                        if (d.genres.isNotEmpty()) {
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                d.genres.forEach { TechPill(it.name, Sx.Ink, Sx.High) }
                            }
                            Spacer(Modifier.height(14.dp))
                        }
                        val label = when {
                            resume != null && type == "tv" && resume.season != null -> "Resume S${resume.season} E${resume.episode}"
                            resume != null && resume.progress in 1.0..97.0 -> "Resume · ${resume.progress.toInt()}%"
                            type == "tv" -> "Watch S1 E1"
                            else -> "Watch Movie"
                        }
                        PrimaryButton(label, Modifier.fillMaxWidth(), icon = Icons.Filled.PlayArrow) {
                            if (type == "tv") onPlay("tv", id, resume?.season ?: seasons.firstOrNull()?.seasonNumber ?: 1, resume?.episode ?: 1)
                            else onPlay("movie", id, null, null)
                        }
                        Spacer(Modifier.height(10.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            if (user != null) GlassButton("My List", if (saved) Icons.Filled.Check else Icons.Filled.Add, Modifier.weight(1f), active = saved) {
                                s.toggleWatchlist(WLItem(id, d.displayTitle, d.posterPath.orEmpty(), d.backdropPath.orEmpty(), d.voteAverage, d.year, type))
                            }
                            d.trailer?.let { t ->
                                GlassButton("Trailer", Icons.Filled.Movie, Modifier.weight(1f)) {
                                    s.track("trailer", type, id)
                                    ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://www.youtube.com/watch?v=${t.key}")))
                                }
                            }
                            if (profile != null && profile?.isKids != true) GlassButton(null, if (profile?.hiddenTitles?.contains("$type:$id") == true) Icons.Filled.Visibility else Icons.Filled.VisibilityOff,
                                active = profile?.hiddenTitles?.contains("$type:$id") == true) {
                                s.setHidden(type, id, profile?.hiddenTitles?.contains("$type:$id") != true)
                            }
                            GlassButton(null, Icons.Filled.Share) {
                                val text = "${d.displayTitle} — https://www.themoviedb.org/$type/$id"
                                ctx.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text), "Share"))
                            }
                        }
                        Spacer(Modifier.height(18.dp))
                        GlassCard(Modifier.fillMaxWidth()) {
                            Column(Modifier.padding(16.dp)) {
                                Text("STORYLINE", style = MaterialTheme.typography.labelSmall, color = Sx.InkFaint)
                                Spacer(Modifier.height(8.dp))
                                d.tagline?.takeIf { it.isNotBlank() }?.let { Text("“$it”", color = Sx.Soft, style = MaterialTheme.typography.bodySmall); Spacer(Modifier.height(6.dp)) }
                                Text(d.overview.orEmpty().ifBlank { "No overview available." }, style = MaterialTheme.typography.bodyMedium, color = Sx.Ink,
                                    maxLines = if (showMore) Int.MAX_VALUE else 4, overflow = TextOverflow.Ellipsis,
                                    modifier = Modifier.clickable { showMore = !showMore })
                            }
                        }
                    }
                }
                if (type == "tv" && seasons.isNotEmpty()) {
                    item {
                        Column(Modifier.padding(bottom = 8.dp)) {
                            Text("Episodes", style = MaterialTheme.typography.titleLarge, color = Color.White, modifier = Modifier.padding(horizontal = 16.dp))
                            Spacer(Modifier.height(10.dp))
                            LazyRow(contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                items(seasons) { sn -> Chip(sn.name ?: "Season ${sn.seasonNumber}", sn.seasonNumber == season) { season = sn.seasonNumber } }
                            }
                        }
                    }
                    when (val es = episodes.state) {
                        is Load.Loading -> item { Loading() }
                        is Load.Err -> item { ErrorState(es.message, onRetry = episodes.retry) }
                        is Load.Ok -> {
                        item {
                            val allDone = es.value.isNotEmpty() && es.value.all { watched[season to it.episodeNumber]?.completed == true }
                            if (profile != null && es.value.isNotEmpty()) TextButton(
                                onClick = {
                                    val p = profile ?: return@TextButton
                                    val nums = es.value.map { it.episodeNumber }
                                    nums.forEach { n -> watched[season to n] = EpProgress(season, n, if (allDone) 0.0 else 100.0, !allDone) }
                                    scope.launch { runCatching { s.api.markEpisodes(p.id, id, season, nums, !allDone) } }
                                },
                                modifier = Modifier.padding(horizontal = 8.dp),
                            ) { Text(if (allDone) "Mark season as unwatched" else "Mark season as watched", color = Sx.Soft) }
                        }
                        items(es.value, key = { it.id }) { ep ->
                            val prog = watched[season to ep.episodeNumber]
                            val current = resume?.season == season && resume.episode == ep.episodeNumber
                            Row(
                                Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 5.dp).clip(RoundedCornerShape(16.dp))
                                    .background(if (current) Sx.Scarlet.copy(alpha = 0.12f) else Sx.Card)
                                    .clickable { onPlay("tv", id, season, ep.episodeNumber) }.padding(8.dp),
                            ) {
                                Box(Modifier.width(130.dp).aspectRatio(16f / 9f).clip(RoundedCornerShape(12.dp)).background(Sx.Void)) {
                                    AsyncImage(tmdbImage(ep.stillPath, "w300"), null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                                    Icon(Icons.Filled.PlayArrow, null, Modifier.align(Alignment.Center), tint = Color.White)
                                    if (prog?.completed == true) Box(Modifier.align(Alignment.TopEnd).padding(4.dp).size(20.dp).clip(CircleShape).background(Sx.Cyan), contentAlignment = Alignment.Center) {
                                        Icon(Icons.Filled.Check, "Watched", Modifier.size(14.dp), tint = Sx.Void)
                                    } else if (prog != null && prog.progress > 0) Box(Modifier.align(Alignment.BottomStart).fillMaxWidth().height(3.dp).background(Sx.Highest)) {
                                        Box(Modifier.fillMaxWidth((prog.progress / 100).toFloat().coerceIn(0.02f, 1f)).height(3.dp).background(Sx.Scarlet))
                                    }
                                }
                                Spacer(Modifier.width(12.dp))
                                Column(Modifier.weight(1f)) {
                                    Text("${ep.episodeNumber}. ${ep.name}", style = MaterialTheme.typography.titleSmall, color = Color.White, maxLines = 2, overflow = TextOverflow.Ellipsis)
                                    Text(listOfNotNull(ep.runtime?.let { "${it}m" }, ep.airDate).joinToString(" • "), style = MaterialTheme.typography.bodySmall, color = Sx.InkFaint)
                                    Text(ep.overview.orEmpty(), style = MaterialTheme.typography.bodySmall, color = Sx.InkMuted, maxLines = 2, overflow = TextOverflow.Ellipsis)
                                }
                            }
                        }
                        }
                    }
                }
                item { CastRow(d) }
                item { MediaRail("More Like This", similar.value.orEmpty(), { onOpen(type, it.id) }, kindHint = type) }
            }
        }
    }
}

@Composable
private fun CastRow(d: Details) {
    val cast = d.credits?.cast.orEmpty().take(20)
    if (cast.isEmpty()) return
    Column(Modifier.padding(top = 18.dp, bottom = 26.dp)) {
        Text("Cast", style = MaterialTheme.typography.titleLarge, color = Color.White, modifier = Modifier.padding(horizontal = 16.dp))
        Spacer(Modifier.height(12.dp))
        LazyRow(contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            items(cast, key = { it.id }) { c ->
                Column(Modifier.width(84.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Box(Modifier.size(80.dp).clip(CircleShape).background(Sx.Card), contentAlignment = Alignment.Center) {
                        if (c.profilePath != null) AsyncImage(tmdbImage(c.profilePath, "w185"), c.name, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                        else Icon(Icons.Filled.Person, null, tint = Sx.InkFaint)
                    }
                    Spacer(Modifier.height(6.dp))
                    Text(c.name, style = MaterialTheme.typography.labelMedium, color = Sx.Ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(c.character.orEmpty(), style = MaterialTheme.typography.bodySmall, color = Sx.InkFaint, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
        }
    }
}
