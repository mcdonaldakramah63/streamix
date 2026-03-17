import { Link } from 'react-router-dom'

export default function Footer() {
  return (
    <footer className="bg-dark-surface border-t border-dark-border mt-8 sm:mt-12">
      <div className="max-w-6xl mx-auto px-4 py-6 sm:py-8">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
          <Link to="/" className="text-brand font-black text-lg tracking-tight">STREAMIX</Link>
          <div className="flex gap-4 sm:gap-6 text-sm text-slate-500 flex-wrap justify-center">
            <Link to="/"          className="hover:text-slate-300 transition-colors">Movies</Link>
            <Link to="/tv"        className="hover:text-slate-300 transition-colors">TV Shows</Link>
            <Link to="/anime"     className="hover:text-slate-300 transition-colors">Anime</Link>
            <Link to="/watchlist" className="hover:text-slate-300 transition-colors">Watchlist</Link>
          </div>
          <div className="text-xs text-slate-600 text-center">© {new Date().getFullYear()} Streamix. Personal use only.</div>
        </div>
      </div>
    </footer>
  )
}
