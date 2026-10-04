package com.streamix.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Explore
import androidx.compose.material.icons.filled.Movie
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.streamix.app.ui.components.Loading
import com.streamix.app.ui.components.session
import com.streamix.app.ui.screens.AccountScreen
import com.streamix.app.ui.screens.ActivityScreen
import com.streamix.app.ui.screens.DownloadsScreen
import com.streamix.app.ui.screens.KidsControlsScreen
import com.streamix.app.ui.screens.OfflinePlayerScreen
import com.streamix.app.ui.screens.SecurityScreen
import com.streamix.app.ui.screens.SplashScreen
import kotlinx.coroutines.flow.first
import com.streamix.app.ui.screens.InboxScreen
import com.streamix.app.ui.screens.NewAndHotScreen
import com.streamix.app.ui.screens.routeForUrl
import com.streamix.app.ui.screens.BrowseScreen
import com.streamix.app.ui.screens.DetailScreen
import com.streamix.app.ui.screens.ExploreScreen
import com.streamix.app.ui.screens.HomeScreen
import com.streamix.app.ui.screens.KidsHomeScreen
import com.streamix.app.ui.screens.LoginScreen
import com.streamix.app.ui.screens.MyListScreen
import com.streamix.app.ui.screens.PlayerScreen
import com.streamix.app.ui.screens.ProfilesScreen
import com.streamix.app.ui.screens.RegisterScreen
import com.streamix.app.ui.screens.ServerScreen
import com.streamix.app.ui.theme.StreamixTheme
import com.streamix.app.ui.theme.Sx

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(Color.Transparent.toArgb()),
            navigationBarStyle = SystemBarStyle.dark(Sx.Void.toArgb()),
        )
        super.onCreate(savedInstanceState)
        handleIntent(intent)
        setContent { StreamixTheme { Root() } }
    }

    override fun onResume() {
        super.onResume()
        // (Re)start the live notification connection while we're allowed to (app in the foreground)
        val prefs = (application as StreamixApp).session.prefs
        if (prefs.notifications && prefs.user != null && com.streamix.app.data.Notifier.permitted(this)) com.streamix.app.data.LiveService.start(this)
    }

    override fun onNewIntent(intent: android.content.Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    /** Tapping a phone notification opens its link once the main screen is up */
    private fun handleIntent(intent: android.content.Intent?) {
        val url = intent?.getStringExtra(com.streamix.app.data.Notifier.EXTRA_URL) ?: return
        intent.removeExtra(com.streamix.app.data.Notifier.EXTRA_URL)
        val session = (application as StreamixApp).session
        session.markNotificationOpened(url)
        session.pendingUrl.value = url
    }
}

/** Picks the flow from session state: server setup → sign in → profile picker → app */
@Composable
private fun Root() {
    val s = session()
    val server by s.server.collectAsState()
    val user by s.user.collectAsState()
    val profiles by s.profiles.collectAsState()
    val loaded by s.profilesLoaded.collectAsState()
    val active by s.activeProfile.collectAsState()

    // Splash on every cold start: at least ~1.2 s for the animation, until the server answers and
    // profiles are loaded; if the server can't be reached within ~8 s, offer Try again / downloads.
    var splashDone by androidx.compose.runtime.saveable.rememberSaveable { androidx.compose.runtime.mutableStateOf(false) }
    var unreachable by androidx.compose.runtime.remember { androidx.compose.runtime.mutableStateOf(false) }
    var attempt by androidx.compose.runtime.remember { androidx.compose.runtime.mutableIntStateOf(0) }
    var offlineDownloads by androidx.compose.runtime.saveable.rememberSaveable { androidx.compose.runtime.mutableStateOf(false) }
    androidx.compose.runtime.LaunchedEffect(attempt) {
        if (splashDone) return@LaunchedEffect
        val started = System.currentTimeMillis()
        val url = server
        if (url != null && user != null) {
            unreachable = false
            val ok = kotlinx.coroutines.withTimeoutOrNull(8000) { s.api.ping(url) } == true
            if (!ok) { unreachable = true; return@LaunchedEffect }
            if (attempt > 0) s.refreshAll()
            kotlinx.coroutines.withTimeoutOrNull(8000) { s.profilesLoaded.first { it } }
        }
        kotlinx.coroutines.delay(maxOf(0L, 1200L - (System.currentTimeMillis() - started)))
        splashDone = true
    }

    Box(Modifier.fillMaxSize().background(Sx.Surface)) {
        when {
            offlineDownloads -> OfflineOnly(onExit = { offlineDownloads = false })
            // Nothing behind a splash that ends on "can't reach your server"
            !splashDone && unreachable -> Unit
            server == null -> ServerScreen()
            user == null -> AuthFlow()
            !loaded && active == null -> Loading(Modifier.align(Alignment.Center))
            profiles.isNotEmpty() && active == null -> ProfilesScreen()
            else -> androidx.compose.runtime.key(active?.isKids == true) { MainFlow(kids = active?.isKids == true) }
        }
        // Splash on top while the app loads underneath; fades out over 250 ms (design: frame 2 → app)
        androidx.compose.animation.AnimatedVisibility(
            visible = !splashDone && !offlineDownloads,
            enter = androidx.compose.animation.EnterTransition.None,
            exit = androidx.compose.animation.fadeOut(androidx.compose.animation.core.tween(250)),
        ) {
            SplashScreen(
                serverLabel = server?.substringAfter("://"), unreachable = unreachable,
                onRetry = { attempt++ }, onDownloads = { offlineDownloads = true },
                onChangeServer = { splashDone = true; s.changeServer() },
            )
        }
    }
}

/** Downloads reachable from the splash when the server is offline */
@Composable
private fun OfflineOnly(onExit: () -> Unit) {
    val nav = rememberNavController()
    androidx.activity.compose.BackHandler { if (!nav.popBackStack()) onExit() }
    NavHost(nav, startDestination = "downloads") {
        composable("downloads") { DownloadsScreen(onBack = onExit, onPlay = { nav.navigate("offline/$it") }) }
        composable("offline/{id}", listOf(navArgument("id") { type = NavType.StringType })) { e ->
            OfflinePlayerScreen(e.arguments!!.getString("id")!!, onBack = { nav.popBackStack() })
        }
    }
}

@Composable
private fun AuthFlow() {
    val nav = rememberNavController()
    NavHost(nav, startDestination = "login") {
        composable("login") { LoginScreen(onRegister = { nav.navigate("register") }) }
        composable("register") { RegisterScreen(onBack = { nav.popBackStack() }) }
    }
}

private data class Tab(val route: String, val label: String, val icon: androidx.compose.ui.graphics.vector.ImageVector)
private val TABS = listOf(
    Tab("home", "Home", Icons.Filled.Movie),
    Tab("feed", "For You", Icons.Filled.AutoAwesome),
    Tab("explore", "Explore", Icons.Filled.Explore),
    Tab("mylist", "My List", Icons.Filled.Bookmark),
    Tab("account", "Profile", Icons.Filled.Person),
)

@Composable
private fun MainFlow(kids: Boolean) {
    val nav = rememberNavController()
    val entry by nav.currentBackStackEntryAsState()
    val route = entry?.destination?.route

    val open: (String, Int) -> Unit = { type, id -> nav.navigate("detail/$type/$id") }
    val play: (String, Int, Int?, Int?) -> Unit = { type, id, s, e ->
        nav.navigate("player/$type/$id?season=${s ?: -1}&episode=${e ?: -1}")
    }
    val session = session()
    val pending by session.pendingUrl.collectAsState()

    // Leaving the player leaves any watch party
    androidx.compose.runtime.LaunchedEffect(route) {
        if (route != null && !route.startsWith("player")) session.party.leave()
    }

    // Notification links look like the web app's routes ("/tv/12", "/player/tv/12?season=1&episode=2")
    val openUrl: (String) -> Unit = { url ->
        when (val r = routeForUrl(url)) {
            null -> nav.navigate("newhot")
            else -> when {
                r.first == "tv" || r.first == "movie" -> open(r.first, r.second[0])
                r.first == "player:tv" -> play("tv", r.second[0], r.second.getOrNull(1), r.second.getOrNull(2))
                r.first == "player:movie" -> play("movie", r.second[0], null, null)
                else -> nav.navigate("newhot")
            }
        }
    }

    androidx.compose.runtime.LaunchedEffect(pending) {
        val url = pending ?: return@LaunchedEffect
        session.pendingUrl.value = null
        openUrl(url)
    }

    Box(Modifier.fillMaxSize()) {
        NavHost(nav, startDestination = if (kids) "kids" else "home") {
            composable("home") {
                HomeScreen(open, play, onBrowse = { kind, genre -> nav.navigate("browse/$kind?genre=${genre ?: -1}") },
                    onInbox = { nav.navigate("inbox") }, onNewHot = { nav.navigate("newhot") }, onAsk = { nav.navigate("ask") })
            }
            composable("inbox") { InboxScreen(onBack = { nav.popBackStack() }, onUrl = openUrl) }
            composable("newhot") { NewAndHotScreen(onBack = { nav.popBackStack() }, onOpen = open, onPlay = play) }
            composable("feed") { com.streamix.app.ui.screens.FeedScreen(open, play, onAsk = { nav.navigate("ask") }) }
            composable("ask?q={q}", listOf(navArgument("q") { type = NavType.StringType; nullable = true; defaultValue = null })) { e ->
                com.streamix.app.ui.screens.AskScreen(e.arguments?.getString("q"), onBack = { nav.popBackStack() }, onOpen = open)
            }
            composable("activity") { ActivityScreen(onBack = { nav.popBackStack() }, onOpen = open) }
            composable("kids") {
                KidsHomeScreen(onPlay = { type, id ->
                    // Shows carry on from the last episode watched
                    val last = session.progressFor(id)?.takeIf { type == "tv" }
                    play(type, id, last?.season, last?.episode)
                }, onDownloads = { nav.navigate("downloads") })
            }
            composable("explore") { ExploreScreen(open, onBrowse = { kind, genre -> nav.navigate("browse/$kind?genre=${genre ?: -1}") }) }
            composable("mylist") { MyListScreen(open, play, onDownloads = { nav.navigate("downloads") }) }
            composable("account") {
                AccountScreen(onProfilesChanged = {}, onActivity = { nav.navigate("activity") }, onNewHot = { nav.navigate("newhot") },
                    onSecurity = { nav.navigate("security") }, onKidsControls = { nav.navigate("kids-controls/$it") }, onDownloads = { nav.navigate("downloads") },
                    onPartyJoined = { m -> nav.navigate("player/${m.type}/${m.id}?season=${m.season ?: -1}&episode=${m.episode ?: -1}&party=1") })
            }
            composable("security") { SecurityScreen(onBack = { nav.popBackStack() }) }
            composable("downloads") { DownloadsScreen(onBack = { nav.popBackStack() }, onPlay = { nav.navigate("offline/$it") }) }
            composable("offline/{id}", listOf(navArgument("id") { type = NavType.StringType })) { e ->
                OfflinePlayerScreen(e.arguments!!.getString("id")!!, onBack = { nav.popBackStack() })
            }
            composable("kids-controls/{id}", listOf(navArgument("id") { type = NavType.StringType })) { e ->
                KidsControlsScreen(e.arguments!!.getString("id")!!, onBack = { nav.popBackStack() })
            }
            composable(
                "browse/{kind}?genre={genre}",
                listOf(navArgument("kind") { type = NavType.StringType }, navArgument("genre") { type = NavType.IntType; defaultValue = -1 }),
            ) { e ->
                BrowseScreen(e.arguments?.getString("kind") ?: "movie", e.arguments?.getInt("genre")?.takeIf { it > 0 },
                    onBack = { nav.popBackStack() }, onOpen = open)
            }
            composable("detail/{type}/{id}", listOf(navArgument("type") { type = NavType.StringType }, navArgument("id") { type = NavType.IntType })) { e ->
                DetailScreen(e.arguments!!.getString("type")!!, e.arguments!!.getInt("id"), onBack = { nav.popBackStack() }, onOpen = open, onPlay = play)
            }
            composable(
                "player/{type}/{id}?season={season}&episode={episode}&party={party}",
                listOf(
                    navArgument("type") { type = NavType.StringType }, navArgument("id") { type = NavType.IntType },
                    navArgument("season") { type = NavType.IntType; defaultValue = -1 }, navArgument("episode") { type = NavType.IntType; defaultValue = -1 },
                    navArgument("party") { type = NavType.IntType; defaultValue = 0 },
                ),
            ) { e ->
                val a = e.arguments!!
                PlayerScreen(a.getString("type")!!, a.getInt("id"), a.getInt("season").takeIf { it > 0 }, a.getInt("episode").takeIf { it > 0 },
                    onBack = { nav.popBackStack() },
                    // Watch-party guest following the host to another title: replace this player, keep the party
                    onSwitch = { t, i, sn, ep ->
                        nav.navigate("player/$t/$i?season=${sn ?: -1}&episode=${ep ?: -1}&party=1") {
                            e.destination.route?.let { r -> popUpTo(r) { inclusive = true } }
                        }
                    },
                    openParty = a.getInt("party") == 1)
            }
        }

        val showBar = !kids && TABS.any { it.route == route }
        if (showBar) BottomBar(nav, route, Modifier.align(Alignment.BottomCenter))
    }
}

/** Floating glass tab bar from the Stitch mobile design */
@Composable
private fun BottomBar(nav: NavHostController, route: String?, modifier: Modifier) {
    Row(
        modifier.navigationBarsPadding().padding(12.dp).fillMaxWidth().height(66.dp).clip(CircleShape)
            .background(Color(0xE60D111A)).border(1.dp, Color.White.copy(alpha = 0.1f), CircleShape),
        horizontalArrangement = Arrangement.SpaceAround, verticalAlignment = Alignment.CenterVertically,
    ) {
        TABS.forEach { tab ->
            val active = tab.route == route
            Column(
                Modifier.clip(CircleShape).clickable {
                    if (!active) nav.navigate(tab.route) {
                        popUpTo(nav.graph.startDestinationId) { saveState = true }
                        launchSingleTop = true
                        restoreState = true
                    }
                }.padding(horizontal = 12.dp, vertical = 6.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Icon(tab.icon, tab.label, tint = if (active) Sx.Scarlet else Sx.InkFaint, modifier = Modifier.size(24.dp))
                Text(tab.label, style = MaterialTheme.typography.labelSmall, color = if (active) Sx.Scarlet else Sx.InkFaint)
                Box(Modifier.size(5.dp).clip(CircleShape).background(if (active) Sx.Scarlet else Color.Transparent))
            }
        }
    }
}
