import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './lib/AuthProvider'
import { Layout } from './components/Layout'
import { Home } from './routes/Home'
import { Login } from './routes/Login'
import { Predictions } from './routes/Predictions'
import { Leaderboard } from './routes/Leaderboard'

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* /login is the only un-shelled route; everything else lives inside Layout. */}
          <Route path="/login" element={<Login />} />

          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="/predictions" element={<Predictions />} />
            <Route path="/predictions/leaderboard" element={<Leaderboard />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
