# @node-i3x/opcua-connector

## 0.9.3 (2026-06-19)

- Version bump

## 0.9.2 (2026-06-19)

- perf(connector): batch monitored items creation using monitorItems

## 0.9.1 (2026-06-19)

- Version bump

## 0.9.0 (2026-06-19)

- fix(core,connector): resolve and format Variable DataType BrowseNames correctly
- feat(core,rest): implement variable DataType & sourceTypeId mapping
- feat(core,rest): auto-map and serialize engineering units

## 0.8.7 (2026-06-19)

- Version bump

## 0.8.6 (2026-06-17)

- Version bump

## 0.8.5 (2026-06-17)

- feat: enforce Bearer token authentication by default

## 0.8.4 (2026-06-17)

- Version bump

## 0.8.3 (2026-06-17)

- Version bump

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
- fix(connectors): filter out namespace index 0 nodes in application-only browse mode
- Phase 5: Type safety and refactoring
- Phase 4: Test coverage and metrics
- Phase 2: DRY violations and shared code extraction
- feat(opcua-connector): Auto security policy discovery, policyFilter, certificate subject markers, and selectBestEndpoint tests
- docs: replace ASCII hexagonal diagram with SVG
- chore: remove scratch files from tracking
- docs: add Architecture Decision Records (ADRs) for node-i3x
- Phase 1: i3X V1.0 spec conformance

## 0.6.0 (2026-06-15)

- feat(opcua-connector): add SecurityPolicy auto-discovery, dedicated PKI, and self-signed certificates
- refactor: align config keys with env vars, switch intervals to ms
- fix: resolve Biome lint warnings in schema-builder and opcua-client
- chore: remove empty Development section from .env.example

## 0.5.4 (2026-06-13)

- feat: expose OPC UA traffic stats via /health

## 0.5.3 (2026-06-13)

- Version bump

## 0.5.2 (2026-06-13)

- perf(opcua-connector): filter type browse by ObjectType nodeClass

## 0.5.1 (2026-06-13)

- perf(opcua-connector): parallelize type member enrichment

## 0.5.0 (2026-06-13)

- Version bump

## 0.4.0 (2026-06-13)

- Version bump

## 0.3.3 (2026-06-13)

- fix(core): Bad quality value MUST be null per i3X spec

## 0.3.2 (2026-06-13)

- fix: QRY-08 historian support + subscription cleanup
- feat: add configurable BrowseFilter for object visibility
- fix: resolve UPD-01/UPD-03 conformance failures
- feat: generate JSON Schema for ObjectType responses (QRY-03)
- fix: resolve i3X conformance failures EXP-14, SUB-09, SUB-14
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

