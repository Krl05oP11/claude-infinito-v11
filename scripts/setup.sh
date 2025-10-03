#!/bin/bash
set -e

echo "🚀 Setting up Claude Infinito v1.1..."
echo "   Vector DB: pgvector in PostgreSQL"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }
print_status() { echo -e "${BLUE}[INFO]${NC} $1"; }

# Check prerequisites
print_status "Checking prerequisites..."
command -v docker >/dev/null 2>&1 || { print_error "Docker required"; exit 1; }
command -v node >/dev/null 2>&1 || { print_error "Node.js required"; exit 1; }

# Install dependencies
print_status "Installing dependencies..."
npm install
cd backend && npm install
cd ..
print_success "Dependencies installed"

# Create .env if not exists
if [ ! -f .env ]; then
    cp .env.example .env
    print_status "Created .env file - Please add your Claude API key"
fi

# Create directories (no chromadb directory needed)
mkdir -p data/{postgres,conversations,backups} logs
print_success "Data directories created"

# Check Ollama
print_status "Checking Ollama service..."
if curl -s http://localhost:11434/api/tags >/dev/null; then
    print_success "Ollama is running"
else
    print_error "Ollama not running - Please start Ollama first"
    exit 1
fi

# Check Docker
print_status "Checking Docker..."
if docker info >/dev/null 2>&1; then
    print_success "Docker is running"
else
    print_error "Docker not running - Please start Docker first"
    exit 1
fi

print_success "Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Edit .env and add your CLAUDE_API_KEY"
echo "  2. Run: npm run dev"
echo ""
echo "Architecture:"
echo "  • PostgreSQL 15 with pgvector extension"
echo "  • Ollama for embeddings (bge-large-en-v1.5)"  
echo "  • Redis for caching"
echo "  • Claude Sonnet 4 for LLM"
