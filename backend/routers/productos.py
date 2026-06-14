from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from database import get_db
from models import Producto, Modificador, InventarioMovimiento
from schemas import ProductoCreate, ProductoUpdate, ProductoOut, AjusteStock
from ws_manager import manager
from typing import List

router = APIRouter(prefix="/productos", tags=["productos"])


@router.get("/", response_model=List[ProductoOut])
def listar_productos(db: Session = Depends(get_db)):
    return db.query(Producto).options(joinedload(Producto.modificadores)).filter(Producto.activo == True).all()


@router.get("/todos", response_model=List[ProductoOut])
def listar_todos(db: Session = Depends(get_db)):
    return db.query(Producto).options(joinedload(Producto.modificadores)).all()


@router.post("/", response_model=ProductoOut)
def crear_producto(data: ProductoCreate, db: Session = Depends(get_db)):
    producto = Producto(**data.model_dump())
    db.add(producto)
    db.commit()
    db.refresh(producto)
    return producto


@router.put("/{producto_id}", response_model=ProductoOut)
async def actualizar_producto(producto_id: int, data: ProductoUpdate, db: Session = Depends(get_db)):
    producto = db.query(Producto).filter(Producto.id == producto_id).first()
    if not producto:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    for k, v in data.model_dump(exclude_none=True).items():
        setattr(producto, k, v)
    db.commit()
    db.refresh(producto)
    await manager.broadcast_all({"tipo": "producto_actualizado", "producto_id": producto_id, "precio": producto.precio})
    return producto


@router.post("/{producto_id}/ajuste-stock")
async def ajustar_stock(producto_id: int, data: AjusteStock, db: Session = Depends(get_db)):
    producto = db.query(Producto).filter(Producto.id == producto_id).first()
    if not producto:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    producto.stock += data.cantidad_delta
    mov = InventarioMovimiento(producto_id=producto_id, cantidad_delta=data.cantidad_delta, motivo=data.motivo)
    db.add(mov)
    db.commit()
    db.refresh(producto)
    # Alerta si stock bajo
    if producto.stock <= producto.stock_minimo:
        await manager.notify_admin({
            "tipo": "alerta_stock",
            "producto_id": producto.id,
            "producto_nombre": producto.nombre,
            "stock": producto.stock,
            "stock_minimo": producto.stock_minimo
        })
    return {"stock": producto.stock}


@router.get("/alertas-stock")
def alertas_stock(db: Session = Depends(get_db)):
    productos = db.query(Producto).filter(
        Producto.activo == True,
        Producto.stock <= Producto.stock_minimo
    ).all()
    return [{"id": p.id, "nombre": p.nombre, "stock": p.stock, "stock_minimo": p.stock_minimo} for p in productos]
