#!/bin/bash
# Production deployment and docker publish script
set -e

IMAGE_NAME=${1:-"seundeeun/virtual-email-server"}
TAG=${2:-"latest"}

echo "=== Publishing Virtual Email Server ==="
echo "Target Image: ${IMAGE_NAME}:${TAG}"

echo "1. Building production Docker image..."
docker build -f option2-raw-python/Dockerfile.prod -t "${IMAGE_NAME}:${TAG}" option2-raw-python/

echo "2. Pushing image to registry..."
docker push "${IMAGE_NAME}:${TAG}"

echo "=== Published successfully: ${IMAGE_NAME}:${TAG} ==="
