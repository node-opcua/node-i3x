# i3X Demo — Fresh Install Experience
# Run from WSL: vhs scripts/demo.tape
#
# Prerequisites: publish all @node-i3x packages to npm first

Output packages/demo-embedded/demo.gif
Set Width 1400
Set Height 700
Set FontSize 14
Set FontFamily "JetBrains Mono"
Set Theme "Catppuccin Mocha"
Set Padding 12
Set TypingSpeed 50ms
Set CursorBlink false

# Start tmux
Type "tmux new-session -d -s demo -x 168 -y 42 && tmux attach -t demo"
Enter
Sleep 1s

# Left pane: install & run server from scratch
Type "cd /tmp && mkdir i3x-demo && cd i3x-demo"
Enter
Sleep 500ms

Type "npm init -y > /dev/null 2>&1"
Enter
Sleep 1s

Type "npm install @node-i3x/demo-embedded"
Enter

# Wait for npm install to complete
Sleep 30s

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

# Right pane: run the dashboard client
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
