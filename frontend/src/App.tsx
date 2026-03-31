// frontend/src/App.tsx — FULL REPLACEMENT
// BrowserRouter is in main.tsx — do NOT add here
import { useEffect, useState, lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useAuthStore }    from './context/authStore'
import { useProfileStore } from './stores/profileStore'
import Navbar              from './components/Navbar'
import Footer              from './components/Footer'
import ProfileSelector     from './components/ProfileSelector'
import { useWebSocket }    from './hooks/useWebSocket'

// ── Lazy pages ──────────────────────────────────────────────────────────────
const Home       = lazy(() => import('./pages/Home'))
const KidsHome   = lazy(() => import('./pages/KidsHome'))   // <-- CRITICAL: kids route
const MovieDetail = lazy(() => import('./pages/MovieDetail'))
const TVDetail   = lazy(() => import('./pages/TVDetail'))
const PersonPage = lazy(() => import('./pages/PersonPage'))
const Player     = lazy(() => import('./pages/Player'))
const Search     = lazy(() => import('./pages/Search'))
const Movies     = lazy(() => import('./pages/Movies'))
const Anime      = lazy(() => import('./pages/Anime'))
const TVShows    = lazy(() => import('./pages/TVShows'))
const Watchlist  = lazy(() => import('./pages/Watchlist'))
const Profile    = lazy(() => import('./pages/Profile'))
const Login      = lazy(() => import('./pages/Login'))
const Register   = lazy(() => import('./pages/Register'))
const Dashboard  = lazy(() => import('./pages/admin/Dashboard'))

// ── Fallback ─────────────────────────────────────────────────────────────────
function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-10 h-10 border-2 border-dark-border border-t-brand rounded-full animate-spin" />
    </div>
  )
}

// ── WebSocket bridge — only mounts when logged in ────────────────────────────
function WebSocketBridge() {
  useWebSocket()
  return null
}

// ── Offline / PWA banners (safe guard if component doesn't exist) ────────────
function OfflineBanner() {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const on  = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online',  on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  if (online) return null
  return (
    <div className="fixed top-16 left-0 right-0 z-[90] bg-yellow-500/95 text-dark text-xs font-bold text-center py-2 flex items-center justify-center gap-2">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.56 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01"/>
      </svg>
      You're offline — some features may be unavailable
    </div>
  )
}

// ── Main App component ───────────────────────────────────────────────────────
export default function App() {
  const { user }   = useAuthStore()
  const { activeProfile, profiles, fetch: fetchProfiles, setActive } = useProfileStore()
  const [profileReady, setProfileReady] = useState(false)

  useEffect(() => {
    if (user) {
      fetchProfiles().finally(() => setProfileReady(true))
    } else {
      setProfileReady(true)
    }
  }, [user?._id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Show profile selector: logged in + loaded + has profiles + none selected
  const needsProfile = !!(user && profileReady && profiles.length > 0 && !activeProfile)

  // Hide Navbar/Footer on Player and Kids pages — handled inside those pages
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
            {/* Home — redirects to /kids if active profile is kids */}
            <Route path="/"                   element={<Home />} />

            {/* Kids mode — standalone page with its own layout */}
            <Route path="/kids"               element={<KidsHome />} />

            <Route path="/movie/:id"          element={<MovieDetail />} />
            <Route path="/tv/:id"             element={<TVDetail />} />
            <Route path="/person/:id"         element={<PersonPage />} />
            <Route path="/player/:type/:id"   element={<Player />} />
            <Route path="/search"             element={<Search />} />
            <Route path="/movies"             element={<Movies />} />
            <Route path="/anime"              element={<Anime />} />
            <Route path="/tv"                 element={<TVShows />} />

            <Route path="/watchlist"  element={user ? <Watchlist /> : <Navigate to="/login" replace />} />
            <Route path="/profile"    element={user ? <Profile />   : <Navigate to="/login" replace />} />
            <Route path="/admin"      element={user?.isAdmin ? <Dashboard /> : <Navigate to="/" replace />} />
            <Route path="/login"      element={!user ? <Login />    : <Navigate to="/" replace />} />
            <Route path="/register"   element={!user ? <Register /> : <Navigate to="/" replace />} />
            <Route path="*"           element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      )}

      <Footer />
    </>
  )
}
