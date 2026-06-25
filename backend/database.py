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

    # 1. Sembrado de Usuarios
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

    # 2. Sembrado de Mesas
    if db.query(Mesa).count() == 0:
        mesas = [Mesa(nombre=f"Mesa {i}", capacidad=4) for i in range(1, 11)]
        db.add_all(mesas)

    # 3. Sembrado de Productos y Modificadores Reales (image_92b19d.jpg e image_92b1ba.jpg)
    if db.query(Producto).count() == 0:
        # Definimos los productos base mapeados de las imágenes
        lista_productos = [
            # --- GORDITAS (image_92b1ba.jpg) ---
            Producto(nombre="Gorda de comal", precio=17.0, estacion="gorditas", stock=100),
            
            # --- MENUDO (image_92b1ba.jpg) ---
            Producto(nombre="Menudo Chico", precio=130.0, estacion="menudo", stock=40),
            Producto(nombre="Menudo Mediano", precio=140.0, estacion="menudo", stock=40),
            Producto(nombre="Menudo Grande", precio=150.0, estacion="menudo", stock=40),
            
            # --- ANTOJITOS Y ESPECIALES (image_92b1ba.jpg) ---
            Producto(nombre="Huarache (Guiso y Queso Asadero)", precio=50.0, estacion="antojitos", stock=50),
            Producto(nombre="Sope sencillo", precio=30.0, estacion="antojitos", stock=60),
            Producto(nombre="Sope con guiso", precio=35.0, estacion="antojitos", stock=60),
            Producto(nombre="Tacos Rojos (6 Tacos)", precio=70.0, estacion="antojitos", stock=40),
            Producto(nombre="Orden de Enchiladas (6 Enchiladas)", precio=70.0, estacion="antojitos", stock=40),
            
            # --- BIRRIA (image_92b19d.jpg) ---
            Producto(nombre="Tacos de maíz de birria", precio=25.0, estacion="antojitos", stock=80),
            Producto(nombre="Quesabirria Maíz", precio=30.0, estacion="antojitos", stock=80),
            Producto(nombre="Quesabirria Maíz Morado", precio=35.0, estacion="antojitos", stock=40),
            Producto(nombre="Quesabirria Harina", precio=35.0, estacion="antojitos", stock=60),
            Producto(nombre="Huarache de birria", precio=60.0, estacion="antojitos", stock=40),
            Producto(nombre="Huarache Maíz Morado de birria", precio=60.0, estacion="antojitos", stock=40),
            Producto(nombre="Birriamen", precio=100.0, estacion="antojitos", stock=30),
            Producto(nombre="Orden de birria (Plato mediano, 200g Carne)", precio=110.0, estacion="antojitos", stock=30),
            Producto(nombre="Consome con carne (500ml, 100g Carne)", precio=60.0, estacion="antojitos", stock=40),
            Producto(nombre="Kg de birria", precio=388.0, estacion="antojitos", stock=15),
            Producto(nombre="1/2 Kg de birria", precio=200.0, estacion="antojitos", stock=20),
            
            # --- BEBIDAS (image_92b19d.jpg) ---
            Producto(nombre="Café de olla", precio=30.0, estacion="antojitos", stock=100),
            Producto(nombre="Canela", precio=30.0, estacion="antojitos", stock=100),
            Producto(nombre="Agua de Sabor (Vaso 500ml)", precio=30.0, estacion="antojitos", stock=150),
            Producto(nombre="Refresco 500ml (Vidrio)", precio=30.0, estacion="antojitos", stock=200),
            Producto(nombre="Refresco 1.5 Lts.", precio=50.0, estacion="antojitos", stock=100),
            Producto(nombre="CocaCola Light 500ml", precio=30.0, estacion="antojitos", stock=80),
            Producto(nombre="Cerveza (Corona/Victoria)", precio=35.0, estacion="antojitos", stock=120),
            Producto(nombre="Fuze Tea", precio=30.0, estacion="antojitos", stock=90),
            Producto(nombre="Boing 250ml (Caja)", precio=15.0, estacion="antojitos", stock=100),
            Producto(nombre="Boing 354ml (Vidrio)", precio=25.0, estacion="antojitos", stock=100),
        ]
        
        db.add_all(lista_productos)
        db.flush()  # Genera las llaves primarias en memoria para poder usarlas inmediatamente

        # Creamos un diccionario de acceso rápido por nombre de producto
        prod_map = {p.nombre: p.id for p in lista_productos}

        # --- SECCIÓN DE MODIFICADORES ---
        modificadores = [
            # Modificador Global (REQ_8)
            Modificador(nombre="Extra queso", tipo="extra", precio_extra=10.0, global_mod=True),
        ]

        # Lista de guisos reales del menú (image_92b1ba.jpg)
        guisos_reales = [
            "Chicharrón de cachete", "Bistec", "Deshebrada de res", 
            "Huevo rojo", "Huevo verde", "Papas c/queso", 
            "Rajas c/queso", "Nopales rojos", "Moronga", "Frijoles"
        ]

        # Inyectamos dinámicamente los guisos como variantes a las Gorditas, Huaraches y Sopes con guiso
        productos_con_guiso = [
            "Gorda de comal", 
            "Huarache (Guiso y Queso Asadero)", 
            "Sope con guiso"
        ]

        for prod_nombre in productos_con_guiso:
            if prod_nombre in prod_map:
                p_id = prod_map[prod_nombre]
                for guiso in guisos_reales:
                    modificadores.append(
                        Modificador(producto_id=p_id, nombre=f"De {guiso}", tipo="variante", precio_extra=0.0)
                    )

        # Variantes de Menudo (image_92b1ba.jpg)
        for t in ["Menudo Chico", "Menudo Mediano", "Menudo Grande"]:
            if t in prod_map:
                modificadores.extend([
                    Modificador(producto_id=prod_map[t], nombre="Con carne", tipo="variante", precio_extra=0.0),
                    Modificador(producto_id=prod_map[t], nombre="Sin carne", tipo="variante", precio_extra=0.0)
                ])

        db.add_all(modificadores)

    db.commit()
    db.close()