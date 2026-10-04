package com.streamix.app.data

import kotlinx.serialization.KSerializer
import kotlinx.serialization.builtins.ListSerializer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Parses real responses captured from the Streamix backend (src/test/resources/fixtures) */
class ModelsTest {
    private fun <T> load(name: String, ser: KSerializer<T>): T {
        val text = javaClass.classLoader!!.getResource("fixtures/$name")!!.readText()
        return AppJson.decodeFromString(ser, text)
    }

    @Test fun catalogueLists() {
        val trending = load("trending.json", Paged.serializer())
        assertTrue(trending.results.isNotEmpty())
        assertTrue(trending.results.all { it.displayTitle.isNotBlank() })

        val search = load("search.json", Paged.serializer())
        assertTrue(search.results.any { it.kind() == "tv" } || search.results.any { it.kind() == "movie" })
    }

    @Test fun movieDetails() {
        val d = load("movie.json", Details.serializer())
        assertEquals(550, d.id)
        assertEquals("Fight Club", d.displayTitle)
        assertNotNull(d.runtime)
        assertTrue(d.credits!!.cast.isNotEmpty())
        assertFalse(d.isAnime)
    }

    @Test fun tvDetailsAndSeason() {
        val d = load("tv.json", Details.serializer())
        assertTrue(d.seasons.isNotEmpty())
        assertTrue((d.numberOfSeasons ?: 0) > 1)
        val s = load("season.json", SeasonDetail.serializer())
        assertEquals(1, s.episodes.first().episodeNumber)
    }

    @Test fun accountData() {
        val u = load("user.json", User.serializer())
        assertTrue(u.username.isNotBlank())
        load("refresh.json", User.serializer())

        val profiles = load("profiles.json", ListSerializer(Profile.serializer()))
        assertTrue(profiles.any { it.isKids })
        assertTrue(profiles.any { it.hasPin })

        val wl = load("watchlist.json", ListSerializer(WLItem.serializer()))
        assertEquals("tv", wl.single().type)
        assertEquals("tv", wl.single().asMedia().kind())

        val cw = load("cw.json", ListSerializer(CWItem.serializer()))
        assertEquals(2, cw.single().episode)
        assertEquals(400.0, cw.single().timestamp, 0.0)

        val recs = load("recs.json", Recommendations.serializer())
        assertTrue(recs.sections.isNotEmpty())
    }

    @Test fun animeDetection() {
        val anime = Details(id = 1, name = "Frieren", originalLanguage = "ja", genres = listOf(Genre(16, "Animation")))
        val cartoon = Details(id = 2, name = "Bluey", originalLanguage = "en", genres = listOf(Genre(16, "Animation")))
        assertTrue(anime.isAnime)
        assertFalse(cartoon.isAnime)
    }

    @Test fun viewerFeatureResponses() {
        val inbox = AppJson.decodeFromString(Inbox.serializer(),
            """{"items":[{"_id":"a1","kind":"episode","title":"New episode","body":"S1E2","url":"/player/tv/1399?season=1&episode=2","image":"","createdAt":"2026-10-01T10:00:00.000Z","unread":true}],"unread":1}""")
        assertEquals(1, inbox.unread)
        assertTrue(inbox.items.single().unread)

        val up = AppJson.decodeFromString(Upcoming.serializer(),
            """{"upcoming":[{"showId":1,"name":"Show","poster":"","backdrop":"","season":2,"episode":3,"episodeName":"X","airDate":"2026-10-05"}],"recent":[],"following":4}""")
        assertEquals(2, up.upcoming.single().season)

        val soon = AppJson.decodeFromString(ListSerializer(SoonItem.serializer()),
            """[{"id":9,"title":"Film","media_type":"movie","date":"2026-11-01","poster_path":"/p.jpg","extra":1}]""")
        assertEquals("Film", soon.single().displayTitle)

        val lib = AppJson.decodeFromString(ListSerializer(LibFile.serializer()),
            """[{"_id":"f1","title":"T","format":"mp4","license":"pd","season":null,"episode":null,"playUrl":"https://x/y.mp4","markers":{"introStart":5,"introEnd":60,"creditsStart":null}}]""")
        assertEquals(60.0, lib.single().markers.introEnd)

        val profile = AppJson.decodeFromString(Profile.serializer(),
            """{"_id":"p","name":"A","prefs":{"autoplayNext":false,"maturity":"13","quality":"saver","subtitleLang":"en"},"hiddenTitles":["movie:1"]}""")
        assertFalse(profile.prefs.autoplayNext)
        assertEquals("13", profile.prefs.maturity)
        assertEquals(listOf("movie:1"), profile.hiddenTitles)
        // Profiles without saved prefs keep the web defaults
        assertTrue(AppJson.decodeFromString(Profile.serializer(), """{"_id":"q","name":"B"}""").prefs.autoplayNext)

        val kids = AppJson.decodeFromString(KidsStatus.serializer(),
            """{"allowed":false,"reason":"limit","usedToday":60,"minutesLeft":0,"dailyLimitMin":60,"bedtimeStart":"","bedtimeEnd":"","blockedTitles":[],"allowedOnly":false,"allowedTitles":[]}""")
        assertEquals("limit", kids.reason)
    }

    @Test fun offlineMetaKeepsSubtitles() {
        val meta = OfflineMeta("tv", 1, 1, 2, "Show", hls = true, subs = listOf(OfflineSub("/data/x/0.vtt", "en", "English")))
        val back = AppJson.decodeFromString(OfflineMeta.serializer(), AppJson.encodeToString(OfflineMeta.serializer(), meta))
        assertEquals("en", back.subs.single().lang)
        // Downloads saved before subtitles were stored still load
        assertTrue(AppJson.decodeFromString(OfflineMeta.serializer(), """{"type":"movie","tmdbId":5,"title":"Film"}""").subs.isEmpty())
    }

    @Test fun liveNotificationPayload() {
        // What the server pushes over /ws (utils/notify.js → websocket.pushNotification)
        val item = AppJson.decodeFromString(InboxItem.serializer(),
            """{"_id":"live-1790950000000","kind":"episode","title":"New episode","body":"S2E3","url":"/tv/1399","image":"","createdAt":"2026-10-02T14:00:00.000Z","unread":true}""")
        assertEquals("/tv/1399", item.url)
        assertTrue(item.unread)
    }
}
