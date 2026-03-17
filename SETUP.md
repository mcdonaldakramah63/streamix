# Consumet API Setup Guide

## Step 1 — Deploy Consumet API to Render (free, 5 minutes)

1. Go to https://render.com and sign in

2. Click **New** → **Web Service**

3. Choose **"Public Git repository"** and paste:
   ```
   https://github.com/consumet/api.consumet.org
   ```

4. Fill in the settings:
   - **Name:** `consumet-api`
   - **Branch:** `main`
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** `Free`

5. Click **Create Web Service**

6. Wait for it to deploy (~3 minutes)

7. Copy your URL — it will look like:
   ```
   https://consumet-api-xxxx.onrender.com
   ```

8. Test it works — open in browser:
   ```
   https://consumet-api-xxxx.onrender.com/anime/zoro/naruto
   ```
   You should see JSON with anime results.

---

## Step 2 — Add CONSUMET_URL to your Streamix backend on Render

1. Go to your **streamix-usak** service on Render
2. Click **Environment** tab
3. Add new variable:
   ```
   Key:   CONSUMET_URL
   Value: https://consumet-api-xxxx.onrender.com
   ```
   (use your actual Consumet URL)
4. Click **Save Changes** — backend will auto-redeploy

---

## Step 3 — Add stream route to backend/server.js

Open `backend/server.js` and add:
```js
// Near the top with other requires:
const streamRoutes = require('./routes/stream')

// In the routes section:
app.use('/api/stream', streamRoutes)
```

---

## Step 4 — Copy files to your project

### Backend (new/replace):
```
backend/models/User.js                             ← REPLACE
backend/controllers/streamController.js            ← NEW
backend/routes/stream.js                           ← NEW
```

### Frontend (new/replace):
```
frontend/index.html                                ← REPLACE
frontend/src/components/HLSPlayer.tsx              ← NEW
frontend/src/hooks/useConsumet.ts                  ← NEW
frontend/src/stores/continueWatchingStore.ts       ← REPLACE
frontend/src/pages/Player.tsx                      ← REPLACE
```

---

## Step 5 — Push backend + rebuild frontend

```bash
# Push backend changes (Render auto-redeploys)
git add backend/
git commit -m "add Consumet stream integration"
git push

# Rebuild frontend
cd frontend
npm run build
netlify deploy --prod --dir=dist --site rococo-ganache-66df94
```

---

## How it works after setup

When you open a player page:

1. App searches Consumet for a direct `.m3u8` stream
2. **If found (HLS mode):**
   - Custom HLS.js player loads with full controls
   - Quality selector (Auto / 1080p / 720p / 480p)
   - Subtitles (CC button)
   - Seek bar with exact position
   - **Timestamp saved every 10 seconds to MongoDB**
   - **Resume button resumes to exact second** ✅
3. **If not found (Embed mode):**
   - Falls back to your existing VidSrc/MultiEmbed iframes
   - Progress still tracked by time estimate

The player page shows:
- 🟢 "● HLS" = direct stream, exact resume works
- 🟡 "● Embed" = iframe fallback, resume to episode only

---

## Content coverage

| Content | Stream source | Exact resume |
|---------|--------------|-------------|
| Anime | Zoro/Hianime via Consumet | ✅ Yes |
| Movies | Flixhx via Consumet | ✅ Yes (when available) |
| TV Shows | Flixhx via Consumet | ✅ Yes (when available) |
| Fallback | VidSrc/MultiEmbed iframes | Episode only |
