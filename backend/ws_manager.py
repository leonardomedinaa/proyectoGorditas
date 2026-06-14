from fastapi import WebSocket
from typing import Dict, List
import json


class ConnectionManager:
    def __init__(self):
        # Mapa de sala -> lista de conexiones
        # Salas: "admin", "cocina_gorditas", "cocina_menudo", "cocina_antojitos", "mesero_{id}"
        self.rooms: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, room: str):
        await websocket.accept()
        if room not in self.rooms:
            self.rooms[room] = []
        self.rooms[room].append(websocket)

    def disconnect(self, websocket: WebSocket, room: str):
        if room in self.rooms:
            self.rooms[room] = [ws for ws in self.rooms[room] if ws != websocket]

    async def broadcast_to_room(self, room: str, data: dict):
        if room not in self.rooms:
            return
        dead = []
        for ws in self.rooms[room]:
            try:
                await ws.send_text(json.dumps(data))
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.rooms[room].remove(ws)

    async def broadcast_all(self, data: dict):
        for room in list(self.rooms.keys()):
            await self.broadcast_to_room(room, data)

    async def notify_cocina(self, estacion: str, data: dict):
        room = f"cocina_{estacion}"
        await self.broadcast_to_room(room, data)
        # Admin también recibe todo
        await self.broadcast_to_room("admin", data)

    async def notify_admin(self, data: dict):
        await self.broadcast_to_room("admin", data)

    async def notify_meseros(self, data: dict):
        for room in list(self.rooms.keys()):
            if room.startswith("mesero_"):
                await self.broadcast_to_room(room, data)
        await self.broadcast_to_room("admin", data)


manager = ConnectionManager()
