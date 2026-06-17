# @node-i3x/demo-embedded

## 0.8.3 (2026-06-17)

- Version bump

## 0.8.2 (2026-06-16)

- Version bump

## 0.8.1 (2026-06-16)

- Version bump

## 0.8.0 (2026-06-16)

- ci: consolidate GitLab CI pipeline into a single sequential job

## 0.7.2 (2026-06-16)

- ci: retrigger v0.7.1

## 0.7.1 (2026-06-16)

- Version bump

## 0.7.0 (2026-06-16)

- feat: boost coverage to 88%, add Coveralls CI + badges
- feat(auth): fix 401 response compression and support auth in benchmark
- fix: map all unregistered type definitions to UnknownType for EXP-13 compliance
- test: add integration smoke test for demo-embedded CLI
- refactor: remove acknowledgeSequence, standardize on lastSequenceNumber
- Phase 5: Type safety and refactoring
- Phase 2: DRY violations and shared code extraction
- docs: replace ASCII hexagonal diagram with SVG
- chore: remove scratch files from tracking
- docs: add Architecture Decision Records (ADRs) for node-i3x
- Phase 4: Test coverage and metrics
- Phase 1: i3X V1.0 spec conformance

## 0.6.0 (2026-06-15)

- refactor: align config keys with env vars, switch intervals to ms
- feat(opcua-connector): add SecurityPolicy auto-discovery, dedicated PKI, and self-signed certificates
- chore: remove empty Development section from .env.example

## 0.5.4 (2026-06-13)

- Version bump

## 0.5.3 (2026-06-13)

- Version bump

## 0.5.2 (2026-06-13)

- Version bump

## 0.5.1 (2026-06-13)

- Version bump

## 0.5.0 (2026-06-13)

- Version bump

## 0.4.0 (2026-06-13)

- Version bump

## 0.3.3 (2026-06-13)

- fix(core): Bad quality value MUST be null per i3X spec

## 0.3.2 (2026-06-13)

- feat: add TypeService to prewarm object types
- perf: set minimumSamplingInterval 250ms on all vars
- fix: resolve UPD-01/UPD-03 conformance failures
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

