#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# OpenClaw - Instalacion directa (sin Docker)
# Ejecutar desde terminal:
#   bash openclaw-setup.sh
# ============================================================

ENV_FILE=".env.openclaw"

echo "=== OpenClaw - Instalacion directa ==="
echo ""

# --- Verificar Node.js ---
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js no esta instalado."
    echo "Instala Node.js 18+ desde: https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "ERROR: Necesitas Node.js 18 o superior. Tienes: $(node -v)"
    exit 1
fi
echo "[OK] Node.js $(node -v) detectado."

# --- Verificar npm ---
if ! command -v npm &> /dev/null; then
    echo "ERROR: npm no esta instalado."
    exit 1
fi
echo "[OK] npm $(npm -v) detectado."
echo ""

# --- Instalar OpenClaw globalmente ---
echo "[1/4] Instalando OpenClaw..."
if command -v openclaw &> /dev/null; then
    echo "  OpenClaw ya esta instalado. Actualizando..."
fi
npm install -g openclaw@latest
echo "[OK] OpenClaw instalado: $(openclaw --version 2>/dev/null || echo 'OK')"
echo ""

# --- Configurar .env ---
if [ ! -f "$ENV_FILE" ]; then
    echo "No se encontro $ENV_FILE. Creando desde ejemplo..."
    cat > "$ENV_FILE" << 'ENVEOF'
# ============================================================
# OpenClaw - Configuracion
# ============================================================

# ----------------------------------------------------------
# 1. MODELO DE IA (Gemini)
# ----------------------------------------------------------
# API key de Google AI Studio (https://aistudio.google.com/apikey)
GEMINI_API_KEY=tu-api-key-de-gemini-aqui

# Modelo principal
OPENCLAW_PRIMARY_MODEL=google/gemini-3.1-pro

# ----------------------------------------------------------
# 2. TELEGRAM (opcional)
# ----------------------------------------------------------
# Token del bot (obtenido de @BotFather en Telegram)
TELEGRAM_BOT_TOKEN=tu-token-de-botfather-aqui

# Politica de mensajes directos: pairing | allowlist | open | disabled
TELEGRAM_DM_POLICY=allowlist

# Tu user ID de Telegram (puedes obtenerlo con @userinfobot)
TELEGRAM_ALLOW_FROM=tu-user-id-aqui

# ----------------------------------------------------------
# 3. GATEWAY
# ----------------------------------------------------------
# Token de acceso al panel web (inventa uno seguro o dejalo vacio)
OPENCLAW_GATEWAY_TOKEN=

# Puerto del dashboard (default: 18789)
OPENCLAW_PORT=18789
ENVEOF
    echo ""
    echo "IMPORTANTE: Edita el archivo $ENV_FILE con tus datos:"
    echo "  - GEMINI_API_KEY    (de https://aistudio.google.com/apikey)"
    echo "  - TELEGRAM_BOT_TOKEN (de @BotFather, opcional)"
    echo "  - TELEGRAM_ALLOW_FROM (tu user ID de Telegram, opcional)"
    echo ""
    echo "Despues vuelve a ejecutar este script."
    exit 0
fi

# --- Cargar configuracion ---
set -a
source "$ENV_FILE" 2>/dev/null || true
set +a

if [ -z "${GEMINI_API_KEY:-}" ] || [ "$GEMINI_API_KEY" = "tu-api-key-de-gemini-aqui" ]; then
    echo "ERROR: GEMINI_API_KEY no esta configurada en $ENV_FILE"
    echo "Editalo y vuelve a ejecutar el script."
    exit 1
fi

echo "[OK] Configuracion cargada."
echo ""

# --- Onboarding ---
echo "[2/4] Ejecutando onboarding..."
echo "Si te pide elegir provider, selecciona Google/Gemini."
echo ""
openclaw onboard || true
echo ""

# --- Iniciar gateway ---
echo "[3/4] Iniciando OpenClaw gateway..."
export OPENCLAW_PORT="${OPENCLAW_PORT:-18789}"

# Matar instancia anterior si existe
if command -v pkill &> /dev/null; then
    pkill -f "openclaw gateway" 2>/dev/null || true
    sleep 1
fi

openclaw gateway &
GATEWAY_PID=$!
echo "  PID del gateway: $GATEWAY_PID"

# Esperar a que arranque
echo "  Esperando a que el gateway este listo..."
for i in $(seq 1 30); do
    if curl -s "http://127.0.0.1:${OPENCLAW_PORT}/health" > /dev/null 2>&1; then
        echo "  [OK] Gateway listo."
        break
    fi
    if [ $i -eq 30 ]; then
        echo "  AVISO: El gateway tarda en arrancar. Revisa si hay errores arriba."
    fi
    sleep 1
done
echo ""

# --- Telegram (opcional) ---
if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ "$TELEGRAM_BOT_TOKEN" != "tu-token-de-botfather-aqui" ]; then
    echo "[4/4] Configurando canal de Telegram..."
    sleep 3
    openclaw channels add --channel telegram --token "$TELEGRAM_BOT_TOKEN" || true
    echo ""
    echo "TELEGRAM: Envia un mensaje a tu bot en Telegram."
    echo "          El bot te dara un codigo de emparejamiento."
    echo "          Luego ejecuta:"
    echo ""
    echo "  openclaw pairing approve telegram <CODIGO>"
    echo ""
else
    echo "[4/4] Telegram no configurado. Saltando..."
    echo ""
fi

# --- Resumen ---
echo "==========================================="
echo "  OpenClaw esta corriendo!"
echo "==========================================="
echo ""
echo "  Dashboard: http://127.0.0.1:${OPENCLAW_PORT}/"
echo "  Modelo:    Gemini Pro 3.1"
echo "  PID:       $GATEWAY_PID"
echo ""
echo "  Comandos utiles:"
echo "    openclaw gateway           # Iniciar gateway"
echo "    openclaw --help            # Ver ayuda"
echo "    kill $GATEWAY_PID          # Detener gateway"
echo ""
echo "  Para que el gateway siga corriendo,"
echo "  NO cierres esta terminal."
echo ""

# Mantener el script abierto mientras el gateway corra
wait $GATEWAY_PID 2>/dev/null || true
