// frontend/src/APP_INTEGRATION.tsx
// ─────────────────────────────────────────────────────────────────────────────
// HOW TO WIRE EVERYTHING TOGETHER IN App.tsx
// ─────────────────────────────────────────────────────────────────────────────

// 1. Add these imports:
import { useEffect, useState }  from 'react'
import { useAuthStore }         from './context/authStore'
import { useProfileStore }      from './stores/profileStore'
import ProfileSelector          from './components/ProfileSelector'
import { InstallBanner, OfflineBanner } from './components/PWABanner'

// 2. Inside your App() component, add this logic:
/*
function App() {
  const { user }            = useAuthStore()
  const { activeProfile, fetch, setActive } = useProfileStore()
  const [profileReady, setProfileReady] = useState(false)

  // Fetch profiles when user logs in
  useEffect(() => {
    if (user) {
      fetch().then(() => setProfileReady(true))
    } else {
      setProfileReady(true)  // not logged in, show app normally
    }
  }, [user?._id])

  // Show profile selector if logged in but no active profile
  const needsProfile = user && profileReady && !activeProfile

  return (
    <BrowserRouter>
      <OfflineBanner />
      <Navbar />

      {needsProfile ? (
        <ProfileSelector onSelect={(p) => setActive(p)} />
      ) : (
        <Routes>
          ... your routes ...
        </Routes>
      )}

      <Footer />
      <InstallBanner />
    </BrowserRouter>
  )
}
*/

// 3. In your Home.tsx, add RecommendationsRow:
/*
import RecommendationsRow from '../components/RecommendationsRow'

// Inside Home component, after ContinueWatchingRow:
<RecommendationsRow />
*/

// 4. In your Player.tsx, add SleepTimer to the controls bar:
/*
import SleepTimer from '../components/SleepTimer'

// In the top bar buttons area:
<SleepTimer onExpire={() => {
  // pause the video
  videoRef.current?.pause()
}} />
*/

// 5. In your Navbar.tsx, add VoiceSearch next to the search input:
/*
import VoiceSearch from './VoiceSearch'

// Inside the search form div:
<VoiceSearch onResult={(text) => {
  setQuery(text)
  navigate(`/search?q=${encodeURIComponent(text)}`)
}} />
*/

// 6. Use HoverTrailerCard instead of regular MovieCard in recommendation rows:
/*
import HoverTrailerCard from './HoverTrailerCard'
// Use in Carousel or grid instead of MovieCard for featured sections
*/

// 7. Copy sw.js to frontend/public/sw.js (not src, it needs to be at root)
//    Copy site.webmanifest to frontend/public/site.webmanifest

// 8. In Navbar.tsx, add profile switcher next to user menu:
/*
import { useProfileStore } from '../stores/profileStore'

// In user area:
const { activeProfile, profiles, setActive } = useProfileStore()

// Add a dropdown to switch profiles:
{profiles.length > 1 && (
  <div className="flex items-center gap-1">
    {profiles.map(p => (
      <button key={p._id} onClick={() => setActive(p)}
        className={`w-8 h-8 rounded-xl flex items-center justify-center text-lg transition-all ${
          activeProfile?._id === p._id ? 'ring-2 ring-brand scale-110' : 'opacity-60 hover:opacity-100'
        }`}
        title={p.name}>
        {p.avatar}
      </button>
    ))}
  </div>
)}
*/

// 9. Record watch history in Player.tsx when video starts:
/*
import { useProfileStore } from '../stores/profileStore'
const { recordWatch } = useProfileStore()

// When media loads:
useEffect(() => {
  if (media) {
    recordWatch(
      Number(id),
      media.title || media.name || '',
      type as 'movie'|'tv',
      media.genre_ids || (media.genres || []).map((g:any) => g.id),
      media.original_language || 'en',
    )
  }
}, [media?.id])
*/

export {}
