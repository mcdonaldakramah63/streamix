import { useEffect } from 'react'
import { startAdBlocker, stopAdBlocker, blockPopups } from '../utils/adBlocker'

export function useAdBlocker() {
  useEffect(() => {
    blockPopups()
    startAdBlocker()
    return () => stopAdBlocker()
  }, [])
}
