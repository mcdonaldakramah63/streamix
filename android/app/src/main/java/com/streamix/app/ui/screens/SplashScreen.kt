package com.streamix.app.ui.screens

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Download
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.streamix.app.ui.components.GlassButton
import com.streamix.app.ui.components.PrimaryButton
import com.streamix.app.ui.theme.Sx

private val ICON_BG = Color(0xFF141A26)

/** The Streamix prism mark (same S + play glyph as the launcher icon and web logo) */
@Composable
fun PrismMark(modifier: Modifier = Modifier) {
    val s = remember { PathParser().parsePathString("M30,15.5c-1.6,-1.7 -4.2,-2.5 -7,-2.5 -4,0 -7,2 -7,5.2 0,7.3 14.5,3.6 14.5,10.7 0,3.3 -3.1,5.6 -7.6,5.6 -3,0 -5.8,-1 -7.5,-2.9").toPath() }
    Canvas(modifier) {
        // The glyph lives in the 10..34 box of a 44-unit grid
        val k = size.minDimension / 24f
        val path = Path().apply { addPath(s, Offset(-10f, -10f)) }
        scale(k, k, pivot = Offset.Zero) {
            drawPath(path, Brush.linearGradient(
                0.3f to Color(0xFFFF3366), 0.5f to Color(0xFFE50914), 0.75f to Color(0xFFF59E0B),
                start = Offset(-10f, -10f), end = Offset(34f, 34f),
            ), style = Stroke(width = 3.2f, cap = StrokeCap.Round))
            drawPath(Path().apply { moveTo(10f, 9.5f); lineTo(15f, 12f); lineTo(10f, 14.5f); close() }, Color(0xFFF59E0B))
        }
    }
}

/**
 * The app's splash (Claude Design "Streamix Splash Screen", frames 2 and 3): continues from the system
 * launch frame while the server and profiles load. [unreachable] switches to the "can't reach your
 * server" state with Try again / Watch downloads / Change server.
 */
@Composable
fun SplashScreen(
    serverLabel: String?,
    unreachable: Boolean,
    onRetry: () -> Unit,
    onDownloads: () -> Unit,
    onChangeServer: () -> Unit,
) {
    // Wordmark fades up 12 px once (300 ms); the glow breathes; the bar loops while connecting
    val reveal = remember { Animatable(0f) }
    LaunchedEffect(Unit) { reveal.animateTo(1f, tween(300, delayMillis = 120)) }
    val loop = rememberInfiniteTransition(label = "splash")
    val glow by loop.animateFloat(0.85f, 1.1f, infiniteRepeatable(tween(1800), RepeatMode.Reverse), label = "glow")
    val bar by loop.animateFloat(0f, 1f, infiniteRepeatable(tween(1100, easing = LinearEasing)), label = "bar")

    Box(Modifier.fillMaxSize().background(Sx.Void)) {
        Box(Modifier.align(Alignment.Center).offset(y = (-40).dp).size(320.dp).scale(glow).alpha(if (unreachable) 0.5f else 1f)
            .background(Brush.radialGradient(listOf(Color(0x47E50914), Color(0x14E50914), Color.Transparent))))
        Column(Modifier.align(Alignment.Center).offset(y = (-40).dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Box(Modifier.size(112.dp).alpha(if (unreachable) 0.7f else 1f).clip(RoundedCornerShape(30.dp)).background(ICON_BG)
                .border(1.dp, Color.White.copy(alpha = 0.06f), RoundedCornerShape(30.dp)), contentAlignment = Alignment.Center) {
                PrismMark(Modifier.size(72.dp))
            }
            Spacer(Modifier.height(28.dp))
            Column(Modifier.alpha(reveal.value).offset(y = (12 * (1 - reveal.value)).dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Wordmark(34)
                if (!unreachable) {
                    Spacer(Modifier.height(8.dp))
                    Text("YOUR MOVIES, YOUR SERVER", style = MaterialTheme.typography.labelMedium, color = Sx.InkMuted)
                }
            }
        }

        if (!unreachable) Column(Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(bottom = 72.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Box(Modifier.width(140.dp).height(4.dp).clip(CircleShape).background(Sx.High)) {
                Box(Modifier.offset(x = (140 * bar - 50).dp).width(80.dp).height(4.dp).clip(CircleShape)
                    .background(Brush.horizontalGradient(listOf(Sx.Scarlet, Sx.Gold))))
            }
            serverLabel?.let {
                Spacer(Modifier.height(14.dp))
                Text("Connecting to $it", style = MaterialTheme.typography.bodySmall, color = Sx.InkMuted)
            }
        } else Column(Modifier.align(Alignment.BottomCenter).fillMaxWidth().navigationBarsPadding().padding(horizontal = 24.dp).padding(bottom = 40.dp),
            horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Can't reach your server", style = MaterialTheme.typography.titleMedium, color = Color.White)
            Text("Make sure the computer running Streamix is on and this phone is on the same Wi-Fi.",
                style = MaterialTheme.typography.bodySmall, color = Sx.InkMuted, textAlign = TextAlign.Center)
            Spacer(Modifier.height(4.dp))
            PrimaryButton("Try again", Modifier.fillMaxWidth(), onClick = onRetry)
            GlassButton("Watch downloads", Icons.Filled.Download, Modifier.fillMaxWidth(), onClick = onDownloads)
            TextButton(onChangeServer) { Text("Change server", color = Sx.Soft) }
        }
    }
}
