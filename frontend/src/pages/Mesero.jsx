import { useState, useEffect, useCallback } from 'react'
import { api, createWS } from '../api'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import Topbar from '../components/Topbar'
import Modal from '../components/Modal'
import styles from '../styles/mesero.module.css'
import { ShoppingCart, Search, Filter } from 'lucide-react'

const ESTACIONES = ['gorditas', 'menudo', 'antojitos']
const COLORES_ESTACION = { gorditas: '#f59e0b', menudo: '#3b82f6', antojitos: '#22c55e' }

export default function Mesero() {
  const { user } = useAuth()
  const toast = useToast()

  const [tab, setTab] = useState('mesas')
  const [mesas, setMesas] = useState([])
  const [productos, setProductos] = useState([])
  const [ordenes, setOrdenes] = useState([])

  // Modal states
  const [mesaSeleccionada, setMesaSeleccionada] = useState(null)
  const [modalOrden, setModalOrden] = useState(false)
  const [modalPago, setModalPago] = useState(null)   
  const [modalDivision, setModalDivision] = useState(null)

  // Modos globales de la interfaz
  const [modoCobroActivo, setModoCobroActivo] = useState(false)

  // Carrito
  const [carrito, setCarrito] = useState([])
  const [filtroEstacion, setFiltroEstacion] = useState('todos')
  const [busqueda, setBusqueda] = useState('')
  const [comensalActivo, setComensalActivo] = useState(1)

  // Modal modificador
  const [prodPendiente, setProdPendiente] = useState(null)

  // Pago
  const [pagos, setPagos] = useState([{ metodo: 'efectivo', monto: '' }])
  const [numDivisiones, setNumDivisiones] = useState(1)

  const cargarDatos = useCallback(async () => {
    try {
      const [m, p, o] = await Promise.all([
        api.get('/mesas/'),
        api.get('/productos/'),
        api.get('/ordenes/'),
      ])
      setMesas(m)
      setProductos(p)
      setOrdenes(o)
    } catch (e) {
      toast('Error al cargar datos', 'error')
    }
  }, [])

  useEffect(() => {
    cargarDatos()
    const unsub = createWS(`mesero_${user.id}`, msg => {
      console.log("¡Llegó un mensaje de la cocina!", msg);
      if (msg.tipo === 'mesa_actualizada') {
        setMesas(prev => prev.map(m => m.id === msg.mesa.id ? { ...m, ...msg.mesa } : m))
      }
      if (msg.tipo === 'orden_creada') {
        setOrdenes(prev => [...prev.filter(o => o.id !== msg.orden.id), msg.orden])
      }
      if (msg.tipo === 'orden_closed' || msg.tipo === 'orden_cerrada') {
        setOrdenes(prev => prev.filter(o => o.id !== msg.orden_id))
        if (msg.mesa) setMesas(prev => prev.map(m => m.id === msg.mesa.id ? { ...m, ...msg.mesa } : m))
      }
      if (msg.tipo === 'item_listo') {
        const identificadorMesa = msg.mesa 
          ? (msg.mesa.toString().toLowerCase().includes('mesa') ? msg.mesa : `Mesa ${msg.mesa}`) 
          : 'Mesa ?';

        if (msg.estado_cocina === 'listo') {
          toast(`¡Listo para entregar! ${identificadorMesa} — ${msg.producto} listo`, 'success')
        } else if (msg.estado_cocina === 'preparando') {
          toast(`En preparación: ${identificadorMesa} — ${msg.producto}`, 'info')
        }
        
        setOrdenes(prev => prev.map(o => {
          if (o.id !== msg.orden_id) return o
          return { ...o, items: o.items.map(i => i.id === msg.item_id ? { ...i, estado_cocina: msg.estado_cocina } : i) }
        }))
      }
    })
    return unsub
  }, [])

  // ── Carrito ──
  const agregarAlCarrito = (producto, modificador = null) => {
    const key = `${producto.id}_${modificador?.id ?? 'base'}_c${comensalActivo}`
    setCarrito(prev => {
      const exists = prev.find(c => c.key === key)
      if (exists) return prev.map(c => c.key === key ? { ...c, cantidad: c.cantidad + 1 } : c)
      let precio = producto.precio
      if (modificador) {
        precio += modificador.precio_extra || 0
        if (modificador.descuento_pct > 0) precio = precio * (1 - modificador.descuento_pct / 100)
      }
      return [...prev, { key, producto, modificador, cantidad: 1, precio, comentario: '', comensal: comensalActivo }]
    })
  }

  const clickProducto = (prod) => {
    const mods = prod.modificadores?.filter(m => !m.global_mod) || []
    if (mods.length > 0) {
      setProdPendiente(prod)
    } else {
      agregarAlCarrito(prod)
    }
  }

  const cambiarCantidad = (key, delta) => {
    setCarrito(prev => prev.map(c => c.key === key ? { ...c, cantidad: Math.max(1, c.cantidad + delta) } : c).filter(c => c.cantidad > 0))
  }

  const quitarItem = (key) => setCarrito(prev => prev.filter(c => c.key !== key))

  const totalCarrito = carrito.reduce((s, c) => s + c.precio * c.cantidad, 0)

  // ── Enviar orden ──
  let enviandoComanda = false;
  const enviarOrden = async () => {
    if (!mesaSeleccionada || carrito.length === 0) return
    try {
      enviandoComanda = true;
      const items = carrito.map(c => ({
        producto_id: c.producto.id,
        modificador_id: c.modificador?.id ?? null,
        shadow_id: null,
        cantidad: c.cantidad,
        comentario: c.comentario || null,
        comensal: c.comensal,
      }))
      await api.post('/ordenes/', { mesa_id: mesaSeleccionada.id, mesero_id: user.id, items })
      toast('Comanda enviada a cocina', 'success')
      setCarrito([])
      setModalOrden(false)
      setMesaSeleccionada(null)
      setComensalActivo(1)
      cargarDatos()
    } catch (e) {
      toast(e.message, 'error')
      enviandoComanda = false;
    }
  }

  // —— Buscar orden activa de la mesa ——
  const ordenDeMesa = (mesa) => {
    const ordenesAbiertas = ordenes.filter(o => o.mesa_id === mesa.id && (o.estado === 'abiega' || o.estado === 'abierta')) 
    if (ordenesAbiertas.length === 0) return null
    
    const granTotal = ordenesAbiertas.reduce((suma, o) => suma + o.total, 0)
    const todosLosItems = ordenesAbiertas.flatMap(o => o.items)
    
    return {
      id: ordenesAbiertas[0].id, 
      mesa_id: mesa.id,
      mesa_nombre: mesa.nombre,
      mesero_id: ordenesAbiertas[0].mesero_id, 
      total: granTotal,          
      items: todosLosItems,      
      ordenes_ids: ordenesAbiertas.map(o => o.id) 
    }
  }

  const verificarTodoListo = (orden) => {
    if (!orden || !orden.items) return false
    return orden.items.every(item => item.estado_cocina === 'listo')
  }

  const abrirPago = (orden) => {
    setModalPago(orden)
    setPagos([{ metodo: 'efectivo', monto: String(orden.total.toFixed(2)) }])
    setNumDivisiones(1)
  }

  const cobrar = async () => {
    if (!modalPago) return
    const pagosValidos = pagos.filter(p => p.monto && parseFloat(p.monto) > 0)
    if (pagosValidos.length === 0) { toast('Agrega al menos un pago', 'error'); return }
    try {
      await api.post(`/ordenes/${modalPago.id}/cerrar`, {
        pagos: pagosValidos.map(p => ({ metodo: p.metodo, monto: parseFloat(p.monto) })),
        num_divisiones: numDivisiones > 1 ? numDivisiones : null,
        mesero_id: user.id 
      })
      toast('Cuenta cerrada con éxito', 'success')
      setModalPago(null)
      cargarDatos()
    } catch (e) {
      toast(e.response?.data?.detail || e.message, 'error')
    }
  }

  const prodsFiltrados = productos.filter(p => {
    if (filtroEstacion !== 'todos' && p.estacion !== filtroEstacion) return false
    if (busqueda && !p.nombre.toLowerCase().includes(busqueda.toLowerCase())) return false
    return true
  })

  const tabs = [
    { id: 'mesas', label: 'Mesas', icon: '🪑' },
    { id: 'ordenes', label: 'Mis Órdenes', icon: '📋' },
  ]

  return (
    <div className={styles.page}>
      <Topbar tab={tab} setTab={setTab} tabs={tabs} />
      <div className={styles.content}>

{/* ── TAB MESAS ── */}
        {tab === 'mesas' && (
          <div className={styles['main-container']}>
            <div className={styles['mapa-header']}>
              <h1>Mapa de Mesas</h1>
              
              <div className={styles['header-controls']}>
                <div className={styles['leyenda-container']}>
                  <div className={styles['leyenda-item']}>
                    <span className={`${styles.dot} ${styles.disponible}`}></span> Disponible
                  </div>
                  
                  {/* ✨ NUEVA LEYENDA AGREGADA AQUÍ: */}
                  <div className={styles['leyenda-item']}>
                    <span className={`${styles.dot}`} style={{ backgroundColor: '#f59e0b' }}></span> Ordenando...
                  </div>

                  <div className={styles['leyenda-item']}>
                    <span className={`${styles.dot} ${styles.ocupada}`}></span> Ocupada
                  </div>
                </div>

                {/* EL BOTON SOLO APARECE SI HAY ORDENES ABIERTAS */}
                {ordenes.some(o => o.estado === 'abiega' || o.estado === 'abierta') && (
                  <button
                    className={`${styles.btn} ${modoCobroActivo ? styles['btn-cancelar'] : styles['btn-primary']} ${styles['btn-modo-cobro']}`}
                    onClick={() => setModoCobroActivo(!modoCobroActivo)}
                  >
                    {modoCobroActivo ? 'Cancelar Cobro' : 'Cobrar una Mesa'}
                  </button>
                )}
              </div>
            </div>

            {/* Grid de Tarjetas */}
            <div className={styles['mesa-scroll-wrapper']}>
              <div className={styles['mesa-grid']}>
                {mesas.map(mesa => {
                  const orden = ordenDeMesa(mesa)
                  const esDeOtroMesero = orden && orden.mesero_id && Number(orden.mesero_id) !== Number(user.id);
                  
                  // 1️⃣ PARTE DEL PASO B: Declarar constante de bloqueo en tiempo real
                  const estaBloqueadaPorOtro = mesa.estado === 'ordenando' && mesa.bloqueada_por && Number(mesa.bloqueada_por) !== Number(user.id);
                  
                  return (
                    <div
                      key={mesa.id}
                      className={`${styles['mesa-card']} ${styles[mesa.estado]} ${modoCobroActivo && orden && !esDeOtroMesero ? styles['mesa-cobro-pendiente'] : ''}`}
                      onClick={async () => {
                        // 2️⃣ PARTE DEL PASO B: Freno si la tiene otro compañero
                        if (estaBloqueadaPorOtro) {
                          toast('Otro mesero está tomando la orden en este momento ⏳', 'info');
                          return;
                        }

                        if (esDeOtroMesero) {
                          toast('Esta mesa está siendo atendida por otro mesero', 'info');
                          return;
                        }

                        // LOGICA DEL MODO ACTIVADO:
                        if (modoCobroActivo) {
                          if (orden) {
                            if(!verificarTodoListo(orden)){
                              toast('Cocina aún no termina el pedido', 'warning');
                              return;
                            }
                            
                            abrirPago(orden);
                            setModoCobroActivo(false);
                          } else {
                            toast('Esta mesa no tiene cuentas activas por cobrar', 'warning');
                          }
                        } else {
                          // 2️⃣ PARTE DEL PASO B: Si está disponible, la bloqueamos proactivamente antes de abrir el modal
                          if (mesa.estado === 'disponible') {
                            try {
                              await api.post(`/mesas/${mesa.id}/bloquear`, { mesero_id: user.id });
                            } catch (err) {
                              toast(err.response?.data?.detail || 'No se pudo apartar la mesa', 'error');
                              return; 
                            }
                          }

                          setMesaSeleccionada(mesa)
                          setCarrito([])
                          setComensalActivo(1) 
                          setModalOrden(true)
                        }
                      }}
                      /* 3️⃣ PARTE DEL PASO B: Opacar si está bloqueada por otro o añadir borde punteado si la tienes tú */
                      style={
                        (modoCobroActivo && (!orden || esDeOtroMesero)) || estaBloqueadaPorOtro
                          ? { opacity: 0.3, cursor: 'not-allowed' } 
                          : mesa.estado === 'ordenando' ? { border: '2px dashed #f59e0b' } : {}
                      }
                    >
                      {/* Cuerpo de la Tarjeta (Icono, Nombre, Capacidad) */}
                      <div className={styles['mesa-body']}>
                        {/* 3️⃣ PARTE DEL PASO B: Emoji dinámico (Candado si está bloqueada) */}
                        <span style={{ fontSize: 36 }}>{estaBloqueadaPorOtro ? '🔒' : '🪑'}</span>
                        <span className={styles['mesa-nombre']}>{mesa.nombre}</span>
                        <span className={styles['mesa-capacidad']}>Cap: {mesa.capacidad || 4}</span>
                        
                        {orden && (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 4, gap: 2 }}>
                            <span style={{ fontSize: 11, color: '#8a7665', fontWeight: 500 }}>
                              {orden.items.length} items
                            </span>
                            <span style={{ fontSize: 14, fontWeight: 700, color: '#be5a1c' }}>
                              ${orden.total.toFixed(2)}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Bloque de Estado Inferior */}
                      {/* 3️⃣ PARTE DEL PASO B: Texto de aviso de bloqueo y fondo naranja si está en proceso */}
                      <div className={styles['mesa-estado-block']} style={mesa.estado === 'ordenando' ? { backgroundColor: '#f59e0b', color: '#fff' } : {}}>
                        {estaBloqueadaPorOtro ? 'OCUPADA (TOMANDO ORDEN)' : modoCobroActivo && orden && !esDeOtroMesero ? 'COBRAR AQUÍ' : mesa.estado}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── TAB ORDENES ── */}
        {tab === 'ordenes' && (
          <div className={`${styles['main-container']} ${styles['contenedor-ordenes']}`}>
            <h2 style={{ marginBottom: 16, color: '#4a3b32', fontWeight: 600 }}>Mis Órdenes Activas</h2>
            
            <div className={styles['ordenes-scroll-wrapper']}>
              {ordenes.filter(o => Number(o.mesero_id) === Number(user.id)).length === 0
                ? <p style={{ color: '#8a7665' }}>No tienes órdenes activas.</p>
                : ordenes.filter(o => Number(o.mesero_id) === Number(user.id)).map(orden => (
                  <div key={orden.id} className={styles.card} style={{ marginBottom: 12, background: '#f7f1e5', border: '1px solid #e1d3bc' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <div>
                        <strong style={{ color: '#4a3b32', fontSize: 16 }}>{orden.mesa_nombre}</strong>
                        <span style={{ color: '#8a7665', marginLeft: 8, fontSize: 12 }}>
                          Orden #{orden.id} · {new Date(orden.creado_en.endsWith('Z') ? orden.creado_en : `${orden.creado_en}Z`).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <strong style={{ color: '#be5a1c', fontSize: 16 }}>${orden.total.toFixed(2)}</strong>
                        <button 
                          className={`${styles.btn} ${styles['btn-primary']} btn-sm`} 
                          onClick={() => {

                            if(!verificarTodoListo(orden)){
                              toast('Cocina auú no termina el pedido', 'warning')
                              return
                            }

                            abrirPago(orden)
                          }}
                        >
                          Cobrar
                        </button>
                      </div>
                    </div>
                    
                    {[...orden.items]
                      .sort((a, b) => (a.comensal || 1) - (b.comensal || 1))
                      .map(item => (
                        <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, padding: '4px 0' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                            <span style={{ color: '#be5a1c', fontWeight: 'bold', fontSize: 14 }}>{item.cantidad}x</span>
                            <span style={{ color: '#4a3b32', fontSize: 14 }}>{item.producto_nombre}</span>
                            {item.comensal && (
                              <span style={{ background: '#e0f2fe', color: '#0369a1', fontSize: 11, padding: '2px 6px', borderRadius: 4, fontWeight: 500 }}>
                                C{item.comensal}
                              </span>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <span className={`badge ${item.estado_cocina === 'listo' ? styles['badge-green'] : item.estado_cocina === 'preparando' ? styles['badge-amber'] : styles['badge-gray']}`}>
                              {(item.estado_cocina || 'pendiente').toUpperCase()}
                            </span>
                            <span style={{ color: '#4a3b32', fontSize: 14, fontWeight: 500 }}>
                              ${((item.precio_unitario || 0) * item.cantidad).toFixed(2)}
                            </span>
                          </div>
                        </div>
                      ))}
                  </div>
                ))
              }
            </div>
          </div>
        )}
      </div>

      {/* ── MODAL NUEVA ORDEN ── */}
      {modalOrden && mesaSeleccionada && (
        <div className={styles['modal-overlay']} style={{ backgroundColor: 'rgba(0, 0, 0, 0.4)', backdropFilter: 'blur(2px)' }}>
          <div className={styles.modal} style={{ maxWidth: 800, width: '95vw', background: '#fffaf3', border: '1px solid #ebdcc5' }}>
            
            <div className={styles['modal-orden-header']}>
              <h2 style={{ color: '#4a3b32', fontWeight: 600, margin: 0 }}>Nueva orden — {mesaSeleccionada.nombre}</h2>
              <button 
                onClick={async () => {
                  try {
                    // Quitamos el candado temporal 'ordenando' en el backend
                    await api.post(`/mesas/${mesaSeleccionada.id}/desbloquear`);
                  } catch (e) { 
                    console.log("Error al desbloquear mesa:", e); 
                  }
                  setModalOrden(false);
                  setMesaSeleccionada(null);
                }} 
                className={styles['btn-cerrar-fino']}
              >
                ✕
              </button>
            </div>

            <div className={styles['modal-orden-grid']} style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16, height: '65vh' }}>
              {/* Menu */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span className={`${styles.chip} ${filtroEstacion === 'todos' ? styles.active : ''}`} onClick={() => setFiltroEstacion('todos')}>Todos</span>
                  {ESTACIONES.map(e => (
                    <span key={e} className={`${styles.chip} ${filtroEstacion === e ? styles.active : ''}`} onClick={() => setFiltroEstacion(e)}
                      style={filtroEstacion === e ? { borderColor: COLORES_ESTACION[e], color: COLORES_ESTACION[e] } : {}}>
                      {e.charAt(0).toUpperCase() + e.slice(1)}
                    </span>
                  ))}
                </div>
                <input placeholder="Buscar producto..." value={busqueda} onChange={e => setBusqueda(e.target.value)} style={{ border: '1px solid #e1d3bc', background: '#fff' }} />
                <div style={{ flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, alignContent: 'start' }}>
                  {prodsFiltrados.map(prod => (
                    <div key={prod.id} className={styles['prod-card']} onClick={() => clickProducto(prod)} style={{ background: '#f7f1e5', border: '1px solid #e1d3bc' }}>
                      <div className={styles['prod-card-header']}>
                        <span className={styles['prod-nombre']} style={{ color: '#4a3b32' }}>{prod.nombre}</span>
                        <span className={styles['prod-precio']} style={{ color: '#be5a1c' }}>${prod.precio.toFixed(2)}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span className={styles['prod-estacion']} style={{ color: COLORES_ESTACION[prod.estacion], fontSize: 12, fontWeight: 600 }}>
                          ● {prod.estacion}
                        </span>
                        {prod.stock <= prod.stock_minimo && (
                          <span className={`badge ${styles['badge-red']}`} style={{ fontSize: 10 }}>Stock bajo</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Carrito */}
              <div style={{ display: 'flex', flexDirection: 'column', background: '#f7f1e5', border: '1px solid #e1d3bc', borderRadius: 10, padding: 14, overflow: 'hidden' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: 16, color: '#4a3b32' }}>🛒 Carrito ({carrito.length})</strong>
                  </div>
                  <div className={styles['select-comensal-container']}>
                    <span style={{ fontSize: 12, color: '#8a7665', fontWeight: 500, whiteSpace: 'nowrap' }}>
                      Asignar productos a:
                    </span>
                    <select 
                      value={comensalActivo} 
                      onChange={e => setComensalActivo(Number(e.target.value))}
                      className={styles['select-comensal']}
                      style={{ background: '#fff', border: '1px solid #e1d3bc' }}
                    >
                      {Array.from({length: mesaSeleccionada?.capacidad || 4}, (_, index) => {
                        const numeroComensal = index + 1;
                        return (
                          <option key={numeroComensal} value={numeroComensal}>
                            Comensal {numeroComensal}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>

                <div style={{ flex: 1, overflowY: 'auto' }}>
                  {carrito.length === 0
                    ? <p style={{ color: '#8a7665', fontSize: 13 }}>Agrega productos del menú</p>
                    : [...carrito]
                        .sort((a, b) => a.comensal - b.comensal)
                        .map(c => (
                          <div key={c.key} className={styles['carrito-item']} style={{ borderLeft: '3px solid #be5a1c', paddingLeft: 8, flexDirection: 'column', alignItems: 'stretch', gap: 6, borderBottom: '1px solid #e1d3bc', paddingBottom: 8, marginBottom: 4 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span className={`badge ${styles['badge-blue']}`} style={{ fontSize: 10, padding: '2px 6px', fontWeight: 600 }}>
                                👤 Comensal {c.comensal}
                              </span>
                              <span className={styles['ci-precio']} style={{ color: '#be5a1c', fontWeight: 600 }}>${(c.precio * c.cantidad).toFixed(2)}</span>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <div className={styles['ci-info']} style={{ flex: 1, marginRight: 8 }}>
                                <div className={styles['ci-nombre']} style={{ color: '#4a3b32', fontWeight: 600 }}>{c.producto.nombre}</div>
                                {c.modificador && <div className={styles['ci-mod']} style={{ color: '#8b5cf6', fontSize: 11 }}>{c.modificador.nombre}</div>}
                                <input
                                  placeholder="Comentario..."
                                  value={c.comentario}
                                  onChange={e => setCarrito(prev => prev.map(x => x.key === c.key ? { ...x, comentario: e.target.value } : x))}
                                  style={{ marginTop: 4, fontSize: 11, padding: '3px 6px', width: '100%', border: '1px solid #e1d3bc', background: '#fff' }}
                                />
                              </div>

                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                                <div className={styles['qty-ctrl']} style={{ background: '#fff', border: '1px solid #e1d3bc' }}>
                                  <button className={styles['qty-btn']} onClick={() => cambiarCantidad(c.key, -1)} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>−</button>
                                  <span style={{ minWidth: 20, textAlign: 'center', fontSize: 13, color: '#4a3b32', fontWeight: 600 }}>{c.cantidad}</span>
                                  <button className={styles['qty-btn']} onClick={() => cambiarCantidad(c.key, 1)} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>+</button>
                                </div>
                                <button onClick={() => quitarItem(c.key)} className={styles['btn-quitar']}>✕ quitar</button>
                              </div>
                            </div>
                          </div>
                        ))
                  }
                </div>
                <div className={styles.sep} style={{ backgroundColor: '#e1d3bc' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                  <strong style={{ color: '#4a3b32' }}>Total</strong>
                  <strong style={{ color: '#be5a1c', fontSize: 18 }}>${totalCarrito.toFixed(2)}</strong>
                </div>
                <button className={`${styles.btn} ${styles['btn-primary']}`} 
                disabled={carrito.length === 0} 
                onClick={enviarOrden}>
                  Enviar a cocina
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL MODIFICADORES ── */}
      {prodPendiente && (
        /* Al hacer clic en el fondo, se cierra la ventana */
        <div className={styles['modal-overlay']} onClick={() => setProdPendiente(null)}>
          
          {/* Con stopPropagation evitamos que los clics dentro del cuadro cierren el modal */}
          <div className={styles.modal} style={{ maxWidth: 500, width: '90vw' }} onClick={e => e.stopPropagation()}>
            
            {/* Encabezado del modal */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ color: '#4a3b32', fontSize: '1.4rem', fontWeight: 600, margin: 0 }}>
                Opciones — {prodPendiente.nombre}
              </h2>
              <button onClick={() => setProdPendiente(null)} className={styles['btn-cerrar-fino']}>✕</button>
            </div>

            <p style={{ color: '#8a7665', marginBottom: 12, fontSize: 13 }}>Selecciona una variante:</p>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '16px', padding: '10px 0', width: '100%' }}>
              <button className={styles['variante-item-btn']} onClick={() => { agregarAlCarrito(prodPendiente); setProdPendiente(null) }}>
                <span>Sin modificador</span>
                <span>${prodPendiente.precio.toFixed(2)}</span>
              </button>
              {prodPendiente.modificadores?.filter(m => !m.global_mod).map(mod => {
                let precio = prodPendiente.precio + (mod.precio_extra || 0)
                if (mod.descuento_pct > 0) precio = precio * (1 - mod.descuento_pct / 100)
                return (
                  <button key={mod.id} className={styles['variante-item-btn']} onClick={() => { agregarAlCarrito(prodPendiente, mod); setProdPendiente(null) }}>
                    <span>
                      {mod.nombre}
                      {mod.descuento_pct > 0 && <span className={`badge ${styles['badge-green']}`} style={{ marginLeft: 6 }}>-{mod.descuento_pct}%</span>}
                      {mod.precio_extra > 0 && <span className={`badge ${styles['badge-amber']}`} style={{ marginLeft: 6 }}>+${mod.precio_extra}</span>}
                    </span>
                    <span>${precio.toFixed(2)}</span>
                  </button>
                )
              })}
            </div>
            
            <div className={styles.sep} style={{ backgroundColor: '#e1d3bc' }} />
            
            <p style={{ color: '#8a7665', fontSize: 13, marginBottom: 8 }}>Extras globales:</p>
            {productos.length > 0 && (() => {
              const extraQueso = prodPendiente.modificadores?.find(m => m.global_mod)
              if (!extraQueso) return null
              return (
                <button className={styles['variante-item-btn']} onClick={() => { agregarAlCarrito(prodPendiente, extraQueso); setProdPendiente(null) }}>
                  <span>{extraQueso.nombre}</span>
                  <span>+${extraQueso.precio_extra.toFixed(2)}</span>
                </button>
              )
            })()}
            
          </div>
        </div>
      )}

      {/* ── MODAL COBRAR ── */}
      {modalPago && (
        /* Al hacer clic en el fondo, se cierra la ventana */
        <div className={styles['modal-overlay']} onClick={() => setModalPago(null)}>
          
          {/* Con stopPropagation impedimos que los clics dentro del recuadro cierren el modal */}
          <div className={styles.modal} style={{ maxWidth: 600, width: '95vw' }} onClick={e => e.stopPropagation()}>
            
            <div className={styles['modal-pago-wrapper']}>
              
              <div className={styles['modal-pago-header']}>
                <h2>Cobrar — {modalPago.mesa_nombre}</h2>
                <button onClick={() => setModalPago(null)} className={styles['btn-cerrar-fino']}>✕</button>
              </div>

              {/* Contenedor principal de itemsb*/}
              <div style={{ maxHeight: '40vh', overflowY: 'auto', marginBottom: 16, paddingRight: 4 }}>
                {(() => {
                  // Platillos consumidos por numero de comensal
                  const clasesComensales = modalPago.items.reduce((acc, item) => {
                    const c = item.comensal || 1;
                    if (!acc[c]) acc[c] = [];
                    acc[c].push(item);
                    return acc;
                  }, {});

                  // Renderizamos los bloques de cada comensal
                  return Object.keys(clasesComensales).sort().map(num => {
                    const itemsDelComensal = clasesComensales[num];
                    const subtotalComensal = itemsDelComensal.reduce((sum, i) => sum + i.precio_unitario * i.cantidad, 0);

                    return (
                      <div key={num} className={styles['comensal-block-cuenta']}>
                        <div className={styles['comensal-block-header']}>
                          <span>👤 Comensal {num}</span>
                          <span className={styles['subtotal-txt']}>${subtotalComensal.toFixed(2)}</span>
                        </div>
                        
                        <div className={styles['comensal-block-body']}>
                          {itemsDelComensal.map(item => (
                            <div key={item.id} className={styles['cuenta-item-line']}>
                              <span className={styles['item-line-nombre']}>
                                <strong className={styles['item-line-qty']}>{item.cantidad}x</strong>{' '}
                                {item.producto_nombre} 
                                {item.modificador_nombre ? ` (${item.modificador_nombre})` : ''}
                              </span>
                              <span className={styles['item-line-precio']}>
                                ${(item.precio_unitario * item.cantidad).toFixed(2)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>

              <div className={styles['cuenta-total-general-box']}>
                <span>Total General</span>
                <strong>${modalPago.total.toFixed(2)}</strong>
              </div>

              <div className={styles.sep} style={{ backgroundColor: '#e1d3bc', margin: '1.5rem 0' }} />
              
              <strong style={{ display: 'block', marginBottom: 12, color: '#4a3b32', fontSize: '1.05rem' }}>
                Métodos de pago
              </strong>
              
              {pagos.map((p, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <select 
                    value={p.metodo} 
                    onChange={e => setPagos(prev => prev.map((x, j) => j === i ? { ...x, metodo: e.target.value } : x))} 
                    style={{ flex: 1, border: '1px solid #e1d3bc', background: '#fff' }}
                  >
                    <option value="efectivo">Efectivo</option>
                    <option value="transferencia">Transferencia</option>
                    <option value="tarjeta">Tarjeta</option>
                  </select>
                  
                  <input 
                    type="number" 
                    placeholder="Monto" 
                    value={p.monto}
                    onChange={e => setPagos(prev => prev.map((x, j) => j === i ? { ...x, monto: e.target.value } : x))}
                    style={{ width: 110, border: '1px solid #e1d3bc', background: '#fff' }} 
                  />
                  
                  {pagos.length > 1 && (
                    <button 
                      className={styles['btn-quitar']} 
                      onClick={() => setPagos(prev => prev.filter((_, j) => j !== i))} 
                      style={{ border: '1px solid #ef4444', color: '#ef4444', borderRadius: '6px', padding: '0 8px' }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              
              <button 
                className={styles['btn-agregar-pago-util']} 
                onClick={() => setPagos(p => [...p, { metodo: 'efectivo', monto: '' }])}
              >
                + Agregar método de pago
              </button>

              <div className={styles['modal-pago-footer']}>
                <button className={`${styles.btn} ${styles['btn-cancelar']}`} onClick={() => setModalPago(null)}>
                  Cancelar
                </button>
                <button className={`${styles.btn} ${styles['btn-confirmar']}`} onClick={cobrar}>
                  Confirmar cobro
                </button>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  )
}