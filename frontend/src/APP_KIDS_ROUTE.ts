// ADD to frontend/src/App.tsx — add this import and route
// 1. Add import:
//    import KidsHome from './pages/KidsHome'
//
// 2. Add route inside <Routes> (put before the catch-all *):
//    <Route path="/kids" element={<KidsHome />} />
//
// Your Routes section becomes:
/*
<Routes>
  <Route path="/"              element={<Home />} />
  <Route path="/kids"          element={<KidsHome />} />   ← ADD
  <Route path="/movie/:id"     element={<MovieDetail />} />
  <Route path="/tv/:id"        element={<TVDetail />} />
  <Route path="/person/:id"    element={<PersonPage />} />
  <Route path="/player/:type/:id" element={<Player />} />
  <Route path="/search"        element={<Search />} />
  <Route path="/movies"        element={<Movies />} />
  <Route path="/anime"         element={<Anime />} />
  <Route path="/tv"            element={<TVShows />} />
  <Route path="/watchlist"     element={user ? <Watchlist />    : <Navigate to="/login" />} />
  <Route path="/profile"       element={user ? <Profile />      : <Navigate to="/login" />} />
  <Route path="/admin"         element={user?.isAdmin ? <Dashboard /> : <Navigate to="/" />} />
  <Route path="/login"         element={!user ? <Login />       : <Navigate to="/" />} />
  <Route path="/register"      element={!user ? <Register />    : <Navigate to="/" />} />
  <Route path="*"              element={<Navigate to="/" />} />
</Routes>
*/
export {}
