// frontend/src/components/Footer.tsx — NEW FILE
import { Link } from 'react-router-dom'

export default function Footer() {
  return (
    <footer className="border-t border-dark-border mt-8 py-8 px-4 sm:px-6"
      style={{ background: 'linear-gradient(to top, rgba(7,8,12,0.98) 0%, transparent 100%)' }}>
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">

          {/* Logo */}
          <Link to="/" className="text-brand font-bold text-lg flex-shrink-0"
            style={{ fontFamily: 'Syne, sans-serif' }}>
            STREAMIX
          </Link>

          {/* Links */}
          <div className="flex items-center gap-4 sm:gap-6 text-xs text-slate-500">
            <Link to="/"          className="hover:text-slate-300 transition-colors">Movies</Link>
            <Link to="/tv"        className="hover:text-slate-300 transition-colors">TV Shows</Link>
            <Link to="/anime"     className="hover:text-slate-300 transition-colors">Anime</Link>
            <Link to="/watchlist" className="hover:text-slate-300 transition-colors">Watchlist</Link>
          </div>

          {/* Copyright */}
          <p className="text-xs text-slate-700">
            © {new Date().getFullYear()} Streamix
          </p>
        </div>
      </div>
    </footer>
  )
}
