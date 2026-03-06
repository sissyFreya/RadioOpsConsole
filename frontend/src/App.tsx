import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import { AppLayout } from './components/AppLayout'
import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'
import { NodesPage } from './pages/NodesPage'
import { RadiosPage } from './pages/RadiosPage'
import { RadioDetailPage } from './pages/RadioDetailPage'
import { PodcastsPage } from './pages/PodcastsPage'
import { ActionsPage } from './pages/ActionsPage'
import { LogsPage } from './pages/LogsPage'
import { AuditPage } from './pages/AuditPage'
import { UsersPage } from './pages/UsersPage'
import { LivePage } from './pages/LivePage'
import { ProfilePage } from './pages/ProfilePage'

function Private({ children }: { children: React.ReactNode }) {
  const { token, loading } = useAuth()
  if (loading) return <div className="min-h-screen bg-zinc-950 text-zinc-200 p-8">Loading...</div>
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/live/:id?" element={<LivePage />} />
      <Route
        path="/"
        element={
          <Private>
            <AppLayout />
          </Private>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="nodes" element={<NodesPage />} />
        <Route path="radios" element={<RadiosPage />} />
        <Route path="radios/:id" element={<RadioDetailPage />} />
        <Route path="podcasts" element={<PodcastsPage />} />
        <Route path="actions" element={<ActionsPage />} />
        <Route path="logs" element={<LogsPage />} />
        <Route path="audit" element={<AuditPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
