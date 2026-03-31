// frontend/src/App.tsx — FULL REPLACEMENT
// NOTE: BrowserRouter lives in main.tsx — do NOT add another one here
import { useEffect, useState, lazy, Suspense } from 'react'
import { Routes, Route, Navigate }            from 'react-router-dom'
import { useAuthStore }    from './context/authStore'
import { useProfileStore } from './stores/profileStore'
import Navbar              from './components/Navbar'
import Footer              from './components/Footer'
import ProfileSelector     from './components/ProfileSelector'
import { InstallBanner, OfflineBanner } from './components/PWABanner'
import { useWebSocket }    from './hooks/useWebSocket'

// ── Lazy-loaded pages ─────────────────────────────────────────────────────────
const Home          = lazy(() => import('./pages/Home'))
const MovieDetail   = lazy(() => import('./pages/MovieDetail'))
const TVDetail      = lazy(() => import('./pages/TVDetail'))
const PersonPage    = lazy(() => import('./pages/PersonPage'))
const Player        = lazy(() => import('./pages/Player'))
const Search        = lazy(() => import('./pages/Search'))
const Movies        = lazy(() => import('./pages/Movies'))
const Anime         = lazy(() => import('./pages/Anime'))
const TVShows       = lazy(() => import('./pages/TVShows'))
const Watchlist     = lazy(() => import('./pages/Watchlist'))
const Profile       = lazy(() => import('./pages/Profile'))
const Login         = lazy(() => import('./pages/Login'))
const Register      = lazy(() => import('./pages/Register'))
const Dashboard     = lazy(() => import('./pages/admin/Dashboard'))

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-10 h-10 border-2 border-dark-border border-t-brand rounded-full animate-spin" />
    </div>
  )
}

// WebSocket bridge — only mounts when user is logged in
function WebSocketBridge() {
  useWebSocket()
  return null
}

export default function App() {
  const { user }    = useAuthStore()
  const { activeProfile, profiles, fetch: fetchProfiles, setActive } = useProfileStore()
  const [profileReady, setProfileReady] = useState(false)

  useEffect(() => {
    if (user) {
      fetchProfiles().finally(() => setProfileReady(true))
    } else {
      setProfileReady(true)
    }
  }, [user?._id])

  // Show profile selector only when: logged in + profiles loaded + none selected
  const needsProfile = user && profileReady && profiles.length > 0 && !activeProfile

  return (
    <>
      <OfflineBanner />
      <Navbar />
      {user && <WebSocketBridge />}

      {needsProfile ? (
        <ProfileSelector onSelect={(p) => setActive(p)} />
      ) : (
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/"                element={<Home />} />
            <Route path="/movie/:id"       element={<MovieDetail />} />
            <Route path="/tv/:id"          element={<TVDetail />} />
            <Route path="/person/:id"      element={<PersonPage />} />
            <Route path="/player/:type/:id" element={<Player />} />
            <Route path="/search"          element={<Search />} />
            <Route path="/movies"          element={<Movies />} />
            <Route path="/anime"           element={<Anime />} />
            <Route path="/tv"              element={<TVShows />} />
            <Route path="/watchlist"       element={user ? <Watchlist />    : <Navigate to="/login" />} />
            <Route path="/profile"         element={user ? <Profile />      : <Navigate to="/login" />} />
            <Route path="/admin"           element={user?.isAdmin ? <Dashboard /> : <Navigate to="/" />} />
            <Route path="/login"           element={!user ? <Login />       : <Navigate to="/" />} />
            <Route path="/register"        element={!user ? <Register />    : <Navigate to="/" />} />
            <Route path="*"               element={<Navigate to="/" />} />
          </Routes>
        </Suspense>
      )}

      <Footer />
      <InstallBanner />
    </>
  )
}
