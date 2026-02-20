#!/bin/bash
# Entrypoint: OpenClaw arranca en su puerto default (18789, 127.0.0.1)
# El proxy Node.js escucha en 0.0.0.0:18800 y reenvía a 127.0.0.1:18789
# Docker mapea host:18789 -> container:18800

# Dejar que OpenClaw use su puerto default (ignora --host y --port)
openclaw gateway &
GATEWAY_PID=$!

# Esperar a que el gateway este listo
echo "[entrypoint] waiting for gateway..."
for i in $(seq 1 30); do
  if curl -s "http://127.0.0.1:18789/health" > /dev/null 2>&1; then
    echo "[entrypoint] gateway ready on 127.0.0.1:18789"
    break
  fi
  sleep 1
done

# Proxy: 0.0.0.0:18800 -> 127.0.0.1:18789
echo "[entrypoint] starting proxy 0.0.0.0:18800 -> 127.0.0.1:18789"
INTERNAL_PORT=18789 EXTERNAL_PORT=18800 node /usr/local/bin/proxy.openclaw.mjs &
PROXY_PID=$!

trap "kill $GATEWAY_PID $PROXY_PID 2>/dev/null" EXIT
wait $GATEWAY_PID
