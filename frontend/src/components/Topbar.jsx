import { useAuth } from '../context/AuthContext'
import { LogOut, User } from 'lucide-react'

export default function Topbar({ tab, setTab, tabs }) {
  const { user, logout } = useAuth()

  return (
    <div className="topbar">
      <span className="topbar-brand">Las Tres Marías</span>

      {tabs && (
        <nav className="topbar-nav">
          {tabs.map(t => (
            <button
              key={t.id}
              className={`nav-btn${tab === t.id ? ' active' : ''}`}
              onClick={() => setTab(t.id)}
              title={t.label}
            >
              <span style={{ fontSize: '1.125rem' }}>{t.icon}</span>
              <span className="nav-label">{t.label}</span>
            </button>
          ))}
        </nav>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginLeft: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
          <User size={18} />
          <span>{user?.nombre}</span>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={logout}>
          <LogOut size={16} />
          <span>Salir</span>
        </button>
      </div>
    </div>
  )
}
