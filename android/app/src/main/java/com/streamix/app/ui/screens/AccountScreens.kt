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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.LocalFireDepartment
import androidx.compose.material.icons.filled.Dns
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.PlayCircle
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.streamix.app.data.Profile
import com.streamix.app.ui.components.ErrorState
import com.streamix.app.ui.components.GlassButton
import com.streamix.app.ui.components.GlassCard
import com.streamix.app.ui.components.PosterCard
import com.streamix.app.ui.components.ProfileBadge
import com.streamix.app.ui.components.TechPill
import com.streamix.app.ui.components.session
import com.streamix.app.ui.theme.Sx
import kotlinx.coroutines.launch

@Composable
fun MyListScreen(onOpen: (String, Int) -> Unit, onPlay: (String, Int, Int?, Int?) -> Unit, onDownloads: () -> Unit) {
    val s = session()
    val list by s.watchlist.collectAsState()
    val cw by s.continueWatching.collectAsState()

    LazyVerticalGrid(
        GridCells.Adaptive(150.dp), Modifier.fillMaxSize().background(Sx.Surface),
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 110.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item(span = { GridItemSpan(maxLineSpan) }) {
            Column(Modifier.statusBarsPadding().padding(vertical = 12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("My List", style = MaterialTheme.typography.headlineMedium, color = Color.White, modifier = Modifier.weight(1f))
                    GlassButton("Downloads", Icons.Filled.Download, onClick = onDownloads)
                }
                Text("${list.size} saved title${if (list.size == 1) "" else "s"}", style = MaterialTheme.typography.bodySmall, color = Sx.InkFaint)
            }
        }
        item(span = { GridItemSpan(maxLineSpan) }) {
            ContinueRow(cw, onPlay, onRemove = { s.removeProgress(it) })
        }
        if (list.isEmpty()) item(span = { GridItemSpan(maxLineSpan) }) {
            ErrorState("Nothing saved yet. Tap the bookmark on any title to add it here.")
        }
        items(list, key = { it.movieId }) { w -> PosterCard(w.asMedia(), { onOpen(w.type, w.movieId) }, width = null, kindHint = w.type) }
    }
}

@Composable
fun AccountScreen(
    onProfilesChanged: () -> Unit, onActivity: () -> Unit, onNewHot: () -> Unit,
    onSecurity: () -> Unit, onKidsControls: (String) -> Unit, onDownloads: () -> Unit,
    onPartyJoined: (com.streamix.app.data.PartyMedia) -> Unit,
) {
    val s = session()
    val scope = rememberCoroutineScope()
    val user by s.user.collectAsState()
    val profiles by s.profiles.collectAsState()
    val active by s.activeProfile.collectAsState()
    val server by s.server.collectAsState()
    val cw by s.continueWatching.collectAsState()
    val wl by s.watchlist.collectAsState()
    var creating by remember { mutableStateOf(false) }
    var joining by remember { mutableStateOf(false) }
    if (joining) JoinPartyDialog(onDismiss = { joining = false }, onJoined = {
        joining = false
        s.party.media.value?.let(onPartyJoined)
    })
    var deleting by remember { mutableStateOf<Profile?>(null) }
    val switch = rememberProfileSwitcher { onProfilesChanged() }

    if (creating) CreateProfileDialog(onDismiss = { creating = false }, onCreated = { creating = false })
    deleting?.let { p ->
        AlertDialog(
            onDismissRequest = { deleting = null }, containerColor = Sx.Card,
            title = { Text("Delete “${p.name}”?", color = Color.White) },
            text = { Text("Its watch history and recommendations will be lost.", color = Sx.InkMuted) },
            confirmButton = { TextButton({ scope.launch { runCatching { s.deleteProfile(p) }; deleting = null } }) { Text("Delete", color = Sx.Scarlet) } },
            dismissButton = { TextButton({ deleting = null }) { Text("Cancel", color = Sx.Ink) } },
        )
    }

    LazyColumn(Modifier.fillMaxSize().background(Sx.Surface), contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 110.dp)) {
        item {
            GlassCard(Modifier.statusBarsPadding().padding(top = 12.dp).fillMaxWidth()) {
                Column(Modifier.padding(18.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        ProfileBadge(active?.avatar ?: "🎬", active?.color ?: "#e50914", 52.dp, active?.isKids == true)
                        Spacer(Modifier.width(14.dp))
                        Column(Modifier.weight(1f)) {
                            Text(active?.name ?: user?.username.orEmpty(), style = MaterialTheme.typography.titleLarge, color = Color.White)
                            Text(user?.email.orEmpty(), style = MaterialTheme.typography.bodySmall, color = Sx.InkFaint, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                        if (user?.isAdmin == true) TechPill("Admin", Sx.Gold)
                    }
                    Spacer(Modifier.height(16.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Stat("Watching", cw.size, Icons.Filled.PlayCircle, Sx.Scarlet, Modifier.weight(1f))
                        Stat("My List", wl.size, Icons.Filled.Bookmark, Sx.Gold, Modifier.weight(1f))
                    }
                }
            }
        }
        item {
            Spacer(Modifier.height(22.dp))
            Text("PROFILES", style = MaterialTheme.typography.labelSmall, color = Sx.InkFaint)
            Spacer(Modifier.height(10.dp))
        }
        items(profiles, key = { it.id }) { p ->
            val isActive = p.id == active?.id
            Row(
                Modifier.fillMaxWidth().padding(bottom = 8.dp).clip(RoundedCornerShape(18.dp))
                    .background(if (isActive) Sx.Scarlet.copy(alpha = 0.12f) else Sx.Card)
                    .clickable(enabled = !isActive) { switch(p) }.padding(10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                ProfileBadge(p.avatar, p.color, 44.dp)
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(p.name, style = MaterialTheme.typography.titleSmall, color = Color.White)
                        if (p.hasPin) { Spacer(Modifier.width(4.dp)); Icon(Icons.Filled.Lock, "PIN", Modifier.size(13.dp), tint = Sx.InkFaint) }
                    }
                    Text(if (isActive) "Watching now" else if (p.isKids) "Kids profile" else "Tap to switch", style = MaterialTheme.typography.bodySmall, color = Sx.InkFaint)
                }
                KidsControlsButton(p, onKidsControls)
                if (profiles.size > 1) IconButton(onClick = { deleting = p }) { Icon(Icons.Filled.Delete, "Delete ${p.name}", tint = Sx.InkFaint) }
            }
        }
        if (profiles.size < 5) item {
            GlassButton("Add profile", Icons.Filled.Add, Modifier.fillMaxWidth()) { creating = true }
        }
        item {
            Spacer(Modifier.height(22.dp))
            PlaybackSettingsCard()
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                GlassButton("Viewing activity", Icons.Filled.History, Modifier.weight(1f), onClick = onActivity)
                GlassButton("New & Hot", Icons.Filled.LocalFireDepartment, Modifier.weight(1f), onClick = onNewHot)
            }
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                GlassButton("Downloads", Icons.Filled.Download, Modifier.weight(1f), onClick = onDownloads)
                GlassButton("Join party", Icons.Filled.Groups, Modifier.weight(1f)) { joining = true }
            }
            Spacer(Modifier.height(10.dp))
            ThemeAndBadgesCard()
            Spacer(Modifier.height(10.dp))
            NotificationsCard()
            Spacer(Modifier.height(10.dp))
            GlassButton("Security & two-factor sign-in", Icons.Filled.Security, Modifier.fillMaxWidth(), onClick = onSecurity)
        }
        item {
            Spacer(Modifier.height(22.dp))
            Text("SERVER", style = MaterialTheme.typography.labelSmall, color = Sx.InkFaint)
            Spacer(Modifier.height(10.dp))
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Sx.Card).padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.Dns, null, tint = Sx.Cyan)
                Spacer(Modifier.width(10.dp))
                Text(server.orEmpty(), style = MaterialTheme.typography.bodyMedium, color = Sx.Ink, modifier = Modifier.weight(1f))
                TextButton({ s.changeServer() }) { Text("Change", color = Sx.Soft) }
            }
            Spacer(Modifier.height(22.dp))
            GlassButton("Sign out", Icons.AutoMirrored.Filled.Logout, Modifier.fillMaxWidth()) { scope.launch { s.signOut() } }
        }
    }
}

@Composable
private fun Stat(label: String, value: Int, icon: androidx.compose.ui.graphics.vector.ImageVector, tint: Color, modifier: Modifier) {
    Column(modifier.clip(RoundedCornerShape(16.dp)).background(Sx.Low).padding(12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Icon(icon, null, tint = tint)
        Text("$value", style = MaterialTheme.typography.headlineSmall, color = Color.White)
        Text(label.uppercase(), style = MaterialTheme.typography.labelSmall, color = Sx.InkFaint)
    }
}

private val KIDS_ROWS = listOf("shows" to "Kids Shows", "anime" to "Anime", "cartoons" to "Cartoons",
    "animated-movies" to "Animated Movies", "anime-movies" to "Anime Movies", "family" to "Family")

/**
 * Kids profiles: kid-safe shows, cartoons, anime and movies (filtered by age rating on the server), kids search,
 * minutes left, and the parent's allow / block lists. Tapping a title plays it (shows start at S1 E1 or where they left off).
 */
@Composable
fun KidsHomeScreen(onPlay: (String, Int) -> Unit, onDownloads: () -> Unit) {
    val s = session()
    val api = s.api
    val active by s.activeProfile.collectAsState()
    val status = com.streamix.app.ui.rememberLoad(active?.id) {
        val p = active ?: return@rememberLoad null
        val now = java.time.LocalTime.now()
        api.kidsStatus(p.id, java.time.LocalDate.now().toString(), "%02d:%02d".format(now.hour, now.minute))
    }
    val st = status.value
    var query by androidx.compose.runtime.saveable.rememberSaveable { mutableStateOf("") }
    var debounced by remember { mutableStateOf("") }
    androidx.compose.runtime.LaunchedEffect(query) { kotlinx.coroutines.delay(400); debounced = query.trim() }
    val blocked = st?.blockedTitles.orEmpty().toSet()
    fun visible(list: List<com.streamix.app.data.Media>, kind: String? = null) = list.filter { "${it.kind(kind)}:${it.id}" !in blocked }
    val play: (com.streamix.app.data.Media, String?) -> Unit = { m, kind -> onPlay(m.kind(kind), m.id) }

    LazyColumn(Modifier.fillMaxSize().background(Sx.Surface), contentPadding = PaddingValues(bottom = 40.dp)) {
        item {
            Row(Modifier.statusBarsPadding().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                Wordmark(20)
                Spacer(Modifier.width(8.dp))
                TechPill("Kids", Sx.Void, Sx.Gold)
                st?.minutesLeft?.let { Spacer(Modifier.width(6.dp)); TechPill("$it min left", if (it <= 10) Sx.Soft else Sx.Cyan) }
                Spacer(Modifier.weight(1f))
                IconButton(onClick = onDownloads) { Icon(Icons.Filled.Download, "Downloads", tint = Color.White) }
                Text(active?.avatar.orEmpty())
                Spacer(Modifier.width(8.dp))
                // Back to "Who's watching?" — adult profiles are protected by their own PINs
                GlassButton("Switch", null) { s.activate(null) }
            }
        }
        if (status.state is com.streamix.app.ui.Load.Loading) { item { com.streamix.app.ui.components.Loading() }; return@LazyColumn }
        if (st != null && !st.allowed) {
            item { ErrorState(if (st.reason == "bedtime") "It's bedtime! Come back tomorrow." else "Screen time is up for today. See you tomorrow!") }
            return@LazyColumn
        }
        if (st?.allowedOnly == true) {
            // "Only titles I pick": just the parent's list
            item {
                val picks = com.streamix.app.ui.rememberLoad(st.allowedTitles) {
                    st.allowedTitles.mapNotNull { k ->
                        val type = k.substringBefore(':'); val id = k.substringAfter(':').toIntOrNull() ?: return@mapNotNull null
                        runCatching { api.details(type, id) }.getOrNull()?.let { d ->
                            com.streamix.app.data.Media(id = d.id, title = if (type == "movie") d.displayTitle else null, name = if (type == "tv") d.displayTitle else null,
                                posterPath = d.posterPath, voteAverage = d.voteAverage, mediaType = type)
                        }
                    }
                }
                if (st.allowedTitles.isEmpty()) ErrorState("Ask a grown-up to pick some shows and movies for you.")
                com.streamix.app.ui.components.MediaRail("Picked for you", picks.value.orEmpty(), { play(it, null) }, accent = Sx.Gold)
            }
            return@LazyColumn
        }
        item {
            androidx.compose.material3.OutlinedTextField(
                query, { query = it.take(60) }, singleLine = true, modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
                placeholder = { Text("Search shows and movies", color = Sx.InkFaint) },
                leadingIcon = { Icon(Icons.Filled.Search, null, tint = Sx.InkFaint) },
                shape = RoundedCornerShape(22.dp),
                colors = androidx.compose.material3.OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = Sx.Gold, unfocusedBorderColor = Color.White.copy(alpha = 0.08f), cursorColor = Sx.Gold,
                    focusedContainerColor = Sx.Low, unfocusedContainerColor = Sx.Low, focusedTextColor = Color.White, unfocusedTextColor = Color.White,
                ),
            )
            Spacer(Modifier.height(18.dp))
        }
        if (debounced.length >= 2) {
            item(key = "search-$debounced") {
                val hits = com.streamix.app.ui.rememberLoad(debounced) { api.kidsSearch(debounced).results }
                when (val h = hits.state) {
                    is com.streamix.app.ui.Load.Loading -> com.streamix.app.ui.components.Loading()
                    is com.streamix.app.ui.Load.Err -> ErrorState(h.message, onRetry = hits.retry)
                    is com.streamix.app.ui.Load.Ok -> if (visible(h.value).isEmpty()) ErrorState("Nothing found. Try another name!")
                        else com.streamix.app.ui.components.MediaRail("Results", visible(h.value), { play(it, null) }, accent = Sx.Gold)
                }
            }
            return@LazyColumn
        }
        KIDS_ROWS.forEach { (section, title) ->
            item(key = section) {
                val load = com.streamix.app.ui.rememberLoad(section, memo = "kids") { api.kidsBrowse(section).results }
                // Rows say what they are (media_type); trust it so shows open as shows
                com.streamix.app.ui.components.MediaRail(title, visible(load.value.orEmpty()), { play(it, null) }, accent = Sx.Gold)
            }
        }
    }
}
