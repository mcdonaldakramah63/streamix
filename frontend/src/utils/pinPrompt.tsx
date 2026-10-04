// Ask for a PIN from anywhere (promise-based), and retry API calls that need one
import { create } from 'zustand'
import PinModal from '../components/PinModal'

interface Req { title: string; subtitle: string; resolve: (pin: string | null) => void }
const usePinPrompt = create<{ req: Req | null }>(() => ({ req: null }))

/** Shows the PIN pad; resolves with the 4 digits, or null if cancelled */
export function askPin(title: string, subtitle: string): Promise<string | null> {
  return new Promise(resolve => usePinPrompt.setState({ req: { title, subtitle, resolve } }))
}

/** Mounted once in App */
export function PinPromptHost() {
  const req = usePinPrompt(s => s.req)
  if (!req) return null
  const done = (pin: string | null) => { usePinPrompt.setState({ req: null }); req.resolve(pin) }
  return <PinModal title={req.title} subtitle={req.subtitle} onSubmit={async pin => { done(pin); return null }} onCancel={() => done(null)} />
}

/**
 * Runs `call(pins)`. If the server answers 403 { needsPin: 'profile' | 'parent' }, asks for that PIN
 * and tries again (up to 3 wrong tries). Throws the last error if cancelled or still refused.
 */
export async function withPinRetry<T>(call: (pins: { currentPin?: string; parentPin?: string }) => Promise<T>, profileName = 'this profile'): Promise<T> {
  const pins: { currentPin?: string; parentPin?: string } = {}
  let tries = 0
  for (;;) {
    try { return await call(pins) }
    catch (e: any) {
      const need = e?.response?.status === 403 ? e.response.data?.needsPin : null
      if (!need || tries >= 3) throw e
      const again = tries > 0 ? 'Wrong PIN — try again. ' : ''
      const pin = need === 'parent'
        ? await askPin('Parent PIN', `${again}Enter the PIN of a grown-up profile`)
        : await askPin(`PIN for ${profileName}`, `${again}Enter the current 4-digit PIN`)
      if (!pin) throw e
      if (need === 'parent') pins.parentPin = pin; else pins.currentPin = pin
      tries++
    }
  }
}
