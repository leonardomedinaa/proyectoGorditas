import { useState } from 'react'
import { api } from '../api'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { LogIn, AlertCircle } from 'lucide-react'

export default function Login() {
  const { login } = useAuth()
  const toast = useToast()
  const [form, setForm] = useState({ nombre: '', password: '' })
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (!form.nombre || !form.password) {
      toast('Por favor completa todos los campos', 'error')
      return
    }
    setLoading(true)
    try {
      const user = await api.post('/auth/login', form)
      login(user)
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-box">
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ fontSize: '3.5rem', marginBottom: '1rem' }}>🌮</div>
          <h1 style={{ margin: 0, marginBottom: '0.5rem' }}>Las Tres Marías</h1>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '1rem' }}>
            Sistema de Punto de Venta
          </p>
        </div>

        <form onSubmit={submit}>
          <div className="form-field">
            <label htmlFor="nombre">Usuario</label>
            <input
              id="nombre"
              value={form.nombre}
              onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
              placeholder="Nombre de usuario"
              autoFocus
              disabled={loading}
            />
          </div>
          <div className="form-field">
            <label htmlFor="password">Contraseña</label>
            <input
              id="password"
              type="password"
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              placeholder="••••••••"
              disabled={loading}
            />
          </div>
          <button 
            className="btn btn-primary btn-lg" 
            style={{ width: '100%', marginTop: '1.5rem' }} 
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="spinner" style={{ width: '16px', height: '16px', border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid white', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
                Iniciando sesión...
              </>
            ) : (
              <>
                <LogIn size={18} />
                Iniciar sesión
              </>
            )}
          </button>
        </form>

        <div className="sep" />
        
        <div style={{ backgroundColor: 'rgba(6, 182, 212, 0.05)', border: '1px solid rgba(6, 182, 212, 0.3)', borderRadius: '0.5rem', padding: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center', color: 'var(--info)', fontSize: '0.9rem', fontWeight: 600 }}>
            <AlertCircle size={16} />
            <span>Usuarios de prueba:</span>
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <div><strong>Admin:</strong> admin / admin123</div>
            <div><strong>Mesero:</strong> Mesero 1 / mesero1</div>
            <div><strong>Cocina:</strong> Cocina Gorditas / gorditas</div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .spinner {
          display: inline-block;
        }
      `}</style>
    </div>
  )
}
