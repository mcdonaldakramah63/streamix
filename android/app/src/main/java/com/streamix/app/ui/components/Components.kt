package com.streamix.app.ui.components

import androidx.compose.animation.core.Animatable
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Backspace
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.BookmarkBorder
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Movie
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import coil3.compose.AsyncImage
import com.streamix.app.StreamixApp
import com.streamix.app.data.Media
import com.streamix.app.data.Session
import com.streamix.app.data.WLItem
import com.streamix.app.data.tmdbImage
import com.streamix.app.ui.theme.Sx
import kotlinx.coroutines.launch

@Composable
fun session(): Session = (LocalContext.current.applicationContext as StreamixApp).session

fun parseColor(hex: String): Color = runCatching { Color(android.graphics.Color.parseColor(hex)) }.getOrDefault(Sx.Scarlet)

// ── Buttons & pills ──────────────────────────────────────────────────────────

@Composable
fun PrimaryButton(text: String, modifier: Modifier = Modifier, icon: ImageVector? = null, enabled: Boolean = true, loading: Boolean = false, onClick: () -> Unit) {
    Surface(
        onClick = onClick, enabled = enabled && !loading, shape = CircleShape,
        color = if (enabled) Sx.Scarlet else Sx.Scarlet.copy(alpha = 0.5f), contentColor = Color.White,
        modifier = modifier.height(50.dp).shadow(if (enabled) 18.dp else 0.dp, CircleShape, ambientColor = Sx.Scarlet, spotColor = Sx.Scarlet),
    ) {
        Row(Modifier.padding(horizontal = 22.dp), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
            if (loading) CircularProgressIndicator(Modifier.size(20.dp), color = Color.White, strokeWidth = 2.dp)
            else {
                if (icon != null) { Icon(icon, null, Modifier.size(22.dp)); Spacer(Modifier.width(8.dp)) }
                Text(text, style = MaterialTheme.typography.labelLarge, fontSize = 15.sp)
            }
        }
    }
}

@Composable
fun GlassButton(text: String?, icon: ImageVector?, modifier: Modifier = Modifier, active: Boolean = false, onClick: () -> Unit) {
    Surface(
        onClick = onClick, shape = CircleShape,
        color = if (active) Sx.Scarlet.copy(alpha = 0.18f) else Color.White.copy(alpha = 0.08f),
        contentColor = if (active) Sx.Soft else Sx.Ink,
        border = BorderStroke(1.dp, if (active) Sx.Scarlet.copy(alpha = 0.5f) else Color.White.copy(alpha = 0.14f)),
        modifier = modifier.height(46.dp),
    ) {
        Row(Modifier.padding(horizontal = if (text == null) 12.dp else 14.dp), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
            if (icon != null) Icon(icon, text, Modifier.size(20.dp))
            if (icon != null && text != null) Spacer(Modifier.width(6.dp))
            // Labels never wrap onto a second line in narrow rows (e.g. "My List" on small phones)
            if (text != null) Text(text, style = MaterialTheme.typography.labelLarge, maxLines = 1, softWrap = false, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
fun Chip(text: String, selected: Boolean, onClick: () -> Unit) {
    Surface(
        onClick = onClick, shape = CircleShape,
        color = if (selected) Sx.Scarlet else Sx.Card,
        contentColor = if (selected) Color.White else Sx.InkMuted,
    ) { Text(text, Modifier.padding(horizontal = 16.dp, vertical = 8.dp), style = MaterialTheme.typography.labelMedium) }
}

@Composable
fun TechPill(text: String, color: Color = Sx.Ink, background: Color = Color.White.copy(alpha = 0.06f)) {
    Text(
        text.uppercase(), color = color, style = MaterialTheme.typography.labelSmall,
        modifier = Modifier.clip(CircleShape).background(background)
            .border(1.dp, Color.White.copy(alpha = 0.1f), CircleShape).padding(horizontal = 8.dp, vertical = 3.dp),
    )
}

@Composable
fun RatingPill(value: Double) {
    if (value <= 0) return
    Row(
        Modifier.clip(CircleShape).background(Sx.Gold.copy(alpha = 0.18f)).padding(horizontal = 8.dp, vertical = 3.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Filled.Star, null, Modifier.size(12.dp), tint = Sx.Gold)
        Spacer(Modifier.width(3.dp))
        Text("%.1f".format(value), color = Sx.Gold, style = MaterialTheme.typography.labelSmall)
    }
}

@Composable
fun SectionHeader(title: String, modifier: Modifier = Modifier, accent: Color = Sx.Scarlet, trailing: (@Composable () -> Unit)? = null) {
    Row(modifier.fillMaxWidth().padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(width = 5.dp, height = 18.dp).clip(CircleShape).background(accent))
        Spacer(Modifier.width(8.dp))
        Text(title, style = MaterialTheme.typography.titleLarge, color = Sx.Ink, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
        trailing?.invoke()
    }
}

// ── Media cards ──────────────────────────────────────────────────────────────

/** "7.4" without String.format (which is slow and runs for every card that scrolls in) */
fun rating(v: Double): String { val t = Math.round(v * 10).toInt(); return "${t / 10}.${t % 10}" }

private val PosterFade = Brush.verticalGradient(0.6f to Color.Transparent, 1f to Color(0xFF1C2029))

@Composable
fun PosterCard(media: Media, onClick: () -> Unit, modifier: Modifier = Modifier, width: Dp? = 140.dp, kindHint: String? = null, reason: String? = null) {
    val s = session()
    val ids by s.watchlistIds.collectAsState()
    val signedIn by s.signedIn.collectAsState()
    val saved = media.id in ids
    val user = if (signedIn) Unit else null
    val kind = media.kind(kindHint)

    Column(
        (if (width != null) modifier.width(width) else modifier)
            .clip(RoundedCornerShape(18.dp)).background(Sx.Card).clickable(onClick = onClick)
    ) {
        Box(Modifier.fillMaxWidth().aspectRatio(2f / 3f).background(Sx.Void)) {
            val url = tmdbImage(media.posterPath)
            if (url != null) AsyncImage(url, media.displayTitle, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
            else Icon(Icons.Filled.Movie, null, Modifier.align(Alignment.Center).size(36.dp), tint = Sx.InkFaint)
            Box(Modifier.fillMaxSize().background(PosterFade))
            if (user != null) {
                Box(
                    Modifier.align(Alignment.TopEnd).padding(8.dp).size(32.dp).clip(CircleShape)
                        .background(if (saved) Sx.Scarlet else Sx.Void.copy(alpha = 0.7f))
                        .clickable {
                            s.toggleWatchlist(WLItem(media.id, media.displayTitle, media.posterPath.orEmpty(),
                                media.backdropPath.orEmpty(), media.voteAverage, media.year, kind))
                        },
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(if (saved) Icons.Filled.Bookmark else Icons.Filled.BookmarkBorder,
                        if (saved) "Remove from My List" else "Add to My List", Modifier.size(18.dp), tint = Color.White)
                }
            }
            if (kind == "tv" && media.mediaType != null) {
                Box(Modifier.align(Alignment.TopStart).padding(8.dp)) { TechPill("Series", Sx.Cyan, Sx.Void.copy(alpha = 0.7f)) }
            }
        }
        Column(Modifier.padding(horizontal = 10.dp, vertical = 9.dp)) {
            Text(media.displayTitle, style = MaterialTheme.typography.titleSmall, color = Sx.Ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Spacer(Modifier.height(3.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(media.year.ifBlank { "—" }, style = MaterialTheme.typography.bodySmall, color = Sx.InkFaint, modifier = Modifier.weight(1f))
                if (media.voteAverage > 0) {
                    Icon(Icons.Filled.Star, null, Modifier.size(12.dp), tint = Sx.Gold)
                    Text(" " + rating(media.voteAverage), style = MaterialTheme.typography.labelSmall, color = Sx.Gold)
                }
            }
            if (!reason.isNullOrBlank()) {
                Spacer(Modifier.height(4.dp))
                // Fixed two-line height so cards in a row stay the same size
                Text(reason, style = MaterialTheme.typography.bodySmall, color = Sx.Soft, maxLines = 2, minLines = 2, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

@Composable
fun MediaRail(
    title: String,
    items: List<Media>,
    onOpen: (Media) -> Unit,
    accent: Color = Sx.Scarlet,
    ranked: Boolean = false,
    kindHint: String? = null,
    /** Show each item's "why" (recommendation rows) */
    showReasons: Boolean = false,
) {
    if (items.isEmpty()) return
    Column(Modifier.padding(bottom = 26.dp)) {
        SectionHeader(title, accent = accent)
        Spacer(Modifier.height(12.dp))
        LazyRow(contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            itemsIndexed(items, key = { _, m -> "${m.mediaType}-${m.id}" }) { i, m ->
                if (ranked) {
                    Box(Modifier.width(176.dp), contentAlignment = Alignment.BottomStart) {
                        Text("${i + 1}", fontSize = 84.sp, fontWeight = FontWeight.ExtraBold, color = Sx.Highest,
                            modifier = Modifier.offset(y = 18.dp))
                        PosterCard(m, { onOpen(m) }, Modifier.padding(start = 40.dp), width = 136.dp, kindHint = kindHint)
                    }
                } else PosterCard(m, { onOpen(m) }, kindHint = kindHint, reason = if (showReasons) m.reason else null)
            }
        }
    }
}

@Composable
fun RailSkeleton() {
    Column(Modifier.padding(bottom = 26.dp)) {
        Box(Modifier.padding(horizontal = 16.dp).size(160.dp, 20.dp).clip(CircleShape).background(Sx.Card))
        Spacer(Modifier.height(12.dp))
        Row(Modifier.padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            repeat(4) { Box(Modifier.size(140.dp, 250.dp).clip(RoundedCornerShape(18.dp)).background(Sx.Card)) }
        }
    }
}

// ── States ───────────────────────────────────────────────────────────────────

@Composable
fun Loading(modifier: Modifier = Modifier) {
    Box(modifier.fillMaxWidth().padding(40.dp), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(color = Sx.Scarlet, strokeWidth = 2.dp)
    }
}

@Composable
fun ErrorState(message: String, modifier: Modifier = Modifier, onRetry: (() -> Unit)? = null) {
    Column(modifier.fillMaxWidth().padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Box(Modifier.size(64.dp).clip(CircleShape).background(Sx.Scarlet.copy(alpha = 0.15f)), contentAlignment = Alignment.Center) {
            Icon(Icons.Filled.CloudOff, null, tint = Sx.Scarlet, modifier = Modifier.size(30.dp))
        }
        Spacer(Modifier.height(14.dp))
        Text(message, color = Sx.InkMuted, textAlign = TextAlign.Center, style = MaterialTheme.typography.bodyMedium)
        if (onRetry != null) { Spacer(Modifier.height(16.dp)); GlassButton("Try again", null, onClick = onRetry) }
    }
}

/** Glass card container */
@Composable
fun GlassCard(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Surface(modifier, shape = RoundedCornerShape(20.dp), color = Sx.Card, border = BorderStroke(1.dp, Color.White.copy(alpha = 0.06f))) {
        content()
    }
}

// ── PIN pad ──────────────────────────────────────────────────────────────────

/** 4-digit PIN dialog. [onSubmit] returns null when accepted or an error message. */
@Composable
fun PinDialog(title: String, subtitle: String, onSubmit: suspend (String) -> String?, onDismiss: () -> Unit) {
    var digits by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val shake = remember { Animatable(0f) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(digits) {
        if (digits.length == 4 && !busy) {
            busy = true
            val err = onSubmit(digits)
            busy = false
            if (err != null) {
                error = err; digits = ""
                scope.launch { for (x in listOf(18f, -14f, 10f, -6f, 0f)) shake.animateTo(x) }
            }
        }
    }

    Dialog(onDismissRequest = onDismiss) {
        Surface(shape = RoundedCornerShape(28.dp), color = Sx.Card, border = BorderStroke(1.dp, Color.White.copy(alpha = 0.08f))) {
            Column(Modifier.padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Box(Modifier.size(56.dp).clip(RoundedCornerShape(16.dp)).background(Color.White.copy(alpha = 0.06f)), contentAlignment = Alignment.Center) {
                    Icon(Icons.Filled.Lock, null, tint = Sx.Ink)
                }
                Spacer(Modifier.height(14.dp))
                Text(title, style = MaterialTheme.typography.titleLarge, color = Color.White)
                Text(subtitle, style = MaterialTheme.typography.bodySmall, color = Sx.InkMuted, textAlign = TextAlign.Center)
                Spacer(Modifier.height(18.dp))
                Row(Modifier.offset(x = shake.value.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    repeat(4) { i ->
                        val filled = i < digits.length
                        Box(
                            Modifier.size(50.dp).clip(RoundedCornerShape(15.dp))
                                .background(if (filled) Sx.Scarlet.copy(alpha = 0.14f) else Color.White.copy(alpha = 0.04f))
                                .border(1.5.dp, if (filled) Sx.Scarlet.copy(alpha = 0.6f) else Color.White.copy(alpha = 0.08f), RoundedCornerShape(15.dp)),
                            contentAlignment = Alignment.Center,
                        ) {
                            Canvas(Modifier.size(if (filled) 11.dp else 8.dp)) {
                                drawCircle(if (filled) Sx.Scarlet else Color.White.copy(alpha = 0.15f))
                            }
                        }
                    }
                }
                Box(Modifier.height(30.dp), contentAlignment = Alignment.Center) {
                    when {
                        busy -> CircularProgressIndicator(Modifier.size(18.dp), color = Sx.Scarlet, strokeWidth = 2.dp)
                        error != null -> Text(error!!, color = Sx.Soft, style = MaterialTheme.typography.labelMedium)
                    }
                }
                val keys = listOf("1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫")
                keys.chunked(3).forEach { row ->
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.padding(bottom = 10.dp)) {
                        row.forEach { k ->
                            Box(
                                Modifier.size(72.dp, 54.dp).clip(RoundedCornerShape(16.dp))
                                    .background(if (k.isEmpty()) Color.Transparent else Color.White.copy(alpha = 0.06f))
                                    .clickable(enabled = k.isNotEmpty() && !busy) {
                                        error = null
                                        digits = if (k == "⌫") digits.dropLast(1) else (digits + k).take(4)
                                    },
                                contentAlignment = Alignment.Center,
                            ) {
                                when (k) {
                                    "⌫" -> Icon(Icons.AutoMirrored.Filled.Backspace, "Delete", tint = Sx.InkMuted)
                                    "" -> Unit
                                    else -> Text(k, fontSize = 22.sp, fontWeight = FontWeight.SemiBold, color = Color.White)
                                }
                            }
                        }
                    }
                }
                Text("Cancel", color = Sx.InkMuted, style = MaterialTheme.typography.labelLarge,
                    modifier = Modifier.clip(CircleShape).clickable(onClick = onDismiss).padding(horizontal = 24.dp, vertical = 10.dp))
            }
        }
    }
}

@Composable
fun ProfileBadge(avatar: String, color: String, size: Dp, isKids: Boolean = false) {
    val c = parseColor(color)
    Box {
        Box(
            Modifier.size(size).clip(RoundedCornerShape(size / 4))
                .background(Brush.linearGradient(listOf(c.copy(alpha = 0.35f), c.copy(alpha = 0.1f))))
                .border(1.5.dp, c.copy(alpha = 0.5f), RoundedCornerShape(size / 4)),
            contentAlignment = Alignment.Center,
        ) { Text(avatar, fontSize = (size.value * 0.45f).sp) }
        if (isKids) Box(Modifier.align(Alignment.TopEnd).offset(6.dp, (-6).dp)) { TechPill("Kids", Sx.Void, Sx.Gold) }
    }
}

@Composable
fun BoxScope.BottomFade(color: Color = Sx.Surface, from: Float = 0.45f) {
    Box(Modifier.matchParentSize().background(Brush.verticalGradient(from to Color.Transparent, 1f to color)))
}
