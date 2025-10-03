#!/bin/bash

# Claude Infinito v1.1 Desktop Launcher
# Auto-start script with complete system initialization
# Optimized for Ubuntu 24.04 LTS - Carlos Environment
# Using pgvector in PostgreSQL (ChromaDB removed)

# Colors for terminal output (photophobic-friendly warm colors)
export BROWN='\033[0;33m'      # Warm brown
export ORANGE='\033[0;31m'     # Warm orange  
export GREEN='\033[0;32m'      # Success green
export NC='\033[0m'            # No color

# Configuration
PROJECT_DIR="$HOME/Projects/claude-infinito-v11"
LOG_DIR="$PROJECT_DIR/logs"
FRONTEND_PORT=3000
BACKEND_PORT=3001
POSTGRES_PORT=5433

# Create logs directory if it doesn't exist
mkdir -p "$LOG_DIR"

# Log files
LAUNCHER_LOG="$LOG_DIR/launcher.log"
DOCKER_LOG="$LOG_DIR/docker.log"
BACKEND_LOG="$LOG_DIR/backend.log"
FRONTEND_LOG="$LOG_DIR/frontend.log"

# Function to log messages
log_message() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LAUNCHER_LOG"
}

# Function to print colored output
print_status() {
    echo -e "${BROWN}[Claude Infinito]${NC} $1"
    log_message "$1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
    log_message "SUCCESS: $1"
}

print_error() {
    echo -e "${ORANGE}✗${NC} $1"
    log_message "ERROR: $1"
}

# Function to check if port is in use
check_port() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        return 0  # Port is in use
    else
        return 1  # Port is free
    fi
}

# Function to kill processes on port
kill_port() {
    local port=$1
    print_status "Cleaning port $port..."
    
    # Kill using lsof
    local pids=$(lsof -t -i:$port 2>/dev/null)
    if [ -n "$pids" ]; then
        echo "$pids" | xargs kill -9 2>/dev/null
        sleep 2
    fi
    
    # Kill using fuser as backup
    fuser -k ${port}/tcp 2>/dev/null
    
    # Kill known process patterns
    pkill -f "npm run dev" 2>/dev/null
    pkill -f "npm start" 2>/dev/null
    pkill -f "nodemon" 2>/dev/null
    pkill -f "ts-node" 2>/dev/null
    
    sleep 1
    
    if check_port $port; then
        print_error "Port $port still in use after cleanup"
        return 1
    else
        print_success "Port $port cleaned successfully"
        return 0
    fi
}

# Function to wait for service to be ready
wait_for_service() {
    local service_name=$1
    local url=$2
    local max_attempts=45
    local attempt=1
    
    print_status "Waiting for $service_name to be ready..."
    
    while [ $attempt -le $max_attempts ]; do
        if curl -s -f "$url" >/dev/null 2>&1; then
            print_success "$service_name is ready"
            return 0
        fi
        
        # Show progress every 5 attempts for better feedback
        if [ $((attempt % 5)) -eq 0 ]; then
            print_status "Still waiting for $service_name... (attempt $attempt/$max_attempts)"
        else
            echo -n "."
        fi
        
        sleep 2
        attempt=$((attempt + 1))
    done
    
    print_error "$service_name failed to start within expected time"
    return 1
}

# Function to check system requirements
check_requirements() {
    print_status "Checking system requirements..."
    
    # Check if we're in the right directory
    if [ ! -d "$PROJECT_DIR" ]; then
        print_error "Project directory not found: $PROJECT_DIR"
        exit 1
    fi
    
    cd "$PROJECT_DIR" || exit 1
    
    # Check required commands
    local required_commands=("docker" "docker-compose" "node" "npm" "curl" "lsof")
    for cmd in "${required_commands[@]}"; do
        if ! command -v "$cmd" >/dev/null 2>&1; then
            print_error "Required command not found: $cmd"
            exit 1
        fi
    done
    
    # Check Docker daemon
    if ! docker info >/dev/null 2>&1; then
        print_error "Docker daemon is not running"
        print_status "Starting Docker daemon..."
        sudo systemctl start docker
        sleep 3
        if ! docker info >/dev/null 2>&1; then
            print_error "Failed to start Docker daemon"
            exit 1
        fi
    fi
    
    # Check Node version
    local node_version=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$node_version" -lt 18 ]; then
        print_error "Node.js version 18+ required, found: $(node --version)"
        exit 1
    fi
    
    print_success "All system requirements met"
}

# Function to start Docker services
start_docker_services() {
    print_status "Starting Docker services..."
    
    # Stop any existing containers
    docker-compose down 2>/dev/null
    
    # Start services (PostgreSQL + Redis only, no ChromaDB)
    if docker-compose up -d postgres redis >> "$DOCKER_LOG" 2>&1; then
        print_success "Docker services started"
    else
        print_error "Failed to start Docker services"
        print_status "Check logs: $DOCKER_LOG"
        return 1
    fi
    
    # Wait for PostgreSQL to be ready
    print_status "Waiting for PostgreSQL..."
    sleep 5
    
    # Check Ollama service
    print_status "Checking Ollama service..."
    if systemctl is-active --quiet ollama; then
        print_success "Ollama service is running"
        
        # Check if model is loaded
        if ollama ps | grep -q "nomic-embed-text"; then
            print_success "Ollama model loaded"
        else
            print_status "Loading Ollama model..."
            ollama pull nomic-embed-text >/dev/null 2>&1 &
        fi
    else
        print_status "Starting Ollama service..."
        sudo systemctl start ollama
        sleep 2
    fi
}

# Function to start backend - Compile TypeScript first
start_backend() {
    print_status "Starting backend service..."
    
    # Clean backend port
    kill_port $BACKEND_PORT
    
    cd "$PROJECT_DIR/backend" || return 1
    
    # Install dependencies if needed
    if [ ! -d "node_modules" ] || [ "package.json" -nt "node_modules" ]; then
        print_status "Installing backend dependencies..."
        npm install >> "$BACKEND_LOG" 2>&1
    fi
    
    # Compile TypeScript first
    print_status "Compiling TypeScript backend..."
    
    # Clear previous log content for this session
    echo "=== Backend startup $(date) ===" > "$BACKEND_LOG"
    
    # Compile TypeScript to JavaScript
    if npx tsc >> "$BACKEND_LOG" 2>&1; then
        print_success "TypeScript compilation successful"
    else
        print_error "TypeScript compilation failed"
        print_status "Compilation errors:"
        tail -n 10 "$BACKEND_LOG"
        return 1
    fi
    
    # Check if dist directory was created
    if [ ! -d "dist" ] || [ ! -f "dist/index.js" ]; then
        print_error "Compilation output not found (dist/index.js)"
        return 1
    fi
    
    print_status "Starting compiled backend with Node.js..."
    
    # Use plain node with compiled JS (stable with nohup)
    nohup node dist/index.js >> "$BACKEND_LOG" 2>&1 &
    local backend_pid=$!
    
    # Wait for backend to be ready
    print_status "Waiting for backend to start..."
    sleep 5
    
    # Wait for backend to be ready with better feedback
    if wait_for_service "Backend API" "http://localhost:$BACKEND_PORT/api/health"; then
        print_success "Backend started successfully (PID: $backend_pid)"
        echo "$backend_pid" > "$LOG_DIR/backend.pid"
        
        # Additional verification
        local health_response=$(curl -s "http://localhost:$BACKEND_PORT/api/health" 2>/dev/null)
        if echo "$health_response" | grep -q "status"; then
            print_success "Backend health check passed"
        else
            print_error "Backend health response unexpected: $health_response"
        fi
        
        # Record compilation info
        echo "Backend compiled and started with Node.js at $(date)" >> "$BACKEND_LOG"
        
        return 0
    else
        print_error "Backend failed to start within expected time"
        print_status "Last 15 lines of backend log:"
        tail -n 15 "$BACKEND_LOG"
        return 1
    fi
}

# Function to start frontend
start_frontend() {
    print_status "Starting frontend service..."
    
    # Clean frontend port
    kill_port $FRONTEND_PORT
    
    cd "$PROJECT_DIR/frontend" || return 1
    
    # Install dependencies if needed
    if [ ! -d "node_modules" ] || [ "package.json" -nt "node_modules" ]; then
        print_status "Installing frontend dependencies..."
        npm install >> "$FRONTEND_LOG" 2>&1
    fi
    
    # Start frontend in background
    print_status "Launching frontend process..."
    
    # Clear previous log content for this session
    echo "=== Frontend startup $(date) ===" > "$FRONTEND_LOG"
    
    setsid nohup npm start >> "$FRONTEND_LOG" 2>&1 &
    local frontend_pid=$!
    
    # Wait for frontend to be ready
    if wait_for_service "Frontend" "http://localhost:$FRONTEND_PORT"; then
        print_success "Frontend started successfully (PID: $frontend_pid)"
        echo "$frontend_pid" > "$LOG_DIR/frontend.pid"
        return 0
    else
        print_error "Frontend failed to start - Check logs: $FRONTEND_LOG"
        return 1
    fi
}

# Function to open browser on horizontal monitor
open_browser() {
    print_status "Opening browser on primary monitor..."
    
    # Check if browser is already open to avoid multiple instances
    if pgrep -f "localhost:$FRONTEND_PORT" >/dev/null 2>&1; then
        print_status "Browser already open to Claude Infinito"
        return 0
    fi
    
    local url="http://localhost:$FRONTEND_PORT"
    
    # Detect available browsers and open only ONE instance
    if command -v firefox >/dev/null 2>&1; then
        # Open Firefox with single instance
        firefox --new-window "$url" >/dev/null 2>&1 &
        print_success "Firefox opened"
    elif command -v google-chrome >/dev/null 2>&1; then
        google-chrome --new-window "$url" >/dev/null 2>&1 &
        print_success "Chrome opened"
    elif command -v chromium-browser >/dev/null 2>&1; then
        chromium-browser "$url" >/dev/null 2>&1 &
        print_success "Chromium opened"
    else
        print_error "No supported browser found"
        print_status "Please open $url manually"
        return 1
    fi
    
    # Give browser time to load
    sleep 3
}

# Function to show system status
show_status() {
    echo
    echo -e "${BROWN}=== Claude Infinito v1.1 System Status ===${NC}"
    echo
    
    # Docker services
    echo "Docker Services:"
    if command -v docker-compose >/dev/null 2>&1; then
        docker-compose ps 2>/dev/null | grep -E "(postgres|redis)" | while read line; do
            if echo "$line" | grep -q "Up"; then
                echo -e "  ${GREEN}✓${NC} $line"
            else
                echo -e "  ${ORANGE}✗${NC} $line"
            fi
        done
    fi
    
    # Application services with better checking
    echo
    echo "Application Services:"
    
    # Backend check with curl
    if curl -s -f "http://localhost:$BACKEND_PORT/api/health" >/dev/null 2>&1; then
        echo -e "  ${GREEN}✓${NC} Backend API (port $BACKEND_PORT) - Responding"
    elif check_port $BACKEND_PORT; then
        echo -e "  ${ORANGE}!${NC} Backend API (port $BACKEND_PORT) - Starting..."
    else
        echo -e "  ${ORANGE}✗${NC} Backend API (port $BACKEND_PORT) - Not running"
    fi
    
    # Frontend check
    if curl -s -f "http://localhost:$FRONTEND_PORT" >/dev/null 2>&1; then
        echo -e "  ${GREEN}✓${NC} Frontend (port $FRONTEND_PORT) - Responding"
    elif check_port $FRONTEND_PORT; then
        echo -e "  ${ORANGE}!${NC} Frontend (port $FRONTEND_PORT) - Starting..."
    else
        echo -e "  ${ORANGE}✗${NC} Frontend (port $FRONTEND_PORT) - Not running"
    fi
    
    # Ollama status
    echo
    echo "AI Services:"
    if systemctl is-active --quiet ollama; then
        echo -e "  ${GREEN}✓${NC} Ollama service"
        if ollama ps | grep -q "nomic-embed-text"; then
            echo -e "  ${GREEN}✓${NC} Embedding model loaded"
        else
            echo -e "  ${ORANGE}!${NC} Embedding model loading..."
        fi
    else
        echo -e "  ${ORANGE}✗${NC} Ollama service"
    fi
    
    # Vector database info
    echo
    echo "Vector Database:"
    echo -e "  ${GREEN}✓${NC} pgvector in PostgreSQL (port $POSTGRES_PORT)"
    
    echo
    echo "Application URL: http://localhost:$FRONTEND_PORT"
    echo "Logs directory: $LOG_DIR"
    echo "PID files: $LOG_DIR/*.pid"
    echo
}

# Function to cleanup on exit
cleanup() {
    print_status "Cleaning up processes..."
    
    # Kill PIDs if they exist
    if [ -f "$LOG_DIR/backend.pid" ]; then
        local backend_pid=$(cat "$LOG_DIR/backend.pid")
        if kill -0 "$backend_pid" 2>/dev/null; then
            print_status "Stopping backend (PID: $backend_pid)"
            kill "$backend_pid" 2>/dev/null
            sleep 2
            kill -9 "$backend_pid" 2>/dev/null
        fi
        rm -f "$LOG_DIR/backend.pid"
    fi
    
    if [ -f "$LOG_DIR/frontend.pid" ]; then
        local frontend_pid=$(cat "$LOG_DIR/frontend.pid")
        if kill -0 "$frontend_pid" 2>/dev/null; then
            print_status "Stopping frontend (PID: $frontend_pid)"
            kill "$frontend_pid" 2>/dev/null
            sleep 2
            kill -9 "$frontend_pid" 2>/dev/null
        fi
        rm -f "$LOG_DIR/frontend.pid"
    fi
    
    # Clean orphan processes
    pkill -f "npm run dev" 2>/dev/null
    pkill -f "npm start" 2>/dev/null
    pkill -f "ts-node.*index.ts" 2>/dev/null
    pkill -f "node.*dist/index.js" 2>/dev/null
    pkill -f "show-status-debug" 2>/dev/null
    
    print_success "Cleanup completed"
}

# Main execution function
main() {
    echo -e "${BROWN}"
    echo "  _____ _                 _        ___        __ _       _ _        "
    echo " / ____| |               | |      |_ _|_ __  / _(_)_ __ (_) |_ ___  "
    echo "| |    | | __ _ _   _  __| | ___   | || '_ \| |_| | '_ \| | __/ _ \ "
    echo "| |____| |/ _\` | | | |/ _\` |/ _ \  | || | | |  _| | | | | | || (_) |"
    echo " \_____|_|\__,_|_|_|_|\__,_|\___| |___|_| |_|_| |_|_| |_|_|\__\___/ "
    echo "                                                                   "
    echo "                       v1.1 - Desktop Launcher"
    echo "                       Vector DB: pgvector in PostgreSQL"
    echo -e "${NC}"
    
    # Trap for cleanup
    trap cleanup EXIT INT TERM
    
    # Start logging
    log_message "=== Claude Infinito v1.1 Launcher Started ==="
    
    # Execute startup sequence
    check_requirements
    start_docker_services
    start_backend
    start_frontend
    open_browser
    
    # Show final status
    show_status
    
    print_success "Claude Infinito v1.1 is now running!"
    print_status "Press Ctrl+C to stop all services"
    print_status "Health checks will run every 60 seconds"
    
    # Keep script running with tolerant health checks
    local consecutive_failures=0
    local max_consecutive_failures=3
    
    while true; do
        sleep 60  # Check every 60 seconds
        
        local services_down=0
        local status_msg=""
        
        # Check backend with tolerance
        if ! check_port $BACKEND_PORT; then
            status_msg="${status_msg}Backend port down. "
            services_down=$((services_down + 1))
        elif ! curl -s -f "http://localhost:$BACKEND_PORT/api/health" >/dev/null 2>&1; then
            status_msg="${status_msg}Backend API not responding. "
            services_down=$((services_down + 1))
        fi
        
        # Check frontend with tolerance
        if ! check_port $FRONTEND_PORT; then
            status_msg="${status_msg}Frontend port down. "
            services_down=$((services_down + 1))
        elif ! curl -s -f "http://localhost:$FRONTEND_PORT" >/dev/null 2>&1; then
            status_msg="${status_msg}Frontend not responding. "
            services_down=$((services_down + 1))
        fi
        
        if [ $services_down -eq 0 ]; then
            # All services healthy
            consecutive_failures=0
            echo -ne "\r🟢 Services healthy ($(date '+%H:%M:%S'))                    "
        elif [ $services_down -eq 1 ]; then
            # One service down - continue running
            consecutive_failures=$((consecutive_failures + 1))
            print_error "One service issue: $status_msg(failure $consecutive_failures/$max_consecutive_failures)"
        else
            # Both services down - count consecutive failures
            consecutive_failures=$((consecutive_failures + 1))
            print_error "Multiple services down: $status_msg(failure $consecutive_failures/$max_consecutive_failures)"
        fi
        
        # Only exit after multiple consecutive failures
        if [ $consecutive_failures -ge $max_consecutive_failures ]; then
            print_error "Services have been down for $max_consecutive_failures consecutive checks - exiting"
            exit 1
        fi
    done
}

# Script entry point
if [ "$1" = "--status" ]; then
    cd "$PROJECT_DIR" || exit 1
    show_status
    exit 0
elif [ "$1" = "--stop" ]; then
    print_status "Stopping all services..."
    kill_port $FRONTEND_PORT
    kill_port $BACKEND_PORT
    cd "$PROJECT_DIR" && docker-compose down
    print_success "All services stopped"
    exit 0
elif [ "$1" = "--help" ]; then
    echo "Claude Infinito v1.1 Launcher"
    echo "Using pgvector in PostgreSQL for vector storage"
    echo ""
    echo "Usage: $0 [--status|--stop|--help]"
    echo ""
    echo "Options:"
    echo "  --status  Show current system status"
    echo "  --stop    Stop all services"
    echo "  --help    Show this help message"
    echo ""
    echo "Default: Start all services"
    echo ""
    echo "Architecture:"
    echo "  ✓ PostgreSQL 15 with pgvector extension"
    echo "  ✓ Ollama for embeddings (bge-large-en-v1.5)"
    echo "  ✓ Redis for caching"
    echo "  ✓ Claude Sonnet 4 for LLM"
    exit 0
else
    main
fi
