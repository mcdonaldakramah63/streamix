package com.streamix.app.data

import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import com.streamix.app.MainActivity
import com.streamix.app.R
import com.streamix.app.StreamixApp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import java.util.concurrent.TimeUnit

/**
 * Keeps one small connection to the server's `/ws` socket so new bell items (new episodes, reminders,
 * new videos, announcements) show up as notifications the moment the server creates them.
 * Android requires a visible (silent, minimised) notification while it runs. If the phone is in deep
 * sleep the socket can drop; the 15-minute [InboxJob] check catches anything missed.
 */
class LiveService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var socket: WebSocket? = null
    private var retry: Job? = null
    private var attempt = 0
    private val session get() = (application as StreamixApp).session

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val prefs = session.prefs
        if (!prefs.notifications || prefs.user == null || prefs.serverUrl == null) { stopSelf(); return START_NOT_STICKY }
        val type = if (Build.VERSION.SDK_INT >= 34) ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE else 0
        ServiceCompat.startForeground(this, ID, ongoing(), type)
        if (socket == null) connect()
        return START_STICKY
    }

    private fun ongoing(): Notification {
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        return NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentTitle("Streamix")
            .setContentText("Listening for new episodes and reminders")
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setOngoing(true)
            .setContentIntent(open)
            .build()
    }

    private fun connect() {
        val prefs = session.prefs
        val server = prefs.serverUrl ?: return
        val token = prefs.user?.token ?: return
        val client = session.api.client.newBuilder().pingInterval(60, TimeUnit.SECONDS).build()
        val url = server.replaceFirst("http", "ws") + "/ws?token=" + java.net.URLEncoder.encode(token, "UTF-8")
        socket = client.newWebSocket(Request.Builder().url(url).build(), object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                attempt = 0
                // Catch up on anything created while we were disconnected
                scope.launch { runCatching { Notifier.check(this@LiveService, prefs, session.api) } }
            }
            override fun onMessage(webSocket: WebSocket, text: String) {
                val m = runCatching { AppJson.parseToJsonElement(text).jsonObject }.getOrNull() ?: return
                if (m["type"]?.jsonPrimitive?.contentOrNull != "NOTIFICATION") return
                val item = runCatching { AppJson.decodeFromJsonElement(InboxItem.serializer(), m["item"]!!) }.getOrNull() ?: return
                Notifier.onLive(this@LiveService, prefs, item)
            }
            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) = dropped(webSocket, code)
            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) = dropped(webSocket, response?.code ?: 0)
        })
    }

    /** Reconnect with backoff; a 4001 close means the 15-minute access token expired, so refresh it first */
    private fun dropped(ws: WebSocket, code: Int) {
        if (socket !== ws) return
        socket = null
        retry?.cancel()
        retry = scope.launch {
            delay(minOf(60_000L, 2_000L shl minOf(attempt++, 5)))
            if (code == 4001 || code == 0) session.api.refreshBlocking()
            if (session.prefs.user == null) { stopSelf(); return@launch }
            connect()
        }
    }

    override fun onDestroy() {
        socket?.close(1000, "stopped"); socket = null
        scope.cancel()
        super.onDestroy()
    }

    companion object {
        const val CHANNEL = "live"
        private const val ID = 4202

        fun start(ctx: Context) {
            runCatching { ContextCompat.startForegroundService(ctx, Intent(ctx, LiveService::class.java)) }
        }
    }
}

/** Starts the live connection again after the phone restarts */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        val prefs = (ctx.applicationContext as StreamixApp).session.prefs
        if (prefs.notifications && prefs.user != null) LiveService.start(ctx)
    }
}
