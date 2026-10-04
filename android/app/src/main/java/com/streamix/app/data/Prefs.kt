package com.streamix.app.data

import android.content.Context
import kotlinx.serialization.json.Json
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull

val AppJson = Json {
    ignoreUnknownKeys = true
    coerceInputValues = true
    explicitNulls = false
    isLenient = true
}

/** Small persisted settings: server address, signed-in user, active profile, cookies */
class Prefs(context: Context) {
    private val sp = context.getSharedPreferences("streamix", Context.MODE_PRIVATE)

    var serverUrl: String?
        get() = sp.getString("server", null)
        set(v) = sp.edit().putString("server", v?.trim()?.trimEnd('/')).apply()

    var user: User?
        get() = sp.getString("user", null)?.let { runCatching { AppJson.decodeFromString(User.serializer(), it) }.getOrNull() }
        set(v) = sp.edit().putString("user", v?.let { AppJson.encodeToString(User.serializer(), it) }).apply()

    var activeProfile: Profile?
        get() = sp.getString("profile", null)?.let { runCatching { AppJson.decodeFromString(Profile.serializer(), it) }.getOrNull() }
        set(v) = sp.edit().putString("profile", v?.let { AppJson.encodeToString(Profile.serializer(), it) }).apply()

    /** Phone notifications for the bell (background inbox check) */
    var notifications: Boolean
        get() = sp.getBoolean("notifications", false)
        set(v) = sp.edit().putBoolean("notifications", v).apply()

    /** createdAt of the newest inbox item already shown as a notification */
    var notifiedAt: String?
        get() = sp.getString("notifiedAt", null)
        set(v) = sp.edit().putString("notifiedAt", v).apply()

    internal fun loadCookies(): Set<String> = sp.getStringSet("cookies", emptySet()) ?: emptySet()
    internal fun saveCookies(v: Set<String>) = sp.edit().putStringSet("cookies", v).apply()
}

/**
 * Keeps the backend's HttpOnly refresh cookie across app restarts,
 * so a 15-minute access token can be renewed for 30 days without signing in again.
 */
class PersistentCookieJar(private val prefs: Prefs) : CookieJar {
    private val cookies = mutableMapOf<String, Cookie>()

    init {
        prefs.loadCookies().forEach { line ->
            val url = line.substringBefore('\n').toHttpUrlOrNull() ?: return@forEach
            val cookie = Cookie.parse(url, line.substringAfter('\n')) ?: return@forEach
            if (cookie.expiresAt > System.currentTimeMillis()) cookies[key(cookie)] = cookie
        }
    }

    private fun key(c: Cookie) = "${c.domain}|${c.path}|${c.name}"

    @Synchronized
    override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
        cookies.forEach { c ->
            if (c.expiresAt <= System.currentTimeMillis()) this.cookies.remove(key(c)) else this.cookies[key(c)] = c
        }
        persist(url)
    }

    @Synchronized
    override fun loadForRequest(url: HttpUrl): List<Cookie> {
        val now = System.currentTimeMillis()
        cookies.values.removeAll { it.expiresAt <= now }
        return cookies.values.filter { it.matches(url) }
    }

    @Synchronized
    fun clear() { cookies.clear(); prefs.saveCookies(emptySet()) }

    private fun persist(url: HttpUrl) {
        val base = "${url.scheme}://${url.host}:${url.port}/"
        prefs.saveCookies(cookies.values.filter { it.persistent }.map { "$base\n$it" }.toSet())
    }
}
