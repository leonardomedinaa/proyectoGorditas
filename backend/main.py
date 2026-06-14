from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from database import get_db, init_db, hash_password
from models import Usuario
from schemas import LoginRequest
from ws_manager import manager
from routers import mesas, productos, ordenes, reportes
import json

app = FastAPI(title="Las Tres Marías POS", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(mesas.router)
app.include_router(productos.router)
app.include_router(ordenes.router)
app.include_router(reportes.router)


@app.on_event("startup")
def startup():
    init_db()


@app.get("/")
def root():
    return {"sistema": "Las Tres Marías POS", "version": "1.0.0", "status": "activo"}


@app.post("/auth/login")
def login(data: LoginRequest, db: Session = Depends(get_db)):
    usuario = db.query(Usuario).filter(
        Usuario.nombre == data.nombre,
        Usuario.password_hash == hash_password(data.password),
        Usuario.activo == True
    ).first()
    if not usuario:
        raise HTTPException(status_code=401, detail="Credenciales incorrectas")
    return {"id": usuario.id, "nombre": usuario.nombre, "rol": usuario.rol}


@app.get("/usuarios")
def listar_usuarios(db: Session = Depends(get_db)):
    usuarios = db.query(Usuario).filter(Usuario.activo == True).all()
    return [{"id": u.id, "nombre": u.nombre, "rol": u.rol} for u in usuarios]


@app.websocket("/ws/{room}")
async def websocket_endpoint(websocket: WebSocket, room: str):
    await manager.connect(websocket, room)
    try:
        while True:
            data = await websocket.receive_text()
            # El cliente puede enviar pings para mantener la conexión
            try:
                msg = json.loads(data)
                if msg.get("tipo") == "ping":
                    await websocket.send_text(json.dumps({"tipo": "pong"}))
            except Exception:
                pass
    except WebSocketDisconnect:
        manager.disconnect(websocket, room)
