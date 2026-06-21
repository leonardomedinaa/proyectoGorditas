import { createContext, useContext, useState, useCallback } from 'react'
import styles from '../styles/toast.module.css'

const ToastCtx = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const addToast = useCallback((msg, type = 'info', duration = 3500) => {
    const id = Date.now() + Math.random()
    setToasts(t => [...t, { id, msg, type }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), duration)
  }, [])

  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' }

  return (
    <ToastCtx.Provider value={addToast}>
      {children}
      
      <div className={styles['toast-container']}>
        {toasts.map(t => (
          
          <div key={t.id} className={`${styles.toast} ${styles[t.type]}`}>
            <span>{icons[t.type]}</span>
            <span>{t.msg}</span>
          </div>
          
        ))}
      </div>
      
    </ToastCtx.Provider>
  )
}

export const useToast = () => useContext(ToastCtx)
