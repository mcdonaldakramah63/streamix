// Safe DOM-only ad blocker — no service worker, no window.location tampering

const AD_SELECTORS = [
  '.adsbygoogle', 'ins.adsbygoogle',
  '[id^="google_ads"]', '[id^="div-gpt-ad"]',
  '#ads-overlay', '.ads-overlay', '#ad-overlay', '.ad-overlay',
  '.fullscreen-ad', '.video-ads', '#preroll', '.preroll-ad',
  'iframe[src*="doubleclick.net"]',
  'iframe[src*="googlesyndication.com"]',
  'iframe[src*="popads.net"]',
  'iframe[src*="exoclick.com"]',
  'iframe[src*="trafficjunky.net"]',
  'iframe[src*="adcash.com"]',
  'iframe[src*="propellerads.com"]',
]

let observer: MutationObserver | null = null
let intervalId: ReturnType<typeof setInterval> | null = null

function removeAds() {
  AD_SELECTORS.forEach(sel => {
    try {
      document.querySelectorAll(sel).forEach(el => el.remove())
    } catch {}
  })
}

export function startAdBlocker() {
  removeAds()
  observer = new MutationObserver(() => removeAds())
  observer.observe(document.body, { childList: true, subtree: true })
  intervalId = setInterval(removeAds, 3000)
}

export function stopAdBlocker() {
  observer?.disconnect()
  observer = null
  if (intervalId) clearInterval(intervalId)
}

// Block popup windows from ad clicks only
export function blockPopups() {
  const orig = window.open.bind(window)
  window.open = function (url?: string | URL, target?: string, features?: string) {
    if (!url) return null
    const s = url.toString()
    if (
      s.startsWith('/') ||
      s.startsWith('#') ||
      s.includes(window.location.hostname) ||
      s.includes('youtube.com') ||
      s.includes('themoviedb.org') ||
      s.includes('yts.mx')
    ) {
      return orig(url, target, features)
    }
    console.log('[AdBlock] Blocked popup:', s)
    return null
  }
}
