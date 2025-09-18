#!/bin/bash

# Función para logging
log_debug() {
    echo "$(date): $1" >> /tmp/claude-status-debug.log
}

# Capturar señales de terminación
trap 'log_debug "Recibida señal TERM"; exit 1' TERM
trap 'log_debug "Recibida señal INT"; exit 1' INT
trap 'log_debug "Recibida señal HUP"; exit 1' HUP
trap 'log_debug "Script terminando normalmente"' EXIT

log_debug "Script iniciado - PID: $$, PPID: $PPID"

cd ~/Projects/claude-infinito-v11

echo "=== Claude Infinito v1.1 - Status Check ==="
echo "Fecha: $(date)"
echo ""

log_debug "Ejecutando launch-claude-infinito.sh --status"
./launch-claude-infinito.sh --status

echo ""
echo "=== Fin del reporte ==="
echo ""
echo "Presiona Enter para cerrar esta ventana..."

log_debug "Esperando input del usuario (read)"
read -r
log_debug "Usuario presionó Enter, terminando"
