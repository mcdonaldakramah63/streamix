// Shared layout for the sign-in / sign-up screens (Stitch "Login & Sign In")
import { Link } from 'react-router-dom'
import Logo from './Logo'

export default function AuthShell({ badge, title, subtitle, children, footer }: {
  badge: string; title: string; subtitle: string; children: React.ReactNode; footer: React.ReactNode
}) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 pt-24 pb-12 relative overflow-hidden">
      <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-96 h-96 bg-brand/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 -right-20 w-72 h-72 bg-cyan/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        <div className="flex flex-col items-center text-center mb-6">
          <Link to="/" aria-label="Streamix home" className="mb-6"><Logo /></Link>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-dark-border/70 backdrop-blur-md mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" />
            <span className="text-tech-pill uppercase text-ink-muted">{badge}</span>
          </span>
          <h1 className="text-3xl font-extrabold text-white tracking-tight mb-2">{title}</h1>
          <p className="text-sm text-ink-muted max-w-xs">{subtitle}</p>
        </div>

        <div className="rounded-2xl p-5 sm:p-6 shadow-xl" style={{ background: 'rgba(28,32,41,0.85)', backdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.06)' }}>
          {children}
        </div>
        <p className="text-center text-sm text-ink-muted mt-6">{footer}</p>
      </div>
    </div>
  )
}

export function Field({ id, label, icon, right, children }: { id: string; label: string; icon: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-[13px] font-semibold text-ink">{label}</label>
        {right}
      </div>
      <div className="relative flex items-center">
        <span className="icon absolute left-3.5 text-ink-faint pointer-events-none" style={{ fontSize: 20 }} aria-hidden="true">{icon}</span>
        {children}
      </div>
    </div>
  )
}
