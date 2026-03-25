// ADD to frontend/src/App.tsx
// 1. Import Footer at the top:
//    import Footer from './components/Footer'
//
// 2. Import PersonPage:
//    import PersonPage from './pages/PersonPage'
//
// 3. Add PersonPage route inside <Routes>:
//    <Route path="/person/:id" element={<PersonPage />} />
//
// 4. Wrap your routes in a layout div and add Footer at the bottom:
//
// Your App.tsx should look roughly like this:
//
// export default function App() {
//   return (
//     <Router>
//       <Navbar />
//       <main>
//         <Routes>
//           <Route path="/"              element={<Home />} />
//           <Route path="/movie/:id"     element={<MovieDetail />} />
//           <Route path="/tv/:id"        element={<TVDetail />} />
//           <Route path="/person/:id"    element={<PersonPage />} />
//           <Route path="/player/:type/:id" element={<Player />} />
//           <Route path="/search"        element={<Search />} />
//           <Route path="/movies"        element={<Movies />} />
//           <Route path="/anime"         element={<Anime />} />
//           <Route path="/tv"            element={<TVShows />} />
//           <Route path="/watchlist"     element={<Watchlist />} />
//           <Route path="/profile"       element={<Profile />} />
//           <Route path="/login"         element={<Login />} />
//           <Route path="/register"      element={<Register />} />
//           <Route path="/admin"         element={<AdminDashboard />} />
//         </Routes>
//       </main>
//       <Footer />
//     </Router>
//   )
// }
