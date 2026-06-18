import { useState, useEffect, useCallback } from 'react'
import { api, createWS } from '../api'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import Topbar from '../components/Topbar'
import Modal from '../components/Modal'
import '../styles/mesero.css'
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

  // ── Carrito helpers ──
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
  const enviarOrden = async () => {
    if (!mesaSeleccionada || carrito.length === 0) return
    try {
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
    }
  }

  // —— Buscar orden activa de la mesa ——
  const ordenDeMesa = (mesa) => {
    // Buscamos cualquier orden que esté explícitamente abierta/abiega en esta mesa
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
    <div className="page">
      <Topbar tab={tab} setTab={setTab} tabs={tabs} />
      <div className="content">

        {/* ── TAB MESAS ── */}
        {tab === 'mesas' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2>Mapa de Mesas</h2>
              <div style={{ display: 'flex', gap: 8 }}>
                <span className="badge badge-green">● Disponible</span>
                <span className="badge badge-red">● Ocupada</span>
              </div>
            </div>
            <div className="mesa-grid">
              {mesas.map(mesa => {
                const orden = ordenDeMesa(mesa)
                
                // CORRECCIÓN AQUÍ: Solo bloqueamos si EXISTE una orden Y el ID del mesero no coincide con el logueado
                const esDeOtroMesero = orden && orden.mesero_id && Number(orden.mesero_id) !== Number(user.id);

                return (
                  <div
                    key={mesa.id}
                    className={`mesa-card ${mesa.estado}`}
                    onClick={() => {
                      // Si la mesa es de otro mesero, ni siquiera dejamos que alteren la comanda
                      if (esDeOtroMesero) {
                        toast('Esta mesa está siendo atendida por otro mesero', 'info');
                        return;
                      }
                      setMesaSeleccionada(mesa)
                      setCarrito([])
                      setComensalActivo(1) 
                      setModalOrden(true)
                    }}
                  >
                    <span style={{ fontSize: 28 }}>🪑</span>
                    <span className="mesa-nombre">{mesa.nombre}</span>
                    <span className="mesa-estado" style={{ color: mesa.estado === 'disponible' ? 'var(--green)' : 'var(--red)' }}>
                      {mesa.estado}
                    </span>
                    {orden && (
                      <>
                        <span style={{ fontSize: 11, color: 'var(--text2)' }}>{orden.items.length} items</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>
                          ${orden.total.toFixed(2)}
                        </span>
                        <button
                          className="btn btn-primary btn-sm"
                          disabled={esDeOtroMesero}
                          style={esDeOtroMesero ? { opacity: 0.4, cursor: 'not-allowed', backgroundColor: '#666' } : {}}
                          onClick={e => { 
                            e.stopPropagation(); // Evitamos que abra el modal de comandas
                            if (!esDeOtroMesero) abrirPago(orden);
                          }}
                        >
                          {esDeOtroMesero ? 'Bloqueado' : 'Cobrar'}
                        </button>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* ── TAB ÓRDENES ── */}
        {tab === 'ordenes' && (
          <>
            <h2 style={{ marginBottom: 16 }}>Mis Órdenes Activas</h2>
            {ordenes.filter(o => Number(o.mesero_id) === Number(user.id)).length === 0
              ? <p style={{ color: 'var(--text2)' }}>No tienes órdenes activas.</p>
              : ordenes.filter(o => Number(o.mesero_id) === Number(user.id)).map(orden => (
                <div key={orden.id} className="card" style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div>
                      <strong>{orden.mesa_nombre}</strong>
                      <span style={{ color: 'var(--text2)', marginLeft: 8, fontSize: 12 }}>
                        Orden #{orden.id} · {new Date(orden.creado_en).toLocaleTimeString()}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <strong style={{ color: 'var(--accent)' }}>${orden.total.toFixed(2)}</strong>
                      <button className="btn btn-primary btn-sm" onClick={() => abrirPago(orden)}>Cobrar</button>
                    </div>
                  </div>
                  
                  {/* Mapeo de items */}
                  {[...orden.items]
                    .sort((a, b) => (a.comensal || 1) - (b.comensal || 1))
                    .map(item => (
                      <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                        <span style={{ color: 'var(--accent)', fontWeight: 700, minWidth: 24 }}>{item.cantidad}x</span>
                        
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span>{item.producto_nombre}</span>
                          <span style={{ 
                            fontSize: 10, 
                            fontWeight: 600,
                            color: 'var(--blue)', 
                            background: 'rgba(59, 130, 246, 0.15)', 
                            padding: '2px 6px', 
                            borderRadius: 4,
                            display: 'inline-flex',
                            alignItems: 'center'
                          }}>
                            👤 C{item.comensal || 1}
                          </span>
                        </div>

                        {item.modificador_nombre && <span style={{ color: 'var(--purple)', fontSize: 12 }}>{item.modificador_nombre}</span>}
                        
                        <span className={`badge ${item.estado_cocina === 'listo' ? 'badge-green' : item.estado_cocina === 'preparando' ? 'badge-amber' : 'badge-gray'}`}>
                          {item.estado_cocina}
                        </span>
                        <span style={{ color: 'var(--text2)', fontSize: 12 }}>${(item.precio_unitario * item.cantidad).toFixed(2)}</span>
                      </div>
                    ))}
                </div>
              ))
            }
          </>
        )}
      </div>

      {/* ── MODAL NUEVA ORDEN ── */}
      {modalOrden && mesaSeleccionada && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 800, width: '95vw' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2>Nueva orden — {mesaSeleccionada.nombre}</h2>
              <button onClick={() => setModalOrden(false)} style={{ background: 'none', color: 'var(--text2)', fontSize: 20 }}>✕</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16, height: '65vh' }}>
              {/* Menú */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span className={`chip${filtroEstacion === 'todos' ? ' active' : ''}`} onClick={() => setFiltroEstacion('todos')}>Todos</span>
                  {ESTACIONES.map(e => (
                    <span key={e} className={`chip${filtroEstacion === e ? ' active' : ''}`} onClick={() => setFiltroEstacion(e)}
                      style={filtroEstacion === e ? { borderColor: COLORES_ESTACION[e], color: COLORES_ESTACION[e] } : {}}>
                      {e.charAt(0).toUpperCase() + e.slice(1)}
                    </span>
                  ))}
                </div>
                <input placeholder="Buscar producto..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
                <div style={{ flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, alignContent: 'start' }}>
                  {prodsFiltrados.map(prod => (
                    <div key={prod.id} className="prod-card" onClick={() => clickProducto(prod)}>
                      <span className="prod-nombre">{prod.nombre}</span>
                      <span className="prod-precio">${prod.precio.toFixed(2)}</span>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span className="prod-estacion" style={{ color: COLORES_ESTACION[prod.estacion] }}>
                          ● {prod.estacion}
                        </span>
                        {prod.stock <= prod.stock_minimo && (
                          <span className="badge badge-red" style={{ fontSize: 10 }}>Stock bajo</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Carrito */}
              <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--bg3)', borderRadius: 10, padding: 14, overflow: 'hidden' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: 16 }}>🛒 Carrito ({carrito.length})</strong>
                  </div>
                  <div className="select-comensal-container">
                    <span style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 500, whiteSpace: 'nowrap' }}>
                      Asignar productos a:
                    </span>
                    <select 
                      value={comensalActivo} 
                      onChange={e => setComensalActivo(Number(e.target.value))}
                      className="select-comensal"
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
                    ? <p style={{ color: 'var(--text3)', fontSize: 13 }}>Agrega productos del menú</p>
                    : [...carrito]
                        .sort((a, b) => a.comensal - b.comensal)
                        .map(c => (
                          <div key={c.key} className="carrito-item" style={{ borderLeft: '3px solid var(--accent)', paddingLeft: 8, flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span className="badge badge-blue" style={{ fontSize: 10, padding: '2px 6px', fontWeight: 600 }}>
                                👤 Comensal {c.comensal}
                              </span>
                              <span className="ci-precio">${(c.precio * c.cantidad).toFixed(2)}</span>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <div className="ci-info" style={{ flex: 1, marginRight: 8 }}>
                                <div className="ci-nombre">{c.producto.nombre}</div>
                                {c.modificador && <div className="ci-mod">{c.modificador.nombre}</div>}
                                <input
                                  placeholder="Comentario..."
                                  value={c.comentario}
                                  onChange={e => setCarrito(prev => prev.map(x => x.key === c.key ? { ...x, comentario: e.target.value } : x))}
                                  style={{ marginTop: 4, fontSize: 11, padding: '3px 6px', width: '100%' }}
                                />
                              </div>

                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                                <div className="qty-ctrl">
                                  <button className="qty-btn" onClick={() => cambiarCantidad(c.key, -1)}>−</button>
                                  <span style={{ minWidth: 20, textAlign: 'center', fontSize: 13 }}>{c.cantidad}</span>
                                  <button className="qty-btn" onClick={() => cambiarCantidad(c.key, 1)}>+</button>
                                </div>
                                <button onClick={() => quitarItem(c.key)} style={{ background: 'none', color: 'var(--red)', fontSize: 11, cursor: 'pointer', border: 'none', padding: 0 }}>✕ quitar</button>
                              </div>
                            </div>
                          </div>
                        ))
                  }
                </div>
                <div className="sep" />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                  <strong>Total</strong>
                  <strong style={{ color: 'var(--accent)', fontSize: 18 }}>${totalCarrito.toFixed(2)}</strong>
                </div>
                <button className="btn btn-primary" disabled={carrito.length === 0} onClick={enviarOrden}>
                  Enviar a cocina
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL MODIFICADORES ── */}
      {prodPendiente && (
        <Modal title={`Opciones — ${prodPendiente.nombre}`} onClose={() => setProdPendiente(null)}>
          <p style={{ color: 'var(--text2)', marginBottom: 12, fontSize: 13 }}>Selecciona una variante:</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button className="btn btn-ghost" onClick={() => { agregarAlCarrito(prodPendiente); setProdPendiente(null) }}>
              Sin modificador — ${prodPendiente.precio.toFixed(2)}
            </button>
            {prodPendiente.modificadores?.filter(m => !m.global_mod).map(mod => {
              let precio = prodPendiente.precio + (mod.precio_extra || 0)
              if (mod.descuento_pct > 0) precio = precio * (1 - mod.descuento_pct / 100)
              return (
                <button key={mod.id} className="btn btn-ghost" onClick={() => { agregarAlCarrito(prodPendiente, mod); setProdPendiente(null) }}>
                  {mod.nombre} — ${precio.toFixed(2)}
                  {mod.descuento_pct > 0 && <span className="badge badge-green" style={{ marginLeft: 6 }}>-{mod.descuento_pct}%</span>}
                  {mod.precio_extra > 0 && <span className="badge badge-amber" style={{ marginLeft: 6 }}>+${mod.precio_extra}</span>}
                </button>
              )
            })}
          </div>
          <div className="sep" />
          <p style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 8 }}>Extras globales:</p>
          {productos.length > 0 && (() => {
            const extraQueso = prodPendiente.modificadores?.find(m => m.global_mod)
            if (!extraQueso) return null
            return (
              <button className="btn btn-ghost" onClick={() => { agregarAlCarrito(prodPendiente, extraQueso); setProdPendiente(null) }}>
                {extraQueso.nombre} — +${extraQueso.precio_extra.toFixed(2)}
              </button>
            )
          })()}
        </Modal>
      )}

      {/* ── MODAL COBRAR ── */}
      {modalPago && (
        <Modal title={`Cobrar — ${modalPago.mesa_nombre}`} onClose={() => setModalPago(null)}
          footer={<>
            <button className="btn btn-ghost" onClick={() => setModalPago(null)}>Cancelar</button>
            <button className="btn btn-green" onClick={cobrar}>Confirmar cobro</button>
          </>}
        >
          <div style={{ maxHeight: 180, overflowY: 'auto', marginBottom: 14 }}>
            {modalPago.items.map(item => (
              <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                <span>{item.cantidad}x {item.producto_nombre} {item.modificador_nombre ? `(${item.modificador_nombre})` : ''}</span>
                <span style={{ color: 'var(--accent)' }}>${(item.precio_unitario * item.cantidad).toFixed(2)}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <strong>Total</strong>
            <strong style={{ color: 'var(--accent)', fontSize: 20 }}>${modalPago.total.toFixed(2)}</strong>
          </div>

          {/* División de cuenta */}
          <div className='seccion-division'>
            <label>Dividir cuenta entre</label>
            <div className='division-control'>
              <button 
                type="button"
                className="btn-division" 
                onClick={() => setNumDivisiones(prev => Math.max(1, prev - 1))}
              >
                −
              </button>
              <input 
                type="number" 
                min="1" 
                max="20" 
                value={numDivisiones}
                onChange={e => setNumDivisiones(Math.max(1, parseInt(e.target.value) || 1))}
                className='input-divisiones'
              />
              <button 
                type="button"
                className="btn-division" 
                onClick={() => setNumDivisiones(prev => Math.min(20, prev + 1))}
              >
                +
              </button>
              <span style={{ color: 'var(--text2)', fontSize: 13, marginLeft: 4 }}>persona(s)</span>
              {numDivisiones > 1 && (
                <span className="badge-total-persona">${(modalPago.total / numDivisiones).toFixed(2)} c/u</span>
              )}
            </div>
          </div>

          {/* Métodos de pago */}
          <div className="sep" />
          <strong style={{ display: 'block', marginBottom: 10 }}>Métodos de pago</strong>
          {pagos.map((p, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <select value={p.metodo} onChange={e => setPagos(prev => prev.map((x, j) => j === i ? { ...x, metodo: e.target.value } : x))} style={{ flex: 1 }}>
                <option value="efectivo">Efectivo</option>
                <option value="transferencia">Transferencia</option>
                <option value="tarjeta">Tarjeta</option>
              </select>
              <input type="number" placeholder="Monto" value={p.monto}
                onChange={e => setPagos(prev => prev.map((x, j) => j === i ? { ...x, monto: e.target.value } : x))}
                style={{ width: 100 }} />
              {pagos.length > 1 && (
                <button className="btn btn-ghost btn-sm" onClick={() => setPagos(prev => prev.filter((_, j) => j !== i))}>✕</button>
              )}
            </div>
          ))}
          <button className="btn btn-ghost btn-sm" onClick={() => setPagos(p => [...p, { metodo: 'efectivo', monto: '' }])}>
            + Agregar método
          </button>
        </Modal>
      )}
    </div>
  )
}