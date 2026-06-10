#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────
# Record the i3X demo with tmux split panes
#
# Run from WSL:
#   cd /mnt/c/sterfive/node-i3x
#   bash scripts/record-demo.sh
#
# Requirements: tmux, asciinema (or vhs), npx, tsx
# ─────────────────────────────────────────────────────────

set -euo pipefail
PROJECT_DIR="/mnt/c/sterfive/node-i3x"

# Kill any existing demo session
tmux kill-session -t i3x-demo 2>/dev/null || true

# Create a new detached tmux session
tmux new-session -d -s i3x-demo -x 170 -y 45 -c "$PROJECT_DIR"

# Left pane: OPC UA Server + i3X REST API
tmux send-keys -t i3x-demo:0.0 \
  "echo '── i3X Embedded Server ──' && npx tsx packages/demo-embedded/src/index.ts" \
  Enter

# Wait for server to start
sleep 6

# Split vertically (right pane)
tmux split-window -h -t i3x-demo -c "$PROJECT_DIR"

# Right pane: Live dashboard client
tmux send-keys -t i3x-demo:0.1 \
  "echo '── i3X Dashboard Client ──' && npx tsx packages/demo-embedded/src/client.ts" \
  Enter

echo ""
echo "  Demo is running in tmux session 'i3x-demo'."
echo ""
echo "  To attach:    tmux attach -t i3x-demo"
echo "  To record:    asciinema rec demo.cast -c 'tmux attach -t i3x-demo'"
echo "  To stop:      tmux kill-session -t i3x-demo"
echo ""
echo "  Or use VHS:   vhs scripts/demo-wsl.tape"
echo ""
