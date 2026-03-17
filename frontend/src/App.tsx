import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './context/authStore'
import { useAdBlocker } from './hooks/useAdBlocker'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import Home from './pages/Home'
import TVShows from './pages/TVShows'
import Anime from './pages/Anime'
import MovieDetail from './pages/MovieDetail'
import TVDetail from './pages/TVDetail'
import Player from './pages/Player'
import Search from './pages/Search'
import Login from './pages/Login'
import Register from './pages/Register'
import Profile from './pages/Profile'
import Watchlist from './pages/Watchlist'
import AdminDashboard from './pages/admin/Dashboard'

const PrivateRoute = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuthStore()
  return user ? <>{children}</> : <Navigate to="/login" />
}

const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuthStore()
  return user?.isAdmin ? <>{children}</> : <Navigate to="/" />
}

export default function App() {
  useAdBlocker()

  return (
    <div className="min-h-screen bg-dark text-white flex flex-col">
      <Navbar />
      {/* pb-16 on mobile to account for bottom tab bar; md:pb-0 removes it on desktop */}
      <main className="flex-1 pb-16 md:pb-0">
        <Routes>
          <Route path="/"                 element={<Home />} />
          <Route path="/tv"               element={<TVShows />} />
          <Route path="/anime"            element={<Anime />} />
          <Route path="/movie/:id"        element={<MovieDetail />} />
          <Route path="/tv/:id"           element={<TVDetail />} />
          <Route path="/player/:type/:id" element={<Player />} />
          <Route path="/search"           element={<Search />} />
          <Route path="/login"            element={<Login />} />
          <Route path="/register"         element={<Register />} />
          <Route path="/profile"          element={<PrivateRoute><Profile /></PrivateRoute>} />
          <Route path="/watchlist"        element={<PrivateRoute><Watchlist /></PrivateRoute>} />
          <Route path="/admin"            element={<AdminRoute><AdminDashboard /></AdminRoute>} />
        </Routes>
      </main>
      <Footer />
    </div>
  )
}
