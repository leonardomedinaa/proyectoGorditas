from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from models import Base, Usuario, Mesa, Producto, Modificador
import hashlib

DATABASE_URL = "sqlite:///./tres_marias.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


def init_db():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    if db.query(Usuario).count() == 0:
        usuarios = [
            Usuario(nombre="Admin", rol="admin", password_hash=hash_password("admin123")),
            Usuario(nombre="Mesero 1", rol="mesero", password_hash=hash_password("mesero1")),
            Usuario(nombre="Mesero 2", rol="mesero", password_hash=hash_password("mesero2")),
            Usuario(nombre="Cocina Gorditas", rol="cocina", password_hash=hash_password("gorditas")),
            Usuario(nombre="Cocina Menudo", rol="cocina", password_hash=hash_password("menudo")),
            Usuario(nombre="Cocina Antojitos", rol="cocina", password_hash=hash_password("antojitos")),
        ]
        db.add_all(usuarios)

    if db.query(Mesa).count() == 0:
        mesas = [Mesa(nombre=f"Mesa {i}", capacidad=4) for i in range(1, 11)]
        db.add_all(mesas)

    if db.query(Producto).count() == 0:
        productos = [
            # Gorditas
            Producto(nombre="Gordita de chicharrón", precio=22.0, estacion="gorditas", stock=50),
            Producto(nombre="Gordita de frijoles", precio=18.0, estacion="gorditas", stock=50),
            Producto(nombre="Gordita de picadillo", precio=25.0, estacion="gorditas", stock=40),
            Producto(nombre="Gordita de papa con chorizo", precio=28.0, estacion="gorditas", stock=40),
            # Menudo
            Producto(nombre="Menudo chico", precio=55.0, estacion="menudo", stock=30),
            Producto(nombre="Menudo grande", precio=75.0, estacion="menudo", stock=30),
            # Antojitos
            Producto(nombre="Taco de guisado", precio=18.0, estacion="antojitos", stock=60),
            Producto(nombre="Enchiladas verdes", precio=65.0, estacion="antojitos", stock=25),
            Producto(nombre="Quesadilla", precio=30.0, estacion="antojitos", stock=45),
            Producto(nombre="Sope", precio=28.0, estacion="antojitos", stock=35),
            # Bebidas (sin estación específica, va a admin)
            Producto(nombre="Agua fresca", precio=20.0, estacion="antojitos", stock=100),
            Producto(nombre="Refresco", precio=25.0, estacion="antojitos", stock=80),
        ]
        db.add_all(productos)
        db.flush()

        # Modificadores globales y por producto
        modificadores = [
            # REQ_8: Extra queso (global)
            Modificador(nombre="Extra queso", tipo="extra", precio_extra=10.0, global_mod=True),
            # REQ_8: Variante menudo (por producto)
            Modificador(producto_id=5, nombre="Con carne", tipo="variante", precio_extra=0.0, descuento_pct=0.0),
            Modificador(producto_id=5, nombre="Sin carne", tipo="variante", precio_extra=0.0, descuento_pct=50.0),
            Modificador(producto_id=6, nombre="Con carne", tipo="variante", precio_extra=0.0, descuento_pct=0.0),
            Modificador(producto_id=6, nombre="Sin carne", tipo="variante", precio_extra=0.0, descuento_pct=50.0),
            # REQ_8: Variante gorditas (presentación)
            Modificador(producto_id=1, nombre="Gordita", tipo="variante", precio_extra=0.0),
            Modificador(producto_id=1, nombre="Solo guiso", tipo="variante", precio_extra=0.0),
            Modificador(producto_id=2, nombre="Gordita", tipo="variante", precio_extra=0.0),
            Modificador(producto_id=2, nombre="Solo guiso", tipo="variante", precio_extra=0.0),
            Modificador(producto_id=3, nombre="Gordita", tipo="variante", precio_extra=0.0),
            Modificador(producto_id=3, nombre="Solo guiso", tipo="variante", precio_extra=0.0),
            Modificador(producto_id=4, nombre="Gordita", tipo="variante", precio_extra=0.0),
            Modificador(producto_id=4, nombre="Solo guiso", tipo="variante", precio_extra=0.0),
        ]
        db.add_all(modificadores)

    db.commit()
    db.close()
