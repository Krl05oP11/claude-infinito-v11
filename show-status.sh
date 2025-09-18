#!/bin/bash
cd ~/Projects/claude-infinito-v11

echo "=== Claude Infinito v1.1 - Status Check ==="
echo "Fecha: $(date)"
echo ""

./launch-claude-infinito.sh --status

echo ""
echo "=== Presiona Enter para cerrar esta ventana ==="
read
