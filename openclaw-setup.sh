#!/usr/bin/env bash
set -euo pipefail

# OpenClaw Docker Setup Script
# This script builds and starts OpenClaw in Docker Desktop.

COMPOSE_FILE="docker-compose.yml"
ENV_FILE=".env.openclaw"

echo "=== OpenClaw Docker Setup ==="
echo ""

# Check Docker is available
if ! command -v docker &> /dev/null; then
    echo "Error: Docker is not installed or not in PATH."
    echo "Install Docker Desktop from https://www.docker.com/products/docker-desktop/"
    exit 1
fi

if ! docker info &> /dev/null 2>&1; then
    echo "Error: Docker daemon is not running. Start Docker Desktop first."
    exit 1
fi

echo "[1/4] Building OpenClaw Docker image..."
docker compose -f "$COMPOSE_FILE" build openclaw-gateway

echo ""
echo "[2/4] Running onboarding wizard..."
echo "Follow the prompts to configure your AI providers and generate a gateway token."
echo ""
docker compose -f "$COMPOSE_FILE" --profile cli run --rm openclaw-cli onboard

echo ""
echo "[3/4] Starting OpenClaw gateway..."
docker compose -f "$COMPOSE_FILE" up -d openclaw-gateway

echo ""
echo "[4/4] Verifying setup..."
sleep 3

if docker compose -f "$COMPOSE_FILE" ps --format json | grep -q "running"; then
    echo ""
    echo "=== OpenClaw is running! ==="
    echo ""
    echo "  Dashboard:  http://127.0.0.1:${OPENCLAW_PORT:-18789}/"
    echo ""
    echo "  Paste your gateway token in Settings to authenticate."
    echo ""
    echo "Useful commands:"
    echo "  docker compose up -d openclaw-gateway    # Start"
    echo "  docker compose down                      # Stop"
    echo "  docker compose logs -f openclaw-gateway   # View logs"
    echo ""
else
    echo "Warning: Gateway container may not have started correctly."
    echo "Check logs with: docker compose logs openclaw-gateway"
    exit 1
fi
