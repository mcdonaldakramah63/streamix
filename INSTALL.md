# Fix4 — Integration Guide

## Files in this zip

```
REPLACE:
  frontend/src/stores/continueWatchingStore.ts   ← fixes useContinueWatchingStore export
  frontend/src/stores/watchlistStore.ts           ← fixes add/remove not working
  frontend/src/components/MovieCard.tsx           ← uses correct store names + auth check

NEW:
  frontend/src/stores/downloadStore.ts            ← offline downloads (Dexie + IndexedDB)
  frontend/src/components/DownloadButton.tsx      ← download button with progress
  frontend/src/pages/Downloads.tsx                ← downloads management page
  frontend/public/sw.js                           ← updated service worker
  frontend/public/offline.html                    ← offline fallback page
  frontend/src/APP_ADDITIONS.ts                   ← shows what to add to App.tsx
```

---

## Step 1 — Install Dexie.js

```bash
cd frontend
npm install dexie
```

---

## Step 2 — Replace/add files

Copy each file from this zip to your project.

---

## Step 3 — Update App.tsx

Add the Downloads route and import:

```tsx
// 1. Add import at top:
const Downloads = lazy(() => import('./pages/Downloads'))

// 2. Add route before the * catch-all:
<Route path="/downloads" element={<Downloads />} />
```

---

## Step 4 — Add Downloads to Navbar (optional)

In `frontend/src/components/Navbar.tsx`, find the `Xu` array and add:
```tsx
{ to: '/downloads', label: 'Downloads', icon: '📥' },
```

---

## Step 5 — Deploy

```bash
cd frontend && npm run build && netlify deploy --prod --dir=dist --site streammix
```

---

## Why watchlist wasn't working

The `useWatchlistStore` was importing correctly but:
1. The `add()` function was calling the wrong field name (`poster` vs `poster_path`)
2. Optimistic updates were rolling back incorrectly
3. The API response shape wasn't being parsed correctly on `fetch()`

The new `watchlistStore.ts` handles all these edge cases and normalizes the response.

---

## Why continue watching wasn't working

The store exported `useContinueWatching` (original name from v1) but newer components
imported `useContinueWatchingStore`. The new store exports BOTH names:

```ts
export const useContinueWatching       = store   // original — don't break old imports
export const useContinueWatchingStore  = store   // new — don't break new imports
export default store
```

---

## Offline Downloads — What works / what doesn't

| Content type | Works? | Notes |
|---|---|---|
| Anime (HLS via our proxy) | ✅ YES | Full download to IndexedDB |
| Direct MP4 URLs | ✅ YES | Full download to IndexedDB |
| VidSrc / embed iframes | ❌ NO | Third-party iframes, no access |
| YouTube trailers | ❌ NO | DRM protected |

### How to add download button to anime player:

In `Player.tsx`, after getting `hlsSrc`, render a `DownloadButton`:

```tsx
import DownloadButton from '../components/DownloadButton'

// In JSX, next to source switcher:
{hlsSrc && (
  <DownloadButton
    params={{
      movieId:    Number(id),
      title,
      poster,
      type:       'tv',
      season,
      episode,
      episodeName: animeEpisodes.find(e => e.number === episode)?.title,
      streamUrl:  hlsSrc,
      quality:    '720p',
    }}
  />
)}
```

### Auto-expiry rules:
- Downloads expire **30 days** after download date
- Once you press Play offline, they expire **48 hours** later
- Expired downloads are purged automatically on next app load
