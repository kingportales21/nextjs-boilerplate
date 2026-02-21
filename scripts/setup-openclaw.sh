#!/usr/bin/env bash
# ==================================================
# Script de instalacion de OpenClaw + Telegram Bot
# ==================================================
set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # Sin color

print_step() { echo -e "\n${BLUE}[PASO]${NC} $1"; }
print_ok()   { echo -e "${GREEN}[OK]${NC} $1"; }
print_warn() { echo -e "${YELLOW}[AVISO]${NC} $1"; }
print_err()  { echo -e "${RED}[ERROR]${NC} $1"; }

# --------------------------------------------------
# 1. Verificar Node.js >= 22
# --------------------------------------------------
print_step "Verificando version de Node.js..."
if ! command -v node &> /dev/null; then
    print_err "Node.js no esta instalado."
    echo "  Instala Node.js 22+ desde https://nodejs.org"
    exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 22 ]; then
    print_err "Se requiere Node.js >= 22 (tienes v$(node -v))"
    echo "  Actualiza Node.js desde https://nodejs.org"
    exit 1
fi
print_ok "Node.js v$(node -v) detectado"

# --------------------------------------------------
# 2. Instalar OpenClaw globalmente
# --------------------------------------------------
print_step "Instalando OpenClaw..."
if command -v openclaw &> /dev/null; then
    print_ok "OpenClaw ya esta instalado ($(openclaw --version 2>/dev/null || echo 'version desconocida'))"
    read -p "  Quieres actualizar a la ultima version? (s/n): " UPDATE
    if [[ "$UPDATE" =~ ^[sS]$ ]]; then
        npm install -g openclaw@latest
        print_ok "OpenClaw actualizado"
    fi
else
    npm install -g openclaw@latest
    print_ok "OpenClaw instalado correctamente"
fi

# --------------------------------------------------
# 3. Configurar el token del bot de Telegram
# --------------------------------------------------
print_step "Configurando bot de Telegram..."
echo ""
echo "  Para crear tu bot de Telegram:"
echo "  1. Abre Telegram y busca @BotFather"
echo "  2. Envia /newbot"
echo "  3. Sigue las instrucciones para crear el bot"
echo "  4. Copia el token que te proporcione"
echo ""

if [ -f .env.local ]; then
    EXISTING_TOKEN=$(grep -s "^TELEGRAM_BOT_TOKEN=" .env.local | cut -d= -f2- || true)
    if [ -n "$EXISTING_TOKEN" ] && [ "$EXISTING_TOKEN" != "tu_token_aqui" ]; then
        print_ok "Token de Telegram encontrado en .env.local"
        read -p "  Quieres cambiarlo? (s/n): " CHANGE_TOKEN
        if [[ ! "$CHANGE_TOKEN" =~ ^[sS]$ ]]; then
            TELEGRAM_TOKEN="$EXISTING_TOKEN"
        fi
    fi
fi

if [ -z "${TELEGRAM_TOKEN:-}" ]; then
    read -p "  Introduce tu token de bot de Telegram: " TELEGRAM_TOKEN
    if [ -z "$TELEGRAM_TOKEN" ]; then
        print_err "Token vacio. No se puede continuar sin un token."
        exit 1
    fi
fi

# --------------------------------------------------
# 4. Configurar la API key de Gemini
# --------------------------------------------------
print_step "Configurando API key de Google Gemini..."
echo ""
echo "  Para obtener tu API key de Gemini:"
echo "  1. Ve a https://aistudio.google.com/apikey"
echo "  2. Inicia sesion con tu cuenta de Google"
echo "  3. Haz clic en 'Create API Key' y copia la clave"
echo ""

GEMINI_KEY=""
if [ -f .env.local ]; then
    EXISTING_KEY=$(grep -s "^GEMINI_API_KEY=" .env.local | cut -d= -f2- || true)
    if [ -n "$EXISTING_KEY" ] && [ "$EXISTING_KEY" != "tu_api_key_aqui" ]; then
        print_ok "API key de Gemini encontrada en .env.local"
        read -p "  Quieres cambiarla? (s/n): " CHANGE_KEY
        if [[ ! "$CHANGE_KEY" =~ ^[sS]$ ]]; then
            GEMINI_KEY="$EXISTING_KEY"
        fi
    fi
fi

if [ -z "${GEMINI_KEY:-}" ]; then
    read -p "  Introduce tu API key de Gemini: " GEMINI_KEY
    if [ -z "$GEMINI_KEY" ]; then
        print_warn "Sin API key de Gemini. Podras configurarla mas tarde en .env.local"
    fi
fi

# --------------------------------------------------
# 5. Crear archivo .env.local
# --------------------------------------------------
print_step "Creando archivo .env.local..."
cat > .env.local << EOF
# OpenClaw + Telegram Bot - Configuracion
TELEGRAM_BOT_TOKEN=${TELEGRAM_TOKEN}
OPENCLAW_GATEWAY_PORT=18789
NEXT_PUBLIC_OPENCLAW_GATEWAY_URL=ws://127.0.0.1:18789
GEMINI_API_KEY=${GEMINI_KEY}
EOF
print_ok "Archivo .env.local creado"

# --------------------------------------------------
# 6. Copiar configuracion de OpenClaw
# --------------------------------------------------
print_step "Configurando OpenClaw..."
OPENCLAW_DIR="$HOME/.openclaw"
mkdir -p "$OPENCLAW_DIR"

# Generar config con el token real
cat > "$OPENCLAW_DIR/openclaw.json" << EOF
{
  "agent": {
    "model": "google/gemini-2.0-flash",
    "systemPrompt": "Eres un asistente personal conectado via Telegram. Responde de forma clara y concisa en el idioma del usuario."
  },
  "gateway": {
    "port": 18789,
    "bind": "loopback"
  },
  "channels": {
    "telegram": {
      "enabled": true,
      "botToken": "${TELEGRAM_TOKEN}",
      "dmPolicy": "pairing",
      "streaming": true,
      "reactionLevel": "minimal",
      "groups": {
        "*": {
          "requireMention": true
        }
      },
      "actions": {
        "sendMessage": true,
        "editMessage": true,
        "deleteMessage": false,
        "reactions": true,
        "sticker": false
      }
    }
  }
}
EOF
print_ok "Configuracion de OpenClaw creada en $OPENCLAW_DIR/openclaw.json"

# --------------------------------------------------
# 7. Instalar dependencias del proyecto Next.js
# --------------------------------------------------
print_step "Instalando dependencias del proyecto..."
npm install
print_ok "Dependencias instaladas"

# --------------------------------------------------
# 8. Resumen final
# --------------------------------------------------
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Instalacion completada!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "  Proximos pasos:"
echo ""
echo "  1. Inicia el gateway de OpenClaw:"
echo -e "     ${BLUE}openclaw gateway${NC}"
echo ""
echo "  2. En otra terminal, aprueba tu usuario de Telegram:"
echo -e "     ${BLUE}openclaw pairing list telegram${NC}"
echo -e "     ${BLUE}openclaw pairing approve telegram <CODIGO>${NC}"
echo ""
echo "  3. Inicia el dashboard Next.js:"
echo -e "     ${BLUE}npm run dev${NC}"
echo ""
echo "  4. Abre Telegram y envia un mensaje a tu bot"
echo ""
echo "  Para mas info: https://docs.openclaw.ai/channels/telegram"
echo ""
