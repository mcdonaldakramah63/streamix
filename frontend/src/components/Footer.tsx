import { Link } from 'react-router-dom'

export default function Footer() {
  return (
    <footer className="bg-dark-surface border-t border-dark-border mt-12">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <Link to="/" className="text-brand font-black text-lg tracking-tight">STREAMIX</Link>
          <div className="flex gap-6 text-sm text-slate-500">
            <Link to="/"          className="hover:text-slate-300 transition-colors">Movies</Link>
            <Link to="/search"    className="hover:text-slate-300 transition-colors">Search</Link>
            <Link to="/watchlist" className="hover:text-slate-300 transition-colors">Watchlist</Link>
            <Link to="/login"     className="hover:text-slate-300 transition-colors">Sign In</Link>
          </div>
          <div className="text-xs text-slate-600">© {new Date().getFullYear()} Streamix. For personal use only.</div>
        </div>
      </div>
    </footer>
  )
}
