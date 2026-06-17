# @node-i3x/app

## 0.8.4 (2026-06-17)

- Version bump

## 0.8.3 (2026-06-17)

- test: add graceful shutdown and getOpcuaStats test cases in server.test.ts

## 0.8.2 (2026-06-16)

- Version bump

## 0.8.1 (2026-06-16)

- Version bump

## 0.8.0 (2026-06-16)

- chore: fix Biome lint and formatting issues across workspace
- ci: consolidate GitLab CI pipeline into a single sequential job

## 0.7.2 (2026-06-16)

- feat(opcua-connector): log OPC UA client & session options, add options validation
- ci: retrigger v0.7.1

## 0.7.1 (2026-06-16)

- Version bump

## 0.7.0 (2026-06-16)

- feat: boost coverage to 88%, add Coveralls CI + badges
- fix: map all unregistered type definitions to UnknownType for EXP-13 compliance
- feat: gate convenience routes behind --experimental CLI and config flag
- refactor: remove acknowledgeSequence, standardize on lastSequenceNumber
- Phase 5: Type safety and refactoring
- Phase 2: DRY violations and shared code extraction
- Phase 1: i3X V1.0 spec conformance
- feat(opcua-connector): Auto security policy discovery, policyFilter, certificate subject markers, and selectBestEndpoint tests
- docs: replace ASCII hexagonal diagram with SVG
- chore: remove scratch files from tracking
- docs: add Architecture Decision Records (ADRs) for node-i3x
- Phase 4: Test coverage and metrics

## 0.6.0 (2026-06-15)

- feat(opcua-connector): add SecurityPolicy auto-discovery, dedicated PKI, and self-signed certificates
- refactor: align config keys with env vars, switch intervals to ms
- chore: remove empty Development section from .env.example

## 0.5.4 (2026-06-13)

- feat: expose OPC UA traffic stats via /health

## 0.5.3 (2026-06-13)

- feat(rest-server): add Bearer token authentication (CORE-06)

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

