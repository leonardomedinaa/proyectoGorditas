from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


# Auth
class LoginRequest(BaseModel):
    nombre: str
    password: str


class LoginResponse(BaseModel):
    id: int
    nombre: str
    rol: str


# Mesas
class MesaBase(BaseModel):
    nombre: str
    capacidad: int = 4


class MesaCreate(MesaBase):
    pass


class MesaUpdate(BaseModel):
    nombre: Optional[str] = None
    capacidad: Optional[int] = None
    estado: Optional[str] = None
    bloqueada_por: Optional[int] = None


class MesaOut(MesaBase):
    id: int
    estado: str
    bloqueada_por: Optional[int] = None # 🟢 Esto permite que viaje al frontend

    class Config:
        from_attributes = True


# Productos
class ProductoBase(BaseModel):
    nombre: str
    precio: float
    estacion: str
    stock: int = 100
    stock_minimo: int = 20
    activo: bool = True


class ProductoCreate(ProductoBase):
    pass


class ProductoUpdate(BaseModel):
    nombre: Optional[str] = None
    precio: Optional[float] = None
    estacion: Optional[str] = None
    stock: Optional[int] = None
    stock_minimo: Optional[int] = None
    activo: Optional[bool] = None


class ModificadorOut(BaseModel):
    id: int
    nombre: str
    tipo: str
    precio_extra: float
    descuento_pct: float
    global_mod: bool

    class Config:
        from_attributes = True


class ProductoOut(ProductoBase):
    id: int
    modificadores: List[ModificadorOut] = []

    class Config:
        from_attributes = True


# Ordenes
class OrdenItemCreate(BaseModel):
    producto_id: int
    modificador_id: Optional[int] = None
    cantidad: int = 1
    comentario: Optional[str] = None
    comensal: int = 1  # Por defecto si no se manda, será el comensal 1


class OrdenItemOut(BaseModel):
    id: int
    producto_id: int
    producto_nombre: str
    modificador_id: Optional[int]
    modificador_nombre: Optional[str]
    cantidad: int
    precio_unitario: float
    comentario: Optional[str]
    estado_cocina: str
    estacion: str

    class Config:
        from_attributes = True


class OrdenCreate(BaseModel):
    mesa_id: int
    mesero_id: int
    items: List[OrdenItemCreate]


class OrdenOut(BaseModel):
    id: int
    mesa_id: int
    mesa_nombre: str
    mesero_id: int
    mesero_nombre: str
    estado: str
    creado_en: datetime
    cerrado_en: Optional[datetime]
    items: List[OrdenItemOut] = []
    total: float

    class Config:
        from_attributes = True


# Pagos
class PagoCreate(BaseModel):
    metodo: str
    monto: float


class CerrarOrdenRequest(BaseModel):
    pagos: List[PagoCreate]
    num_divisiones: Optional[int] = None
    mesero_id: int  # <-- Agregar esta línea


# Reportes
class ReporteVentas(BaseModel):
    periodo: str
    total_ventas: float
    num_ordenes: int
    top_productos: List[dict]
    por_metodo: List[dict]


# Inventario
class AjusteStock(BaseModel):
    cantidad_delta: int
    motivo: str
