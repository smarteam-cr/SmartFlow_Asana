#!/bin/bash
# ============================================
# deploy.sh — Script de deploy para servidor
# ============================================
# Ejecutar después de cada git push:
#   ssh user@servidor
#   cd /opt/tu-app && ./deploy.sh
#
# Requisitos: docker, docker compose, git

set -euo pipefail

APP_DIR="/opt/tu-app"
COMPOSE_FILE="docker-compose.prod.yml"

echo "📥 Pullando último código..."
cd "$APP_DIR"
git pull

echo "🔨 Construyendo imágenes Docker..."
docker compose -f "$COMPOSE_FILE" build

echo "🚀 Levantando servicios..."
docker compose -f "$COMPOSE_FILE" up -d

echo "🧹 Limpiando imágenes viejas..."
docker system prune -f

echo "✅ Deploy completado"
echo "📋 Logs: docker compose -f $COMPOSE_FILE logs -f"
