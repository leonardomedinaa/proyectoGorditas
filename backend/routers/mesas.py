from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Mesa
from schemas import MesaCreate, MesaUpdate, MesaOut
from ws_manager import manager
from typing import List

router = APIRouter(prefix="/mesas", tags=["mesas"])


@router.get("/", response_model=List[MesaOut])
def listar_mesas(db: Session = Depends(get_db)):
    return db.query(Mesa).all()


@router.post("/", response_model=MesaOut)
async def crear_mesa(data: MesaCreate, db: Session = Depends(get_db)):
    mesa = Mesa(**data.model_dump())
    db.add(mesa)
    db.commit()
    db.refresh(mesa)
    await manager.broadcast_all({"tipo": "mesa_actualizada", "mesa": {"id": mesa.id, "nombre": mesa.nombre, "estado": mesa.estado, "capacidad": mesa.capacidad}})
    return mesa


@router.put("/{mesa_id}", response_model=MesaOut)
async def actualizar_mesa(mesa_id: int, data: MesaUpdate, db: Session = Depends(get_db)):
    mesa = db.query(Mesa).filter(Mesa.id == mesa_id).first()
    if not mesa:
        raise HTTPException(status_code=404, detail="Mesa no encontrada")
    for k, v in data.model_dump(exclude_none=True).items():
        setattr(mesa, k, v)
    db.commit()
    db.refresh(mesa)
    await manager.broadcast_all({"tipo": "mesa_actualizada", "mesa": {"id": mesa.id, "nombre": mesa.nombre, "estado": mesa.estado, "capacidad": mesa.capacidad}})
    return mesa


@router.delete("/{mesa_id}")
async def eliminar_mesa(mesa_id: int, db: Session = Depends(get_db)):
    mesa = db.query(Mesa).filter(Mesa.id == mesa_id).first()
    if not mesa:
        raise HTTPException(status_code=404, detail="Mesa no encontrada")
    db.delete(mesa)
    db.commit()
    await manager.broadcast_all({"tipo": "mesa_eliminada", "mesa_id": mesa_id})
    return {"ok": True}
