#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
// mermaid-to-img.mjs — Add image fallbacks for mermaid blocks
// ─────────────────────────────────────────────────────────────
//
// npmjs.com doesn't render ```mermaid blocks. This script adds
// an <img> tag ABOVE each mermaid block using mermaid.ink.
//
// On GitHub: the <img> shows AND the mermaid renders (redundant
//            but harmless — we hide the img with a comment)
// On npmjs:  only the <img> renders (mermaid is shown as code)
//
// Strategy:
//   We replace ```mermaid blocks with an <img> tag followed by
//   a <details> containing the mermaid source for GitHub users.
//
// Usage:
//   node scripts/mermaid-to-img.mjs          # preview changes
//   node scripts/mermaid-to-img.mjs --write  # write files

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = resolve(import.meta.dirname, '..');
const WRITE = process.argv.includes('--write');

// Find all README.md files tracked by git
const files = execSync('git ls-files "*.md"', { cwd: ROOT, encoding: 'utf8' })
  .trim()
  .split('\n')
  .filter(f => f.endsWith('README.md'))
  .map(f => resolve(ROOT, f));

// Match raw mermaid blocks (not already converted)
const MERMAID_RE = /```mermaid\n([\s\S]*?)```/g;
// Match already-converted blocks (to avoid double-converting)
const ALREADY_CONVERTED_RE = /<!-- mermaid-img -->/;

/**
 * Encode mermaid diagram to a mermaid.ink SVG URL.
 */
function toMermaidInkUrl(code) {
  const encoded = Buffer.from(code.trim()).toString('base64');
  return `https://mermaid.ink/svg/${encoded}`;
}

let changed = 0;

for (const file of files) {
  const rel = relative(ROOT, file);
  const original = readFileSync(file, 'utf8');

  // Skip if already converted
  if (ALREADY_CONVERTED_RE.test(original)) {
    continue;
  }

  let diagramIndex = 0;
  const replaced = original.replace(MERMAID_RE, (_match, code) => {
    diagramIndex++;
    const url = toMermaidInkUrl(code);

    // The <img> renders on npmjs.com (and GitHub).
    // The mermaid block is kept in a <details> for source reference.
    return [
      `<!-- mermaid-img -->`,
      `<p align="center">`,
      `  <img src="${url}" alt="diagram" />`,
      `</p>`,
      ``,
      `<details><summary>Diagram source (mermaid)</summary>`,
      ``,
      '```mermaid',
      code.trimEnd(),
      '```',
      ``,
      `</details>`,
    ].join('\n');
  });

  if (replaced !== original) {
    changed++;
    console.log(
      `${WRITE ? '✏️  Updated' : '📋 Would update'}: ${rel} ` +
      `(${diagramIndex} diagram${diagramIndex > 1 ? 's' : ''})`,
    );

    if (WRITE) {
      writeFileSync(file, replaced, 'utf8');
    }
  }
}

if (changed === 0) {
  console.log('✅ All READMEs already have mermaid image fallbacks.');
} else if (!WRITE) {
  console.log(`\n💡 Run with --write to apply changes.`);
}
