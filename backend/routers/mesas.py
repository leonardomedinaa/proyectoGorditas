from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Mesa
from schemas import MesaCreate, MesaUpdate, MesaOut
from ws_manager import manager
from typing import List
from sqlalchemy import func

router = APIRouter(prefix="/mesas", tags=["mesas"])


def normalizar_cadena_extrema(texto: str) -> str:
    """
    Convierte a minúsculas y elimina absolutamente TODOS los espacios
    en blanco (intermedios, iniciales y finales).
    Ejemplo: '  Mesa  1  ' -> 'mesa1'
    """
    if not texto:
        return ""
    return "".join(texto.split()).lower()


@router.get("/", response_model=List[MesaOut])
def listar_mesas(db: Session = Depends(get_db)):
    return db.query(Mesa).filter(Mesa.estado != "inactiva").order_by(Mesa.nombre).all()


@router.post("/", response_model=MesaOut)
async def crear_mesa(data: MesaCreate, db: Session = Depends(get_db)):
    nombre_limpio = data.nombre.strip()
    token_nuevo = normalizar_cadena_extrema(nombre_limpio)
    
    # 1. Buscar si existe una mesa igual, incluso si está inactiva
    # Buscamos en TODAS las mesas para ver si el nombre está ocupado
    mesa_existente = db.query(Mesa).all()
    
    for m in mesa_existente:
        if normalizar_cadena_extrema(m.nombre) == token_nuevo:
            # Si la mesa está "inactiva", la podemos reutilizar
            if m.estado == "inactiva":
                m.estado = "disponible"  # Reactivar
                m.capacidad = data.capacidad  # Actualizar capacidad si cambió
                db.commit()
                db.refresh(m)
                
                # Broadcast de reactivación
                await manager.broadcast_all({"tipo": "mesa_actualizada", "mesa": {"id": m.id, "nombre": m.nombre, "estado": m.estado, "capacidad": m.capacidad}})
                return m
            else:
                # Si está activa, lanzamos error como tenías antes
                raise HTTPException(
                    status_code=400, 
                    detail=f"Ya existe una mesa activa llamada '{m.nombre}'"
                )
    
    # 2. Si no se encontró ninguna, creamos la nueva mesa normalmente
    data.nombre = nombre_limpio
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
    
    # Actualizar datos
    for k, v in data.model_dump(exclude_none=True).items():
        setattr(mesa, k, v)
    
    db.commit()
    db.refresh(mesa)
    
    # Broadcast
    await manager.broadcast_all({
        "tipo": "mesa_actualizada", 
        "mesa": {"id": mesa.id, "nombre": mesa.nombre, "estado": mesa.estado, "capacidad": mesa.capacidad}
    })
    
    return mesa # 


@router.delete("/{mesa_id}")
async def eliminar_mesa(mesa_id: int, db: Session = Depends(get_db)):
    mesa = db.query(Mesa).filter(Mesa.id == mesa_id).first()
    if not mesa:
        raise HTTPException(status_code=404, detail="Mesa no encontrada")
    mesa.estado = "inactiva" 
    db.commit()
    await manager.broadcast_all({"tipo": "mesa_eliminada", "mesa_id": mesa_id})
    return {"ok": True}
@router.post("/{mesa_id}/bloquear")
async def bloquear_mesa(mesa_id: int, body: dict, db: Session = Depends(get_db)):
    mesa = db.query(Mesa).filter(Mesa.id == mesa_id).first()
    if not mesa:
        raise HTTPException(status_code=404, detail="Mesa no encontrada")
    
    # Si ya está ocupada o alguien más la está usando, impedir el bloqueo
    if mesa.estado == "ocupada":
        raise HTTPException(status_code=400, detail="La mesa ya está ocupada con una orden")
    if mesa.estado == "ordenando":
        raise HTTPException(status_code=400, detail="Otro mesero ya está tomando orden en esta mesa")
        
    mesero_id = body.get("mesero_id")
    mesa.estado = "ordenando"
    mesa.bloqueada_por = mesero_id
    db.commit()
    
    # Avisar a todos los meseros en tiempo real
    await manager.broadcast_all({
        "tipo": "mesa_actualizada", 
        "mesa": {
            "id": mesa.id, 
            "nombre": mesa.nombre, 
            "estado": mesa.estado, 
            "capacidad": mesa.capacidad,
            "bloqueada_por": mesero_id
        }
    })
    return {"ok": True}


@router.post("/{mesa_id}/desbloquear")
async def desbloquear_mesa(mesa_id: int, db: Session = Depends(get_db)):
    mesa = db.query(Mesa).filter(Mesa.id == mesa_id).first()
    if not mesa:
        raise HTTPException(status_code=404, detail="Mesa no encontrada")
        
    # Solo revertimos si estaba en proceso de orden
    if mesa.estado == "ordenando":
        mesa.estado = "disponible"
        mesa.bloqueada_por = None
        db.commit()
        
        await manager.broadcast_all({
            "tipo": "mesa_actualizada", 
            "mesa": {
                "id": mesa.id, 
                "nombre": mesa.nombre, 
                "estado": mesa.estado, 
                "capacidad": mesa.capacidad,
                "bloqueada_por": None
            }
        })
    return {"ok": True}
    return {"status": "success", "message": "Mesa desactivada correctamente"}
