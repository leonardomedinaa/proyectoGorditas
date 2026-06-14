from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from database import get_db
from models import Orden, OrdenItem, Pago, Producto
from datetime import datetime, timedelta

router = APIRouter(prefix="/reportes", tags=["reportes"])


def get_reporte(db: Session, desde: datetime, hasta: datetime, periodo: str):
    ordenes = db.query(Orden).filter(
        Orden.estado == "pagada",
        Orden.cerrado_en >= desde,
        Orden.cerrado_en <= hasta,
    ).all()

    orden_ids = [o.id for o in ordenes]

    total_ventas = db.query(func.sum(Pago.monto)).filter(
        Pago.orden_id.in_(orden_ids)
    ).scalar() or 0.0

    # Top 5 productos
    top = db.query(
        Producto.nombre,
        func.sum(OrdenItem.cantidad).label("total_vendido"),
        func.sum(OrdenItem.cantidad * OrdenItem.precio_unitario).label("total_ingreso"),
    ).join(OrdenItem, OrdenItem.producto_id == Producto.id).filter(
        OrdenItem.orden_id.in_(orden_ids)
    ).group_by(Producto.nombre).order_by(
        func.sum(OrdenItem.cantidad).desc()
    ).limit(5).all()

    # Por método de pago
    por_metodo = db.query(
        Pago.metodo,
        func.sum(Pago.monto).label("total"),
        func.count(Pago.id).label("num")
    ).filter(Pago.orden_id.in_(orden_ids)).group_by(Pago.metodo).all()

    return {
        "periodo": periodo,
        "desde": desde.isoformat(),
        "hasta": hasta.isoformat(),
        "total_ventas": round(total_ventas, 2),
        "num_ordenes": len(ordenes),
        "top_productos": [
            {"nombre": t.nombre, "cantidad": int(t.total_vendido), "ingreso": round(float(t.total_ingreso), 2)}
            for t in top
        ],
        "por_metodo": [
            {"metodo": m.metodo, "total": round(float(m.total), 2), "num_transacciones": m.num}
            for m in por_metodo
        ],
    }


@router.get("/dia")
def reporte_dia(db: Session = Depends(get_db)):
    ahora = datetime.utcnow()
    desde = ahora.replace(hour=0, minute=0, second=0, microsecond=0)
    return get_reporte(db, desde, ahora, "dia")


@router.get("/semana")
def reporte_semana(db: Session = Depends(get_db)):
    ahora = datetime.utcnow()
    desde = ahora - timedelta(days=7)
    return get_reporte(db, desde, ahora, "semana")


@router.get("/mes")
def reporte_mes(db: Session = Depends(get_db)):
    ahora = datetime.utcnow()
    desde = ahora.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    return get_reporte(db, desde, ahora, "mes")


@router.get("/corte-caja")
def corte_caja(db: Session = Depends(get_db)):
    ahora = datetime.utcnow()
    desde = ahora.replace(hour=0, minute=0, second=0, microsecond=0)
    pagos = db.query(Pago).filter(Pago.pagado_en >= desde).all()
    resumen = {}
    for pago in pagos:
        if pago.metodo not in resumen:
            resumen[pago.metodo] = 0.0
        resumen[pago.metodo] += pago.monto
    return {
        "fecha": ahora.date().isoformat(),
        "resumen": [{"metodo": k, "total": round(v, 2)} for k, v in resumen.items()],
        "total_general": round(sum(resumen.values()), 2),
        "efectivo_esperado": round(resumen.get("efectivo", 0.0), 2),
    }
