# Demo Tape Specification

## Goal

Produce a **GIF** (and a **screenshot PNG**) showing the full "zero to dashboard" experience: install, start server, launch live dashboard — all in ≈30 seconds of viewable recording.

## How to Run

```bash
# From WSL
vhs scripts/demo.tape
```

### Prerequisites

- All `@node-i3x/*` packages published to npm
- JetBrains Mono font installed: `sudo apt install fonts-jetbrains-mono`
- `vhs` and `tmux` installed

## Output

| File | Purpose |
|---|---|
| `packages/demo-embedded/demo.gif` | Animated terminal recording for README |
| `packages/demo-embedded/demo-screenshot.png` | Static screenshot for docs |

## Canvas

- **1200×675px** (16:9), font 14 JetBrains Mono, 15fps
- Custom **"i3X Industrial"** dark theme (deep navy `#0a0e1a`, vibrant cyan/green accents)

## Phases

| Phase | Visible? | What happens | Duration |
|---|---|---|---|
| **1. Bootstrap** | ❌ Hidden | Start tmux, set `PS1='$ '`, create `/tmp/i3x-demo`, silently run `npm init -y && npm install @node-i3x/demo-embedded`, clear screen | ~52s |
| **2. Install showcase** | ✅ Visible | Type `npm init -y` (show output), type `npm install @node-i3x/demo-embedded` (show 3s of output) | ~8s |
| **3. Install skip** | ❌ Hidden | Wait 2s (already installed from phase 1, so instant), clear screen | ~3s |
| **4. Tmux split** | ❌ Hidden | Run `tmux split-window -v -p 75` (top 25% / bottom 75%), set PS1 + cd in bottom pane, switch back to top pane | ~3s |
| **5. Server start** | ✅ Visible | Type `npx i3x-demo` in top pane, wait 12s for OPC UA server boot | ~12s |
| **6. Pane switch** | ✅ Visible | `Ctrl+b ↓` to bottom pane | ~1s |
| **7. Dashboard** | ✅ Visible | Type `npx i3x-demo-client`, dashboard renders with live-updating sensor data | ~20s |
| **8. Capture** | ✅ Visible | Take screenshot, 5 more seconds of animation | ~5s |

## Final Layout

```
┌──────────────────────────────────────────┐
│ $ npx i3x-demo                    (25%) │
│ ► Building i3X model...                  │
│ ✅ i3X REST API ready at :8080           │
├──────────────────────────────────────────┤
│ ┌─ Main Coolant Pump ─┐┌─ Heater ──┐    │
│ │ Temperature  34.5°C  ││ On/Off ON │    │
│ │ Pressure     4.12bar ││ Temp  163 │    │
│ │ Flow Rate  118 L/min ││ Power   0 │    │
│ │ Running      ● ON    ││           │    │
│ └──────────────────────┘└───────────┘    │
│ ┌─ Assembly Conveyor ──┐          (75%) │
│ │ Speed    2.35 m/s    │                 │
│ │ Items    8,474       │                 │
│ └──────────────────────┘                 │
└──────────────────────────────────────────┘
```

## The Trick

The `npm install` in phase 2 is **instant** because deps were silently pre-installed in phase 1. The viewer sees realistic typed commands with fast feedback — no 45-second wait.

## GIF Optimization

After recording, compress with:

```bash
# Lossless
gifsicle -O3 packages/demo-embedded/demo.gif -o packages/demo-embedded/demo.gif

# Lossy (barely visible, much smaller)
gifsicle -O3 --lossy=80 packages/demo-embedded/demo.gif -o packages/demo-embedded/demo.gif
```

Or convert to WebP (5–10x smaller, supported by GitHub):

```bash
ffmpeg -i packages/demo-embedded/demo.gif -vcodec libwebp -lossless 1 packages/demo-embedded/demo.webp
```
