#!/bin/bash
export DISPLAY=:0
cd /home/carlos/Projects/claude-infinito-v11
exec gnome-terminal --working-directory=/home/carlos/Projects/claude-infinito-v11 --title="Claude Status Debug" -- /home/carlos/Projects/claude-infinito-v11/show-status-debug.sh
