#!/bin/bash
# Created By Shreyansh

set -e  # Exit immediately if any command fails

echo "Starting deployment..."

echo "Pulling latest code from branch: docker"
git pull origin docker

echo "Stopping existing containers..."
docker compose down

echo "Building containers (no cache)..."
docker compose build --no-cache

echo "Starting containers in detached mode..."
docker compose up -d

echo "Deployment completed successfully."

