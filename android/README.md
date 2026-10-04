# Streamix for Android

Native Android client (Kotlin, Jetpack Compose, Media3 ExoPlayer) for the Streamix server in this
repo. Same design system as the web app (Stitch "Movie Stream Tracker" / Obsidian Cinema).

## What it does

- Connects to your own Streamix server (no cloud) — address is entered on first launch
- Sign in / create account, stays signed in (refresh cookie kept on the device)
- "Who's watching?" profiles with server-verified PINs; kids profiles get a kids home with kid-safe shows, cartoons,
  anime and movies (age-rated on the server) and kids search
- Home (hero, continue watching, personalised rows, Top 10), Explore/search, Movies / TV / Anime browsing
- Title details with seasons & episodes, cast, trailer, My List
- Player: anime plays as a direct HLS stream through the server's proxy (ExoPlayer, subtitles, resume);
  everything else uses embed sources (VidSrc, VidLink, AutoEmbed, 2Embed, Multiembed, Videasy) shown the way the web
  player shows them — inside a page from your server — and a source that fails to load is skipped automatically
- Progress is saved to the server, so Continue Watching is shared with the web app

Viewer features shared with the web app:

- **Notification bell** (Home) with unread count; links open the title or episode
- **New & Hot** (Home chip / Profile): Coming Soon with Remind me, Everyone's Watching, Top 10 Movies / Shows, and new + upcoming episodes. A "New episodes for you" row on Home
- **Watched ticks** per episode with "Mark season as watched", saved per profile
- **Search filters** (genre, decade, rating, language) and **Surprise me** in Explore
- **Report a problem** (flag in the player header)
- **Per-profile playback settings** (Profile tab): autoplay next episode, subtitle language, data usage, maturity rating (parent PIN to loosen)
- **"Not for me"** on title pages and **Viewing activity** (history, remove, clear, undo hidden)
- **Streamix library videos** play first when an admin linked a file to the title, with Skip intro / Next episode markers
- **Player**: double-tap left/right to skip 10 s; kids profiles stop at the daily limit or bedtime

- **Watch parties** (group icon in the player): start one or join with a 6-letter code (also Profile → Join party).
  Same protocol as the web app, so phones and browsers can share a party: play / pause / seeking follow the host
  for Streamix videos and direct streams, embeds get a 3-2-1 countdown; chat, emoji reactions, host can remove people
- **Offline downloads** (download icon in the player; My List → Downloads): Streamix library files and direct HLS
  streams (anime, with their subtitle tracks) are saved in app storage and play without a connection. Embeds can't be saved.
  Downloads can be paused and resumed (one by one or all at once) and keep what's already saved; failed ones retry
- **Phone notifications** (Profile → Notifications on this phone): instant. The server pushes each new bell item over
  its `/ws` socket and the app keeps that connection open in a small foreground service (Android shows a silent
  "Listening" notification while it's on). A 15-minute background check catches anything missed while the phone was
  in deep sleep. Web Push isn't used on Android because it only reaches browsers
- **Splash screen** (designed in Claude Design, "Streamix Splash Screen"): system launch frame on Android 12+, then an
  animated splash until the server answers; if it can't be reached you can retry, watch downloads or change server
- **Security** (Profile → Security): two-factor sign-in with any authenticator app (setup key + backup codes),
  recent sign-ins, and "Sign out everywhere"
- **Kids controls** (Profile → "Controls" on a kids profile, parent PIN): daily limit, bedtime, "only titles I pick",
  blocked titles, weekly report. The kids home shows minutes left and follows the lists
- **Themes & badges** per profile (Profile tab): the accent colour changes across the whole app

## Build

Requirements: Android SDK (platform 37), JDK 17+ (Android Studio's bundled JDK works).

```bash
cd android
export JAVA_HOME=/snap/android-studio/current/jbr   # or your JDK
./gradlew assembleRelease                             # app/build/outputs/apk/release/app-release.apk  ← install this one
./gradlew installRelease                              # install on a connected phone / emulator
```

Use the **release** APK on your phone. It's optimised (R8) and ships Compose's baseline profiles, so it's far smoother
than the debug build — on a Helio G35 phone, janky frames while scrolling went from 46% (debug) to about 3% (release),
and cold start is ~0.7 s. It's signed with the debug key, so it installs over a debug build without losing data.
Debug builds (`assembleDebug`, or Run in Android Studio) are for development only.

Or open the `android/` folder in Android Studio and press Run.

## Connecting to your server

1. Start the server on your computer: `npm run dev` (or `npm run build && npm start`) in the repo root.
2. Find the computer's LAN address (e.g. `ip addr` → `192.168.1.20`).
3. In the app enter `http://192.168.1.20:5000`. The Android emulator reaches your computer at `http://10.0.2.2:5000`.
4. Phone and computer must be on the same Wi-Fi, and the computer's firewall must allow port 5000.
