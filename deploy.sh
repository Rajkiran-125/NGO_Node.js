#!/bin/bash
# Created By Shreyansh

set -e  # Exit immediately if any command fails

echo "-------------------------------------------------------------"
echo "Starting deployment..."

echo "-------------------------------------------------------------"
echo "Pulling latest code from branch: docker"
echo "-------------------------------------------------------------"
git pull origin docker

echo "-------------------------------------------------------------"
echo "Stopping existing containers..."
echo "-------------------------------------------------------------"
docker compose down

echo "-------------------------------------------------------------"
echo "Building containers (no cache)..."
echo "-------------------------------------------------------------"
docker compose build --no-cache

echo "-------------------------------------------------------------"
echo "Starting containers in detached mode..."
echo "-------------------------------------------------------------"
docker compose up -d

echo "-------------------------------------------------------------"
echo "Deployment completed successfully."
echo "-------------------------------------------------------------"

