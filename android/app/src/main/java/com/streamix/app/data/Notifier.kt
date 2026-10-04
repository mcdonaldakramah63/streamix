package com.streamix.app.data

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.streamix.app.MainActivity
import com.streamix.app.R
import com.streamix.app.StreamixApp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Phone notifications for the bell's items (new episodes, reminders, new library videos, weekly picks,
 * announcements). The server's Web Push only reaches browsers, so the app checks the inbox in the
 * background every ~15 minutes instead and shows anything new as a normal Android notification.
 */
object Notifier {
    const val CHANNEL = "updates"
    const val EXTRA_URL = "streamix.url"
    private const val JOB_ID = 4201

    fun createChannels(ctx: Context) {
        if (Build.VERSION.SDK_INT < 26) return
        val nm = ctx.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CHANNEL, ctx.getString(R.string.updates_channel), NotificationManager.IMPORTANCE_DEFAULT))
        nm.createNotificationChannel(NotificationChannel(LiveService.CHANNEL, ctx.getString(R.string.live_channel), NotificationManager.IMPORTANCE_MIN).apply { setShowBadge(false) })
        nm.createNotificationChannel(NotificationChannel(Offline.CHANNEL, ctx.getString(R.string.downloads_channel), NotificationManager.IMPORTANCE_LOW))
    }

    fun permitted(ctx: Context) = Build.VERSION.SDK_INT < 33 ||
        ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    fun schedule(ctx: Context, on: Boolean) {
        val js = ctx.getSystemService(JobScheduler::class.java)
        if (!on) { js.cancel(JOB_ID); return }
        js.schedule(
            JobInfo.Builder(JOB_ID, ComponentName(ctx, InboxJob::class.java))
                .setPeriodic(15 * 60 * 1000L)
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPersisted(true)
                .build()
        )
    }

    /** One bell item as an Android notification; tapping it opens the title / episode */
    fun show(ctx: Context, n: InboxItem) {
        if (!permitted(ctx)) return
        val open = Intent(ctx, MainActivity::class.java).putExtra(EXTRA_URL, n.url)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        val pi = PendingIntent.getActivity(ctx, n.id.hashCode(), open, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val note = NotificationCompat.Builder(ctx, CHANNEL)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentTitle(n.title)
            .setContentText(n.body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(n.body))
            .setAutoCancel(true)
            .setContentIntent(pi)
            .build()
        @Suppress("MissingPermission")
        NotificationManagerCompat.from(ctx).notify(n.id.hashCode(), note)
    }

    /** Called by [LiveService] when the server pushes a new bell item over the socket */
    fun onLive(ctx: Context, prefs: Prefs, n: InboxItem) {
        if (!prefs.notifications) return
        val since = prefs.notifiedAt
        if (since != null && n.createdAt <= since) return
        prefs.notifiedAt = n.createdAt
        show(ctx, n)
    }

    /** Turns phone notifications on/off: the live connection plus the 15-minute catch-up check */
    fun enable(ctx: Context, on: Boolean) {
        schedule(ctx, on)
        if (on) LiveService.start(ctx) else ctx.stopService(Intent(ctx, LiveService::class.java))
    }

    /**
     * Catch-up for pushes the live connection missed (phone asleep, app killed). Shows only what the server's
     * notification engine actually sent — so quiet hours, the daily limit and "3 updates" merging hold here too,
     * instead of every bell item buzzing the phone.
     */
    suspend fun check(ctx: Context, prefs: Prefs, api: Api) {
        if (prefs.user == null || prefs.serverUrl == null || !prefs.notifications) return
        val since = prefs.notifiedAt
        val items = runCatching { api.pushes(since).items }.getOrNull() ?: return
        val newest = items.maxOfOrNull { it.createdAt }
        if (since == null) { prefs.notifiedAt = newest ?: java.time.Instant.now().toString(); return } // first run: no replay
        if (newest == null) return
        prefs.notifiedAt = newest
        if (!permitted(ctx)) return
        items.filter { it.createdAt > since }.takeLast(5).forEach { show(ctx, it) }
    }
}

class InboxJob : JobService() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onStartJob(params: JobParameters): Boolean {
        val session = (application as StreamixApp).session
        scope.launch {
            runCatching { Notifier.check(this@InboxJob, session.prefs, session.api) }
            jobFinished(params, false)
        }
        return true
    }

    override fun onStopJob(params: JobParameters) = true
}
