# Streamix — Integration Guide
## Files in this zip

```
frontend/src/
  App.tsx                    ← REPLACE (fixes kids route + BrowserRouter)
  pages/Home.tsx             ← REPLACE (fixes kids redirect + keeps all features)
  pages/KidsHome.tsx         ← REPLACE (full rewrite — now works correctly)
  pages/Player.tsx           ← REPLACE (all streaming, source switcher, episode nav)
  components/HLSPlayer.tsx   ← REPLACE (ABR tuning, Media Session, quality picker)
  stores/profileStore.ts     ← REPLACE (fixes isKids flag sync)
```

---

## Step 1 — Copy files

Copy each file into your project at the same path shown above.

---

## Step 2 — Ensure main.tsx is correct

Your `frontend/src/main.tsx` must look like this (do NOT change it if it already does):

```tsx
import React    from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App  from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)
```

**Critical:** `BrowserRouter` lives ONLY in `main.tsx`. `App.tsx` uses `<Routes>` directly.

---

## Step 3 — Install hls.js types (if not already installed)

```bash
cd frontend
npm install hls.js
npm install --save-dev @types/hls.js
```

---

## Step 4 — Access Kids Mode

**Method 1 — Via Profile Selector:**
1. Login → Profile Selector appears
2. Create a profile with "Kids Mode" toggle ON
3. Select that profile → auto-redirects to `/kids`

**Method 2 — Direct URL:**
Visit `https://streammix.netlify.app/kids`

**To exit Kids Mode:**
Click "Exit Kids" button → enter PIN: `1234`

---

## Step 5 — Deploy

```bash
# Backend (if you changed anything there):
git add backend/ && git commit -m "streaming updates" && git push

# Frontend:
cd frontend
npm run build
netlify deploy --prod --dir=dist --site streammix
```

---

## What's new in the Player

### HLS Adaptive Bitrate
- HLS.js configured with optimised buffer sizes (30s ahead, 30s behind)
- Auto quality switching based on bandwidth estimation
- Manual quality picker (4K → 360p with kbps shown)
- Network speed displayed live in bottom bar

### Quality Levels
- `currentLevel = -1` = Auto (HLS.js picks best for connection)
- Manual override: click quality badge in bottom-right of player
- Shows actual quality HLS chose when in Auto mode

### Media Session API (Background Playback)
- Lock screen controls on mobile (play/pause/seek)
- Podcast-style now-playing info in notification shade
- Works on Android Chrome + iOS Safari

### Error Recovery
- Network errors: auto-retry up to 5× with exponential backoff
- Media decode errors: calls `hls.recoverMediaError()`
- Fatal errors: shows user-friendly error card with Retry button

### Kids Mode
- `/kids` route is now properly registered in App.tsx
- `profileStore` correctly syncs `isKids` flag from server
- Home.tsx redirects to `/kids` when active profile has `isKids: true`
- PIN numpad with shake animation on wrong PIN
- Physical keyboard support for PIN entry

---

## Keyboard Shortcuts (Player)

| Key | Action |
|-----|--------|
| Space / K | Play / Pause |
| ← / J | Back 10s |
| → / L | Forward 10/30s |
| ↑ / ↓ | Volume up/down |
| M | Mute |
| F | Fullscreen |
| P | Picture-in-Picture |

---

## What's NOT implemented (requires paid APIs / native apps)
- CloudFront / Akamai CDN — infrastructure, not code
- ExoPlayer / AVPlayer — Android/iOS native only
- MPEG-DASH — would need a DASH manifest source
- Hardware decoding — browser handles this automatically
