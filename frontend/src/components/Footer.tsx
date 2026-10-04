import { Link } from 'react-router-dom'
import Logo from './Logo'

export default function Footer() {
  return (
    <footer className="mt-12 py-8 px-4 sm:px-6 lg:px-12 border-t border-white/[0.06] hidden md:block">
      <div className="max-w-[1800px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <Link to="/" aria-label="Streamix home"><Logo /></Link>
        <nav className="flex items-center gap-6 text-xs font-semibold text-ink-faint">
          <Link to="/movies"    className="hover:text-white">Movies</Link>
          <Link to="/tv"        className="hover:text-white">TV Shows</Link>
          <Link to="/anime"     className="hover:text-white">Anime</Link>
          <Link to="/watchlist" className="hover:text-white">My List</Link>
          <Link to="/downloads" className="hover:text-white">Downloads</Link>
        </nav>
        <p className="text-xs text-ink-faint">© {new Date().getFullYear()} Streamix · Data from TMDB</p>
      </div>
    </footer>
  )
}
