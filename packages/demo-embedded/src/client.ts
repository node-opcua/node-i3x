// ─────────────────────────────────────────────────────────────
// i3X REST Client — live dashboard with refreshing cards
//
// Run this AFTER the embedded demo is running:
//   npm run demo   -w packages/demo-embedded   (terminal 1)
//   npm run client -w packages/demo-embedded   (terminal 2)
// ─────────────────────────────────────────────────────────────

const BASE = process.env.I3X_URL ?? 'http://127.0.0.1:8080';

// ── ANSI helpers ─────────────────────────────────────────────

const ESC = '\x1b';
const ansi = {
  clear: `${ESC}[2J${ESC}[H`,
  home: `${ESC}[H`,
  hideCursor: `${ESC}[?25l`,
  showCursor: `${ESC}[?25h`,
  bold: `${ESC}[1m`,
  dim: `${ESC}[2m`,
  reset: `${ESC}[0m`,
  // Foreground
  white: `${ESC}[97m`,
  gray: `${ESC}[90m`,
  cyan: `${ESC}[96m`,
  green: `${ESC}[92m`,
  red: `${ESC}[91m`,
  yellow: `${ESC}[93m`,
  blue: `${ESC}[94m`,
  magenta: `${ESC}[95m`,
  // Background
  bgDark: `${ESC}[48;5;236m`,
  bgCard: `${ESC}[48;5;238m`,
  bgHeader: `${ESC}[48;5;24m`,
};

// ── Fetch helpers ────────────────────────────────────────────

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

// ── Types ────────────────────────────────────────────────────

interface ObjectInstance {
  elementId: string;
  displayName: string;
  parentId: string | null;
  isComposition: boolean;
}

interface RelatedResult {
  sourceRelationship: string;
  object: ObjectInstance;
}

interface VQT {
  value: unknown;
  quality: string;
  timestamp: string;
}

interface ValueResult {
  isComposition?: boolean;
  components?: Record<string, VQT>;
  value?: unknown;
  quality?: string;
  timestamp?: string;
}

interface SubscriptionUpdate {
  sequenceNumber: number;
  elementId: string;
  value: ValueResult;
  quality: string;
  timestamp: string;
}

// ── State ────────────────────────────────────────────────────

interface AssetCard {
  id: string;
  name: string;
  icon: string;
  properties: PropertyEntry[];
}

interface PropertyEntry {
  id: string;
  name: string;
  value: unknown;
  quality: string;
  timestamp: string;
  changed: boolean; // flash on recent change
}

const nameById = new Map<string, string>();
const cards: AssetCard[] = [];
let subId = '';
let lastSeq = 0;
let updateCount = 0;
let totalChanges = 0;
let serverName = '';
let lastError = '';

// ── Card width ───────────────────────────────────────────────

const CARD_W = 44;

// ── Box drawing ──────────────────────────────────────────────

function boxTop(w: number): string {
  return `┌${'─'.repeat(w - 2)}┐`;
}
function boxMid(w: number): string {
  return `├${'─'.repeat(w - 2)}┤`;
}
function boxBot(w: number): string {
  return `└${'─'.repeat(w - 2)}┘`;
}
function boxRow(content: string, w: number): string {
  // Strip ANSI for length calculation
  // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional ANSI escape stripping
  const visible = content.replace(/\x1b\[[0-9;]*m/g, '');
  const pad = Math.max(0, w - 4 - visible.length);
  return `│ ${content}${' '.repeat(pad)} │`;
}

// ── Discovery ────────────────────────────────────────────────

async function discover(): Promise<string[]> {
  process.stdout.write(ansi.clear);
  process.stdout.write(ansi.hideCursor);
  process.stdout.write(
    `\n  ${ansi.cyan}${ansi.bold}📡 Discovering i3X model...${ansi.reset}\n\n`,
  );

  const info = await get<{
    result: { serverName: string; specVersion: string };
  }>('/v1/info');
  serverName = info.result.serverName;

  // Root objects — skip OPC UA standard
  const roots = await get<{
    result: ObjectInstance[];
  }>('/v1/objects?root=true');
  const skipNames = ['Locations', 'Server', 'Aliases'];
  const userRoots = roots.result.filter((r) => !skipNames.includes(r.displayName));

  process.stdout.write(`  Found ${userRoots.length} user-defined root(s)\n`);

  // Walk tree for each root
  const compositeIds: string[] = [];
  for (const root of userRoots) {
    await walkTree(root, compositeIds);
  }

  // Build cards for leaf assets (ones with properties)
  for (const card of cards) {
    process.stdout.write(`  📦 ${card.name} ` + `(${card.properties.length} props)\n`);
  }

  return compositeIds;
}

async function walkTree(obj: ObjectInstance, compositeIds: string[]): Promise<void> {
  nameById.set(obj.elementId, obj.displayName);

  if (!obj.isComposition) return;

  compositeIds.push(obj.id);

  const related = await post<{
    results: Array<{
      success: boolean;
      result: RelatedResult[];
    }>;
  }>('/v1/objects/related', {
    elementIds: [obj.elementId],
  });

  if (!related.results[0]?.success) return;

  const children = related.results[0]?.result.filter(
    (r) => r.sourceRelationship === 'HasComponent',
  );

  // Separate assets vs properties
  const childAssets = children.filter((c) => c.object.isComposition);
  const childProps = children.filter((c) => !c.object.isComposition);

  // If this node has properties, create a card
  if (childProps.length > 0) {
    const icon = iconForAsset(obj.displayName);
    const card: AssetCard = {
      id: obj.elementId,
      name: obj.displayName,
      icon,
      properties: childProps.map((c) => {
        nameById.set(c.object.elementId, c.object.displayName);
        return {
          id: c.object.elementId,
          name: c.object.displayName,
          value: '—',
          quality: 'Unknown',
          timestamp: '',
          changed: false,
        };
      }),
    };
    cards.push(card);
  }

  // Recurse into child assets
  for (const child of childAssets) {
    await walkTree(child.object, compositeIds);
  }
}

function iconForAsset(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('pump')) return '💧';
  if (n.includes('heater')) return '🔥';
  if (n.includes('conveyor')) return '🏭';
  if (n.includes('factory')) return '🏗️';
  return '📦';
}

// ── Read initial values ──────────────────────────────────────

async function readInitialValues(): Promise<void> {
  const ids = cards.map((c) => c.id);
  if (ids.length === 0) return;

  const values = await post<{
    results: Array<{
      success: boolean;
      elementId: string;
      result: ValueResult;
    }>;
  }>('/v1/objects/value', {
    elementIds: ids,
    maxDepth: 3,
  });

  for (const entry of values.results) {
    if (!entry.success) continue;
    if (!entry.result.isComposition) continue;
    if (!entry.result.components) continue;

    const card = cards.find((c) => c.id === entry.elementId);
    if (!card) continue;

    for (const prop of card.properties) {
      const vqt = entry.result.components[prop.id];
      if (vqt) {
        prop.value = vqt.value;
        prop.quality = vqt.quality;
        prop.timestamp = vqt.timestamp;
      }
    }
  }
}

// ── Create subscription ──────────────────────────────────────

async function createSubscription(): Promise<void> {
  const ids = cards.map((c) => c.id);
  if (ids.length === 0) return;

  const createRes = await post<{
    result: { subscriptionId: string };
  }>('/v1/subscriptions', {
    clientId: 'dashboard-client',
    displayName: 'Dashboard Monitor',
  });
  subId = createRes.result.subscriptionId;

  await post('/v1/subscriptions/register', {
    subscriptionId: subId,
    elementIds: ids,
    maxDepth: 3,
  });
}

// ── Sync subscription updates ────────────────────────────────

async function syncUpdates(): Promise<void> {
  try {
    const syncRes = await post<{
      result: SubscriptionUpdate[];
    }>('/v1/subscriptions/sync', {
      subscriptionId: subId,
      acknowledgeSequence: lastSeq,
    });

    const updates = syncRes.result;
    if (!updates || updates.length === 0) return;

    totalChanges += updates.length;
    updateCount++;

    // Clear all flash states
    for (const card of cards) {
      for (const prop of card.properties) {
        prop.changed = false;
      }
    }

    for (const u of updates) {
      if (u.sequenceNumber > lastSeq) {
        lastSeq = u.sequenceNumber;
      }

      if (!u.value?.isComposition || !u.value?.components) {
        continue;
      }

      const card = cards.find((c) => c.id === u.elementId);
      if (!card) continue;

      for (const [propId, vqt] of Object.entries(u.value.components)) {
        const prop = card.properties.find((p) => p.id === propId);
        if (prop) {
          prop.value = vqt.value;
          prop.quality = vqt.quality;
          prop.timestamp = vqt.timestamp;
          prop.changed = true;
        }
      }
    }
    lastError = '';
  } catch (err) {
    lastError = String(err);
  }
}

// ── Render ───────────────────────────────────────────────────

function render(): void {
  const lines: string[] = [];
  const r = ansi.reset;
  const now = new Date().toLocaleTimeString();

  // Header bar
  lines.push('');
  lines.push(
    `  ${ansi.bgHeader}${ansi.white}${ansi.bold}` +
      `  📡 i3X Dashboard — ${serverName}  ` +
      `${r}` +
      `  ${ansi.dim}${now}${r}`,
  );
  lines.push('');

  // Status line
  const statusParts: string[] = [];
  statusParts.push(`${ansi.green}● Connected${r}`);
  statusParts.push(`${ansi.dim}Updates: ${updateCount}${r}`);
  statusParts.push(`${ansi.dim}Changes: ${totalChanges}${r}`);
  statusParts.push(`${ansi.dim}Seq: ${lastSeq}${r}`);
  lines.push(`  ${statusParts.join('  │  ')}`);
  lines.push('');

  // Render cards in pairs (2 per row)
  for (let i = 0; i < cards.length; i += 2) {
    const left = renderCard(cards[i]!);
    const right = i + 1 < cards.length ? renderCard(cards[i + 1]!) : null;

    const maxLines = Math.max(left.length, right?.length ?? 0);

    for (let row = 0; row < maxLines; row++) {
      const l = left[row] ?? ' '.repeat(CARD_W);
      const rr = right ? (right[row] ?? ' '.repeat(CARD_W)) : '';
      lines.push(`  ${l}  ${rr}`);
    }
    lines.push('');
  }

  // Error line
  if (lastError) {
    lines.push(`  ${ansi.red}⚠ ${lastError}${r}`);
  }

  // Footer
  lines.push(`  ${ansi.dim}Press Ctrl+C to stop${r}`);
  lines.push('');

  // Write in one shot — move cursor home, overwrite
  process.stdout.write(ansi.home + lines.join('\n'));
}

function renderCard(card: AssetCard): string[] {
  const lines: string[] = [];
  const r = ansi.reset;
  const w = CARD_W;

  // Top border
  lines.push(`${ansi.dim}${boxTop(w)}${r}`);

  // Title
  const title = `${card.icon} ${ansi.bold}${ansi.cyan}` + `${card.name}${r}`;
  lines.push(`${ansi.dim}${boxRow(title, w)}${r}`);
  lines.push(`${ansi.dim}${boxMid(w)}${r}`);

  // Properties
  for (const prop of card.properties) {
    const label = cleanLabel(prop.name);
    const { text: valText, color } = formatPropValue(prop.value, prop.name);

    const flashColor = prop.changed ? ansi.yellow : ansi.dim;

    const line = `${flashColor}${label.padEnd(18)}${r} ` + `${color}${valText}${r}`;

    lines.push(`${ansi.dim}${boxRow(line, w)}${r}`);
  }

  // Bottom border
  lines.push(`${ansi.dim}${boxBot(w)}${r}`);

  return lines;
}

function cleanLabel(name: string): string {
  // Shorten common suffixes for compact display
  return name
    .replace(' (°C)', ' °C')
    .replace(' (bar)', ' bar')
    .replace(' (L/min)', ' L/min')
    .replace(' (m/s)', ' m/s')
    .replace(' (%)', ' %');
}

function formatPropValue(v: unknown, name: string): { text: string; color: string } {
  if (typeof v === 'boolean') {
    if (name.toLowerCase().includes('heater')) {
      return v
        ? { text: '🔥 ON', color: ansi.red }
        : { text: '   OFF', color: ansi.gray };
    }
    return v ? { text: '● ON', color: ansi.green } : { text: '○ OFF', color: ansi.gray };
  }

  if (typeof v === 'number') {
    const n = name.toLowerCase();
    let color = ansi.white;

    // Color-code by range
    if (n.includes('temperature') || n.includes('temp')) {
      if (v > 180) color = ansi.red;
      else if (v > 100) color = ansi.yellow;
      else color = ansi.green;
    } else if (n.includes('pressure')) {
      if (v > 5.5) color = ansi.red;
      else if (v > 4.5) color = ansi.yellow;
      else color = ansi.green;
    } else if (n.includes('power')) {
      if (v > 80) color = ansi.red;
      else if (v > 0) color = ansi.yellow;
      else color = ansi.gray;
    }

    const formatted = Number.isInteger(v) ? v.toLocaleString() : v.toFixed(2);
    return { text: formatted, color };
  }

  return {
    text: String(v ?? '—'),
    color: ansi.white,
  };
}

// ── Main ─────────────────────────────────────────────────────

async function main() {
  // Check server
  try {
    await get('/health');
  } catch {
    console.error(`\n  ❌ Cannot reach i3X server at ${BASE}`);
    console.error(
      '  Start the demo first:\n' + '    npm run demo -w packages/demo-embedded\n',
    );
    process.exit(1);
  }

  // Discovery phase (scrolling output)
  const _compositeIds = await discover();

  // Initial values
  process.stdout.write(`\n  Reading initial values...\n`);
  await readInitialValues();

  // Subscription
  process.stdout.write(`  Creating subscription...\n`);
  await createSubscription();
  process.stdout.write(`  ✅ Monitoring ${cards.length} assets\n\n`);

  await sleep(1000);

  // Clear and enter dashboard mode
  process.stdout.write(ansi.clear);
  process.stdout.write(ansi.hideCursor);

  // Graceful shutdown
  const cleanup = async () => {
    process.stdout.write(ansi.showCursor);
    process.stdout.write('\n\n');
    if (subId) {
      try {
        await post('/v1/subscriptions/delete', {
          subscriptionIds: [subId],
        });
      } catch {
        /* ignore */
      }
    }
    console.log('  Subscription cleaned up. Bye!\n');
    process.exit(0);
  };
  process.on('SIGINT', () => {
    void cleanup();
  });
  process.on('SIGTERM', () => {
    void cleanup();
  });

  // Render loop
  render();
  let iteration = 0;
  while (iteration < 600) {
    // max ~20 minutes
    await sleep(2000);
    iteration++;
    await syncUpdates();
    render();
  }

  await cleanup();
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((err) => {
  process.stdout.write(ansi.showCursor);
  console.error('Fatal:', err);
  process.exit(1);
});
