#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# OpenClaw Docker Setup - Script de instalacion
# Ejecutar desde CMD/PowerShell/Terminal:
#   bash openclaw-setup.sh
# En Windows sin bash:
#   Seguir los pasos manuales del README
# ============================================================

COMPOSE_FILE="docker-compose.yml"
ENV_FILE=".env.openclaw"

echo "=== OpenClaw Docker Setup ==="
echo ""

# --- Verificar Docker ---
if ! command -v docker &> /dev/null; then
    echo "ERROR: Docker no esta instalado o no esta en el PATH."
    echo "Instala Docker Desktop: https://www.docker.com/products/docker-desktop/"
    exit 1
fi

if ! docker info &> /dev/null 2>&1; then
    echo "ERROR: Docker no esta corriendo. Abre Docker Desktop primero."
    exit 1
fi

echo "[OK] Docker esta corriendo."
echo ""

# --- Verificar .env ---
if [ ! -f "$ENV_FILE" ]; then
    echo "No se encontro $ENV_FILE"
    echo "Creando desde el ejemplo..."
    cp .env.openclaw.example "$ENV_FILE"
    echo ""
    echo "IMPORTANTE: Edita el archivo $ENV_FILE con tus datos reales:"
    echo "  - GEMINI_API_KEY    (de https://aistudio.google.com/apikey)"
    echo "  - TELEGRAM_BOT_TOKEN (de @BotFather)"
    echo "  - TELEGRAM_ALLOW_FROM (tu user ID de Telegram)"
    echo ""
    echo "Despues vuelve a ejecutar este script."
    exit 0
fi

# --- Verificar que las keys no estan vacias ---
source "$ENV_FILE" 2>/dev/null || true

if [ -z "${GEMINI_API_KEY:-}" ] || [ "$GEMINI_API_KEY" = "tu-api-key-de-gemini-aqui" ]; then
    echo "ERROR: GEMINI_API_KEY no esta configurada en $ENV_FILE"
    exit 1
fi

echo "[OK] Configuracion encontrada."
echo ""

# --- Paso 1: Build ---
echo "[1/4] Construyendo imagen Docker de OpenClaw..."
docker compose -f "$COMPOSE_FILE" build openclaw-gateway
echo "[OK] Imagen construida."
echo ""

# --- Paso 2: Onboarding ---
echo "[2/4] Ejecutando onboarding..."
echo "Si te pide elegir provider, selecciona Google/Gemini."
echo ""
docker compose -f "$COMPOSE_FILE" --profile cli run --rm openclaw-cli onboard
echo ""

# --- Paso 3: Start ---
echo "[3/4] Iniciando OpenClaw gateway..."
docker compose -f "$COMPOSE_FILE" up -d openclaw-gateway
echo ""

# --- Paso 4: Telegram ---
if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ "$TELEGRAM_BOT_TOKEN" != "tu-token-de-botfather-aqui" ]; then
    echo "[4/4] Configurando canal de Telegram..."
    sleep 5
    docker compose -f "$COMPOSE_FILE" --profile cli run --rm openclaw-cli channels add --channel telegram --token "$TELEGRAM_BOT_TOKEN" || true
    echo ""
    echo "TELEGRAM: Envia un mensaje a tu bot en Telegram."
    echo "          El bot te dara un codigo de emparejamiento."
    echo "          Luego ejecuta:"
    echo ""
    echo "  docker compose --profile cli run --rm openclaw-cli pairing approve telegram <CODIGO>"
    echo ""
else
    echo "[4/4] Telegram no configurado (TELEGRAM_BOT_TOKEN vacio). Saltando..."
    echo ""
fi

# --- Verificar ---
sleep 3
if docker compose -f "$COMPOSE_FILE" ps --format json 2>/dev/null | grep -q "running"; then
    GATEWAY_TOKEN=$(grep OPENCLAW_GATEWAY_TOKEN "$ENV_FILE" | cut -d= -f2)
    echo "==========================================="
    echo "  OpenClaw esta corriendo!"
    echo "==========================================="
    echo ""
    echo "  Dashboard: http://127.0.0.1:${OPENCLAW_PORT:-18789}/"
    echo "  Modelo:    Gemini Pro 3.1"
    echo ""
    echo "  Comandos utiles:"
    echo "    docker compose up -d        # Iniciar"
    echo "    docker compose down          # Detener"
    echo "    docker compose logs -f       # Ver logs"
    echo "    docker compose restart       # Reiniciar"
    echo ""
else
    echo "AVISO: El contenedor puede no haber arrancado correctamente."
    echo "Revisa los logs: docker compose logs openclaw-gateway"
    exit 1
fi
