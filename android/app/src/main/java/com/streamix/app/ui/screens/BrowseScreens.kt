package com.streamix.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Animation
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.LiveTv
import androidx.compose.material.icons.filled.Movie
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.material.icons.filled.Casino
import androidx.compose.material.icons.filled.FilterList
import kotlinx.coroutines.launch
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import com.streamix.app.data.Media
import com.streamix.app.ui.components.Chip
import com.streamix.app.ui.components.ErrorState
import com.streamix.app.ui.components.Loading
import com.streamix.app.ui.components.PosterCard
import com.streamix.app.ui.components.session
import com.streamix.app.ui.theme.Sx
import com.streamix.app.ui.userMessage
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay

private val TV_GENRES = listOf(10759 to "Action", 35 to "Comedy", 80 to "Crime", 99 to "Documentary", 18 to "Drama",
    10751 to "Family", 10765 to "Sci-Fi", 9648 to "Mystery", 10768 to "War")
private val ANIME_GENRES = listOf(10759 to "Action", 35 to "Comedy", 10765 to "Sci-Fi", 9648 to "Mystery", 10749 to "Romance", 18 to "Drama")

/** Paged grid of posters with load-more on scroll */
@Composable
fun PosterGrid(
    key: Any,
    kindHint: String?,
    onOpen: (Media) -> Unit,
    header: @Composable () -> Unit = {},
    fetch: suspend (page: Int) -> Pair<List<Media>, Int>,
) {
    val items = remember(key) { mutableStateListOf<Media>() }
    var page by remember(key) { mutableIntStateOf(0) }
    var total by remember(key) { mutableIntStateOf(1) }
    var loading by remember(key) { mutableStateOf(false) }
    var error by remember(key) { mutableStateOf<String?>(null) }
    val grid = rememberLazyGridState()

    suspend fun loadNext() {
        if (loading || page >= total) return
        loading = true; error = null
        try {
            val (results, pages) = fetch(page + 1)
            val seen = items.map { it.id }.toSet()
            items += results.filter { it.id !in seen }
            page += 1; total = minOf(pages, 50)
        } catch (e: CancellationException) { throw e } catch (e: Throwable) { error = e.userMessage() }
        loading = false
    }

    LaunchedEffect(key) { loadNext() }
    val nearEnd by remember { derivedStateOf { (grid.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0) >= grid.layoutInfo.totalItemsCount - 6 } }
    LaunchedEffect(nearEnd, page) { if (nearEnd && page > 0) loadNext() }

    LazyVerticalGrid(
        GridCells.Adaptive(150.dp), state = grid, modifier = Modifier.fillMaxSize().background(Sx.Surface),
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 110.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item(span = { GridItemSpan(maxLineSpan) }) { header() }
        items(items, key = { "${it.mediaType}-${it.id}" }) { m -> PosterCard(m, { onOpen(m) }, width = null, kindHint = kindHint) }
        item(span = { GridItemSpan(maxLineSpan) }) {
            when {
                loading -> Loading()
                error != null -> ErrorState(error!!)
                items.isEmpty() && page > 0 -> ErrorState("Nothing found")
            }
        }
    }
}

@Composable
fun BrowseScreen(kind: String, initialGenre: Int?, onBack: () -> Unit, onOpen: (String, Int) -> Unit) {
    val api = session().api
    var genre by rememberSaveable { mutableStateOf(initialGenre) }
    var sort by rememberSaveable { mutableStateOf("popularity.desc") }
    val genres = when (kind) { "tv" -> TV_GENRES; "anime" -> ANIME_GENRES; else -> MOVIE_GENRES }
    val title = when (kind) { "tv" -> "TV Shows"; "anime" -> "Anime"; else -> "Movies" }
    val type = if (kind == "movie") "movie" else "tv"

    PosterGrid(
        key = Triple(kind, genre, sort), kindHint = type, onOpen = { onOpen(type, it.id) },
        header = {
            Column(Modifier.statusBarsPadding().padding(vertical = 8.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back", tint = Color.White) }
                    Text(title, style = MaterialTheme.typography.headlineMedium, color = Color.White)
                }
                Spacer(Modifier.height(8.dp))
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    item { Chip("All", genre == null) { genre = null } }
                    items(genres) { (id, name) -> Chip(name, genre == id) { genre = id } }
                }
                Spacer(Modifier.height(8.dp))
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    val sorts = listOf("popularity.desc" to "Popular", "vote_average.desc" to "Top rated",
                        (if (type == "tv") "first_air_date.desc" else "release_date.desc") to "Newest")
                    items(sorts) { (v, label) -> Chip(label, sort == v) { sort = v } }
                }
            }
        },
    ) { page ->
        val params = mutableMapOf<String, Any?>("type" to type, "page" to page, "sort_by" to sort, "vote_count.gte" to if (kind == "anime") 10 else 50)
        when (kind) {
            "anime" -> { params["with_genres"] = if (genre != null) "16,$genre" else "16"; params["with_original_language"] = "ja" }
            else -> genre?.let { params["with_genres"] = it }
        }
        val res = api.discover(params)
        res.results to res.totalPages
    }
}

private val DECADES = listOf(2020 to "2020s", 2010 to "2010s", 2000 to "2000s", 1900 to "Older")
private val LANGS = listOf("en" to "English", "ja" to "Japanese", "ko" to "Korean", "es" to "Spanish", "fr" to "French", "hi" to "Hindi")

@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
fun ExploreScreen(onOpen: (String, Int) -> Unit, onBrowse: (String, Int?) -> Unit) {
    val s = session()
    val api = s.api
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    var query by rememberSaveable { mutableStateOf("") }
    var debounced by rememberSaveable { mutableStateOf("") }
    LaunchedEffect(query) { delay(350); debounced = query.trim() }

    // Filters apply to search results, like on the web
    var showFilters by rememberSaveable { mutableStateOf(false) }
    var fGenre by rememberSaveable { mutableStateOf<Int?>(null) }
    var fDecade by rememberSaveable { mutableStateOf<Int?>(null) }
    var fRating by rememberSaveable { mutableStateOf(0) }
    var fLang by rememberSaveable { mutableStateOf<String?>(null) }
    val activeFilters = listOfNotNull(fGenre, fDecade, fRating.takeIf { it > 0 }, fLang).size
    var surprising by remember { mutableStateOf(false) }
    var searchNote by remember { mutableStateOf<String?>(null) }
    val kids = s.activeProfile.collectAsState().value?.isKids == true

    fun surprise() {
        if (surprising) return
        surprising = true
        scope.launch {
            try {
                // No filter: the smart picker (your taste, time of day, what you usually watch); with a genre: a well-loved title in it
                val smart = if (fGenre == null) runCatching { s.playSomething() }.getOrNull() else null
                if (smart != null) { onOpen(smart.type, smart.id); surprising = false; return@launch }
                val type = if (kotlin.random.Random.nextFloat() < 0.7f) "movie" else "tv"
                val res = api.discover(mapOf("type" to type, "sort_by" to "vote_average.desc", "vote_count.gte" to 800,
                    "page" to (1 + kotlin.random.Random.nextInt(15)), "with_genres" to fGenre))
                res.results.randomOrNull()?.let { onOpen(type, it.id) }
            } catch (e: CancellationException) { throw e } catch (_: Throwable) { /* try again */ }
            surprising = false
        }
    }

    val searchBox: @Composable () -> Unit = {
        Column(Modifier.statusBarsPadding().padding(vertical = 12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Explore", style = MaterialTheme.typography.headlineMedium, color = Color.White, modifier = Modifier.weight(1f))
                if (!kids) com.streamix.app.ui.components.GlassButton(if (surprising) "…" else "Surprise me", Icons.Filled.Casino) { surprise() }
            }
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                query, { query = it }, singleLine = true, modifier = Modifier.fillMaxWidth(),
                leadingIcon = { Icon(Icons.Filled.Search, null, tint = Sx.InkFaint) },
                trailingIcon = {
                    Row {
                        if (query.isNotEmpty()) IconButton(onClick = { query = "" }) { Icon(Icons.Filled.Close, "Clear", tint = Sx.InkFaint) }
                        IconButton(onClick = { showFilters = !showFilters }) {
                            Icon(Icons.Filled.FilterList, "Filters", tint = if (activeFilters > 0 || showFilters) Sx.Scarlet else Sx.InkFaint)
                        }
                    }
                },
                placeholder = { Text("Search movies, shows, anime…", color = Sx.InkFaint) },
                shape = RoundedCornerShape(14.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = Sx.Scarlet, unfocusedBorderColor = Color.White.copy(alpha = 0.08f),
                    focusedContainerColor = Sx.Low, unfocusedContainerColor = Sx.Low, cursorColor = Sx.Scarlet,
                    focusedTextColor = Color.White, unfocusedTextColor = Color.White,
                ),
            )
            if (showFilters) {
                Spacer(Modifier.height(10.dp))
                FilterRow("Genre", listOf<Pair<Int?, String>>(null to "Any") + MOVIE_GENRES.map { it.first to it.second }, fGenre) { fGenre = it }
                FilterRow("Year", listOf<Pair<Int?, String>>(null to "Any") + DECADES.map { it.first to it.second }, fDecade) { fDecade = it }
                FilterRow("Rating", listOf(0 to "Any", 6 to "6+", 7 to "7+", 8 to "8+"), fRating) { fRating = it }
                FilterRow("Language", listOf<Pair<String?, String>>(null to "Any") + LANGS.map { it.first to it.second }, fLang) { fLang = it }
                if (activeFilters > 0) Text("Clear filters", color = Sx.Soft, style = MaterialTheme.typography.labelMedium,
                    modifier = Modifier.clickable { fGenre = null; fDecade = null; fRating = 0; fLang = null }.padding(vertical = 6.dp))
            }
        }
    }

    if (debounced.isEmpty()) {
        Column(Modifier.fillMaxSize().background(Sx.Surface).padding(horizontal = 16.dp)) {
            searchBox()
            Spacer(Modifier.height(8.dp))
            CategoryCard("Movies", "Blockbusters & classics", Icons.Filled.Movie, Sx.Scarlet) { onBrowse("movie", null) }
            CategoryCard("TV Shows", "Series to binge", Icons.Filled.LiveTv, Sx.Cyan) { onBrowse("tv", null) }
            CategoryCard("Anime", "Japanese animation", Icons.Filled.Animation, Sx.Gold) { onBrowse("anime", null) }
            Spacer(Modifier.height(14.dp))
            Text("BROWSE BY GENRE", style = MaterialTheme.typography.labelSmall, color = Sx.InkFaint)
            Spacer(Modifier.height(10.dp))
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(MOVIE_GENRES) { (id, name) -> Chip(name, false) { onBrowse("movie", id) } }
            }
        }
    } else {
        PosterGrid(key = listOf(debounced, fGenre, fDecade, fRating, fLang), kindHint = null, onOpen = {
            s.track("search_click", it.kind(), it.id)
            val q = debounced; val m = it
            scope.launch { runCatching { api.searchClick(q, m) } }
            onOpen(it.kind(), it.id)
        }, header = {
            Column {
                searchBox()
                searchNote?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = Sx.InkMuted, modifier = Modifier.padding(bottom = 8.dp)) }
            }
        }) { page ->
            val res = api.smartSearch(debounced, page, s.activeProfile.value?.id)
            if (page == 1) searchNote = res.person?.let { "Work by ${it.name}" } ?: res.didYouMean?.let { "Showing results for “$it”" }
            res.results.filter { m ->
                val year = m.year.toIntOrNull() ?: 0
                m.mediaType != "person" &&
                    (fGenre == null || fGenre in m.genreIds) &&
                    (fDecade == null || (year >= fDecade!! && (fDecade == 1900 && year < 2000 || fDecade != 1900 && year < fDecade!! + 10))) &&
                    m.voteAverage >= fRating &&
                    (fLang == null || m.originalLanguage == fLang)
            } to res.totalPages
        }
    }
}

@Composable
private fun <T> FilterRow(label: String, options: List<Pair<T, String>>, selected: T, onSelect: (T) -> Unit) {
    Text(label.uppercase(), style = MaterialTheme.typography.labelSmall, color = Sx.InkFaint, modifier = Modifier.padding(top = 6.dp, bottom = 4.dp))
    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        items(options) { (v, name) -> Chip(name, v == selected) { onSelect(v) } }
    }
}

@Composable
private fun CategoryCard(title: String, subtitle: String, icon: ImageVector, tint: Color, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().padding(bottom = 10.dp).clip(RoundedCornerShape(20.dp))
            .background(Brush.horizontalGradient(listOf(tint.copy(alpha = 0.28f), Sx.Card)))
            .clickable(onClick = onClick).padding(18.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, null, Modifier.size(30.dp), tint = Color.White)
        Spacer(Modifier.size(14.dp))
        Column {
            Text(title, style = MaterialTheme.typography.titleLarge, color = Color.White)
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = Sx.InkMuted)
        }
    }
}
