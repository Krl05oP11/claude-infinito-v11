#!/bin/bash
set -e

echo "🔥 Starting Claude Infinito v1.1 development..."
echo "   Using pgvector in PostgreSQL for vector storage"

# Start Docker services (PostgreSQL + Redis, no ChromaDB)
echo "📦 Starting Docker services..."
docker compose up -d postgres redis

echo "⏳ Waiting for services..."
sleep 5

# Start backend
echo "🚀 Starting backend server..."
cd backend && npm run dev
