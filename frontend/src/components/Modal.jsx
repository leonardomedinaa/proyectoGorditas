import { useEffect } from 'react'
import { X } from 'lucide-react'

export default function Modal({ title, onClose, children, footer }) {
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose?.()}>
      <div className="modal">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>{title}</h2>
          {onClose && (
            <button 
              onClick={onClose} 
              className="btn btn-ghost btn-sm"
              style={{ padding: '0.375rem 0.5rem' }}
              title="Cerrar (Esc)"
            >
              <X size={20} />
            </button>
          )}
        </div>
        {children}
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  )
}
