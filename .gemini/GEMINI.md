# node-i3x — Project Instructions

## Overview

node-i3x is a TypeScript monorepo that exposes OPC UA servers
as i3X-compliant REST APIs.  
i3X™ is a CESMII initiative for standardized smart manufacturing
data access.

## Monorepo Structure

```
packages/
  core/              # Domain model, services (ValueService, SubscriptionService, ModelService)
  opcua-connector/   # OPC UA client wrapper (node-opcua)
  pseudo-session-connector/  # Mock connector for testing
  rest-server/       # Fastify REST routes (/v1/objects, /v1/subscriptions, etc.)
  app/               # CLI entry point + config loader — the published binary
  demo-embedded/     # Demo with embedded OPC UA server
```

**Dependency order**: core → opcua-connector → rest-server → app

## Architecture

- **Hexagonal / Ports & Adapters**: `core` defines port interfaces
  (`IDataSourcePort`, `ILogger`), adapters live in `opcua-connector`.
- **Services**: `ModelService` (OPC UA → i3X model tree),
  `ValueService` (read/write values), `SubscriptionService`
  (real-time data changes with debounced composite updates).
- **VQT**: Value/Quality/Timestamp — the universal data atom.
  Quality can be `Good`, `GoodNoData`, `Bad`, or `Uncertain`.
  **i3X spec rule: Bad quality → value MUST be null.**

## Publishing

> **NEVER run `npm publish` manually.**

Packages are published automatically by **GitHub Actions** when a
version tag is pushed.

### Release workflow

```bash
# 1. Bump all packages, generate changelogs, commit, and tag
npm run bump -- patch        # 0.3.3 → 0.3.4
npm run bump -- minor        # 0.3.3 → 0.4.0
npm run bump -- 0.5.0        # explicit version

# 2. Push to trigger CI publish
git push origin main --tags
```

The `bump` script (`scripts/bump.mjs`) handles:
- Updating all 6 `package.json` versions + internal deps
- Generating per-package `CHANGELOG.md` from git log
- Creating a commit `chore: release vX.Y.Z`
- Creating the git tag `vX.Y.Z`

## Building & Testing

```bash
npm run build          # turbo build (all packages)
npm test -- --run      # vitest (all packages, 124+ tests)
npm run typecheck      # tsc --noEmit (all packages)
npm run lint           # biome check
```

- **Pre-commit hooks** (husky + lint-staged): auto-format with Biome.
- **Pre-push hooks**: full test suite must pass before pushing.
- All 124+ tests must pass before any release.

## Coding Conventions

- **Formatter**: Biome (not Prettier/ESLint).
- **Module system**: ESM (`"type": "module"`, `.js` extensions in imports).
- **Build tool**: tsup for each package.
- **Test framework**: Vitest.
- **Logging**: Pino-style structured JSON logs via `ILogger` port.

## i3X Conformance Rules

Key rules from the i3X Implementation Guide that the code must follow:

1. **Bad quality → value MUST be null** (not `{}` or any other value)
2. **VQT components** in compositions must each have `value`, `quality`, `timestamp`
3. **maxDepth** controls how deep composition values recurse
4. **Write operations**: Read the variable's DataType attribute first,
   then coerce the JSON value to the correct OPC UA type before writing.
   Log comprehensive error context on failures.
5. **Gzip**: Proxy must preserve `Content-Encoding` headers — never
   auto-decompress and re-compress.

## OPC UA Domain Notes

- `DataType` attribute (NodeId) maps to built-in types 1–25
  (Boolean, SByte, Byte, Int16, ..., Double, String, DateTime, etc.)
- Writes must use `Variant` with the correct `DataType` enum — sending
  `Double` to an `Int32` variable causes `BadTypeMismatch`.
- `StatusCode.Bad*` means the value is unreliable → i3X maps to `null`.
