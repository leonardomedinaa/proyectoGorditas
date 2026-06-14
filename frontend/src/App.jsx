import { AuthProvider, useAuth } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import Login from './pages/Login'
import Mesero from './pages/Mesero'
import Cocina from './pages/Cocina'
import Admin from './pages/Admin'

function Router() {
  const { user } = useAuth()
  if (!user) return <Login />
  if (user.rol === 'admin')  return <Admin />
  if (user.rol === 'cocina') return <Cocina />
  return <Mesero />
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Router />
      </ToastProvider>
    </AuthProvider>
  )
}
