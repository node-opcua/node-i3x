# i3X Demo — Fresh Install Experience
# Run from WSL: vhs scripts/demo.tape
#
# Prerequisites:
#   - publish all @node-i3x packages to npm first
#   - install JetBrains Mono: sudo apt install fonts-jetbrains-mono

Output packages/demo-embedded/demo.gif
Set Width 1400
Set Height 600
Set FontSize 13
Set FontFamily "JetBrains Mono"
Set Theme "Catppuccin Mocha"
Set Padding 10
Set TypingSpeed 50ms
Set CursorBlink false
Set Framerate 15
Set PlaybackSpeed 1
Set LoopOffset 0

# ── Hidden: start tmux + set prompt ──────────────────────
Hide

Type "tmux new-session -d -s demo -x 168 -y 42 && tmux attach -t demo"
Enter
Sleep 2s

Type `export PS1='$ '`
Enter
Sleep 500ms

Type "rm -rf /tmp/i3x-demo && mkdir -p /tmp/i3x-demo && cd /tmp/i3x-demo"
Enter
Sleep 500ms

Type "clear"
Enter
Sleep 500ms

Show

# ── Recording starts: the install experience ─────────────

Type "npm init -y"
Enter
Sleep 2s

Type "npm install @node-i3x/demo-embedded"
Enter

# Show the command was typed, then hide the slow install
Sleep 3s
Hide
Sleep 45s
Show

# npm install output is now visible
Sleep 2s

# Run the demo server
Type "npx i3x-demo"
Enter

# Wait for OPC UA server to boot
Sleep 12s

# Split tmux vertically (side by side)
Ctrl+b
Sleep 300ms
Type "%"
Sleep 2s

# Right pane: set prompt and cd
Type `export PS1='$ '`
Enter
Sleep 300ms

Type "cd /tmp/i3x-demo"
Enter
Sleep 500ms

# Run the client dashboard
Type "npx i3x-demo-client"
Enter

# Let the dashboard render and update
Sleep 15s

# Screenshot
Screenshot packages/demo-embedded/demo-screenshot.png

# A few more update cycles
Sleep 5s

# Clean exit
Ctrl+b
Sleep 300ms
Type ":"
Sleep 300ms
Type "kill-session"
Enter
