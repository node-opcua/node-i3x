#!/usr/bin/env node
// ---------------------------------------------------------
// d2-to-img.mjs — Encode a D2 diagram for Kroki rendering
// ---------------------------------------------------------
// Usage: node scripts/d2-to-img.mjs < diagram.d2
//   or:  node scripts/d2-to-img.mjs --file path/to/file.d2

import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

let source;
if (process.argv.includes('--file')) {
  const idx = process.argv.indexOf('--file');
  source = readFileSync(process.argv[idx + 1], 'utf8');
} else if (process.argv[2] && !process.argv[2].startsWith('-')) {
  source = readFileSync(process.argv[2], 'utf8');
} else {
  // Read from stdin
  source = readFileSync(0, 'utf8');
}

// Kroki encoding: deflate -> base64url
const compressed = deflateSync(Buffer.from(source, 'utf8'), { level: 9 });
const encoded = compressed.toString('base64url');
const url = `https://kroki.io/d2/svg/${encoded}`;

console.log(url);
