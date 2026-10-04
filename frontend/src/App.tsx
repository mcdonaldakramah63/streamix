// frontend/src/App.tsx — routes + app-wide chrome (BrowserRouter lives in main.tsx)
import { lazy, Suspense, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuthStore }    from './context/authStore'
import { useProfileStore } from './stores/profileStore'
import { useWebSocket }    from './hooks/useWebSocket'
import Navbar              from './components/Navbar'
import Footer              from './components/Footer'
import ProfileSelector     from './components/ProfileSelector'
import { PinGate }         from './components/PinModal'
import AnnouncementBanner from './components/AnnouncementBanner'
import KidsGuard from './components/kids/KidsGuard'
import { PinPromptHost } from './utils/pinPrompt'
import { applyTheme } from './utils/theme'
import { useTop10 } from './stores/top10Store'
import { InstallBanner, OfflineBanner } from './components/PWABanner'
import { markOpened } from './components/NotificationBell'

const Home        = lazy(() => import('./pages/Home'))
const KidsHome    = lazy(() => import('./pages/KidsHome'))
const Upcoming    = lazy(() => import('./pages/Upcoming'))
const NewAndHot   = lazy(() => import('./pages/NewAndHot'))
const Ask   = lazy(() => import('./pages/Ask'))
const ViewingActivity = lazy(() => import('./pages/ViewingActivity'))
const MovieDetail = lazy(() => import('./pages/MovieDetail'))
const TVDetail    = lazy(() => import('./pages/TVDetail'))
const PersonPage  = lazy(() => import('./pages/PersonPage'))
const Player      = lazy(() => import('./pages/Player'))
const Search      = lazy(() => import('./pages/Search'))
const Movies      = lazy(() => import('./pages/Movies'))
const Anime       = lazy(() => import('./pages/Anime'))
const TVShows     = lazy(() => import('./pages/TVShows'))
const Watchlist   = lazy(() => import('./pages/Watchlist'))
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'))
const Downloads   = lazy(() => import('./pages/Downloads'))
const Profile     = lazy(() => import('./pages/Profile'))
const Login       = lazy(() => import('./pages/Login'))
const Register    = lazy(() => import('./pages/Register'))
const Dashboard   = lazy(() => import('./pages/admin/Dashboard'))
const LibraryWatch = lazy(() => import('./pages/LibraryWatch'))

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-10 h-10 border-2 border-white/10 border-t-brand rounded-full animate-spin" />
    </div>
  )
}

// Paths a kids profile may visit — everything else bounces back to /kids
const KIDS_ALLOWED = [/^\/kids$/, /^\/player\//, /^\/movie\/\d+$/, /^\/tv\/\d+$/, /^\/downloads$/]

export default function App() {
  const user = useAuthStore(s => s.user)
  const { activeProfile, profiles, loaded, setActive } = useProfileStore()
  const location = useLocation()
  useWebSocket()
  // Arrived from a notification: count the open (the server learns what each person cares about), open the
  // bell for a "3 updates" push, then tidy the address bar
  useEffect(() => {
    const q = new URLSearchParams(location.search)
    const n = q.get('n'), inbox = q.get('inbox')
    if (!n && !inbox) return
    if (n && user) markOpened(n)
    if (inbox && user) setTimeout(() => window.dispatchEvent(new Event('streamix:open-inbox')), 300)
    q.delete('n'); q.delete('inbox')
    const rest = q.toString()
    window.history.replaceState(window.history.state, '', location.pathname + (rest ? `?${rest}` : '') + location.hash)
  }, [location.search, user])

  const needsProfile = !!(user && loaded && profiles.length > 0 && !activeProfile)
  const isKids = !!activeProfile?.isKids
  // Today's Top 10 (badges on posters)
  useEffect(() => { useTop10.getState().load() }, [])
  // Each profile can have its own accent colour
  useEffect(() => { applyTheme(activeProfile?.theme) }, [activeProfile?.theme])
  const kidsBlocked = isKids && !KIDS_ALLOWED.some(re => re.test(location.pathname))
  const bare = location.pathname.startsWith('/player/') || location.pathname.startsWith('/watch/') || location.pathname === '/kids'

  return (
    <>
      <OfflineBanner />
      <Navbar />
      <PinGate />
      <PinPromptHost />
      {isKids && activeProfile && <KidsGuard profileId={activeProfile._id} />}
      {!bare && !needsProfile && <AnnouncementBanner />}

      {needsProfile ? (
        <ProfileSelector onSelect={(p) => { setActive(p) }} />
      ) : kidsBlocked ? (
        <Navigate to="/kids" replace />
      ) : (
        <main className={bare ? '' : 'pb-nav'}>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/"                 element={isKids ? <Navigate to="/kids" replace /> : <Home />} />
              <Route path="/kids"             element={<KidsHome />} />
              <Route path="/upcoming"         element={<Upcoming />} />
              <Route path="/new"              element={<NewAndHot />} />
              <Route path="/ask"              element={<Ask />} />
              <Route path="/activity"         element={<ViewingActivity />} />
              <Route path="/movie/:id"        element={<MovieDetail />} />
              <Route path="/tv/:id"           element={<TVDetail />} />
              <Route path="/person/:id"       element={<PersonPage />} />
              <Route path="/player/:type/:id" element={<Player />} />
              <Route path="/search"           element={<Search />} />
              <Route path="/movies"           element={<Movies />} />
              <Route path="/anime"            element={<Anime />} />
              <Route path="/tv"               element={<TVShows />} />
              <Route path="/downloads"        element={<Downloads />} />
              <Route path="/watch/:id"        element={<LibraryWatch />} />
              <Route path="/watchlist" element={user ? <Watchlist /> : <Navigate to="/login" replace state={{ from: '/watchlist' }} />} />
              <Route path="/profile"   element={user ? <Profile />   : <Navigate to="/login" replace state={{ from: '/profile' }} />} />
              <Route path="/admin"     element={user?.isAdmin ? <Dashboard /> : <Navigate to="/" replace />} />
              <Route path="/login"     element={!user ? <Login />    : <Navigate to="/" replace />} />
              <Route path="/register"  element={!user ? <Register /> : <Navigate to="/" replace />} />
              <Route path="/verify-email" element={<VerifyEmail />} />
              <Route path="*"          element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </main>
      )}

      {!bare && !needsProfile && <Footer />}
      <InstallBanner />
    </>
  )
}
