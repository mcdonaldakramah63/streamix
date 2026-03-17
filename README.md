# Continue Watching + Infinite Scroll Fix

## Files to copy

### Frontend
```
src/hooks/useInfiniteScroll.ts          ← (from previous update, keep it)
src/stores/continueWatchingStore.ts     ← REPLACE
src/context/authStore.ts                ← REPLACE
src/pages/Home.tsx                      ← REPLACE
src/pages/Player.tsx                    ← REPLACE
```

### Backend
```
backend/controllers/continueWatchingController.js   ← NEW FILE
backend/routes/users.js                             ← REPLACE
```

### Backend model update
Open `backend/models/User.js` and find the `continueWatching` array field.
Make sure each item in it has these fields:
```js
continueWatching: [{
  movieId:      { type: Number },
  title:        { type: String },
  poster:       { type: String, default: '' },
  backdrop:     { type: String, default: '' },
  type:         { type: String, default: 'movie' },
  season:       { type: Number, default: null },
  episode:      { type: Number, default: null },
  episodeName:  { type: String, default: '' },
  progress:     { type: Number, default: 0 },     // 0-100%
  durationMins: { type: Number, default: null },
  watchedAt:    { type: Date, default: Date.now },
}]
```

## Rebuild & deploy

```bash
# Backend — push to GitHub, Render will auto-redeploy
git add .
git commit -m "fix continue watching sync"
git push

# Frontend
cd frontend
npm run build
netlify deploy --prod --dir=dist --site rococo-ganache-66df94
```

## How it works now

### Cross-device sync
- When a user logs in, `authStore.setUser()` calls `useContinueWatching.fetch()`
- This hits `GET /api/users/continue-watching` and loads their full history from MongoDB
- Works on any device with the same account ✓

### Progress tracking
- When the player page opens, it immediately saves the entry (TV = exact season+episode)
- Every 30 seconds while watching, it recalculates progress % based on time spent
  vs typical runtime (actual runtime if available from TMDB)
- When navigating away (unmount), it saves one final time
- Progress is saved to both localStorage AND the backend

### Resume button
- Each continue watching card has a "Resume" button
- TV: resumes the exact season and episode (`/player/tv/123?season=2&episode=5`)
- Movie: opens the movie player
- The teal progress bar shows how far through they got

### What "where they left off" means
- For TV shows: exact episode is saved and resumed ✓
- For movies: the movie player reopens (iframe players don't expose seek position,
  so we can't scrub to the exact second — but the episode tracking for TV is precise)
