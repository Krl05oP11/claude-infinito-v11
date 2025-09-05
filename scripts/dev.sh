#!/bin/bash
set -e

echo "🔥 Starting Claude Infinito v1.1 development..."

# Start Docker services
echo "📦 Starting Docker services..."
docker compose up -d postgres chromadb redis

echo "⏳ Waiting for services..."
sleep 5

# Start backend
echo "🚀 Starting backend server..."
cd backend && npm run dev
