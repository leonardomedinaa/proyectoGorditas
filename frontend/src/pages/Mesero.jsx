import { useState, useEffect, useCallback, useRef } from 'react'
import { api, createWS } from '../api'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import Topbar from '../components/Topbar'
import Modal from '../components/Modal'
import styles from '../styles/mesero.module.css'
import { ShoppingCart, Search, Filter } from 'lucide-react'

const ESTACIONES = ['gorditas', 'menudo', 'antojitos']
const COLORES_ESTACION = { 
  gorditas: 'var(--station-gorditas)', 
  menudo: 'var(--station-menudo)', 
  antojitos: 'var(--station-antojitos)' 
}

export default function Mesero() {
  const { user } = useAuth()
  const toast = useToast()

  const ordenesRef = useRef([])

  const [tab, setTab] = useState('mesas')

  const [mesas, setMesas] = useState([])
  const [productos, setProductos] = useState([])
  const [ordenes, setOrdenes] = useState([])

  // Modal states
  const [precioInputModal, setPrecioInputModal] = useState('')
  const [mesaSeleccionada, setMesaSeleccionada] = useState(null)
  const [modalOrden, setModalOrden] = useState(false)
  const [modalPago, setModalPago] = useState(null)   
  const [modalDivision, setModalDivision] = useState(null)
  const [ordenACancelar, setOrdenACancelar] = useState(null)
  const [itemACancelar, setItemACancelar] = useState(null) // Guardará { ordenId, item }

  // Modos globales de la interfaz
  const [modoCobroActivo, setModoCobroActivo] = useState(false)

  // Carrito
  const [carrito, setCarrito] = useState([])
  const [filtroEstacion, setFiltroEstacion] = useState('todos')
  const [busqueda, setBusqueda] = useState('')
  const [comensalActivo, setComensalActivo] = useState('C1')

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
    ordenesRef.current = ordenes
  }, [ordenes])

useEffect(() => {
    cargarDatos()
    const unsub = createWS(`mesero_${user.id}`, msg => {
      console.log("¡Llegó un mensaje por WS!", msg);

      if (msg.tipo === 'cierre_turno_global') {
        toast('⚠️ El turno ha sido cerrado por el Administrador. Reiniciando sesión...', 'warning', 5000)
        localStorage.removeItem('token')
        sessionStorage.clear()
        setTimeout(() => { window.location.href = '/login' }, 3000)
        return
      }

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
        const miOrden = ordenesRef.current.find(o => o.id === msg.orden_id);
        const esMiOrden = miOrden && Number(miOrden.mesero_id) === Number(user.id);
        const identificadorMesa = msg.mesa 
          ? (msg.mesa.toString().toLowerCase().includes('mesa') ? msg.mesa : `Mesa ${msg.mesa}`) 
          : 'Mesa ?';
          
        if(esMiOrden){
          if (msg.estado_cocina === 'listo') {
            toast(`¡Listo para entregar! ${identificadorMesa} — ${msg.producto} listo`, 'success')
          } else if (msg.estado_cocina === 'preparando') {
            toast(`En preparación: ${identificadorMesa} — ${msg.producto}`, 'info')
          }
        }
        
        setOrdenes(prev => prev.map(o => {
          if (o.id !== msg.orden_id) return o
          return { ...o, items: o.items.map(i => i.id === msg.item_id ? { ...i, estado_cocina: msg.estado_cocina } : i) }
        }))
      }
      if (msg.tipo === 'item_cantidad_modificada') {
        setOrdenes(prev => prev.map(o => {
          if (o.id !== msg.orden_id) return o
          return {
            ...o,
            total: msg.nuevo_total,
            items: o.items.map(i => i.id === msg.item_id ? { ...i, cantidad: msg.nueva_cantidad } : i)
          }
        }))
      }
      // 🔴 AQUÍ VA EL EVENTO NUEVO DE ÍTEM CANCELADO
      if (msg.tipo === 'item_cancelado') {
        toast(`Ítem cancelado en Orden #${msg.orden_id}`, 'warning')

        if (msg.orden_cancelada_completa) {
          setOrdenes(prev => prev.filter(o => o.id !== msg.orden_id))
          
          // Si la API te envía la mesa liberada en el evento `msg.mesa`, 
          // actualizas solo la mesa sin llamar a cargarDatos():
          if (msg.mesa) {
            setMesas(prev => prev.map(m => m.id === msg.mesa.id ? { ...m, ...msg.mesa } : m))
          }
        } else {
          setOrdenes(prev => prev.map(o => {
            if (o.id !== msg.orden_id) return o
            return {
              ...o,
              total: msg.nuevo_total,
              items: o.items.map(i => i.id === msg.item_id ? { ...i, estado_cocina: 'cancelado' } : i)
            }
          }))
        }
      }
    })
    return unsub
  }, [])

  const cancelarOrden = async () => {
    if (!ordenACancelar) return;
    try {
      await api.post(`/ordenes/${ordenACancelar.id}/cancelar`, { mesero_id: user.id });
      toast('Orden cancelada correctamente', 'info');
      setOrdenes(prev => prev.filter(o => o.id !== ordenACancelar.id));
      cargarDatos();
    } catch (e) {
      toast(e.response?.data?.detail || e.message || 'Error al cancelar la orden', 'error');
    } finally {
      setOrdenACancelar(null);
    }
  };
  const cancelarItem = async () => {
    if (!itemACancelar) return
    try {
      await api.post(`/ordenes/${itemACancelar.ordenId}/items/${itemACancelar.item.id}/cancelar`, {
        mesero_id: user.id
      })
      toast('Platillo cancelado correctamente', 'info')
      // No hace falta llamar a cargarDatos() aquí porque el WS se encarga de actualizar el estado
    } catch (e) {
      toast(e.response?.data?.detail || e.message || 'Error al cancelar el platillo', 'error')
    } finally {
      setItemACancelar(null)
    }
  }
// ── Carrito ──
const agregarAlCarrito = (producto, modificador = null) => {
  const precioBase = producto.precio !== undefined ? producto.precio : 0
  const etiquetaComensal = comensalActivo && String(comensalActivo).trim() !== ''? String(comensalActivo).trim(): 'C1'
  const keyComensal = etiquetaComensal.replace(/\s+/g, '_')
  const key = `${producto.id}_${modificador?.id ?? 'base'}_p${precioBase}_c${keyComensal}`

  setCarrito(prev => {
    const exists = prev.find(c => c.key === key)
    if (exists) {
      return prev.map(c => c.key === key ? { ...c, cantidad: c.cantidad + 1 } : c)
    }

    let precioFinal = precioBase
    if (modificador) {
      precioFinal += modificador.precio_extra || 0
      if (modificador.descuento_pct > 0) {
        precioFinal = precioFinal * (1 - modificador.descuento_pct / 100)
      }
    }

    return [
      ...prev, 
      { 
        key, 
        producto, 
        modificador, 
        cantidad: 1, 
        precio: precioFinal, 
        comentario: '', 
        comensal: etiquetaComensal 
      }
    ]
  })
}

  const clickProducto = (prod) => {
  const tieneModificadores = prod.modificadores && prod.modificadores.length > 0;  
  const esBirria = prod.nombre?.toLowerCase().includes('birria') && !prod.nombre?.toLowerCase().includes('kg');
  const esMenudoParaLlevar = prod.nombre?.toLowerCase().includes('menudo') && prod.nombre?.toLowerCase().includes('llevar');

  if (tieneModificadores || esBirria) {
    setProdPendiente(prod); // Esto levanta el modal
  } else {
    agregarAlCarrito(prod); // Va directo al carrito si no tiene nada
  }
}
  const cambiarCantidad = (key, delta) => {
    setCarrito(prev => prev.map(c => c.key === key ? { ...c, cantidad: Math.max(1, c.cantidad + delta) } : c).filter(c => c.cantidad > 0))
  }

  const quitarItem = (key) => setCarrito(prev => prev.filter(c => c.key !== key))

  const totalCarrito = carrito.reduce((s, c) => s + c.precio * c.cantidad, 0)
  const totalIngresado = pagos.reduce((sum, p) => sum + (parseFloat(p.monto) || 0), 0);
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
        precio_unitario: c.precio,
      }))
      await api.post('/ordenes/', { mesa_id: mesaSeleccionada.id, mesero_id: user.id, items })
      toast('Comanda enviada a cocina', 'success')
      setCarrito([])
      setModalOrden(false)
      setMesaSeleccionada(null)
      setComensalActivo('C1')
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
const modificarCantidadItem = async (ordenId, itemId, nuevaCantidad) => {
  if (nuevaCantidad <= 0) return
  try {
    const res = await api.put(`/ordenes/${ordenId}/items/${itemId}/cantidad`, {
      nueva_cantidad: nuevaCantidad,
      mesero_id: user.id
    })

    toast('Cantidad modificada', 'success')

    // Extraemos valores asegurando que existan
    const nuevoTotal = res.data?.nuevo_total ?? res.data?.total
    const nuevaCant = res.data?.nueva_cantidad ?? nuevaCantidad

    setOrdenes(prev => prev.map(o => {
      if (Number(o.id) !== Number(ordenId)) return o

      return {
        ...o,
        // Si por algo no viene el total, se recalcula localmente para evitar NaN
        total: nuevoTotal !== undefined && !isNaN(nuevoTotal) 
          ? Number(nuevoTotal) 
          : o.items.reduce((acc, item) => {
              const cant = Number(item.id) === Number(itemId) ? nuevaCant : item.cantidad
              return item.estado_cocina !== 'cancelado' ? acc + ((item.precio_unitario || 0) * cant) : acc
            }, 0),

        items: o.items.map(i => 
          Number(i.id) === Number(itemId) 
            ? { ...i, cantidad: Number(nuevaCant) } 
            : i
        )
      }
    }))
  } catch (e) {
    console.error("Error al modificar cantidad:", e)
    toast(e.response?.data?.detail || 'Error al modificar cantidad', 'error')
  }
}
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
                  
                  <div className={styles['leyenda-item']}>
                    <span className={`${styles.dot}`} style={{ backgroundColor: 'var(--color-ordenando)' }}></span> Ordenando...
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
                {mesas.sort((a, b) => a.nombre.localeCompare(b.nombre, undefined, { numeric: true, sensitivity: 'base' }))
                .map(mesa => {
                  const orden = ordenDeMesa(mesa)
                  const esDeOtroMesero = orden && orden.mesero_id && Number(orden.mesero_id) !== Number(user.id);
                  
                  // Declarar constante de bloqueo en tiempo real
                  const estaBloqueadaPorOtro = mesa.estado === 'ordenando' && mesa.bloqueada_por && Number(mesa.bloqueada_por) !== Number(user.id);
                  const claseEstado = styles[mesa.estado] || styles.disponible;

                  return (
                    <div
                      key={mesa.id}
                      className={`
                        ${styles['mesa-card']} 
                        ${claseEstado} 
                        ${modoCobroActivo && orden && !esDeOtroMesero ? styles['mesa-cobro-pendiente'] : ''}
                        ${(modoCobroActivo && (!orden || esDeOtroMesero)) || estaBloqueadaPorOtro ? styles['mesa-deshabilitada'] : ''}
                      `}
                      onClick={async () => {
                        // Freno si la tiene otro compañero
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
                          // Si está disponible, la bloqueamos proactivamente antes de abrir el modal
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
                    >
                      {/* Cuerpo de la Tarjeta (Icono, Nombre, Capacidad) */}
                      <div className={styles['mesa-body']}>
                        {/*Emoji dinámico con clase limpia */}
                        <span className={styles['mesa-icon']}>{estaBloqueadaPorOtro ? '🔒' : '🪑'}</span>
                        <span className={styles['mesa-nombre']}>{mesa.nombre}</span>
                        <span className={styles['mesa-capacidad']}>Cap: {mesa.capacidad || 4}</span>
                        
                        {orden && (
                          <div className={styles['mesa-orden-info']}>
                            <span className={styles['mesa-orden-items']}>
                              {orden.items.length} {orden.items.length === 1 ? 'Item' : 'Items'}
                            </span>
                            <span className={styles['mesa-orden-total']}>
                              ${orden.total.toFixed(2)}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Bloque de Estado Inferior */}
                      {/* Texto de aviso de bloqueo y fondo naranja si está en proceso */}
                      <div 
                        className={`${styles['mesa-estado-block']} ${mesa.estado === 'ordenando' ? styles['mesa-estado-ordenando'] : ''}`}
                      >
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
            <h2 style={{ marginBottom: '16px', color: 'var(--text-main)', fontWeight: 600 }}>Mis Órdenes Activas</h2>
            
            <div className={styles['ordenes-scroll-wrapper']}>
              {ordenes.filter(o => Number(o.mesero_id) === Number(user.id)).length === 0
                ? <p style={{ color: 'var(--text-secondary)' }}>No tienes órdenes activas.</p>
                : ordenes.filter(o => Number(o.mesero_id) === Number(user.id)).map(orden => (
                  <div key={orden.id} className={styles.card} style={{ marginBottom: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <div>
                        <strong style={{ color: 'var(--text-main)', fontSize: '16px' }}>{orden.mesa_nombre}</strong>
                        <span style={{ color: 'var(--text-secondary)', marginLeft: '8px', fontSize: '12px' }}>
                          Orden #{orden.id} · {new Date(orden.creado_en.endsWith('Z') ? orden.creado_en : `${orden.creado_en}Z`).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <strong style={{ color: 'var(--color-primary)', fontSize: '16px' }}>${orden.total.toFixed(2)}</strong>
                        <button 
                          className={styles['btn-cancelar-orden']}
                          onClick={() => setOrdenACancelar(orden)}>Cancelar Orden
                        </button>
                      </div>
                    </div>
                    
                    {[...orden.items]
                    .filter(item => item.estado_cocina !== 'cancelado')
                    .map(item => {
                      // 🛑 Determinar si la modificación está bloqueada
                      const estaBloqueado = item.estado_cocina === 'preparando' || item.estado_cocina === 'listo';

                      return (
                        <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px', padding: '4px 0' }}>
                          
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                            
                            {/* ⚙️ CONTROLES DE CANTIDAD (+ / -) */}
                            <div style={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: '4px', 
                              background: estaBloqueado ? 'var(--bg-card-disabled, #f0f0f0)' : 'var(--bg-card-neutral)', 
                              padding: '2px 6px', 
                              borderRadius: '6px', 
                              border: '1px solid var(--border-neutral)',
                              opacity: estaBloqueado ? 0.6 : 1
                            }}>
                              <button
                                type="button"
                                style={{ 
                                  border: 'none', 
                                  background: 'none', 
                                  cursor: (item.cantidad <= 1 || estaBloqueado) ? 'not-allowed' : 'pointer', 
                                  fontWeight: 'bold', 
                                  fontSize: '14px', 
                                  color: 'var(--text-main)', 
                                  opacity: (item.cantidad <= 1 || estaBloqueado) ? 0.3 : 1 
                                }}
                                disabled={item.cantidad <= 1 || estaBloqueado}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  modificarCantidadItem(orden.id, item.id, item.cantidad - 1);
                                }}
                                title={estaBloqueado ? "No se puede modificar platillos en preparación o listos" : "Reducir cantidad"}
                              >
                                −
                              </button>
                              
                              <span style={{ color: 'var(--color-primary)', fontWeight: 'bold', fontSize: '14px', minWidth: '16px', textAlign: 'center' }}>
                                {item.cantidad}
                              </span>

                              <button
                                type="button"
                                style={{ 
                                  border: 'none', 
                                  background: 'none', 
                                  cursor: estaBloqueado ? 'not-allowed' : 'pointer', 
                                  fontWeight: 'bold', 
                                  fontSize: '14px', 
                                  color: 'var(--text-main)',
                                  opacity: estaBloqueado ? 0.3 : 1
                                }}
                                disabled={estaBloqueado}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  modificarCantidadItem(orden.id, item.id, item.cantidad + 1);
                                }}
                                title={estaBloqueado ? "No se puede modificar platillos en preparación o listos" : "Aumentar cantidad"}
                              >
                                +
                              </button>
                            </div>

                            <span style={{ color: 'var(--text-main)', fontSize: '14px' }}>{item.producto_nombre}</span>
                            {item.comensal && (
                              <span className={styles['badge-blue']}>
                                {!isNaN(item.comensal) ? `C${item.comensal}` : item.comensal}
                              </span>
                            )}
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span className={`badge ${item.estado_cocina === 'listo' ? styles['badge-green'] : item.estado_cocina === 'preparando' ? styles['badge-amber'] : styles['badge-gray']}`}>
                              {(item.estado_cocina || 'pendiente').toUpperCase()}
                            </span>
                            <span style={{ color: 'var(--text-main)', fontSize: '14px', fontWeight: 500 }}>
                              ${((Number(item.precio_unitario) || 0) * (Number(item.cantidad) || 1)).toFixed(2)}
                            </span>

                            {/* ❌ CANCELAR ÍTEM COMPLETO */}
                            <button 
                              className={styles['btn-quitar-item']}
                              disabled={estaBloqueado}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (estaBloqueado) {
                                  toast('No se puede cancelar un platillo que ya está en preparación o listo', 'warning');
                                  return;
                                }
                                setItemACancelar({ ordenId: orden.id, item });
                              }}
                              title={estaBloqueado ? "Platillo en preparación/listo" : "Cancelar este platillo"}
                            >
                              ✕
                            </button>
                          </div>

                        </div>
                      );
                    })}
                  </div>
                ))
              }
            </div>
          </div>
        )}
      </div>

      {/* ── MODAL NUEVA ORDEN ── */}
      {modalOrden && mesaSeleccionada && (
        <div className={styles['modal-overlay']} style={{ backgroundColor: 'var(--bg-overlay)', backdropFilter: 'blur(2px)' }}>
          <div className={styles.modal} style={{ maxWidth: '800px', width: '95vw', background: 'var(--bg-container)', border: '1px solid var(--border-light)' }}>
            
            <div className={styles['modal-orden-header']}>
              <h2 style={{ color: 'var(--text-main)', fontWeight: 600, margin: 0 }}>Nueva orden — {mesaSeleccionada.nombre}</h2>
              <button 
                onClick={async () => {
                  try {
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

            <div className={styles['modal-orden-grid']} style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '16px', height: '65vh' }}>
              {/* Menu */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', overflow: 'hidden' }}>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <span className={`${styles.chip} ${filtroEstacion === 'todos' ? styles.active : ''}`} onClick={() => setFiltroEstacion('todos')}>Todos</span>
                  {ESTACIONES.map(e => (
                    <span key={e} className={`${styles.chip} ${filtroEstacion === e ? styles.active : ''}`} onClick={() => setFiltroEstacion(e)}
                      style={filtroEstacion === e ? { borderColor: COLORES_ESTACION[e], color: COLORES_ESTACION[e] } : {}}>
                      {e.charAt(0).toUpperCase() + e.slice(1)}
                    </span>
                  ))}
                </div>
                <input placeholder="Buscar producto..." value={busqueda} onChange={e => setBusqueda(e.target.value)} style={{ border: '1px solid var(--border-neutral)', background: 'var(--text-light)' }} />
                <div style={{ flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', alignContent: 'start' }}>
                  {prodsFiltrados.map(prod => (
                    <div key={prod.id} className={styles['prod-card']} onClick={() => clickProducto(prod)} style={{ background: 'var(--bg-card-neutral)', border: '1px solid var(--border-neutral)' }}>
                      <div className={styles['prod-card-header']}>
                        <span className={styles['prod-nombre']} style={{ color: 'var(--text-main)' }}>{prod.nombre}</span>
                        <span className={styles['prod-precio']} style={{ color: 'var(--color-primary)' }}>${prod.precio.toFixed(2)}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span className={styles['prod-estacion']} style={{ color: COLORES_ESTACION[prod.estacion], fontSize: '12px', fontWeight: 600 }}>
                          ● {prod.estacion}
                        </span>
                        {prod.stock <= prod.stock_minimo && (
                          <span className={`badge ${styles['badge-red']}`} style={{ fontSize: '10px' }}>Stock bajo</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Carrito */}
              <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--bg-card-neutral)', border: '1px solid var(--border-neutral)', borderRadius: '10px', padding: '14px', overflow: 'hidden' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: '16px', color: 'var(--text-main)' }}>🛒 Carrito ({carrito.length})</strong>
                  </div>
                  <div className={styles['select-comensal-container']}>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500, whiteSpace: 'nowrap' }}>
                      Asignar productos a:
                    </span>
                    <input 
                      type="text"
                      placeholder="Ej. C1, Juan, Cumpleañero..."
                      value={comensalActivo} 
                      onChange={e => setComensalActivo(e.target.value)}
                      className={styles['select-comensal']}
                      style={{  
                        background: 'var(--text-light)', 
                        border: '1px solid var(--border-neutral)',
                        padding: '6px 10px',
                        borderRadius: '6px',
                        fontSize: '13px',
                        width: '100%'
                      }}
                    />
                  </div>
                </div>

                <div style={{ flex: 1, overflowY: 'auto' }}>
                  {carrito.length === 0
                    ? <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Agrega productos del menú</p>
                    : [...carrito]
                            .sort((a, b) => String(a.comensal).localeCompare(String(b.comensal)))
                            .map(c => (
                          <div key={c.key} className={styles['carrito-item']} style={{ borderLeft: '3px solid var(--color-primary)', paddingLeft: '8px', flexDirection: 'column', alignItems: 'stretch', gap: '6px', borderBottom: '1px solid var(--border-neutral)', paddingBottom: '8px', marginBottom: '4px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span 
                                  className={`badge ${styles['badge-blue']}`} 
                                  style={{ fontSize: '10px', padding: '2px 6px', fontWeight: 600, marginLeft: '6px' }}
                                >
                                  👤 {c.comensal}
                                </span>
                              <span className={styles['ci-precio']} style={{ color: 'var(--color-primary)', fontWeight: 600 }}>${(c.precio * c.checkpoint || c.precio * c.amount || c.precio * c.cantidad).toFixed(2)}</span>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <div className={styles['ci-info']} style={{ flex: 1, marginRight: '8px' }}>
                                <div className={styles['ci-nombre']} style={{ color: 'var(--text-main)', fontWeight: 600 }}>{c.producto.nombre}</div>
                                {c.modificador && <div className={styles['ci-mod']} style={{ color: 'var(--text-badge-blue)', fontSize: '11px' }}>{c.modificador.nombre}</div>}
                                <input
                                  placeholder="Comentario..."
                                  value={c.comentario}
                                  onChange={e => setCarrito(prev => prev.map(x => x.key === c.key ? { ...x, comentario: e.target.value } : x))}
                                  style={{ marginTop: '4px', fontSize: '11px', padding: '3px 6px', width: '100%', border: '1px solid var(--border-neutral)', background: 'var(--text-light)' }}
                                />
                              </div>

                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                                <div className={styles['qty-ctrl']} style={{ background: 'var(--text-light)', border: '1px solid var(--border-neutral)' }}>
                                  <button className={styles['qty-btn']} onClick={() => cambiarCantidad(c.key, -1)} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>−</button>
                                  <span style={{ minWidth: '20px', textAlign: 'center', fontSize: '13px', color: 'var(--text-main)', fontWeight: 600 }}>{c.cantidad}</span>
                                  <button className={styles['qty-btn']} onClick={() => cambiarCantidad(c.key, 1)} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>+</button>
                                </div>
                                <button onClick={() => quitarItem(c.key)} className={styles['btn-quitar']}>✕ Quitar</button>
                              </div>
                            </div>
                          </div>
                        ))
                  }
                </div>
                <div className={styles.sep} style={{ backgroundColor: 'var(--border-neutral)' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <strong style={{ color: 'var(--text-main)' }}>Total</strong>
                  <strong style={{ color: 'var(--color-primary)', fontSize: '18px' }}>${totalCarrito.toFixed(2)}</strong>
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
  <div className={styles['modal-overlay']} onClick={() => { setProdPendiente(null); setPrecioInputModal(''); }}>
    <div className={styles.modal} style={{ maxWidth: 500, width: '95vw' }} onClick={e => e.stopPropagation()}>
      
      {/* Encabezado */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <h2 style={{ color: 'var(--text-main)', fontSize: '1.4rem', fontWeight: 600, margin: 0 }}>
          Opciones — {prodPendiente.nombre}
        </h2>
        <button onClick={() => { setProdPendiente(null); setPrecioInputModal(''); }} className={styles['btn-cerrar-fino']}>✕</button>
      </div>

      {/* 🍲 CONDICIÓN ESPECIAL: MENUDO PARA LLEVAR O PRECIO $0 */}
      {(prodPendiente.nombre?.toLowerCase().includes('menudo') && prodPendiente.nombre?.toLowerCase().includes('llevar')) || prodPendiente.precio === 0 ? (
        <div style={{ marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontSize: '14px', color: 'var(--text-main)', fontWeight: 500 }}>
            Ingresa el precio capturado del Menudo:
          </label>
          <input
            type="number"
            step="0.01"
            placeholder="Ej. 120.00"
            value={precioInputModal}
            onChange={e => setPrecioInputModal(e.target.value)}
            style={{
              padding: '10px 14px',
              fontSize: '16px',
              borderRadius: '8px',
              border: '1px solid var(--border-neutral)',
              background: 'var(--text-light)',
              width: '100%'
            }}
          />
        </div>
      ) : (
        <p style={{ color: 'var(--text-secondary)', marginBottom: 12, fontSize: 13 }}>Selecciona una variante:</p>
      )}
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '16px', padding: '10px 0', width: '100%' }}>
        
        {/* Botón Normal / Sencillo para Birria */}
        {prodPendiente.nombre?.toLowerCase().includes('birria') && (
          <button 
            className={styles['variante-item-btn']} 
            onClick={() => { 
              agregarAlCarrito(prodPendiente); 
              setProdPendiente(null); 
              setPrecioInputModal('');
            }}
          >
            <span>Normal / Sencillo</span>
            <span>${prodPendiente.precio.toFixed(2)}</span>
          </button>
        )}

        {/* Variantes locales (Guisos, Con carne, Sin pata, etc.) */}
        {prodPendiente.modificadores?.filter(m => !m.global_mod).map(mod => {
          // Solo aplica a "menudo para llevar" o precio 0
          const esMenudoAbierto = (prodPendiente.nombre?.toLowerCase().includes('menudo') && prodPendiente.nombre?.toLowerCase().includes('llevar')) || prodPendiente.precio === 0;
          const precioInputFloat = parseFloat(precioInputModal) || 0;

          // Si es menudo abierto y capturó precio, usamos ese precio base; de lo contrario el del producto
          const precioBase = (esMenudoAbierto && precioInputFloat > 0) ? precioInputFloat : prodPendiente.precio;
          
          let precioMostrar = precioBase + (mod.precio_extra || 0);
          if (mod.descuento_pct > 0) precioMostrar = precioMostrar * (1 - mod.descuento_pct / 100);

          return (
            <button 
              key={mod.id} 
              className={styles['variante-item-btn']} 
              onClick={() => { 
                if (esMenudoAbierto && precioInputFloat <= 0) {
                  toast('Ingresa primero el precio del menudo', 'error');
                  return;
                }
                const prodAjustado = { ...prodPendiente, precio: precioBase };
                agregarAlCarrito(prodAjustado, mod); 
                setProdPendiente(null);
                setPrecioInputModal('');
              }}
            >
              <span>
                {mod.nombre}
                {mod.descuento_pct > 0 && <span className={`badge ${styles['badge-green']}`} style={{ marginLeft: 6 }}>-{mod.descuento_pct}%</span>}
                {mod.precio_extra > 0 && <span className={`badge ${styles['badge-amber']}`} style={{ marginLeft: 6 }}>+${mod.precio_extra}</span>}
              </span>
              <span>${precioMostrar.toFixed(2)}</span>
            </button>
          )
        })}

        {/* Extras globales */}
        {prodPendiente.modificadores?.filter(m => m.global_mod).map(modGlobal => {
          let precio = prodPendiente.precio + (modGlobal.precio_extra || 0);
          return (
            <button 
              key={modGlobal.id} 
              className={styles['variante-item-btn']} 
              onClick={() => { 
                agregarAlCarrito(prodPendiente, modGlobal); 
                setProdPendiente(null);
                setPrecioInputModal('');
              }}
            >
              <span>Con {modGlobal.nombre}</span>
              <span>${precio.toFixed(2)}</span>
            </button>
          )
        })}

      </div>
      
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
                          <span>👤 {num}</span>
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

              <div className={styles.sep} style={{ backgroundColor: 'var(--border-neutral)', margin: '1.5rem 0' }} />
              
              <strong style={{ display: 'block', marginBottom: 12, color: 'var(--text-main:)', fontSize: '1.05rem' }}>
                Métodos de pago
              </strong>
              
              {pagos.map((p, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <select 
                    value={p.metodo} 
                    onChange={e => setPagos(prev => prev.map((x, j) => j === i ? { ...x, metodo: e.target.value } : x))} 
                    style={{ flex: 1, border: '1px solid var(--border-neutral)', background: '#fff' }}
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
                    style={{ width: 110, border: '1px solid var(--border-neutral)', background: '#fff' }} 
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

              {/* 📊 NUEVA SECCIÓN DE CONTROL DE BALANCE */}
              <div style={{ 
                marginTop: '16px', 
                padding: '10px', 
                borderRadius: '6px', 
                background: 'var(--bg-card-neutral)',
                fontSize: '14px',
                display: 'flex',
                justifyContent: 'space-between',
                border: '1px solid var(--border-neutral)'
              }}>
                <span style={{ color: 'var(--text-secondary)' }}>Ingresado: <strong>${totalIngresado.toFixed(2)}</strong></span>
                {Math.abs(totalIngresado - modalPago.total) < 0.01 ? (
                  <span style={{ color: '#22c55e', fontWeight: 'bold' }}>¡Monto exacto! Cuadrado.</span>
                ) : (
                  <span style={{ color: '#ef4444', fontWeight: 'bold' }}>
                    {totalIngresado < modalPago.total 
                      ? `Faltan: $${(modalPago.total - totalIngresado).toFixed(2)}` 
                      : `Sobran: $${(totalIngresado - modalPago.total).toFixed(2)}`
                    }
                  </span>
                )}
              </div>

              <div className={styles['modal-pago-footer']}>
                <button className={`${styles.btn} ${styles['btn-cancelar']}`} onClick={() => setModalPago(null)}>
                  Cancelar
                </button>
                
                {/* 🔒 BOTÓN CORREGIDO CON DISABLED EN BASE A LA DIFERENCIA DECIMAL EXACTA */}
                <button 
                  className={`${styles.btn} ${styles['btn-confirmar']}`} 
                  onClick={cobrar}
                  disabled={Math.abs(totalIngresado - modalPago.total) >= 0.01}
                  style={{
                    opacity: Math.abs(totalIngresado - modalPago.total) < 0.01 ? 1 : 0.5,
                    cursor: Math.abs(totalIngresado - modalPago.total) < 0.01 ? 'pointer' : 'not-allowed'
                  }}
                >
                  Confirmar cobro
                </button>
              </div>

            </div>
          </div>
        </div>
      )}
        {/* ── MODAL CANCELAR ÍTEM INDIVIDUAL ── */}
        {itemACancelar && (
          <div className={styles['modal-overlay']} onClick={() => setItemACancelar(null)}>
            <div className={`${styles.modal} ${styles['modal-cancelar']}`} onClick={e => e.stopPropagation()}>
              <p className={styles['modal-cancelar-text']}>
                ¿Deseas cancelar <strong>{itemACancelar.item.cantidad}x {itemACancelar.item.producto_nombre}</strong> de la orden #{itemACancelar.ordenId}?
              </p>
              <div className={styles['modal-cancelar-actions']}>
                <button className={`${styles.btn} ${styles['btn-cancelar']}`} onClick={() => setItemACancelar(null)}>
                  No, conservar
                </button>
                <button className={`${styles.btn} ${styles['btn-danger']}`} onClick={cancelarItem}>
                  Sí, cancelar platillo
                </button>
              </div>
            </div>
          </div>
        )}
      {/* ── MODAL CANCELAR ORDEN ── */}
      {ordenACancelar && (
        <div className={styles['modal-overlay']} onClick={() => setOrdenACancelar(null)}>
          <div className={`${styles.modal} ${styles['modal-cancelar']}`} onClick={e => e.stopPropagation()}>

            <p className={styles['modal-cancelar-text']}>
              ¿Estás seguro de que deseas cancelar la <strong>Orden #{ordenACancelar.id}</strong> de la <strong>{ordenACancelar.mesa_nombre}</strong>? 
              Los productos se reincorporarán al inventario.
            </p>

            <div className={styles['modal-cancelar-actions']}>
              <button 
                className={`${styles.btn} ${styles['btn-cancelar']}`} 
                onClick={() => setOrdenACancelar(null)}
              >
                No, mantener
              </button>
              <button 
                className={`${styles.btn} ${styles['btn-danger']}`} 
                onClick={cancelarOrden}
              >
                Sí, cancelar orden
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  )
}