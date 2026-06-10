# i3X Demo — Fresh Install Experience
# Run from WSL: vhs scripts/demo.tape
#
# Prerequisites:
#   - publish all @node-i3x packages to npm first
#   - install JetBrains Mono: sudo apt install fonts-jetbrains-mono

Output packages/demo-embedded/demo.gif
Set Width 960
Set Height 480
Set FontSize 13
Set FontFamily "JetBrains Mono"
Set Theme "Catppuccin Mocha"
Set Padding 10
Set TypingSpeed 50ms
Set CursorBlink false
Set Framerate 15
Set PlaybackSpeed 1
Set LoopOffset 0

# ── Setup (hidden from recording) ────────────────────────
Hide

# Set a clean prompt
Type `export PS1='$ '`
Enter
Sleep 500ms

# Prepare demo folder
Type "rm -rf /tmp/i3x-demo && mkdir -p /tmp/i3x-demo && cd /tmp/i3x-demo"
Enter
Sleep 500ms

Type "npm init -y > /dev/null 2>&1"
Enter
Sleep 1s

# Pre-install while hidden (too slow for video)
Type "npm install @node-i3x/demo-embedded > /dev/null 2>&1"
Enter
Sleep 45s

Type "clear"
Enter
Sleep 500ms

Show

# ── Recording starts here ────────────────────────────────

# Show what we installed
Type "cat package.json | head -5"
Enter
Sleep 2s

Type "clear"
Enter
Sleep 500ms

# Run the demo server
Type "npx i3x-demo"
Enter

# Wait for OPC UA server to boot
Sleep 10s

# Split vertically (side by side)
Ctrl+b
Type "%"
Sleep 1s

# Right pane: set prompt and run client
Type `export PS1='$ '`
Enter
Sleep 300ms

Type "cd /tmp/i3x-demo"
Enter
Sleep 500ms

Type "npx i3x-demo-client"
Enter

# Let the dashboard render and update
Sleep 15s

# Screenshot
Screenshot packages/demo-embedded/demo-screenshot.png

# A few more update cycles for the GIF
Sleep 5s

# Clean exit
Ctrl+b
Type ":"
Sleep 300ms
Type "kill-session"
Enter
