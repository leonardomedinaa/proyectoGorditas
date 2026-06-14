// Detecta la IP del servidor automáticamente desde el navegador
const HOST = window.location.hostname
export const API_URL = `http://${HOST}:8000`
export const WS_URL  = `ws://${HOST}:8000`

async function request(method, path, body) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Error de red' }))
    throw new Error(err.detail || 'Error desconocido')
  }
  return res.json()
}

export const api = {
  get:    (path)         => request('GET',    path),
  post:   (path, body)   => request('POST',   path, body),
  put:    (path, body)   => request('PUT',    path, body),
  patch:  (path, body)   => request('PATCH',  path, body),
  delete: (path)         => request('DELETE', path),
}

// WebSocket helper – reconecta automáticamente
export function createWS(room, onMessage) {
  let ws, closed = false, timer

  function connect() {
    ws = new WebSocket(`${WS_URL}/ws/${room}`)
    ws.onmessage = e => {
      try { onMessage(JSON.parse(e.data)) } catch {}
    }
    ws.onclose = () => {
      if (!closed) timer = setTimeout(connect, 2000)
    }
    // Ping cada 30s para mantener viva la conexión
    ws.onopen = () => {
      timer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN)
          ws.send(JSON.stringify({ tipo: 'ping' }))
      }, 30000)
    }
  }

  connect()
  return () => { closed = true; clearInterval(timer); ws?.close() }
}
