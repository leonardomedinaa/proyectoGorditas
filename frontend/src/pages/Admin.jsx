import { useState, useEffect, useCallback } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import { api, createWS } from '../api'
import { useToast } from '../context/ToastContext'
import Topbar from '../components/Topbar'
import Modal from '../components/Modal'
import style from '../styles/admin.module.css'
import { AlertTriangle, Plus, Edit2, Trash2, TrendingUp,
  DollarSign, ShoppingBag, CheckCircle2, Clock, Utensils, 
  ArrowUpRight, LayoutDashboard
 } from 'lucide-react'

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

  const [modalMesa, setModalMesa] = useState(null)
  const [modalProducto, setModalProducto] = useState(null)
  const [modalStockId, setModalStockId] = useState(null)

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

  const mesasDisponibles = mesas.filter(m => m.estado === 'disponible').length
  const mesasOcupadas   = mesas.filter(m => m.estado === 'ocupada').length
  const totalActivo     = ordenes.reduce((s, o) => s + (o.total || 0), 0)

  return (
    <div className={style.pageContainer}>
      <div className={style.topbarWrapper}>  
      <Topbar tab={tab} setTab={setTab} tabs={TABS} />
      </div>
      <div className={style.contentWrapper}>

        {/* ══════════ DASHBOARD ══════════ */}
        {tab === 'dashboard' && (
          <div>
            <div className={style.dashboardHeader}>
              <div className={style.dashboardTitleGroup}>
                  <div className={style.dashboardIconWrapper}>
                    <LayoutDashboard size={22} />
                  </div>
                  <div>
                    <h2 className={style.dashboardTitle}>Panel de Control</h2>
                    <p className={style.dashboardSubtitle}>Monitoreo rápido de operaciones</p>
                  </div>
              </div>

              <div className={style.filterGroup}>
                  {['dia','semana','mes'].map(p => (
                    <button 
                      key={p}
                      className={`${style.filterButton} ${periodoReporte === p ? style.filterButtonActive : style.filterButtonInactive}`}
                      onClick={() => setPeriodoReporte(p)}>
                      {p === 'dia' ? 'Hoy' : p === 'semana' ? 'Semana' : 'Mes'}
                    </button>
                ))}
              </div>
            </div>

            {alertas.length > 0 && (
              <div className={style.alertContainer}>
                  <div className={style.alertIconWrapper}>
                    <AlertTriangle size={28}/>
                  </div>
                <div className={style.alertContent}>
                  <strong className={style.alertTitle}>Alertas de stock bajo ({alertas.length})</strong>
                  <div className={style.alertBadgesList}>
                    {alertas.map(a => (
                      <span key={a.id} className={`${style.badge} ${style.badgeError} ${style.alertBadgeItem}`}>
                        {a.nombre}: {a.stock} uds.
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className={style.kpiGrid}>
              <div className={`${style.kpiCard} ${style.kpiCard1}`}>
                <div>  
                <div className={style.kpiLabel}>Ventas {periodoReporte === 'dia' ? 'de hoy' : periodoReporte === 'semana' ? 'de la semana' : 'del mes'}</div>
                <div className={`${style.kpiValue} ${style.kpiValue1}`}>${reporte ? reporte.total_ventas.toFixed(2) : '—'}</div>
                <div className={style.kpiSub1}><span>{reporte?.num_ordenes ?? 0} órdenes cerradas</span></div>
              </div>
              <div className={style.kpiIcon1}><DollarSign size={28} /></div>
            </div> 

              <div className={style.kpiCard}>
              <div>
                  <div className={style.kpiLabel}>Órdenes abiertas</div>
                <div className={`${style.kpiValue} ${style.kpiValue2}`}>{ordenes.length}</div>
                <div className={style.kpiSub2}>${totalActivo.toFixed(2)} por cobrar</div>
              </div>
              <div className={style.kpiIcon2}><Clock size={28} /></div>
            </div>    

              <div className={style.kpiCard}>
                <div>
                  <div className={style.kpiLabel}>Mesas disponibles</div>
                  <div className={`${style.kpiValue} ${style.kpiValue3}`}>{mesasDisponibles}</div>
                  <div className={style.kpiSub3}>{mesasOcupadas} ocupadas</div>
                </div>
                <div className={style.kpiIcon3}><Utensils size={28} /></div>
              </div>

                <div className={style.kpiCard}>
                <div>
                  <div className={style.kpiLabel}>Alertas de stock</div>
                  <div className={`${style.kpiValue} ${alertas.length > 0 ? style.textError : style.textSuccess}`}>{alertas.length}</div>
                  <div className={style.kpiSub4}>{alertas.length > 0 ? 'Abastecimiento requerido' : 'Inventario estable'}</div>
                </div>
                <div className={alertas.length > 0 ? style.kpiIcon4Error : style.kpiIcon4Success}><ShoppingBag size={28} /></div>  
              </div>
            </div>

            {reporte && (
              <div className={style.chartsGrid}>
                <div className={style.chartCard1}>
                  <h3 className={style.chartTitle1}><span>🏆</span>Top 5 Productos más vendidos</h3>
                  {reporte.top_productos.length === 0 ? (
                    <p className={style.chartEmpty1}>Sin datos en este período</p>
                    ): (
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={reporte.top_productos} layout="vertical" margin={{ left: 10, right: 10, top: 0, bottom: 0 }}>
                          <XAxis type="number" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
                          <YAxis type="category" dataKey="nombre" width={100} axisLine={false} tickLine={false} tick={{ fill: 'var(--text-secondary)', fontSize: 11, fontWeight: 500 }} />
                          <Tooltip cursor={{ fill: 'rgba(0,0,0,0.02)' }} contentStyle={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '0.6rem', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.08)' }} labelStyle={{ color: 'var(--text-primary)', fontWeight:600 }} />
                          <Bar dataKey="cantidad" fill="var(--primary)" radius={[0, 8, 8, 0]} barSize={14} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                </div>

                <div className={style.chartCard2}> 
                  <h3 className={style.chartTitle2}><span>💳</span> Distribución por método de pago</h3>
                  {reporte.por_metodo.length === 0 ? ( 
                    <p className={style.chartEmpty2}>Sin datos en este período</p>
                    ) : (
                      <ResponsiveContainer width="100%" height={220}>
                        <PieChart>
                          <Pie data={reporte.por_metodo} dataKey="total" nameKey="metodo" cx="50%" cy="45%" innerRadius={58} outerRadius={80} paddingAngle={4}>
                            {reporte.por_metodo.map((_, i) => (<Cell key={i} fill={COLORES_PIE[i % COLORES_PIE.length]} className={style.pieCell}/>))}
                          </Pie>
                          <Tooltip contentStyle={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '0.6rem', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.08)' }} />
                          <Legend verticalAlign="bottom" iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '12px',paddingTop: '10px' }} />
                        </PieChart>
                      </ResponsiveContainer>
                    )
                  }
                </div>
              </div>
            )}

            <div className={style.auditCard}>
              <div className={style.auditInfoGroup}>
                <div className={style.auditIconWrap}><CheckCircle2 size={28} /></div>  
                <div>
                <h3 className={style.auditTitle}>🏦 Corte de caja (hoy)</h3>
                <p className={style.auditDesc}> Verifica de forma segura los montos acumulados de efectivo y terminales</p>
                </div>  
              </div>   
                <button className={style.auditButton} onClick={async () => {
                    const c = await api.get('/reportes/corte-caja')
                    alert(`Efectivo esperado: $${c.efectivo_esperado}\nTotal general: $${c.total_general}`)
                  }}>
                    Ver corte
                    <ArrowUpRight size={16} />
                </button>
              </div>
            </div>
        )}

        {/* ══════════ MESAS ══════════ */}
        {tab === 'mesas' && (
          <div>
            <div className={style.sectionHeader}>
              <h2 className={style.sectionTitle}>Gestión de Mesas</h2>
              <button className={`${style.btn} ${style['btn-primary']}`} onClick={() => { setFormMesa({ nombre: '', capacidad: 4 }); setModalMesa('nueva') }}>
                <Plus size={18} />
                Nueva mesa
              </button>
            </div>
            <div className={style['table-wrap']}>
              <table>
                <thead>
                  <tr>
                    <th>Nombre</th><th>Capacidad</th><th>Estado</th><th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {mesas.map(m => (
                    <tr key={m.id}>
                      <td className={style.tableThFont}>{m.nombre}</td>
                      <td>{m.capacidad} personas</td>
                      <td>
                        <span className={`${style.badge} ${m.estado === 'disponible' ? style['badge-success'] : style['badge-warning']}`}>
                          {m.estado}
                        </span>
                      </td>
                      <td>
                        <div className={style.tableActionsGroup}>
                          <button className={`${style.btn} ${style['btn-ghost']} ${style['btn-sm']}`} onClick={() => {
                            setFormMesa({ nombre: m.nombre, capacidad: m.capacidad })
                            setModalMesa(m)
                          }} title="Editar">
                            <Edit2 size={16} />
                          </button>
                          <button className={`${style.btn} ${style['btn-ghost']} ${style['btn-sm']} ${style.btnErrorText}`} onClick={() => eliminarMesa(m.id)} title="Eliminar">
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
            <div className={style.sectionHeader}>
              <h2 className={style.sectionTitle}>Gestión de Productos</h2>
              <button className={`${style.btn} ${style['btn-primary']}`} onClick={() => {
                setFormProd({ nombre: '', precio: '', estacion: 'gorditas', stock: 100, stock_minimo: 20, activo: true })
                setModalProducto('nuevo')
              }}>
                <Plus size={18} />
                Nuevo producto
              </button>
            </div>
            <div className={style['table-wrap']}>
              <table>
                <thead>
                  <tr><th>Nombre</th><th>Precio</th><th>Estación</th><th>Stock</th><th>Estado</th><th>Acciones</th></tr>
                </thead>
                <tbody>
                  {productos.map(p => (
                    <tr key={p.id} className={p.activo ? style.tableRowActive : style.tableRowInactive}>
                      <td className={style.tableThFont}>{p.nombre}</td>
                      <td className={style.tablePriceText}>${p.precio.toFixed(2)}</td>
                      <td><span className={`${style.badge} ${style['badge-gray']}`}>{p.estacion}</span></td>
                      <td>
                        <span className={`${style.stockTextBase} ${p.stock <= p.stock_minimo ? style.stockTextError : style.stockTextNormal}`}>
                          {p.stock} uds.
                        </span>
                        {p.stock <= p.stock_minimo && <span className={`${style.badge} ${style['badge-error']} ${style.badgeMarginLeft}`}>⚠️ bajo</span>}
                      </td>
                      <td>
                        <span className={`${style.badge} ${p.activo ? style['badge-success'] : style['badge-gray']}`}>
                          {p.activo ? 'activo' : 'inactivo'}
                        </span>
                      </td>
                      <td>
                        <div className={style.tableActionsGroup}>
                          <button className={`${style.btn} ${style['btn-ghost']} ${style['btn-sm']}`} onClick={() => {
                            setFormProd({ nombre: p.nombre, precio: p.precio, estacion: p.estacion, stock: p.stock, stock_minimo: p.stock_minimo, activo: p.activo })
                            setModalProducto(p)
                          }} title="Editar">
                            <Edit2 size={16} />
                          </button>
                          <button className={`${style.btn} ${style['btn-ghost']} ${style['btn-sm']}`} onClick={() => setModalStockId(p.id)} title="Ajustar stock">
                            <TrendingUp size={16} />
                          </button>
                          <button className={`${style.btn} ${style['btn-sm']} ${p.activo ? style['btn-error'] : style['btn-success']}`} onClick={() => toggleActivoProducto(p)}>
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
            <h2 className={style.sectionTitleMb}>Órdenes Activas</h2>
            {ordenes.length === 0
              ? <div className={style.ordenesEmptyWrap}>
                  <p className={style.ordenesEmptyText}>✓ Sin órdenes abiertas</p>
                </div>
              : <div className={style['ordenes-grid']}>
                  {ordenes.map(o => (
                    <div key={o.id} className={style.ordenCard}>
                      <div className={style.ordenHeader}>
                        <div>
                          <div className={style.ordenMesa}>{o.mesa_nombre}</div>
                          <div className={style.ordenNumber}>#{o.id}</div>
                        </div>
                        <div className={style.ordenTimeInfoWrap}>
                          <div className={style.ordenTimeText}>{new Date(o.creado_en).toLocaleTimeString()}</div>
                          <div className={style.ordenTimeText}>{o.mesero_nombre}</div>
                        </div>
                      </div>
                      <div className={style.ordenBody}>
                        {o.items.map(item => (
                          <div key={item.id} className={style.ordenItem}>
                            <div className={style.ordenQty}>{item.cantidad}x</div>
                            <div className={style.ordenProducto}>
                              <div className={style.ordenProductoName}>{item.producto_nombre}</div>
                              {item.modificador_nombre && <div className={style.ordenProductoMod}>▸ {item.modificador_nombre}</div>}
                            </div>
                            <div className={style.ordenStatusGroup}>
                              <span className={`${style.badge} ${
                                item.estado_cocina === 'listo' ? style['badge-success'] :
                                item.estado_cocina === 'preparando' ? style['badge-warning'] : style['badge-gray']
                              }`}>
                                {item.estado_cocina}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className={style.ordenFooter}>
                        <div className={style.ordenSubtotal}>
                          <span>Total:</span>
                          <span className={style.ordenTotalText}>${o.total.toFixed(2)}</span>
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
            <h2 className={style.sectionTitleMb}>Inventario</h2>
            {alertas.length > 0 && (
              <div className={style.invAlertWrap}>
                <AlertTriangle size={20} color='var(--error)' className={style.invAlertIcon} />
                <div>
                  <strong className={style.invAlertText}>{alertas.length} producto(s) con stock bajo</strong>
                </div>
              </div>
            )}
            <div className={style['table-wrap']}>
              <table>
                <thead>
                  <tr><th>Producto</th><th>Estación</th><th>Stock actual</th><th>Mínimo</th><th>Estado</th><th>Acción</th></tr>
                </thead>
                <tbody>
                  {productos.filter(p => p.activo).map(p => (
                    <tr key={p.id}>
                      <td className={style.tableThFont}>{p.nombre}</td>
                      <td><span className={`${style.badge} ${style['badge-gray']}`}>{p.estacion}</span></td>
                      <td className={`${style.stockTextBase} ${p.stock <= p.stock_minimo ? style.stockTextError : style.stockTextNormal}`}>
                        {p.stock}
                      </td>
                      <td style={{ color: 'var(--text-secondary)' }}>{p.stock_minimo}</td>
                      <td>
                        {p.stock <= p.stock_minimo
                          ? <span className={`${style.badge} ${style['badge-error']}`}>⚠️ Stock bajo</span>
                          : <span className={`${style.badge} ${style['badge-success']}`}>✓ OK</span>
                        }
                      </td>
                      <td>
                        <button className={`${style.btn} ${style['btn-ghost']} ${style['btn-sm']}`} onClick={() => { setModalStockId(p.id); setAjusteStock({ delta: '', motivo: 'ingreso' }) }}>
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

      {/* ── MODALES ── */}
      {modalMesa && (
        <Modal title={modalMesa === 'nueva' ? 'Nueva Mesa' : 'Editar Mesa'} onClose={() => setModalMesa(null)}
          footer={<>
            <button className={`${style.btn} ${style['btn-ghost']}`} onClick={() => setModalMesa(null)}>Cancelar</button>
            <button className={`${style.btn} ${style['btn-primary']}`} onClick={guardarMesa}>Guardar</button>
          </>}
        >
          <div className={style['form-field']}>
            <label>Nombre</label>
            <input value={formMesa.nombre} onChange={e => setFormMesa(f => ({ ...f, nombre: e.target.value }))} placeholder="ej. Mesa 5" />
          </div>
          <div className={style['form-field']}>
            <label>Capacidad (personas)</label>
            <input type="number" min="1" value={formMesa.capacidad} onChange={e => setFormMesa(f => ({ ...f, capacidad: parseInt(e.target.value) }))} />
          </div>
        </Modal>
      )}

      {modalProducto && (
        <Modal title={modalProducto === 'nuevo' ? 'Nuevo Producto' : 'Editar Producto'} onClose={() => setModalProducto(null)}
          footer={<>
            <button className={`${style.btn} ${style['btn-ghost']}`} onClick={() => setModalProducto(null)}>Cancelar</button>
            <button className={`${style.btn} ${style['btn-primary']}`} onClick={guardarProducto}>Guardar</button>
          </>}
        >
          <div className={style['form-field']}>
            <label>Nombre</label>
            <input value={formProd.nombre} onChange={e => setFormProd(f => ({ ...f, nombre: e.target.value }))} placeholder="Nombre del producto" />
          </div>
          <div className={style['grid-2']}>
            <div className={style['form-field']}>
              <label>Precio ($)</label>
              <input type="number" step="0.5" min="0" value={formProd.precio} onChange={e => setFormProd(f => ({ ...f, precio: e.target.value }))} placeholder="0.00" />
            </div>
            <div className={style['form-field']}>
              <label>Estación</label>
              <select value={formProd.estacion} onChange={e => setFormProd(f => ({ ...f, estacion: e.target.value }))}>
                <option value="gorditas">Gorditas</option>
                <option value="menudo">Menudo</option>
                <option value="antojitos">Antojitos</option>
              </select>
            </div>
          </div>
          <div className={style['grid-2']}>
            <div className={style['form-field']}>
              <label>Stock inicial</label>
              <input type="number" min="0" value={formProd.stock} onChange={e => setFormProd(f => ({ ...f, stock: e.target.value }))} />
            </div>
            <div className={style['form-field']}>
              <label>Stock mínimo (alerta)</label>
              <input type="number" min="0" value={formProd.stock_minimo} onChange={e => setFormProd(f => ({ ...f, stock_minimo: e.target.value }))} />
            </div>
          </div>
        </Modal>
      )}

      {modalStockId && (
        <Modal title="Ajuste de Stock" onClose={() => setModalStockId(null)}
          footer={<>
            <button className={`${style.btn} ${style['btn-ghost']}`} onClick={() => setModalStockId(null)}>Cancelar</button>
            <button className={`${style.btn} ${style['btn-primary']}`} onClick={aplicarAjusteStock}>Aplicar</button>
          </>}
        >
          <p className={style.modalHelpText}>
            Usa valores positivos para agregar stock, negativos para reducirlo.
          </p>
          <div className={style['form-field']}>
            <label>Cantidad (ej. +50 o -10)</label>
            <input type="number" value={ajusteStock.delta}
              onChange={e => setAjusteStock(a => ({ ...a, delta: e.target.value }))}
              placeholder="ej. 50" />
          </div>
          <div className={style['form-field']}>
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