#!/bin/bash
# Entrypoint: inicia OpenClaw en puerto interno y usa socat
# para exponer en 0.0.0.0 (accesible desde fuera del contenedor)

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

# Proxy: 0.0.0.0:18789 -> 127.0.0.1:18790
echo "[entrypoint] starting proxy 0.0.0.0:$EXTERNAL_PORT -> 127.0.0.1:$INTERNAL_PORT"
socat TCP-LISTEN:$EXTERNAL_PORT,fork,reuseaddr,bind=0.0.0.0 TCP:127.0.0.1:$INTERNAL_PORT &
SOCAT_PID=$!

# Si alguno muere, matar el otro
trap "kill $GATEWAY_PID $SOCAT_PID 2>/dev/null" EXIT

wait $GATEWAY_PID
