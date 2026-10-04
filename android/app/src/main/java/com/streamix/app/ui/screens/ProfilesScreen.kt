package com.streamix.app.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.streamix.app.data.Profile
import com.streamix.app.ui.components.GlassButton
import com.streamix.app.ui.components.PinDialog
import com.streamix.app.ui.components.PrimaryButton
import com.streamix.app.ui.components.ProfileBadge
import com.streamix.app.ui.components.parseColor
import com.streamix.app.ui.components.session
import com.streamix.app.ui.theme.Sx
import com.streamix.app.ui.userMessage
import kotlinx.coroutines.launch

val AVATARS = listOf("🎬", "🍿", "🚀", "🎮", "🎧", "⚡", "🌊", "🔥", "🦁", "🐼", "🦊", "🐶", "🌸", "⭐", "🍕", "🎸", "🧙", "👻")
val COLORS = listOf("#e50914", "#ff3366", "#f59e0b", "#06b6d4", "#8b5cf6", "#10b981", "#3b82f6", "#ec4899")

/** Picks a profile, asking for its PIN when it has one. Shared by the picker and Account screen. */
@Composable
fun rememberProfileSwitcher(onSwitched: (Profile) -> Unit = {}): (Profile) -> Unit {
    val s = session()
    var pinFor by remember { mutableStateOf<Profile?>(null) }
    pinFor?.let { p ->
        PinDialog("Unlock ${p.name}", "This profile is protected with a PIN",
            onSubmit = { pin ->
                runCatching { s.verifyAndActivate(p, pin) }.fold(
                    onSuccess = { pinFor = null; onSwitched(p); null },
                    onFailure = { it.userMessage() },
                )
            },
            onDismiss = { pinFor = null })
    }
    return { p ->
        if (p.hasPin && !p.isKids) pinFor = p
        else { s.activate(p); onSwitched(p) }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ProfilesScreen() {
    val s = session()
    val scope = rememberCoroutineScope()
    val profiles by s.profiles.collectAsState()
    var creating by remember { mutableStateOf(false) }
    val switch = rememberProfileSwitcher()

    if (creating) CreateProfileDialog(onDismiss = { creating = false }, onCreated = { creating = false; switch(it) })

    Column(
        Modifier.fillMaxSize().background(Sx.Surface).statusBarsPadding().verticalScroll(rememberScrollState()).padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.height(40.dp))
        Wordmark(22)
        Spacer(Modifier.height(40.dp))
        Text("Who's watching?", style = MaterialTheme.typography.displaySmall, color = Color.White)
        Spacer(Modifier.height(6.dp))
        Text("Choose a profile to continue", style = MaterialTheme.typography.bodyMedium, color = Sx.InkMuted)
        Spacer(Modifier.height(36.dp))

        FlowRow(horizontalArrangement = Arrangement.spacedBy(22.dp, Alignment.CenterHorizontally), verticalArrangement = Arrangement.spacedBy(22.dp)) {
            profiles.forEach { p ->
                Column(Modifier.clip(RoundedCornerShape(16.dp)).clickable { switch(p) }.padding(6.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    ProfileBadge(p.avatar, p.color, 96.dp, p.isKids)
                    Spacer(Modifier.height(10.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(p.name, style = MaterialTheme.typography.titleSmall, color = Sx.Ink)
                        if (p.hasPin) { Spacer(Modifier.width(4.dp)); Icon(Icons.Filled.Lock, "PIN protected", Modifier.size(13.dp), tint = Sx.InkFaint) }
                    }
                }
            }
            if (profiles.size < 5) {
                Column(Modifier.clip(RoundedCornerShape(16.dp)).clickable { creating = true }.padding(6.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Box(
                        Modifier.size(96.dp).clip(RoundedCornerShape(24.dp)).border(2.dp, Color.White.copy(alpha = 0.15f), RoundedCornerShape(24.dp)),
                        contentAlignment = Alignment.Center,
                    ) { Icon(Icons.Filled.Add, null, Modifier.size(38.dp), tint = Sx.InkFaint) }
                    Spacer(Modifier.height(10.dp))
                    Text("Add profile", style = MaterialTheme.typography.titleSmall, color = Sx.InkFaint)
                }
            }
        }
        Spacer(Modifier.height(40.dp))
        GlassButton("Sign out", Icons.AutoMirrored.Filled.Logout) { scope.launch { s.signOut() } }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun CreateProfileDialog(onDismiss: () -> Unit, onCreated: (Profile) -> Unit) {
    val s = session()
    val scope = rememberCoroutineScope()
    var name by remember { mutableStateOf("") }
    var avatar by remember { mutableStateOf(AVATARS.random()) }
    var color by remember { mutableStateOf(COLORS.first()) }
    var kids by remember { mutableStateOf(false) }
    var pin by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    val fieldColors = OutlinedTextFieldDefaults.colors(
        focusedBorderColor = Sx.Scarlet, unfocusedBorderColor = Color.White.copy(alpha = 0.08f),
        focusedContainerColor = Sx.Low, unfocusedContainerColor = Sx.Low, cursorColor = Sx.Scarlet,
        focusedTextColor = Color.White, unfocusedTextColor = Color.White,
    )

    Dialog(onDismissRequest = onDismiss) {
        Surface(shape = RoundedCornerShape(28.dp), color = Sx.Card, border = BorderStroke(1.dp, Color.White.copy(alpha = 0.08f))) {
            Column(Modifier.verticalScroll(rememberScrollState()).padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Text("New profile", style = MaterialTheme.typography.titleLarge, color = Color.White)
                Spacer(Modifier.height(14.dp))
                ProfileBadge(avatar, color, 84.dp, kids)
                Spacer(Modifier.height(16.dp))
                OutlinedTextField(name, { name = it.take(30) }, singleLine = true, placeholder = { Text("Name", color = Sx.InkFaint) },
                    shape = RoundedCornerShape(14.dp), colors = fieldColors, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(14.dp))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    AVATARS.forEach { a ->
                        Box(
                            Modifier.size(38.dp).clip(RoundedCornerShape(12.dp))
                                .background(if (a == avatar) Sx.Scarlet.copy(alpha = 0.25f) else Color.White.copy(alpha = 0.05f))
                                .clickable { avatar = a },
                            contentAlignment = Alignment.Center,
                        ) { Text(a, fontSize = 18.sp) }
                    }
                }
                Spacer(Modifier.height(12.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    COLORS.forEach { c ->
                        Box(
                            Modifier.size(if (c == color) 30.dp else 26.dp).clip(CircleShape).background(parseColor(c))
                                .border(if (c == color) 2.dp else 0.dp, Color.White, CircleShape).clickable { color = c },
                        )
                    }
                }
                Spacer(Modifier.height(14.dp))
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("Kids profile", style = MaterialTheme.typography.titleSmall, color = Color.White)
                        Text("Family-friendly titles only", style = MaterialTheme.typography.bodySmall, color = Sx.InkFaint)
                    }
                    Switch(kids, { kids = it }, colors = SwitchDefaults.colors(checkedTrackColor = Sx.Scarlet))
                }
                if (!kids) {
                    Spacer(Modifier.height(10.dp))
                    OutlinedTextField(pin, { v -> pin = v.filter { it.isDigit() }.take(4) }, singleLine = true,
                        placeholder = { Text("PIN (optional, 4 digits)", color = Sx.InkFaint) },
                        visualTransformation = PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                        shape = RoundedCornerShape(14.dp), colors = fieldColors, modifier = Modifier.fillMaxWidth())
                }
                error?.let { Spacer(Modifier.height(10.dp)); Text(it, color = Sx.Soft, style = MaterialTheme.typography.bodySmall, textAlign = TextAlign.Center) }
                Spacer(Modifier.height(18.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    GlassButton("Cancel", null, Modifier.weight(1f), onClick = onDismiss)
                    PrimaryButton("Create", Modifier.weight(1f), loading = busy,
                        enabled = name.isNotBlank() && (kids || pin.isEmpty() || pin.length == 4)) {
                        busy = true; error = null
                        scope.launch {
                            runCatching { s.createProfile(name.trim(), avatar, color, kids, if (kids) null else pin.ifEmpty { null }) }
                                .onSuccess(onCreated).onFailure { error = it.userMessage() }
                            busy = false
                        }
                    }
                }
            }
        }
    }
}
