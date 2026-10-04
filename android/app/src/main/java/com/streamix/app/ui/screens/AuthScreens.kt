package com.streamix.app.ui.screens

import com.streamix.app.data.TwoFactorRequired
import com.streamix.app.data.EmailVerificationRequired
import com.streamix.app.data.ApiException
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.offset
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
import androidx.compose.material.icons.filled.AlternateEmail
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Dns
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.RadioButtonUnchecked
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.streamix.app.ui.components.GlassCard
import com.streamix.app.ui.components.PrimaryButton
import com.streamix.app.ui.components.session
import com.streamix.app.ui.theme.Sx
import com.streamix.app.ui.userMessage
import kotlinx.coroutines.launch

@Composable
fun Wordmark(size: Int = 26) {
    Text(
        buildAnnotatedString {
            append("STREAM")
            withStyle(SpanStyle(color = Sx.Scarlet)) { append("IX") }
        },
        fontSize = size.sp, fontWeight = FontWeight.ExtraBold, color = Color.White, letterSpacing = (-0.5).sp,
    )
}

@Composable
private fun AuthShell(badge: String, title: String, subtitle: String, content: @Composable () -> Unit) {
    Box(Modifier.fillMaxSize().background(Sx.Surface)) {
        Box(Modifier.size(320.dp).offset(40.dp, (-80).dp).blur(90.dp).clip(CircleShape).background(Sx.Scarlet.copy(alpha = 0.25f)))
        Column(
            Modifier.fillMaxSize().statusBarsPadding().imePadding().verticalScroll(rememberScrollState()).padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.height(40.dp))
            Wordmark()
            Spacer(Modifier.height(22.dp))
            Text(badge.uppercase(), style = MaterialTheme.typography.labelSmall, color = Sx.InkMuted,
                modifier = Modifier.clip(CircleShape).background(Sx.High).padding(horizontal = 12.dp, vertical = 5.dp))
            Spacer(Modifier.height(12.dp))
            Text(title, style = MaterialTheme.typography.headlineMedium, color = Color.White)
            Spacer(Modifier.height(6.dp))
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = Sx.InkMuted, textAlign = TextAlign.Center,
                modifier = Modifier.padding(horizontal = 24.dp))
            Spacer(Modifier.height(24.dp))
            GlassCard(Modifier.fillMaxWidth()) { Column(Modifier.padding(18.dp)) { content() } }
        }
    }
}

@Composable
fun Field(
    label: String, value: String, onChange: (String) -> Unit, icon: ImageVector,
    password: Boolean = false, keyboard: KeyboardType = KeyboardType.Text, placeholder: String = "",
) {
    var shown by remember { mutableStateOf(false) }
    Text(label, style = MaterialTheme.typography.labelMedium, color = Sx.Ink)
    Spacer(Modifier.height(6.dp))
    OutlinedTextField(
        value = value, onValueChange = onChange, singleLine = true,
        leadingIcon = { Icon(icon, null, tint = Sx.InkFaint) },
        trailingIcon = if (password) {
            { IconButton(onClick = { shown = !shown }) { Icon(if (shown) Icons.Filled.VisibilityOff else Icons.Filled.Visibility, if (shown) "Hide password" else "Show password", tint = Sx.InkFaint) } }
        } else null,
        placeholder = { Text(placeholder, color = Sx.InkFaint) },
        visualTransformation = if (password && !shown) PasswordVisualTransformation() else VisualTransformation.None,
        keyboardOptions = KeyboardOptions(keyboardType = if (password) KeyboardType.Password else keyboard),
        shape = RoundedCornerShape(14.dp),
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = Sx.Scarlet, unfocusedBorderColor = Color.White.copy(alpha = 0.08f),
            focusedContainerColor = Sx.Low, unfocusedContainerColor = Sx.Low, cursorColor = Sx.Scarlet,
            focusedTextColor = Color.White, unfocusedTextColor = Color.White,
        ),
        modifier = Modifier.fillMaxWidth(),
    )
    Spacer(Modifier.height(14.dp))
}

@Composable
private fun ErrorLine(msg: String?) {
    if (msg == null) return
    Text(msg, color = Sx.Soft, style = MaterialTheme.typography.bodySmall,
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Sx.Scarlet.copy(alpha = 0.12f)).padding(12.dp))
    Spacer(Modifier.height(14.dp))
}

/** First run: where is the Streamix server? */
@Composable
fun ServerScreen() {
    val s = session()
    val scope = rememberCoroutineScope()
    var url by remember { mutableStateOf("http://192.168.1.") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    AuthShell("Connect", "Find your server", "Enter the address of the computer running Streamix (npm run dev / npm start). On the Android emulator use http://10.0.2.2:5000.") {
        ErrorLine(error)
        Field("Server address", url, { url = it; error = null }, Icons.Filled.Dns, keyboard = KeyboardType.Uri, placeholder = "http://192.168.1.20:5000")
        PrimaryButton("Connect", Modifier.fillMaxWidth(), loading = busy) {
            val clean = url.trim().trimEnd('/').let { if (it.startsWith("http")) it else "http://$it" }
            busy = true
            scope.launch {
                if (s.api.ping(clean)) s.setServer(clean)
                else error = "No Streamix server answered at $clean. Check the address, that the server is running, and that your phone is on the same Wi-Fi."
                busy = false
            }
        }
    }
}

@Composable
fun LoginScreen(onRegister: () -> Unit) {
    val s = session()
    val scope = rememberCoroutineScope()
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var challenge by remember { mutableStateOf<String?>(null) }
    var code by remember { mutableStateOf("") }
    var verifying by remember { mutableStateOf<EmailVerificationRequired?>(null) }

    // Email not confirmed yet → enter the emailed code
    verifying?.let { v -> EmailCodeStep(v, onBack = { verifying = null; error = null }); return }

    // Second step for accounts with two-factor sign-in
    challenge?.let { ch ->
        AuthShell("Two-factor sign-in", "Enter your code", "Type the 6-digit code from your authenticator app, or a backup code.") {
            ErrorLine(error)
            Field("Code", code, { code = it.take(12) }, Icons.Filled.Lock, keyboard = KeyboardType.Number, placeholder = "123456")
            PrimaryButton("Verify", Modifier.fillMaxWidth(), loading = busy, enabled = code.trim().length >= 6) {
                busy = true; error = null
                scope.launch {
                    runCatching { s.verifyTwoFactor(ch, code) }.onFailure {
                        error = it.userMessage()
                        if ((it as? ApiException)?.code == 401 && (it.message ?: "").contains("again", true)) challenge = null
                    }
                    busy = false
                }
            }
            Spacer(Modifier.height(12.dp))
            Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                Text("Back to sign in", color = Sx.Soft, style = MaterialTheme.typography.labelMedium,
                    modifier = Modifier.clickableText { challenge = null; error = null })
            }
        }
        return
    }

    AuthShell("Welcome back", "Sign in", "Your list, history and profiles sync across devices.") {
        ErrorLine(error)
        Field("Email", email, { email = it }, Icons.Filled.AlternateEmail, keyboard = KeyboardType.Email, placeholder = "name@domain.com")
        Field("Password", password, { password = it }, Icons.Filled.Lock, password = true)
        PrimaryButton("Sign in", Modifier.fillMaxWidth(), loading = busy, enabled = email.isNotBlank() && password.isNotBlank()) {
            busy = true; error = null
            scope.launch {
                runCatching { s.login(email, password) }.onFailure {
                    when (it) {
                        is TwoFactorRequired -> { challenge = it.challenge; code = "" }
                        is EmailVerificationRequired -> verifying = it
                        else -> error = it.userMessage()
                    }
                }
                busy = false
            }
        }
        Spacer(Modifier.height(16.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
            Text("New to Streamix? ", color = Sx.InkMuted, style = MaterialTheme.typography.bodySmall)
            Text("Create an account", color = Sx.Soft, style = MaterialTheme.typography.labelMedium,
                modifier = Modifier.clickableText(onRegister))
        }
        Spacer(Modifier.height(8.dp))
        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
            Text("Change server", color = Sx.InkFaint, style = MaterialTheme.typography.labelMedium,
                modifier = Modifier.clickableText { s.changeServer() })
        }
    }
}

private val RULES: List<Pair<String, (String) -> Boolean>> = listOf(
    "8+ characters" to { p -> p.length >= 8 },
    "Uppercase" to { p -> p.any { it.isUpperCase() } },
    "Number" to { p -> p.any { it.isDigit() } },
    "Symbol" to { p -> p.any { !it.isLetterOrDigit() } },
)

@Composable
fun RegisterScreen(onBack: () -> Unit) {
    val s = session()
    val scope = rememberCoroutineScope()
    var username by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var verifying by remember { mutableStateOf<EmailVerificationRequired?>(null) }
    // "Did you mean ann@gmail.com?" from the server's email check
    val suggestion = error?.let { Regex("^Did you mean (\\S+@\\S+?)\\?$").find(it)?.groupValues?.get(1) }

    verifying?.let { v -> EmailCodeStep(v, onBack = { verifying = null; error = null }); return }

    fun submit(confirmTypo: Boolean) {
        busy = true; error = null
        scope.launch {
            runCatching { s.register(username, email, password, confirmTypo) }.onFailure {
                if (it is EmailVerificationRequired) verifying = it else error = it.userMessage()
            }
            busy = false
        }
    }

    AuthShell("Free account", "Create your account", "Save titles, resume on any device, and set up profiles for the household.") {
        ErrorLine(error)
        Field("Username", username, { username = it }, Icons.Filled.Person, placeholder = "cinephile_42")
        Field("Email", email, { email = it }, Icons.Filled.AlternateEmail, keyboard = KeyboardType.Email, placeholder = "name@domain.com")
        Field("Password", password, { password = it }, Icons.Filled.Lock, password = true)
        if (password.isNotEmpty()) {
            Row(Modifier.fillMaxWidth().padding(bottom = 14.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                RULES.forEach { (label, ok) ->
                    val pass = ok(password)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(if (pass) Icons.Filled.CheckCircle else Icons.Filled.RadioButtonUnchecked, null, Modifier.size(13.dp), tint = if (pass) Sx.Cyan else Sx.InkFaint)
                        Spacer(Modifier.width(3.dp))
                        Text(label, fontSize = 11.sp, color = if (pass) Sx.Cyan else Sx.InkFaint)
                    }
                }
            }
        }
        val valid = Regex("^[a-zA-Z0-9_]{3,30}$").matches(username) && email.contains('@') && RULES.all { it.second(password) }
        if (suggestion != null) {
            Row(Modifier.fillMaxWidth().padding(bottom = 12.dp), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                Text("Use $suggestion", color = Sx.Gold, style = MaterialTheme.typography.labelMedium,
                    modifier = Modifier.clickableText { email = suggestion; error = null })
                Text("It’s correct", color = Sx.InkMuted, style = MaterialTheme.typography.labelMedium,
                    modifier = Modifier.clickableText { submit(confirmTypo = true) })
            }
        }
        PrimaryButton("Create account", Modifier.fillMaxWidth(), loading = busy, enabled = valid) { submit(confirmTypo = false) }
        Spacer(Modifier.height(16.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
            Text("Already have an account? ", color = Sx.InkMuted, style = MaterialTheme.typography.bodySmall)
            Text("Sign in", color = Sx.Soft, style = MaterialTheme.typography.labelMedium, modifier = Modifier.clickableText(onBack))
        }
    }
}

fun Modifier.clickableText(onClick: () -> Unit): Modifier =
    this.clip(CircleShape).clickable(onClick = onClick).padding(4.dp)

/** "Check your email": the 6-digit code from sign-up (or from signing in before confirming) */
@Composable
private fun EmailCodeStep(v: EmailVerificationRequired, onBack: () -> Unit) {
    val s = session()
    val scope = rememberCoroutineScope()
    var code by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf(v.sendError) }
    var note by remember { mutableStateOf(if (!v.sent && v.sendError == null) "We already sent you a code — check your inbox and spam." else null) }
    var wait by remember { mutableStateOf(v.resendIn) }
    LaunchedEffect(wait) { if (wait > 0) { kotlinx.coroutines.delay(1000); wait -= 1 } }

    fun verify() {
        if (code.length != 6 || busy) return
        busy = true; error = null; note = null
        scope.launch {
            runCatching { s.verifyEmail(v.ticket, code) }.onFailure {
                error = it.userMessage(); code = ""
                if ((it as? ApiException)?.code == 401) { kotlinx.coroutines.delay(2000); onBack() }
            }
            busy = false
        }
    }

    AuthShell("One last step", "Check your email", "We sent a 6-digit code to ${v.email}. It works for 15 minutes.") {
        ErrorLine(error)
        note?.let { Text(it, color = Sx.Cyan, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(bottom = 10.dp)) }
        Field("Code", code, { t -> code = t.filter { it.isDigit() }.take(6); if (code.length == 6) verify() },
            Icons.Filled.Lock, keyboard = KeyboardType.NumberPassword, placeholder = "123456")
        PrimaryButton("Confirm email", Modifier.fillMaxWidth(), loading = busy, enabled = code.length == 6) { verify() }
        Spacer(Modifier.height(14.dp))
        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
            Text(if (wait > 0) "Send a new code in ${wait}s" else "Send a new code",
                color = if (wait > 0) Sx.InkFaint else Sx.Soft, style = MaterialTheme.typography.labelMedium,
                modifier = Modifier.clickableText {
                    if (wait > 0 || busy) return@clickableText
                    busy = true; error = null
                    scope.launch {
                        runCatching { s.api.resendEmailCode(v.ticket) }
                            .onSuccess { wait = it; note = "New code sent to ${v.email}"; code = "" }
                            .onFailure { error = it.userMessage() }
                        busy = false
                    }
                })
        }
        Spacer(Modifier.height(6.dp))
        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
            Text("Use a different email", color = Sx.InkMuted, style = MaterialTheme.typography.labelMedium, modifier = Modifier.clickableText(onBack))
        }
    }
}
