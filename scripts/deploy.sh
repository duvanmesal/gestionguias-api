#!/bin/bash

# Deployment script for GestionGuias API
# Usage: ./scripts/deploy.sh [environment]

set -euo pipefail

ENVIRONMENT=${1:-production}
IMAGE_TAG=${2:-latest}
CONTAINER_NAME="gestionguias-api"
IMAGE_NAME="ghcr.io/your-org/gestionguias-api:${IMAGE_TAG}"

echo "🚀 Deploying GestionGuias API to ${ENVIRONMENT}"
echo "📦 Using image: ${IMAGE_NAME}"

# Pull latest image
echo "📥 Pulling latest image..."
docker pull "${IMAGE_NAME}"

# Run database migrations
echo "🗄️  Running database migrations..."
docker run --rm \
  --network host \
  --env-file ".env.${ENVIRONMENT}" \
  "${IMAGE_NAME}" \
  npx prisma migrate deploy

# Stop existing container
echo "🛑 Stopping existing container..."
docker stop "${CONTAINER_NAME}" || true
docker rm "${CONTAINER_NAME}" || true

# Start new container
echo "▶️  Starting new container..."
docker run -d \
  --name "${CONTAINER_NAME}" \
  --env-file ".env.${ENVIRONMENT}" \
  --restart unless-stopped \
  -p 3000:3000 \
  "${IMAGE_NAME}"

# Wait for health check
echo "🏥 Waiting for health check..."
sleep 10

# Verify deployment
if curl -f http://localhost:3000/health > /dev/null 2>&1; then
  echo "✅ Deployment successful!"
else
  echo "❌ Deployment failed - health check failed"
  exit 1
fi

echo "🎉 GestionGuias API deployed successfully!"
