#!/bin/bash
# Entrypoint: inicia OpenClaw en puerto interno + proxy Node.js en 0.0.0.0

INTERNAL_PORT=18790
EXTERNAL_PORT=18789

# Iniciar openclaw gateway en puerto interno
openclaw gateway --port $INTERNAL_PORT "$@" &
GATEWAY_PID=$!

# Esperar a que el gateway este listo
echo "[entrypoint] waiting for gateway on port $INTERNAL_PORT..."
for i in $(seq 1 30); do
  if curl -s "http://127.0.0.1:$INTERNAL_PORT/health" > /dev/null 2>&1; then
    echo "[entrypoint] gateway ready"
    break
  fi
  sleep 1
done

# Proxy HTTP+WebSocket: 0.0.0.0:18789 -> 127.0.0.1:18790
echo "[entrypoint] starting HTTP/WS proxy 0.0.0.0:$EXTERNAL_PORT -> 127.0.0.1:$INTERNAL_PORT"
INTERNAL_PORT=$INTERNAL_PORT EXTERNAL_PORT=$EXTERNAL_PORT node /usr/local/bin/proxy.openclaw.mjs &
PROXY_PID=$!

trap "kill $GATEWAY_PID $PROXY_PID 2>/dev/null" EXIT
wait $GATEWAY_PID
