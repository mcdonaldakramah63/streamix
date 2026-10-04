package com.streamix.app.data

import android.app.Notification
import android.content.Context
import android.net.Uri
import androidx.annotation.OptIn
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.util.UnstableApi
import androidx.media3.database.StandaloneDatabaseProvider
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.cache.CacheDataSource
import androidx.media3.datasource.cache.NoOpCacheEvictor
import androidx.media3.datasource.cache.SimpleCache
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.offline.Download
import androidx.media3.exoplayer.offline.DownloadHelper
import androidx.media3.exoplayer.offline.DownloadManager
import androidx.media3.exoplayer.offline.DownloadNotificationHelper
import androidx.media3.exoplayer.offline.DownloadRequest
import androidx.media3.exoplayer.offline.DownloadService
import androidx.media3.exoplayer.scheduler.Scheduler
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector
import com.streamix.app.R
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.serialization.Serializable
import java.io.File
import java.io.IOException
import java.util.concurrent.Executors
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/** Shown in the Downloads list; stored inside each download request */
@Serializable
data class OfflineMeta(
    val type: String,
    val tmdbId: Int,
    val season: Int? = null,
    val episode: Int? = null,
    val title: String,
    val episodeName: String? = null,
    val poster: String = "",
    val hls: Boolean = false,
    /** Subtitle files saved next to the video */
    val subs: List<OfflineSub> = emptyList(),
    /** Streamix library file id: its download link expires, so resuming asks the server for a fresh one */
    val libId: String? = null,
)

@Serializable data class OfflineSub(val file: String, val lang: String, val label: String)

/** A subtitle track to save with a download (url as the player uses it) */
data class SubSource(val url: String, val lang: String, val label: String)

data class OfflineItem(val id: String, val meta: OfflineMeta, val state: Int, val percent: Float, val bytes: Long, val stopReason: Int = 0) {
    val done get() = state == Download.STATE_COMPLETED
    val failed get() = state == Download.STATE_FAILED
    val paused get() = state == Download.STATE_STOPPED
    val active get() = state == Download.STATE_DOWNLOADING || state == Download.STATE_QUEUED || state == Download.STATE_RESTARTING
}

/**
 * Offline downloads with Media3: direct files (Streamix library) and HLS streams (anime) are saved
 * into an app-private cache and played back from it without a connection. Embeds can't be saved.
 */
@OptIn(UnstableApi::class)
object Offline {
    private var manager: DownloadManager? = null
    private var cache: SimpleCache? = null
    private lateinit var upstream: DataSource.Factory
    private val _items = MutableStateFlow<List<OfflineItem>>(emptyList())
    val items: StateFlow<List<OfflineItem>> = _items.asStateFlow()

    const val CHANNEL = "downloads"

    @Synchronized
    fun manager(ctx: Context, api: Api): DownloadManager {
        manager?.let { return it }
        val app = ctx.applicationContext
        val db = StandaloneDatabaseProvider(app)
        val c = SimpleCache(File(app.filesDir, "offline"), NoOpCacheEvictor(), db)
        cache = c
        upstream = OkHttpDataSource.Factory(api.client)
        val m = DownloadManager(app, db, c, upstream, Executors.newFixedThreadPool(3)).apply {
            maxParallelDownloads = 2
            addListener(object : DownloadManager.Listener {
                override fun onDownloadChanged(dm: DownloadManager, download: Download, finalException: Exception?) = refresh(dm)
                override fun onDownloadRemoved(dm: DownloadManager, download: Download) = refresh(dm)
                override fun onInitialized(dm: DownloadManager) = refresh(dm)
            })
        }
        manager = m
        return m
    }

    /** Re-reads progress; downloads only report progress when polled */
    private val bg = Executors.newSingleThreadExecutor()
    private val main = android.os.Handler(android.os.Looper.getMainLooper())

    /**
     * Re-reads the downloads list. The saved index is read on a background thread (it's a database);
     * live progress of running downloads is in memory and comes from the manager on the main thread.
     */
    fun refresh(dm: DownloadManager? = manager) {
        if (dm == null) return
        bg.execute {
            val out = mutableListOf<OfflineItem>()
            runCatching {
                dm.downloadIndex.getDownloads().use { cur ->
                    while (cur.moveToNext()) {
                        val d = cur.download
                        val meta = runCatching { AppJson.decodeFromString(OfflineMeta.serializer(), String(d.request.data)) }.getOrNull() ?: continue
                        out += OfflineItem(d.request.id, meta, d.state, d.percentDownloaded.coerceAtLeast(0f), d.bytesDownloaded, d.stopReason)
                    }
                }
            }
            main.post {
                val live = dm.currentDownloads.associateBy { it.request.id }
                _items.value = out.map { o ->
                    live[o.id]?.let { d -> o.copy(state = d.state, percent = d.percentDownloaded.coerceAtLeast(0f), bytes = d.bytesDownloaded, stopReason = d.stopReason) } ?: o
                }.sortedBy { it.meta.title + (it.meta.season ?: 0) * 1000 + (it.meta.episode ?: 0) }
            }
        }
    }

    fun keyFor(type: String, tmdbId: Int, season: Int?, episode: Int?) = if (type == "tv") "$type-$tmdbId-s${season}e$episode" else "$type-$tmdbId"

    fun find(id: String) = _items.value.firstOrNull { it.id == id }

    /** Starts a download. HLS streams are prepared first so only one quality is saved, not every variant. */
    suspend fun start(ctx: Context, api: Api, id: String, url: String, meta: OfflineMeta, quality: String, subs: List<SubSource> = emptyList()) {
        manager(ctx, api)
        val saved = saveSubs(ctx, api, id, subs)
        val data = AppJson.encodeToString(OfflineMeta.serializer(), meta.copy(subs = saved)).toByteArray()
        val request = if (meta.hls) {
            val params = DefaultTrackSelector.Parameters.Builder().apply {
                if (quality == "saver") setMaxVideoSize(854, 480) else if (quality != "high") setMaxVideoSize(1280, 720)
            }.build()
            val helper = DownloadHelper.forMediaItem(
                MediaItem.Builder().setUri(url).setMimeType(MimeTypes.APPLICATION_M3U8).build(),
                params, DefaultRenderersFactory(ctx), upstream,
            )
            try {
                suspendCancellableCoroutine { cont ->
                    helper.prepare(object : DownloadHelper.Callback {
                        override fun onPrepared(h: DownloadHelper, tracksInfoAvailable: Boolean) { cont.resume(Unit) }
                        override fun onPrepareError(h: DownloadHelper, e: IOException) { cont.resumeWithException(e) }
                    })
                }
                helper.getDownloadRequest(id, data)
            } finally { helper.release() }
        } else DownloadRequest.Builder(id, Uri.parse(url)).setData(data).setCustomCacheKey(id).build()
        DownloadService.sendAddDownload(ctx, OfflineService::class.java, request, false)
    }

    /** Pauses a download (keeps what's saved); [resume] carries on from there */
    fun pause(ctx: Context, id: String) =
        DownloadService.sendSetStopReason(ctx, OfflineService::class.java, id, STOP_PAUSED, false)

    suspend fun resume(ctx: Context, api: Api, id: String) {
        val item = find(id)
        val libId = item?.meta?.libId
        if (libId != null && !item.meta.hls && !item.done) {
            // The file link from the server only lasts a few hours: swap in a fresh one, same cache key
            val fresh = api.server + api.libraryDownload(libId).offlineUrl
            val req = DownloadRequest.Builder(id, Uri.parse(fresh))
                .setData(AppJson.encodeToString(OfflineMeta.serializer(), item.meta).toByteArray()).setCustomCacheKey(id).build()
            DownloadService.sendAddDownload(ctx, OfflineService::class.java, req, Download.STOP_REASON_NONE, false)
        } else DownloadService.sendSetStopReason(ctx, OfflineService::class.java, id, Download.STOP_REASON_NONE, false)
    }

    /** Failed downloads get another go from where they stopped */
    suspend fun retry(ctx: Context, api: Api, id: String) = resume(ctx, api, id)

    fun pauseAll(ctx: Context) = DownloadService.sendPauseDownloads(ctx, OfflineService::class.java, false)
    fun resumeAll(ctx: Context) = DownloadService.sendResumeDownloads(ctx, OfflineService::class.java, false)

    private const val STOP_PAUSED = 1

    fun remove(ctx: Context, id: String) {
        DownloadService.sendRemoveDownload(ctx, OfflineService::class.java, id, false)
        subsDir(ctx, id).deleteRecursively()
    }

    private fun subsDir(ctx: Context, id: String) = File(ctx.applicationContext.filesDir, "offline-subs/" + id.replace(Regex("[^A-Za-z0-9_-]"), "_"))

    /** Subtitles are small text files: fetch them now so they work offline with the video */
    private suspend fun saveSubs(ctx: Context, api: Api, id: String, subs: List<SubSource>): List<OfflineSub> =
        kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
            val dir = subsDir(ctx, id).apply { deleteRecursively(); mkdirs() }
            subs.take(20).mapIndexedNotNull { i, sub ->
                runCatching {
                    api.client.newCall(okhttp3.Request.Builder().url(sub.url).build()).execute().use { res ->
                        if (!res.isSuccessful) return@runCatching null
                        val f = File(dir, "$i.vtt")
                        f.outputStream().use { out -> res.body.byteStream().copyTo(out) }
                        OfflineSub(f.absolutePath, sub.lang, sub.label)
                    }
                }.getOrNull()
            }
        }

    /** Media item + data source to play a finished download without a connection */
    fun playback(ctx: Context, api: Api, id: String): Pair<MediaItem, DataSource.Factory>? {
        val dm = manager(ctx, api)
        val d = dm.downloadIndex.getDownload(id) ?: return null
        val cached = CacheDataSource.Factory().setCache(cache!!).setUpstreamDataSourceFactory(upstream).setCacheWriteDataSinkFactory(null)
        // DefaultDataSource reads the saved subtitle files (file://) and sends everything else to the cache
        val factory = androidx.media3.datasource.DefaultDataSource.Factory(ctx, cached)
        val meta = runCatching { AppJson.decodeFromString(OfflineMeta.serializer(), String(d.request.data)) }.getOrNull()
        val subs = meta?.subs.orEmpty().filter { File(it.file).exists() }.map {
            MediaItem.SubtitleConfiguration.Builder(Uri.fromFile(File(it.file)))
                .setMimeType(MimeTypes.TEXT_VTT).setLanguage(it.lang).setLabel(it.label).build()
        }
        return d.request.toMediaItem().buildUpon().setSubtitleConfigurations(subs).build() to factory
    }
}

/** Foreground service that keeps downloads running with a progress notification */
@OptIn(UnstableApi::class)
class OfflineService : DownloadService(
    FOREGROUND_NOTIFICATION_ID, DEFAULT_FOREGROUND_NOTIFICATION_UPDATE_INTERVAL, Offline.CHANNEL, R.string.downloads_channel, 0,
) {
    private val helper by lazy { DownloadNotificationHelper(this, Offline.CHANNEL) }

    override fun getDownloadManager(): DownloadManager =
        Offline.manager(this, (application as com.streamix.app.StreamixApp).session.api)

    override fun getScheduler(): Scheduler? = null

    override fun getForegroundNotification(downloads: MutableList<Download>, notMetRequirements: Int): Notification {
        Offline.refresh()
        return helper.buildProgressNotification(this, android.R.drawable.stat_sys_download, null, null, downloads, notMetRequirements)
    }

    companion object { private const val FOREGROUND_NOTIFICATION_ID = 7001 }
}
