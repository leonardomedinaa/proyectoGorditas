import { useState } from 'react'
import { api } from '../api'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { LogIn, AlertCircle } from 'lucide-react'
import Boton from '../components/Boton'
import '../styles/login.css'
import logoRestaurante from '../assets/restaurante.png'

export default function Login() {
  const { login } = useAuth()
  const toast = useToast()
  
  // 1. Estados lógicos del formulario
  const [form, setForm] = useState({ nombre: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false) // Estado para el ojito 👁️
  const [errorLocal, setErrorLocal] = useState('')

  // 2. Envío del formulario al backend de Python
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
      const mensajeError = err.response?.data?.detail || err.message || 'Error al iniciar sesión';
      setErrorLocal(mensajeError)
      
      toast(mensajeError, 'error');
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-root-wrapper">

      {/* ── TU INTERFAZ DE PANTALLA DIVIDIDA ── */}
      <main className="pantalla-dividida">
        
        {/* Columna Izquierda (Fondo o Imagen) */}
        <section className="columna-izquierda"></section>

        {/* Columna Derecha (Formulario de Login) */}
        <section className="columna-derecha">
          <div className="bloque-login">
            
            {/* Tu Logo */}
            <img src={logoRestaurante} alt="Logo" className="logo" />
            
            <hr className="linea-decorativa" />

            <form onSubmit={submit}>
              <fieldset disabled={loading}>
                <legend>Acceso de Staff</legend>
                
                {/* Input de Usuario */}
                <div className="grupo-input">
                  <input 
                    type="text" 
                    id="nombre" 
                    name="nombre" 
                    placeholder="Usuario" 
                    required
                    value={form.nombre}
                    onChange={e => {
                      setErrorLocal('');
                      setForm(f => ({ ...f, nombre: e.target.value }));
                    }}
                    autoFocus
                  />
                </div>
                
                {/* Input de Contraseña con tu lógica del ojito integrada */}
                <div className="grupo-input" style={{ position: 'relative' }}>
                  <input 
                    type={showPassword ? "text" : "password"} 
                    id="pass" 
                    name="password" 
                    placeholder="Contraseña" 
                    required
                    value={form.password}
                    onChange={e => { // 👈 Abre llave
                      setErrorLocal('');
                      setForm(f => ({ ...f, password: e.target.value }));
                    }}
                  />
                  {/* Icono interactivo usando Material Symbols o fallback de Lucide si prefieren */}
                  <span 
                    className="material-symbols-outlined icon"
                    style={{ cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? "visibility" : "visibility_off"}
                  </span>
                </div>
              </fieldset>
              
              {/* Tu nuevo componente de Botón Reutilizable adaptado al estado Loading */}
              <Boton type="submit" disabled={loading}>
                {loading ? (
                  <>
                    <span className="spinner" />
                    Iniciando sesión...
                  </>
                ) : (
                  <>
                    Iniciar Sesión
                  </>
                )}
              </Boton>
              {errorLocal && (
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px', 
                  color: '#3b240e', // Café oscuro a juego con tu legend
                  backgroundColor: '#ffebee', // Un fondo rojizo suave de advertencia
                  padding: '0.8rem', 
                  borderRadius: '8px', 
                  marginTop: '1rem',
                  width: '100%',
                  fontSize: '0.95rem',
                  fontWeight: '500',
                  border: '1px solid #dcc6b1'
                }}>
                  <AlertCircle size={18} color="#b05323" />
                  <span>{errorLocal}</span>
                </div>
              )}
            </form>
            
          </div>
        </section>

      </main>

      {/* Estilos locales mínimos para la animación del spinner del botón */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .spinner {
          display: inline-block;
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top: 2px solid white;
          border-radius: 50%;
          animation: spin 0.6s linear infinite;
          margin-right: 0.5rem;
        }
      `}</style>
    </div>
  )
}