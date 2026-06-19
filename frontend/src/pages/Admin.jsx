import { useState, useEffect, useCallback } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import { api, createWS } from '../api'
import { useToast } from '../context/ToastContext'
import Topbar from '../components/Topbar'
import Modal from '../components/Modal'
import { AlertTriangle, Plus, Edit2, Trash2, TrendingUp } from 'lucide-react'

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'mesas',     label: 'Mesas',     icon: '🪑' },
  { id: 'productos', label: 'Productos',  icon: '🍽️' },
  { id: 'ordenes',   label: 'Órdenes',   icon: '📋' },
  { id: 'inventario',label: 'Inventario', icon: '📦' },
]

const COLORES_PIE = ['#f59e0b', '#3b82f6', '#22c55e', '#a855f7', '#ef4444']

export default function Admin() {
  const toast = useToast()
  const [tab, setTab] = useState('dashboard')
  const [reporte, setReporte] = useState(null)
  const [periodoReporte, setPeriodoReporte] = useState('dia')
  const [mesas, setMesas] = useState([])
  const [productos, setProductos] = useState([])
  const [ordenes, setOrdenes] = useState([])
  const [alertas, setAlertas] = useState([])

  // Modal estados
  const [modalMesa, setModalMesa] = useState(null)  // null | 'nueva' | mesa
  const [modalProducto, setModalProducto] = useState(null)
  const [modalStockId, setModalStockId] = useState(null)

  // Forms
  const [formMesa, setFormMesa] = useState({ nombre: '', capacidad: 4 })
  const [formProd, setFormProd] = useState({ nombre: '', precio: '', estacion: 'gorditas', stock: 100, stock_minimo: 20 })
  const [ajusteStock, setAjusteStock] = useState({ delta: '', motivo: 'ingreso' })

  const cargarTodo = useCallback(async () => {
    try {
      const [m, p, o, a] = await Promise.all([
        api.get('/mesas/'),
        api.get('/productos/todos'),
        api.get('/ordenes/'),
        api.get('/productos/alertas-stock'),
      ])
      setMesas(m); setProductos(p); setOrdenes(o); setAlertas(a)
    } catch { toast('Error al cargar datos', 'error') }
  }, [])

  const cargarReporte = useCallback(async (p) => {
    try {
      const r = await api.get(`/reportes/${p}`)
      setReporte(r)
    } catch { toast('Error al cargar reporte', 'error') }
  }, [])

  useEffect(() => {
    cargarTodo()
    cargarReporte(periodoReporte)
    const unsub = createWS('admin', msg => {
      if (msg.tipo === 'alerta_stock') {
        toast(`⚠️ Stock bajo: ${msg.producto_nombre} (${msg.stock} uds.)`, 'warning', 6000)
        setAlertas(prev => {
          const exists = prev.find(a => a.id === msg.producto_id)
          if (exists) return prev.map(a => a.id === msg.producto_id ? { ...a, stock: msg.stock } : a)
          return [...prev, { id: msg.producto_id, nombre: msg.producto_nombre, stock: msg.stock, stock_minimo: msg.stock_minimo }]
        })
      }
      if (msg.tipo === 'mesa_actualizada') setMesas(prev => prev.map(m => m.id === msg.mesa.id ? { ...m, ...msg.mesa } : m))
      if (msg.tipo === 'orden_creada') cargarTodo()
      if (msg.tipo === 'orden_cerrada') cargarTodo()
    })
    return unsub
  }, [])

  useEffect(() => { cargarReporte(periodoReporte) }, [periodoReporte])

  // ── Mesas CRUD ──
  const guardarMesa = async () => {
    try {
      if (modalMesa === 'nueva') {
        await api.post('/mesas/', formMesa)
        toast('Mesa creada', 'success')
      } else {
        await api.put(`/mesas/${modalMesa.id}`, formMesa)
        toast('Mesa actualizada', 'success')
      }
      setModalMesa(null)
      cargarTodo()
    } catch (e) { toast(e.message, 'error') }
  }

  const eliminarMesa = async (id) => {
    if (!confirm('¿Eliminar esta mesa?')) return
    try { await api.delete(`/mesas/${id}`); toast('Mesa eliminada', 'success'); cargarTodo() }
    catch (e) { toast(e.message, 'error') }
  }

  // ── Productos CRUD ──
  const guardarProducto = async () => {
    try {
      const body = { ...formProd, precio: parseFloat(formProd.precio), stock: parseInt(formProd.stock), stock_minimo: parseInt(formProd.stock_minimo) }
      if (modalProducto === 'nuevo') {
        await api.post('/productos/', body)
        toast('Producto creado', 'success')
      } else {
        await api.put(`/productos/${modalProducto.id}`, body)
        toast('Producto actualizado', 'success')
      }
      setModalProducto(null)
      cargarTodo()
    } catch (e) { toast(e.message, 'error') }
  }

  const toggleActivoProducto = async (prod) => {
    try {
      await api.put(`/productos/${prod.id}`, { activo: !prod.activo })
      toast(`Producto ${prod.activo ? 'desactivado' : 'activado'}`, 'success')
      cargarTodo()
    } catch (e) { toast(e.message, 'error') }
  }

  const aplicarAjusteStock = async () => {
    if (!ajusteStock.delta) return
    try {
      await api.post(`/productos/${modalStockId}/ajuste-stock`, {
        cantidad_delta: parseInt(ajusteStock.delta),
        motivo: ajusteStock.motivo,
      })
      toast('Stock ajustado', 'success')
      setModalStockId(null)
      setAjusteStock({ delta: '', motivo: 'ingreso' })
      cargarTodo()
    } catch (e) { toast(e.message, 'error') }
  }

  // ── Estadísticas rápidas ──
  const mesasDisponibles = mesas.filter(m => m.estado === 'disponible').length
  const mesasOcupadas   = mesas.filter(m => m.estado === 'ocupada').length
  const totalActivo     = ordenes.reduce((s, o) => s + (o.total || 0), 0)

  return (
    <div className="page">
      <Topbar tab={tab} setTab={setTab} tabs={TABS} />
      <div className="content">

        {/* ══════════ DASHBOARD ══════════ */}
        {tab === 'dashboard' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
              <h2 style={{ margin: 0 }}>Dashboard</h2>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {['dia','semana','mes'].map(p => (
                  <button key={p} className={`btn btn-sm ${periodoReporte === p ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setPeriodoReporte(p)}>
                    {p === 'dia' ? 'Hoy' : p === 'semana' ? 'Semana' : 'Mes'}
                  </button>
                ))}
              </div>
            </div>

            {/* Alertas stock */}
            {alertas.length > 0 && (
              <div style={{ background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 'var(--radius-lg)', padding: '1rem', marginBottom: '1.5rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                <AlertTriangle size={20} color='var(--error)' style={{ marginTop: '0.125rem', flexShrink: 0 }} />
                <div>
                  <strong style={{ color: 'var(--error)' }}>Alertas de stock bajo</strong>
                  <div style={{ marginTop: '0.75rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {alertas.map(a => (
                      <span key={a.id} className="badge badge-error">{a.nombre}: {a.stock} uds.</span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* KPIs */}
            <div className="grid-4" style={{ marginBottom: '2rem' }}>
              <div className="stat-card">
                <div className="stat-label">Ventas {periodoReporte === 'dia' ? 'del día' : periodoReporte === 'semana' ? 'de la semana' : 'del mes'}</div>
                <div className="stat-value">${reporte ? reporte.total_ventas.toFixed(2) : '—'}</div>
                <div className="stat-sub">{reporte?.num_ordenes ?? 0} órdenes cerradas</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Órdenes abiertas</div>
                <div className="stat-value">{ordenes.length}</div>
                <div className="stat-sub" style={{ color: 'var(--warning)' }}>${totalActivo.toFixed(2)} en curso</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Mesas disponibles</div>
                <div className="stat-value" style={{ color: 'var(--success)' }}>{mesasDisponibles}</div>
                <div className="stat-sub">{mesasOcupadas} ocupadas</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Alertas de stock</div>
                <div className="stat-value" style={{ color: alertas.length > 0 ? 'var(--error)' : 'var(--success)' }}>
                  {alertas.length}
                </div>
                <div className="stat-sub">productos bajo mínimo</div>
              </div>
            </div>

            {reporte && (
              <div className="grid-2" style={{ 
                marginBottom: '2rem',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                gap: '1.5rem'
              }}>
                {/* Top 5 productos */}
                <div className="card" style={{
                  padding: '1.5rem',
                  borderRadius: '1rem',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)'
                }}>
                  <h3 style={{ 
                    marginTop: 0, 
                    marginBottom: '1rem',
                    fontSize: '1.1rem',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'   
                  }}>
                    <span>🏆</span>Top 5 Productos más vendidos
                  </h3>
                  {reporte.top_productos.length === 0 ? (
                    <p style={{ color: 'var(--text-secondary)', textAling: 'center', padding: '2rem 0' }}>
                      Sin datos en este período
                    </p>
                    ): (
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={reporte.top_productos} layout="vertical" margin={{ left: 10, right: 10, top: 0, bottom: 0 }}>
                          <XAxis type="number" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
                          <YAxis 
                            type="category" 
                            dataKey="nombre" 
                            width={100} 
                            tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
                          <Tooltip
                            cursor={{ fill: 'rgba(0,0,0,0.02)' }}
                            contentStyle={{ 
                              background: 'var(--bg-primary)', 
                              border: '1px solid var(--border)', 
                              borderRadius: '0.6rem',
                              boxShadow: '0 10px 15px -3px rgba(0,0,0,0.08)'
                            }}
                            labelStyle={{ color: 'var(--text-primary)', fontWeight:600 }}
                          />
                          <Bar dataKey="cantidad" fill="var(--primary)" radius={[0, 8, 8, 0]} barSize={14} />
                        </BarChart>
                      </ResponsiveContainer>
                    )
                  }
                </div>

                {/* Métodos de pago */}
                <div className="card" style={{
                  padding: '1.5rem',
                  borderRadius: '1rem',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border)',
                  boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)'
                }}> 
                  <h3 style={{ 
                    marginTop: 0, 
                    marginBottom: '1rem',
                    frontSize: '1.1rem',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                    }}>
                      <span>💳</span> Distribución por método de pago</h3>
                  {reporte.por_metodo.length === 0 ? ( 
                    <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem 0' }}>
                      Sin datos en este período
                    </p>
                    ) : (
                      <ResponsiveContainer width="100%" height={220}>
                        <PieChart>
                          <Pie 
                            data={reporte.por_metodo} 
                            dataKey="total" 
                            nameKey="metodo" 
                            cx="50%" 
                            cy="45%" 
                            innerRadius={60}
                            outerRadius={82} 
                            paddingAngle={4}
                          >
                            {reporte.por_metodo.map((_, i) => (
                              <Cell
                                key={i}
                                fill={COLORES_PIE[i % COLORES_PIE.length]}
                                style= {{outline: 'none'}}
                              />  
                            ))}
                          </Pie>
                          <Tooltip 
                            contentStyle={{ 
                              background: 'var(--bg-primary)', 
                              border: '1px solid var(--border)', 
                              borderRadius: '0.6rem',
                              boxShadow: '0 10px 15px -3px rgba(0,0,0,0.08)'
                            }} 
                          />
                          <Legend 
                            verticalAlign="bottom" 
                            iconType="circle" 
                            iconSize={8}
                            wrapperStyle={{ fontSize: '12px',paddingTop: '10px' }} 
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    )
                  }
                </div>
              </div>
            )}

            {/* Corte de caja rápido */}
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ margin: 0 }}>🏦 Corte de caja (hoy)</h3>
                <button className="btn btn-ghost btn-sm" onClick={async () => {
                  const c = await api.get('/reportes/corte-caja')
                  alert(`Efectivo esperado: $${c.efectivo_esperado}\nTotal general: $${c.total_general}`)
                }}>Ver corte</button>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>Haz clic en "Ver corte" para ver el desglose por método de pago del día.</p>
            </div>
          </div>
        )}

        {/* ══════════ MESAS ══════════ */}
        {tab === 'mesas' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ margin: 0 }}>Gestión de Mesas</h2>
              <button className="btn btn-primary" onClick={() => { setFormMesa({ nombre: '', capacidad: 4 }); setModalMesa('nueva') }}>
                <Plus size={18} />
                Nueva mesa
              </button>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Nombre</th><th>Capacidad</th><th>Estado</th><th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {mesas.map(m => (
                    <tr key={m.id}>
                      <td style={{ fontWeight: 500 }}>{m.nombre}</td>
                      <td>{m.capacidad} personas</td>
                      <td>
                        <span className={`badge ${m.estado === 'disponible' ? 'badge-success' : 'badge-warning'}`}>
                          {m.estado}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => {
                            setFormMesa({ nombre: m.nombre, capacidad: m.capacidad })
                            setModalMesa(m)
                          }} title="Editar">
                            <Edit2 size={16} />
                          </button>
                          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--error)' }} onClick={() => eliminarMesa(m.id)} title="Eliminar">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ══════════ PRODUCTOS ══════════ */}
        {tab === 'productos' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ margin: 0 }}>Gestión de Productos</h2>
              <button className="btn btn-primary" onClick={() => {
                setFormProd({ nombre: '', precio: '', estacion: 'gorditas', stock: 100, stock_minimo: 20, activo: true })
                setModalProducto('nuevo')
              }}>
                <Plus size={18} />
                Nuevo producto
              </button>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Nombre</th><th>Precio</th><th>Estación</th><th>Stock</th><th>Estado</th><th>Acciones</th></tr>
                </thead>
                <tbody>
                  {productos.map(p => (
                    <tr key={p.id} style={{ opacity: p.activo ? 1 : 0.6 }}>
                      <td style={{ fontWeight: 500 }}>{p.nombre}</td>
                      <td style={{ color: 'var(--primary)', fontWeight: 700 }}>${p.precio.toFixed(2)}</td>
                      <td><span className="badge badge-gray">{p.estacion}</span></td>
                      <td>
                        <span style={{ color: p.stock <= p.stock_minimo ? 'var(--error)' : 'var(--text-primary)', fontWeight: 600 }}>
                          {p.stock} uds.
                        </span>
                        {p.stock <= p.stock_minimo && <span className="badge badge-error" style={{ marginLeft: '0.5rem' }}>⚠️ bajo</span>}
                      </td>
                      <td>
                        <span className={`badge ${p.activo ? 'badge-success' : 'badge-gray'}`}>
                          {p.activo ? 'activo' : 'inactivo'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => {
                            setFormProd({ nombre: p.nombre, precio: p.precio, estacion: p.estacion, stock: p.stock, stock_minimo: p.stock_minimo, activo: p.activo })
                            setModalProducto(p)
                          }} title="Editar">
                            <Edit2 size={16} />
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => setModalStockId(p.id)} title="Ajustar stock">
                            <TrendingUp size={16} />
                          </button>
                          <button className={`btn btn-sm ${p.activo ? 'btn-error' : 'btn-success'}`} onClick={() => toggleActivoProducto(p)}>
                            {p.activo ? 'Desactivar' : 'Activar'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ══════════ ÓRDENES ══════════ */}
        {tab === 'ordenes' && (
          <div>
            <h2 style={{ marginBottom: '1.5rem' }}>Órdenes Activas</h2>
            {ordenes.length === 0
              ? <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '1rem' }}>✓ Sin órdenes abiertas</p>
                </div>
              : <div className="ordenes-grid">
                  {ordenes.map(o => (
                    <div key={o.id} className="orden-card">
                      <div className="orden-header">
                        <div>
                          <div className="orden-mesa">{o.mesa_nombre}</div>
                          <div className="orden-number">#{o.id}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.8)' }}>
                            {new Date(o.creado_en).toLocaleTimeString()}
                          </div>
                          <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.8)' }}>
                            {o.mesero_nombre}
                          </div>
                        </div>
                      </div>
                      <div className="orden-body">
                        {o.items.map(item => (
                          <div key={item.id} className="orden-item">
                            <div className="orden-qty">{item.cantidad}x</div>
                            <div className="orden-producto">
                              <div className="orden-producto-name">{item.producto_nombre}</div>
                              {item.modificador_nombre && <div className="orden-producto-mod">▸ {item.modificador_nombre}</div>}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span className={`badge ${
                                item.estado_cocina === 'listo' ? 'badge-success' :
                                item.estado_cocina === 'preparando' ? 'badge-warning' : 'badge-gray'
                              }`}>
                                {item.estado_cocina}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="orden-footer">
                        <div className="orden-subtotal">
                          <span>Total:</span>
                          <span style={{ color: 'var(--primary)' }}>${o.total.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
            }
          </div>
        )}

        {/* ══════════ INVENTARIO ══════════ */}
        {tab === 'inventario' && (
          <div>
            <h2 style={{ marginBottom: '1.5rem' }}>Inventario</h2>
            {alertas.length > 0 && (
              <div style={{ background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 'var(--radius-lg)', padding: '1rem', marginBottom: '1.5rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                <AlertTriangle size={20} color='var(--error)' style={{ marginTop: '0.125rem', flexShrink: 0 }} />
                <div>
                  <strong style={{ color: 'var(--error)' }}>{alertas.length} producto(s) con stock bajo</strong>
                </div>
              </div>
            )}
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Producto</th><th>Estación</th><th>Stock actual</th><th>Mínimo</th><th>Estado</th><th>Acción</th></tr>
                </thead>
                <tbody>
                  {productos.filter(p => p.activo).map(p => (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 500 }}>{p.nombre}</td>
                      <td><span className="badge badge-gray">{p.estacion}</span></td>
                      <td style={{ fontWeight: 700, color: p.stock <= p.stock_minimo ? 'var(--error)' : 'var(--text-primary)' }}>
                        {p.stock}
                      </td>
                      <td style={{ color: 'var(--text-secondary)' }}>{p.stock_minimo}</td>
                      <td>
                        {p.stock <= p.stock_minimo
                          ? <span className="badge badge-error">⚠️ Stock bajo</span>
                          : <span className="badge badge-success">✓ OK</span>
                        }
                      </td>
                      <td>
                        <button className="btn btn-ghost btn-sm" onClick={() => { setModalStockId(p.id); setAjusteStock({ delta: '', motivo: 'ingreso' }) }}>
                          Ajustar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── MODAL MESA ── */}
      {modalMesa && (
        <Modal title={modalMesa === 'nueva' ? 'Nueva Mesa' : 'Editar Mesa'} onClose={() => setModalMesa(null)}
          footer={<>
            <button className="btn btn-ghost" onClick={() => setModalMesa(null)}>Cancelar</button>
            <button className="btn btn-primary" onClick={guardarMesa}>Guardar</button>
          </>}
        >
          <div className="form-field">
            <label>Nombre</label>
            <input value={formMesa.nombre} onChange={e => setFormMesa(f => ({ ...f, nombre: e.target.value }))} placeholder="ej. Mesa 5" />
          </div>
          <div className="form-field">
            <label>Capacidad (personas)</label>
            <input type="number" min="1" value={formMesa.capacidad} onChange={e => setFormMesa(f => ({ ...f, capacidad: parseInt(e.target.value) }))} />
          </div>
        </Modal>
      )}

      {/* ── MODAL PRODUCTO ── */}
      {modalProducto && (
        <Modal title={modalProducto === 'nuevo' ? 'Nuevo Producto' : 'Editar Producto'} onClose={() => setModalProducto(null)}
          footer={<>
            <button className="btn btn-ghost" onClick={() => setModalProducto(null)}>Cancelar</button>
            <button className="btn btn-primary" onClick={guardarProducto}>Guardar</button>
          </>}
        >
          <div className="form-field">
            <label>Nombre</label>
            <input value={formProd.nombre} onChange={e => setFormProd(f => ({ ...f, nombre: e.target.value }))} placeholder="Nombre del producto" />
          </div>
          <div className="grid-2">
            <div className="form-field">
              <label>Precio ($)</label>
              <input type="number" step="0.5" min="0" value={formProd.precio} onChange={e => setFormProd(f => ({ ...f, precio: e.target.value }))} placeholder="0.00" />
            </div>
            <div className="form-field">
              <label>Estación</label>
              <select value={formProd.estacion} onChange={e => setFormProd(f => ({ ...f, estacion: e.target.value }))}>
                <option value="gorditas">Gorditas</option>
                <option value="menudo">Menudo</option>
                <option value="antojitos">Antojitos</option>
              </select>
            </div>
          </div>
          <div className="grid-2">
            <div className="form-field">
              <label>Stock inicial</label>
              <input type="number" min="0" value={formProd.stock} onChange={e => setFormProd(f => ({ ...f, stock: e.target.value }))} />
            </div>
            <div className="form-field">
              <label>Stock mínimo (alerta)</label>
              <input type="number" min="0" value={formProd.stock_minimo} onChange={e => setFormProd(f => ({ ...f, stock_minimo: e.target.value }))} />
            </div>
          </div>
        </Modal>
      )}

      {/* ── MODAL AJUSTE STOCK ── */}
      {modalStockId && (
        <Modal title="Ajuste de Stock" onClose={() => setModalStockId(null)}
          footer={<>
            <button className="btn btn-ghost" onClick={() => setModalStockId(null)}>Cancelar</button>
            <button className="btn btn-primary" onClick={aplicarAjusteStock}>Aplicar</button>
          </>}
        >
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem', fontSize: '0.9rem' }}>
            Usa valores positivos para agregar stock, negativos para reducirlo.
          </p>
          <div className="form-field">
            <label>Cantidad (ej. +50 o -10)</label>
            <input type="number" value={ajusteStock.delta}
              onChange={e => setAjusteStock(a => ({ ...a, delta: e.target.value }))}
              placeholder="ej. 50" />
          </div>
          <div className="form-field">
            <label>Motivo</label>
            <select value={ajusteStock.motivo} onChange={e => setAjusteStock(a => ({ ...a, motivo: e.target.value }))}>
              <option value="ingreso">Ingreso de mercancía</option>
              <option value="ajuste">Ajuste manual</option>
              <option value="merma">Merma / desperdicio</option>
            </select>
          </div>
        </Modal>
      )}
    </div>
  )
}
