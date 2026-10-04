package com.streamix.app

import android.app.Application
import coil3.ImageLoader
import coil3.SingletonImageLoader
import coil3.request.crossfade
import com.streamix.app.data.Api
import com.streamix.app.data.Prefs
import com.streamix.app.data.Session

class StreamixApp : Application(), SingletonImageLoader.Factory {
    lateinit var session: Session
        private set

    override fun onCreate() {
        super.onCreate()
        // Debug builds: embeds can be inspected from chrome://inspect on a computer
        if (applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE != 0) android.webkit.WebView.setWebContentsDebuggingEnabled(true)
        val prefs = Prefs(this)
        session = Session(prefs, Api(prefs))
        com.streamix.app.data.Notifier.createChannels(this)
        if (prefs.notifications) com.streamix.app.data.Notifier.schedule(this, true)
        // Signing out stops the live connection
        session.onSignedOut = { stopService(android.content.Intent(this, com.streamix.app.data.LiveService::class.java)) }
    }

    override fun newImageLoader(context: coil3.PlatformContext): ImageLoader =
        ImageLoader.Builder(context).crossfade(true).build()
}
