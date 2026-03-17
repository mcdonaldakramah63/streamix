import { useEffect, useRef, useCallback } from 'react'

/**
 * Returns a ref to attach to a sentinel element.
 * When that element scrolls into view, onLoadMore is called.
 */
export function useInfiniteScroll(
  onLoadMore: () => void,
  enabled: boolean = true
) {
  const sentinelRef = useRef<HTMLDivElement>(null)

  const cb = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (entries[0].isIntersecting && enabled) onLoadMore()
    },
    [onLoadMore, enabled]
  )

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const obs = new IntersectionObserver(cb, {
      root: null,
      rootMargin: '300px', // start fetching 300px before the bottom
      threshold: 0,
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [cb])

  return sentinelRef
}
