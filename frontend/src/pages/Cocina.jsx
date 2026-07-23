import { useState, useEffect, useCallback } from 'react'
import { api, createWS } from '../api'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import Topbar from '../components/Topbar'
import styles from '../styles/cocina.module.css'
import { Volume2, VolumeX, RefreshCw, CheckCircle } from 'lucide-react'

// 1. MAPEADOR DE ESTACIONES SEGÚN LOS NOMBRES DE USUARIO CREADOS EN DATABASE.PY
function estacionDeUsuario(nombre) {
  if (!nombre) return null
  const n = nombre.toLowerCase()
  if (n.includes('gordita')) return 'gorditas'
  if (n.includes('menudo'))  return 'menudo'
  if (n.includes('antojitos'))  return 'antojitos'
  return null
}

export default function Cocina() {
  const { user } = useAuth() 
  const toast = useToast()
  const estacion = estacionDeUsuario(user?.nombre)

  const [items, setItems] = useState([])
  const [sonido, setSonido] = useState(true)

  const beep = () => {
    if (!sonido) return
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
    osc.start(); osc.stop(ctx.currentTime + 0.4)
  }

  const cargar = useCallback(async () => {
    if (!estacion) return
    try {
      const data = await api.get(`/ordenes/cocina/${estacion}`)
      setItems(data)
    } catch { toast('Error al cargar comandas', 'error') }
  }, [estacion, toast])

  useEffect(() => {
    cargar()
    const room = `cocina_${estacion}`
    
    const unsub = createWS(room, msg => {
      console.log("📩 Mensaje recibido por WS:", msg)
      if (msg.tipo === 'nueva_comanda') {
        beep()
        toast(`🔔 Nueva comanda — ${msg.mesa}`, 'info', 5000)
        cargar()
      }
      if (msg.tipo === 'cierre_turno_global') {
        toast('⚠️ El turno ha sido cerrado por el Administrador. Reiniciando estación...', 'warning', 5000)
        
        localStorage.removeItem('token')
        sessionStorage.clear()
        
        setTimeout(() => {
          window.location.href = '/login'
        }, 3000)
      }
    })
    const intervalo = setInterval(() => {
      cargar()
    }, 5000)
    return () => {
      unsub()
      clearInterval(intervalo)
    }
  }, [cargar, estacion, toast])

  const cambiarEstado = async (ordenId, itemId, estado) => {
    try {
      await api.patch(`/ordenes/${ordenId}/item/${itemId}/estado`, { estado_cocina: estado })
      setItems(prev => prev.map(i => i.item_id === itemId ? { ...i, estado_cocina: estado } : i))
    } catch (e) { toast(e.message, 'error') }
  }

  const porOrden = items.reduce((acc, item) => {
    const key = item.orden_id
    if (!acc[key]) acc[key] = { orden_id: item.orden_id, mesa: item.mesa, items: [] }
    acc[key].items.push(item)
    return acc
  }, {})

  const grupos = Object.values(porOrden)

  // 2. TÍTULOS COINCIDENTES CON LAS ESTACIONES DE LA BASE DE DATOS
  const TITULO = {
    gorditas: '🫓 Estación Gorditas',
    menudo: '🍲 Estación Menudo',
    antojitos: '🌮 Estación Antojitos',
  }

  const capitalizar = (texto) => {
    if (!texto) return ''
    return texto.charAt(0).toUpperCase() + texto.slice(1).toLowerCase()
  }

  if (!estacion) {
    return (
      <div className={styles.page}>
        <Topbar />
        <div className={styles.content} style={{ textAlign: 'center', paddingTop: 60 }}>
          <p style={{ color: 'var(--text2)' }}>Este usuario no tiene una estación de cocina asignada.</p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      
      <Topbar esCocina={true}>
        <span style={{ 
          color: 'var(--topbar-text)', 
          fontSize: 'clamp(0.95rem, 3.5vw, 1.25rem)',
          fontWeight: 700,
          whiteSpace: 'nowrap'
        }}>
          {TITULO[estacion] || '🍳 Cocina'}
        </span>
        
        <div className={styles['topbar-controls-cocina']}>
          <button
            className={`${styles.btn} ${styles['btn-sm']} ${sonido ? styles['btn-primary'] : styles['btn-ghost']}`}
            onClick={() => setSonido(s => !s)}
            title={sonido ? 'Silenciar notificaciones' : 'Activar notificaciones'}
          >
            {sonido ? <Volume2 size={16} /> : <VolumeX size={16} />}
            <span>{sonido ? 'Sonido ON' : 'Sonido OFF'}</span>
          </button>
          
          <button className={`${styles.btn} ${styles['btn-ghost']} ${styles['btn-sm']}`} onClick={cargar} title="Recargar comandas">
            <RefreshCw size={16} />
            <span>Actualizar</span>
          </button>
          
          <span className={styles['ordenes-badge-cocina']}>
            {grupos.length} <span className={styles['ordenes-text-hide']}>orden(es)</span>
          </span>
        </div>
      </Topbar>

      <div className={styles.content}>
        {grupos.length === 0 ? (
          <div style={{ textAlign: 'center', paddingTop: '5rem' }}>
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>✅</div>
            <h2 style={{ color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Sin comandas pendientes</h2>
            <p style={{ color: 'var(--text-secondary)' }}>Las nuevas comandas aparecerán aquí automáticamente</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gridAutoRows: 'min-content', gap: '1.75rem', justifyContent: 'center' }}>
            {grupos.map(grupo => (
              <div key={grupo.orden_id} className={styles['comanda-card']}>
                
                <div className={styles['comanda-header']}>
                  <span className={styles['mesa-tag']}>🪑 {grupo.mesa}</span>
                  <span style={{ color: 'var(--text2)', fontSize: 12 }}>Orden #{grupo.orden_id}</span>
                </div>
                
                <div className={styles['comanda-body-scroll']}>
                  {[...grupo.items]
                    .sort((a, b) => (a.comensal || 1) - (b.comensal || 1))
                    .map(item => (
                      <div key={item.item_id} className={styles['comanda-item']}>
                        <span className={styles.qty}>{item.cantidad}</span>
                        
                        <div className={styles.info}>
                          <div className={styles.nombre}>
                            {item.producto}
                            {item.comensal && (
                              <span className={styles['comensal-badge']}>
                                C{item.comensal}
                              </span>
                            )}
                          </div>
                          {item.modificador && <div className={styles.mod}>▸ {item.modificador}</div>}
                          {item.comentario && <div className={styles.comment}>💬 {item.comentario}</div>}
                        </div>
                        
                        <div className={styles['comanda-actions']}>
                          <span className={`${styles.badge} ${
                            item.estado_cocina === 'listo' ? styles['badge-success'] :
                            item.estado_cocina === 'preparando' ? styles['badge-warning'] : styles['badge-gray']
                          }`}>
                            {item.estado_cocina === 'listo' && '✓ '}
                            {item.estado_cocina === 'preparando' && '⏱ '}
                            {item.estado_cocina === 'pendiente' && '⭕ '}
                            {capitalizar(item.estado_cocina)}
                          </span>
                          
                          <div className={styles['btn-container']}>
                            {item.estado_cocina === 'pendiente' && (
                              <button className={`${styles.btn} ${styles['btn-primary']} ${styles['btn-sm']}`}
                                onClick={() => cambiarEstado(item.orden_id, item.item_id, 'preparando')}>
                                Preparando
                              </button>
                            )}
                            
                            {item.estado_cocina === 'preparando' && (
                              <button className={`${styles.btn} ${styles['btn-success']} ${styles['btn-sm']}`}
                                onClick={() => cambiarEstado(item.orden_id, item.item_id, 'listo')}>
                                <CheckCircle size={14} />
                                Listo
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}