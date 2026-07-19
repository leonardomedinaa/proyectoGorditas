import { useState } from 'react'
import { api } from '../api'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { AlertCircle } from 'lucide-react'
import styles from '../styles/login.module.css'
import logoRestaurante from '../assets/restaurante.png'

export default function Login() {
  const { login } = useAuth()
  const toast = useToast()
  
  // Estados lógicos del formulario
  const [form, setForm] = useState({ nombre: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [errorLocal, setErrorLocal] = useState('')

  // Envío del formulario
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
      //toast(mensajeError, 'error');
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className={styles['pantalla-dividida']}>
      
      {/* Columna Izquierda (Fondo o Imagen) */}
      <section className={styles['columna-izquierda']}></section>

      {/* Columna Derecha (Formulario de Login) */}
      <section className={styles['columna-derecha']}>
        <div className={styles['bloque-login']}>
          
          <img src={logoRestaurante} alt="Logo" className={styles.logo} />
          <hr className={styles['linea-decorativa']} />

          <form onSubmit={submit} className={styles.formulario}>
            <h2 className={styles.titulo}>Acceso de Staff</h2>
            
            {/* Input de Usuario */}
            <div className={styles['grupo-input']}>
              <input 
                type="text" 
                id="nombre" 
                name="nombre" 
                placeholder="Usuario" 
                required
                disabled={loading}
                className={styles.input}
                value={form.nombre}
                onChange={e => {
                  setErrorLocal('');
                  setForm(f => ({ ...f, nombre: e.target.value }));
                }}
                autoFocus
              />
            </div>
            
            {/* Input de Contraseña */}
            <div className={styles['grupo-input']}>
              <input 
                type={showPassword ? "text" : "password"} 
                id="pass" 
                name="password" 
                placeholder="Contraseña" 
                required
                disabled={loading}
                className={styles.input}
                value={form.password}
                onChange={e => {
                  setErrorLocal('');
                  setForm(f => ({ ...f, password: e.target.value }));
                }}
              />
              <span 
                className={`material-symbols-outlined ${styles.icon}`}
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? "visibility" : "visibility_off"}
              </span>
            </div>
            
            <button type="submit" className={styles['btn-staff']} disabled={loading}>
              {loading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
            </button>

            {errorLocal && (
              <div className={styles['alerta-error']}>
                <AlertCircle size={18} color="var(--brand-primary)" />
                <span>{errorLocal}</span>
              </div>
            )}
          </form>
          
        </div>
      </section>

    </main>
  )
}