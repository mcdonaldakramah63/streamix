package com.streamix.app.ui.screens

import android.Manifest
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.foundation.layout.fillMaxHeight
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
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.streamix.app.data.KidsControls
import com.streamix.app.data.Notifier
import com.streamix.app.data.Offline
import com.streamix.app.data.OfflineItem
import com.streamix.app.data.Profile
import com.streamix.app.data.TwoFactorSetup
import com.streamix.app.data.tmdbImage
import com.streamix.app.ui.Load
import com.streamix.app.ui.components.Chip
import com.streamix.app.ui.components.ErrorState
import com.streamix.app.ui.components.GlassButton
import com.streamix.app.ui.components.GlassCard
import com.streamix.app.ui.components.Loading
import com.streamix.app.ui.components.PinDialog
import com.streamix.app.ui.components.PrimaryButton
import com.streamix.app.ui.components.TechPill
import com.streamix.app.ui.components.session
import com.streamix.app.ui.rememberLoad
import com.streamix.app.ui.theme.Sx
import com.streamix.app.ui.theme.THEMES
import com.streamix.app.ui.userMessage
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@Composable
private fun Header(title: String, onBack: () -> Unit) {
    Row(Modifier.statusBarsPadding().padding(horizontal = 6.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back", tint = Color.White) }
        Text(title, style = MaterialTheme.typography.headlineSmall, color = Color.White)
    }
}

@Composable
private fun Field(value: String, onChange: (String) -> Unit, label: String, password: Boolean = false, number: Boolean = false, modifier: Modifier = Modifier.fillMaxWidth()) {
    OutlinedTextField(
        value, onChange, modifier, singleLine = true, label = { Text(label) },
        visualTransformation = if (password) PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None,
        keyboardOptions = KeyboardOptions(keyboardType = if (password) KeyboardType.Password else if (number) KeyboardType.Number else KeyboardType.Text),
        shape = RoundedCornerShape(14.dp),
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = Sx.Scarlet, unfocusedBorderColor = Color.White.copy(alpha = 0.08f), focusedLabelColor = Sx.Soft,
            unfocusedLabelColor = Sx.InkFaint, cursorColor = Sx.Scarlet, focusedTextColor = Color.White, unfocusedTextColor = Color.White,
        ),
    )
}

private fun copy(ctx: Context, label: String, text: String) {
    ctx.getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText(label, text))
    Toast.makeText(ctx, "Copied", Toast.LENGTH_SHORT).show()
}

// ── Security: two-factor sign-in, recent sign-ins, sign out everywhere ──────

@Composable
fun SecurityScreen(onBack: () -> Unit) {
    val s = session()
    val api = s.api
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var reload by remember { mutableStateOf(0) }
    val status = rememberLoad(reload) { api.twoFactorStatus() }
    val signIns = rememberLoad(reload) { api.signIns() }

    var password by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var setup by remember { mutableStateOf<TwoFactorSetup?>(null) }
    var codes by remember { mutableStateOf<List<String>?>(null) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var action by remember { mutableStateOf<String?>(null) } // "disable" | "recovery"
    var confirmEverywhere by remember { mutableStateOf(false) }

    fun run(block: suspend () -> Unit) {
        busy = true; error = null
        scope.launch {
            try { block() } catch (e: Throwable) { error = e.userMessage() }
            busy = false
        }
    }

    codes?.let { list ->
        AlertDialog(
            onDismissRequest = {}, containerColor = Sx.Card,
            title = { Text("Save your backup codes", color = Color.White) },
            text = {
                Column {
                    Text("Each code works once if you lose your phone. They won't be shown again.", color = Sx.InkMuted, style = MaterialTheme.typography.bodySmall)
                    Spacer(Modifier.height(10.dp))
                    list.chunked(2).forEach { row ->
                        Row { row.forEach { Text(it, color = Color.White, fontFamily = FontFamily.Monospace, modifier = Modifier.weight(1f).padding(vertical = 3.dp)) } }
                    }
                }
            },
            confirmButton = { TextButton({ codes = null }) { Text("I've saved them", color = Sx.Soft) } },
            dismissButton = { TextButton({ copy(ctx, "Backup codes", list.joinToString("\n")) }) { Text("Copy", color = Sx.Ink) } },
        )
    }
    if (confirmEverywhere) AlertDialog(
        onDismissRequest = { confirmEverywhere = false }, containerColor = Sx.Card,
        title = { Text("Sign out everywhere?", color = Color.White) },
        text = { Text("Every phone, TV and browser signed in to this account (including this one) will need to sign in again.", color = Sx.InkMuted) },
        confirmButton = { TextButton({ confirmEverywhere = false; run { s.signOutEverywhere() } }) { Text("Sign out everywhere", color = Sx.Scarlet) } },
        dismissButton = { TextButton({ confirmEverywhere = false }) { Text("Cancel", color = Sx.Ink) } },
    )

    LazyColumn(Modifier.fillMaxSize().background(Sx.Surface), contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 40.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { Header("Security", onBack) }
        item {
            GlassCard(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.Security, null, tint = Sx.Cyan)
                        Spacer(Modifier.width(10.dp))
                        Text("Two-factor sign-in", style = MaterialTheme.typography.titleMedium, color = Color.White, modifier = Modifier.weight(1f))
                        status.value?.let { TechPill(if (it.enabled) "On" else "Off", if (it.enabled) Sx.Cyan else Sx.InkFaint) }
                    }
                    error?.let { Text(it, color = Sx.Soft, style = MaterialTheme.typography.bodySmall) }
                    val st = status.value
                    when {
                        st == null -> if (status.state is Load.Err) ErrorState((status.state as Load.Err).message, onRetry = status.retry) else Loading()
                        // Step 2: add the key to an authenticator app, then confirm with a code
                        setup != null -> {
                            val su = setup!!
                            Text("Add Streamix to your authenticator app (Google Authenticator, Aegis, 1Password…), then enter the 6-digit code it shows.",
                                style = MaterialTheme.typography.bodySmall, color = Sx.InkMuted)
                            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Sx.Low).padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                                Text(su.secret.chunked(4).joinToString(" "), color = Color.White, fontFamily = FontFamily.Monospace, modifier = Modifier.weight(1f))
                                IconButton(onClick = { copy(ctx, "Setup key", su.secret) }) { Icon(Icons.Filled.ContentCopy, "Copy key", tint = Sx.InkMuted) }
                            }
                            GlassButton("Open authenticator app", null, Modifier.fillMaxWidth()) {
                                runCatching { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(su.otpauthUrl))) }
                                    .onFailure { Toast.makeText(ctx, "No authenticator app found — copy the key instead", Toast.LENGTH_LONG).show() }
                            }
                            Field(code, { code = it.filter(Char::isDigit).take(6) }, "6-digit code", number = true)
                            PrimaryButton("Turn on", Modifier.fillMaxWidth(), loading = busy, enabled = code.length == 6) {
                                run {
                                    val (user, backup) = api.twoFactorEnable(code)
                                    s.replaceUser(user)
                                    setup = null; code = ""; password = ""; codes = backup; reload++
                                }
                            }
                            TextButton({ setup = null; code = "" }) { Text("Cancel", color = Sx.InkMuted) }
                        }
                        !st.enabled -> {
                            Text("Ask for a code from an authenticator app when signing in. Turning it on signs out your other devices.",
                                style = MaterialTheme.typography.bodySmall, color = Sx.InkMuted)
                            Field(password, { password = it }, "Your password", password = true)
                            PrimaryButton("Set up", Modifier.fillMaxWidth(), loading = busy, enabled = password.isNotEmpty()) {
                                run { setup = api.twoFactorSetup(password) }
                            }
                        }
                        else -> {
                            Text("${st.recoveryLeft} backup code${if (st.recoveryLeft == 1) "" else "s"} left", style = MaterialTheme.typography.bodySmall,
                                color = if (st.recoveryLeft <= 2) Sx.Gold else Sx.InkMuted)
                            if (action == null) Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                GlassButton("New backup codes", null, Modifier.weight(1f)) { action = "recovery" }
                                GlassButton("Turn off", null, Modifier.weight(1f)) { action = "disable" }
                            } else {
                                Field(password, { password = it }, "Your password", password = true)
                                Field(code, { code = it.take(12) }, "Authenticator or backup code")
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    PrimaryButton(if (action == "disable") "Turn off" else "Get new codes", Modifier.weight(1f), loading = busy,
                                        enabled = password.isNotEmpty() && code.isNotBlank()) {
                                        run {
                                            if (action == "disable") api.twoFactorDisable(password, code) else codes = api.newRecoveryCodes(password, code)
                                            action = null; password = ""; code = ""; reload++
                                        }
                                    }
                                    GlassButton("Cancel", null) { action = null; password = ""; code = "" }
                                }
                            }
                        }
                    }
                }
            }
        }
        item {
            GlassButton("Sign out everywhere", Icons.AutoMirrored.Filled.Logout, Modifier.fillMaxWidth()) { confirmEverywhere = true }
        }
        item { Text("RECENT SIGN-INS & SECURITY CHANGES", style = MaterialTheme.typography.labelSmall, color = Sx.InkFaint) }
        when (val st = signIns.state) {
            is Load.Loading -> item { Loading() }
            is Load.Err -> item { ErrorState(st.message, onRetry = signIns.retry) }
            is Load.Ok -> items(st.value) { e ->
                Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Sx.Card).padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(if (e.warn) Icons.Filled.Warning else Icons.Filled.Security, null, tint = if (e.warn) Sx.Gold else Sx.InkFaint, modifier = Modifier.size(20.dp))
                    Spacer(Modifier.width(10.dp))
                    Column(Modifier.weight(1f)) {
                        Text(e.label, style = MaterialTheme.typography.titleSmall, color = Color.White)
                        Text(listOf(e.device, e.ip, e.at.take(16).replace('T', ' ')).filter { it.isNotBlank() }.joinToString(" • "),
                            style = MaterialTheme.typography.bodySmall, color = Sx.InkFaint)
                    }
                }
            }
        }
    }
}

// ── Kids controls (parent view of a kids profile) ────────────────────────────

private val LIMITS = listOf(0, 30, 45, 60, 90, 120, 180, 240)

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun KidsControlsScreen(profileId: String, onBack: () -> Unit) {
    val s = session()
    val api = s.api
    val scope = rememberCoroutineScope()
    val profiles by s.profiles.collectAsState()
    val kid = profiles.firstOrNull { it.id == profileId }
    var pin by remember { mutableStateOf<String?>(null) }
    var needPin by remember { mutableStateOf(false) }
    var attempt by remember { mutableStateOf(0) }
    val data = rememberLoad(attempt) {
        try { api.kidsControls(profileId, pin) } catch (e: com.streamix.app.data.ApiException) { if (e.code == 403) needPin = true; throw e }
    }
    var c by remember { mutableStateOf<KidsControls?>(null) }
    LaunchedEffect(data.value) { data.value?.let { c = it.controls; needPin = false } }
    var notice by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var saving by remember { mutableStateOf(false) }
    var query by remember { mutableStateOf("") }
    val names = remember { mutableStateMapOf<String, String>() }

    if (needPin && data.value == null) PinDialog("Parent PIN", "Enter a parent profile's PIN to change ${kid?.name ?: "this kid"}'s controls", onSubmit = { p ->
        pin = p
        try { api.kidsControls(profileId, p); attempt++; null } catch (e: Throwable) { if ((e as? com.streamix.app.data.ApiException)?.code == 403) "That PIN didn't match a parent profile" else e.userMessage() }
    }, onDismiss = onBack)

    // Titles for "movie:123" keys
    LaunchedEffect(c?.allowedTitles, c?.blockedTitles) {
        val keys = (c?.allowedTitles.orEmpty() + c?.blockedTitles.orEmpty()).filter { it !in names }
        keys.forEach { k -> runCatching { api.details(k.substringBefore(':'), k.substringAfter(':').toInt()).displayTitle }.getOrNull()?.let { names[k] = it } }
    }
    val hits = rememberLoad(query) {
        val q = query.trim()
        if (q.length < 2) emptyList() else { delay(350); (api.search(q, 1, "movie").results.take(5).map { it.copy(mediaType = "movie") } +
            api.search(q, 1, "tv").results.take(5).map { it.copy(mediaType = "tv") }) }
    }

    fun save() {
        val cur = c ?: return
        saving = true; error = null; notice = null
        scope.launch {
            try { api.saveKidsControls(profileId, pin, cur); notice = "Saved" } catch (e: Throwable) { error = e.userMessage() }
            saving = false
        }
    }

    Column(Modifier.fillMaxSize().background(Sx.Surface)) {
        Header("Controls for ${kid?.name ?: "kids"}", onBack)
        val cur = c
        if (cur == null) { if (data.state is Load.Err && !needPin) ErrorState((data.state as Load.Err).message, onRetry = data.retry) else Loading(); return@Column }
        LazyColumn(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 40.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            item {
                GlassCard(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(16.dp)) {
                        Text("DAILY SCREEN TIME", style = MaterialTheme.typography.labelSmall, color = Sx.InkFaint)
                        Spacer(Modifier.height(8.dp))
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            LIMITS.forEach { m -> Chip(if (m == 0) "No limit" else if (m < 60) "${m}m" else "${m / 60}h${if (m % 60 > 0) " ${m % 60}m" else ""}", cur.dailyLimitMin == m) { c = cur.copy(dailyLimitMin = m) } }
                        }
                        Spacer(Modifier.height(14.dp))
                        Text("BEDTIME", style = MaterialTheme.typography.labelSmall, color = Sx.InkFaint)
                        Text("No watching between these times (24-hour, like 20:30). Leave both empty for none.", style = MaterialTheme.typography.bodySmall, color = Sx.InkMuted)
                        Spacer(Modifier.height(6.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Field(cur.bedtimeStart, { c = cur.copy(bedtimeStart = it.take(5)) }, "From", modifier = Modifier.weight(1f))
                            Field(cur.bedtimeEnd, { c = cur.copy(bedtimeEnd = it.take(5)) }, "Until", modifier = Modifier.weight(1f))
                        }
                        Spacer(Modifier.height(12.dp))
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text("Only titles I pick", style = MaterialTheme.typography.titleSmall, color = Color.White)
                                Text("Everything else is hidden", style = MaterialTheme.typography.bodySmall, color = Sx.InkFaint)
                            }
                            Switch(cur.allowedOnly, { c = cur.copy(allowedOnly = it) }, colors = SwitchDefaults.colors(checkedTrackColor = Sx.Scarlet, checkedThumbColor = Color.White))
                        }
                    }
                }
            }
            item {
                GlassCard(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(16.dp)) {
                        Text("ALLOWED & BLOCKED TITLES", style = MaterialTheme.typography.labelSmall, color = Sx.InkFaint)
                        Spacer(Modifier.height(8.dp))
                        Field(query, { query = it }, "Search a movie or show")
                        hits.value.orEmpty().forEach { m ->
                            val key = "${m.mediaType}:${m.id}"
                            Row(Modifier.fillMaxWidth().padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                                AsyncImage(tmdbImage(m.posterPath, "w92"), null, Modifier.width(32.dp).aspectRatio(2f / 3f).clip(RoundedCornerShape(6.dp)).background(Sx.Void), contentScale = ContentScale.Crop)
                                Spacer(Modifier.width(8.dp))
                                Text("${m.displayTitle}${if (m.year.isNotBlank()) " (${m.year})" else ""}", color = Color.White, style = MaterialTheme.typography.bodySmall,
                                    modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                                TextButton({ names[key] = m.displayTitle; c = cur.copy(allowedTitles = (cur.allowedTitles + key).distinct(), blockedTitles = cur.blockedTitles - key) }) { Text("Allow", color = Sx.Cyan) }
                                TextButton({ names[key] = m.displayTitle; c = cur.copy(blockedTitles = (cur.blockedTitles + key).distinct(), allowedTitles = cur.allowedTitles - key) }) { Text("Block", color = Sx.Soft) }
                            }
                        }
                        Spacer(Modifier.height(10.dp))
                        Text("Allowed${if (!cur.allowedOnly) " (used when “Only titles I pick” is on)" else ""}", style = MaterialTheme.typography.titleSmall, color = Color.White)
                        KeyChips(cur.allowedTitles, names) { k -> c = cur.copy(allowedTitles = cur.allowedTitles - k) }
                        Spacer(Modifier.height(8.dp))
                        Text("Blocked", style = MaterialTheme.typography.titleSmall, color = Color.White)
                        KeyChips(cur.blockedTitles, names) { k -> c = cur.copy(blockedTitles = cur.blockedTitles - k) }
                    }
                }
            }
            item {
                error?.let { Text(it, color = Sx.Soft, style = MaterialTheme.typography.bodySmall) }
                notice?.let { Text(it, color = Sx.Cyan, style = MaterialTheme.typography.bodySmall) }
                PrimaryButton("Save controls", Modifier.fillMaxWidth(), loading = saving) { save() }
            }
            data.value?.report?.let { r ->
                item {
                    GlassCard(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(16.dp)) {
                            Text("THIS WEEK", style = MaterialTheme.typography.labelSmall, color = Sx.InkFaint)
                            Spacer(Modifier.height(10.dp))
                            val max = maxOf(1, r.days.maxOfOrNull { it.minutes } ?: 1, cur.dailyLimitMin)
                            Row(Modifier.fillMaxWidth().height(120.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.Bottom) {
                                r.days.forEach { d ->
                                    Column(Modifier.weight(1f).fillMaxHeight(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Bottom) {
                                        Text("${d.minutes}", style = MaterialTheme.typography.labelSmall, color = Sx.InkMuted)
                                        Box(Modifier.fillMaxWidth().fillMaxHeight((d.minutes.toFloat() / max).coerceIn(0.02f, 0.75f)).clip(RoundedCornerShape(6.dp))
                                            .background(if (cur.dailyLimitMin > 0 && d.minutes >= cur.dailyLimitMin) Sx.Gold else Sx.Scarlet))
                                        Text(runCatching { java.time.LocalDate.parse(d.day).dayOfWeek.name.take(2) }.getOrDefault(""), style = MaterialTheme.typography.labelSmall, color = Sx.InkFaint)
                                    }
                                }
                            }
                            Text("Minutes watched per day", style = MaterialTheme.typography.bodySmall, color = Sx.InkFaint)
                            if (r.recent.isNotEmpty()) {
                                Spacer(Modifier.height(12.dp))
                                Text("RECENTLY WATCHED", style = MaterialTheme.typography.labelSmall, color = Sx.InkFaint)
                                r.recent.take(10).forEach { h ->
                                    Text("${h.title} — ${if (h.completed) "finished" else "${h.progress.toInt()}%"}", style = MaterialTheme.typography.bodySmall,
                                        color = Sx.Ink, modifier = Modifier.padding(top = 4.dp), maxLines = 1, overflow = TextOverflow.Ellipsis)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun KeyChips(keys: List<String>, names: Map<String, String>, onRemove: (String) -> Unit) {
    if (keys.isEmpty()) { Text("None", style = MaterialTheme.typography.bodySmall, color = Sx.InkFaint); return }
    FlowRow(Modifier.padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        keys.forEach { k ->
            Row(Modifier.clip(CircleShape).background(Sx.High).padding(start = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(names[k] ?: k, style = MaterialTheme.typography.bodySmall, color = Sx.Ink)
                IconButton(onClick = { onRemove(k) }, modifier = Modifier.size(30.dp)) { Icon(Icons.Filled.Close, "Remove", tint = Sx.InkFaint, modifier = Modifier.size(14.dp)) }
            }
        }
    }
}

// ── Theme & badges (per profile) ─────────────────────────────────────────────

@Composable
fun ThemeAndBadgesCard() {
    val s = session()
    val scope = rememberCoroutineScope()
    val profile by s.activeProfile.collectAsState()
    val p = profile ?: return
    val badges = rememberLoad(p.id) { s.api.badges(p.id) }
    var error by remember { mutableStateOf<String?>(null) }

    GlassCard(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            Text("THEME", style = MaterialTheme.typography.labelSmall, color = Sx.InkFaint)
            Spacer(Modifier.height(8.dp))
            LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                items(THEMES.entries.toList()) { (key, t) ->
                    val on = p.theme == key
                    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.clickable {
                        error = null
                        scope.launch { try { s.setTheme(key) } catch (e: Throwable) { error = e.userMessage() } }
                    }) {
                        Box(Modifier.size(40.dp).clip(CircleShape).background(t.brand).then(if (on) Modifier.padding(3.dp).clip(CircleShape).background(Color.White).padding(3.dp).clip(CircleShape).background(t.brand) else Modifier))
                        Text(t.label, style = MaterialTheme.typography.labelSmall, color = if (on) Color.White else Sx.InkFaint)
                    }
                }
            }
            error?.let { Text(it, color = Sx.Soft, style = MaterialTheme.typography.bodySmall) }
            Spacer(Modifier.height(16.dp))
            val b = badges.value
            Text("BADGES${b?.let { " · ${it.earned}/${it.badges.size}" } ?: ""}", style = MaterialTheme.typography.labelSmall, color = Sx.InkFaint)
            Spacer(Modifier.height(8.dp))
            if (b == null) { if (badges.state is Load.Loading) Loading() }
            else LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                items(b.badges, key = { it.id }) { x ->
                    Column(Modifier.width(96.dp).clip(RoundedCornerShape(14.dp)).background(if (x.earned) Sx.Gold.copy(alpha = 0.12f) else Sx.Low).padding(10.dp),
                        horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(x.emoji, style = MaterialTheme.typography.headlineSmall, modifier = Modifier.then(if (x.earned) Modifier else Modifier.background(Color.Transparent)),
                            color = if (x.earned) Color.Unspecified else Color.White.copy(alpha = 0.3f))
                        Text(x.name, style = MaterialTheme.typography.labelMedium, color = if (x.earned) Color.White else Sx.InkFaint, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        if (!x.earned) {
                            Spacer(Modifier.height(4.dp))
                            LinearProgressIndicator(progress = { x.progress.toFloat() / maxOf(1, x.goal) }, Modifier.fillMaxWidth(), color = Sx.Gold, trackColor = Sx.Highest)
                            Text("${x.progress}/${x.goal}", style = MaterialTheme.typography.labelSmall, color = Sx.InkFaint)
                        }
                    }
                }
            }
        }
    }
}

// ── Phone notifications ──────────────────────────────────────────────────────

@Composable
fun NotificationsCard() {
    val s = session()
    val ctx = LocalContext.current
    var on by remember { mutableStateOf(s.prefs.notifications && Notifier.permitted(ctx)) }
    fun apply(v: Boolean) {
        s.prefs.notifications = v
        if (v) s.prefs.notifiedAt = null // start fresh, don't replay old items
        Notifier.enable(ctx, v)
        on = v
    }
    val ask = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) apply(true) else Toast.makeText(ctx, "Notifications are blocked for Streamix in Android settings", Toast.LENGTH_LONG).show()
    }
    GlassCard(Modifier.fillMaxWidth()) {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Notifications on this phone", style = MaterialTheme.typography.titleSmall, color = Color.White)
                Text("New episodes of your shows, reminders, new videos and announcements, as soon as they happen. Android shows a small silent “Listening” notification while this is on.",
                    style = MaterialTheme.typography.bodySmall, color = Sx.InkFaint)
            }
            Switch(on, { v ->
                if (v && Build.VERSION.SDK_INT >= 33 && !Notifier.permitted(ctx)) ask.launch(Manifest.permission.POST_NOTIFICATIONS) else apply(v)
            }, colors = SwitchDefaults.colors(checkedTrackColor = Sx.Scarlet, checkedThumbColor = Color.White))
        }
    }
}

// ── Downloads ────────────────────────────────────────────────────────────────

@Composable
fun DownloadsScreen(onBack: () -> Unit, onPlay: (String) -> Unit) {
    val s = session()
    val ctx = LocalContext.current
    LaunchedEffect(Unit) {
        Offline.manager(ctx, s.api)
        // Quick updates only while something is downloading
        while (true) { Offline.refresh(); delay(if (Offline.items.value.any { it.active }) 1000 else 4000) }
    }
    val items by Offline.items.collectAsState()
    var deleting by remember { mutableStateOf<OfflineItem?>(null) }
    val scope = rememberCoroutineScope()
    fun act(d: OfflineItem, block: suspend () -> Unit) = scope.launch {
        try { block() } catch (e: Throwable) { Toast.makeText(ctx, "${d.meta.title}: ${e.userMessage()}", Toast.LENGTH_LONG).show() }
    }
    deleting?.let { d ->
        AlertDialog(
            onDismissRequest = { deleting = null }, containerColor = Sx.Card,
            title = { Text("Delete this download?", color = Color.White) },
            text = { Text(d.meta.title, color = Sx.InkMuted) },
            confirmButton = { TextButton({ Offline.remove(ctx, d.id); deleting = null }) { Text("Delete", color = Sx.Scarlet) } },
            dismissButton = { TextButton({ deleting = null }) { Text("Cancel", color = Sx.Ink) } },
        )
    }
    Column(Modifier.fillMaxSize().background(Sx.Surface)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f)) { Header("Downloads", onBack) }
            val running = items.any { it.active }
            val pausedAny = items.any { it.paused }
            if (running) TextButton({ items.filter { it.active }.forEach { Offline.pause(ctx, it.id) } }, Modifier.padding(end = 8.dp)) { Text("Pause all", color = Sx.Ink) }
            else if (pausedAny) TextButton({ items.filter { it.paused }.forEach { d -> act(d) { Offline.resume(ctx, s.api, d.id) } } }, Modifier.padding(end = 8.dp)) { Text("Resume all", color = Sx.Cyan) }
        }
        if (items.isEmpty()) ErrorState("Nothing downloaded yet. Use the download button in the player on Streamix videos and anime streams — embeds can't be saved.")
        LazyColumn(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 40.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            items(items, key = { it.id }) { d ->
                Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Sx.Card).clickable(enabled = d.done) { onPlay(d.id) }.padding(10.dp),
                    verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.width(56.dp).aspectRatio(2f / 3f).clip(RoundedCornerShape(10.dp)).background(Sx.Void), contentAlignment = Alignment.Center) {
                        AsyncImage(d.meta.poster.ifBlank { null }, null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                        if (d.done) Icon(Icons.Filled.PlayArrow, "Play", tint = Color.White)
                    }
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(d.meta.title, style = MaterialTheme.typography.titleSmall, color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        if (d.meta.type == "tv") Text("S${d.meta.season} · E${d.meta.episode}${d.meta.episodeName?.let { " — $it" } ?: ""}",
                            style = MaterialTheme.typography.bodySmall, color = Sx.InkFaint, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Spacer(Modifier.height(4.dp))
                        when {
                            d.done -> Text("Ready to watch offline • ${d.bytes / 1_048_576} MB", style = MaterialTheme.typography.bodySmall, color = Sx.Cyan)
                            d.failed -> Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Filled.ErrorOutline, null, tint = Sx.Soft, modifier = Modifier.size(14.dp))
                                Text(" Stopped with an error — tap ↻ to try again", style = MaterialTheme.typography.bodySmall, color = Sx.Soft)
                            }
                            else -> {
                                LinearProgressIndicator(progress = { d.percent / 100f }, Modifier.fillMaxWidth(),
                                    color = if (d.paused) Sx.InkFaint else Sx.Scarlet, trackColor = Sx.Highest)
                                Text(when {
                                    d.paused -> "Paused · ${d.percent.toInt()}% · ${d.bytes / 1_048_576} MB saved"
                                    d.state == androidx.media3.exoplayer.offline.Download.STATE_QUEUED -> "Waiting… ${d.percent.toInt()}%"
                                    else -> "Downloading… ${d.percent.toInt()}%"
                                }, style = MaterialTheme.typography.bodySmall, color = Sx.InkFaint)
                            }
                        }
                    }
                    // Pause / resume (and retry after an error) — what's already saved is kept
                    when {
                        d.active -> IconButton(onClick = { Offline.pause(ctx, d.id) }) { Icon(Icons.Filled.Pause, "Pause download", tint = Color.White) }
                        d.paused -> IconButton(onClick = { act(d) { Offline.resume(ctx, s.api, d.id) } }) { Icon(Icons.Filled.PlayArrow, "Resume download", tint = Sx.Cyan) }
                        d.failed -> IconButton(onClick = { act(d) { Offline.retry(ctx, s.api, d.id) } }) { Icon(Icons.Filled.Refresh, "Try again", tint = Sx.Soft) }
                    }
                    IconButton(onClick = { deleting = d }) { Icon(Icons.Filled.Delete, "Delete", tint = Sx.InkFaint) }
                }
            }
        }
    }
}

/** Download button for the player header: saves a Streamix file or a direct HLS stream */
@Composable
fun DownloadButton(id: String, start: suspend () -> Unit) {
    val ctx = LocalContext.current
    val s = session()
    val scope = rememberCoroutineScope()
    LaunchedEffect(Unit) { Offline.manager(ctx, s.api); Offline.refresh() }
    val items by Offline.items.collectAsState()
    val existing = items.firstOrNull { it.id == id }
    var busy by remember { mutableStateOf(false) }
    IconButton(enabled = existing == null && !busy, onClick = {
        busy = true
        scope.launch {
            try { start(); Toast.makeText(ctx, "Downloading — see Downloads in My List", Toast.LENGTH_SHORT).show() }
            catch (e: Throwable) { Toast.makeText(ctx, e.userMessage(), Toast.LENGTH_LONG).show() }
            busy = false
        }
    }) {
        Icon(Icons.Filled.Download, if (existing != null) "Downloaded" else "Download",
            tint = when { existing?.done == true -> Sx.Cyan; existing != null || busy -> Sx.Gold; else -> Color.White })
    }
}

// ── Join a watch party by code ───────────────────────────────────────────────

@Composable
fun JoinPartyDialog(onDismiss: () -> Unit, onJoined: () -> Unit) {
    val s = session()
    val profile by s.activeProfile.collectAsState()
    var code by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    val error by s.party.error.collectAsState()
    val joined by s.party.code.collectAsState()
    LaunchedEffect(joined) { if (busy && joined != null) onJoined() }
    LaunchedEffect(error) { if (error != null) busy = false }
    AlertDialog(
        onDismissRequest = { s.party.clearError(); onDismiss() }, containerColor = Sx.Card,
        title = { Text("Join a watch party", color = Color.White) },
        text = {
            Column {
                Text("Enter the 6-letter code from the host's invite.", color = Sx.InkMuted, style = MaterialTheme.typography.bodySmall)
                Spacer(Modifier.height(8.dp))
                Field(code, { code = it.uppercase().filter(Char::isLetterOrDigit).take(6) }, "Code")
                error?.let { Text(it, color = Sx.Soft, style = MaterialTheme.typography.bodySmall) }
            }
        },
        confirmButton = {
            TextButton({ busy = true; s.party.clearError(); s.party.join(code, profile) }, enabled = code.length == 6 && !busy) {
                Text(if (busy) "Joining…" else "Join", color = if (code.length == 6) Sx.Scarlet else Sx.InkFaint)
            }
        },
        dismissButton = { TextButton({ s.party.clearError(); onDismiss() }) { Text("Cancel", color = Sx.Ink) } },
    )
}

/** Kids-profile rows in Account get a "Controls" button */
@Composable
fun KidsControlsButton(p: Profile, onOpen: (String) -> Unit) {
    if (p.isKids) TextButton({ onOpen(p.id) }) { Text("Controls", color = Sx.Gold) }
}
