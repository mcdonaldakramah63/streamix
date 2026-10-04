package com.streamix.app.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

const val IMG = "https://image.tmdb.org/t/p"
fun tmdbImage(path: String?, size: String = "w342"): String? = path?.let { "$IMG/$size$it" }

// ── TMDB (proxied by the Streamix backend) ────────────────────────────────────

@Serializable
data class Media(
    val id: Int,
    val title: String? = null,
    val name: String? = null,
    @SerialName("poster_path") val posterPath: String? = null,
    @SerialName("backdrop_path") val backdropPath: String? = null,
    val overview: String? = null,
    @SerialName("vote_average") val voteAverage: Double = 0.0,
    @SerialName("release_date") val releaseDate: String? = null,
    @SerialName("first_air_date") val firstAirDate: String? = null,
    @SerialName("media_type") val mediaType: String? = null,
    @SerialName("genre_ids") val genreIds: List<Int> = emptyList(),
    @SerialName("original_language") val originalLanguage: String? = null,
    /** Why it was recommended ("Because you watched …", or Claude's line when AI is on) */
    val reason: String? = null,
) {
    val displayTitle: String get() = title ?: name ?: ""
    val year: String get() = (releaseDate ?: firstAirDate ?: "").take(4)

    /** Explicit media_type wins, then "has a name but no title" means TV */
    fun kind(fallback: String? = null): String = when {
        fallback != null -> fallback
        mediaType == "tv" || mediaType == "movie" -> mediaType
        name != null && title == null -> "tv"
        else -> "movie"
    }
}

@Serializable
data class Paged(
    val page: Int = 1,
    val results: List<Media> = emptyList(),
    @SerialName("total_pages") val totalPages: Int = 1,
)

@Serializable data class Genre(val id: Int, val name: String)

@Serializable
data class CastMember(
    val id: Int,
    val name: String,
    val character: String? = null,
    @SerialName("profile_path") val profilePath: String? = null,
)

@Serializable data class Credits(val cast: List<CastMember> = emptyList())

@Serializable
data class Video(
    val key: String,
    val site: String = "",
    val type: String = "",
    val official: Boolean = false,
    val name: String? = null,
)

@Serializable data class Videos(val results: List<Video> = emptyList())

@Serializable
data class SeasonInfo(
    @SerialName("season_number") val seasonNumber: Int,
    val name: String? = null,
    @SerialName("episode_count") val episodeCount: Int = 0,
)

@Serializable
data class Details(
    val id: Int,
    val title: String? = null,
    val name: String? = null,
    val overview: String? = null,
    val tagline: String? = null,
    val status: String? = null,
    @SerialName("poster_path") val posterPath: String? = null,
    @SerialName("backdrop_path") val backdropPath: String? = null,
    @SerialName("vote_average") val voteAverage: Double = 0.0,
    @SerialName("release_date") val releaseDate: String? = null,
    @SerialName("first_air_date") val firstAirDate: String? = null,
    val runtime: Int? = null,
    @SerialName("episode_run_time") val episodeRunTime: List<Int> = emptyList(),
    val genres: List<Genre> = emptyList(),
    @SerialName("original_language") val originalLanguage: String? = null,
    @SerialName("origin_country") val originCountry: List<String> = emptyList(),
    @SerialName("number_of_seasons") val numberOfSeasons: Int? = null,
    @SerialName("number_of_episodes") val numberOfEpisodes: Int? = null,
    val seasons: List<SeasonInfo> = emptyList(),
    val credits: Credits? = null,
    val videos: Videos? = null,
) {
    val displayTitle: String get() = title ?: name ?: ""
    val year: String get() = (releaseDate ?: firstAirDate ?: "").take(4)

    /** Japanese-origin animation — same rule as the web player */
    val isAnime: Boolean
        get() = (originalLanguage == "ja" || "JP" in originCountry) && genres.any { it.id == 16 }

    val trailer: Video?
        get() {
            val yt = videos?.results.orEmpty().filter { it.site == "YouTube" && it.type == "Trailer" }
            return yt.firstOrNull { it.official } ?: yt.firstOrNull()
        }
}

@Serializable
data class Episode(
    val id: Int,
    val name: String = "",
    @SerialName("episode_number") val episodeNumber: Int,
    val overview: String? = null,
    @SerialName("still_path") val stillPath: String? = null,
    val runtime: Int? = null,
    @SerialName("air_date") val airDate: String? = null,
)

@Serializable data class SeasonDetail(val episodes: List<Episode> = emptyList())

// ── Streamix accounts ─────────────────────────────────────────────────────────

@Serializable
data class User(
    @SerialName("_id") val id: String,
    val username: String,
    val email: String,
    val isAdmin: Boolean = false,
    val avatar: String? = null,
    val token: String,
)

@Serializable
data class ProfilePrefs(
    val autoplayNext: Boolean = true,
    val autoplayPreviews: Boolean = true,
    val subtitleLang: String = "",
    val quality: String = "auto",
    val maturity: String = "all",
)

@Serializable
data class Profile(
    @SerialName("_id") val id: String,
    val name: String,
    val avatar: String = "🎬",
    val color: String = "#e50914",
    val isKids: Boolean = false,
    val hasPin: Boolean = false,
    val prefs: ProfilePrefs = ProfilePrefs(),
    /** "Not for me" titles, as "movie:123" / "tv:456" */
    val hiddenTitles: List<String> = emptyList(),
    /** Accent colour theme (ui/theme THEMES) */
    val theme: String = "scarlet",
)

@Serializable
data class CWItem(
    val movieId: Int,
    val title: String,
    val poster: String = "",
    val backdrop: String = "",
    val type: String = "movie",
    val season: Int? = null,
    val episode: Int? = null,
    val episodeName: String? = null,
    val progress: Double = 0.0,
    val timestamp: Double = 0.0,
    val duration: Double? = null,
    val durationMins: Double? = null,
)

@Serializable
data class WLItem(
    val movieId: Int,
    val title: String,
    val poster: String = "",
    val backdrop: String = "",
    val rating: Double = 0.0,
    val year: String = "",
    val type: String = "movie",
) {
    fun asMedia() = Media(
        id = movieId,
        title = if (type == "movie") title else null,
        name = if (type == "tv") title else null,
        posterPath = poster.ifBlank { null },
        backdropPath = backdrop.ifBlank { null },
        voteAverage = rating,
        releaseDate = year,
        mediaType = type,
    )
}

@Serializable data class Section(val title: String, val items: List<Media> = emptyList(), val kind: String = "")
@Serializable data class Recommendations(val sections: List<Section> = emptyList())

// ── Anime (aniwatch via backend) ──────────────────────────────────────────────

@Serializable data class AnimeHit(val id: String, val name: String? = null, val jname: String? = null)
@Serializable data class AnimeSearch(val animes: List<AnimeHit> = emptyList())
@Serializable data class AnimeEp(val number: Int, val episodeId: String, val title: String? = null)
@Serializable data class AnimeEpisodes(val episodes: List<AnimeEp> = emptyList())
@Serializable data class AnimeSource(val url: String, val isM3U8: Boolean = false, val quality: String? = null, val proxied: String? = null)
@Serializable data class AnimeTrack(val file: String? = null, val label: String? = null, val kind: String? = null, val proxied: String? = null)
@Serializable data class AnimeSources(val sources: List<AnimeSource> = emptyList(), val tracks: List<AnimeTrack> = emptyList())

// ── Viewer features (same endpoints as the web app) ───────────────────────────

@Serializable
data class InboxItem(
    @SerialName("_id") val id: String,
    val kind: String = "",
    val title: String = "",
    val body: String = "",
    val url: String = "",
    val image: String = "",
    val createdAt: String = "",
    val unread: Boolean = false,
)

@Serializable data class Inbox(val items: List<InboxItem> = emptyList(), val unread: Int = 0)

@Serializable
data class UpEp(
    val showId: Int,
    val name: String = "",
    val poster: String = "",
    val backdrop: String = "",
    val season: Int = 1,
    val episode: Int = 1,
    val episodeName: String = "",
    val airDate: String = "",
)

@Serializable data class Upcoming(val upcoming: List<UpEp> = emptyList(), val recent: List<UpEp> = emptyList(), val following: Int = 0)

/** Coming-soon / top-10 rows come back as TMDB items with a media_type and a release date */
@Serializable
data class SoonItem(
    val id: Int,
    val title: String? = null,
    val name: String? = null,
    @SerialName("poster_path") val posterPath: String? = null,
    @SerialName("backdrop_path") val backdropPath: String? = null,
    val overview: String? = null,
    @SerialName("vote_average") val voteAverage: Double = 0.0,
    @SerialName("media_type") val mediaType: String = "movie",
    val date: String? = null,
) {
    val displayTitle: String get() = title ?: name ?: ""
}

@Serializable data class Top10(val movies: List<Media> = emptyList(), val tv: List<Media> = emptyList())

@Serializable data class Reminder(val type: String, val tmdbId: Int)

@Serializable
data class EpProgress(val season: Int, val episode: Int, val progress: Double = 0.0, val completed: Boolean = false)

@Serializable
data class LibMarkers(val introStart: Double? = null, val introEnd: Double? = null, val creditsStart: Double? = null)

@Serializable
data class LibFile(
    @SerialName("_id") val id: String,
    val title: String = "",
    val format: String = "",
    val license: String? = null,
    val season: Int? = null,
    val episode: Int? = null,
    val playUrl: String = "",
    val markers: LibMarkers = LibMarkers(),
    /** WebVTT tracks made from the original file's subtitles (relative URLs, signed) */
    val subtitles: List<LibSub> = emptyList(),
)

@Serializable data class LibSub(val url: String, val lang: String = "", val label: String = "")

/** A free, official upload of an episode/movie by its rights holder on YouTube */
@Serializable data class OfficialVid(val videoId: String, val season: Int? = null, val episode: Int? = null, val channel: String = "", val title: String = "")
@Serializable data class OfficialList(val videos: List<OfficialVid> = emptyList())

@Serializable
data class HistoryEntry(
    val tmdbId: Int,
    val title: String = "",
    val type: String = "movie",
    val progress: Double = 0.0,
    val completed: Boolean = false,
    val watchedAt: String = "",
)

@Serializable data class History(val history: List<HistoryEntry> = emptyList(), val hidden: List<String> = emptyList())

/** Kids profiles: screen-time limit and bedtime. The server decides; the app just obeys it. */
@Serializable
data class KidsStatus(
    val allowed: Boolean = true,
    val reason: String? = null,
    val usedToday: Int = 0,
    val minutesLeft: Int? = null,
    val dailyLimitMin: Int = 0,
    val bedtimeStart: String = "",
    val bedtimeEnd: String = "",
    val blockedTitles: List<String> = emptyList(),
    val allowedOnly: Boolean = false,
    val allowedTitles: List<String> = emptyList(),
)

@Serializable data class KidsCheck(val allowed: Boolean = true, val reason: String? = null)

@Serializable
data class KidsControls(
    val dailyLimitMin: Int = 0,
    val bedtimeStart: String = "",
    val bedtimeEnd: String = "",
    val allowedOnly: Boolean = false,
    val allowedTitles: List<String> = emptyList(),
    val blockedTitles: List<String> = emptyList(),
)

@Serializable data class DayUsage(val day: String, val minutes: Int = 0)
@Serializable data class KidsReport(val days: List<DayUsage> = emptyList(), val recent: List<HistoryEntry> = emptyList())
@Serializable data class KidsControlsData(val controls: KidsControls = KidsControls(), val report: KidsReport = KidsReport())

@Serializable
data class Badge(
    val id: String, val emoji: String = "🏅", val name: String = "", val description: String = "",
    val earned: Boolean = false, val progress: Int = 0, val goal: Int = 1,
)
@Serializable data class Badges(val badges: List<Badge> = emptyList(), val earned: Int = 0)

// ── Account security ──────────────────────────────────────────────────────────

@Serializable data class TwoFactorStatus(val enabled: Boolean = false, val recoveryLeft: Int = 0)
@Serializable data class TwoFactorSetup(val secret: String, val otpauthUrl: String)
@Serializable data class RecoveryCodes(val recoveryCodes: List<String> = emptyList())

@Serializable
data class SignInEvent(
    val at: String = "", val action: String = "", val label: String = "",
    val device: String = "", val ip: String = "", val warn: Boolean = false,
)

/** POST /library/:id/download → short-lived link to the file through the server */
@Serializable data class DownloadLink(val url: String, val offlineUrl: String, val sizeBytes: Long? = null)

// ── Discovery: Ask Streamix, Coming up for you, the news feed ────────────────

@Serializable data class AskResult(val query: String = "", val title: String = "", val ai: Boolean = false, val items: List<Media> = emptyList())

@Serializable
data class UpcomingItem(
    val id: Int,
    val title: String? = null,
    val name: String? = null,
    @SerialName("media_type") val mediaType: String = "movie",
    @SerialName("poster_path") val posterPath: String? = null,
    @SerialName("backdrop_path") val backdropPath: String? = null,
    val overview: String? = null,
    @SerialName("vote_average") val voteAverage: Double = 0.0,
    val reason: String? = null,
    val date: String? = null,
    val daysUntil: Int? = null,
    /** premiere | episode | franchise | person | taste | hype */
    val why: String = "taste",
    val reminded: Boolean = false,
    val nextEpisode: String? = null,
    val season: Int? = null,
    val episode: Int? = null,
) { val displayTitle: String get() = title ?: name ?: "" }

@Serializable data class UpcomingForYou(val items: List<UpcomingItem> = emptyList())

@Serializable
data class FeedStory(
    /** new_episode | premiere | library | coming_soon | pick | community | fresh_hit | trending */
    val kind: String,
    val headline: String = "",
    val detail: String = "",
    val date: String? = null,
    val trailerKey: String? = null,
    val season: Int? = null,
    val episode: Int? = null,
    val reminded: Boolean = false,
    val ai: Boolean = false,
    val item: Media,
)

@Serializable data class EmbedSource(val id: String, val label: String, val template: String, val score: Double = 0.0, val up: Boolean = true)
@Serializable data class EmbedSources(val type: String = "movie", val sources: List<EmbedSource> = emptyList())

/** "Play something": one pick to start right now */
@Serializable
data class PlayPick(
    val type: String, val id: Int, val title: String? = null, val season: Int? = null, val episode: Int? = null,
    val kind: String = "", val reason: String = "", val runtime: Int? = null, val minutesLeft: Int? = null,
)
@Serializable data class PlaySomething(val pick: PlayPick, val alternatives: List<PlayPick> = emptyList())

/** New & Hot from the server's trend tracker (refreshes itself every 30 min) */
@Serializable
data class HotLists(
    val updatedAt: String = "", val version: String = "", val hasMomentum: Boolean = false,
    val everyone: List<Media> = emptyList(), val rising: List<Media> = emptyList(), val justReleased: List<Media> = emptyList(),
    val top10Movies: List<Media> = emptyList(), val top10Tv: List<Media> = emptyList(),
)

@Serializable data class SearchPerson(val id: Int, val name: String = "")
/** Smart search: ranked results + what the engine understood */
@Serializable
data class SmartSearch(
    val results: List<Media> = emptyList(),
    @SerialName("total_pages") val totalPages: Int = 1,
    val didYouMean: String? = null,
    val person: SearchPerson? = null,
)

@Serializable data class FeedPage(val items: List<FeedStory> = emptyList(), val hasMore: Boolean = false)
