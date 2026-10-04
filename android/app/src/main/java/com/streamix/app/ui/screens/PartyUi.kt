package com.streamix.app.ui.screens

import android.content.Intent
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.PersonRemove
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Timer
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.streamix.app.data.PARTY_EMOJI
import com.streamix.app.data.PartyMedia
import com.streamix.app.data.Reaction
import com.streamix.app.ui.components.GlassButton
import com.streamix.app.ui.components.GlassCard
import com.streamix.app.ui.components.PrimaryButton
import com.streamix.app.ui.components.ProfileBadge
import com.streamix.app.ui.components.TechPill
import com.streamix.app.ui.components.parseColor
import com.streamix.app.ui.components.session
import com.streamix.app.ui.theme.Sx
import kotlinx.coroutines.delay

/** Watch-party panel under the player: start/join, invite, members, chat, reactions */
@Composable
fun PartyPanel(media: PartyMedia?, canSync: Boolean, onClose: () -> Unit) {
    val s = session()
    val party = s.party
    val ctx = LocalContext.current
    val profile by s.activeProfile.collectAsState()
    val code by party.code.collectAsState()
    val members by party.members.collectAsState()
    val hostId by party.hostId.collectAsState()
    val you by party.you.collectAsState()
    val chat by party.chat.collectAsState()
    val error by party.error.collectAsState()
    val server by s.server.collectAsState()
    var joinCode by remember { mutableStateOf("") }
    var message by remember { mutableStateOf("") }
    var starting by remember { mutableStateOf(false) }
    val isHost = code != null && hostId == you
    LaunchedEffect(code, error) { if (code != null || error != null) starting = false }

    GlassCard(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)) {
        Column(Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.Groups, null, tint = Sx.Scarlet)
                Spacer(Modifier.width(8.dp))
                Text("Watch party", style = MaterialTheme.typography.titleMedium, color = Color.White, modifier = Modifier.weight(1f))
                IconButton(onClick = onClose) { Icon(Icons.Filled.Close, "Close", tint = Sx.InkFaint) }
            }
            error?.let { Text(it, color = Sx.Soft, style = MaterialTheme.typography.bodySmall) }

            if (code == null) {
                Text("Watch together with friends on any device. Play, pause and seeking follow the host for Streamix videos and direct streams; other sources get a 3-2-1 countdown.",
                    style = MaterialTheme.typography.bodySmall, color = Sx.InkMuted)
                Spacer(Modifier.height(10.dp))
                PrimaryButton(if (starting) "Starting…" else "Start a watch party", Modifier.fillMaxWidth(), enabled = media != null && !starting) {
                    starting = true; party.clearError(); party.create(media!!, profile)
                }
                Spacer(Modifier.height(10.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(joinCode, { joinCode = it.uppercase().filter(Char::isLetterOrDigit).take(6) }, Modifier.weight(1f), singleLine = true,
                        placeholder = { Text("Have a code?", color = Sx.InkFaint) }, colors = fieldColors())
                    Spacer(Modifier.width(8.dp))
                    GlassButton("Join", null) { if (joinCode.length == 6) { starting = true; party.clearError(); party.join(joinCode, profile) } }
                }
                return@Column
            }

            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("CODE", style = MaterialTheme.typography.labelSmall, color = Sx.InkFaint)
                    Text(code!!, style = MaterialTheme.typography.headlineMedium, color = Color.White, fontFamily = FontFamily.Monospace)
                }
                GlassButton("Invite", Icons.Filled.Share) {
                    val m = media
                    val link = server + when {
                        m == null -> "/?party=$code"
                        m.type == "tv" -> "/player/tv/${m.id}?season=${m.season ?: 1}&episode=${m.episode ?: 1}&party=$code"
                        else -> "/player/movie/${m.id}?party=$code"
                    }
                    val text = "Join my Streamix watch party${m?.title?.let { " for $it" } ?: ""}! Code: $code\n$link"
                    ctx.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text), "Invite"))
                }
            }
            Spacer(Modifier.height(4.dp))
            Text(when {
                isHost && canSync -> "You're the host — everyone follows your play, pause and seeking."
                isHost -> "You're the host. This source can't be synced, so use the countdown to press play together."
                canSync -> "The host controls playback."
                else -> "This source can't be synced — press play when the host's countdown ends."
            }, style = MaterialTheme.typography.bodySmall, color = Sx.InkMuted)
            if (isHost && !canSync) {
                Spacer(Modifier.height(8.dp))
                GlassButton("3-2-1 countdown", Icons.Filled.Timer, Modifier.fillMaxWidth()) { party.startCountdown() }
            }

            Spacer(Modifier.height(10.dp))
            Text("WATCHING (${members.size})", style = MaterialTheme.typography.labelSmall, color = Sx.InkFaint)
            members.forEach { mb ->
                Row(Modifier.fillMaxWidth().padding(vertical = 3.dp), verticalAlignment = Alignment.CenterVertically) {
                    ProfileBadge(mb.avatar, mb.color, 28.dp)
                    Spacer(Modifier.width(8.dp))
                    Text(mb.name + if (mb.id == you) " (you)" else "", color = Color.White, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
                    if (mb.id == hostId) TechPill("Host", Sx.Gold)
                    else if (isHost) IconButton(onClick = { party.kick(mb.id) }, modifier = Modifier.size(32.dp)) {
                        Icon(Icons.Filled.PersonRemove, "Remove ${mb.name}", tint = Sx.InkFaint, modifier = Modifier.size(18.dp))
                    }
                }
            }

            Spacer(Modifier.height(10.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                PARTY_EMOJI.forEach { e -> Text(e, fontSize = 24.sp, modifier = Modifier.clip(CircleShape).clickable { party.react(e) }.padding(4.dp)) }
            }

            Spacer(Modifier.height(8.dp))
            val listState = rememberLazyListState()
            LaunchedEffect(chat.size) { if (chat.isNotEmpty()) listState.animateScrollToItem(chat.size - 1) }
            LazyColumn(Modifier.fillMaxWidth().heightIn(max = 220.dp).clip(RoundedCornerShape(12.dp)).background(Sx.Low).padding(8.dp), state = listState) {
                if (chat.isEmpty()) item { Text("Say hi 👋", color = Sx.InkFaint, style = MaterialTheme.typography.bodySmall) }
                items(chat) { l ->
                    if (l.notice) Text(l.text, color = Sx.InkFaint, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(vertical = 2.dp))
                    else Row(Modifier.padding(vertical = 2.dp)) {
                        Text(l.name + ": ", color = parseColor(l.color), style = MaterialTheme.typography.titleSmall)
                        Text(l.text, color = Sx.Ink, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(message, { message = it.take(300) }, Modifier.weight(1f), singleLine = true,
                    placeholder = { Text("Message", color = Sx.InkFaint) }, colors = fieldColors())
                IconButton(onClick = { party.chat(message); message = "" }, enabled = message.isNotBlank()) {
                    Icon(Icons.AutoMirrored.Filled.Send, "Send", tint = if (message.isNotBlank()) Sx.Scarlet else Sx.InkFaint)
                }
            }
            Spacer(Modifier.height(6.dp))
            GlassButton("Leave party", null, Modifier.fillMaxWidth()) { party.leave() }
        }
    }
}

@Composable
private fun fieldColors() = OutlinedTextFieldDefaults.colors(
    focusedBorderColor = Sx.Scarlet, unfocusedBorderColor = Color.White.copy(alpha = 0.08f), cursorColor = Sx.Scarlet,
    focusedTextColor = Color.White, unfocusedTextColor = Color.White,
)

/** Floating emoji reactions and the 3-2-1 countdown, drawn over the video */
@Composable
fun BoxScope.PartyOverlay() {
    val party = session().party
    val floating = remember { mutableStateListOf<Reaction>() }
    LaunchedEffect(Unit) {
        party.reactions.collect { r -> floating += r; if (floating.size > 12) floating.removeAt(0) }
    }
    floating.toList().forEachIndexed { i, r ->
        key(r) { FloatingReaction(r, i) { floating.remove(r) } }
    }

    val endsAt by party.countdown.collectAsState()
    var left by remember { mutableStateOf<Long?>(null) }
    LaunchedEffect(endsAt) {
        val end = endsAt ?: return@LaunchedEffect
        while (true) {
            val ms = end - System.currentTimeMillis()
            left = ms
            if (ms < -1500) { left = null; break }
            delay(100)
        }
    }
    left?.let { ms ->
        Box(Modifier.align(Alignment.Center).size(110.dp).clip(CircleShape).background(Color.Black.copy(alpha = 0.7f)), contentAlignment = Alignment.Center) {
            Text(if (ms > 0) "${(ms + 999) / 1000}" else "Play!", color = Color.White, fontSize = if (ms > 0) 52.sp else 30.sp,
                style = MaterialTheme.typography.displaySmall)
        }
    }
}

@Composable
private fun key(k: Any, content: @Composable () -> Unit) = androidx.compose.runtime.key(k) { content() }

@Composable
private fun BoxScope.FloatingReaction(r: Reaction, index: Int, onDone: () -> Unit) {
    var started by remember { mutableStateOf(false) }
    val rise by animateFloatAsState(if (started) 1f else 0f, tween(2600), label = "rise")
    LaunchedEffect(Unit) { started = true; delay(2700); onDone() }
    Column(
        Modifier.align(Alignment.BottomStart).offset(x = (24 + (index * 37) % 160).dp, y = (-(rise * 140)).dp).alpha(1f - rise),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(r.emoji, fontSize = 32.sp)
        Text(r.name, color = Color.White, style = MaterialTheme.typography.labelSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}
