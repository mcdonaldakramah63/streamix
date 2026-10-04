// /verify-email?uid=…&code=… — the link in the confirmation email (works on any device)
import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import api, { errorMessage } from '../services/api'
import AuthShell from '../components/AuthShell'
import Icon from '../components/Icon'

export default function VerifyEmail() {
  const [params] = useSearchParams()
  const [state, setState] = useState<'working' | 'done' | 'error'>('working')
  const [message, setMessage] = useState('')
  const once = useRef(false)

  useEffect(() => {
    if (once.current) return
    once.current = true
    const uid = params.get('uid') || '', code = params.get('code') || ''
    // Keep the code out of the address bar and browser history
    window.history.replaceState(null, '', '/verify-email')
    api.post('/auth/verify-email', { uid, code })
      .then(() => setState('done'))
      .catch(e => { setState('error'); setMessage(errorMessage(e, 'This link didn’t work')) })
  }, [params])

  return (
    <AuthShell badge="Email confirmation"
      title={state === 'done' ? 'Email confirmed' : state === 'error' ? 'Link didn’t work' : 'Confirming…'}
      subtitle={state === 'done' ? 'Your account is ready. Sign in to start watching.'
        : state === 'error' ? message
        : 'One moment while we check your link.'}
      footer={<Link to="/register" className="text-brand-soft font-bold hover:text-white">Need a new account?</Link>}>
      <div className="flex flex-col items-center gap-5 py-2">
        {state === 'working' && <span className="w-10 h-10 border-2 border-white/15 border-t-brand rounded-full animate-spin" role="status" aria-label="Checking" />}
        {state === 'done' && <span className="w-16 h-16 rounded-full bg-cyan/15 text-cyan flex items-center justify-center"><Icon name="mark_email_read" size={34} /></span>}
        {state === 'error' && <span className="w-16 h-16 rounded-full bg-brand/15 text-brand flex items-center justify-center"><Icon name="link_off" size={34} /></span>}
        {state !== 'working' && (
          <Link to="/login" className="btn-primary w-full h-12 text-[15px]">
            {state === 'done' ? 'Sign in' : 'Sign in to get a new code'} <Icon name="arrow_forward" size={20} />
          </Link>
        )}
      </div>
    </AuthShell>
  )
}
