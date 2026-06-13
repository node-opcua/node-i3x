# @node-i3x/app

## 0.5.2 (2026-06-13)

- Version bump

## 0.5.1 (2026-06-13)

- Version bump

## 0.5.0 (2026-06-13)

- feat(app): add IPC progress reporting during startup

## 0.4.0 (2026-06-13)

- feat(app,rest-server): add read-only mode command line option and env var

## 0.3.3 (2026-06-13)

- fix(core): Bad quality value MUST be null per i3X spec

## 0.3.2 (2026-06-13)

- fix: add missing typeService to demo.ts RestServerDeps
- fix: QRY-08 historian support + subscription cleanup
- feat: add TypeService to prewarm object types
- perf: set minimumSamplingInterval 250ms on all vars
- feat: SUB-07/SUB-13 sync acknowledgement with lastSequenceNumber
- fix: resolve UPD-01/UPD-03 conformance failures
- fix(SUB-14): close existing SSE stream when second opens
- fix: enforce clientId validation and ownership on subscription endpoints
- chore: add response compression plugin @fastify/compress

## 0.3.1 (2026-06-10)

- feat: gate debug logs behind DEBUG env var, widen VHS demo, rename repo refs to node-i3x

## 0.3.0 (2026-06-10)

- chore: rename repo  to node-i3x

## 0.2.4 (2026-06-10)

- chore: upgrade all dependencies (TS6, vitest 4, node-opcua 2.173)
- fix: monorepo hygiene - licenses, publishConfig, tsconfig, gitignore

## 0.2.3 (2026-06-10)

- Version bump

## 0.2.2 (2026-06-10)

- fix: release workflow OIDC permissions and GitHub release idempotency

## 0.2.1 (2026-06-10)

- Version bump

