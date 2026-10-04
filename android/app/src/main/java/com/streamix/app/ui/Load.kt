package com.streamix.app.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import com.streamix.app.data.ApiException
import kotlinx.coroutines.CancellationException

sealed interface Load<out T> {
    data object Loading : Load<Nothing>
    data class Ok<T>(val value: T) : Load<T>
    data class Err(val message: String) : Load<Nothing>
}

class Loader<T>(val state: Load<T>, val retry: () -> Unit) {
    val value: T? get() = (state as? Load.Ok<T>)?.value
}

fun Throwable.userMessage(): String = when (this) {
    is ApiException -> message ?: "Something went wrong"
    else -> message ?: "Something went wrong"
}

/** Last results of [rememberLoad] calls that pass a `memo` key, kept for the app's lifetime (bounded) */
private val memoStore = object : LinkedHashMap<String, Pair<Long, Any?>>(32, 0.75f, true) {
    override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Pair<Long, Any?>>) = size > 60
}
private const val MEMO_MS = 5 * 60 * 1000L

/**
 * Runs [block] when [keys] change; exposes loading / value / error plus a retry.
 * With [memo], a screen you navigate back to shows its last result straight away (no spinner, scroll position kept)
 * and only reloads when that result is older than 5 minutes.
 */
@Composable
fun <T> rememberLoad(vararg keys: Any?, memo: String? = null, block: suspend () -> T): Loader<T> {
    var attempt by remember { mutableIntStateOf(0) }
    val memoKey = memo?.let { it + keys.joinToString("|", "|") }
    val cached = memoKey?.let { k -> synchronized(memoStore) { memoStore[k] } }
    @Suppress("UNCHECKED_CAST")
    var state by remember(*keys) { mutableStateOf<Load<T>>(cached?.let { Load.Ok(it.second as T) } ?: Load.Loading) }
    LaunchedEffect(*keys, attempt) {
        val fresh = cached != null && attempt == 0 && System.currentTimeMillis() - cached.first < MEMO_MS
        if (fresh) return@LaunchedEffect
        if (state !is Load.Ok) state = Load.Loading
        state = try {
            val v = block()
            memoKey?.let { k -> synchronized(memoStore) { memoStore[k] = System.currentTimeMillis() to v } }
            Load.Ok(v)
        } catch (e: CancellationException) { throw e } catch (e: Throwable) {
            // Keep showing what we had if a background refresh fails
            (state as? Load.Ok) ?: Load.Err(e.userMessage())
        }
    }
    return Loader(state) { attempt++ }
}
