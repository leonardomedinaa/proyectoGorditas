import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { Power, User } from 'lucide-react' 
import styles from '../styles/topbar.module.css'

export default function Topbar({ tab, setTab, tabs, children, esCocina }) {
  const { user, logout } = useAuth()
  const [showName, setShowName] = useState(false)

  return (
    <div className={styles.topbar}>

      {tabs && (
        <nav className={styles['topbar-nav']}>
          {tabs.map(t => (
            <button
              key={t.id}
              className={`${styles['nav-btn']} ${tab === t.id ? styles.active : ''}`}
              onClick={() => setTab(t.id)}
              title={t.label}
            >
              <span className={styles['nav-icon']}>{t.icon}</span>
              <span className={styles['nav-label']}>{t.label}</span>
            </button>
          ))}
        </nav>
      )}

      {children && (
        <div className={styles['topbar-center-content']}>
          {children}
        </div>
      )}


      <div className={styles['topbar-user-section']}>
        {!esCocina && (
          <div 
            className={`${styles.user} ${showName ? styles.active : ''}`}
            onClick={() => setShowName(!showName)}
            style={{cursor: 'pointer'}}
          >
            <User className={styles['user-avatar-icon']} />
            <span>{user?.nombre}</span>
          </div>
        )}
        
        <button className={styles['btn-salir-minimal']} onClick={logout}>
          <Power className={styles['salir-icon']} />
          <span>Salir</span>
        </button>
      </div>
    </div>
  )
}