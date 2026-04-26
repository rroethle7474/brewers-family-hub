import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './lib/AuthProvider'
import { ProtectedRoute } from './lib/ProtectedRoute'
import { ProfileProvider } from './lib/ProfileProvider'
import { ProfileGate } from './lib/ProfileGate'
import { Layout } from './components/Layout'
import { Home } from './routes/Home'
import { Login } from './routes/Login'
import { Predictions } from './routes/Predictions'
import { Leaderboard } from './routes/Leaderboard'
import { ProfileSetup } from './routes/ProfileSetup'

function App() {
  return (
    <AuthProvider>
      <ProfileProvider>
        <BrowserRouter>
          <Routes>
            {/* /login is the only un-shelled, un-gated route. */}
            <Route path="/login" element={<Login />} />

            {/* Authed routes. */}
            <Route element={<ProtectedRoute />}>
              {/* Profile setup is a sibling of ProfileGate so the gate can
                  redirect to it without looping. */}
              <Route path="/profile/setup" element={<ProfileSetup />} />

              <Route element={<ProfileGate />}>
                <Route element={<Layout />}>
                  <Route index element={<Home />} />
                  <Route path="/predictions" element={<Predictions />} />
                  <Route
                    path="/predictions/leaderboard"
                    element={<Leaderboard />}
                  />
                </Route>
              </Route>
            </Route>
          </Routes>
        </BrowserRouter>
      </ProfileProvider>
    </AuthProvider>
  )
}

export default App
