#!/usr/bin/env node

// ─────────────────────────────────────────────────────────
// bump.mjs — npm version equivalent for the monorepo
//
// Usage:
//   npm run bump -- patch         # 0.2.0 → 0.2.1
//   npm run bump -- minor         # 0.2.0 → 0.3.0
//   npm run bump -- major         # 0.2.0 → 1.0.0
//   npm run bump -- 0.4.0         # explicit version
//
// What it does:
//   1. Updates all package.json versions + internal deps
//   2. Generates CHANGELOG.md per package from git log
//   3. Commits and tags v{next}
// ─────────────────────────────────────────────────────────

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const PACKAGES = [
  'core',
  'opcua-connector',
  'pseudo-session-connector',
  'rest-server',
  'app',
  'demo-embedded',
];

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');

// ── Parse args ──────────────────────────────────────────
const arg = process.argv[2];
if (!arg) {
  console.error('Usage: npm run bump -- <patch|minor|major|x.y.z>');
  process.exit(1);
}

const corePkg = JSON.parse(readFileSync(join(root, 'packages/core/package.json'), 'utf8'));
const current = corePkg.version;
const [maj, min, pat] = current.split('.').map(Number);

let next;
if (arg === 'patch') next = `${maj}.${min}.${pat + 1}`;
else if (arg === 'minor') next = `${maj}.${min + 1}.0`;
else if (arg === 'major') next = `${maj + 1}.0.0`;
else if (/^\d+\.\d+\.\d+$/.test(arg)) next = arg;
else {
  console.error(`Invalid bump: "${arg}". Use patch, minor, major, or x.y.z`);
  process.exit(1);
}

console.log(`\n  📦 Bumping all @node-i3x packages: ${current} → ${next}\n`);

// ── Find previous tag ───────────────────────────────────
let prevTag = `v${current}`;
try {
  execSync(`git rev-parse ${prevTag}`, { cwd: root, stdio: 'pipe' });
} catch {
  // No previous tag, use first commit
  prevTag = execSync('git rev-list --max-parents=0 HEAD', {
    cwd: root,
    encoding: 'utf8',
  }).trim();
}

// ── Update all package.json files ───────────────────────
for (const name of PACKAGES) {
  const pkgPath = join(root, `packages/${name}/package.json`);
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));

  pkg.version = next;

  for (const depField of ['dependencies', 'devDependencies', 'peerDependencies']) {
    if (!pkg[depField]) continue;
    for (const dep of Object.keys(pkg[depField])) {
      if (dep.startsWith('@node-i3x/')) {
        pkg[depField][dep] = next;
      }
    }
  }

  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  console.log(`  ✓ @node-i3x/${name} → ${next}`);
}

// ── Generate CHANGELOGs from git log ────────────────────
console.log('\n  📋 Generating CHANGELOGs...\n');
const today = new Date().toISOString().slice(0, 10);

for (const name of PACKAGES) {
  const pkgDir = `packages/${name}`;
  const changelogPath = join(root, pkgDir, 'CHANGELOG.md');

  // Get commits touching this package since last tag
  let commits;
  try {
    commits = execSync(
      `git log ${prevTag}..HEAD --oneline --no-merges -- ${pkgDir}`,
      { cwd: root, encoding: 'utf8' },
    ).trim();
  } catch {
    commits = '';
  }

  // Also get root-level commits (CI, scripts, config)
  let rootCommits;
  try {
    rootCommits = execSync(
      `git log ${prevTag}..HEAD --oneline --no-merges -- . ":!packages/"`,
      { cwd: root, encoding: 'utf8' },
    ).trim();
  } catch {
    rootCommits = '';
  }

  // Format the new entry
  const lines = [];
  if (commits) {
    for (const line of commits.split('\n')) {
      const msg = line.replace(/^[a-f0-9]+ /, '');
      lines.push(`- ${msg}`);
    }
  }
  if (rootCommits) {
    for (const line of rootCommits.split('\n')) {
      const msg = line.replace(/^[a-f0-9]+ /, '');
      if (!lines.some((l) => l.includes(msg))) {
        lines.push(`- ${msg}`);
      }
    }
  }

  const newEntry = [
    `## ${next} (${today})`,
    '',
    lines.length > 0 ? lines.join('\n') : '- Version bump',
    '',
  ].join('\n');

  // Read existing changelog or create new
  let existing = '';
  if (existsSync(changelogPath)) {
    existing = readFileSync(changelogPath, 'utf8');
  }

  const header = `# @node-i3x/${name}\n\n`;
  const body = existing.replace(/^# @node-i3x\/.*\n+/, '');
  writeFileSync(changelogPath, `${header}${newEntry}\n${body}`);

  const commitCount = lines.length;
  console.log(`  📝 @node-i3x/${name}: ${commitCount} commit(s)`);
}

// ── Commit and tag ──────────────────────────────────────
execSync('git add -A', { cwd: root });
execSync(`git commit -m "chore: release v${next}" --no-verify`, {
  cwd: root,
  stdio: 'inherit',
});
execSync(`git tag v${next}`, { cwd: root });

console.log(`\n  ✅ v${next} ready!`);
console.log(`\n  Push to publish:`);
console.log(`    git push origin main --tags\n`);
