from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from database import get_db
from models import Orden, OrdenItem, Mesa, Producto, Modificador, Pago, CuentaDivision, InventarioMovimiento
from schemas import OrdenCreate, OrdenOut, OrdenItemOut, CerrarOrdenRequest
from ws_manager import manager
from datetime import datetime
from typing import List

router = APIRouter(prefix="/ordenes", tags=["ordenes"])


def build_orden_out(orden: Orden) -> dict:
    items = []
    total = 0.0
    for item in orden.items:
        precio = item.precio_unitario * item.cantidad
        total += precio
        items.append({
            "id": item.id,
            "producto_id": item.producto_id,
            "producto_nombre": item.producto.nombre if item.producto else "",
            "modificador_id": item.modificador_id,
            "modificador_nombre": item.modificador.nombre if item.modificador else None,
            "cantidad": item.cantidad,
            "precio_unitario": item.precio_unitario,
            "comentario": item.comentario,
            "estado_cocina": item.estado_cocina,
            "estacion": item.producto.estacion if item.producto else "",
            "comensal": item.comensal,
        })
    return {
        "id": orden.id,
        "mesa_id": orden.mesa_id,
        "mesa_nombre": orden.mesa.nombre if orden.mesa else "",
        "mesero_id": orden.mesero_id,
        "mesero_nombre": orden.mesero.nombre if orden.mesero else "",
        "estado": orden.estado,
        "creado_en": orden.creado_en.isoformat(),
        "cerrado_en": orden.cerrado_en.isoformat() if orden.cerrado_en else None,
        "items": items,
        "total": total,
    }


@router.get("/", response_model=List[dict])
def listar_ordenes(db: Session = Depends(get_db)):
    ordenes = db.query(Orden).options(
        joinedload(Orden.mesa),
        joinedload(Orden.mesero),
        joinedload(Orden.items).joinedload(OrdenItem.producto),
        joinedload(Orden.items).joinedload(OrdenItem.modificador),
    ).filter(Orden.estado == "abierta").all()
    return [build_orden_out(o) for o in ordenes]


@router.get("/{orden_id}")
def obtener_orden(orden_id: int, db: Session = Depends(get_db)):
    orden = db.query(Orden).options(
        joinedload(Orden.mesa),
        joinedload(Orden.mesero),
        joinedload(Orden.items).joinedload(OrdenItem.producto),
        joinedload(Orden.items).joinedload(OrdenItem.modificador),
    ).filter(Orden.id == orden_id).first()
    if not orden:
        raise HTTPException(status_code=404, detail="Orden no encontrada")
    return build_orden_out(orden)


@router.post("/")
async def crear_orden(data: OrdenCreate, db: Session = Depends(get_db)):
    # Validar mesa
    mesa = db.query(Mesa).filter(Mesa.id == data.mesa_id).first()
    if not mesa:
        raise HTTPException(status_code=404, detail="Mesa no encontrada")

    orden = Orden(mesa_id=data.mesa_id, mesero_id=data.mesero_id)
    db.add(orden)
    db.flush()

    items_por_estacion: dict[str, list] = {}

    for item_data in data.items:
        producto = db.query(Producto).filter(Producto.id == item_data.producto_id).first()
        if not producto:
            raise HTTPException(status_code=404, detail=f"Producto {item_data.producto_id} no encontrado")

        precio = producto.precio

        # Aplicar modificador si existe
        if item_data.modificador_id:
            mod = db.query(Modificador).filter(Modificador.id == item_data.modificador_id).first()
            if mod:
                precio += mod.precio_extra
                if mod.descuento_pct > 0:
                    precio = precio * (1 - mod.descuento_pct / 100)

        item = OrdenItem(
            orden_id=orden.id,
            producto_id=item_data.producto_id,
            modificador_id=item_data.modificador_id,
            cantidad=item_data.cantidad,
            precio_unitario=precio,
            comentario=item_data.comentario,
            comensal=item_data.comensal,
        )
        db.add(item)
        db.flush()

        # Descontar stock
        producto.stock -= item_data.cantidad
        mov = InventarioMovimiento(
            producto_id=producto.id,
            cantidad_delta=-item_data.cantidad,
            motivo="venta"
        )
        db.add(mov)

        # Alertar si stock bajo
        if producto.stock <= producto.stock_minimo:
            await manager.notify_admin({
                "tipo": "alerta_stock",
                "producto_id": producto.id,
                "producto_nombre": producto.nombre,
                "stock": producto.stock,
                "stock_minimo": producto.stock_minimo
            })

        # Agrupar por estación real del producto para envío a cocina
        estacion = producto.estacion if producto.estacion else "gorditas" # Fallback por si acaso
        if estacion not in items_por_estacion:
            items_por_estacion[estacion] = []
        items_por_estacion[estacion].append({
            "item_id": item.id,
            "producto": producto.nombre,
            "cantidad": item_data.cantidad,
            "modificador": None,
            "comentario": item_data.comentario,
            "comensal": item.comensal,
        })

    # Actualizar estado de mesa
    mesa.estado = "ocupada"
    db.commit()

    # Recargar para tener relaciones
    db.refresh(orden)
    orden_out = build_orden_out(
        db.query(Orden).options(
            joinedload(Orden.mesa),
            joinedload(Orden.mesero),
            joinedload(Orden.items).joinedload(OrdenItem.producto),
            joinedload(Orden.items).joinedload(OrdenItem.modificador),
        ).filter(Orden.id == orden.id).first()
    )

    # Enviar comandas a cocinas correspondientes
    for estacion, items in items_por_estacion.items():
        await manager.notify_cocina(estacion, {
            "tipo": "nueva_comanda",
            "orden_id": orden.id,
            "mesa": mesa.nombre,
            "items": items,
            "mesero": data.mesero_id,
        })

    # Notificar a meseros y admin del cambio de mesa
    await manager.notify_meseros({
        "tipo": "mesa_actualizada",
        "mesa": {"id": mesa.id, "nombre": mesa.nombre, "estado": mesa.estado, "capacidad": mesa.capacidad}
    })

    await manager.notify_meseros({"tipo": "orden_creada", "orden": orden_out})
    return orden_out


@router.post("/{orden_id}/agregar-items")
async def agregar_items(orden_id: int, items_data: List[dict], db: Session = Depends(get_db)):
    orden = db.query(Orden).filter(Orden.id == orden_id).first()
    if not orden or orden.estado != "abierta":
        raise HTTPException(status_code=400, detail="Orden no válida")

    items_por_estacion: dict[str, list] = {}

    for item_data in items_data:
        producto = db.query(Producto).filter(Producto.id == item_data["producto_id"]).first()
        if not producto:
            continue
        precio = producto.precio
        mod = None
        if item_data.get("modificador_id"):
            mod = db.query(Modificador).filter(Modificador.id == item_data["modificador_id"]).first()
            if mod:
                precio += mod.precio_extra
                if mod.descuento_pct > 0:
                    precio = precio * (1 - mod.descuento_pct / 100)

        item = OrdenItem(
            orden_id=orden_id,
            producto_id=producto.id,
            modificador_id=item_data.get("modificador_id"),
            cantidad=item_data.get("cantidad", 1),
            precio_unitario=precio,
            comentario=item_data.get("comentario"),
            comensal=item_data.get("comensal", 1),
        )
        db.add(item)
        db.flush()

        producto.stock -= item.cantidad
        db.add(InventarioMovimiento(producto_id=producto.id, cantidad_delta=-item.cantidad, motivo="venta"))

        # Recuperar de manera dinámica la estación del producto agregado
        estacion = producto.estacion if producto.estacion else "gorditas"
        if estacion not in items_por_estacion:
            items_por_estacion[estacion] = []
        items_por_estacion[estacion].append({
            "item_id": item.id,
            "producto": producto.nombre,
            "cantidad": item.cantidad,
            "comentario": item.comentario,
            "comensal": item.comensal,
        })

    db.commit()

    for estacion, items in items_por_estacion.items():
        await manager.notify_cocina(estacion, {
            "tipo": "nueva_comanda",
            "orden_id": orden_id,
            "mesa": orden.mesa.nombre if orden.mesa else "",
            "items": items,
        })

    return {"ok": True}


@router.patch("/{orden_id}/item/{item_id}/estado")
async def actualizar_estado_item(orden_id: int, item_id: int, body: dict, db: Session = Depends(get_db)):
    # Añadimos joinedload para traer la orden y la mesa de forma eficiente
    item = db.query(OrdenItem).filter(OrdenItem.id == item_id, OrdenItem.orden_id == orden_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item no encontrado")
        
    item.estado_cocina = body.get("estado_cocina", item.estado_cocina)
    db.commit()

    # Recuperamos el nombre de la mesa de forma segura a través de las relaciones de SQLAlchemy
    mesa_nombre = item.orden.mesa.nombre if item.orden and item.orden.mesa else "?"

    await manager.notify_meseros({
        "tipo": "item_listo",
        "orden_id": orden_id,
        "item_id": item_id,
        "estado_cocina": item.estado_cocina,
        "producto": item.producto.nombre if item.producto else "",
        "mesa": mesa_nombre,  # <--- ✨ AHORA SÍ LO MANDAMOS
    })


@router.post("/{orden_id}/cerrar")
async def cerrar_orden(orden_id: int, data: CerrarOrdenRequest, db: Session = Depends(get_db)):
    orden = db.query(Orden).filter(Orden.id == orden_id).first()
    if not orden or orden.estado != "abierta":
        raise HTTPException(status_code=400, detail="Orden no válida")
    
    mesa_objeto = orden.mesa 
    ordenes_abiertas = db.query(Orden).options(
            joinedload(Orden.items).joinedload(OrdenItem.producto)
        ).filter(
            Orden.mesa_id == mesa_objeto.id,
            Orden.estado == "abierta"
        ).all()
    
    total = sum(i.precio_unitario * i.cantidad for orden in ordenes_abiertas for i in orden.items)

    # Registrar pagos
    for pago_data in data.pagos:
        pago = Pago(orden_id=orden_id, metodo=pago_data.metodo, monto=pago_data.monto)
        db.add(pago)

    # Registrar división si aplica
    if data.num_divisiones and data.num_divisiones > 1:
        division = CuentaDivision(
            orden_id=orden_id,
            num_partes=data.num_divisiones,
            monto_por_parte=round(total / data.num_divisiones, 2)
        )
        db.add(division)

    # Cerrar orden y liberar mesa
    ahora = datetime.utcnow()
    for o in ordenes_abiertas:
        o.estado = "pagada"
        o.cerrado_en = ahora
    mesa_objeto.estado = "disponible"
    db.commit()
    ids_cerrados = [o.id for o in ordenes_abiertas]
    await manager.notify_meseros({
        "tipo": "orden_cerrada",
        "orden_id": orden_id,
        "ordenes_afectadas": ids_cerrados,
        "mesa": {
            "id": mesa_objeto.id, 
            "nombre": mesa_objeto.nombre, 
            "estado": mesa_objeto.estado, 
            "capacidad": mesa_objeto.capacidad
        }
    })
    
    return {"ok": True, "total": total, "ordenes_cerradas": len(ids_cerrados)}


@router.get("/cocina/{estacion}")
def ordenes_cocina(estacion: str, db: Session = Depends(get_db)):
    items = db.query(OrdenItem).join(OrdenItem.producto).join(OrdenItem.orden).options(
        joinedload(OrdenItem.producto),
        joinedload(OrdenItem.modificador),
        joinedload(OrdenItem.orden).joinedload(Orden.mesa),
    ).filter(
        # Filtramos dinámicamente por la estación solicitada en la URL de cocina
        Producto.estacion == estacion, 
        Orden.estado == "abierta",
        OrdenItem.estado_cocina != "listo"
    ).all()

    result = []
    for item in items:
        result.append({
            "item_id": item.id,
            "orden_id": item.orden_id,
            "mesa": item.orden.mesa.nombre if item.orden and item.orden.mesa else "",
            "producto": item.producto.nombre if item.producto else "",
            "modificador": item.modificador.nombre if item.modificador else None,
            "cantidad": item.cantidad,
            "comentario": item.comentario,
            "estado_cocina": item.estado_cocina,
            "comensal": item.comensal,
        })
    return result