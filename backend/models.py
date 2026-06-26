from sqlalchemy import (
    Column, Integer, String, Float, Boolean,
    DateTime, ForeignKey, Text, create_engine
)
from sqlalchemy.orm import declarative_base, relationship
from datetime import datetime

Base = declarative_base()


class Usuario(Base):
    __tablename__ = "usuarios"
    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String, nullable=False)
    rol = Column(String, nullable=False)  # mesero | admin | cocina
    password_hash = Column(String, nullable=False)
    activo = Column(Boolean, default=True)

    ordenes = relationship("Orden", back_populates="mesero")


class Mesa(Base):
    __tablename__ = "mesas"
    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String, nullable=False)
    estado = Column(String, default="disponible")  # disponible | ocupada
    capacidad = Column(Integer, default=4)
    bloqueada_por = Column(Integer, nullable=True)
    ordenes = relationship("Orden", back_populates="mesa")


class Producto(Base):
    __tablename__ = "productos"
    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String, nullable=False)
    precio = Column(Float, nullable=False)
    estacion = Column(String, nullable=False)  # gorditas | menudo | antojitos
    stock = Column(Integer, default=100)
    stock_minimo = Column(Integer, default=20)
    activo = Column(Boolean, default=True)

    modificadores = relationship("Modificador", back_populates="producto")
    movimientos = relationship("InventarioMovimiento", back_populates="producto")


class Modificador(Base):
    __tablename__ = "modificadores"
    id = Column(Integer, primary_key=True, index=True)
    producto_id = Column(Integer, ForeignKey("productos.id"), nullable=True)
    nombre = Column(String, nullable=False)
    tipo = Column(String, nullable=False)  # extra | variante
    precio_extra = Column(Float, default=0.0)
    descuento_pct = Column(Float, default=0.0)  # porcentaje 0-100
    global_mod = Column(Boolean, default=False)  # aplica a todos (ej. extra queso)

    producto = relationship("Producto", back_populates="modificadores")


class Orden(Base):
    __tablename__ = "ordenes"
    id = Column(Integer, primary_key=True, index=True)
    mesa_id = Column(Integer, ForeignKey("mesas.id"), nullable=False)
    mesero_id = Column(Integer, ForeignKey("usuarios.id"), nullable=False)
    estado = Column(String, default="abierta")  # abierta | pagada | cancelada
    creado_en = Column(DateTime, default=datetime.utcnow)
    cerrado_en = Column(DateTime, nullable=True)

    mesa = relationship("Mesa", back_populates="ordenes")
    mesero = relationship("Usuario", back_populates="ordenes")
    items = relationship("OrdenItem", back_populates="orden")
    pagos = relationship("Pago", back_populates="orden")
    division = relationship("CuentaDivision", back_populates="orden", uselist=False)


class OrdenItem(Base):
    __tablename__ = "orden_items"
    id = Column(Integer, primary_key=True, index=True)
    orden_id = Column(Integer, ForeignKey("ordenes.id"), nullable=False)
    producto_id = Column(Integer, ForeignKey("productos.id"), nullable=False)
    modificador_id = Column(Integer, ForeignKey("modificadores.id"), nullable=True)
    cantidad = Column(Integer, default=1)
    precio_unitario = Column(Float, nullable=False)
    comentario = Column(Text, nullable=True)
    estado_cocina = Column(String, default="pendiente")  # pendiente | preparando | listo

    orden = relationship("Orden", back_populates="items")
    producto = relationship("Producto")
    modificador = relationship("Modificador")
    comensal = Column(Integer, default=1, nullable=False)

class Pago(Base):
    __tablename__ = "pagos"
    id = Column(Integer, primary_key=True, index=True)
    orden_id = Column(Integer, ForeignKey("ordenes.id"), nullable=False)
    metodo = Column(String, nullable=False)  # efectivo | transferencia | tarjeta
    monto = Column(Float, nullable=False)
    pagado_en = Column(DateTime, default=datetime.utcnow)

    orden = relationship("Orden", back_populates="pagos")


class CuentaDivision(Base):
    __tablename__ = "cuenta_divisiones"
    id = Column(Integer, primary_key=True, index=True)
    orden_id = Column(Integer, ForeignKey("ordenes.id"), nullable=False)
    num_partes = Column(Integer, nullable=False)
    monto_por_parte = Column(Float, nullable=False)

    orden = relationship("Orden", back_populates="division")


class InventarioMovimiento(Base):
    __tablename__ = "inventario_movimientos"
    id = Column(Integer, primary_key=True, index=True)
    producto_id = Column(Integer, ForeignKey("productos.id"), nullable=False)
    cantidad_delta = Column(Integer, nullable=False)
    motivo = Column(String, nullable=False)  # venta | ajuste | ingreso
    registrado_en = Column(DateTime, default=datetime.utcnow)

    producto = relationship("Producto", back_populates="movimientos")
