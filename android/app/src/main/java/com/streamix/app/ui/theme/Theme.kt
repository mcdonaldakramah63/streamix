package com.streamix.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.streamix.app.R

class AccentTheme(val label: String, val brand: Color, val light: Color, val soft: Color)

val THEMES = linkedMapOf(
    "scarlet" to AccentTheme("Scarlet", Color(0xFFE50914), Color(0xFFFF3366), Color(0xFFFFB4AA)),
    "ocean" to AccentTheme("Ocean", Color(0xFF0E84FF), Color(0xFF4DA6FF), Color(0xFFAAD2FF)),
    "violet" to AccentTheme("Violet", Color(0xFF8B5CF6), Color(0xFFA78BFA), Color(0xFFDDD6FE)),
    "emerald" to AccentTheme("Emerald", Color(0xFF10B981), Color(0xFF34D399), Color(0xFFA7F3D0)),
    "sunset" to AccentTheme("Sunset", Color(0xFFF97316), Color(0xFFFB923C), Color(0xFFFED7AA)),
    "rose" to AccentTheme("Rose", Color(0xFFEC4899), Color(0xFFF472B6), Color(0xFFFBCFE8)),
)

// Obsidian Cinema — from the Stitch "Movie Stream Tracker" design system
object Sx {
    val Void      = Color(0xFF0A0E17)
    val Surface   = Color(0xFF0F131C)
    val Low       = Color(0xFF181B25)
    val Card      = Color(0xFF1C2029)
    val High      = Color(0xFF262A34)
    val Highest   = Color(0xFF31353F)
    // Accent colours follow the active profile's theme (same palette as the web app)
    private val accent = androidx.compose.runtime.mutableStateOf(THEMES.getValue("scarlet"))
    val Scarlet: Color get() = accent.value.brand
    val Neon: Color get() = accent.value.light
    val Soft: Color get() = accent.value.soft
    fun applyTheme(name: String?) { accent.value = THEMES[name] ?: THEMES.getValue("scarlet") }
    val Gold      = Color(0xFFF59E0B)
    val Cyan      = Color(0xFF4CD7F6)
    val Ink       = Color(0xFFDFE2EF)
    val InkMuted  = Color(0xFF94A3B8)
    val InkFaint  = Color(0xFF64748B)
}

@OptIn(ExperimentalTextApi::class)
private fun jakarta(weight: Int) = Font(
    R.font.plus_jakarta_sans,
    FontWeight(weight),
    variationSettings = FontVariation.Settings(FontVariation.weight(weight)),
)

val Jakarta = FontFamily(jakarta(400), jakarta(500), jakarta(600), jakarta(700), jakarta(800))

private val SxTypography = Typography(
    displaySmall   = TextStyle(fontFamily = Jakarta, fontWeight = FontWeight.ExtraBold, fontSize = 34.sp, letterSpacing = (-0.025).em),
    headlineMedium = TextStyle(fontFamily = Jakarta, fontWeight = FontWeight.ExtraBold, fontSize = 26.sp, letterSpacing = (-0.02).em),
    headlineSmall  = TextStyle(fontFamily = Jakarta, fontWeight = FontWeight.Bold, fontSize = 22.sp, letterSpacing = (-0.015).em),
    titleLarge     = TextStyle(fontFamily = Jakarta, fontWeight = FontWeight.Bold, fontSize = 20.sp, letterSpacing = (-0.01).em),
    titleMedium    = TextStyle(fontFamily = Jakarta, fontWeight = FontWeight.Bold, fontSize = 16.sp),
    titleSmall     = TextStyle(fontFamily = Jakarta, fontWeight = FontWeight.Bold, fontSize = 13.sp),
    bodyLarge      = TextStyle(fontFamily = Jakarta, fontWeight = FontWeight.Normal, fontSize = 16.sp, lineHeight = 24.sp),
    bodyMedium     = TextStyle(fontFamily = Jakarta, fontWeight = FontWeight.Normal, fontSize = 14.sp, lineHeight = 21.sp),
    bodySmall      = TextStyle(fontFamily = Jakarta, fontWeight = FontWeight.Normal, fontSize = 12.sp, lineHeight = 17.sp),
    labelLarge     = TextStyle(fontFamily = Jakarta, fontWeight = FontWeight.Bold, fontSize = 14.sp),
    labelMedium    = TextStyle(fontFamily = Jakarta, fontWeight = FontWeight.SemiBold, fontSize = 12.sp, letterSpacing = 0.02.em),
    // "tech-pill": uppercase spec badges
    labelSmall     = TextStyle(fontFamily = Jakarta, fontWeight = FontWeight.ExtraBold, fontSize = 10.sp, letterSpacing = 0.08.em),
)

@Composable
fun StreamixTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = Sx.Scarlet, onPrimary = Color.White,
            secondary = Sx.Gold, onSecondary = Sx.Void,
            tertiary = Sx.Cyan, onTertiary = Sx.Void,
            background = Sx.Surface, onBackground = Sx.Ink,
            surface = Sx.Surface, onSurface = Sx.Ink,
            surfaceVariant = Sx.Card, onSurfaceVariant = Sx.InkMuted,
            surfaceContainer = Sx.Card, surfaceContainerHigh = Sx.High, surfaceContainerHighest = Sx.Highest,
            outline = Sx.Highest, error = Sx.Soft,
        ),
        typography = SxTypography,
        content = content,
    )
}
